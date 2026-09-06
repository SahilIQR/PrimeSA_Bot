/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const APIs = require('../../utils/api');
const config = require('../../config');

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <video name or URL>',

  async execute(sock, msg, args) {
    try {
      // Use global config for now
      const instanceConfig = config;

      const text = args.join(' ');
      const chatId = msg.key.remoteJid;

      const searchQuery = text.trim();

      if (!searchQuery) {
        return await sock.sendMessage(chatId, {
          text: 'What video do you want to download?'
        }, { quoted: msg });
      }

      // Determine if input is a YouTube link
      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';

      if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
        videoUrl = searchQuery;
      } else {
        // Search YouTube for the video
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: 'No videos found!'
          }, { quoted: msg });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
        videoThumbnail = videos[0].thumbnail;
      }

      // Send thumbnail immediately
      try {
        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
        const captionTitle = videoTitle || searchQuery;
        if (thumb) {
          await sock.sendMessage(chatId, {
            image: { url: thumb },
            caption: `*${captionTitle}*\nDownloading...`
          }, { quoted: msg });
        }
      } catch (e) {
        console.error('[VIDEO] thumb error:', e?.message || e);
      }

      // Validate YouTube URL
      let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
      if (!urls) {
        return await sock.sendMessage(chatId, {
          text: 'This is not a valid YouTube link!'
        }, { quoted: msg });
      }

      // Get video: try providers via helper which normalizes responses
      let videoData = null;
      try {
        videoData = await APIs.getDownloadForYoutube(videoUrl, 'video');
      } catch (e) {
        videoData = null;
      }

      if (!videoData || !videoData.download) {
        throw new Error('No downloadable video URL found from provider APIs');
      }

      // Try HEAD request to check content-length and avoid sending very large files
      let contentLength = null;
      try {
        const head = await require('axios').head(videoData.download, { timeout: 10000, maxRedirects: 5 });
        const cl = head.headers['content-length'];
        if (cl) contentLength = parseInt(cl, 10);
      } catch (e) {
        // ignore HEAD failures
      }

      const MAX_SEND_BYTES = (config.videoMaxMB || 50) * 1024 * 1024;
      if (contentLength && contentLength > MAX_SEND_BYTES) {
        // Too large to send; provide URL instead
        await sock.sendMessage(chatId, { text: `The video is too large to send (${Math.round(contentLength/1024/1024)}MB). Download it here: ${videoData.download}` }, { quoted: msg });
        return;
      }

      // Prefer sending by URL (Baileys streams it). If that fails, fall back to downloading buffer.
      try {
        await sock.sendMessage(chatId, {
          video: { url: videoData.download },
          mimetype: 'video/mp4',
          fileName: `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
          caption: `*${videoData.title || videoTitle || 'Video'}*\n\n> *_Downloaded by ${instanceConfig.botName}_*`
        }, { quoted: msg });
        return;
      } catch (e) {
        // Try to download and send as buffer
        try {
          const res = await require('axios').get(videoData.download, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: Infinity, maxBodyLength: Infinity });
          await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: `*${videoData.title || videoTitle || 'Video'}*` }, { quoted: msg });
          return;
        } catch (err) {
          throw new Error('Failed to send video by URL or by download.');
        }
      }

    } catch (error) {
      console.error('[VIDEO] Command Error:', error?.message || error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'Download failed: ' + (error?.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};