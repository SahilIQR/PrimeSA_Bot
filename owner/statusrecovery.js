/**
 * Owner-only status recovery command
 * Usage:
 * .statusrecovery on
 * .statusrecovery off
 * .statusrecovery status
 * .statusrecovery list
 * .statusrecovery clear
 */

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
  name: 'statusrecovery',
  aliases: ['sr','statusrec'],
  category: 'owner',
  description: 'Manage Status Recovery (owner only)',
  usage: '.statusrecovery <on|off|status|list|clear>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args && args[0]) ? String(args[0]).toLowerCase() : '';

      const { initStatusRecovery } = require('../../utils/statusRecovery');
      const sr = initStatusRecovery(sock);

      if (!sub || sub === 'status') {
        const runtime = readRuntime();
        const enabled = !!runtime.statusRecovery;
        const list = sr.listStatuses ? sr.listStatuses() : [];
        return extra.reply(`Status Recovery: *${enabled ? 'ON' : 'OFF'}*\nSaved statuses: *${list.length}*`);
      }

      if (sub === 'on') {
        writeRuntime({ statusRecovery: true });
        return extra.reply('✅ Status Recovery enabled.');
      }

      if (sub === 'off') {
        writeRuntime({ statusRecovery: false });
        return extra.reply('❌ Status Recovery disabled.');
      }

      if (sub === 'list') {
        const list = sr.listStatuses ? sr.listStatuses() : [];
        if (!list || list.length === 0) return extra.reply('📭 No recovered statuses stored.');
        const lines = list.slice(-50).reverse().map(s => `${s.id} — ${s.sender} — ${s.type} — ${new Date(s.savedAt || s.timestamp).toLocaleString()}`);
        return extra.reply(`📱 *Recovered Statuses*\n\n${lines.join('\n')}`);
      }

      if (sub === 'clear') {
        // clear all saved
        const ok = sr.clearStatuses ? sr.clearStatuses() : false;
        if (ok) return extra.reply('✅ All saved statuses and media cleared.');
        return extra.reply('❌ Failed to clear statuses.');
      }

      return extra.reply('Usage: .statusrecovery <on|off|status|list|clear>');

    } catch (e) {
      console.error('[statusrecovery cmd] error:', e);
      return extra.reply('❌ Error executing command.');
    }
  }
};
