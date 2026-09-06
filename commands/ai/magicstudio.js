/**
 * Imagine Command - AI image generation via PrinceTech Flux API
 */

const axios = require('axios');

const API_BASE = 'https://api.princetechn.com/api/ai/fluximg';
const API_KEY = 'prince';

module.exports = {
  name: 'imagine',
  aliases: ['magic', 'magicai', 'aiimage', 'generate'],
  category: 'ai',
  desc: 'Generate AI art from text prompt',
  usage: 'imagine <prompt>',
  execute: async (sock, msg, args, extra) => {
    try {
      const prompt = args.join(' ').trim();

      if (!prompt) {
        return await extra.reply(
          'Usage: .imagine <prompt>\n\nExample: .imagine a handsome gentle man'
        );
      }

      const apiUrl = `${API_BASE}?apikey=${API_KEY}&prompt=${encodeURIComponent(prompt)}`;
      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        timeout: 120000,
      });

      if (!data?.success || data?.status !== 200 || !data?.result) {
        throw new Error(data?.message || 'API did not return an image');
      }

      const imageResponse = await axios.get(data.result, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/*',
        },
        timeout: 120000,
      });

      const imageBuffer = Buffer.from(imageResponse.data);

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty response from image URL');
      }

      const maxImageSize = 5 * 1024 * 1024;
      if (imageBuffer.length > maxImageSize) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
      }

      await sock.sendMessage(extra.from, {
        image: imageBuffer,
        caption: `🎨 *Imagine*\n\n📝 ${prompt}`,
      }, { quoted: msg });
    } catch (error) {
      console.error('Error in imagine command:', error);

      if (error.response?.status === 429) {
        await extra.reply('❌ Rate limit exceeded. Please try again later.');
      } else if (error.response?.status === 400) {
        await extra.reply('❌ Invalid prompt. Please try a different prompt.');
      } else if (error.response?.status === 500) {
        await extra.reply('❌ Server error. Please try again later.');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await extra.reply('❌ Request timed out. Image generation is taking too long. Please try again.');
      } else {
        await extra.reply(`❌ Failed to generate image: ${error.message}`);
      }
    }
  },
};
