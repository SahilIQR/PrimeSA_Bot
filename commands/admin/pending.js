/**
 * Pending Requests Command - List all pending member join requests in a group
 */

const { normalizeJidWithLid } = require('../../utils/jidHelper');

function isPnJid(jid) {
  return jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'));
}
function isLidJid(jid) {
  return jid && (jid.endsWith('@lid') || jid.endsWith('@hosted.lid'));
}

module.exports = {
  name: 'pending',
  aliases: ['pendingrequests', 'joinrequests', 'listpending'],
  category: 'admin',
  description: 'List all pending member join requests in the group',
  usage: '.pending',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const from = extra.from;

      if (!extra.isGroup) {
        return extra.reply('👥 This command can only be used in groups.');
      }

      let list;
      try {
        list = await sock.groupRequestParticipantsList(from);
      } catch (error) {
        console.error('Pending requests error:', error);
        if (error.message && (error.message.includes('403') || error.message.includes('forbidden'))) {
          return extra.reply('❌ Bot does not have permission to view join requests. Ensure join approval is enabled for the group.');
        }
        return extra.reply('❌ Failed to fetch pending requests. ' + (error.message || 'Try again later.'));
      }

      if (!list || list.length === 0) {
        return extra.reply('✅ *No pending join requests.*\n\nThere are no members waiting for approval.');
      }

      let text = `📋 *Pending Join Requests* (${list.length})\n\n`;
      text += `The following ${list.length} request(s) are waiting for approval:\n\n`;

      const mentionJids = [];

      list.forEach((p, i) => {
        const rawJid = p.jid || p.pn || p.lid;
        if (!rawJid) {
          text += `${i + 1}. Unknown\n`;
          return;
        }
        const name = (p.notify || p.name || '').trim();
        // Prefer phone number JID when server sends it (phone_number or pn)
        const pnJid = p.phone_number || (isPnJid(p.pn) ? p.pn : null) || (isPnJid(p.jid) ? p.jid : null);
        const hasRealNumber = pnJid && isPnJid(pnJid);
        let displayLabel;
        let jidForMention;
        if (hasRealNumber) {
          displayLabel = name || pnJid.split('@')[0];
          jidForMention = pnJid.includes('@') ? pnJid : `${pnJid.split('@')[0]}@s.whatsapp.net`;
          mentionJids.push(jidForMention);
          text += `${i + 1}. @${displayLabel}\n`;
          return;
        }
        const normalized = normalizeJidWithLid(rawJid);
        if (normalized && isPnJid(normalized)) {
          displayLabel = name || normalized.split('@')[0];
          jidForMention = normalized;
          mentionJids.push(jidForMention);
          text += `${i + 1}. @${displayLabel}\n`;
          return;
        }
        // Only LID available – show name if present, else "Pending user (ID only)"
        if (isLidJid(rawJid) || isLidJid(normalized)) {
          text += `${i + 1}. ${name || 'Pending user (ID only)'}\n`;
          return;
        }
        const fallbackNum = (normalized || rawJid).split('@')[0] || rawJid;
        jidForMention = (normalized || rawJid).includes('@') ? (normalized || rawJid) : `${fallbackNum}@s.whatsapp.net`;
        mentionJids.push(jidForMention);
        displayLabel = name || fallbackNum;
        text += `${i + 1}. @${displayLabel}\n`;
      });

      await sock.sendMessage(from, { text, mentions: mentionJids }, { quoted: msg });
    } catch (error) {
      console.error('Pending command error:', error);
      return extra.reply('❌ Error: ' + (error.message || 'Unknown error occurred'));
    }
  },
};
