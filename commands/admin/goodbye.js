/**
 * Goodbye - Enable/disable goodbye messages
 */

const db = require('../../database');

module.exports = {
  name: 'goodbye',
  aliases: ['goodbyeon', 'goodbyeoff'],
  category: 'admin',
  desc: 'Enable/disable goodbye messages',
  usage: 'goodbye on/off',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      
      if (!action || !['on', 'off'].includes(action)) {
        const groupSettings = db.getGroupSettings(groupId);
        const status = groupSettings.goodbye ? '✅ Enabled' : '❌ Disabled';
        return await sock.sendMessage(groupId, {
          text: `👋 *Goodbye Messages*\n\nStatus: ${status}\nMessage: ${groupSettings.goodbyeMessage}\n\nUsage: .goodbye on/off\n\nTo customize: .setgoodbye <message>`
        }, { quoted: msg });
      }
      
      const enable = action === 'on';
      db.updateGroupSettings(groupId, { goodbye: enable });
      
      await sock.sendMessage(groupId, {
        text: `✅ Goodbye messages ${enable ? 'enabled' : 'disabled'}!${enable ? '\n\nLeaving members will now receive goodbye messages.' : ''}`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Goodbye Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ Error: ${error.message}`
      }, { quoted: msg });
    }
  }
};
