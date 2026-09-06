/**
 * Truth - Get a random truth question from @bochilteam/scraper (translated to English)
 */

const { truth } = require('@bochilteam/scraper');
const { translate } = require('@vitalets/google-translate-api');

module.exports = {
    name: 'truth',
    aliases: [],
    category: 'fun',
    desc: 'Get a random truth question',
    usage: 'truth',
    execute: async (sock, msg, args, extra) => {
      try {
        const question = await truth();
        
        // Translate to English
        const res = await translate(question, { to: 'en' });
        
        await extra.reply(res.text);
        
      } catch (error) {
        console.error('Truth Error:', error);
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  