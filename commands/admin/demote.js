/**
 * Demote Command - Remove admin privileges
 */

const { findParticipant } = require('../../utils/jidHelper');

module.exports = {
  name: 'demote',
  aliases: ['removeadmin'],
  category: 'admin',
  description: 'Remove admin privileges from member',
  usage: '.demote @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return extra.reply('❌ Please mention or reply to the user to demote!\n\nExample: .demote @user');
      }
      
      // Fetch FRESH group metadata to avoid stale cache
      const freshMetadata = await sock.groupMetadata(extra.from);
      
      // Use findParticipant for LID-aware matching with fresh metadata
      const foundParticipant = findParticipant(freshMetadata.participants, target);
      
      if (!foundParticipant) {
        return extra.reply('❌ User not found in group!');
      }
      
      // Check if user is admin using fresh data
      if (foundParticipant.admin !== 'admin' && foundParticipant.admin !== 'superadmin') {
        return extra.reply('❌ This user is not an admin!');
      }
      
      await sock.groupParticipantsUpdate(extra.from, [target], 'demote');
      
      await sock.sendMessage(extra.from, {
        text: `✅ @${target.split('@')[0]} is no longer an admin!`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
