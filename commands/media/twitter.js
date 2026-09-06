/**
 * Twitter / X Downloader
 */

const axios = require('axios');
const config = require('../../config');

const TWITTER_PATTERNS = [
  /https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i,
  /https?:\/\/(?:mobile\.)?twitter\.com\//i,
];

const processedMessages = new Set();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

function isValidTwitterUrl(url) {
  return TWITTER_PATTERNS.some((pattern) => pattern.test(url));
}

function isMediaUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && !/error|cannot be null/i.test(url);
}

function caption(quality) {
  const bot = config.botName.toUpperCase();
  let text = `*DOWNLOADED BY ${bot}*`;
  if (quality) text += `\n\n📹 Quality: ${quality}`;
  return text;
}

async function fetchElite(url) {
  const { data } = await axios.get('https://eliteprotech-apis.zone.id/x', {
    params: { url },
    timeout: 30000,
    headers: HEADERS,
  });

  if (data?.status !== 'success') throw new Error('Primary API returned no success');

  const videos = (data.videos || []).filter((v) => isMediaUrl(v?.url));
  const mp3Url = isMediaUrl(data.mp3?.url) ? data.mp3.url : null;
  const thumbnail = isMediaUrl(data.thumbnail) ? data.thumbnail : null;

  if (!videos.length && !thumbnail && !mp3Url) throw new Error('No media in primary response');

  return { videos, mp3Url, thumbnail };
}

async function fetchPrince(url) {
  const { data } = await axios.get('https://api.princetechn.com/api/download/twitter', {
    params: { apikey: 'prince', url },
    timeout: 30000,
    headers: HEADERS,
  });

  if (!data?.success) throw new Error('Fallback API failed');

  const result = data.result || {};
  const videos = (result.videoUrls || []).filter((v) => isMediaUrl(v?.url));
  const thumbnail = isMediaUrl(result.thumbnail) ? result.thumbnail : null;

  if (!videos.length && !thumbnail) throw new Error('No media in fallback response');

  return { videos, mp3Url: null, thumbnail };
}

async function resolveMedia(url) {
  try {
    return await fetchElite(url);
  } catch (err) {
    console.error('[twitter] Elite API:', err.message);
  }
  return fetchPrince(url);
}

function pickBestVideo(videos) {
  if (!videos.length) return null;

  const scored = videos.map((v) => {
    const label = String(v.quality || v.label || '');
    const match = label.match(/(\d{3,4})p/i);
    return { url: v.url, quality: label || 'best', score: match ? parseInt(match[1], 10) : 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

async function sendVideo(sock, jid, msg, videoUrl, quality) {
  const cap = caption(quality);
  try {
    // Check size first
    try {
      const head = await axios.head(videoUrl, { timeout: 8000, maxRedirects: 5 });
      const cl = head.headers['content-length'];
      const maxBytes = (config.videoMaxMB || 50) * 1024 * 1024;
      if (cl && parseInt(cl, 10) > maxBytes) {
        await sock.sendMessage(jid, { text: `Video too large to send (${Math.round(parseInt(cl,10)/1024/1024)}MB). Download here: ${videoUrl}` }, { quoted: msg });
        return;
      }
    } catch (e) {
      // proceed to try sending by URL; head failures are not fatal
    }

    await sock.sendMessage(jid, {
      video: { url: videoUrl },
      mimetype: 'video/mp4',
      caption: cap,
    }, { quoted: msg });
    return;
  } catch {
    const res = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      headers: { ...HEADERS, Referer: 'https://x.com/' },
    });
    await sock.sendMessage(jid, {
      video: Buffer.from(res.data),
      mimetype: 'video/mp4',
      caption: cap,
    }, { quoted: msg });
  }
}

async function sendImage(sock, jid, msg, imageUrl) {
  const cap = caption();
  try {
    await sock.sendMessage(jid, { image: { url: imageUrl }, caption: cap }, { quoted: msg });
    return;
  } catch {
    const res = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { ...HEADERS, Referer: 'https://x.com/' },
    });
    await sock.sendMessage(jid, { image: Buffer.from(res.data), caption: cap }, { quoted: msg });
  }
}

async function sendAudio(sock, jid, msg, audioUrl) {
  const cap = caption('128kbps MP3');
  try {
    await sock.sendMessage(jid, {
      audio: { url: audioUrl },
      mimetype: 'audio/mpeg',
      caption: cap,
    }, { quoted: msg });
    return;
  } catch {
    const res = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      headers: HEADERS,
    });
    await sock.sendMessage(jid, {
      document: Buffer.from(res.data),
      mimetype: 'audio/mpeg',
      fileName: 'twitter_audio.mp3',
      caption: cap,
    }, { quoted: msg });
  }
}

module.exports = {
  name: 'twitter',
  aliases: ['x', 'xdl', 'twitterdl', 'twdl'],
  category: 'media',
  description: 'Download Twitter / X videos and images',
  usage: ',twitter <X URL>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || args.join(' ');

      const url = text.replace(/^[^\s]+\s*/, '').trim();

      if (!url) {
        return extra.reply('Please provide a Twitter / X link.\n\nUsage: `,twitter <url>`');
      }

      if (!isValidTwitterUrl(url)) {
        return extra.reply('❌ Invalid link. Use a valid `x.com` or `twitter.com` post URL.');
      }

      await sock.sendMessage(extra.from, { react: { text: '🔄', key: msg.key } });

      const media = await resolveMedia(url);
      const best = pickBestVideo(media.videos);

      if (best) {
        await sendVideo(sock, extra.from, msg, best.url, best.quality);
        return;
      }

      if (media.thumbnail) {
        await sendImage(sock, extra.from, msg, media.thumbnail);
        return;
      }

      if (media.mp3Url) {
        await sendAudio(sock, extra.from, msg, media.mp3Url);
        return;
      }

      return extra.reply('❌ No downloadable media found for this post.');
    } catch (error) {
      console.error('[twitter]', error.message);
      await extra.reply('❌ Failed to download from Twitter / X. Try another link or try again later.');
    }
  },
};
