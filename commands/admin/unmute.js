/**
 * Unmute Command - Open group (all members can send)
 */

module.exports = {
    name: 'unmute',
    aliases: ['open', 'opengroup'],
    category: 'admin',
    description: 'Open group (all members can send messages)',
    usage: '.unmute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        await sock.groupSettingUpdate(extra.from, 'not_announcement');
        await extra.reply('🔓 Group has been opened!\n\nAll members can send messages now.');
        
      } catch (error) {
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  