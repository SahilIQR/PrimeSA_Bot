/**
 * Sticker Creation Utilities
 */

const { Sticker, createSticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const config = require('../config');

/**
 * Create sticker from image/video buffer
 */
const createStickerBuffer = async (media, options = {}) => {
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname,
      author: options.author || config.author,
      type: options.type || StickerTypes.FULL,
      categories: options.categories || ['🤖'],
      id: options.id || '',
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Sticker creation failed: ${error.message}`);
  }
};

/**
 * Create cropped sticker
 */
const createCroppedSticker = async (media, options = {}) => {
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname,
      author: options.author || config.author,
      type: StickerTypes.CROPPED,
      categories: options.categories || ['🤖'],
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Cropped sticker creation failed: ${error.message}`);
  }
};

/**
 * Create circle sticker
 */
const createCircleSticker = async (media, options = {}) => {
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname,
      author: options.author || config.author,
      type: StickerTypes.CIRCLE,
      categories: options.categories || ['🤖'],
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Circle sticker creation failed: ${error.message}`);
  }
};

/**
 * Convert sticker to image
 */
const stickerToImage = async (stickerBuffer) => {
  try {
    const imageBuffer = await sharp(stickerBuffer)
      .png()
      .toBuffer();
    
    return imageBuffer;
  } catch (error) {
    throw new Error(`Sticker to image conversion failed: ${error.message}`);
  }
};

module.exports = {
  createStickerBuffer,
  createCroppedSticker,
  createCircleSticker,
  stickerToImage
};
