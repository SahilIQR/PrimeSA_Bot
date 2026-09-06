const MULTIPLIER = 1;

const ROLES = [
  { min: 1, name: 'Newbie' },
  { min: 5, name: 'Rookie' },
  { min: 10, name: 'Scout' },
  { min: 15, name: 'Adventurer' },
  { min: 20, name: 'Warrior' },
  { min: 25, name: 'Knight' },
  { min: 30, name: 'Champion' },
  { min: 40, name: 'Elite' },
  { min: 50, name: 'Master' },
  { min: 60, name: 'Grandmaster' },
  { min: 70, name: 'Legend' },
  { min: 80, name: 'Mythic' },
  { min: 90, name: 'Immortal' },
  { min: 100, name: 'Deity' },
];

function xpForLevel(level, multiplier = MULTIPLIER) {
  return Math.floor(level * 150 * multiplier);
}

function canLevelUp(level, xp, multiplier = MULTIPLIER) {
  return xp >= xpForLevel(level, multiplier);
}

function getRole(level) {
  let role = ROLES[0];
  for (const entry of ROLES) {
    if (level >= entry.min) role = entry;
  }
  return { name: role.name, min: role.min };
}

function formatLevelUpMessage(before, after, role, diamondsEarned = 0) {
  let text =
    `*▢ LEVEL UP!*\n\n` +
    `*${before}* ➜ *${after}*\n` +
    `Rank: *${role}*`;
  if (diamondsEarned > 0) text += `\nReward: *+${diamondsEarned}* 💎`;
  return text;
}

module.exports = {
  MULTIPLIER,
  ROLES,
  xpForLevel,
  canLevelUp,
  getRole,
  formatLevelUpMessage,
};
