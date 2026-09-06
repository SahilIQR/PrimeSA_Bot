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
