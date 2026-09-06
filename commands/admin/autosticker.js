/**
 * AutoSticker Command - Enable or disable auto-sticker conversion
 */

const database = require('../../database');

module.exports = {
  name: 'autosticker',
  aliases: ['autos', 'asticker'],
  category: 'admin',
  description: 'Enable or disable auto-sticker conversion (images/videos automatically become stickers)',
  usage: '.autosticker <on/off>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.autosticker ? 'ON' : 'OFF';
        return extra.reply(
          `📌 *AutoSticker Status*\n\n` +
          `Status: *${status}*\n\n` +
          `When enabled, all images and videos sent in this group will automatically be converted to stickers.\n\n` +
          `Usage:\n` +
          `  .autosticker on\n` +
          `  .autosticker off`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).autosticker) {
          return extra.reply('*AutoSticker is already ON*');
        }
        database.updateGroupSettings(extra.from, { autosticker: true });
        return extra.reply('✅ *AutoSticker has been turned ON*\n\nAll images and videos will now automatically be converted to stickers!');
      }
      
      if (opt === 'off') {
        if (!database.getGroupSettings(extra.from).autosticker) {
          return extra.reply('*AutoSticker is already OFF*');
        }
        database.updateGroupSettings(extra.from, { autosticker: false });
        return extra.reply('❌ *AutoSticker has been turned OFF*');
      }
      
      return extra.reply('❌ Invalid option!\nUsage: .autosticker <on/off>');
    } catch (error) {
      console.error('[AutoSticker Command Error]:', error);
      return extra.reply('❌ Error updating autosticker setting.');
    }
  }
};

