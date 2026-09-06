/**
 * Pies Command - Get random pies images by country
 */

const axios = require('axios');

const BASE = 'https://api.shizo.top/pies';
const VALID_COUNTRIES = ['india','malaysia', 'thailand', 'china', 'indonesia', 'japan', 'korea', 'vietnam'];

module.exports = {
  name: 'pies',
  aliases: ['pie', 'india', 'malaysia', 'thailand', 'china', 'indonesia', 'japan', 'korea', 'vietnam'],
  category: 'fun',
  desc: 'Get random pies images by country',
  usage: 'pies <country>',
  execute: async (sock, msg, args, extra) => {
    try {
      // Get the message text to extract the command used
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   '';
      
      // Extract command from message (e.g., ".india" or ".pies india")
      const config = require('../../config');
      const prefix = config.prefix || '.';
      const parts = text.trim().split(/\s+/);
      const commandUsed = parts[0]?.replace(prefix, '').toLowerCase() || '';
      
      let country = '';
      
      // If the command itself is a country name, use it
      if (VALID_COUNTRIES.includes(commandUsed)) {
        country = commandUsed;
      } else {
        // Otherwise, get country from args
        country = (args[0] || '').toLowerCase();
      }
      
      if (!country) {
        return await extra.reply(
          `Usage: .pies <country>\n\nCountries: ${VALID_COUNTRIES.join(', ')}`
        );
      }
      
      if (!VALID_COUNTRIES.includes(country)) {
        return await extra.reply(
          `❌ Unsupported country: ${country}\n\nTry one of: ${VALID_COUNTRIES.join(', ')}`
        );
      }
      
      // Fetch image from API
      const url = `${BASE}/${country}?apikey=shizo`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      const imageBuffer = Buffer.from(response.data);
      
      // Verify it's an image
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('image')) {
        throw new Error('API did not return an image');
      }
      
      await sock.sendMessage(extra.from, {
        image: imageBuffer,
        caption: `pies: ${country}`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Error in pies command:', error);
      await extra.reply(`❌ Failed to fetch image: ${error.message}`);
    }
  }
};

