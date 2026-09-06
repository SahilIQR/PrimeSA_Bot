const axios = require('axios');
const qs = require('querystring');
const config = require('../config');
const APIs = require('./api');
const { toAudio } = require('./converter');

// Lightweight music manager with Spotify + YouTube fallbacks, lyrics and caching

const CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Only one heavy audio download at a time.
// This protects RAM/bandwidth on small hosting instances.
let activeDownload = false;

function cacheGet(key) {
  const e = CACHE.get(key);

  if (!e) return null;

  if (Date.now() - e.ts > CACHE_TTL) {
    CACHE.delete(key);
    return null;
  }

  return e.value;
}

function cacheSet(key, value) {
  CACHE.set(key, {
    ts: Date.now(),
    value
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message = 'Operation timed out') {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([
    promise,
    timeout
  ]).finally(() => {
    clearTimeout(timer);
  });
}

async function getSpotifyToken() {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    return null;
  }

  const cached = cacheGet('spotify_token');

  if (cached) return cached;

  try {
    const resp = await axios.post(
      'https://accounts.spotify.com/api/token',
      qs.stringify({
        grant_type: 'client_credentials'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              `${config.spotifyClientId}:${config.spotifyClientSecret}`
            ).toString('base64')
        },
        timeout: 10000
      }
    );

    const token = resp.data && resp.data.access_token;

    const expires =
      resp.data && resp.data.expires_in
        ? resp.data.expires_in * 1000
        : 3500000;

    if (token) {
      cacheSet('spotify_token', token);

      setTimeout(() => {
        CACHE.delete('spotify_token');
      }, Math.max(expires - 60000, 1000));

      return token;
    }
  } catch (e) {
    console.error('[musicManager] Spotify token error:', e.message);
  }

  return null;
}

async function searchSpotify(query, type = 'track', limit = 5) {
  const key = `sp:${type}:${query}:${limit}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const token = await getSpotifyToken();

  if (!token) {
    throw new Error('Spotify credentials not configured');
  }

  const url =
    `https://api.spotify.com/v1/search` +
    `?q=${encodeURIComponent(query)}` +
    `&type=${encodeURIComponent(type)}` +
    `&limit=${Math.min(Math.max(limit, 1), 10)}`;

  const resp = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    timeout: 10000
  });

  const data = resp.data;

  cacheSet(key, data);

  return data;
}

async function getSpotifyTrack(id) {
  const key = `sp:track:${id}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const token = await getSpotifyToken();

  if (!token) {
    throw new Error('Spotify credentials not configured');
  }

  const resp = await axios.get(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 10000
    }
  );

  cacheSet(key, resp.data);

  return resp.data;
}

/**
 * Get Spotify album.
 */
async function getSpotifyAlbum(id) {
  const key = `sp:album:${id}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const token = await getSpotifyToken();

  if (!token) {
    throw new Error('Spotify credentials not configured');
  }

  const resp = await axios.get(
    `https://api.spotify.com/v1/albums/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 10000
    }
  );

  cacheSet(key, resp.data);

  return resp.data;
}

/**
 * Get Spotify playlist.
 *
 * Only retrieves enough information for our safe download limit.
 */
async function getSpotifyPlaylist(id, limit = 5) {
  const key = `sp:playlist:${id}:${limit}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const token = await getSpotifyToken();

  if (!token) {
    throw new Error('Spotify credentials not configured');
  }

  const resp = await axios.get(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks`,
    {
      params: {
        limit: Math.min(Math.max(limit, 1), 5),
        offset: 0
      },
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 10000
    }
  );

  cacheSet(key, resp.data);

  return resp.data;
}

/**
 * Resolve a Spotify URL.
 *
 * Supports:
 *   /track/
 *   /album/
 *   /playlist/
 */
async function resolveSpotifyUrl(url, limit = 5) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid Spotify URL');
  }

  if (!parsed.hostname.includes('spotify.com')) {
    throw new Error('Not a Spotify URL');
  }

  const parts = parsed.pathname
    .split('/')
    .filter(Boolean);

  const type = parts[0];
  const id = parts[1];

  if (!type || !id) {
    throw new Error('Invalid Spotify URL');
  }

  if (type === 'track') {
    const track = await getSpotifyTrack(id);

    return {
      type: 'track',
      tracks: [track]
    };
  }

  if (type === 'album') {
    const album = await getSpotifyAlbum(id);

    const tracks =
      (album.tracks?.items || [])
        .slice(0, 5)
        .map(track => ({
          ...track,
          album: track.album || {
            name: album.name,
            images: album.images || [],
            release_date: album.release_date
          }
        }));

    return {
      type: 'album',
      name: album.name,
      tracks
    };
  }

  if (type === 'playlist') {
    const playlist = await getSpotifyPlaylist(id, limit);

    const tracks =
      (playlist.items || [])
        .map(item => item.track)
        .filter(Boolean)
        .slice(0, 5);

    return {
      type: 'playlist',
      name: playlist.name,
      tracks
    };
  }

  throw new Error(
    'Spotify URL type not supported. Use a track, album or playlist URL.'
  );
}

// Lyrics via lyrics.ovh, fallback to princetechn if available
async function getLyrics(artist, title) {
  if (!artist || !title) {
    throw new Error('artist and title required');
  }

  const key = `lyrics:${artist}:${title}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  try {
    const resp = await axios.get(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      {
        timeout: 8000
      }
    );

    if (resp.data && resp.data.lyrics) {
      cacheSet(key, resp.data.lyrics);
      return resp.data.lyrics;
    }
  } catch (e) {}

  try {
    const apiKey =
      config.facebookApiKey ||
      config.requestApiKey;

    if (apiKey) {
      const r = await axios.get(
        'https://api.princetechn.com/api/lyrics',
        {
          params: {
            apikey: apiKey,
            artist,
            title
          },
          timeout: 10000
        }
      );

      const lyrics =
        r.data?.lyrics ||
        r.data?.result ||
        r.data?.data?.lyrics;

      if (lyrics) {
        cacheSet(key, lyrics);
        return lyrics;
      }
    }
  } catch (e) {}

  throw new Error('Lyrics not found');
}

// YouTube search
async function searchYouTube(query, maxResults = 5) {
  if (!config.youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  const key = `yt:search:${query}:${maxResults}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const url =
    'https://www.googleapis.com/youtube/v3/search';

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await axios.get(url, {
        params: {
          key: config.youtubeApiKey,
          q: query,
          part: 'snippet',
          maxResults,
          type: 'video'
        },
        timeout: 10000
      });

      const items = resp.data.items || [];

      cacheSet(key, items);

      return items;
    } catch (e) {
      if (attempt === maxRetries) {
        throw e;
      }

      await sleep(300 * attempt);
    }
  }

  return [];
}

// Get video details
async function getYouTubeVideoDetails(videoId) {
  if (!config.youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  const key = `yt:video:${videoId}`;

  const cached = cacheGet(key);

  if (cached) return cached;

  const url =
    'https://www.googleapis.com/youtube/v3/videos';

  const resp = await axios.get(url, {
    params: {
      key: config.youtubeApiKey,
      id: videoId,
      part: 'contentDetails,statistics,snippet'
    },
    timeout: 10000
  });

  const item =
    (resp.data.items &&
      resp.data.items[0]) ||
    null;

  cacheSet(key, item);

  return item;
}

/**
 * Find the YouTube source for a Spotify track.
 *
 * Spotify metadata is used FIRST.
 */
async function findYouTubeSource({
  title,
  artist
}) {
  if (!title) {
    throw new Error('Track title is required');
  }

  const query =
    `${title} ${artist || ''}`.trim();

  if (!config.youtubeApiKey) {
    throw new Error(
      'YouTube API key not configured. Spotify metadata was found, but no audio downloader search is available.'
    );
  }

  const items =
    await searchYouTube(query, 5);

  if (!items.length) {
    throw new Error(
      `No YouTube audio source found for "${query}"`
    );
  }

  const item =
    items.find(x => x.id?.videoId) ||
    items[0];

  if (!item?.id?.videoId) {
    throw new Error('YouTube search returned no usable video');
  }

  return {
    url:
      `https://www.youtube.com/watch?v=${item.id.videoId}`,
    videoId: item.id.videoId,
    info: item
  };
}

/**
 * Shared audio downloader.
 *
 * This is the downloader used by Spotify.
 *
 * It uses the same API chain that the existing .play command
 * already uses:
 *
 * EliteProTech -> Yupra -> Okatsu -> Izumi
 *
 * Returns an MP3 buffer.
 *
 * Nothing is permanently saved to disk.
 */
async function downloadAudioBuffer({
  title,
  artist,
  youtubeUrl
}) {
  if (activeDownload) {
    throw new Error(
      'Another music download is currently running. Please wait for it to finish.'
    );
  }

  activeDownload = true;

  try {
    let sourceUrl = youtubeUrl;

    if (!sourceUrl) {
      const source =
        await withTimeout(
          findYouTubeSource({
            title,
            artist
          }),
          30000,
          'YouTube search timed out'
        );

      sourceUrl = source.url;
    }

    let audioBuffer = null;
    let audioData = null;
    let downloadSuccess = false;

    const apiMethods = [
      {
        name: 'EliteProTech',
        method: () =>
          APIs.getEliteProTechDownloadByUrl(sourceUrl)
      },
      {
        name: 'Yupra',
        method: () =>
          APIs.getYupraDownloadByUrl(sourceUrl)
      },
      {
        name: 'Okatsu',
        method: () =>
          APIs.getOkatsuDownloadByUrl(sourceUrl)
      },
      {
        name: 'Izumi',
        method: () =>
          APIs.getIzumiDownloadByUrl(sourceUrl)
      }
    ];

    for (const apiMethod of apiMethods) {
      try {
        audioData =
          await withTimeout(
            apiMethod.method(),
            30000,
            `${apiMethod.name} API timed out`
          );

        const audioUrl =
          audioData?.download ||
          audioData?.dl ||
          audioData?.url;

        if (!audioUrl) {
          console.log(
            `[musicManager] ${apiMethod.name} returned no download URL`
          );

          continue;
        }

        // First attempt: buffer
        try {
          const audioResponse =
            await axios.get(audioUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              maxContentLength: 50 * 1024 * 1024,
              maxBodyLength: 50 * 1024 * 1024,
              decompress: true,
              validateStatus:
                status =>
                  status >= 200 &&
                  status < 400,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                Accept: '*/*',
                'Accept-Encoding': 'identity'
              }
            });

          audioBuffer =
            Buffer.from(audioResponse.data);

          if (audioBuffer.length > 0) {
            downloadSuccess = true;
            break;
          }
        } catch (downloadErr) {
          const statusCode =
            downloadErr.response?.status ||
            downloadErr.status;

          if (statusCode === 451) {
            console.log(
              `[musicManager] ${apiMethod.name} returned 451`
            );

            continue;
          }

          // Stream fallback
          try {
            const audioResponse =
              await axios.get(audioUrl, {
                responseType: 'stream',
                timeout: 60000,
                maxContentLength:
                  50 * 1024 * 1024,
                maxBodyLength:
                  50 * 1024 * 1024,
                validateStatus:
                  status =>
                    status >= 200 &&
                    status < 400,
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                  Accept: '*/*',
                  'Accept-Encoding': 'identity'
                }
              });

            const chunks = [];
            let totalSize = 0;

            await new Promise(
              (resolve, reject) => {
                audioResponse.data.on(
                  'data',
                  chunk => {
                    totalSize += chunk.length;

                    if (
                      totalSize >
                      50 * 1024 * 1024
                    ) {
                      audioResponse.data.destroy(
                        new Error(
                          'Audio file exceeds 50 MB limit'
                        )
                      );

                      return;
                    }

                    chunks.push(chunk);
                  }
                );

                audioResponse.data.on(
                  'end',
                  resolve
                );

                audioResponse.data.on(
                  'error',
                  reject
                );
              }
            );

            audioBuffer =
              Buffer.concat(chunks);

            if (audioBuffer.length > 0) {
              downloadSuccess = true;
              break;
            }
          } catch (streamErr) {
            console.log(
              `[musicManager] ${apiMethod.name} stream failed:`,
              streamErr.message
            );

            continue;
          }
        }
      } catch (apiErr) {
        console.log(
          `[musicManager] ${apiMethod.name} failed:`,
          apiErr.message
        );

        continue;
      }
    }

    if (!downloadSuccess || !audioBuffer) {
      throw new Error(
        'All download sources failed. The content may be unavailable or blocked.'
      );
    }

    // Detect format
    const firstBytes =
      audioBuffer.slice(0, 12);

    const hexSignature =
      firstBytes.toString('hex');

    const asciiSignature =
      firstBytes.toString(
        'ascii',
        4,
        8
      );

    let fileExtension = 'mp3';

    if (
      asciiSignature === 'ftyp' ||
      hexSignature.startsWith('000000')
    ) {
      fileExtension = 'm4a';
    } else if (
      audioBuffer
        .toString('ascii', 0, 4) ===
      'OggS'
    ) {
      fileExtension = 'ogg';
    } else if (
      audioBuffer
        .toString('ascii', 0, 4) ===
      'RIFF'
    ) {
      fileExtension = 'wav';
    } else if (
      audioBuffer
        .toString('ascii', 0, 3) ===
        'ID3' ||
      (
        audioBuffer[0] === 0xff &&
        (audioBuffer[1] & 0xe0) === 0xe0
      )
    ) {
      fileExtension = 'mp3';
    }

    // Convert everything to MP3.
    let finalBuffer =
      audioBuffer;

    if (fileExtension !== 'mp3') {
      finalBuffer =
        await withTimeout(
          toAudio(
            audioBuffer,
            fileExtension
          ),
          60000,
          'Audio conversion timed out'
        );

      if (
        !finalBuffer ||
        finalBuffer.length === 0
      ) {
        throw new Error(
          'Audio conversion returned an empty buffer'
        );
      }
    }

    // Release the original buffer as soon as possible.
    audioBuffer = null;

    return {
      buffer: finalBuffer,
      mimetype: 'audio/mpeg',
      extension: 'mp3',
      title:
        audioData?.title ||
        title ||
        'song'
    };
  } finally {
    activeDownload = false;
  }
}

/**
 * Backwards-compatible source function.
 *
 * Existing code can still call this.
 */
async function downloadAudioForTrack({
  title,
  artist,
  spotifyUrl
}) {
  const source =
    await findYouTubeSource({
      title,
      artist
    });

  return {
    source: 'youtube',
    url: source.url,
    info: source.info,
    spotifyUrl: spotifyUrl || null
  };
}

module.exports = {
  searchSpotify,
  getSpotifyTrack,
  getSpotifyAlbum,
  getSpotifyPlaylist,
  resolveSpotifyUrl,
  getLyrics,
  searchYouTube,
  getYouTubeVideoDetails,
  findYouTubeSource,
  downloadAudioForTrack,
  downloadAudioBuffer,
  cache: {
    get: cacheGet,
    set: cacheSet
  }
};