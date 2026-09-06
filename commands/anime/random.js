/**
 * Random Command - Get random anime data
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

const BASE = 'https://api.princetechn.com/api/anime/random';
const API_KEY = 'prince';

module.exports = {
  name: 'random',
  aliases: ['animerandom', 'randomanime'],
  category: 'anime',
  desc: 'Get random anime data',
  usage: 'random',
  execute: async (sock, msg, args, extra) => {
    try {
      const url = `${BASE}?apikey=${API_KEY}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      if (!response.data || !response.data.result) {
        throw new Error('Invalid API response: missing anime data');
      }
      
      const animeData = response.data.result;
      
      // Download thumbnail image
      let imageBuffer = null;
      if (animeData.thumbnail) {
        try {
          const imageResponse = await axios.get(animeData.thumbnail, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'image/*'
            },
            timeout: 30000
          });
          
          imageBuffer = Buffer.from(imageResponse.data);
          
          if (imageBuffer && imageBuffer.length > 0) {
            const maxImageSize = 5 * 1024 * 1024;
            if (imageBuffer.length > maxImageSize) {
              imageBuffer = null; // Skip image if too large
            }
          }
        } catch (imgError) {
          console.error('Error downloading thumbnail:', imgError);
          imageBuffer = null;
        }
      }
      
      // Build caption with anime info
      let caption = `*${animeData.title || 'Unknown'}*\n\n`;
      
      if (animeData.episodes) {
        caption += `📺 Episodes: ${animeData.episodes}\n`;
      }
      
      if (animeData.status) {
        caption += `📊 Status: ${animeData.status}\n`;
      }
      
      if (animeData.synopsis) {
        caption += `\n📝 ${animeData.synopsis}\n`;
      }
      
      if (animeData.link) {
        caption += `\n🔗 ${animeData.link}`;
      }
      
      // Send with image if available
      if (imageBuffer) {
        const contentType = 'image/jpeg';
        let extension = 'jpg';
        if (animeData.thumbnail.match(/\.(png|jpg|jpeg)$/i)) {
          const match = animeData.thumbnail.match(/\.(png|jpg|jpeg)$/i);
          extension = match[1].toLowerCase();
        }
        
        const tempDir = getTempDir();
        const timestamp = Date.now();
        const tempImagePath = path.join(tempDir, `anime_${timestamp}.${extension}`);
        
        try {
          fs.writeFileSync(tempImagePath, imageBuffer);
          const finalBuffer = fs.readFileSync(tempImagePath);
          
          await sock.sendMessage(extra.from, {
            image: finalBuffer,
            caption: caption
          }, { quoted: msg });
          
        } finally {
          try {
            deleteTempFile(tempImagePath);
          } catch (cleanupError) {
          }
        }
      } else {
        // Send text only if no image
        await sock.sendMessage(extra.from, {
          text: caption
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('Error in random command:', error);
      
      if (error.response?.status === 404) {
        await extra.reply('❌ Anime data not found. Please try again.');
      } else if (error.response?.status === 429) {
        await extra.reply('❌ Rate limit exceeded. Please try again later.');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await extra.reply('❌ Request timed out. Please try again.');
      } else {
        await extra.reply(`❌ Failed to fetch anime data: ${error.message}`);
      }
    }
  }
};

