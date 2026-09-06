module.exports = {
  name: 'scors',
  aliases: ['scor'],
  description: 'Generate a decorative boxed SCORS banner',
  async execute(sock, msg, args, ctx) {
    try {
      const text = (args || []).join(' ').trim();
      if (!text) return ctx.reply && await ctx.reply('Usage: .scors <text>');

      const primeAI = require('../../utils/primeAI');
      const styled = primeAI.makeText('scors', text);

      await sock.sendMessage(ctx.from, { text: styled }, { quoted: msg });
    } catch (e) {
      console.error('scors command error', e?.message || e);
      try { await sock.sendMessage(ctx.from, { text: 'Error generating scors text' }, { quoted: msg }); } catch(_){}
    }
  }
};
