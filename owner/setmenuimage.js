/**
 * SetMenuImage Command - Owner only
 * Set/change the menu image by replying to an image or sticker
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'setmenuimage',
  aliases: ['setmenuimg', 'changemenuimage'],
  category: 'owner',
  description: 'Set or change the menu image (owner only)',
  usage: '.setmenuimage (reply to image/sticker)',
  ownerOnly: true,
  adminOnly: false,
  groupOnly: false,
  botAdminOnly: false,
  
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      
      // Check if message is a reply
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage) {
        return extra.reply('📷 Please reply to an *image* or *sticker* to set it as the menu image.');
      }
      
      const quotedMsg = ctx.quotedMessage;
      const imageMsg = quotedMsg.imageMessage || quotedMsg.stickerMessage;
      
      if (!imageMsg) {
        return extra.reply('❌ The replied message must be an *image* or *sticker*.');
      }
      
      // Download the media
      const targetMessage = {
        key: {
          remoteJid: chatId,
          id: ctx.stanzaId,
          participant: ctx.participant,
        },
        message: quotedMsg,
      };
      
      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );
      
      if (!mediaBuffer) {
        return extra.reply('❌ Failed to download the image. Please try again.');
      }
      
      // Convert to JPEG if it's a sticker (webp)
      let finalBuffer = mediaBuffer;
      if (quotedMsg.stickerMessage) {
        const sharp = require('sharp');
        finalBuffer = await sharp(mediaBuffer)
          .jpeg({ quality: 90 })
          .toBuffer();
      } else if (!imageMsg.mimetype?.includes('jpeg') && !imageMsg.mimetype?.includes('jpg')) {
        // Convert other formats to JPEG
        const sharp = require('sharp');
        finalBuffer = await sharp(mediaBuffer)
          .jpeg({ quality: 90 })
          .toBuffer();
      }
      
      // Save to utils/bot_image.jpg
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      // Delete old image if exists
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (e) {
          console.warn('Could not delete old menu image:', e);
        }
      }
      
      // Write new image
      fs.writeFileSync(imagePath, finalBuffer);
      
      await extra.reply('✅ Menu image has been updated successfully!');
      
    } catch (error) {
      console.error('SetMenuImage command error:', error);
      await extra.reply(`❌ Failed to set menu image: ${error.message}`);
    }
  }
};


