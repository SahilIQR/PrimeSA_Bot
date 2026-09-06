// commands/fun/ship.js
module.exports = {
  name: 'ship',
  aliases: ['shipit','match'],
  category: 'fun',
  description: 'Ship two users randomly or mention/reply to specific users.',
  usage: '.ship (random) OR .ship @user1 @user2 OR reply with .ship',
  groupOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
      const mentioned = ctx.mentionedJid || [];
      let a = null;
      let b = null;

      // If two mentions -> use them
      if (mentioned.length >= 2) {
        a = mentioned[0];
        b = mentioned[1];
      } else if (mentioned.length === 1) {
        // one mention: pair mentioned with sender
        a = mentioned[0];
        b = extra.sender;
      } else if (ctx.participant) {
        // replied to someone: pair replied user with sender
        a = ctx.participant;
        b = extra.sender;
      } else {
        // No mentions or reply: select 2 random group members
        if (extra.isGroup && extra.groupMetadata?.participants) {
          const participants = extra.groupMetadata.participants
            .map(p => p.id)
            .filter(id => id !== sock.user.id); // Exclude bot
          
          if (participants.length >= 2) {
            // Randomly select 2 different users
            const shuffled = participants.sort(() => Math.random() - 0.5);
            a = shuffled[0];
            b = shuffled[1];
          } else {
            return extra.reply('❌ Not enough members to ship!');
          }
        } else {
          return extra.reply('❌ This command works only in groups!');
        }
      }

      // names (friendly)
      const nameOf = id => `@${id.split('@')[0]}`;

      // create a deterministic percent from concatenated ids
      const seed = (a + b).split('').reduce((s,c)=> s + c.charCodeAt(0), 0);
      const love = Math.abs((seed * 7) % 101); // 0-100

      // fun ship phrases
      const hearts = ['💖','💕','💘','💞','💓'];
      const heart = hearts[Math.floor(Math.random() * hearts.length)];
      const phrases = [
        `${nameOf(a)} + ${nameOf(b)} = ${love}% ${heart}\nLooks promising!`,
        `${nameOf(a)} x ${nameOf(b)} = ${love}%\nNot bad, keep flirting 😉`,
        `${nameOf(a)} & ${nameOf(b)} Compatibility: ${love}%\n${love > 75 ? 'A strong match ❤️' : love > 40 ? 'Could work 🤝' : 'Mostly chaos 😂'}`
      ];

      const out = phrases[Math.floor(Math.random() * phrases.length)];

      await sock.sendMessage(extra.from, { text: out, mentions: [a, b] }, { quoted: msg });
    } catch (error) {
      console.error('[ship] ERROR:', error);
      await extra.reply('❌ Something went wrong while shipping.');
    }
  }
};
