/**
 * Meme Search Command - Search and get memes
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

const BASE = 'https://api.shizo.top/tools/meme-search';

module.exports = {
  name: 'memesearch',
  aliases: ['memes', 'sm', 'smeme', 'gifsearch', 'gif'],
  category: 'fun',
  desc: 'Search and get memes',
  usage: 'memesearch <query>',
  execute: async (sock, msg, args, extra) => {
    try {
      const query = args.join(' ').trim();
      
      if (!query) {
        return await extra.reply(
          'Usage: .memesearch <query>\n\nExample: .memesearch hello'
        );
      }
      
      // Fetch meme from API
      const url = `${BASE}?apikey=shizo&query=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      const mediaBuffer = Buffer.from(response.data);
      
      // Verify buffer is valid
      if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error('Empty response from API');
      }
      
      // Check file size limits (WhatsApp has limits: 16MB for videos, 5MB for images)
      const maxVideoSize = 16 * 1024 * 1024; // 16MB
      const maxImageSize = 5 * 1024 * 1024; // 5MB
      
      // Check content type to determine if it's GIF, image, or video
      const contentType = response.headers['content-type'] || '';
      
      // Check file signature (magic bytes) for better detection
      const fileHeader = mediaBuffer.slice(0, 6).toString('ascii');
      const isGIF = fileHeader === 'GIF89a' || fileHeader === 'GIF87a' || contentType.includes('gif');
      
      // Determine media type and send accordingly
      if (isGIF) {
        // Check size for GIF
        if (mediaBuffer.length > maxVideoSize) {
          throw new Error(`GIF file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
        }
        
        // Convert GIF to MP4 for better WhatsApp compatibility
        const tempDir = getTempDir();
        const timestamp = Date.now();
        const gifPath = path.join(tempDir, `meme_gif_${timestamp}.gif`);
        const mp4Path = path.join(tempDir, `meme_mp4_${timestamp}.mp4`);
        
        let mp4Buffer = null;
        
        try {
          // Write GIF to temp file
          fs.writeFileSync(gifPath, mediaBuffer);
          
          // Convert GIF to MP4 using FFmpeg
          const ffmpegCmd = `"${ffmpegPath}" -i "${gifPath}" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -fps_mode vfr -y "${mp4Path}"`;
          
          await new Promise((resolve, reject) => {
            exec(ffmpegCmd, { maxBuffer: 10 * 1024 * 1024 }, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });
          
          // Read MP4 file
          if (!fs.existsSync(mp4Path)) {
            throw new Error('MP4 output file not found');
          }
          
          mp4Buffer = fs.readFileSync(mp4Path);
          
          // Check MP4 size
          if (mp4Buffer.length > maxVideoSize) {
            throw new Error(`MP4 file too large: ${(mp4Buffer.length / 1024 / 1024).toFixed(2)}MB`);
          }
          
          // Send MP4 as video with gifPlayback
          const result = await sock.sendMessage(extra.from, {
            video: mp4Buffer,
            mimetype: 'video/mp4',
            gifPlayback: true
          }, { quoted: msg });
          
          if (!result) {
            throw new Error('Video send returned no result');
          }
          
        } catch (convertError) {
          // Fallback: try sending original GIF as document
          try {
            const result = await sock.sendMessage(extra.from, {
              document: mediaBuffer,
              mimetype: 'image/gif',
              fileName: `meme_${query.replace(/\s+/g, '_')}.gif`
            }, { quoted: msg });
            
            if (!result) {
              throw new Error('Document send returned no result');
            }
          } catch (docError) {
            throw new Error(`Failed to send meme: ${convertError.message}`);
          }
        } finally {
          // Cleanup temp files
          try {
            deleteTempFile(gifPath);
            deleteTempFile(mp4Path);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
      } else if (contentType.includes('video') || contentType.includes('mp4')) {
        // Check size for video
        if (mediaBuffer.length > maxVideoSize) {
          throw new Error(`Video file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
        }
        
        await sock.sendMessage(extra.from, {
          video: mediaBuffer,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      } else {
        // Check size for image
        if (mediaBuffer.length > maxImageSize) {
          throw new Error(`Image file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
        }
        
        await sock.sendMessage(extra.from, {
          image: mediaBuffer
        }, { quoted: msg });
      }
      
    } catch (error) {
      await extra.reply(`❌ Failed to fetch meme: ${error.message}`);
    }
  }
};

