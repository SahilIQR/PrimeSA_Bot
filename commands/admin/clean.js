/**
 * Clean Command - Delete messages in group
 */

module.exports = {
  name: 'clean',
  aliases: ['purge', 'clear'],
  category: 'admin',
  description: 'Clean messages (all or from specific user if replied)',
  usage: '.clean <number>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const count = parseInt(args[0]);
      if (!count || count < 1 || count > 100) {
        return extra.reply('❌ Please enter a valid number (1-100).');
      }

      const jid = extra.from;
      const { store } = require('../../index');
      
      // Check if message is a reply
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

      const msgs = store.messages.get(jid);
      if (!msgs) {
        return extra.reply('❌ No stored messages found.');
      }

      let messagesToDelete = [];

      if (quotedMsg && quotedParticipant) {
        // Mode: Delete specific user's messages
        messagesToDelete = Array.from(msgs.values())
          .filter(m => {
            const sender = m.key.participant || m.key.remoteJid;
            return sender === quotedParticipant;
          })
          .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
          .slice(0, count);
      } else {
        // Mode: Delete last N messages from chat
        messagesToDelete = Array.from(msgs.values())
          .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
          .slice(0, count);
      }

      let deleted = 0;
      for (const m of messagesToDelete) {
        try {
          await sock.sendMessage(jid, { delete: m.key });
          deleted++;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.error('[clean] delete error:', err.message);
        }
      }
      
    } catch (e) {
      console.error('[clean cmd] error:', e);
      extra.reply('❌ Failed to clean messages.');
    }
  }
};
