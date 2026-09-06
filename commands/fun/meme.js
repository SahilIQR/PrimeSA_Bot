/**
 * Meme Command - Send random memes
 */

const APIs = require('../../utils/api');
const axios = require('axios');

module.exports = {
  name: 'meme',
  aliases: ['memes'],
  category: 'fun',
  description: 'Get random memes',
  usage: '.meme',
  
  async execute(sock, msg, args, extra) {
    try {
      const meme = await APIs.getMeme();
      
      const imageBuffer = await axios.get(meme.url, { responseType: 'arraybuffer' });
      
      await sock.sendMessage(extra.from, {
        image: Buffer.from(imageBuffer.data),
        caption: `😂 *${meme.title}*\n\n📱 From: r/${meme.subreddit}\n👤 By: ${meme.author}\n⬆️ Upvotes: ${meme.ups}`
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
