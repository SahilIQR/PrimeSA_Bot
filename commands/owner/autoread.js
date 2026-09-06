/**
 * AutoRead Command - Read messages immediately when received
 * Owner only. Bot marks incoming messages as read right away.
 */

const { load, save, isEnabled } = require('../../utils/autoread');

module.exports = {
  name: 'autoread',
  aliases: ['aread'],
  category: 'owner',
  description: 'Read messages immediately when received (owner only)',
  usage: '.autoread <on/off>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const on = isEnabled();
        return extra.reply(
          `📖 *AutoRead*\n\n` +
          `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
          `When ON, the bot marks all incoming messages (groups & DMs) as read immediately.\n\n` +
          `Usage:\n` +
          `  .autoread on\n` +
          `  .autoread off`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        save(true);
        return extra.reply('✅ *AutoRead is ON*. Bot will read messages immediately.');
      }

      if (opt === 'off') {
        save(false);
        return extra.reply('❌ *AutoRead is OFF*.');
      }

      return extra.reply('❌ Invalid option. Use: .autoread <on/off>');
    } catch (err) {
      console.error('[autoread cmd] error:', err);
      return extra.reply('❌ Error updating autoread.');
    }
  }
};
