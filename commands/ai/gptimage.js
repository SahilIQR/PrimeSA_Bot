/**
 * GPT Image Command
 * Edit image using AI Image Editor (MagicEraser) - image_url + prompt API
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { webp2png } = require('../../utils/webp2mp4');
const sharp = require('sharp');

const EDITIMG_API = 'https://restapis.xrizaldev.my.id/api/ai2/editimg';
const UGUU_UPLOAD = 'https://uguu.se/upload';

/** Upload buffer to uguu.se and return public URL */
async function uploadToUguu(buffer, filename = 'image.jpg') {
  const form = new FormData();
  form.append('files[]', buffer, { filename, contentType: 'image/jpeg' });
  const { data } = await axios.post(UGUU_UPLOAD, form, {
    headers: form.getHeaders(),
    timeout: 30000,
    maxBodyLength: 20 * 1024 * 1024,
  });
  const url = data?.files?.[0]?.url || data?.data?.files?.[0]?.url || data?.[0]?.url;
  if (!url) throw new Error('No URL in uguu response');
  return url;
}

module.exports = {
  name: 'gptimage',
  aliases: ['gptimg', 'editimage', 'aiimage', 'vision','gi'],
  category: 'ai',
  description: 'Edit image using AI Image Editor (MagicEraser) with a prompt',
  usage: '.gptimage <prompt> (reply to image/sticker)',
  
  async execute(sock, msg, args, extra) {
    try {
      // Check if message is a reply
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        return await extra.reply(
          '📷 *GPT Image Editor*\n\n' +
          'Reply to an *image* or *sticker* with a prompt to edit it.\n\n' +
          `Usage: ${extra.prefix || '.'}gptimage <your prompt>\n\n` +
          'Example: Reply to an image with:\n' +
          `${extra.prefix || '.'}gptimage change the background to a beach`
        );
      }
      
      // Get prompt from args
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return await extra.reply(
          '❌ Please provide a prompt!\n\n' +
          `Usage: ${extra.prefix || '.'}gptimage <your prompt>\n\n` +
          'Example: change the background to a beach'
        );
      }
      
      const targetMessage = {
        key: {
          remoteJid: extra.from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };
      
      // Check if quoted message is an image or sticker
      const quotedMsg = ctxInfo.quotedMessage;
      const isImage = !!quotedMsg.imageMessage;
      const isSticker = !!quotedMsg.stickerMessage;
      
      if (!isImage && !isSticker) {
        return await extra.reply('❌ Please reply to an *image* or *sticker*!');
      }
      
      // Download media
      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );
      
      if (!mediaBuffer) {
        return await extra.reply('❌ Failed to download image. Please try again.');
      }
      
      // Convert sticker to image if needed
      let imageBuffer = mediaBuffer;
      if (isSticker) {
        const stickerMessage = quotedMsg.stickerMessage;
        const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');
        
        if (isAnimated) {
          return await extra.reply('❌ Animated stickers are not supported. Please use a static image or sticker.');
        }
        
        // Convert webp sticker to PNG
        try {
          imageBuffer = await webp2png(mediaBuffer);
        } catch (error) {
          console.error('Error converting sticker to PNG:', error);
          return await extra.reply('❌ Failed to convert sticker to image. Please try with a regular image.');
        }
      }
      
      // Convert to JPEG if needed (API might prefer JPEG)
      // Check if it's already JPEG, if not convert
      let finalImageBuffer = imageBuffer;
      try {
        const metadata = await sharp(imageBuffer).metadata();
        if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
          // Convert to JPEG
          finalImageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();
        }
      } catch (error) {
        // If sharp fails, use original buffer
        console.error('Error processing image with sharp:', error);
        finalImageBuffer = imageBuffer;
      }
      
      // Upload image to get a public URL (API requires image_url)
      let imageUrl;
      try {
        imageUrl = await uploadToUguu(finalImageBuffer, 'image.jpg');
      } catch (uploadErr) {
        console.error('Uguu upload error:', uploadErr);
        return await extra.reply('❌ Failed to upload image. Please try again.');
      }

      // Call AI Image Editor API (GET with image_url + prompt)
      const apiUrl = `${EDITIMG_API}?image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;

      const response = await axios.get(apiUrl, {
        timeout: 120000,
        maxContentLength: 10 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      const result = response.data?.result || response.data;
      if (response.data?.status === false) {
        return await extra.reply('❌ API returned an error. Please try another image or prompt.');
      }
      const outputImageUrl = result?.output_image;

      if (!outputImageUrl) {
        return await extra.reply('❌ No image URL in API response. Please try again.');
      }

      // Download the result image
      const imageResponse = await axios.get(outputImageUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const resultImageBuffer = Buffer.from(imageResponse.data);

      if (!resultImageBuffer || resultImageBuffer.length === 0) {
        return await extra.reply('❌ Empty image received from API. Please try again.');
      }

      const maxImageSize = 5 * 1024 * 1024; // 5MB
      if (resultImageBuffer.length > maxImageSize) {
        return await extra.reply(
          `❌ Image too large: ${(resultImageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`
        );
      }

      await sock.sendMessage(extra.from, {
        image: resultImageBuffer,
        caption: `✨ *AI Image Editor (MagicEraser)*\n\n📝 Prompt: ${prompt}`,
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Error in gptimage command:', error);
      
      if (error.response) {
        // API error
        const status = error.response.status;
        if (status === 400) {
          return await extra.reply('❌ Bad Request: Invalid parameters. Please check your prompt and image.');
        } else if (status === 429) {
          return await extra.reply('❌ Rate limit exceeded. Please try again later.');
        } else if (status === 500) {
          return await extra.reply('❌ Server error. Please try again later.');
        }
      }
      
      if (error.code === 'ECONNABORTED') {
        return await extra.reply('❌ Request timeout. The image processing took too long. Please try again.');
      }
      
      return await extra.reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
    }
  },
};

