/**
 * HideTag Command
 * Silently tag all group members without listing them
 * Supports text, images, videos, and stickers
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'hidetag',
  aliases: ['tag'],
  description: 'Silently tag all members in the group',
  usage: '.tag <message> (or reply to media)',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const groupMetadata = await sock.groupMetadata(extra.from);
      const participants = groupMetadata.participants || [];
      const mentions = participants.map((p) => p.id || p.lid).filter(Boolean);
      
      // Check if message is a reply to media
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      let targetMessage = msg;
      
      if (ctxInfo?.quotedMessage) {
        // Build target message for download
        targetMessage = {
          key: {
            remoteJid: extra.from,
            id: ctxInfo.stanzaId,
            participant: ctxInfo.participant,
          },
          message: ctxInfo.quotedMessage,
        };
      }
      
      // Check what type of media we're dealing with
      const mediaMessage = 
        targetMessage.message?.imageMessage ||
        targetMessage.message?.videoMessage ||
        targetMessage.message?.stickerMessage;
      
      if (mediaMessage) {
        // Download and resend media with mentions
        try {
          const mediaBuffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
          );
          
          if (targetMessage.message?.imageMessage) {
            const text = args.join(' ') || targetMessage.message.imageMessage.caption || '';
            await sock.sendMessage(extra.from, {
              image: mediaBuffer,
              caption: text,
              mentions
            }, { quoted: msg });
          } else if (targetMessage.message?.videoMessage) {
            const text = args.join(' ') || targetMessage.message.videoMessage.caption || '';
            await sock.sendMessage(extra.from, {
              video: mediaBuffer,
              caption: text,
              mentions
            }, { quoted: msg });
          } else if (targetMessage.message?.stickerMessage) {
            await sock.sendMessage(extra.from, {
              sticker: mediaBuffer,
              mentions
            }, { quoted: msg });
            
            // If there's text, send it separately
            const text = args.join(' ');
            if (text) {
              await sock.sendMessage(extra.from, { text, mentions }, { quoted: msg });
            }
          }
        } catch (mediaError) {
          console.error('Error downloading media for hidetag:', mediaError);
          // Fallback to text with mentions
          const text = args.join(' ') || ' ';
          await sock.sendMessage(extra.from, { text, mentions }, { quoted: msg });
        }
      } else {
        // Check if replying to a message - send exact message content
        if (ctxInfo?.quotedMessage) {
          // Get the quoted message text
          const quotedText = ctxInfo.quotedMessage.conversation || 
                           ctxInfo.quotedMessage.extendedTextMessage?.text || 
                           args.join(' ') || ' ';
          
          await sock.sendMessage(extra.from, { text: quotedText, mentions }, { quoted: msg });
        } else {
          // Plain text message
          const text = args.join(' ') || ' ';
          await sock.sendMessage(extra.from, { text, mentions }, { quoted: msg });
        }
      }
    } catch (error) {
      console.error('HideTag command error:', error);
      await extra.reply('❌ Failed to tag members.');
    }
  },
};
