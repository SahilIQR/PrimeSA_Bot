/**
 * EXIF Metadata Utilities for Stickers
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webp = require('node-webpmux');
const { getTempDir, deleteTempFile } = require('./tempManager');

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Write EXIF metadata to image sticker
 */
async function writeExifImg(img, metadata) {
  const { packname } = metadata;
  
  const imgWebp = new webp.Image();
  await imgWebp.load(img);
  
  const json = {
    'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
    'sticker-pack-name': packname || 'PrimeSA Bot',
    emojis: ['🤖'],
  };
  
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  
  imgWebp.exif = exif;
  return await imgWebp.save(null);
}

/**
 * Write EXIF metadata to video sticker (convert mp4 to webp with metadata)
 */
async function writeExifVid(videoBuffer, metadata) {
  const { packname } = metadata;
  const ffmpegPath = require('ffmpeg-static');
  const { spawn } = require('child_process');
  
  // Check file size
  if (videoBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }
  
  const tempDir = getTempDir();
  const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.webp`);
  const tempFiles = [inputPath, outputPath];
  
  try {
    // Write video buffer to temp file
    fs.writeFileSync(inputPath, videoBuffer);
    
    // Convert mp4 to webp using ffmpeg
    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        '-y',
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
        '-c:v', 'libwebp',
        '-preset', 'default',
        '-loop', '0',
        '-vsync', '0',
        '-pix_fmt', 'yuva420p',
        '-quality', '75',
        '-compression_level', '6',
        outputPath
      ]);
      
      const errors = [];
      ff.stderr.on('data', (e) => errors.push(e));
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
      });
    });
    
    // Read webp file
    const webpBuffer = fs.readFileSync(outputPath);
    
    // Add metadata
    const imgWebp = new webp.Image();
    await imgWebp.load(webpBuffer);
    
    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': packname || 'PrimeSA Bot',
      emojis: ['🤖'],
    };
    
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    
    imgWebp.exif = exif;
    const finalBuffer = await imgWebp.save(null);
    
    return finalBuffer;
  } catch (error) {
    throw error;
  } finally {
    // Always cleanup temp files
    tempFiles.forEach(file => deleteTempFile(file));
  }
}

module.exports = {
  writeExifImg,
  writeExifVid
};


