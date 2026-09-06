/**
 * AFK Command — Away From Keyboard (owner offline mode)
 * When ON, bot replies once per user when tagged or replied to.
 */

const afk = require('../../utils/afk');

module.exports = {
  name: 'afk',
  aliases: ['away'],
  category: 'owner',
  description: 'Enable/disable AFK mode (owner offline auto-reply)',
  usage: '.afk <on/off> [custom message]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const opt = (args[0] || '').toLowerCase();

      if (!opt) {
        const on = afk.isEnabled();
        return extra.reply(
          `🔴 *AFK Mode*\n\n` +
          `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
          `When ON:\n` +
          `• *Groups* — one-time reply when someone @tags or replies to the bot\n` +
          `• *DMs* — one-time reply to any message\n` +
          `Repeated messages from the same person are ignored to avoid spam.\n\n` +
          `Usage:\n` +
          `  .afk on\n` +
          `  .afk on busy right now\n` +
          `  .afk off`
        );
      }

      if (opt === 'on') {
        if (afk.isEnabled()) {
          return extra.reply('*AFK is already ON*');
        }
        const customMsg = args.slice(1).join(' ').trim();
        const message = customMsg
          ? `🔴 *AFK Mode ON*\n\n${customMsg}`
          : afk.DEFAULT_MESSAGE;
        afk.setEnabled(true, message);
        return extra.reply('*AFK mode enabled.* Bot will notify taggers/repliers once each.');
      }

      if (opt === 'off') {
        if (!afk.isEnabled()) {
          return extra.reply('*AFK is already OFF*');
        }
        afk.setEnabled(false);
        return extra.reply('*AFK mode disabled.* You are back online.');
      }

      return extra.reply('❌ Invalid option. Use: .afk on | .afk off');
    } catch (err) {
      console.error('[afk cmd] error:', err);
      return extra.reply('❌ Error updating AFK mode.');
    }
  },
};
