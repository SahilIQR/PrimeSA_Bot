module.exports = {
  name: 'voicenote',
  aliases: ['vnote', 'vn'],
  category: 'general',
  description: 'Play the owner voice note (placed in utils/voicenote.mp3)',
  usage: '.voicenote',

  async execute(sock, msg, args, extra) {
    try {
      const fs = require('fs');
      const path = require('path');
      const mediaDir = path.join(__dirname, '../../utils');
      const candidates = ['voicenote.ogg','voicenote.mp3', 'voicenote.m4a'];

      let found = null;
      for (const f of candidates) {
        const fp = path.join(mediaDir, f);
        try {
          if (!fs.existsSync(fp)) continue;
          const stat = fs.statSync(fp);
          if (!stat.isFile()) continue; // skip directories
          found = { path: fp, ext: path.extname(fp).slice(1) };
          break;
        } catch (e) {
          continue;
        }
      }

      if (!found) {
        return extra.reply('\uD83D\uDD0A No voice note found. Place your file at utils/voicenote.ogg (preferred) or utils/voicenote.mp3/.m4a');
      }

      // If file is already an OGG (opus), send as url to avoid reading into memory
      const ext = (found.ext || '').toLowerCase();
      if (ext === 'ogg' || ext === 'opus') {
        // Send as file URL (Baileys accepts local file paths)
        await sock.sendMessage(extra.from, {
          audio: { url: found.path },
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        }, { quoted: msg });
        return;
      }

      // For other formats, read and convert to opus (PTT) if possible
      const buff = fs.readFileSync(found.path);
      try {
        const { toPTT } = require('../../utils/converter');
        const pttBuffer = await toPTT(buff, found.ext || 'mp3');
        await sock.sendMessage(extra.from, { audio: pttBuffer, ptt: true }, { quoted: msg });
      } catch (e) {
        // fallback: send raw buffer with best-effort mimetype
        const mime = ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
        await sock.sendMessage(extra.from, { audio: buff, mimetype: mime, ptt: true }, { quoted: msg });
      }
    } catch (e) {
      console.error('[voicenote] error', e?.message || e);
      try { await extra.reply('❌ Failed to send voice note.'); } catch {}
    }
  }
};
