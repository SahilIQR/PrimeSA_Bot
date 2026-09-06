/**
 * ViewOnce Command - Reveal view-once messages
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'viewonce',
  aliases: ['readvo', 'read', 'vv', 'readviewonce'],
  category: 'general',
  description: 'Reveal view-once messages (images/videos/audio)',
  usage: '.viewonce (reply to view-once message)',
  
  async execute(sock, msg, args) {
    try {
      const chatId = msg.key.remoteJid;

      // Try to get contextInfo from different message types (reply can be from text, image, video, etc.)
      const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.buttonsResponseMessage?.contextInfo
        || msg.message?.listResponseMessage?.contextInfo;

      if (!ctx?.quotedMessage || !ctx?.stanzaId) {
        return await sock.sendMessage(
          chatId,
          { text: '🗑️ Reply to a *view-once* message to reveal it.' },
          { quoted: msg }
        );
      }

      const quotedMsg = ctx.quotedMessage;

      // Check various patterns used for view-once messages
      const hasViewOnce =
        !!quotedMsg.viewOnceMessageV2 ||
        !!quotedMsg.viewOnceMessageV2Extension ||
        !!quotedMsg.viewOnceMessage ||
        !!quotedMsg.viewOnce ||
        !!quotedMsg?.imageMessage?.viewOnce ||
        !!quotedMsg?.videoMessage?.viewOnce ||
        !!quotedMsg?.audioMessage?.viewOnce;

      if (!hasViewOnce) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ This is not a view-once message!' },
          { quoted: msg }
        );
      }

      let actualMsg = null;
      let mtype = null;

      // Newer Baileys: viewOnceMessageV2Extension
      if (quotedMsg.viewOnceMessageV2Extension?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
        mtype = Object.keys(actualMsg)[0];

      // Classic Baileys: viewOnceMessageV2
      } else if (quotedMsg.viewOnceMessageV2?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2.message;
        mtype = Object.keys(actualMsg)[0];

      // Older: viewOnceMessage
      } else if (quotedMsg.viewOnceMessage?.message) {
        actualMsg = quotedMsg.viewOnceMessage.message;
        mtype = Object.keys(actualMsg)[0];

      // Direct message with viewOnce flag on media
      } else if (quotedMsg.imageMessage?.viewOnce) {
        actualMsg = { imageMessage: quotedMsg.imageMessage };
        mtype = 'imageMessage';
      } else if (quotedMsg.videoMessage?.viewOnce) {
        actualMsg = { videoMessage: quotedMsg.videoMessage };
        mtype = 'videoMessage';
      } else if (quotedMsg.audioMessage?.viewOnce) {
        actualMsg = { audioMessage: quotedMsg.audioMessage };
        mtype = 'audioMessage';
      }

      if (!actualMsg || !mtype) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ Unsupported view-once message type.' },
          { quoted: msg }
        );
      }

      const downloadType =
        mtype === 'imageMessage'
          ? 'image'
          : mtype === 'videoMessage'
          ? 'video'
          : 'audio';

      const mediaStream = await downloadContentFromMessage(
        actualMsg[mtype],
        downloadType
      );

      let buffer = Buffer.from([]);
      for await (const chunk of mediaStream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const caption = actualMsg[mtype]?.caption || '';

      if (/video/.test(mtype)) {
        await sock.sendMessage(
          chatId,
          {
            video: buffer,
            caption,
            mimetype: 'video/mp4'
          },
          { quoted: msg }
        );
      } else if (/image/.test(mtype)) {
        await sock.sendMessage(
          chatId,
          {
            image: buffer,
            caption,
            mimetype: 'image/jpeg'
          },
          { quoted: msg }
        );
      } else if (/audio/.test(mtype)) {
        await sock.sendMessage(
          chatId,
          {
            audio: buffer,
            ptt: true,
            mimetype: 'audio/ogg; codecs=opus'
          },
          { quoted: msg }
        );
      }
    } catch (error) {
      console.error('Error in viewonce command:', error);
      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text:
            '❌ Error processing view-once message: ' +
            (error.message || 'Unknown error')
        },
        { quoted: msg }
      );
    }
  }
};
