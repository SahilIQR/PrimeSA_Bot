module.exports = {
  name: 'textmaker',
  aliases: ['tm','text'],
  description: 'Generate styled text. Usage: .textmaker <style> <text>',
  async execute(sock, msg, args, ctx) {
    try {
      const primeAI = require('../../utils/primeAI');
      const styles = primeAI.listStyles();

      if (!args || args.length === 0) {
        return ctx.reply && await ctx.reply('Usage: .textmaker <style> <text>\nAvailable styles: ' + styles.join(', '));
      }

      const style = args[0].toLowerCase();
      const text = args.slice(1).join(' ').trim();

      if (!styles.includes(style)) {
        return ctx.reply && await ctx.reply('Unknown style: ' + style + '\nAvailable: ' + styles.join(', '));
      }

      if (!text) {
        return ctx.reply && await ctx.reply('Please provide text to style. Usage: .textmaker ' + style + ' <text>');
      }

      const out = primeAI.makeText(style, text);
      await sock.sendMessage(ctx.from, { text: out }, { quoted: msg });
    } catch (e) {
      console.error('textmaker command error', e?.message || e);
      try { await sock.sendMessage(ctx.from, { text: 'Error generating text' }, { quoted: msg }); } catch(_){}
    }
  }
};
