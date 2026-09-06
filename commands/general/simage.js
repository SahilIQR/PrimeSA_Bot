/**
 * Sticker to Image - Convert sticker to PNG image
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { webp2png } = require('../../utils/webp2mp4');

module.exports = {
  name: 'simage',
  aliases: ['toimg', 'stickertoimg', 'sticker2img', 'svideo'],
  category: 'general',
  description: 'Convert sticker to image (PNG)',
  usage: '.simage (reply to sticker)',
  
  async execute(sock, msg, args, extra) {
    try {
      const notStickerMessage = '📎 Reply to a sticker to convert it to image!';
      
      // Check if message is a reply
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        return await extra.reply(notStickerMessage);
      }
      
      const targetMessage = {
        key: {
          remoteJid: extra.from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };
      
      // Check if quoted message is a sticker
      const stickerMessage = targetMessage.message?.stickerMessage;
      if (!stickerMessage) {
        return await extra.reply(notStickerMessage);
      }
      
      // Download sticker
      const stickerBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );
      
      if (!stickerBuffer) {
        return await extra.reply('❌ Failed to download sticker. Please try again.');
      }
      
      // Check if sticker is animated
      const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');
      
      if (isAnimated) {
        // For animated stickers, convert directly to MP4 video
        const { webp2mp4 } = require('../../utils/webp2mp4');
        const mp4Buffer = await webp2mp4(stickerBuffer);
        
        if (!mp4Buffer || mp4Buffer.length === 0) {
          throw new Error('MP4 buffer is empty or null');
        }
        
        // Check file size (WhatsApp has limits)
        const maxSize = 16 * 1024 * 1024; // 16MB for videos
        if (mp4Buffer.length > maxSize) {
          throw new Error(`MP4 file too large: ${(mp4Buffer.length / 1024 / 1024).toFixed(2)}MB`);
        }
        
        // Send as MP4 video
        await sock.sendMessage(extra.from, {
          video: mp4Buffer,
          mimetype: 'video/mp4',
          gifPlayback: true
        }, { quoted: msg });
      } else {
        // Convert static WebP to PNG
        const imageBuffer = await webp2png(stickerBuffer);
        
        // Send as image (no caption)
        await sock.sendMessage(extra.from, {
          image: imageBuffer
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('Error in simage command:', error);
      await extra.reply(`❌ Failed to convert sticker to image.\n\nError: ${error.message}`);
    }
  }
};

