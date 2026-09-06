// commands/fun/insult.js
module.exports = {
  name: 'insult',
  aliases: ['insultme','burn'],
  category: 'fun',
  description: 'Give a silly insult to a user. Reply or mention to target someone.',
  usage: '.insult (reply or @user)',
  
  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
      const mentioned = ctx.mentionedJid || [];
      let targetId = null;
      if (mentioned.length) targetId = mentioned[0];
      else if (ctx.participant) targetId = ctx.participant;
      else targetId = extra.sender;

      const targetTag = `@${(targetId || extra.sender).split('@')[0]}`;

      const insults = [
        "You're as useful as a white crayon.",
        "I'd call you sharp, but that would be offensive to pencils.",
        "You're like a cloud. When you disappear, it's a beautiful day.",
        "You bring everyone so much joy... when you leave the room.",
        "If laziness was an Olympic sport, you'd come in fourth — so you wouldn't have to walk up to the podium."
      ];

      const line = insults[Math.floor(Math.random() * insults.length)];
      await sock.sendMessage(extra.from, { text: `${line}`, mentions: [targetId] }, { quoted: msg });
    } catch (error) {
      console.error('[insult] ERROR:', error);
      await extra.reply('❌ Something went wrong.');
    }
  }
};
