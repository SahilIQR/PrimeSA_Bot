/**
 * Command Info (.list)
 * Show details for a specific command
 */

const { loadCommands } = require('../../utils/commandLoader');
const config = require('../../config');

module.exports = {
  name: 'list',
  aliases: ['info', 'cmdinfo'],
  category: 'general',
  description: 'Show detailed info about a command',
  usage: '.list <command>',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();

      const query = String(args[0] || '').trim().toLowerCase();
      if (!query) {
        return extra.reply(`Usage: ${config.prefix}list <command>\nExample: ${config.prefix}list menu`);
      }

      // find by name or alias
      let found = null;
      for (const cmd of commands.values()) {
        if (!cmd || !cmd.name) continue;
        if (cmd.name.toLowerCase() === query) { found = cmd; break; }
        if (Array.isArray(cmd.aliases) && cmd.aliases.map(a=>a.toLowerCase()).includes(query)) { found = cmd; break; }
      }

      if (!found) {
        return extra.reply(`❌ Command not found: ${query}`);
      }

      const aliases = Array.isArray(found.aliases) && found.aliases.length ? found.aliases.join(', ') : 'None';
      const usage = found.usage || `${config.prefix}${found.name}`;
      const desc = found.description || 'No description available.';
      const category = found.category || 'general';
      const flags = [];
      if (found.ownerOnly) flags.push('Owner only');
      if (found.adminOnly) flags.push('Group admin only');
      if (found.groupOnly) flags.push('Group only');
      if (found.privateOnly) flags.push('Private chat only');
      const flagStr = flags.length ? flags.join(' • ') : 'None';

      const out = [
        `📘 Command: ${config.prefix}${found.name}`,
        `🔎 Aliases: ${aliases}`,
        `📂 Category: ${category}`,
        `📝 Description: ${desc}`,
        `⚙️ Usage: ${usage}`,
        `🔐 Flags: ${flagStr}`
      ].join('\n');

      return extra.reply(out);

    } catch (e) {
      console.error('[list] error', e?.message || e);
      try { return extra.reply('❌ Error fetching command info'); } catch {};
    }
  }
};
