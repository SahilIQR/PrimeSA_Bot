/**
 * Antibadword Command - Detect and delete bad words (delete/kick/warn)
 */

const database = require('../../database');

module.exports = {
  name: 'antibadword',
  aliases: ['antibad', 'nobadword'],
  category: 'admin',
  description: 'Configure antibadword protection (delete/kick/warn)',
  usage: '.antibadword <on/off/set/get>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antibadword ? 'ON' : 'OFF';
        const action = settings.antibadwordAction || 'delete';
        return extra.reply(
          `🚫 *Antibadword Status*\n\n` +
          `Status: *${status}*\n` +
          `Action: *${action}*\n\n` +
          `Usage:\n` +
          `  .antibadword on\n` +
          `  .antibadword off\n` +
          `  .antibadword set delete | kick | warn\n` +
          `  .antibadword get`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antibadword) {
          return extra.reply('*Antibadword is already on*');
        }
        database.updateGroupSettings(extra.from, { antibadword: true });
        return extra.reply('*Antibadword has been turned ON*');
      }

      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antibadword: false });
        return extra.reply('*Antibadword has been turned OFF*');
      }

      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply('*Please specify an action: .antibadword set delete | kick | warn*');
        }

        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('*Invalid action. Choose delete, kick, or warn.*');
        }

        database.updateGroupSettings(extra.from, {
          antibadwordAction: setAction,
          antibadword: true,
        });
        return extra.reply(`*Antibadword action set to ${setAction}*`);
      }

      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antibadword ? 'ON' : 'OFF';
        const action = settings.antibadwordAction || 'delete';
        return extra.reply(`*Antibadword Configuration:*\nStatus: ${status}\nAction: ${action}`);
      }

      return extra.reply('*Use .antibadword for usage.*');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};
