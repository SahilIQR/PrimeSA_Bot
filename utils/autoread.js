/**
 * AutoRead config - read messages immediately when received
 * Owner-only feature. Stored in database/autoread.json
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database');
const AUTOREAD_FILE = path.join(DB_PATH, 'autoread.json');

function load() {
  try {
    if (fs.existsSync(AUTOREAD_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOREAD_FILE, 'utf8'));
      return data.enabled === true;
    }
  } catch (e) {
    console.error('[autoread] load error:', e.message);
  }
  return null; // null = use config.autoRead
}

function save(enabled) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(DB_PATH, { recursive: true });
    }
    fs.writeFileSync(AUTOREAD_FILE, JSON.stringify({ enabled }, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[autoread] save error:', e.message);
    return false;
  }
}

function isEnabled() {
  const val = load();
  if (val !== null) return val;
  try {
    return require('../config').autoRead || false;
  } catch {
    return false;
  }
}

module.exports = { load, save, isEnabled };
