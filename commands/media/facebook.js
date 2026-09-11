const axios = require('axios');
const config = require('../../config');

module.exports = {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    category: 'media',
    description: 'Download Facebook videos',
    usage: '.facebook <facebook link>',

    async execute(sock, msg, args, extra) {

        const url = args.join(' ').trim();

        if (!url) {
            return extra.reply(
                `❌ Please provide a Facebook video link.\n\nExample:\n.facebook https://facebook.com/...`
            );
        }

        await sock.sendMessage(extra.from, {
            react: {
                text: '⏳',
                key: msg.key
            }
        });


        // Helper: collect video candidates from response object (returns array)
        const collectVideoCandidates = (obj, out = []) => {
            if (!obj) return out;
            if (typeof obj === 'string') {
                const s = obj;
                if (s.match(/https?:\/\/[^\s'"]+\.(mp4|m3u8)(\?|$)/i)) out.push({ url: s });
                if (s.includes('fbcdn',) && s.includes('video')) out.push({ url: s });
                if (s.includes('playable_url')) out.push({ url: s });
                return out;
            }
            if (Array.isArray(obj)) {
                for (const item of obj) collectVideoCandidates(item, out);
                return out;
            }
            if (typeof obj === 'object') {
                // common well-formed properties
                if (obj.hd) out.push({ url: obj.hd, quality: 'hd', width: obj.width, height: obj.height, bitrate: obj.bitrate });
                if (obj.sd) out.push({ url: obj.sd, quality: 'sd', width: obj.width, height: obj.height, bitrate: obj.bitrate });
                if (obj.url) out.push({ url: obj.url, quality: obj.quality || null, width: obj.width, height: obj.height, bitrate: obj.bitrate });
                for (const k of Object.keys(obj)) collectVideoCandidates(obj[k], out);
            }
            return out;
        };

        // Helper: try to scrape the facebook page HTML for hd_src or sd_src (with retries)
        const tryScrapeFacebookPage = async (pageUrl) => {
            const maxTries = config.requestRetries || 3;
            const baseDelay = config.retryBackoffBase || 500;
            for (let attempt = 0; attempt < maxTries; attempt++) {
                try {
                    const resPage = await axios.get(pageUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
                        },
                        timeout: config.requestTimeout || 60000
                    });

                    const html = resPage.data;

                    // Patterns seen in Facebook page source
                    const patterns = [
                        /hd_src_no_ratelimit:\\s*\\"([^\\\"]+)\\"/i,
                        /hd_src:\\s*\\"([^\\\"]+)\\"/i,
                        /sd_src_no_ratelimit:\\s*\\"([^\\\"]+)\\"/i,
                        /sd_src:\\s*\\"([^\\\"]+)\\"/i,
                        /playable_url:\\s*\\"([^\\\"]+)\\"/i
                    ];

                    for (const p of patterns) {
                        const m = html.match(p);
                        if (m && m[1]) {
                            // unescape
                            return [{ url: m[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/') }];
                        }
                    }

                    // fallback: search for any mp4 URLs
                    const mp4 = html.match(/https?:\/\/[^\s'"]+\.mp4(\?[^\s'"]*)?/i);
                    if (mp4) return [{ url: mp4[0] }];

                    return [];

                } catch (e) {
                    console.log('Facebook page scrape attempt failed:', e.message);
                    const delay = baseDelay * Math.pow(2, attempt);
                    await new Promise((res) => setTimeout(res, delay));
                }
            }
            return [];
        };

        // Helper: make axios GET with retries and exponential backoff
        const axiosGetWithRetries = async (url, opts = {}) => {
            const maxTries = config.requestRetries || 3;
            const baseDelay = config.retryBackoffBase || 500;
            let lastErr = null;
            for (let attempt = 0; attempt < maxTries; attempt++) {
                try {
                    return await axios.get(url, opts);
                } catch (e) {
                    lastErr = e;
                    const delay = baseDelay * Math.pow(2, attempt);
                    const jitter = Math.floor(Math.random() * 100);
                    await new Promise((res) => setTimeout(res, delay + jitter));
                }
            }
            throw lastErr;
        };

        // Choose best candidate by inferred quality/resolution
        const chooseBestVideo = (candidates) => {
            if (!candidates || candidates.length === 0) return null;
            const scored = candidates.map((c) => {
                const url = c.url || c;
                let score = 0;
                // prefer explicit height/width
                if (c.height) score += c.height;
                if (c.width) score += Math.floor((c.width / 1000) * 100);
                if (c.bitrate) score += Math.floor(c.bitrate / 1000);
                const s = String(url).toLowerCase();
                if (s.includes('1080')) score += 1080;
                else if (s.includes('720')) score += 720;
                else if (s.includes('480')) score += 480;
                else if (s.includes('360')) score += 360;
                if (s.includes('hd')) score += 500;
                if (s.includes('sd')) score -= 100;
                // prefer mp4 over m3u8 for direct sending
                if (s.endsWith('.mp4') || s.includes('.mp4?')) score += 50;
                if (s.includes('.m3u8')) score -= 10;
                return { url, score };
            });
            scored.sort((a, b) => b.score - a.score);
            return scored[0].url;
        };

        try {

            const apis = config.facebookFallbackAPIs || ['https://api.princetechn.com/api/download/facebook'];
            const apiKey = config.facebookApiKey || 'prince';
            let candidates = [];

            // Try each API endpoint until we get candidates
            for (const apiEndpoint of apis) {
                try {
                    const res = await axiosGetWithRetries(apiEndpoint, {
                        params: { apikey: apiKey, url },
                        timeout: config.requestTimeout || 60000
                    });
                    const data = res.data;

                    // robust extraction: data may be object or string
                    if (!data) {
                        // nothing
                    } else if (typeof data === 'string') {
                        // sometimes the API returns raw HTML or text containing a URL
                        collectVideoCandidates(data, candidates);
                    } else if (typeof data === 'object') {
                        // common shapes
                        collectVideoCandidates(data?.result || data?.data || data?.links || data?.streams || data, candidates);
                        // also common single-url properties
                        if (data.url) collectVideoCandidates(data.url, candidates);
                        if (data.playable_url) collectVideoCandidates(data.playable_url, candidates);
                        if (data.hd_src) collectVideoCandidates(data.hd_src, candidates);
                    }

                    if (candidates.length) break;
                } catch (e) {
                    // Log endpoint, status and message for debugging
                    try {
                        console.log('Facebook API attempt failed:', apiEndpoint, e.response?.status, e.response?.data || e.message);
                    } catch (err) {
                        console.log('Facebook API attempt failed:', apiEndpoint, e.message);
                    }
                }
            }

            // If still no candidates, try scraping the page directly (desktop then mobile)
            if (candidates.length === 0) {
                let scraped = await tryScrapeFacebookPage(url);
                if ((!scraped || scraped.length === 0) && /facebook\.com/i.test(url)) {
                    // try mobile variant
                    const mobileUrl = url.replace(/www\.facebook\.com/i, 'm.facebook.com').replace(/facebook\.com\/watch/i, 'm.facebook.com/watch');
                    if (mobileUrl !== url) scraped = await tryScrapeFacebookPage(mobileUrl);
                }
                if (scraped && scraped.length) candidates.push(...scraped);
            }

            const best = chooseBestVideo(candidates);

            if (!best) {
                throw new Error('Download link not found.');
            }

            // Check size before sending. Prefer HEAD, fallback to ranged GET to obtain length.
            try {
                let cl = null;
                try {
                    const head = await require('axios').head(best, { timeout: 8000, maxRedirects: 5 });
                    cl = head.headers['content-length'];
                } catch (hErr) {
                    // try ranged GET to get content-length via Content-Range or headers
                    try {
                        const r = await require('axios').get(best, { timeout: 8000, maxRedirects: 5, headers: { Range: 'bytes=0-1' } });
                        cl = r.headers['content-length'] || r.headers['content-range']?.split('/')?.[1] || null;
                    } catch (gErr) {
                        // ignore, we'll attempt to send
                        cl = null;
                    }
                }

                const maxBytes = (config.videoMaxMB || 50) * 1024 * 1024;
                if (cl && parseInt(cl, 10) > maxBytes) {
                    await sock.sendMessage(extra.from, { text: `Video is too large to send (${Math.round(parseInt(cl,10)/1024/1024)}MB). Download it here: ${best}` }, { quoted: msg });
                } else {
                    await sock.sendMessage(extra.from, {
                        video: { url: best },
                        mimetype: 'video/mp4',
                        caption: `📥 *Downloaded by ${config.botName}*`
                    }, { quoted: msg });
                }
            } catch (e) {
                // If sending by URL fails, fallback to link
                try {
                    await sock.sendMessage(extra.from, {
                        video: { url: best },
                        mimetype: 'video/mp4',
                        caption: `📥 *Downloaded by ${config.botName}*`
                    }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(extra.from, { text: `Could not send video directly. Download it here: ${best}` }, { quoted: msg });
                }
            }

            await sock.sendMessage(extra.from, {
                react: {
                    text: '✅',
                    key: msg.key
                }
            });

        } catch (err) {

            console.log('Facebook Error:');
            console.log(err.response?.data || err.message);

            await sock.sendMessage(extra.from, {
                react: {
                    text: '❌',
                    key: msg.key
                }
            });

            return extra.reply(
                `❌ Failed to download.\n\n${err.response?.data?.message || err.message}`
            );

        }
    }

}
