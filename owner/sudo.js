/**
 * Sudo Command
 * Owner can add/remove sudo users (users with owner-like privileges)
 * Supports: .sudo add @user | .sudo add 919876543210 | .sudo add (reply)
 */

const config = require('../../config');
const database = require('../../database');

const normalizeNumber = (input) => {
  return String(input).replace(/\D/g, '');
};

const toJid = (input) => {
  const s = String(input).trim();
  if (!s) return null;
  if (s.includes('@')) return s;
  const n = normalizeNumber(s);
  return n && n.length >= 10 ? `${n}@s.whatsapp.net` : null;
};

/** Extract JID from @mention or number in message */
function extractMentionedJid(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.imageMessage?.contextInfo
    || msg.message?.videoMessage?.contextInfo
    || msg.message?.buttonsMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length > 0) return mentioned[0];
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  const match = text.match(/\b(\d{7,15})\b/);
  if (match) return match[1] + '@s.whatsapp.net';
  return null;
}

function getJidForMention(jid) {
  if (!jid || !jid.includes('@')) return null;
  const userPart = jid.split('@')[0];
  return `${userPart}@s.whatsapp.net`;
}

function findParticipantByUserPart(participants, userPart) {
  if (!participants?.length || !userPart) return null;
  return participants.find((p) => {
    const idUser = (p.id || '').split('@')[0].split(':')[0];
    const lidUser = (p.lid || '').split('@')[0];
    return idUser === userPart || lidUser === userPart;
  }) || null;
}

async function resolveSudoUser(sock, storedJid, groupMetadata, from) {
  const userPart = storedJid.split('@')[0];
  let displayLabel = userPart;
  let mentionJid = getJidForMention(storedJid);

  const DEBUG = false;
  if (DEBUG) {
    const sample = groupMetadata?.participants?.[0];
    console.log('[SUDO] resolveSudoUser:', {
      storedJid,
      userPart,
      hasGroupMeta: !!groupMetadata,
      participantCount: groupMetadata?.participants?.length || 0,
      sampleParticipant: sample ? { id: sample.id, lid: sample.lid, notify: sample.notify } : null
    });
  }

  if (groupMetadata?.participants?.length) {
    const participant = findParticipantByUserPart(groupMetadata.participants, userPart);
    if (DEBUG) {
      console.log('[SUDO] findParticipantByUserPart result:', participant ? {
        id: participant.id,
        lid: participant.lid,
        notify: participant.notify,
        name: participant.name
      } : 'NOT FOUND');
    }
    if (participant) {
      mentionJid = participant.id || participant.lid || participant.userJid || mentionJid;
      const name = (participant.notify || participant.name || '').trim();
      if (name && !name.match(/^\d+$/) && !name.startsWith('+')) {
        displayLabel = name;
      }
    }
  }

  const finalLabel = displayLabel || userPart || (mentionJid?.split('@')[0]) || storedJid || 'User';
  if (DEBUG) {
    console.log('[SUDO] resolveSudoUser result:', { displayLabel, finalLabel, mentionJid });
  }

  return { displayLabel: finalLabel, mentionJid };
}

module.exports = {
  name: 'sudo',
  aliases: ['sudouser'],
  description: 'Add or remove sudo users (owner-like privileges)',
  usage: '.sudo add @user | .sudo remove @user | .sudo list',
  category: 'owner',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const from = extra.from;
      let groupMetadata = extra.groupMetadata || null;
      const isGroup = extra.isGroup || from.endsWith('@g.us');

      if (isGroup && !groupMetadata) {
        try {
          groupMetadata = await sock.groupMetadata(from);
        } catch (_) {}
      }


      if (!args[0]) {
        const sudoJids = database.getSudoUsers();
        let listText = '_No sudo users_';
        const mentionJids = [];
        const lines = [];

        if (sudoJids.length > 0) {
          for (let i = 0; i < sudoJids.length; i++) {
            const { displayLabel, mentionJid } = await resolveSudoUser(sock, sudoJids[i], groupMetadata, from);
            if (mentionJid) mentionJids.push(mentionJid);
            lines.push(`${i + 1}. @${displayLabel}`);
          }
          listText = lines.join('\n');
        }

        const text =
          `🔐 *Sudo Users*\n\n` +
          `Sudo users have owner-like privileges (can use owner commands in private mode).\n\n` +
          `*Usage:*\n` +
          `  .sudo add @user - Add sudo (mention user)\n` +
          `  .sudo add <number> - Add sudo by number\n` +
          `  .sudo remove @user - Remove sudo (mention user)\n` +
          `  .sudo list - List all sudo users\n\n` +
          `*Current sudo users:*\n${listText}`;

        await sock.sendMessage(from, { text, mentions: mentionJids }, { quoted: msg });
        return;
      }

      const action = args[0].toLowerCase();
      let inputJid = args[1] ? toJid(args[1]) : null;

      // Resolve target: args[1] number -> reply participant -> @mention
      if (!inputJid && (action === 'add' || action === 'a' || action === 'remove' || action === 'rem' || action === 'del' || action === 'r')) {
        const ctx =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo ||
          msg.message?.videoMessage?.contextInfo;
        const quotedParticipant = ctx?.participant;
        if (quotedParticipant) {
          inputJid = quotedParticipant;
        } else {
          inputJid = extractMentionedJid(msg);
        }
        if (!inputJid && !isGroup && msg.key?.remoteJid?.includes('@')) {
          inputJid = msg.key.remoteJid;
        }
      }

      if (action === 'add' || action === 'a') {
        if (!inputJid || !inputJid.includes('@')) {
          return extra.reply('❌ Please mention a user (@user), provide a number, or reply to a message.\nExample: .sudo add @user or .sudo add 919876543210');
        }

        const { displayLabel, mentionJid } = await resolveSudoUser(sock, inputJid, groupMetadata, from);

        if (database.addSudoUser(inputJid)) {
          const text = `✅ @${displayLabel} has been added as sudo user.`;
          await sock.sendMessage(from, { text, mentions: mentionJid ? [mentionJid] : [] }, { quoted: msg });
        } else {
          const text = `ℹ️ @${displayLabel} is already a sudo user.`;
          await sock.sendMessage(from, { text, mentions: mentionJid ? [mentionJid] : [] }, { quoted: msg });
        }
        return;
      }

      if (action === 'remove' || action === 'rem' || action === 'del' || action === 'r') {
        if (!inputJid || !inputJid.includes('@')) {
          return extra.reply('❌ Please mention a user (@user), provide a number, or reply to a message.\nExample: .sudo remove @user or .sudo remove 919876543210');
        }

        const ownerJids = (config.ownerNumber || []).map((n) => `${String(n).replace(/\D/g, '')}@s.whatsapp.net`);
        const inputUser = inputJid.split('@')[0];
        if (ownerJids.some((oj) => oj.split('@')[0] === inputUser)) {
          return extra.reply('❌ Owner cannot be removed from sudo.');
        }

        const { displayLabel, mentionJid } = await resolveSudoUser(sock, inputJid, groupMetadata, from);

        if (database.removeSudoUser(inputJid)) {
          const text = `✅ @${displayLabel} has been removed from sudo users.`;
          await sock.sendMessage(from, { text, mentions: mentionJid ? [mentionJid] : [] }, { quoted: msg });
        } else {
          const text = `ℹ️ @${displayLabel} was not in the sudo list.`;
          await sock.sendMessage(from, { text, mentions: mentionJid ? [mentionJid] : [] }, { quoted: msg });
        }
        return;
      }

      if (action === 'list' || action === 'l') {
        const sudoJids = database.getSudoUsers();
        let listText = '_No sudo users_';
        const mentionJids = [];
        const lines = [];

        if (sudoJids.length > 0) {
          for (let i = 0; i < sudoJids.length; i++) {
            const { displayLabel, mentionJid } = await resolveSudoUser(sock, sudoJids[i], groupMetadata, from);
            if (mentionJid) mentionJids.push(mentionJid);
            lines.push(`${i + 1}. @${displayLabel}`);
          }
          listText = lines.join('\n');
        }

        const text = `🔐 *Sudo Users List*\n\n${listText}`;
        await sock.sendMessage(from, { text, mentions: mentionJids }, { quoted: msg });
        return;
      }

      return extra.reply('❌ Invalid action!\nUsage: .sudo add/remove/list <number>');
    } catch (error) {
      console.error('Sudo command error:', error);
      await extra.reply('❌ Error executing sudo command.');
    }
  }
};
