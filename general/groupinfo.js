/**
 * Group Info Command - Display group information
 */

module.exports = {
    name: 'groupinfo',
    aliases: ['info', 'ginfo'],
    category: 'general',
    description: 'Show group information',
    usage: '.groupinfo',
    groupOnly: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const metadata = extra.groupMetadata;
        
        const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const members = metadata.participants.filter(p => !p.admin);
        
        let text = `📋 *GROUP INFORMATION*\n\n`;
        text += `🏷️ Name: ${metadata.subject}\n`;
        text += `🆔 ID: ${metadata.id}\n`;
        text += `👥 Members: ${metadata.participants.length}\n`;
        text += `👑 Admins: ${admins.length}\n`;
        text += `📝 Description: ${metadata.desc || 'No description'}\n`;
        text += `🔒 Restricted: ${metadata.restrict ? 'Yes' : 'No'}\n`;
        text += `📢 Announce: ${metadata.announce ? 'Yes' : 'No'}\n`;
        text += `📅 Created: ${new Date(metadata.creation * 1000).toLocaleDateString()}\n\n`;
        text += `👑 *Admins:*\n`;
        
        admins.forEach((admin, index) => {
          text += `${index + 1}. @${admin.id.split('@')[0]}\n`;
        });
        
        await sock.sendMessage(extra.from, {
          text,
          mentions: admins.map(a => a.id)
        }, { quoted: msg });
        
      } catch (error) {
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  