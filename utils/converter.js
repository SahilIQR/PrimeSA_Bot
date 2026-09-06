/**
 * PrimeSA Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

let ffmpegPath = 'ffmpeg'
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg'
} catch { /* use system ffmpeg */ }

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, '../temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      let tmp = path.join(tempDir, Date.now() + '.' + ext)
      let out = tmp + '.' + ext2
      await fs.promises.writeFile(tmp, buffer)
      const child = spawn(ffmpegPath, [
        '-y',
        '-i', tmp,
        ...args,
        out
      ]);

      let finished = false;

      const cleanupFiles = async () => {
        try { if (fs.existsSync(tmp)) await fs.promises.unlink(tmp); } catch (e) { }
        try { if (fs.existsSync(out)) await fs.promises.unlink(out); } catch (e) { }
      };

      child.on('error', async (err) => {
        try { await cleanupFiles(); } catch (_) { }
        if (!finished) {
          finished = true;
          reject(err);
        }
      });

      child.on('close', async (code) => {
        try {
          // Always attempt to remove tmp first
          if (fs.existsSync(tmp)) await fs.promises.unlink(tmp);
          if (code !== 0) {
            // Ensure out is cleaned up on failure
            if (fs.existsSync(out)) await fs.promises.unlink(out);
            if (!finished) { finished = true; return reject(new Error('ffmpeg exit code ' + code)); }
            return;
          }
          const data = await fs.promises.readFile(out);
          // Remove the output file after reading it
          try { if (fs.existsSync(out)) await fs.promises.unlink(out); } catch (_) { }
          if (!finished) { finished = true; resolve(data); }
        } catch (e) {
          try { await cleanupFiles(); } catch (_) { }
          if (!finished) { finished = true; reject(e); }
        }
      });
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Convert Audio to Playable WhatsApp Audio
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac', '2',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'mp3'
  ], ext, 'mp3')
}

/**
 * Convert Audio to Playable WhatsApp PTT
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    '-compression_level', '10'
  ], ext, 'opus')
}

/**
 * Convert Audio to Playable WhatsApp Video
 * @param {Buffer} buffer Video Buffer
 * @param {String} ext File Extension 
 */
function toVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ab', '128k',
    '-ar', '44100',
    '-crf', '32',
    '-preset', 'slow'
  ], ext, 'mp4')
}

module.exports = {
  toAudio,
  toPTT,
  toVideo,
  ffmpeg,
}