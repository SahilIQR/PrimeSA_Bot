/**
 * Menu Command - Display all available commands (customized)
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');

const pkg = (() => { try { return require('../../package.json'); } catch { return { version: '1.0.0' }; } })();

module.exports = {
    name: 'menu',
    aliases: ['help', 'commands'],
    category: 'general',
    description: 'Show all available commands',
    usage: '.menu',

    async execute(sock, msg, args, extra) {
        try {
            const commands = loadCommands();

            // Build unique commands by main name (avoid duplicates from aliases)
            const unique = new Map();
            for (const cmd of commands.values()) {
                if (!cmd || !cmd.name) continue;
                if (!unique.has(cmd.name)) unique.set(cmd.name, cmd);
            }

            const categories = {};
            for (const cmd of unique.values()) {
                const cat = cmd.category || 'general';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(cmd);
            }

            // sort commands in each category
            for (const k of Object.keys(categories)) categories[k].sort((a, b) => a.name.localeCompare(b.name));

            const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
            const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';

            const userTag = (extra && extra.sender) ? `@${extra.sender.split('@')[0]}` : (extra && extra.pushName ? extra.pushName : 'User');

            // detect voice note availability
            const utilsDir = path.join(__dirname, '../../utils');
            const voiceFiles = ['voicenote.ogg', 'voicenote.mp3', 'voicenote.m4a'];
            let voiceAvailable = null;
            for (const vf of voiceFiles) {
                if (fs.existsSync(path.join(utilsDir, vf))) { voiceAvailable = vf; break; }
            }

// 🇿🇦 South Africa Time / Date
const now = new Date(
    msg?.messageTimestamp
        ? msg.messageTimestamp * 1000
        : Date.now()
);

const saTimeZone = 'Africa/Johannesburg';

const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: saTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

const dateStr = now.toLocaleDateString('en-GB', {
    timeZone: saTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

const dayStr = now.toLocaleDateString('en-GB', {
    timeZone: saTimeZone,
    weekday: 'long'
});

// Bot runtime
const uptime = (() => {
    const s = Math.floor(process.uptime());
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    return `${h}h ${m}m ${sec}s`;
})();

const modeStr = config.selfMode ? 'Private' : 'Public';

// Ping
const ping = msg?.messageTimestamp
    ? Math.max(0, Date.now() - (msg.messageTimestamp * 1000))
    : null;
            // ===== PRIME SA BOT HEADER =====
            let menuText = `
╭━━━〔 💛💙 𝗣𝗿𝗶𝗺𝗲𝗦𝗔 𝗕𝗼𝘁 💙💛 〕━━━⬣
┃ 👋 Welcome ${userTag}
┃
┃ 🗓️ ${dayStr}
┃ 🕒 ${timeStr} 🇿🇦
┃ 📅 ${dateStr}
┃
┣━━━━━━━━━━━━━━━━━━━━⬣
┃ 🤖 Bot     : ${config.botName}
┃ 👑 Owner   : ${displayOwner}
┃ 🔖 Prefix  : ${config.prefix}
┃ 🔐 Mode    : ${modeStr}
┃
┃ ⚡ Ping    : ${ping !== null ? ping + ' ms' : 'N/A'}
┃ ⏱️ Runtime : ${uptime}
┃ 📦 Commands: ${unique.size}
┃ ⭐ Version : ${pkg.version || '1.0.0'}
┃ 🔊 Voice   : ${voiceAvailable ? '.voicenote' : 'Unavailable'}
╰━━━━━━━━━━━━━━━━━━━━⬣

🌟 *Choose a category below* 🌟

`;

            // Small helper to render a section with icons and neat list
            const iconMap = {
                media: '📥',
                ai: '🤖',
                group: '👥',
                admin: '🔒',
                owner: '👑',
                fun: '🎮',
                economy: '💰',
                utility: '🧰',
                anime: '🌸',
                textmaker: '🎨',
                downloader: '📥',
                general: '🧭'
            };

            // Only display emojis for these categories
            const ICON_CATEGORIES = new Set(['admin','ai','anime','fun','general','media','owner','textmaker','utility']);

            // Command-specific emoji hints (common ones). Fallback to bullet
            const cmdEmoji = (name, cmdObj) => {
                // owner-only commands get a crown
                if (cmdObj && cmdObj.ownerOnly) return '-';
                const map = {
                    play: '-', video: '-', facebook: '-', instagram: '-', song: '-', tiktok: '-', youtube: '▶-', spotify: '-', download: '-', story: '-', sticker: '-', tagall: '-', antilink: '-', welcome: '-', tag: '-', ping: '-', help: '-', menu: '-', ai: '-', gpt: '-', imagine: '-', restart: '-', mode: '-', clear: '-', broadcast: '-'
                };
                return map[name] || '•';
            };

            const renderSection = (title, list) => {
                const icon = ICON_CATEGORIES.has(title) ? (iconMap[title] || '•') : '•';
                let txt = `${icon} ${title.toUpperCase()}\n`;
                for (const cmd of list) {
                    const em = cmdEmoji(cmd.name, cmd);
                    txt += `│ ${em} ${config.prefix}${cmd.name}\n`;
                }
                txt += `╰────────────\n\n`;
                return txt;
            };

            // Render known categories in preferred order
            const order = ['general', 'ai', 'group', 'admin', 'owner', 'media', 'fun', 'economy', 'utility', 'anime', 'textmaker'];
            for (const cat of order) {
                if (categories[cat] && categories[cat].length) {
                    menuText += renderSection(cat, categories[cat]);
                }
            }

            // Any other categories
            for (const cat of Object.keys(categories)) {
                if (!order.includes(cat)) menuText += renderSection(cat, categories[cat]);
            }

            menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
            menuText += `💡 Type ${config.prefix}list <command> for more info\n`;
            menuText += `🌐 Bot Version: ${pkg.version || '1.0.0'}\n`;

            // send image if available
            const imagePath = path.join(utilsDir, 'bot_image.jpg');
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                await sock.sendMessage(extra.from, {
                    image: imageBuffer,
                    caption: menuText,
                    mentions: extra && extra.sender ? [extra.sender] : []
                }, { quoted: msg });
            } else {
                await sock.sendMessage(extra.from, { text: menuText, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
            }

        } catch (error) {
            console.error('[menu] error', error?.message || error);
            try { await extra.reply(`❌ Error: ${error.message}`); } catch { };
        }
    }
};
