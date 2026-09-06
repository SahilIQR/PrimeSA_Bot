const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const config = require('../config');

async function tryRequire(name){
  try{ return require(name); }catch(e){ return null; }
}

async function downloadYouTubeClip(videoId, opts = {}){
  // opts: preferQuality ['720','480','360'], maxSizeMB
  const ytdl = await tryRequire('ytdl-core');
  if (!ytdl) return { ok:false, reason: 'ytdl-core not installed' };
  const prefer = opts.preferQuality || ['720','480','360'];
  const maxSizeMB = opts.maxSizeMB || (config.maxClipSizeMB || 12);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try{
    const info = await ytdl.getInfo(url);
    // choose format
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    // sort by quality
    formats.sort((a,b)=> (b.height||0)-(a.height||0));
    // try preferred qualities
    let chosen = null;
    for(const q of prefer){
      chosen = formats.find(f => String(f.height) === String(q) && f.container === 'mp4');
      if (chosen) break;
    }
    if(!chosen) chosen = formats.find(f => f.container==='mp4') || formats[0];
    // estimate size
    const contentLength = parseInt(chosen.contentLength || 0);
    if (contentLength && contentLength > maxBytes) {
      return { ok:false, reason: 'too_large', size: contentLength };
    }

    // stream to temp file
    const tmp = path.join(os.tmpdir(), `clip_${videoId}_${Date.now()}.${chosen.container || 'mp4'}`);
    const read = ytdl(url, { format: chosen });
    const write = fs.createWriteStream(tmp);
    let received = 0;
    read.on('data', chunk=>{
      received += chunk.length;
      if(received > maxBytes){
        // abort
        try{ read.destroy(); }catch(e){}
        try{ write.destroy(); }catch(e){}
      }
    });
    await streamPipeline(read, write);
    const stats = fs.statSync(tmp);
    if (stats.size > maxBytes){
      try{ fs.unlinkSync(tmp); }catch(e){}
      return { ok:false, reason:'too_large_after_download', size: stats.size };
    }
    return { ok:true, path: tmp, url, info, format: chosen, size: stats.size };
  }catch(e){
    return { ok:false, reason: e?.message || e };
  }
}

module.exports = { downloadYouTubeClip };
