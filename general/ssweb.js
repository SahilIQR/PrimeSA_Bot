/**
 * SSWeb - Screenshot Website Command
 */

const APIs = require('../../utils/api');

module.exports = {
  name: 'ssweb',
  aliases: ['screenshot', 'ss', 'webss'],
  category: 'general',
  description: 'Take a screenshot of a website',
  usage: '.ssweb <url>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply('❌ Please provide a website URL!\n\nExample: .ssweb https://github.com');
      }
      
      const url = args.join(' ');
      
      // Validate URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return extra.reply('❌ Please provide a valid URL starting with http:// or https://');
      }
      
      await sock.sendMessage(extra.from, {
        react: { text: '📥', key: msg.key }
      });
      
      const screenshotBuffer = await APIs.screenshotWebsite(url);
      
      await sock.sendMessage(extra.from, {
        image: screenshotBuffer,
      }, { quoted: msg });
      
    } catch (error) {
      console.error('SSWeb command error:', error);
      await extra.reply(`❌ Failed to screenshot website: ${error.message}`);
    }
  }
};

