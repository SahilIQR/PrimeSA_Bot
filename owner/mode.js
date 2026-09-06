/**
 * Mode Command
 * Toggle bot between private and public mode
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'mode',
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Toggle bot between private and public mode',
  usage: '.mode <private/public>',
  category: 'owner',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const currentMode = config.selfMode ? 'private' : 'public';
        const description = config.selfMode 
          ? 'Only owner and sudo users can use commands'
          : 'Everyone can use commands';
        
        return extra.reply(
          `🤖 *Bot Mode*\n\n` +
          `Current Mode: *${currentMode.toUpperCase()}*\n` +
          `Status: ${description}\n\n` +
          `Usage:\n` +
          `  .mode private - Only owner and sudo can use\n` +
          `  .mode public - Everyone can use`
        );
      }
      
      const mode = args[0].toLowerCase();
      
      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply('🔒 Bot is already in *PRIVATE* mode.\nOnly owner and sudo can use commands.');
        }
        
        // Update config
        updateConfig('selfMode', true);
        config.selfMode = true; // Update runtime config
        return extra.reply('🔒 Bot mode changed to *PRIVATE*\n\nOnly owner and sudo can use commands now.');
      }
      
      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply('🌐 Bot is already in *PUBLIC* mode.\nEveryone can use commands.');
        }
        
        // Update config
        updateConfig('selfMode', false);
        config.selfMode = false; // Update runtime config
        return extra.reply('🌐 Bot mode changed to *PUBLIC*\n\nEveryone can use commands now.');
      }
      
      return extra.reply('❌ Invalid mode!\nUsage: .mode <private/public>');
      
    } catch (error) {
      console.error('Mode command error:', error);
      await extra.reply('❌ Error changing bot mode.');
    }
  }
};

function updateConfig(key, value) {
  try {
    const configPath = path.join(__dirname, '..', '..', 'config.js');
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    // Update the value
    const regex = new RegExp(`(${key}:\\s*)(true|false)`, 'g');
    configContent = configContent.replace(regex, `$1${value}`);
    
    fs.writeFileSync(configPath, configContent, 'utf8');
    
    // Reload config
    delete require.cache[require.resolve('../../config')];
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

