/**
 * Antisticker Command - Toggle antisticker protection with delete/kick options
 */

const database = require('../../database');

module.exports = {
  name: 'antisticker',
  aliases: ['nosticker'],
  category: 'admin',
  description: 'Configure antisticker protection (stickers not allowed)',
  usage: '.antisticker <on/off/set/get>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antisticker ? 'ON' : 'OFF';
        const action = settings.antistickerAction || 'delete';
        return extra.reply(
          `🖼️ *Antisticker Status*\n\n` +
          `Status: *${status}*\n` +
          `Action: *${action}*\n\n` +
          `Stickers will be deleted when sent.\n\n` +
          `Usage:\n` +
          `  .antisticker on\n` +
          `  .antisticker off\n` +
          `  .antisticker set delete | kick\n` +
          `  .antisticker get`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antisticker) {
          return extra.reply('*Antisticker is already on*');
        }
        database.updateGroupSettings(extra.from, { antisticker: true });
        return extra.reply('*Antisticker has been turned ON* - Stickers will be deleted.');
      }

      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antisticker: false });
        return extra.reply('*Antisticker has been turned OFF*');
      }

      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply('*Please specify an action: .antisticker set delete | kick*');
        }

        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(setAction)) {
          return extra.reply('*Invalid action. Choose delete or kick.*');
        }

        database.updateGroupSettings(extra.from, {
          antistickerAction: setAction,
          antisticker: true
        });
        return extra.reply(`*Antisticker action set to ${setAction}*`);
      }

      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antisticker ? 'ON' : 'OFF';
        const action = settings.antistickerAction || 'delete';
        return extra.reply(`*Antisticker Configuration:*\nStatus: ${status}\nAction: ${action}`);
      }

      return extra.reply('*Use .antisticker for usage.*');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
