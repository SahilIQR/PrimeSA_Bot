/**
 * Instagram to Sticker Commands
 * igs - Convert Instagram media to sticker (with padding, maintains aspect ratio)
 * igsc - Convert Instagram media to cropped square sticker
 */

const { igdl } = require('ruhend-scraper');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');
const crypto = require('crypto');
const config = require('../../config');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

// Function to extract unique media URLs (same as .ig command)
function extractUniqueMedia(mediaData) {
  const uniqueMedia = [];
  const seenUrls = new Set();
  
  for (const media of mediaData) {
    if (!media.url) continue;
    
    // Only check for exact URL duplicates
    if (!seenUrls.has(media.url)) {
      seenUrls.add(media.url);
      uniqueMedia.push(media);
    }
  }
  
  return uniqueMedia;
}

// Extract Instagram CDN URL from proxy JWT token
function extractInstagramUrl(proxyUrl) {
  try {
    // Extract token from URL: https://d.rapidcdn.app/v2?token=JWT_TOKEN&dl=1
    const urlObj = new URL(proxyUrl);
    const token = urlObj.searchParams.get('token');
    if (!token) return null;
    
    // Decode JWT (it's base64url encoded)
    const parts = token.split('.');
    if (parts.length < 2) return null;
    
    // Decode payload (second part)
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    
    // Extract the Instagram CDN URL from payload.url
    if (payload.url && typeof payload.url === 'string' && payload.url.startsWith('http')) {
      return payload.url;
    }
  } catch (e) {
    // If decoding fails, return null (fallback to proxy URL)
  }
  return null;
}

// Pick the best URL from media object (prefers direct Instagram CDN URLs over proxy)
function pickMediaUrl(media) {
  if (!media) return null;
  
  // Try in order of preference
  const candidates = [
    media.downloadUrl,
    media.url,
    media.original,
    media.mediaUrl,
    media.videoUrl,
    media.imageUrl,
    media.urls?.[0]
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
      // If it's a rapidcdn proxy URL, extract the Instagram CDN URL
      if (candidate.includes('rapidcdn.app') && candidate.includes('token=')) {
        const instagramUrl = extractInstagramUrl(candidate);
        if (instagramUrl) {
          return instagramUrl; // Use direct Instagram CDN URL
        }
      }
      // Otherwise use the URL as-is
      return candidate;
    }
  }
  
  return null;
}

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;
// Max media duration: 5 minutes
const MAX_DURATION_SECONDS = 5 * 60;

// Convert buffer to sticker webp
async function convertBufferToStickerWebp(inputBuffer, isAnimated, cropSquare) {
  // Check file size
  if (inputBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const tmpDir = getTempDir();
  const tempInputBase = path.join(tmpDir, `igs_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tempInput = isAnimated ? `${tempInputBase}.mp4` : `${tempInputBase}.jpg`;
  const tempOutput = path.join(tmpDir, `igs_out_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);

  const tempFiles = [tempInput, tempOutput];

  try {
    fs.writeFileSync(tempInput, inputBuffer);

    // Image filters
    const vfCropSquareImg = "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512";
    const vfPadSquareImg = "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000";

    let ffmpegCommand;
    if (isAnimated) {
    // For videos/GIFs - aggressive compression from start
    const isLargeVideo = inputBuffer.length > (3 * 1024 * 1024); // >3MB threshold lowered
    // Always use max 2 seconds, lower fps, lower quality
    if (cropSquare) {
      ffmpegCommand = `ffmpeg -y -i "${tempInput}" -t 2 -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=6" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 25 -compression_level 6 -b:v 60k -max_muxing_queue_size 1024 "${tempOutput}"`;
    } else {
      ffmpegCommand = `ffmpeg -y -i "${tempInput}" -t 2 -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=6" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 25 -compression_level 6 -b:v 60k -max_muxing_queue_size 1024 "${tempOutput}"`;
    }
  } else {
    // For images - lower quality
    const vf = `${cropSquare ? vfCropSquareImg : vfPadSquareImg},format=rgba`;
      ffmpegCommand = `ffmpeg -y -i "${tempInput}" -vf "${vf}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 60 -compression_level 6 "${tempOutput}"`;
    }

    await new Promise((resolve, reject) => {
      exec(ffmpegCommand, (error, _stdout, _stderr) => {
        if (error) return reject(error);
        resolve();
      });
    });

    // Check file size and re-encode with more aggressive settings if needed
    let webpBuffer = fs.readFileSync(tempOutput);
    
    // Progressive compression: keep reducing until under 1MB
    let attempts = 0;
    const maxAttempts = 8; // Increased attempts
    while (webpBuffer.length > 950 * 1024 && attempts < maxAttempts) {
    attempts++;
    try {
      const tempOutput2 = path.join(tmpDir, `igs_out${attempts}_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
      tempFiles.push(tempOutput2);
      let harsherCmd;
      
      if (isAnimated) {
        // Progressively reduce more aggressively
        const fps = Math.max(3, 6 - attempts);
        const quality = Math.max(10, 25 - (attempts * 3));
        const bitrate = Math.max(30, 60 - (attempts * 5));
        const duration = Math.max(0.5, 2 - (attempts * 0.25));
        const size = attempts <= 2 ? 512 : (attempts <= 4 ? 400 : (attempts <= 6 ? 320 : 256));
        
        if (cropSquare) {
          harsherCmd = `ffmpeg -y -i "${tempInput}" -t ${duration} -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size},fps=${fps}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 -b:v ${bitrate}k -max_muxing_queue_size 1024 "${tempOutput2}"`;
        } else {
          harsherCmd = `ffmpeg -y -i "${tempInput}" -t ${duration} -vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=${fps}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 -b:v ${bitrate}k -max_muxing_queue_size 1024 "${tempOutput2}"`;
        }
      } else {
        // For images: reduce quality and resolution progressively
        const quality = Math.max(30, 60 - (attempts * 5));
        const size = attempts === 1 ? 512 : (attempts === 2 ? 400 : (attempts === 3 ? 320 : (attempts === 4 ? 256 : 200)));
        const vf = cropSquare
          ? `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size},format=rgba`
          : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba`;
        harsherCmd = `ffmpeg -y -i "${tempInput}" -vf "${vf}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 "${tempOutput2}"`;
      }
      
      await new Promise((resolve, reject) => {
        exec(harsherCmd, (error) => error ? reject(error) : resolve());
      });
      
      if (fs.existsSync(tempOutput2)) {
        const newBuffer = fs.readFileSync(tempOutput2);
        webpBuffer = newBuffer; // Always use new buffer if it exists
      }
    } catch (e) {
      // Continue trying even on error
      if (attempts >= maxAttempts) break;
      }
    }

    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': config.packname || 'Made by',
      'emojis': ['📸']
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;

    let finalBuffer = await img.save(null);

    // Absolute final safety: if still too large, force ultra-mini sticker
    if (finalBuffer.length > 950 * 1024) {
    try {
      // Try progressively smaller sizes until under 1MB
      const sizes = [256, 200, 180, 160, 128];
      for (const size of sizes) {
        const tempOutput3 = path.join(tmpDir, `igs_mini_${size}_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
        tempFiles.push(tempOutput3);
        const vfSmall = cropSquare
          ? `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size}${isAnimated ? ',fps=3' : ''}`
          : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000${isAnimated ? ',fps=3' : ''}`;
        const cmdSmall = `ffmpeg -y -i "${tempInput}" ${isAnimated ? '-t 0.5' : ''} -vf "${vfSmall}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${isAnimated ? 15 : 30} -compression_level 6 -b:v 30k -max_muxing_queue_size 1024 "${tempOutput3}"`;
        await new Promise((resolve, reject) => {
          exec(cmdSmall, (error) => error ? reject(error) : resolve());
        });
        if (fs.existsSync(tempOutput3)) {
          const smallWebp = fs.readFileSync(tempOutput3);
          const img2 = new webp.Image();
          await img2.load(smallWebp);
          const json2 = {
            'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
            'sticker-pack-name': config.packname || 'Made by',
            'emojis': ['📸']
          };
          const exifAttr2 = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
          const jsonBuffer2 = Buffer.from(JSON.stringify(json2), 'utf8');
          const exif2 = Buffer.concat([exifAttr2, jsonBuffer2]);
          exif2.writeUIntLE(jsonBuffer2.length, 14, 4);
          img2.exif = exif2;
          const newFinalBuffer = await img2.save(null);
          if (newFinalBuffer.length <= 950 * 1024) {
            finalBuffer = newFinalBuffer;
            break; // Found a size that works
          }
        }
      }
    } catch {}
    }

    return finalBuffer;
  } finally {
    // Always cleanup temp files
    tempFiles.forEach(file => deleteTempFile(file));
  }
}

// Fetch buffer from URL with validation and retry logic
async function fetchBufferFromUrl(url, itemIndex = 0) {
  const maxRetries = 3;
  
  // Standard headers for first attempt
  const standardHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  // Instagram headers for retry attempts
  const instagramHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  // Check if buffer contains HTML (blocked response)
  function isHtmlResponse(buffer) {
    if (!buffer || buffer.length < 10) return false;
    const start = buffer.toString('utf8', 0, 100).toLowerCase().trim();
    return start.startsWith('<!doctype html') || start.startsWith('<html');
  }
  
  // Validate content-type header
  function isValidContentType(contentType) {
    if (!contentType) return true; // Allow missing content-type (some servers don't send it)
    const ct = contentType.toLowerCase();
    // Accept image/*, video/*, and application/octet-stream (common for binary media from CDNs)
    return ct.startsWith('image/') || ct.startsWith('video/') || ct === 'application/octet-stream';
  }
  
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers = attempt === 0 ? standardHeaders : instagramHeaders;
      const axiosConfig = {
        responseType: 'arraybuffer',
        headers: headers,
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        decompress: true,
        maxRedirects: 5, // Always allow redirects - Instagram URLs often redirect
        validateStatus: s => s >= 200 && s < 300 // ONLY accept 2xx responses (not 3xx redirects)
      };
      
      const res = await axios.get(url, axiosConfig);
      const buffer = Buffer.from(res.data);
      
      // Validate content-type header
      const contentType = res.headers['content-type'];
      if (!isValidContentType(contentType)) {
        throw new Error(`Invalid content-type: ${contentType} (expected image/* or video/*)`);
      }
      
      // Check if response is HTML (blocked)
      if (isHtmlResponse(buffer)) {
        throw new Error('Response is HTML (blocked/login required)');
      }
      
      // Success - return valid media buffer
      return buffer;
      
    } catch (error) {
      lastError = error;
      
      // If last attempt, try stream mode as fallback
      if (attempt === maxRetries - 1) {
        try {
          const headers = instagramHeaders;
          const res = await axios.get(url, {
            responseType: 'stream',
            headers: headers,
            timeout: 40000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            maxRedirects: 5,
            validateStatus: s => s >= 200 && s < 300 // ONLY accept 2xx responses
          });
          
          const chunks = [];
          await new Promise((resolve, reject) => {
            res.data.on('data', c => chunks.push(c));
            res.data.on('end', resolve);
            res.data.on('error', reject);
          });
          
          const buffer = Buffer.concat(chunks);
          
          // Validate stream response too
          const contentType = res.headers['content-type'];
          if (!isValidContentType(contentType)) {
            throw new Error(`Invalid content-type: ${contentType}`);
          }
          
          if (isHtmlResponse(buffer)) {
            throw new Error('Stream response is HTML (blocked/login required)');
          }
          
          return buffer;
        } catch (streamError) {
          throw new Error(`Failed to download media after ${maxRetries} attempts: ${lastError?.message || lastError}`);
        }
      }
      
      // Wait a bit before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
      }
    }
  }
  
  throw new Error(`Failed to download media after ${maxRetries} attempts: ${lastError?.message || lastError}`);
}

// Extreme fallback to force very small stickers when needed
async function forceMiniSticker(inputBuffer, isVideo, cropSquare) {
  const tmpDir = getTempDir();
  const tempFiles = [];

  try {
    // Try multiple sizes progressively
    for (const size of [256, 200, 180, 160]) {
      const tempInput = path.join(tmpDir, `mini_${size}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`);
      const tempOutput = path.join(tmpDir, `mini_out_${size}_${Date.now()}.webp`);
      tempFiles.push(tempInput, tempOutput);
      
      try {
        fs.writeFileSync(tempInput, inputBuffer);

        const vf = cropSquare
          ? `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size}${isVideo ? ',fps=3' : ''}`
          : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000${isVideo ? ',fps=3' : ''}`;

        const cmd = `ffmpeg -y -i "${tempInput}" ${isVideo ? '-t 0.5' : ''} -vf "${vf}" -c:v libwebp -preset default -loop 0 -pix_fmt yuva420p -quality ${isVideo ? 15 : 30} -compression_level 6 -b:v 30k "${tempOutput}"`;
        
        await new Promise((resolve, reject) => {
          exec(cmd, (error) => error ? reject(error) : resolve());
        });

        if (fs.existsSync(tempOutput)) {
          const smallWebp = fs.readFileSync(tempOutput);
          
          if (smallWebp.length <= 950 * 1024) {
            // Add metadata
            const img = new webp.Image();
            await img.load(smallWebp);
            const json = {
              'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
              'sticker-pack-name': config.packname || 'Made by',
              'emojis': ['📸']
            };
            const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
            const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
            const exif = Buffer.concat([exifAttr, jsonBuffer]);
            exif.writeUIntLE(jsonBuffer.length, 14, 4);
            img.exif = exif;
            const finalBuffer = await img.save(null);
            return finalBuffer; // Found a size that works
          }
        }
      } catch (e) {
        // Continue to next size
      }
    }
    
    return null;
  } finally {
    // Always cleanup temp files
    tempFiles.forEach(file => deleteTempFile(file));
  }
}

// Main command handler
async function igsCommand(sock, msg, args, extra, crop = false) {
  try {
    const text = (args && args.length ? args.join(' ') : null) || msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    const urlMatch = (text || '').match(/https?:\/\/\S+/);
    if (!urlMatch) {
      return extra.reply(`Send an Instagram post/reel link.\nUsage:\n.igs <url>\n.igsc <url>`);
    }

    await sock.sendMessage(extra.from, { react: { text: '📥', key: msg.key } });

    const downloadData = await igdl(urlMatch[0]).catch(() => null);
    if (!downloadData || !downloadData.data) {
      return extra.reply('❌ Failed to fetch media from Instagram link.');
    }
    
    // Get all media items from scraper - process in order without URL deduplication
    // The scraper returns items in sequence, so we should process them as-is
    const mediaData = downloadData.data || [];
    const rawItems = mediaData.filter(m => m && pickMediaUrl(m));
    
    // Limit to maximum 10 items for stickers
    const items = rawItems.slice(0, 10);
    
    if (items.length === 0) {
      return extra.reply('❌ No media found at the provided link.');
    }

    const maxItems = items.length;
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const seenHashes = new Set(); // Track content hashes to prevent sending duplicates
    
    // Process all items sequentially
    for (let i = 0; i < maxItems; i++) {
      try {
        const media = items[i];
        
        // Pick the best URL from media object
        const mediaUrl = pickMediaUrl(media);
        if (!mediaUrl) {
          skippedCount++;
          continue;
        }
        
        const isVideo = (media?.type === 'video') || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl);

        const buffer = await fetchBufferFromUrl(mediaUrl, i);
        
        // Check if we've already sent this exact content (by hash)
        const contentHash = crypto.createHash('md5').update(buffer).digest('hex');
        if (seenHashes.has(contentHash)) {
          // Skip sending duplicate content, but continue processing other items
          skippedCount++;
          continue;
        }
        seenHashes.add(contentHash);
        
        let stickerBuffer = await convertBufferToStickerWebp(buffer, isVideo, crop);

        // Ensure final size under 1MB; keep trying until it works
        let finalSticker = stickerBuffer;
        if (finalSticker.length > 950 * 1024) {
          try {
            const fallback = await forceMiniSticker(buffer, isVideo, crop);
            if (fallback) {
              finalSticker = fallback;
            }
          } catch (e) {
            // Silently continue
          }
        }

        // If still too large, try one more ultra-aggressive compression
        if (finalSticker.length > 950 * 1024) {
          const tmpDir = getTempDir();
          const tempInput2 = path.join(tmpDir, `ultra_${Date.now()}_${i}.${isVideo ? 'mp4' : 'jpg'}`);
          const tempOutputUltra = path.join(tmpDir, `ultra_out_${Date.now()}_${i}.webp`);
          const ultraTempFiles = [tempInput2, tempOutputUltra];
          
          try {
            fs.writeFileSync(tempInput2, buffer);
            
            const ultraSize = 180;
            const vfUltra = crop
              ? `crop=min(iw\\,ih):min(iw\\,ih),scale=${ultraSize}:${ultraSize}${isVideo ? ',fps=3' : ''}`
              : `scale=${ultraSize}:${ultraSize}:force_original_aspect_ratio=decrease,pad=${ultraSize}:${ultraSize}:(ow-iw)/2:(oh-ih)/2:color=#00000000${isVideo ? ',fps=3' : ''}`;
            const ultraCmd = `ffmpeg -y -i "${tempInput2}" ${isVideo ? '-t 0.5' : ''} -vf "${vfUltra}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${isVideo ? 12 : 25} -compression_level 6 -b:v 25k -max_muxing_queue_size 1024 "${tempOutputUltra}"`;
            
            await new Promise((resolve, reject) => {
              exec(ultraCmd, (error) => error ? reject(error) : resolve());
            });
            
            if (fs.existsSync(tempOutputUltra)) {
              const ultraWebp = fs.readFileSync(tempOutputUltra);
              const imgUltra = new webp.Image();
              await imgUltra.load(ultraWebp);
              const jsonUltra = {
                'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
                'sticker-pack-name': config.packname || 'Made by',
                'emojis': ['📸']
              };
              const exifAttrUltra = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
              const jsonBufferUltra = Buffer.from(JSON.stringify(jsonUltra), 'utf8');
              const exifUltra = Buffer.concat([exifAttrUltra, jsonBufferUltra]);
              exifUltra.writeUIntLE(jsonBufferUltra.length, 14, 4);
              imgUltra.exif = exifUltra;
              finalSticker = await imgUltra.save(null);
            }
          } catch (e) {
            // Silently continue
          } finally {
            // Always cleanup ultra temp files
            ultraTempFiles.forEach(file => deleteTempFile(file));
          }
        }

        // Send the sticker (even if slightly over, WhatsApp might accept it)
        try {
          await sock.sendMessage(extra.from, { sticker: finalSticker }, { quoted: msg });
          successCount++;
        } catch (sendErr) {
          failCount++;
          // Continue to next item even if send fails
        }

        // Small delay to avoid rate limiting (process sequentially)
        if (i < maxItems - 1) {
          await new Promise(r => setTimeout(r, 800));
        }
      } catch (perItemErr) {
        failCount++;
        // Continue with next item - don't stop processing
      }
    }
  } catch (err) {
    console.error('Error in igs command:', err);
    await extra.reply('❌ Failed to create sticker from Instagram link.');
  }
}

module.exports = {
  name: 'igs',
  aliases: ['igsticker'],
  description: 'Convert Instagram post/reel to sticker (maintains aspect ratio with padding)',
  usage: '.igs <Instagram URL>',
  category: 'media',
  
  async execute(sock, msg, args, extra) {
    await igsCommand(sock, msg, args, extra, false);
  }
};

