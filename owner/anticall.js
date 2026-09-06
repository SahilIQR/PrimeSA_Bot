/**
 * Anti-Call Command - Enable or disable anti-call system
 */

module.exports = {
  name: 'anticall',
  category: 'owner',
  ownerOnly: true,
  description: 'Enable or disable anti-call system',
  usage: '.anticall on/off',

  async execute(sock, msg, args, extra) {
    if (!args[0]) {
      return extra.reply('Usage: .anticall on/off');
    }

    const option = args[0].toLowerCase();

    if (!['on', 'off'].includes(option)) {
      return extra.reply('Usage: .anticall on/off');
    }

    const enabled = option === 'on';

    // Update the default setting in config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../config.js');
    
    try {
      // Read the current config file
      let configFile = fs.readFileSync(configPath, 'utf8');
      
      // Update the anticall setting
      if (enabled) {
        configFile = configFile.replace(/anticall:\s*false/g, 'anticall: true');
      } else {
        configFile = configFile.replace(/anticall:\s*true/g, 'anticall: false');
      }
      
      // Write the updated config file
      fs.writeFileSync(configPath, configFile);
      
      // Clear the config cache so the next require gets the updated version
      delete require.cache[require.resolve('../../config')];
      
      await extra.reply(
        enabled
          ? '✅ Anti-call enabled. Calls will be auto-rejected & blocked.'
          : '❌ Anti-call disabled.'
      );
    } catch (err) {
      console.error('[anticall cmd] error:', err);
      extra.reply('❌ Error updating anti-call setting.');
    }
  }
};