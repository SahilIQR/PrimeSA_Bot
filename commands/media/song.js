/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');
const config = require('../../config');

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

module.exports = {
  name: 'yta',
  aliases: ['song','yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name e.g .song Umaqondana by Feza>',
  
  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: 'Usage: .song <song name e.g .song Umaqondana by Feza>' 
        }, { quoted: msg });
      }
      
      let video;

      // Try searching for metadata first (works for plain queries and URLs)
      try {
        const search = await yts(text);
        if (search && Array.isArray(search.videos) && search.videos.length) {
          video = search.videos[0];
        }
      } catch (e) {
        // Non-fatal: continue and try to use raw URL if provided
        console.log('yt-search failed to get metadata:', e.message || e);
      }

      // If yt-search didn't return metadata but the user provided a YouTube link, use it
      if (!video) {
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
          video = { url: text, title: text, thumbnail: null, timestamp: 'Unknown' };
        } else {
          return await sock.sendMessage(chatId, { 
            text: 'No results found.' 
          }, { quoted: msg });
        }
      }

      // Ensure we have a usable URL for downstream APIs
      if (!video.url && video.videoId) {
        video.url = `https://www.youtube.com/watch?v=${video.videoId}`;
      }

      // Inform user — if no thumbnail is available, send a text message instead
      const caption = `🎵 Sahil is Downloading the song wait about 5-15 seconds: *${video.title || 'Unknown'}*\n⏱ Duration: ${video.timestamp || 'Unknown'}`;
      try {
        if (video.thumbnail) {
          await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption
          }, { quoted: msg });
        } else {
          await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
        }
      } catch (e) {
        // If sending the image fails for any reason, fall back to sending text only
        try { await sock.sendMessage(chatId, { text: caption }, { quoted: msg }); } catch (_) { }
      }
      
      // Try to get a normalized download URL from providers
      let audioData = null;
      let audioBuffer = null;
      try {
        audioData = await APIs.getDownloadForYoutube(video.url, 'audio');
      } catch (e) {
        audioData = null;
      }

      if (!audioData || !audioData.download) {
        throw new Error('All download sources failed. The content may be unavailable at this time tell Sahil to download it for you manually.');
      }

      const audioUrl = audioData.download;

      // Check size via HEAD to avoid downloading extremely large files
      let contentLength = null;
      try {
        const head = await axios.head(audioUrl, { timeout: 10000, maxRedirects: 5 });
        if (head.headers && head.headers['content-length']) contentLength = parseInt(head.headers['content-length'], 10);
      } catch (e) {
        // ignore HEAD errors
      }

      const MAX_AUDIO_BYTES = (config.maxAudioMB || 25) * 1024 * 1024;
      if (contentLength && contentLength > MAX_AUDIO_BYTES) {
        // Too large to download - send the link instead
        await sock.sendMessage(chatId, { text: `The audio is large (${Math.round(contentLength/1024/1024)}MB). Download it here: ${audioUrl}` }, { quoted: msg });
        return;
      }

      // Attempt to download the audio buffer
      try {
        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 90000, maxContentLength: Infinity, maxBodyLength: Infinity });
        audioBuffer = Buffer.from(audioResponse.data);
      } catch (downloadErr) {
        // fallback to stream
        try {
          const streamResp = await axios.get(audioUrl, { responseType: 'stream', timeout: 90000, maxContentLength: Infinity, maxBodyLength: Infinity });
          const chunks = [];
          await new Promise((resolve, reject) => {
            streamResp.data.on('data', c => chunks.push(c));
            streamResp.data.on('end', resolve);
            streamResp.data.on('error', reject);
          });
          audioBuffer = Buffer.concat(chunks);
        } catch (streamErr) {
          throw new Error('Failed to download audio from provider');
        }
      }

      // Validate buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Downloaded audio buffer is empty');
      }

      // Detect actual file format from signature
      const firstBytes = audioBuffer.slice(0, 12);
      const hexSignature = firstBytes.toString('hex');
      const asciiSignature = firstBytes.toString('ascii', 4, 8);

      let actualMimetype = 'audio/mpeg';
      let fileExtension = 'mp3';
      let detectedFormat = 'unknown';

      // Check for MP4/M4A (ftyp box)
      if (asciiSignature === 'ftyp' || hexSignature.startsWith('000000')) {
        // Check if it's M4A (audio/mp4)
        const ftypBox = audioBuffer.slice(4, 8).toString('ascii');
        if (ftypBox === 'ftyp') {
          detectedFormat = 'M4A/MP4';
          actualMimetype = 'audio/mp4';
          fileExtension = 'm4a';
        }
      }
      // Check for MP3 (ID3 tag or MPEG frame sync)
      else if (audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
               (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
        detectedFormat = 'MP3';
        actualMimetype = 'audio/mpeg';
        fileExtension = 'mp3';
      }
      // Check for OGG/Opus
      else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
        detectedFormat = 'OGG/Opus';
        actualMimetype = 'audio/ogg; codecs=opus';
        fileExtension = 'ogg';
      }
      // Check for WAV
      else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        detectedFormat = 'WAV';
        actualMimetype = 'audio/wav';
        fileExtension = 'wav';
      }
      else {
        // Default to M4A since that's what the signature often suggests
        actualMimetype = 'audio/mp4';
        fileExtension = 'm4a';
        detectedFormat = 'Unknown (defaulting to M4A)';
      }

      // Convert to MP3 if not already MP3
      let finalBuffer = audioBuffer;
      let finalMimetype = 'audio/mpeg';
      let finalExtension = 'mp3';

      if (fileExtension !== 'mp3') {
        try {
          finalBuffer = await toAudio(audioBuffer, fileExtension);
          if (!finalBuffer || finalBuffer.length === 0) {
            throw new Error('Conversion returned empty buffer');
          }
          finalMimetype = 'audio/mpeg';
          finalExtension = 'mp3';
        } catch (convErr) {
          throw new Error(`Failed to convert ${detectedFormat} to MP3: ${convErr.message}`);
        }
      }

      // Send buffer as MP3
await sock.sendMessage(chatId, {
  audio: finalBuffer,
  mimetype: finalMimetype,
  fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.${finalExtension}`,
  ptt: false
}, { quoted: msg });

// Download successful message
await sock.sendMessage(chatId, {
  text: `╭━━━〔 🎵 PRIME_SA MUSIC 〕━━━╮
┃
┃ ✅ *DOWNLOAD SUCCESSFUL BY Sahil!*
┃
┃ 🎶 *${audioData.title || video.title || 'Unknown'}*
┃ ⏱️ ${video.timestamp || 'Unknown'}
┃
┃ 📥 Your song is ready!
┃ ❤️ Enjoy the music,Don't forget that Sahil is the best!
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
}, { quoted: msg });

      // Cleanup: Delete temp files created during conversion
      try {
        const tempDir = path.join(__dirname, '../../temp');
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          const now = Date.now();
          files.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
              const stats = fs.statSync(filePath);
              // Delete temp files older than 10 seconds (conversion temp files)
              if (now - stats.mtimeMs > 10000) {
                // Check if it's a temp audio file (mp3, m4a, or numeric timestamp files from converter)
                if (file.endsWith('.mp3') || file.endsWith('.m4a') || /^\d+\.(mp3|m4a)$/.test(file)) {
                  fs.unlinkSync(filePath);
                }
              }
            } catch (e) {
              // Ignore individual file errors
            }
          });
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
    } catch (err) {
      console.error('Song command error:', err);
      
      // Provide more specific error messages
      let errorMessage = '❌ Failed to download song.';
      if (err.message && err.message.includes('blocked')) {
        errorMessage = '❌ Download blocked. The content may be unavailable in your region or due to legal restrictions.';
      } else if (err.response?.status === 451 || err.status === 451) {
        errorMessage = '❌ Content unavailable (451). This may be due to legal restrictions or regional blocking.';
      } else if (err.message && err.message.includes('All download sources failed')) {
        errorMessage = '❌ All download sources failed. The content may be unavailable or blocked.';
      }
      
      await sock.sendMessage(msg.key.remoteJid, { 
        text: errorMessage 
      }, { quoted: msg });
    }
  }
};