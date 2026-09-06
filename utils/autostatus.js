/**
 * AutoStatus config - view status & react to status updates
 * Owner-only feature. Stored in database/autostatus.json
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database');
const AUTOSTATUS_FILE = path.join(DB_PATH, 'autostatus.json');

const DEFAULTS = {
  view: true,
  react: true,
  reaction: '💚' // green heart
};

function load() {
  try {
    if (fs.existsSync(AUTOSTATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOSTATUS_FILE, 'utf8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {
    console.error('[autostatus] load error:', e.message);
  }
  return { ...DEFAULTS };
}

function save(data) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(DB_PATH, { recursive: true });
    }
    fs.writeFileSync(AUTOSTATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[autostatus] save error:', e.message);
    return false;
  }
}

module.exports = { load, save, DEFAULTS };
