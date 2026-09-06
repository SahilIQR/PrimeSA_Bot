const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/prime.json');

function load() {
    if (!fs.existsSync(FILE)) {
        const data = {
            enabled: false,
            language: 'english',
            provider: 'gemini'
        };

        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
        return data;
    }

    return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Simple text maker utilities - return styled text variants.
function makeText(style, text) {
    if (!text) return '';
    const s = String(text);
    const st = (style || '').toLowerCase();
    switch (st) {
        case 'boxed': {
            const lines = s.split('\n');
            const width = Math.max(...lines.map(l => l.length));
            const top = '┏' + '━'.repeat(width + 2) + '┓';
            const bottom = '┗' + '━'.repeat(width + 2) + '┛';
            const middle = lines.map(l => '┃ ' + l.padEnd(width, ' ') + ' ┃').join('\n');
            return [top, middle, bottom].join('\n');
        }
        case 'banner': {
            const line = s.split('\n')[0];
            return `${line}\n${'='.repeat(line.length)}`;
        }
        case 'sparkle': {
            return s.split('').map(ch => `✦${ch}✦`).join('');
        }
        case 'fancy': {
            return s.split('').map(c => {
                const code = c.charCodeAt(0);
                if (code >= 33 && code <= 126) return String.fromCharCode(0xFF00 + code - 0x20);
                return c;
            }).join('');
        }
        case 'smallcaps': {
            const map = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' };
            return s.split('').map(c => (map[c.toLowerCase()] || c)).join('');
        }
        case 'scors': {
            const lines = s.split('\n');
            const width = Math.max(...lines.map(l => l.length));
            const top = '╔' + '═'.repeat(width + 2) + '╗';
            const bottom = '╚' + '═'.repeat(width + 2) + '╝';
            const middle = lines.map(l => '║ ' + l.padEnd(width, ' ') + ' ║').join('\n');
            return [top, '╟' + '─'.repeat(width + 2) + '╢', middle, bottom].join('\n');
        }
        case 'neon': {
            // glow effect using block gradients
            const top = '░▒▓ ' + s + ' ▓▒░';
            return top;
        }
        case 'fire': {
            // wrap with fire emojis and emphasize vowels
            const transformed = s.replace(/[aeiouAEIOU]/g, (m) => m + '🔥');
            return `🔥 ${transformed} 🔥`;
        }
        case 'graffiti': {
            // crude graffiti: alternate case + slashes
            const alt = s.split('').map((c,i)=> i%2? c.toUpperCase(): c.toLowerCase()).join('');
            return `~* ${alt} *~`;
        }
        case 'gold': {
            // surround with gold/star emojis
            return `✨🟨 ${s} 🟨✨`;
        }
        case 'matrix': {
            // vertical green characters block look
            const chars = s.split('').map(c => ` ${c} `).join('\n');
            return chars;
        }
        case '3d':
        case '3dtext': {
            // simple 3d shadow by duplicating with offset
            const lines = s.split('\n');
            const shadow = lines.map(l => ' ' + l).join('\n');
            return lines.join('\n') + '\n' + shadow;
        }
        case 'hacker': {
            const map = {a:'4',e:'3',i:'1',o:'0',s:'5',t:'7'};
            return s.split('').map(c => map[c.toLowerCase()] || c).join('');
        }
        case 'sundowns': {
            // sunset theme with emojis
            return `🌇 ${s} 🌅`;
        }
        default:
            return s;
    }
}

function listStyles() {
    return ['boxed','banner','sparkle','fancy','smallcaps','scors','neon','fire','graffiti','gold','matrix','3d','hacker','sundowns'];
}

module.exports = { load, save, makeText, listStyles };
