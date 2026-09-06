/**
 * Tag All Command - Mention all group members
 */

module.exports = {
    name: 'tagall',
    aliases: ['mentionall', 'everyone'],
    category: 'admin',
    description: 'Tag all group members',
    usage: '.tagall <message>',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const message = args.join(' ') || 'Everyone!';
        
        const participants = extra.groupMetadata.participants.map(p => p.id);
        
        let text = `📢 *GROUP ANNOUNCEMENT*\n\n`;
        text += `${message}\n\n`;
        text += `👥 Tagged Members:\n`;
        
        participants.forEach((participant, index) => {
          text += `${index + 1}. @${participant.split('@')[0]}\n`;
        });
        
        await sock.sendMessage(extra.from, {
          text,
          mentions: participants
        }, { quoted: msg });
        
      } catch (error) {
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  