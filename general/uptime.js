/**
 * Uptime Command - Display bot uptime since it was started
 */

const config = require('../../config');

/**
 * Format time difference into human-readable string
 * @param {number} seconds - Total seconds of uptime
 * @returns {string} Formatted uptime string
 */
function formatUptime(seconds) {
  if (seconds <= 0) {
    return '0 seconds';
  }
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
  }
  
  return parts.join(', ');
}

module.exports = {
  name: 'uptime',
  aliases: ['runtime', 'botuptime', 'alive'],
  category: 'general',
  description: 'Show how long the bot has been running',
  usage: '.uptime',
  
  async execute(sock, msg, args, extra) {
    try {
      // Get process uptime in seconds
      const uptimeSeconds = process.uptime();
      const uptime = formatUptime(uptimeSeconds);
      
// Get bot info
const botName = config.botName || 'Bot';
const botVersion = 'V1.0.3';
      
      // Build response message
      let message = `╭━━『 *PrimeSA_Bot Uptime* 』━━╮\n\n`;
    message += `🤖 *Bot Name:* ${botName}\n`;
    message += `🧬 *Bot Version:* ${botVersion}\n`;
      message += `⏱️ *Uptime:* ${uptime}\n`;
      message += `\n╰━━━━━━━━━━━━━━━╯`;
      
      await extra.reply(message);
      
    } catch (error) {
      console.error('Error in uptime command:', error);
      await extra.reply('❌ An error occurred while fetching uptime information. Please try again later.');
    }
  }
};

