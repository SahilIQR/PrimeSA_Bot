const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SESSION_API_URL = process.env.SESSION_API_URL || '';
const SESSION_API_KEY = process.env.SESSION_API_KEY || process.env.SESSION_API_TOKEN || '';
const MAX_REDIRECTS = 5;

function _buildHeaders() {
  const headers = { Accept: 'application/json' };
  if (SESSION_API_KEY) headers['Authorization'] = `Bearer ${SESSION_API_KEY}`;
  return headers;
}

async function _fetch(url, opts = {}) {
  // lightweight fetch using node https/http
  return new Promise((resolve, reject) => {
    try {
      const client = url.startsWith('https://') ? https : http;
      const parsed = new URL(url);
      const reqOpts = {
        method: opts.method || 'GET',
        headers: opts.headers || {}
      };
      const req = client.request(parsed, reqOpts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });
      req.on('error', (err) => reject(err));
      if (opts.body) req.write(opts.body);
      req.end();
    } catch (e) { reject(e); }
  });
}

async function downloadSessionBundle(sessionId, destFolder) {
  if (!SESSION_API_URL) return { ok: false, reason: 'no_api_url' };
  if (!sessionId) return { ok: false, reason: 'no_session_id' };

  const base = SESSION_API_URL.replace(/\/$/, '');
  const headers = _buildHeaders();

  // Try a few common endpoints that session generators may expose.
  const endpoints = [
    `${base}/api/sessions/${encodeURIComponent(sessionId)}`,
    `${base}/api/session/${encodeURIComponent(sessionId)}`,
    `${base}/api/internal/session/${encodeURIComponent(sessionId)}/transfer`,
    `${base}/api/internal/session/${encodeURIComponent(sessionId)}/claim`,
    `${base}/api/sessions/${encodeURIComponent(sessionId)}/bundle`,
    `${base}/session/${encodeURIComponent(sessionId)}`
  ];

  for (const url of endpoints) {
    try {
      const res = await _fetch(url, { method: 'GET', headers });
      if (!res) continue;
      if (res.status >= 200 && res.status < 300) {
        // Try parse JSON
        let parsed = null;
        try { parsed = JSON.parse(res.body); } catch(e) { parsed = null; }

        // Case A: JSON with files array (multi-file auth v1)
        if (parsed && parsed.files && Array.isArray(parsed.files)) {
          const baseDir = path.join(destFolder, 'auth_info_baileys');
          fs.mkdirSync(baseDir, { recursive: true });
          for (const file of parsed.files) {
            const rel = (file.path || '').replace(/^\/+/, '');
            const absolute = path.join(baseDir, rel);
            const dir = path.dirname(absolute);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(absolute, Buffer.from(file.content || '', 'base64'));
          }
          return { ok: true, loaded: 'multi-file-auth' };
        }

        // Case B: JSON with a bundle string
        if (parsed && parsed.bundle && typeof parsed.bundle === 'string') {
          // If consumer has a decoder, caller should decode. Save raw bundle.
          const outPath = path.join(destFolder, 'session.bundle.txt');
          fs.mkdirSync(destFolder, { recursive: true });
          fs.writeFileSync(outPath, parsed.bundle, 'utf8');
          return { ok: true, loaded: 'bundle', path: outPath };
        }

        // Case C: plain text body that might be a bundle or base64 archive
        const body = res.body || '';
        if (typeof body === 'string' && body.trim().length > 0) {
          // If JSON-like but not parsed, attempt inspect
          try {
            const maybe = JSON.parse(body);
            if (maybe && maybe.files && Array.isArray(maybe.files)) {
              const baseDir = path.join(destFolder, 'auth_info_baileys');
              fs.mkdirSync(baseDir, { recursive: true });
              for (const file of maybe.files) {
                const rel = (file.path || '').replace(/^\/+/, '');
                const absolute = path.join(baseDir, rel);
                const dir = path.dirname(absolute);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(absolute, Buffer.from(file.content || '', 'base64'));
              }
              return { ok: true, loaded: 'multi-file-auth' };
            }
          } catch (e) { /* ignore */ }

          // Save raw body if it looks like a bundle token (caller may decode)
          const outPath = path.join(destFolder, 'session.bundle.txt');
          fs.mkdirSync(destFolder, { recursive: true });
          fs.writeFileSync(outPath, body, 'utf8');
          return { ok: true, loaded: 'bundle', path: outPath };
        }
      }
    } catch (e) {
      // continue to next endpoint
    }
  }

  // Try POST transfer endpoint (some services require POST)
  const transferUrl = `${base}/api/internal/session/${encodeURIComponent(sessionId)}/transfer`;
  try {
    const res2 = await _fetch(transferUrl, { method: 'POST', headers });
    if (res2 && res2.status >=200 && res2.status <300) {
      let parsed = null; try { parsed = JSON.parse(res2.body); } catch(e){ parsed = null; }
      if (parsed && parsed.files && Array.isArray(parsed.files)) {
        const baseDir = path.join(destFolder, 'auth_info_baileys');
        fs.mkdirSync(baseDir, { recursive: true });
        for (const file of parsed.files) {
          const rel = (file.path || '').replace(/^\/+/, '');
          const absolute = path.join(baseDir, rel);
          const dir = path.dirname(absolute);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(absolute, Buffer.from(file.content || '', 'base64'));
        }
        return { ok: true, loaded: 'multi-file-auth' };
      }
      if (parsed && parsed.bundle && typeof parsed.bundle === 'string') {
        const outPath = path.join(destFolder, 'session.bundle.txt');
        fs.mkdirSync(destFolder, { recursive: true });
        fs.writeFileSync(outPath, parsed.bundle, 'utf8');
        return { ok: true, loaded: 'bundle', path: outPath };
      }
    }
  } catch (e) {}

  return { ok: false, reason: 'not_found' };
}

module.exports = { downloadSessionBundle };
