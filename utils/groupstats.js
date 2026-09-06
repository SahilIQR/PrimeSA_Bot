const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/groupStats.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[groupStats] save error:', err);
  }
}

function addMessage(groupId, senderId, opts = {}) {
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getHours();

  if (!db[groupId]) db[groupId] = {};
  if (!db[groupId][today]) {
    db[groupId][today] = {
      total: 0,
      users: {},
      hours: {},
      night: {},
      mentioned: {},
      stickers: {},
    };
  }

  const g = db[groupId][today];
  if (!g.users) g.users = {};
  if (!g.hours) g.hours = {};
  if (!g.night) g.night = {};
  if (!g.mentioned) g.mentioned = {};
  if (!g.stickers) g.stickers = {};
  if (typeof g.total !== 'number') g.total = 0;

  g.total++;
  g.users[senderId] = (g.users[senderId] || 0) + 1;
  g.hours[hour] = (g.hours[hour] || 0) + 1;

  if (hour >= 22 || hour < 6) {
    g.night[senderId] = (g.night[senderId] || 0) + 1;
  }

  if (opts.mentions?.length) {
    for (const m of opts.mentions) {
      g.mentioned[m] = (g.mentioned[m] || 0) + 1;
    }
  }

  if (opts.sticker) {
    g.stickers[senderId] = (g.stickers[senderId] || 0) + 1;
  }

  saveDB(db);
}

function getStats(groupId) {
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);
  if (!db[groupId] || !db[groupId][today]) return null;
  return db[groupId][today];
}

function getWeeklyStats(groupId) {
  const db = loadDB();
  if (!db[groupId]) return null;

  const users = {};
  let total = 0;
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = db[groupId][key];
    if (!day) continue;
    total += day.total || 0;
    for (const [uid, count] of Object.entries(day.users || {})) {
      users[uid] = (users[uid] || 0) + count;
    }
  }

  if (!total) return null;
  return { total, users };
}

function rankUsers(map, limit = 5) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

module.exports = { addMessage, getStats, getWeeklyStats, rankUsers };
