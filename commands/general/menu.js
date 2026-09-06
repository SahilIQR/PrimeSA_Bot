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

// 🇿🇦 South Africa Time / Date (use server time and Africa/Johannesburg timezone)
const saTimeZone = config.timeZone || 'Africa/Johannesburg';
const now = new Date(Date.now());
const timeStr = now.toLocaleTimeString('en-GB', { timeZone: saTimeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dateStr = now.toLocaleDateString('en-GB', { timeZone: saTimeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
const dayStr = now.toLocaleDateString('en-GB', { timeZone: saTimeZone, weekday: 'long' });

// Bot runtime
const uptime = (() => {
    const s = Math.floor(process.uptime());
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
})();

const modeStr = config.selfMode ? 'Private' : 'Public';

// Ping: attempt to measure round-trip using presence update if available
let ping = null;
try {
    if (typeof sock.sendPresenceUpdate === 'function') {
        const start = Date.now();
        // safe no-op: send composing then paused to measure latency
        try { await sock.sendPresenceUpdate('composing', extra.from); } catch (_) {}
        try { await sock.sendPresenceUpdate('paused', extra.from); } catch (_) {}
        ping = Math.max(0, Date.now() - start);
    } else {
        // fallback: approximate processing time
        const start = Date.now();
        ping = Math.max(0, Date.now() - start);
    }
} catch (e) {
    ping = null;
}
            // ===== PRIME SA BOT HEADER (DESIGN 1 — Premium PrimeSA) =====
            let menuText = '';
            menuText += '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
            menuText += '┃     💛💙 𝗣𝗥𝗜𝗠𝗘𝗦𝗔 𝗕𝗢𝗧 💙💛\n';
            menuText += '┃        𝗣𝗥𝗘𝗠𝗜𝗨𝗠 𝗠𝗘𝗡𝗨\n';
            menuText += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n';
            menuText += `👋 Hello, ${userTag}\n\n`;
            menuText += '╭─〔 🖥️ SYSTEM INFO 〕─╮\n';
            menuText += `│ 🤖 Bot       : ${config.botName}\n`;
            menuText += `│ 👑 Owner     : ${displayOwner}\n`;
            menuText += `│ 🔖 Prefix    : ${config.prefix}\n`;
            menuText += `│ 🔐 Mode      : ${modeStr}\n`;
            menuText += `│ ⚡ Ping      : ${ping !== null ? ping + ' ms' : 'N/A'}\n`;
            menuText += `│ ⏱️ Uptime    : ${uptime}\n`;
            menuText += `│ 📦 Commands  : ${unique.size}\n`;
            menuText += `│ ⭐ Version   : ${pkg.version || '1.0.0'}\n`;
            menuText += '╰─────────────────────╯\n\n';

            menuText += '╭─〔 🗓️ DATE & TIME 〕─╮\n';
            menuText += `│ 📅 ${dayStr}\n`;
            menuText += `│ 🗓️ ${dateStr}\n`;
            menuText += `│ 🕒 ${timeStr} 🇿🇦\n`;
            menuText += '╰─────────────────────╯\n\n';

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

            const prettyTitle = (cat) => {
                const map = {
                    ai: 'AI & INTELLIGENCE',
                    media: 'MEDIA & DOWNLOAD',
                    group: 'GROUP MANAGEMENT',
                    admin: 'SECURITY & TOOLS',
                    owner: 'OWNER',
                    fun: 'FUN',
                    economy: 'ECONOMY',
                    utility: 'UTILITY',
                    anime: 'ANIME',
                    textmaker: 'TEXTMAKER',
                    downloader: 'DOWNLOADER',
                    general: 'GENERAL'
                };
                return map[cat] || cat.toUpperCase();
            };

            const renderSection = (title, list) => {
                const icon = ICON_CATEGORIES.has(title) ? (iconMap[title] || '•') : '•';
                const header = `╭─〔 ${icon} ${prettyTitle(title)} 〕─╮\n`;
                let body = '';
                for (const cmd of list) {
                    const em = cmdEmoji(cmd.name, cmd);
                    body += `│ • ${config.prefix}${cmd.name}\n`;
                }
                const footer = '╰───────────────────────────╯\n\n';
                return header + body + footer;
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

            // Footer block
            menuText += '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
            menuText += '┃       🇿🇦 PRIME SA 🇿🇦\n';
            menuText += '┃      POWERED BY SAHIL\n';
            menuText += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n';
            menuText += `💡 Type ${config.prefix}list <command> for more info\n\n`;

            // View Channel handling: only create a button if a real URL is configured
            const channelUrl = (config.social && String(config.social.whatsapp || '').trim()) || null;
            const imagePath = path.join(utilsDir, 'bot_image.jpg');

            // Try to send as template with a URL button if we have a channel URL and Baileys supports templateButtons
            if (channelUrl && channelUrl.startsWith('http')) {
                // Prefer sending image with caption and a template url button when possible
                const templateButtons = [ { urlButton: { displayText: '🌐 VIEW CHANNEL', url: channelUrl } } ];
                try {
                    if (fs.existsSync(imagePath)) {
                        const imageBuffer = fs.readFileSync(imagePath);
                        await sock.sendMessage(extra.from, {
                            image: imageBuffer,
                            caption: menuText,
                            footer: 'PrimeSA',
                            templateButtons,
                            mentions: extra && extra.sender ? [extra.sender] : []
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(extra.from, {
                            text: menuText,
                            footer: 'PrimeSA',
                            templateButtons,
                            mentions: extra && extra.sender ? [extra.sender] : []
                        }, { quoted: msg });
                    }
                } catch (e) {
                    // If templateButtons not supported, fallback to plain send
                    try {
                        if (fs.existsSync(imagePath)) {
                            const imageBuffer = fs.readFileSync(imagePath);
                            await sock.sendMessage(extra.from, { image: imageBuffer, caption: menuText, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
                        } else {
                            await sock.sendMessage(extra.from, { text: menuText + `\n\n🌐 View Channel: ${channelUrl}`, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
                        }
                    } catch (_e) {
                        // final fallback: plain text
                        await sock.sendMessage(extra.from, { text: menuText, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
                    }
                }
            } else {
                // No channel URL configured. Send menu and show notice
                const notice = channelUrl ? `\n\n🌐 View Channel: Not configured` : `\n\n🌐 View Channel: Not configured`;
                if (fs.existsSync(imagePath)) {
                    const imageBuffer = fs.readFileSync(imagePath);
                    await sock.sendMessage(extra.from, { image: imageBuffer, caption: menuText + notice, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
                } else {
                    await sock.sendMessage(extra.from, { text: menuText + notice, mentions: extra && extra.sender ? [extra.sender] : [] }, { quoted: msg });
                }
            }

        } catch (error) {
            console.error('[menu] error', error?.message || error);
            try { await extra.reply(`❌ Error: ${error.message}`); } catch { };
        }
    }
};
