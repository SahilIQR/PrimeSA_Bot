/**
 * Set Voice Note - owner only
 * Usage: reply to an audio/voice message with .setvoicenote
 * The bot will convert the audio to opus (OGG) for best PTT UX and save to utils/voicenote.ogg
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toPTT } = require('../../utils/converter');

module.exports = {
  name: 'setvoicenote',
  aliases: ['setvn','setvnote'],
  category: 'owner',
  description: 'Set owner voice note (reply to an audio/voice message with this command)',
  usage: '.setvoicenote',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Look for quoted message
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted) return extra.reply('❗ Reply to the audio/voice message you want to set as the voice note.');

      // determine audio message object and extension
      let audioMsg = null;
      let ext = 'mp3';
      if (quoted.audioMessage) {
        audioMsg = quoted.audioMessage;
        ext = 'mp3';
      } else if (quoted.documentMessage && quoted.documentMessage.mimetype && quoted.documentMessage.mimetype.startsWith('audio/')) {
        audioMsg = quoted.documentMessage;
        // derive ext from mimetype
        const mt = quoted.documentMessage.mimetype.split('/')[1] || 'mp3';
        ext = mt.split('+')[0];
      } else if (quoted.voiceMessage) {
        audioMsg = quoted.voiceMessage;
        ext = 'ogg';
      } else {
        return extra.reply('❗ Quoted message must be an audio or voice note.');
      }

      // download content into buffer
      const stream = await downloadContentFromMessage({ audioMessage: audioMsg }, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const inputBuffer = Buffer.concat(chunks);

      // convert to opus (ptt)
      const converted = await toPTT(inputBuffer, ext);

      // ensure utils directory exists
      const mediaDir = path.join(__dirname, '../../utils');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

      const outPath = path.join(mediaDir, 'voicenote.ogg');
      fs.writeFileSync(outPath, converted);

      await extra.reply(`✅ Voice note saved as utils/voicenote.ogg. Use .voicenote to play it.`);
    } catch (e) {
      console.error('[setvoicenote] error', e?.message || e);
      try { await extra.reply('❌ Failed to set voice note. Make sure you replied to an audio file.'); } catch {}
    }
  }
};
