/**
 * AutoStatus Command - View & react to status updates automatically
 * Owner only. When someone posts a status, bot views it and optionally reacts.
 */

const { load, save } = require('../../utils/autostatus');

module.exports = {
  name: 'autostatus',
  aliases: ['astatus', 'asv'],
  category: 'owner',
  description: 'Auto view and react to status updates (owner only)',
  usage: '.autostatus [view on/off] [react on/off] [reaction <emoji>]',
  ownerOnly: true,

async execute(sock, msg, args, extra) {
  try {
    const cfg = load();

    // Get the complete message text directly from WhatsApp
    const body =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      msg?.message?.imageMessage?.caption ||
      msg?.message?.videoMessage?.caption ||
      '';

    // Remove command and get the actual arguments
    const prefix = extra?.prefix || '.';

    const parts = body
      .trim()
      .replace(/^[.!#]/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    // Remove "autostatus"
    parts.shift();

    // Use message arguments first, then fallback to parsed message
    const commandArgs = parts.length
      ? parts
      : (Array.isArray(args) ? args : []);

    // Clean arguments
    const sub = String(commandArgs[0] || '')
      .trim()
      .toLowerCase()
      .replace(/[<>]/g, '');

    const val = String(commandArgs[1] || '')
      .trim()
      .toLowerCase()
      .replace(/[<>]/g, '');

    console.log(
      `[autostatus] sub="${sub}" val="${val}" args=`,
      commandArgs
    );

    // ─────────────────────────────
    // SHOW STATUS
    // ─────────────────────────────

    if (!sub) {
      let privacyNote = '';

      try {
        const privacy = await sock.fetchPrivacySettings?.();
        const rr = privacy?.readreceipts || 'unknown';

        privacyNote = rr !== 'all'
          ? `\n⚠️ Bot read receipts: *${rr}* – status poster may NOT see views. Use \`.autostatus readreceipts on\` to fix.`
          : `\n✅ Bot read receipts: ${rr}`;
      } catch (_) {}

      return extra.reply(
        `📱 *AutoStatus*\n\n` +
        `View: *${cfg.view ? 'ON' : 'OFF'}*\n` +
        `React: *${cfg.react ? 'ON' : 'OFF'}*\n` +
        `Reaction: ${cfg.reaction}` +
        privacyNote +
        `\n\n*Usage:*\n` +
        `• .autostatus view on\n` +
        `• .autostatus view off\n` +
        `• .autostatus react on\n` +
        `• .autostatus react off\n` +
        `• .autostatus reaction ❤️\n` +
        `• .autostatus readreceipts on\n` +
        `• .autostatus list\n` +
        `• .autostatus get <id>`
      );
    }

    // ─────────────────────────────
    // LIST RECOVERED STATUSES
    // ─────────────────────────────

    if (sub === 'list') {
      try {
        const {
          initStatusRecovery
        } = require('../../utils/statusRecovery');

        const sr = initStatusRecovery(sock);
        const list = sr.listStatuses();

        if (!list || list.length === 0) {
          return extra.reply('📭 No recovered statuses stored.');
        }

        const lines = list
          .slice(-50)
          .reverse()
          .map(s =>
            `${s.id} — ${s.sender} — ${s.type} — ${new Date(s.timestamp).toLocaleString()}`
          );

        return extra.reply(
          `📱 *Recovered Statuses*\n\n${lines.join('\n')}`
        );

      } catch (e) {
        return extra.reply(
          '❌ Failed to list statuses: ' +
          (e?.message || e)
        );
      }
    }

    // ─────────────────────────────
    // GET RECOVERED STATUS
    // ─────────────────────────────

    if (sub === 'get') {
      const id = commandArgs[1];

      if (!id) {
        return extra.reply(
          'Usage: .autostatus get <id>'
        );
      }

      try {
        const {
          initStatusRecovery
        } = require('../../utils/statusRecovery');

        const sr = initStatusRecovery(sock);
        const s = sr.getStatus(id);

        if (!s) {
          return extra.reply('❌ Status not found.');
        }

        if (s.type === 'text') {
          return extra.reply(
            `📱 Status from ${s.sender}:\n\n${s.caption}`
          );
        }

        if (s.mediaPath) {
          const fs = require('fs');
          const send = {};
          const buffer = fs.readFileSync(s.mediaPath);

          if (s.type === 'image') {
            send.image = buffer;
          } else if (s.type === 'video') {
            send.video = buffer;
          } else if (s.type === 'audio') {
            send.audio = buffer;
          } else if (s.type === 'document') {
            send.document = buffer;
          }

          await sock.sendMessage(
            extra.from,
            send
          );

          return extra.reply(
            '✅ Sent recovered status.'
          );
        }

        return extra.reply(
          '⚠️ Status exists but media is not available.'
        );

      } catch (e) {
        return extra.reply(
          '❌ Failed to get status: ' +
          (e?.message || e)
        );
      }
    }

    // ─────────────────────────────
    // VIEW
    // ─────────────────────────────

    if (sub === 'view') {

      if (val === 'on') {
        cfg.view = true;
        save(cfg);

        return extra.reply(
          '✅ *AutoStatus View is ON* 📱👀\n\n' +
          'The bot will automatically view status updates.'
        );
      }

      if (val === 'off') {
        cfg.view = false;
        save(cfg);

        return extra.reply(
          '❌ *AutoStatus View is OFF*'
        );
      }

      return extra.reply(
        'Usage: `.autostatus view on` or `.autostatus view off`'
      );
    }

    // ─────────────────────────────
    // REACT
    // ─────────────────────────────

    if (sub === 'react') {

      if (val === 'on') {
        cfg.react = true;
        save(cfg);

        return extra.reply(
          `✅ *AutoStatus React is ON* ❤️\n\n` +
          `The bot will react with ${cfg.reaction}`
        );
      }

      if (val === 'off') {
        cfg.react = false;
        save(cfg);

        return extra.reply(
          '❌ *AutoStatus React is OFF*'
        );
      }

      return extra.reply(
        'Usage: `.autostatus react on` or `.autostatus react off`'
      );
    }

    // ─────────────────────────────
    // REACTION
    // ─────────────────────────────

    if (sub === 'reaction') {
      const emoji = commandArgs
        .slice(1)
        .join(' ')
        .trim();

      if (!emoji) {
        return extra.reply(
          `❤️ Current reaction: ${cfg.reaction}\n\n` +
          'Usage: `.autostatus reaction ❤️`'
        );
      }

      cfg.reaction = emoji;
      save(cfg);

      return extra.reply(
        `✅ *AutoStatus Reaction Updated!*\n\n` +
        `New reaction: ${emoji}`
      );
    }

    // ─────────────────────────────
    // READ RECEIPTS
    // ─────────────────────────────

    if (sub === 'readreceipts') {

      if (val === 'on') {
        if (typeof sock.updateReadReceiptsPrivacy !== 'function') {
          return extra.reply('❌ This Baileys version does not support updateReadReceiptsPrivacy.');
        }

        try {
          await sock.updateReadReceiptsPrivacy('all');

          return extra.reply(
            '✅ *Read Receipts Enabled* 👀\n\n' +
            'Status posters can now see when the bot views their status.'
          );

        } catch (e) {
          return extra.reply(
            '❌ Failed: ' +
            (e?.message || e)
          );
        }
      }

      if (val === 'off') {
        if (typeof sock.updateReadReceiptsPrivacy !== 'function') {
          return extra.reply('❌ This Baileys version does not support updateReadReceiptsPrivacy.');
        }

        try {
          await sock.updateReadReceiptsPrivacy('none');

          return extra.reply(
            '❌ *Read Receipts Disabled*'
          );

        } catch (e) {
          return extra.reply(
            '❌ Failed: ' +
            (e?.message || e)
          );
        }
      }

      return extra.reply(
        'Usage: `.autostatus readreceipts on` or `.autostatus readreceipts off`'
      );
    }

    return extra.reply(
      '❌ *Invalid option.*\n\n' +
      'Available options:\n' +
      '• view\n' +
      '• react\n' +
      '• reaction\n' +
      '• readreceipts\n' +
      '• list\n' +
      '• get'
    );

  } catch (err) {
    console.error(
      '[autostatus cmd] error:',
      err
    );

    return extra.reply(
      '❌ Error updating AutoStatus.'
    );
  }
}
};