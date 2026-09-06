/**
 * Set Welcome - Customize welcome message
 */

const db = require('../../database');

module.exports = {
  name: 'setwelcome',
  aliases: ['welcometext'],
  category: 'admin',
  desc: 'Set custom welcome message',
  usage: 'setwelcome <message> (use @user for member mention)',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      
      if (!args.length) {
        const groupSettings = db.getGroupSettings(groupId);
        return await sock.sendMessage(groupId, {
          text: `📝 *Current Welcome Message*\n\n${groupSettings.welcomeMessage}\n\n*Usage:* .setwelcome <message>\n\n*Tip:* Use @user to mention the new member`
        }, { quoted: msg });
      }
      
      const welcomeMessage = args.join(' ');
      
      if (welcomeMessage.length > 500) {
        return await sock.sendMessage(groupId, {
          text: '❌ Welcome message is too long! Maximum 500 characters.'
        }, { quoted: msg });
      }
      
      db.updateGroupSettings(groupId, { welcomeMessage });
      
      await sock.sendMessage(groupId, {
        text: `✅ Welcome message updated!\n\n*Preview:*\n${welcomeMessage.replace('@user', '@' + msg.key.participant.split('@')[0])}`,
        mentions: [msg.key.participant]
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Set Welcome Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ Error: ${error.message}`
      }, { quoted: msg });
    }
  }
};
