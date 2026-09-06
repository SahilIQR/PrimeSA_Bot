// utils/autoReact.js
const fs = require('fs');
const path = require('path');

// utils/autoReact.js
// Safer runtime toggle storage — do NOT edit config.js at runtime (can break hosts)
const RUNTIME_PATH = path.join(__dirname, '..', 'database', 'runtime.json');

function _readRuntime() {
  try {
    if (fs.existsSync(RUNTIME_PATH)) {
      const raw = fs.readFileSync(RUNTIME_PATH, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.error('[autoReact] read runtime error', e?.message || e);
  }
  return {};
}

function _writeRuntime(obj) {
  try {
    const dir = path.dirname(RUNTIME_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cur = _readRuntime();
    const merged = { ...cur, ...obj };
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[autoReact] write runtime error', e?.message || e);
    return false;
  }
}

function load() {
  try {
    // load defaults from config but don't modify it
    delete require.cache[require.resolve('../config')];
    const config = require('../config');
    const runtime = _readRuntime();
    return {
      enabled: typeof runtime.autoReact !== 'undefined' ? runtime.autoReact : (config.autoReact || false),
      mode: runtime.autoReactMode || config.autoReactMode || 'bot'
    };
  } catch (e) {
    return { enabled: false, mode: 'bot' };
  }
}

function save(data) {
  try {
    const toSave = {};
    if (typeof data.enabled !== 'undefined') toSave.autoReact = !!data.enabled;
    if (data.mode) toSave.autoReactMode = data.mode;
    return _writeRuntime(toSave);
  } catch (e) {
    console.error('[autoReact] save error', e?.message || e);
    return false;
  }
}

module.exports = { load, save };

// Initialize auto-react behaviour on a Baileys socket
function initAutoReact(sock) {
  if (!sock || !sock.ev) throw new Error('Baileys socket required');
  if (sock._autoReactInitialized) return sock._autoReactAPI || { stats: () => ({}) };
  sock._autoReactInitialized = true;

  const config = require('../config');
  const { load: loadRuntime } = module.exports;

  const emojis = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify' || !Array.isArray(messages)) return;
      const rt = loadRuntime();
      if (!rt.enabled) return;

      for (const m of messages) {
        try {
          if (!m || !m.key) continue;
          if (m.key.fromMe) continue;
          const jid = m.key.remoteJid || '';
          const content = m.message || m.message?.ephemeralMessage?.message;
          const text = content?.conversation || content?.extendedTextMessage?.text || '';

          const mode = rt.mode || 'bot';

          if (mode === 'bot') {
            const prefix = config.prefix || '.';
            if (!text || text.trim().length === 0) continue;
            if (!text.trim().startsWith(prefix)) continue;
            // react with hourglass to indicate processing
            try {
              await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });
            } catch (e) {
              // ignore reaction errors
            }
          } else if (mode === 'all') {
            const rand = emojis[Math.floor(Math.random() * emojis.length)];
            try {
              await sock.sendMessage(jid, { react: { text: rand, key: m.key } });
            } catch (e) {
              // ignore reaction errors
            }
          }
        } catch (e) { /* ignore per message errors */ }
      }
    } catch (e) { console.error('[autoReact] handler error', e?.message || e); }
  });

  const api = {
    stats: () => ({ initialized: true })
  };

  sock._autoReactAPI = api;
  return api;
}

module.exports.initAutoReact = initAutoReact;
