const fs = require('fs');
const path = require('path');
const {
  MULTIPLIER,
  xpForLevel,
  canLevelUp,
  getRole,
  formatLevelUpMessage,
} = require('./levelling');
const DB_PATH = path.join(__dirname, '..', 'database', 'economy.json');

const COOLDOWNS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  work: 60 * 60 * 1000,
  crime: 2 * 60 * 60 * 1000,
  mine: 90 * 60 * 1000,
};

const SHOP = [
  { id: 'pizza', name: '🍕 Pizza', price: 200, emoji: '🍕' },
  { id: 'coffee', name: '☕ Coffee', price: 150, emoji: '☕' },
  { id: 'phone', name: '📱 Phone', price: 1500, emoji: '📱' },
  { id: 'laptop', name: '💻 Laptop', price: 3500, emoji: '💻' },
  { id: 'car', name: '🚗 Car', price: 12000, emoji: '🚗' },
  { id: 'house', name: '🏠 House', price: 50000, emoji: '🏠' },
];

function defaultUser() {
  return {
    wallet: 0,
    bank: 0,
    diamonds: 0,
    xp: 0,
    level: 1,
    role: getRole(1).name,
    autolevelup: true,
    inventory: {},
    lastDaily: 0,
    lastWeekly: 0,
    lastWork: 0,
    lastCrime: 0,
    lastMine: 0,
  };
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, '{}');
      return {};
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function migrateUser(raw) {
  const user = { ...defaultUser(), ...raw };
  user.wallet = Number(user.wallet) || 0;
  user.bank = Number(user.bank) || 0;
  user.diamonds = Number(user.diamonds) || 0;
  user.xp = Number(user.xp) || 0;
  user.level = Number(user.level) || 1;
  user.autolevelup = user.autolevelup !== false;
  user.role = user.role || getRole(user.level).name;
  user.inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory : {};
  return user;
}

function ensureUser(db, groupId, userId) {
  if (!db[groupId]) db[groupId] = {};
  db[groupId][userId] = migrateUser(db[groupId][userId] || {});
  return db[groupId][userId];
}

function addXp(user, amount) {
  user.xp += amount;
}

function applyLevelUps(user) {
  const before = user.level;
  let diamondsEarned = 0;

  while (canLevelUp(user.level, user.xp, MULTIPLIER)) {
    user.xp -= xpForLevel(user.level, MULTIPLIER);
    user.level += 1;
    const reward = 2 + Math.floor(user.level / 3);
    user.diamonds += reward;
    diamondsEarned += reward;
  }

  user.role = getRole(user.level).name;

  return {
    leveled: before !== user.level,
    before,
    after: user.level,
    role: user.role,
    diamondsEarned,
  };
}

function saveUserWithAutoLevel(db, user) {
  const levelResult = user.autolevelup !== false ? applyLevelUps(user) : { leveled: false };
  saveDB(db);
  return levelResult;
}

function tryAutoLevelUp(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  if (!user.autolevelup) return { leveled: false };

  const levelResult = applyLevelUps(user);
  if (levelResult.leveled) saveDB(db);
  return levelResult;
}

function setAutoLevelUp(groupId, userId, enabled) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  user.autolevelup = !!enabled;
  saveDB(db);
  return user.autolevelup;
}

function totalWealth(user) {
  return (user.wallet || 0) + (user.bank || 0);
}

function getUserData(groupId, userId) {
  const db = loadDB();
  return ensureUser(db, groupId, userId);
}

function getBalance(groupId, userId) {
  return getUserData(groupId, userId).wallet;
}

function checkCooldown(user, key) {
  const last = user[`last${key.charAt(0).toUpperCase()}${key.slice(1)}`] || 0;
  const wait = COOLDOWNS[key];
  if (!last || Date.now() - last >= wait) return { ok: true };
  return { ok: false, waitMs: wait - (Date.now() - last) };
}

function setCooldown(user, key) {
  const field = `last${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  user[field] = Date.now();
}

function claimDaily(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const cd = checkCooldown(user, 'daily');
  if (!cd.ok) return { ok: false, waitMs: cd.waitMs };

  const amount = 100 + Math.floor(Math.random() * 401);
  user.wallet += amount;
  addXp(user, 25);
  setCooldown(user, 'daily');
  const levelResult = saveUserWithAutoLevel(db, user);
  return { ok: true, amount, user, levelResult };
}

function claimWeekly(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const cd = checkCooldown(user, 'weekly');
  if (!cd.ok) return { ok: false, waitMs: cd.waitMs };

  const amount = 1000 + Math.floor(Math.random() * 1501);
  user.wallet += amount;
  addXp(user, 100);
  setCooldown(user, 'weekly');
  const levelResult = saveUserWithAutoLevel(db, user);
  return { ok: true, amount, user, levelResult };
}

function doWork(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const cd = checkCooldown(user, 'work');
  if (!cd.ok) return { ok: false, waitMs: cd.waitMs };

  const amount = 50 + Math.floor(Math.random() * 151);
  user.wallet += amount;
  addXp(user, 15);
  setCooldown(user, 'work');
  const levelResult = saveUserWithAutoLevel(db, user);
  return { ok: true, amount, user, levelResult };
}

function doCrime(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const cd = checkCooldown(user, 'crime');
  if (!cd.ok) return { ok: false, waitMs: cd.waitMs };

  const success = Math.random() < 0.55;
  if (success) {
    const amount = 100 + Math.floor(Math.random() * 301);
    user.wallet += amount;
    addXp(user, 20);
    setCooldown(user, 'crime');
    const levelResult = saveUserWithAutoLevel(db, user);
    return { ok: true, success: true, amount, user, levelResult };
  }

  const fine = Math.min(user.wallet, 50 + Math.floor(Math.random() * 101));
  user.wallet -= fine;
  setCooldown(user, 'crime');
  saveDB(db);
  return { ok: true, success: false, amount: fine, user };
}

function doMine(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const cd = checkCooldown(user, 'mine');
  if (!cd.ok) return { ok: false, waitMs: cd.waitMs };

  const amount = 80 + Math.floor(Math.random() * 171);
  user.wallet += amount;
  addXp(user, 18);
  let diamonds = 0;
  if (Math.random() < 0.15) {
    diamonds = 1 + Math.floor(Math.random() * 3);
    user.diamonds += diamonds;
  }
  setCooldown(user, 'mine');
  const levelResult = saveUserWithAutoLevel(db, user);
  return { ok: true, amount, diamonds, user, levelResult };
}

function deposit(groupId, userId, amount) {
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'invalid' };
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  if (user.wallet < amount) return { ok: false, error: 'funds' };
  user.wallet -= amount;
  user.bank += amount;
  saveDB(db);
  return { ok: true, amount, user };
}

function withdraw(groupId, userId, amount) {
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'invalid' };
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  if (user.bank < amount) return { ok: false, error: 'funds' };
  user.bank -= amount;
  user.wallet += amount;
  saveDB(db);
  return { ok: true, amount, user };
}

function transfer(groupId, fromId, toId, amount) {
  if (fromId === toId) return { ok: false, error: 'self' };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'invalid' };

  const db = loadDB();
  const sender = ensureUser(db, groupId, fromId);
  const receiver = ensureUser(db, groupId, toId);
  if (sender.wallet < amount) return { ok: false, error: 'funds' };

  sender.wallet -= amount;
  receiver.wallet += amount;
  saveDB(db);
  return { ok: true, amount, user: sender };
}

function buyItem(groupId, userId, itemId) {
  const item = SHOP.find((s) => s.id === itemId || s.name.toLowerCase().includes(itemId.toLowerCase()));
  if (!item) return { ok: false, error: 'item' };

  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  if (user.wallet < item.price) return { ok: false, error: 'funds', item };

  user.wallet -= item.price;
  user.inventory[item.id] = (user.inventory[item.id] || 0) + 1;
  saveDB(db);
  return { ok: true, item, user };
}

function levelUp(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  const needed = xpForLevel(user.level, MULTIPLIER);

  if (!canLevelUp(user.level, user.xp, MULTIPLIER)) {
    return { ok: false, error: 'xp', needed, have: user.xp, level: user.level };
  }

  const before = user.level;
  user.xp -= needed;
  user.level += 1;
  const reward = 2 + Math.floor(user.level / 3);
  user.diamonds += reward;
  user.role = getRole(user.level).name;
  saveDB(db);

  return {
    ok: true,
    level: user.level,
    before,
    role: user.role,
    diamonds: reward,
    user,
  };
}

function resetBalance(groupId, userId) {
  const db = loadDB();
  ensureUser(db, groupId, userId);
  db[groupId][userId] = defaultUser();
  saveDB(db);
  return true;
}

function resetCoin(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  user.wallet = 0;
  user.bank = 0;
  saveDB(db);
  return true;
}

function resetDi(groupId, userId) {
  const db = loadDB();
  const user = ensureUser(db, groupId, userId);
  user.diamonds = 0;
  saveDB(db);
  return true;
}

function getTop(groupId, limit = 10) {
  const db = loadDB();
  const group = db[groupId] || {};

  return Object.entries(group)
    .map(([jid, raw]) => [jid, migrateUser(raw)])
    .filter(([, user]) => totalWealth(user) > 0)
    .sort((a, b) => totalWealth(b[1]) - totalWealth(a[1]))
    .slice(0, limit);
}

function formatWait(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

function fmtCoins(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function inventorySummary(inventory) {
  const entries = Object.entries(inventory || {}).filter(([, qty]) => qty > 0);
  if (!entries.length) return 'None';
  return entries
    .map(([id, qty]) => {
      const item = SHOP.find((s) => s.id === id);
      return `${item?.emoji || '📦'} ${item?.name || id} x${qty}`;
    })
    .join(', ');
}

module.exports = {
  SHOP,
  getUserData,
  getBalance,
  claimDaily,
  claimWeekly,
  doWork,
  doCrime,
  doMine,
  deposit,
  withdraw,
  transfer,
  buyItem,
  levelUp,
  resetBalance,
  resetCoin,
  resetDi,
  getTop,
  totalWealth,
  xpForLevel,
  tryAutoLevelUp,
  setAutoLevelUp,
  getRole,
  formatLevelUpMessage,
  formatWait,
  fmtCoins,
  inventorySummary,
};