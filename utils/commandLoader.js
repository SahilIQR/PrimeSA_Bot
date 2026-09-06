/**
 * Command Loader - Separate module to avoid circular dependencies
 */

const fs = require('fs');
const path = require('path');

function registerRegistryCommands(commands, modulePath, label) {
  try {
    const list = require(modulePath);
    for (const cmd of list) {
      if (!cmd?.name) continue;
      commands.set(cmd.name, cmd);
      cmd.aliases?.forEach((alias) => commands.set(alias, cmd));
    }
  } catch (error) {
    console.error(`Error loading ${label} commands:`, error.message);
  }
}

function registerFunCommands(commands) {
  registerRegistryCommands(commands, './funCommands', 'fun');
}

function registerEconomyCommands(commands) {
  registerRegistryCommands(commands, './economyCommands', 'economy');
}

const loadCommands = () => {
  const commands = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.log('Commands directory not found');
    return commands;
  }
  
  const categories = fs.readdirSync(commandsPath);
  
  categories.forEach(category => {
    const categoryPath = path.join(commandsPath, category);
    if (fs.statSync(categoryPath).isDirectory()) {
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
      
      files.forEach(file => {
        try {
          const command = require(path.join(categoryPath, file));
          if (command.name) {
            // Validate command shape
            if (typeof command.execute !== 'function') {
              console.error(`Invalid command '${command.name}' in ${category}/${file}: missing execute function. Skipping.`);
              return;
            }
            // Handle duplicate command names/aliases gracefully.
            // Prefer commands from 'music' category when conflicts occur.
            const existing = commands.get(command.name);
            if (existing) {
              if (command.category === 'music' && existing.category !== 'music') {
                // Replace existing with music command
                commands.set(command.name, command);
              } else {
                // Keep existing and skip registering duplicate name
                console.log(`Skipping duplicate command name: ${command.name} (from ${category})`);
              }
            } else {
              commands.set(command.name, command);
            }

            if (command.aliases) {
              command.aliases.forEach(alias => {
                const existingAlias = commands.get(alias);
                if (existingAlias) {
                  if (command.category === 'music' && existingAlias.category !== 'music') {
                    commands.set(alias, command);
                  } else {
                    // Skip overwriting existing alias
                    // console.log(`Skipping duplicate alias: ${alias} (from ${category})`);
                  }
                } else {
                  commands.set(alias, command);
                }
              });
            }
          }
        } catch (error) {
          console.error(`Error loading command ${file}:`, error.message);
        }
      });
    }
  });
  
  registerFunCommands(commands);
  registerEconomyCommands(commands);
  return commands;
};

module.exports = { loadCommands, registerFunCommands, registerEconomyCommands };

