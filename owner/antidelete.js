const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '../../database');
const RUNTIME_PATH = path.join(DB_PATH, 'runtime.json');

function readRuntime() {
  try {
    if (fs.existsSync(RUNTIME_PATH)) {
      const raw = fs.readFileSync(RUNTIME_PATH, 'utf8') || '{}';
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

function writeRuntime(obj) {
  try {
    if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
    const cur = readRuntime();
    const merged = { ...cur, ...obj };
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

module.exports = {
  name: 'antidelete',
  aliases: ['ad','antidel'],
  category: 'owner',
  description: 'Manage Anti-Delete (owner only)',
  usage: '.antidelete <on|off|status|clear>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args && args[0]) ? String(args[0]).toLowerCase() : '';

      const { initAntidelete } = require('../../utils/antidelete');
      const ad = initAntidelete(sock);

      if (!sub || sub === 'status') {
        const runtime = readRuntime();
        const enabled = !!runtime.antidelete;
        const stats = ad && ad.stats ? ad.stats() : { chats: 0, totalMessages: 0 };
        return extra.reply(`🛡️ *ANTI-DELETE STATUS*\n\nStatus: *${enabled ? '✅ Enabled' : '❌ Disabled'}*\nCached chats: *${stats.chats}*\nCached messages: *${stats.totalMessages || 0}*\nMaximum per chat: *100*\nMaximum total: *2000*\nRetention: *24 hours*`);
      }

      if (sub === 'on') {
        writeRuntime({ antidelete: true });
        // ensure initialized
        initAntidelete(sock);
        return extra.reply('✅ *Anti-Delete enabled.*\n\nDeleted messages will now be recovered and privately sent to their original sender.');
      }

      if (sub === 'off') {
        writeRuntime({ antidelete: false });
        return extra.reply('❌ *Anti-Delete disabled.*');
      }

      if (sub === 'clear') {
        const ok = ad && ad.clear ? ad.clear() : false;
        if (ok) return extra.reply('✅ Anti-Delete cache cleared.');
        return extra.reply('❌ Failed to clear Anti-Delete cache.');
      }

      return extra.reply('Usage: .antidelete <on|off|status|clear>');

    } catch (e) {
      console.error('[antidelete cmd] error:', e);
      return extra.reply('❌ Error executing command.');
    }
  }
};
