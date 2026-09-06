module.exports = {
  name: 'mapholoba',
  aliases: ['mapho'],
  description: 'Generate a polished MAPHoloba banner',

  async execute(sock, msg, args, ctx) {
    try {
      const text = (args || []).join(' ').trim();

      if (!text) {
        return ctx.reply && await ctx.reply('Usage: .mapholoba <text>');
      }

      const styled = makeMapholobaBanner(text);

      await sock.sendMessage(
        ctx.from,
        { text: styled },
        { quoted: msg }
      );

    } catch (e) {
      console.error('mapholoba command error:', e?.message || e);

      try {
        await sock.sendMessage(
          ctx.from,
          { text: 'Error generating Mapholoba text' },
          { quoted: msg }
        );
      } catch (_) {}
    }
  }
};

function makeMapholobaBanner(text) {
  const maxLineLength = 28;
  const contentLines = text
    .split(/\r?\n/)
    .flatMap(line => wrapLine(line.trim(), maxLineLength));
  const width = Math.max(
    'MAPHOLOBA'.length,
    ...contentLines.map(line => line.length)
  );
  const innerWidth = Math.min(Math.max(width + 4, 18), maxLineLength + 4);
  const title = centerText('MAPHOLOBA', innerWidth);
  const divider = '━'.repeat(innerWidth);
  const body = contentLines
    .map(line => `┃  ${line.padEnd(innerWidth - 4, ' ')}  ┃`)
    .join('\n');

  return [
    '╭' + '━'.repeat(innerWidth) + '╮',
    `┃${title}┃`,
    '┣' + divider + '┫',
    body,
    '┣' + divider + '┫',
    `┃${centerText('PRIMESA BOT', innerWidth)}┃`,
    '╰' + '━'.repeat(innerWidth) + '╯'
  ].join('\n');
}

function wrapLine(line, maxLength) {
  if (!line) return [''];
  const words = line.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current && word.length > maxLength) {
      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function centerText(text, width) {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(padding - left)}`;
}
