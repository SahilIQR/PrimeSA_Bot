// commands/admin/groupstats.js

const { getStats } = require('../../utils/groupstats');

module.exports = {
    name: 'groupstats',
    aliases: ['stats', 'leaderboard', 'gstats', 'topmembers', 'msgs', 'messagestats'],
    category: 'general',
    description: 'Show today\'s group chat statistics',
    usage: '.groupstats',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const stats = getStats(from);

            if (!stats)
                return extra.reply('📊 No activity recorded today.');

            const { total, users } = stats;

            // top members
            const sortedUsers = Object.entries(users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            let topText = sortedUsers.length
                ? sortedUsers.map(([id, count], i) => `${i + 1}) @${id.split('@')[0]} — ${count} msgs`).join('\n')
                : 'No active users yet.';

            const text = `
📊 *Group Stats — Today*

📌 *Total Messages:* ${total}

👥 *Top Active Members:*
${topText}

Type .myactivity to see your stats.
`.trim();

            await sock.sendMessage(from, {
                text,
                mentions: sortedUsers.map(u => u[0])
            }, { quoted: msg });

        } catch (err) {
            console.error('[groupstats cmd] error:', err);
            extra.reply('❌ Error loading stats.');
        }
    }
};
