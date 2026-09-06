/**
 * WebP to PNG/MP4 Converter
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { getTempDir, deleteTempFile } = require('./tempManager');

/**
 * Convert WebP sticker to PNG image
 * @param {Buffer} webpBuffer - WebP sticker buffer
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function webp2png(webpBuffer) {
  // Try using sharp first (better for static WebP)
  try {
    const sharp = require('sharp');
    return await sharp(webpBuffer)
      .png()
      .toBuffer();
  } catch (sharpError) {
    // If sharp fails, try FFmpeg
    console.log('Sharp failed, trying FFmpeg:', sharpError.message);
    
    const tempDir = getTempDir();
    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `webp_${timestamp}.webp`);
    const outputPath = path.join(tempDir, `png_${timestamp}.png`);
    
    try {
      // Write WebP buffer to temp file
      fs.writeFileSync(inputPath, webpBuffer);
      
      // Convert WebP to PNG using FFmpeg
      // Extract first frame for both static and animated
      const ffmpegCmd = `"${ffmpegPath}" -i "${inputPath}" -vf "select=eq(n\\,0)" -frames:v 1 -y "${outputPath}"`;
      
      await new Promise((resolve, reject) => {
        exec(ffmpegCmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            console.error('FFmpeg error:', error.message);
            if (stderr) console.error('FFmpeg stderr:', stderr.substring(0, 500));
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      // Read PNG file
      if (!fs.existsSync(outputPath)) {
        throw new Error('PNG output file not found');
      }
      
      const pngBuffer = fs.readFileSync(outputPath);
      
      return pngBuffer;
    } finally {
      // Cleanup temp files
      try {
        deleteTempFile(inputPath);
        deleteTempFile(outputPath);
      } catch (err) {
        console.error('Error cleaning up temp files:', err);
      }
    }
  }
}

/**
 * Convert animated WebP sticker to GIF
 * Since FFmpeg can't decode animated WebP, extract first frame and send as static GIF
 * @param {Buffer} webpBuffer - WebP sticker buffer
 * @returns {Promise<Buffer>} GIF buffer
 */
async function webp2gif(webpBuffer) {
  // Use node-webpmux to extract all frames from animated WebP, then create animated GIF
  const tempDir = getTempDir();
  const timestamp = Date.now();
  const framesDir = path.join(tempDir, `frames_${timestamp}`);
  const outputPath = path.join(tempDir, `gif_${timestamp}.gif`);
  const palettePath = path.join(tempDir, `palette_${timestamp}.png`);
  
  console.log(`[webp2gif] Starting conversion, timestamp: ${timestamp}`);
  console.log(`[webp2gif] Frames directory: ${framesDir}`);
  console.log(`[webp2gif] GIF output path: ${outputPath}`);
  console.log(`[webp2gif] Palette path: ${palettePath}`);
  
  let gifBuffer = null;
  
  try {
    // Create frames directory
    if (!fs.existsSync(framesDir)) {
      fs.mkdirSync(framesDir, { recursive: true });
    }
    
    // Use node-webpmux to extract all frames from animated WebP
    console.log(`[webp2gif] Extracting frames from animated WebP using node-webpmux...`);
    const webp = require('node-webpmux');
    const img = new webp.Image();
    await img.load(webpBuffer);
    
    const frameCount = img.frames ? img.frames.length : 0;
    console.log(`[webp2gif] Found ${frameCount} frames in WebP`);
    
    if (frameCount === 0) {
      // Fallback: single frame WebP, extract using sharp
      console.log(`[webp2gif] No frames found, extracting single frame using sharp...`);
      const sharp = require('sharp');
      const pngBuffer = await sharp(webpBuffer).png().toBuffer();
      const framePath = path.join(framesDir, `frame_0000.png`);
      fs.writeFileSync(framePath, pngBuffer);
    } else {
      // Extract each frame
      const sharp = require('sharp');
      for (let i = 0; i < frameCount; i++) {
        const frame = img.frames[i];
        const frameBuffer = frame.buffer;
        const framePath = path.join(framesDir, `frame_${i.toString().padStart(4, '0')}.png`);
        
        // Convert frame to PNG using sharp
        await sharp(frameBuffer)
          .png()
          .toFile(framePath);
        
        console.log(`[webp2gif] Extracted frame ${i + 1}/${frameCount}`);
      }
    }
    
    // Count actual frame files
    const frameFiles = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_') && f.endsWith('.png')).sort();
    const actualFrameCount = frameFiles.length;
    console.log(`[webp2gif] Extracted ${actualFrameCount} frame files`);
    
    if (actualFrameCount === 0) {
      throw new Error('No frames extracted from WebP');
    }
    
    // Generate palette from all frames
    console.log(`[webp2gif] Generating palette from frames...`);
    const paletteCmd = `"${ffmpegPath}" -framerate 15 -i "${framesDir}/frame_%04d.png" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,palettegen" -y "${palettePath}"`;
    
    await new Promise((resolve, reject) => {
      exec(paletteCmd, { maxBuffer: 10 * 1024 * 1024 }, (error) => {
        if (error) {
          console.error('[webp2gif] Palette generation error:', error.message);
          reject(error);
        } else {
          console.log(`[webp2gif] Palette generated`);
          resolve();
        }
      });
    });
    
    // Verify palette exists before using it
    if (!fs.existsSync(palettePath)) {
      throw new Error('Palette file not found after generation');
    }
    
    // Convert frames to animated GIF using palette
    console.log(`[webp2gif] Converting frames to animated GIF...`);
    const gifCmd = `"${ffmpegPath}" -framerate 15 -i "${framesDir}/frame_%04d.png" -i "${palettePath}" -lavfi "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" -loop 0 -y "${outputPath}"`;
    
    await new Promise((resolve, reject) => {
      exec(gifCmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[webp2gif] GIF conversion error:', error.message);
          if (stderr) console.error('[webp2gif] FFmpeg stderr:', stderr.substring(0, 500));
          reject(error);
        } else {
          console.log(`[webp2gif] FFmpeg conversion completed`);
          resolve();
        }
      });
    });
    
    // Check if file exists before reading
    console.log(`[webp2gif] Checking if GIF file exists...`);
    if (!fs.existsSync(outputPath)) {
      console.error(`[webp2gif] ERROR: GIF output file not found at: ${outputPath}`);
      throw new Error('GIF output file not found');
    }
    
    const fileStats = fs.statSync(outputPath);
    console.log(`[webp2gif] GIF file exists: YES, size: ${fileStats.size} bytes`);
    
    // Read GIF file into buffer BEFORE cleanup
    console.log(`[webp2gif] Reading GIF file into buffer...`);
    gifBuffer = fs.readFileSync(outputPath);
    console.log(`[webp2gif] Buffer read: ${gifBuffer.length} bytes`);
    
    // Verify buffer is valid
    if (!gifBuffer || gifBuffer.length === 0) {
      console.error(`[webp2gif] ERROR: GIF buffer is empty!`);
      throw new Error('GIF buffer is empty');
    }
    
    console.log(`[webp2gif] Buffer validation: OK`);
    
    // Cleanup temp files AFTER reading buffer
    console.log(`[webp2gif] Starting cleanup of temp files...`);
    try {
      // Cleanup frames directory
      if (fs.existsSync(framesDir)) {
        const files = fs.readdirSync(framesDir);
        files.forEach(file => {
          deleteTempFile(path.join(framesDir, file));
        });
        fs.rmdirSync(framesDir);
        console.log(`[webp2gif] Frames directory deleted`);
      }
      if (fs.existsSync(outputPath)) {
        deleteTempFile(outputPath);
        console.log(`[webp2gif] GIF file deleted: ${outputPath}`);
      }
      if (fs.existsSync(palettePath)) {
        deleteTempFile(palettePath);
        console.log(`[webp2gif] Palette file deleted`);
      }
      console.log(`[webp2gif] Cleanup completed`);
    } catch (err) {
      console.error('[webp2gif] Error cleaning up temp files:', err);
    }
    
    console.log(`[webp2gif] Returning buffer, size: ${gifBuffer.length} bytes`);
    return gifBuffer;
  } catch (error) {
    console.error(`[webp2gif] Error occurred: ${error.message}`);
    // Cleanup on error
    try {
      if (fs.existsSync(framesDir)) {
        const files = fs.readdirSync(framesDir);
        files.forEach(file => {
          deleteTempFile(path.join(framesDir, file));
        });
        fs.rmdirSync(framesDir);
        console.log(`[webp2gif] Cleaned up frames directory on error`);
      }
      if (fs.existsSync(outputPath)) {
        deleteTempFile(outputPath);
        console.log(`[webp2gif] Cleaned up GIF on error`);
      }
      if (fs.existsSync(palettePath)) {
        deleteTempFile(palettePath);
        console.log(`[webp2gif] Cleaned up palette on error`);
      }
    } catch (err) {
      console.error('[webp2gif] Error cleaning up temp files on error:', err);
    }
    throw error;
  }
}

/**
 * Convert WebP sticker to MP4 video (for animated stickers)
 * @param {Buffer} webpBuffer - WebP sticker buffer
 * @returns {Promise<Buffer>} MP4 video buffer
 */
async function webp2mp4(webpBuffer) {
  // Extract all frames from animated WebP using node-webpmux, then convert to MP4
  const tempDir = getTempDir();
  const timestamp = Date.now();
  const framesDir = path.join(tempDir, `frames_${timestamp}`);
  const outputPath = path.join(tempDir, `mp4_${timestamp}.mp4`);
  
  let mp4Buffer = null;
  
  try {
    // Create frames directory
    if (!fs.existsSync(framesDir)) {
      fs.mkdirSync(framesDir, { recursive: true });
    }
    
    // Use sharp to extract frames from animated WebP by page number
    const sharp = require('sharp');
    
    // Get metadata to find number of pages (frames)
    const metadata = await sharp(webpBuffer).metadata();
    const frameCount = metadata.pages || metadata.nPages || 1;
    
    // Extract each frame by page number
    for (let i = 0; i < frameCount; i++) {
      try {
        const framePath = path.join(framesDir, `frame_${i.toString().padStart(4, '0')}.png`);
        
        // Extract frame by page number
        await sharp(webpBuffer, { page: i })
          .png()
          .toFile(framePath);
      } catch (frameError) {
        // Continue with other frames
      }
    }
    
    // Count actual frame files
    const frameFiles = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_') && f.endsWith('.png')).sort();
    const actualFrameCount = frameFiles.length;
    
    if (actualFrameCount === 0) {
      throw new Error('No frames extracted from WebP');
    }
    
    // Convert frames to MP4 video
    const mp4Cmd = `"${ffmpegPath}" -framerate 15 -i "${framesDir}/frame_%04d.png" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -fps_mode vfr -y "${outputPath}"`;
    
    await new Promise((resolve, reject) => {
      exec(mp4Cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    
    // Check if file exists before reading
    if (!fs.existsSync(outputPath)) {
      throw new Error('MP4 output file not found');
    }
    
    // Read MP4 file into buffer BEFORE cleanup
    mp4Buffer = fs.readFileSync(outputPath);
    
    // Verify buffer is valid
    if (!mp4Buffer || mp4Buffer.length === 0) {
      throw new Error('MP4 buffer is empty');
    }
    
    // Cleanup temp files AFTER reading buffer
    try {
      // Cleanup frames directory
      if (fs.existsSync(framesDir)) {
        const files = fs.readdirSync(framesDir);
        files.forEach(file => {
          deleteTempFile(path.join(framesDir, file));
        });
        fs.rmdirSync(framesDir);
      }
      if (fs.existsSync(outputPath)) {
        deleteTempFile(outputPath);
      }
    } catch (err) {
      // Silent cleanup error
    }
    
    return mp4Buffer;
  } catch (error) {
    // Cleanup on error
    try {
      if (fs.existsSync(framesDir)) {
        const files = fs.readdirSync(framesDir);
        files.forEach(file => {
          deleteTempFile(path.join(framesDir, file));
        });
        fs.rmdirSync(framesDir);
      }
      if (fs.existsSync(outputPath)) {
        deleteTempFile(outputPath);
      }
    } catch (err) {
      // Silent cleanup error
    }
    throw error;
  }
}

module.exports = {
  webp2png,
  webp2gif,
  webp2mp4
};

