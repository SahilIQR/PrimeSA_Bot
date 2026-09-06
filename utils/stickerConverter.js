/**
 * Sticker Converter using FFmpeg
 */

const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);
const { getTempDir, deleteTempFile } = require('./tempManager');

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Convert image/video to sticker using ffmpeg
 */
const convertToSticker = async (mediaBuffer, options = {}) => {
  // Check file size
  if (mediaBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const tempDir = getTempDir();
  const inputPath = path.join(tempDir, `input_${Date.now()}.${options.isVideo ? 'mp4' : 'jpg'}`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.webp`);
  const tempFiles = [inputPath, outputPath];
  
  try {
    // Write input buffer to temp file
    fs.writeFileSync(inputPath, mediaBuffer);
    
    // Convert using ffmpeg
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .outputOptions([
          '-vf', 'scale=512:512:force_original_aspect_ratio=decrease',
          '-quality', '90',
          '-compression_level', '6',
          '-loop', '0'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });
    
    // Read output file
    const stickerBuffer = fs.readFileSync(outputPath);
    
    return stickerBuffer;
  } catch (error) {
    throw new Error(`Sticker conversion failed: ${error.message}`);
  } finally {
    // Always cleanup temp files
    tempFiles.forEach(file => deleteTempFile(file));
  }
};

/**
 * Add metadata to sticker (packname, author) using node-webpmux
 * Note: Stickers will work without metadata, but won't show packname/author
 */
const addStickerMetadata = async (stickerBuffer, packname, author) => {
  try {
    const webpmux = require('node-webpmux');
    const Image = await webpmux.Image.init(stickerBuffer);
    
    // WhatsApp stickers store metadata in EXIF as JSON
    const metadata = {
      'sticker-pack-name': packname || 'Made by',
      'sticker-pack-publisher': author || 'MD Bot'
    };
    
    // Convert metadata to EXIF format
    const exifData = Buffer.from(JSON.stringify(metadata), 'utf-8');
    Image.exif = exifData;
    
    // Save and return buffer with metadata
    const newBuffer = await Image.save();
    return newBuffer;
  } catch (error) {
    // If metadata addition fails, return original buffer
    // Stickers will still work, just without packname/author display
    console.warn('Could not add sticker metadata (sticker will work without it):', error.message);
    return stickerBuffer;
  }
};

/**
 * Process media to sticker with metadata
 */
const createSticker = async (mediaBuffer, isVideo = false, packname = 'Made by', author = 'MD Bot') => {
  try {
    // Convert to webp sticker
    let stickerBuffer = await convertToSticker(mediaBuffer, { isVideo });
    
    // Add metadata
    stickerBuffer = await addStickerMetadata(stickerBuffer, packname, author);
    
    return stickerBuffer;
  } catch (error) {
    throw new Error(`Failed to create sticker: ${error.message}`);
  }
};

module.exports = {
  convertToSticker,
  addStickerMetadata,
  createSticker
};

