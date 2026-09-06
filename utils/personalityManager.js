const fs = require('fs');
const path = require('path');
const config = require('../config');

const SESSION_DIR = path.join(__dirname, '..', config.sessionName || 'session');
const PERSONALITY_PATH = path.join(__dirname, '..', 'database', 'personality.json');

let _cache = new Map();
let _raw = {};

function debug(...args) {
  if (config.DEBUG) console.debug('[PersonalityManager]', ...args);
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function normalizeJidRaw(jid) {
  if (!jid) return null;
  jid = String(jid);
  const at = jid.indexOf('@');
  if (at === -1) return jid;
  const userPart = jid.slice(0, at).split(':')[0];
  const server = jid.slice(at + 1);
  if (server.includes('lid')) {
    return `${userPart}@${server}`;
  }
  return `${userPart}@s.whatsapp.net`;
}

function readLidMapping(user, direction) {
  if (!user) return null;
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(SESSION_DIR, `lid-mapping-${user}${suffix}`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = safeParse(raw);
    return parsed || null;
  } catch (e) {
    return null;
  }
}

function mapLidToPnIfPossible(jid) {
  try {
    if (!jid || !jid.includes('@')) return jid;
    const [user, server] = jid.split('@');
    if (!server.includes('lid')) return jid;
    const map = readLidMapping(user, 'lidToPn');
    if (map && typeof map === 'string') {
      return `${map}@s.whatsapp.net`;
    }
    if (map && map.pn) return `${map.pn}@s.whatsapp.net`;
    return jid;
  } catch (e) {
    return jid;
  }
}

function normalizeIncomingId(jid) {
  if (!jid) return null;
  try {
    const cleaned = normalizeJidRaw(jid);
    if (cleaned.includes('@lid')) {
      const mapped = mapLidToPnIfPossible(cleaned);
      return mapped || cleaned;
    }
    return cleaned;
  } catch (e) {
    return jid;
  }
}

function validateEntry(key, entry) {
  const warnings = [];
  if (!entry || typeof entry !== 'object') {
    warnings.push('entry not an object');
    return { valid: false, warnings };
  }
  if (entry.autoReply === undefined) entry.autoReply = true;
  if (entry.nicknames && !Array.isArray(entry.nicknames)) entry.nicknames = [String(entry.nicknames)];
  if (entry.name && typeof entry.name !== 'string') entry.name = String(entry.name);
  if (entry.instructions && typeof entry.instructions !== 'string') entry.instructions = String(entry.instructions);
  return { valid: true, warnings };
}

function load() {
  try {
    const raw = fs.readFileSync(PERSONALITY_PATH, 'utf8');
    _raw = safeParse(raw);
  } catch (e) {
    console.warn('[PersonalityManager] Failed to load personality.json, using empty');
    _raw = {};
  }

  _cache = new Map();
  for (const k of Object.keys(_raw)) {
    const normalKey = normalizeIncomingId(k);
    const entry = Object.assign({}, _raw[k]);
    const { valid, warnings } = validateEntry(k, entry);
    if (!valid) {
      console.warn(`[PersonalityManager] Invalid entry for ${k}:`, warnings.join(', '));
      continue;
    }
    _cache.set(normalKey, entry);
    try {
      const short = normalKey.split('@')[0];
      _cache.set(`${short}@s.whatsapp.net`, entry);
    } catch (e) {}
  }
  debug('Loaded personalities:', _cache.size);
}

function watch() {
  try {
    fs.watchFile(PERSONALITY_PATH, { interval: 1000 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        debug('personality.json changed, reloading');
        try { load(); } catch (e) { console.warn('[PersonalityManager] reload failed', e.message); }
      }
    });
  } catch (e) {}
}

function getPersonality(senderId) {
  if (!senderId) return null;
  const normalized = normalizeIncomingId(senderId);
  if (_cache.has(normalized)) return _cache.get(normalized);
  try {
    const num = normalized.split('@')[0];
    const key = `${num}@s.whatsapp.net`;
    if (_cache.has(key)) return _cache.get(key);
  } catch (e) {}
  return null;
}

function isAutoReplyEnabled(senderId) {
  const p = getPersonality(senderId);
  if (!p) return true;
  return p.autoReply !== false;
}

function getNicknameList(senderId) {
  const p = getPersonality(senderId);
  if (!p) return [];
  if (Array.isArray(p.nicknames)) return p.nicknames.slice();
  if (p.nicknames) return [String(p.nicknames)];
  return [];
}

function getInstructions(senderId) {
  const p = getPersonality(senderId);
  if (!p) return '';
  return p.instructions || '';
}

function reloadPersonality() { load(); }

load();
watch();

module.exports = {
  getPersonality,
  isAutoReplyEnabled,
  getNicknameList,
  getInstructions,
  reloadPersonality,
  normalizeIncomingId,
  _internal: { _raw, _cache }
};
