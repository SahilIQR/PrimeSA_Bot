/**
 * WhatsApp MD Bot - Main Entry Point
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

// Load environment variables from .env (if present)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv might not be installed in some environments — it's optional
}

    // Recursively search for a protocolMessage object in an incoming node (bounded depth)
    function findProtocolMessage(node, depth = 3) {
        try {
            if (!node || depth <= 0) return null;
            if (typeof node !== 'object') return null;
            if (node.protocolMessage && typeof node.protocolMessage === 'object') return node.protocolMessage;
            // common wrappers
            const wrappers = ['message', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];
            for (const w of wrappers) {
                if (node[w]) {
                    const found = findProtocolMessage(node[w], depth - 1);
                    if (found) return found;
                }
            }
            // also inspect child objects
            for (const k of Object.keys(node)) {
                try {
                    const child = node[k];
                    if (child && typeof child === 'object') {
                        const found = findProtocolMessage(child, depth - 1);
                        if (found) return found;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey'
];

console.log = (...args) => {
    const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
        originalConsoleLog.apply(console, args);
    }
};

console.error = (...args) => {
    const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
        originalConsoleError.apply(console, args);
    }
};

console.warn = (...args) => {
    const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
        originalConsoleWarn.apply(console, args);
    }
};

// Now safe to load libraries
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    downloadContentFromMessage,
    proto
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const handler = require('./handler');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

// Remove Puppeteer cache (if some dependency downloaded Chromium into ~/.cache/puppeteer)
function cleanupPuppeteerCache() {
    try {
        const home = os.homedir();
        const cacheDir = path.join(home, '.cache', 'puppeteer');

        if (fs.existsSync(cacheDir)) {
            console.log('🧹 Removing Puppeteer cache at:', cacheDir);
            fs.rmSync(cacheDir, { recursive: true, force: true });
            console.log('✅ Puppeteer cache removed');
        }
    } catch (err) {
        console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
    }
}
// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
    messages: new Map(), // Use Map instead of plain object
    maxPerChat: 20, // Limit to 20 messages per chat

    bind: (ev) => {
        ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key?.id) continue;

                const jid = msg.key.remoteJid;
                if (!store.messages.has(jid)) {
                    store.messages.set(jid, new Map());
                }

                const chatMsgs = store.messages.get(jid);
                chatMsgs.set(msg.key.id, msg);

                // Aggressive cleanup per chat - keep only recent messages
                if (chatMsgs.size > store.maxPerChat) {
                    // Remove oldest message (first entry in Map)
                    const oldestKey = chatMsgs.keys().next().value;
                    chatMsgs.delete(oldestKey);
                }
            }
        });
    },

    loadMessage: async (jid, id) => {
        return store.messages.get(jid)?.get(id) || null;
    }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
    processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
    const forbiddenPatterns = [
        'closing session',
        'closing open session',
        'sessionentry',
        'prekey bundle',
        'pendingprekey',
        '_chains',
        'registrationid',
        'currentratchet',
        'chainkey',
        'ratchet',
        'signal protocol',
        'ephemeralkeypair',
        'indexinfo',
        'basekey',
        'sessionentry',
        'ratchetkey'
    ];

    let logger;
    try {
        logger = pino({
            level,
            // Fallback transport without pino-pretty (in case not installed)
            transport: process.env.NODE_ENV === 'production' ? undefined : {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    ignore: 'pid,hostname'
                }
            },
            customLevels: {
                trace: 0,
                debug: 1,
                info: 2,
                warn: 3,
                error: 4,
                fatal: 5
            },
            // Redact sensitive fields
            redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
        });
    } catch (err) {
        // Fallback to basic pino without transport
        logger = pino({ level });
    }

    // Wrap log methods to filter
    const originalInfo = logger.info.bind(logger);
    logger.info = (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
        if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
            originalInfo(...args);
        }
    };
    logger.debug = () => { }; // Fully disable debug
    logger.trace = () => { }; // Fully disable trace
    return logger;
};

// Main connection function
async function startBot() {
    // Default session folder (legacy)
    let sessionFolder = `./${config.sessionName}`;
    const sessionFile = path.join(sessionFolder, 'creds.json');

    // NEW: PrimeSA_Session support (dedicated session directory)
    const primeSessionDir = path.join(process.cwd(), 'PrimeSA_Session');
    const primeCredsPath = path.join(primeSessionDir, 'creds.json');
    const primeAuthDir = path.join(primeSessionDir, 'auth_info_baileys');
    let loadedPrimeSession = false;

    try {
        // Ensure the PrimeSA_Session directory exists (requirement 8)
        fs.mkdirSync(primeSessionDir, { recursive: true });
    } catch (e) {}

    // If user uploaded a creds.json into PrimeSA_Session/, prepare it for Baileys
    try {
        if (fs.existsSync(primeCredsPath)) {
            // Ensure auth_info_baileys exists within PrimeSA_Session
            try { fs.mkdirSync(primeAuthDir, { recursive: true }); } catch (e) {}

            const targetCreds = path.join(primeAuthDir, 'creds.json');
            // Do not overwrite an existing auth creds.json inside auth_info_baileys
            if (!fs.existsSync(targetCreds)) {
                // Copy the uploaded creds.json into the auth_info_baileys folder
                try { fs.copyFileSync(primeCredsPath, targetCreds); } catch (e) {}
            }

            // Use PrimeSA_Session as the session folder for useMultiFileAuthState
            sessionFolder = primeSessionDir;
            loadedPrimeSession = true;
            // Requirement 21: log only this on success
            console.log('✅ PrimeSA session loaded successfully');
        } else {
            // Requirement 22: clear message when missing
            console.log('❌ PrimeSA session credentials not found');
            console.log('Expected: PrimeSA_Session/creds.json');
        }
    } catch (e) {
        // Do not reveal sensitive data; fail gracefully and continue with existing flow
        loadedPrimeSession = false;
    }

    // ----- SUPPORT FOR EXTERNAL SESSION SYSTEM -----
    // If local PrimeSA session was NOT loaded, and a sessionID or session API is
    // configured, attempt to download the authenticated multi-file auth state
    // from the session API (useful for Render deployments). Do not run this if
    // we already loaded PrimeSA_Session locally.
    if (!loadedPrimeSession && config.sessionID) {
        try {
            const { downloadSessionBundle } = require('./utils/sessionClient');
            const sessionsBase = config.sessionsDir || './sessions';
            const tmpDest = path.join(process.cwd(), sessionsBase, String(config.sessionID));

            console.log('📡 Attempting to load external session:', config.sessionID);
            const res = await downloadSessionBundle(String(config.sessionID), tmpDest);

            if (res && res.ok && res.loaded === 'multi-file-auth') {
                // We have auth_info_baileys in tmpDest
                const authDir = path.join(tmpDest, 'auth_info_baileys');
                const credsPath = path.join(authDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    try {
                        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        const meId = String(creds.me?.id || '').split(':')[0] || null;
                        const phone = meId ? meId.split('@')[0].replace(/\D/g, '') : null;

                        const targetDir = phone ? path.join(sessionsBase, phone) : path.join(sessionsBase, String(config.sessionID));
                        const targetAuth = path.join(targetDir, 'auth_info_baileys');
                        fs.mkdirSync(targetAuth, { recursive: true });

                        // move files from tmp auth to target
                        for (const f of fs.readdirSync(authDir)) {
                            const src = path.join(authDir, f);
                            const dst = path.join(targetAuth, f);
                            try { fs.renameSync(src, dst); } catch (e) { try { fs.copyFileSync(src, dst); } catch (_) {} }
                        }

                        // set sessionFolder to the target so useMultiFileAuthState loads it
                        sessionFolder = targetDir;
                        console.log('📡 External session loaded into:', sessionFolder);
                    } catch (e) {
                        console.error('📡 Failed to process downloaded session creds:', e?.message || e);
                    }
                } else {
                    console.warn('📡 External session downloaded but no creds.json found in auth_info_baileys. Saved bundle at:', res.path || tmpDest);
                }
            } else if (res && res.ok && res.loaded === 'bundle') {
                console.warn('📡 Session bundle downloaded but not in multi-file auth format. Please provide a multi-file auth export or an API that returns files. Path:', res.path);
            } else {
                console.log('📡 External session not found on session service or could not be loaded. Continuing with local session flow.');
            }
        } catch (e) {
            console.error('📡 Error while attempting to load external session:', e?.message || e);
        }
    }

    // Check if sessionID is provided and process PrimeSABot! format session (legacy)
    if (config.sessionID && config.sessionID.startsWith('PrimeSABot!')) {
        try {
            const [header, b64data] = config.sessionID.split('!');

            if (header !== 'PrimeSABot' || !b64data) {
                throw new Error("❌ Invalid session format. Expected 'PrimeSABot!.....'");
            }

            const cleanB64 = b64data.replace('...', '');
            const compressedData = Buffer.from(cleanB64, 'base64');
            const decompressedData = zlib.gunzipSync(compressedData);

            // Ensure session folder exists
            if (!fs.existsSync(sessionFolder)) {
                fs.mkdirSync(sessionFolder, { recursive: true });
            }

            // Write decompressed session data to creds.json
            fs.writeFileSync(sessionFile, decompressedData, 'utf8');
            console.log('📡 Session : 🔑 Retrieved from PrimeSABot Session');

        } catch (e) {
            console.error('📡 Session : ❌ Error processing PrimeSABot session:', e.message);
            // Continue with normal QR flow if session processing fails
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    // Use suppressed logger for socket
    const suppressedLogger = createSuppressedLogger('silent');

    const sock = makeWASocket({
        version, // explicit WA Web version negotiated with the server
        logger: suppressedLogger,
        printQRInTerminal: false,
        // Use a common desktop browser signature
        browser: ['Chrome', 'Windows', '10.0'],
        auth: state,
        // Memory optimization: prevent loading old messages into RAM
        syncFullHistory: false,
        downloadHistory: false,
        markOnlineOnConnect: false,
        getMessage: async () => undefined // Don't load messages from store
    });

    // Bind store to socket
    store.bind(sock.ev);

    // System JID filter - checks if JID is from broadcast/status/newsletter
    // Declare early so anti-delete cache helpers can use it
    const isSystemJidLocal = (jid) => {
        if (!jid) return true;
        return jid.includes('@broadcast') ||
            jid.includes('status.broadcast') ||
            jid.includes('@newsletter') ||
            jid.includes('@newsletter.');
    };

    // ----- Integrated Anti-Delete (in-memory) -----
    // Do NOT create external utils/antidelete.js — all logic is here
    const ANTI_DELETE_MAX_MESSAGES = 200;
    const ANTI_DELETE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
    const ANTI_DELETE_MAX_MEDIA_SIZE = 30 * 1024 * 1024; // 30 MB per file
    const ANTI_DELETE_MAX_TOTAL_MEDIA = 150 * 1024 * 1024; // 150 MB total

    const antiDeleteDir = path.join(os.tmpdir(), 'primesa_antidelete');
    try { fs.mkdirSync(antiDeleteDir, { recursive: true }); } catch (e) {}

    const ANTI_DELETE_DEBUG = process.env.ANTI_DELETE_DEBUG === 'true';

    // recovered set to prevent duplicate recovery
    const recoveredDeletes = new Set();
    // periodic cleanup for recovered set
    const recoveredCleanupInterval = setInterval(() => {
        recoveredDeletes.clear();
    }, 10 * 60 * 1000);
    sock.ev.on('connection.update', (u) => { if (u?.connection === 'close') clearInterval(recoveredCleanupInterval); });

    // Cache map: key => { id, jid, sender, ts, isGroup, type, text, caption, mediaPath, mimetype, fileName, size, isViewOnce }
    const antiDeleteCache = new Map();
    let antiDeleteTotalMedia = 0;

    function cacheKey(jid, id, participant) { return `${jid}|${participant || ''}|${id}`; }

    function nowTs() { return Date.now(); }

    function pruneAntiDeleteIfNeeded() {
        try {
            // Remove expired entries
            const cutoff = Date.now() - ANTI_DELETE_CACHE_TTL;
            for (const [k, v] of antiDeleteCache) {
                if (v.ts < cutoff) {
                    // remove media file
                    if (v.mediaPath && fs.existsSync(v.mediaPath)) {
                        try { fs.unlinkSync(v.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (v.size || 0)); } catch (e) {}
                    }
                    antiDeleteCache.delete(k);
                }
            }

            // Enforce max messages
            while (antiDeleteCache.size > ANTI_DELETE_MAX_MESSAGES) {
                // remove oldest
                let oldestKey = null; let oldestTs = Infinity;
                for (const [k, v] of antiDeleteCache) {
                    if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
                }
                if (oldestKey) {
                    const v = antiDeleteCache.get(oldestKey);
                    if (v && v.mediaPath && fs.existsSync(v.mediaPath)) {
                        try { fs.unlinkSync(v.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (v.size || 0)); } catch (e) {}
                    }
                    antiDeleteCache.delete(oldestKey);
                } else break;
            }

            // Enforce total media size
            while (antiDeleteTotalMedia > ANTI_DELETE_MAX_TOTAL_MEDIA) {
                // remove oldest media-containing entry
                let oldestKey = null; let oldestTs = Infinity;
                for (const [k, v] of antiDeleteCache) {
                    if (v.mediaPath && v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
                }
                if (oldestKey) {
                    const v = antiDeleteCache.get(oldestKey);
                    if (v && v.mediaPath && fs.existsSync(v.mediaPath)) {
                        try { fs.unlinkSync(v.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (v.size || 0)); } catch (e) {}
                    }
                    antiDeleteCache.delete(oldestKey);
                } else break;
            }
        } catch (e) {
            console.error('[anti-delete] prune error', e?.message || e);
        }
    }

    // Periodic cleanup
    const antiDeleteCleanupInterval = setInterval(pruneAntiDeleteIfNeeded, 5 * 60 * 1000);
    sock.ev.on('connection.update', (u) => { if (u?.connection === 'close') clearInterval(antiDeleteCleanupInterval); });

    // Helper to unwrap message content
    function unwrapMessage(msg) {
        if (!msg) return null;
        let m = msg.message || msg;
        try {
            if (m.ephemeralMessage) m = m.ephemeralMessage.message;
            if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
            if (m.viewOnceMessage) m = m.viewOnceMessage.message;
            if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
        } catch (e) {}
        return m;
    }

    // Async download with size limit to temp file; returns { path, size, mimetype, fileName }
    async function downloadMediaToTemp(message, mediaKey, mediaType) {
        try {
            const media = message[mediaKey];
            if (!media) return null;
            const sizeHint = media.fileLength || media.fileSize || media.size || media.length || 0;
            if (sizeHint && sizeHint > ANTI_DELETE_MAX_MEDIA_SIZE) return { tooLarge: true };

            const tmpName = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            const ext = media.mimetype ? media.mimetype.split('/').pop().replace(/[^a-z0-9]/gi,'') : mediaType;
            const outPath = path.join(antiDeleteDir, `${tmpName}.${ext || 'bin'}`);

            const stream = await downloadContentFromMessage(media, mediaType);
            const writeStream = fs.createWriteStream(outPath);
            let total = 0;

            // Write chunks and await finish to ensure file is complete
            try {
                for await (const chunk of stream) {
                    if (!chunk) continue;
                    const buf = Buffer.from(chunk);
                    total += buf.length;
                    if (total > ANTI_DELETE_MAX_MEDIA_SIZE) {
                        // abort
                        try { writeStream.close(); } catch (_) {}
                        try { fs.unlinkSync(outPath); } catch (_) {}
                        return { tooLarge: true };
                    }
                    if (!writeStream.write(buf)) {
                        await new Promise((res) => writeStream.once('drain', res));
                    }
                }
            } catch (e) {
                try { writeStream.close(); } catch (_) {}
                try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
                return null;
            }

            // end and wait for finish
            await new Promise((resolve, reject) => {
                writeStream.end(() => resolve());
                writeStream.on('error', (err) => {
                    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
                    reject(err);
                });
            });

            const stat = fs.existsSync(outPath) ? fs.statSync(outPath) : null;
            return { path: outPath, size: stat ? stat.size : total, mimetype: media.mimetype || null, fileName: media.fileName || null };
        } catch (e) {
            // cleanup on error
            return null;
        }
    }

    // Cache incoming message (non-blocking). Stores minimal info and downloads media when possible.
    async function cacheIncomingMessage(msg) {
        try {
            if (!msg || !msg.key || !msg.key.id) return;
            const jid = msg.key.remoteJid;
            if (!jid) return;
            if (isSystemJid(jid)) return;
            const id = msg.key.id;
            const participant = msg.key.participant || null;
            const key = cacheKey(jid, id, participant);
            const isGroup = jid.endsWith('@g.us');
            const sender = msg.key.fromMe ? (sock.user && sock.user.id) : (msg.key.participant || msg.key.remoteJid);
            const unwrapped = unwrapMessage(msg);
            if (!unwrapped) return;

            const entry = {
                id,
                jid,
                sender,
                participant,
                ts: nowTs(),
                isGroup,
                isViewOnce: false,
                type: 'unknown',
                text: null,
                caption: null,
                mediaPath: null,
                mimetype: null,
                fileName: null,
                size: 0,
                mediaReady: false,
                mediaPromise: null
            };

            // detect type
            if (unwrapped.conversation || unwrapped.extendedTextMessage) {
                entry.type = 'text';
                entry.text = unwrapped.conversation || unwrapped.extendedTextMessage?.text || '';
            } else if (unwrapped.imageMessage) {
                entry.type = 'image'; entry.caption = unwrapped.imageMessage.caption || '';
            } else if (unwrapped.videoMessage) {
                entry.type = unwrapped.videoMessage.gifPlayback ? 'gif' : 'video'; entry.caption = unwrapped.videoMessage.caption || '';
            } else if (unwrapped.audioMessage) {
                entry.type = 'audio';
            } else if (unwrapped.documentMessage) {
                entry.type = 'document'; entry.caption = unwrapped.documentMessage.caption || '';
            } else if (unwrapped.stickerMessage) {
                entry.type = 'sticker';
            } else if (unwrapped.contactMessage || unwrapped.contactsArrayMessage) {
                entry.type = 'contact';
            } else if (unwrapped.locationMessage || unwrapped.liveLocationMessage) {
                entry.type = 'location';
            }

            // view-once detection
            if (msg.message && (msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension)) {
                entry.isViewOnce = true;
            }

            // Store entry in cache immediately so a fast revoke can find it
            antiDeleteCache.set(key, entry);
            pruneAntiDeleteIfNeeded();

            // If media type, try download asynchronously (respect size limits)
            const mediaKeyMap = { image: 'imageMessage', video: 'videoMessage', gif: 'videoMessage', audio: 'audioMessage', document: 'documentMessage', sticker: 'stickerMessage' };
            const mediaKey = mediaKeyMap[entry.type];
            if (mediaKey && unwrapped[mediaKey]) {
                // schedule download and store promise
                const downloadType = (entry.type === 'gif') ? 'video' : entry.type;
                entry.mediaPromise = (async () => {
                    try {
                        const media = unwrapped[mediaKey];
                        const sizeHint = media.fileLength || media.fileSize || media.size || 0;
                        if (sizeHint && sizeHint > ANTI_DELETE_MAX_MEDIA_SIZE) {
                            // skip downloading large media
                            entry.size = sizeHint; entry.mediaPath = null; entry.mediaReady = false; return;
                        }
                        const dl = await downloadMediaToTemp(unwrapped, mediaKey, downloadType);
                        if (dl && dl.tooLarge) {
                            entry.mediaPath = null; entry.size = (media.fileLength || media.fileSize || 0); entry.mediaReady = false;
                        } else if (dl && dl.path) {
                            entry.mediaPath = dl.path; entry.mimetype = dl.mimetype; entry.fileName = dl.fileName; entry.size = dl.size || 0;
                            antiDeleteTotalMedia += entry.size || 0;
                            entry.mediaReady = true;
                            pruneAntiDeleteIfNeeded();
                        }
                    } catch (e) {
                        // ignore download errors
                        entry.mediaReady = false;
                    }
                })();
            }
        } catch (e) {
            // never crash
            console.error('[anti-delete] cache error', e?.message || e);
        }
    }

    // Recover a deleted message and send back to the original chat
    async function recoverAndSend(jid, id, origParticipant, deleter) {
        try {
            // Try to locate cached entry using multiple candidate participant forms to handle PN/LID/device id differences
            const findCached = (jid, id, participant) => {
                const tried = [];
                const candidates = [];
                if (participant) candidates.push(participant);
                // strip device id if present (e.g., 12345:0@s.whatsapp.net)
                try { if (participant && participant.includes(':')) candidates.push(participant.split(':')[0]); } catch (e) {}
                // also try null/empty participant (private chats or different representations)
                candidates.push(null);

                for (const p of candidates) {
                    const k = cacheKey(jid, id, p);
                    tried.push(k);
                    if (antiDeleteCache.has(k)) return { key: k, entry: antiDeleteCache.get(k) };
                }

                // Last resort: search cache for matching jid+id ignoring participant or by id with relaxed jid matching
                let candidate = null;
                for (const [k, v] of antiDeleteCache) {
                    try {
                        if (!v) continue;
                        if (v.jid === jid && v.id === id) return { key: k, entry: v };
                        // relaxed: same id and similar jid base (phone or group id)
                        if (v.id === id) {
                            const a = String(v.jid || '').split('@')[0];
                            const b = String(jid || '').split('@')[0];
                            if (a === b || (a && b && (a.endsWith(b) || b.endsWith(a)))) {
                                // prefer most recent
                                if (!candidate) candidate = { key: k, entry: v };
                                else if (v.ts > candidate.entry.ts) candidate = { key: k, entry: v };
                            }
                        }
                    } catch (e) {}
                }
                if (candidate) return candidate;
                // Final fallback: any entry with matching id (most recent)
                let anyMatch = null;
                for (const [k, v] of antiDeleteCache) {
                    try {
                        if (!v) continue;
                        if (v.id === id) {
                            if (!anyMatch) anyMatch = { key: k, entry: v };
                            else if (v.ts > anyMatch.entry.ts) anyMatch = { key: k, entry: v };
                        }
                    } catch (e) {}
                }
                if (anyMatch) return anyMatch;
                return null;
            };

            const participant = origParticipant || null;
            let found = findCached(jid, id, participant);
            // If not in antiDeleteCache, attempt to fallback to lightweight store and cache it
            if (!found) {
                try {
                    const stored = await store.loadMessage(jid, id);
                    if (stored) {
                        // cache the stored message (non-blocking but await to ensure cache exists)
                        try {
                            await cacheIncomingMessage(stored);
                        } catch (e) {}
                        // re-check cache
                        found = findCached(jid, id, participant);
                    }
                } catch (e) {}
            }
            if (!found) {
                if (ANTI_DELETE_DEBUG) {
                    try {
                        console.log('[anti-delete] cache miss diagnostics:', {
                            query: { jid, id, participant },
                            antiDeleteCacheSize: antiDeleteCache.size,
                            antiDeleteCacheKeysSample: Array.from(antiDeleteCache.keys()).slice(0, 10),
                            storeHasJid: !!store.messages.get(jid),
                            storeKeysSample: store.messages.get(jid) ? Array.from(store.messages.get(jid).keys()).slice(0, 10) : []
                        });
                    } catch (e) {}
                }
                return { ok: false, reason: 'not_cached' };
            }
            const key = found.key;
            const e = found.entry;
            // Duplicate protection
            if (recoveredDeletes.has(key)) return { ok: false, reason: 'already_recovered' };

            // Determine original sender
            const originalSender = e.sender || participant || jid;

            // Owner protection
            try {
                if (handler && typeof handler.isOwner === 'function' && handler.isOwner(originalSender)) {
                    // purge cache entry
                    try { if (e.mediaPath && fs.existsSync(e.mediaPath)) { fs.unlinkSync(e.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (e.size || 0)); } } catch (err) {}
                    antiDeleteCache.delete(key);
                    return { ok: false, reason: 'owner_ignored' };
                }
            } catch (err) {}

            // Bot protection
            try {
                if (handler && typeof handler.isBotJid === 'function' && handler.isBotJid(originalSender, sock)) {
                    try { if (e.mediaPath && fs.existsSync(e.mediaPath)) { fs.unlinkSync(e.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (e.size || 0)); } } catch (err) {}
                    antiDeleteCache.delete(key);
                    return { ok: false, reason: 'bot_ignored' };
                }
            } catch (err) {}
            // prepare header
            let header = `╭━━━〔 🗑️ ANTI-DELETE 〕━━━╮\n`;
            // Show deleter (who performed the delete) in header if available. e.sender is the original sender.
            if (deleter) {
                try {
                    const deleterShort = String(deleter).split('@')[0];
                    header += `┃ 🧾 Deleted by: @${deleterShort}\n`;
                } catch (e) {
                    header += `┃ 🧾 Deleted message\n`;
                }
            } else if (e && e.sender) {
                const senderShort = String(e.sender).split('@')[0];
                header += `┃ 👤 Sender: @${senderShort}\n`;
            } else {
                header += `┃ 🗑️ Deleted message\n`;
            }
            header += `┃ \n`;
            header += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n`;

            // Mark as recovered to prevent duplicates
            recoveredDeletes.add(key);
            // send header to same chat
            try { await sock.sendMessage(jid, { text: header, mentions: e && e.sender ? [e.sender] : [] }); } catch (_) {}

            // send content
            if (e.type === 'text') {
                const textMsg = `💬 Message:\n${e.text || ''}`;
                try { await sock.sendMessage(jid, { text: textMsg, mentions: e && e.sender ? [e.sender] : [] }); } catch (err) { await sock.sendMessage(jid, { text: '⚠️ Failed to resend deleted text.' }); }
            } else if (['image','video','gif','audio','document','sticker'].includes(e.type)) {
                if (e.mediaPath && fs.existsSync(e.mediaPath)) {
                    try {
                        const buf = fs.readFileSync(e.mediaPath);
                        const sendObj = {};
                        if (e.type === 'image') sendObj.image = buf, sendObj.caption = e.caption || '';
                        else if (e.type === 'video' || e.type === 'gif') sendObj.video = buf, sendObj.caption = e.caption || '', sendObj.mimetype = e.mimetype || undefined, sendObj.gifPlayback = (e.type === 'gif');
                        else if (e.type === 'audio') sendObj.audio = buf, sendObj.mimetype = e.mimetype || undefined, sendObj.ptt = false;
                        else if (e.type === 'document') sendObj.document = buf, sendObj.mimetype = e.mimetype || undefined, sendObj.fileName = e.fileName || 'Recovered';
                        else if (e.type === 'sticker') sendObj.sticker = buf;
                        await sock.sendMessage(jid, sendObj);
                    } catch (err) {
                        try { await sock.sendMessage(jid, { text: `⚠️ Failed to resend deleted ${e.type}.` }); } catch(_){}
                    }
                } else {
                    // no media cached or too large
                    if (e.size && e.size > ANTI_DELETE_MAX_MEDIA_SIZE) {
                        try { await sock.sendMessage(jid, { text: '⚠️ Deleted media was larger than the 30MB anti-delete limit.' }); } catch(_){}
                    } else {
                        try { await sock.sendMessage(jid, { text: '🗑️ A deleted media message was detected, but its media could not be recovered.' }); } catch(_){}
                    }
                }
            } else if (e.type === 'contact') {
                try { await sock.sendMessage(jid, { text: `📇 Deleted contact from ${e.sender || ''}` }); } catch(_){}
            } else if (e.type === 'location') {
                try { await sock.sendMessage(jid, { text: `📍 Deleted location from ${e.sender || ''}` }); } catch(_){}
            } else {
                try { await sock.sendMessage(jid, { text: '🗑️ A message was deleted but could not be recovered.' }); } catch(_){}
            }

            // cleanup entry after recovery
            try { if (e.mediaPath && fs.existsSync(e.mediaPath)) { fs.unlinkSync(e.mediaPath); antiDeleteTotalMedia = Math.max(0, antiDeleteTotalMedia - (e.size || 0)); } } catch (err) {}
            antiDeleteCache.delete(key);
            return { ok: true };
        } catch (err) {
            console.error('[anti-delete] recover error', err?.message || err);
            return { ok: false, reason: err?.message || err };
        }
    }

    // Replace existing messages.update handler below (it was empty) with anti-delete detection
    // We'll set up listeners further down (after messages.upsert) to avoid duplicate registration

    // Watchdog for inactive socket (Baileys bug fix)
    let lastActivity = Date.now();
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    // Update on every message
    sock.ev.on('messages.upsert', () => {
        lastActivity = Date.now();
    });

    // Check every 5 min
    const watchdogInterval = setInterval(async () => {
        if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws.readyState === 1) { // WebSocket open but inactive
            console.log('⚠️ No activity detected. Forcing reconnect...');
            await sock.end(undefined, undefined, { reason: 'inactive' });
            clearInterval(watchdogInterval);
            setTimeout(() => startBot(), 5000); // Slightly longer delay
        }
    }, 5 * 60 * 1000); // Every 5 min check

    // Clear on close/open
    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            lastActivity = Date.now(); // Reset on open
        } else if (connection === 'close') {
            clearInterval(watchdogInterval);
        }
    });

    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n\n📱 Scan this QR code with WhatsApp:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

            // Suppress verbose error output for common stream errors (515, etc.)
            if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
                console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
            } else {
                console.log('Connection closed due to:', errorMessage, '\nReconnecting:', shouldReconnect);
            }

            if (shouldReconnect) {
                setTimeout(() => startBot(), 3000);
            }
        } else if (connection === 'open') {
            console.log('\n✅ PrimeSA_Bot connected successfully!');
            console.log(`📱 PrimeSA_Bot Number: ${sock.user.id.split(':')[0]}`);
            console.log(`🤖 Sahil.s_Bot Name: ${config.botName}`);
            console.log(`⚡ PrimeSA_Prefix: ${config.prefix}`);
            const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
            console.log(`👑 Owner: ${ownerNames}\n`);
            console.log('Bot is ready to receive messages!\n');

            // Set bot status
            if (config.autoBio) {
                await sock.updateProfileStatus(`${config.botName} | Active 24/7`);
            }

            // Initialize anti-call feature
            handler.initializeAntiCall(sock);

            // Initialize auto presence, status recovery and autoreact if available
            try { const { initAutoPresence } = require('./utils/autoPresence'); initAutoPresence(sock); } catch (e) { console.error('AutoPresence init failed', e?.message || e); }
            try { const { initStatusRecovery } = require('./utils/statusRecovery'); initStatusRecovery(sock); } catch (e) { console.error('StatusRecovery init failed', e?.message || e); }
            try { const { initAutoReact } = require('./utils/autoReact'); initAutoReact(sock); } catch (e) { console.error('AutoReact init failed', e?.message || e); }

            // Cleanup old chats (keep only active ones, e.g., last touched <1 day)
            const now = Date.now();
            for (const [jid, chatMsgs] of store.messages.entries()) {
                const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
                if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) { // 1 day old chat
                    store.messages.delete(jid);
                }
            }
            console.log(`🧹 Store cleaned. Active chats: ${store.messages.size}`);
        }
    });

    // Credentials update handler
    sock.ev.on('creds.update', saveCreds);

    // System JID filter - checks if JID is from broadcast/status/newsletter
    const isSystemJid = (jid) => {
        if (!jid) return true;
        return jid.includes('@broadcast') ||
            jid.includes('status.broadcast') ||
            jid.includes('@newsletter') ||
            jid.includes('@newsletter.');
    };

    // Messages handler - Process only new messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Only process "notify" type (new messages), skip "append" (old messages from history)
        if (type !== 'notify') return;

        const REVOKE = proto?.Message?.ProtocolMessage?.Type?.REVOKE;

        // Process messages in the array
        for (const msg of messages) {
            try {
                // Skip if message is invalid or missing key
                if (!msg || !msg.key || !msg.key.id) continue;

                const from = msg.key.remoteJid;
                if (!from) continue;

                // System message filter - ignore broadcast/status/newsletter messages
                if (isSystemJidLocal(from)) continue;

                // If this upsert contains a protocolMessage that is a REVOKE, handle anti-delete here
                const protoMsg = findProtocolMessage(msg);
                if (protoMsg && typeof REVOKE !== 'undefined' && protoMsg.type === REVOKE) {
                    // This is a verified revoke/delete-for-everyone
                    if (ANTI_DELETE_DEBUG) console.log('[anti-delete] REVOKE DETECTED');

                    const orig = protoMsg.key || null;
                    if (!orig || !orig.id || !orig.remoteJid) {
                        if (ANTI_DELETE_DEBUG) console.log('[anti-delete] revoke missing original key');
                        continue;
                    }

                    const origRemote = orig.remoteJid;
                    const origId = orig.id;
                    const participant = orig.participant || null;
                    const deleter = msg.key?.participant || (msg.key?.fromMe ? sock.user?.id : msg.key?.remoteJid) || null;

                    // Try to recover; recoverAndSend will attempt a fallback to store if cache miss occurs
                    const res = await recoverAndSend(origRemote, origId, participant, deleter);
                    if (!res || !res.ok) {
                        if (ANTI_DELETE_DEBUG) {
                            if (res && res.reason === 'not_cached') console.log('[anti-delete] deleted message not found in cache or store:', origId);
                            else if (res && res.reason === 'owner_ignored') console.log('[anti-delete] owner message ignored:', origId);
                            else if (res && res.reason === 'bot_ignored') console.log('[anti-delete] bot message ignored:', origId);
                            else if (res && res.reason === 'already_recovered') console.log('[anti-delete] already recovered or in progress:', origId);
                            else console.log('[anti-delete] recover failed for:', origId, 'reason:', res && res.reason);
                        }
                        continue;
                    }

                    if (ANTI_DELETE_DEBUG) console.log('[anti-delete] recovered deleted message:', origId);
                    // Do not treat this protocol message as a normal message
                    continue;
                }

                // Normal message flow: cache then handle normally
                try { cacheIncomingMessage(msg).catch?.(()=>{}); } catch (_) {}

                // Deduplication: Skip if message has already been processed
                const msgId = msg.key.id;
                if (processedMessages.has(msgId)) continue;

                // Timestamp validation: Only process messages within last 5 minutes
                const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
                let messageAge = 0;
                if (msg.messageTimestamp) {
                    messageAge = Date.now() - (msg.messageTimestamp * 1000);
                    if (messageAge > MESSAGE_AGE_LIMIT) {
                        // Message is too old, skip processing
                        continue;
                    }
                }

                processedMessages.add(msgId);

                // Store message in lightweight store for other features
                if (msg.key && msg.key.id) {
                    if (!store.messages.has(from)) {
                        store.messages.set(from, new Map());
                    }
                    const chatMsgs = store.messages.get(from);
                    chatMsgs.set(msg.key.id, msg);
                    if (chatMsgs.size > store.maxPerChat) {
                        const sortedIds = Array.from(chatMsgs.entries())
                            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
                            .map(([id]) => id);
                        for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
                            chatMsgs.delete(sortedIds[i]);
                        }
                    }
                }

                // Normal message processing
                handler.handleMessage(sock, msg).catch(err => {
                    if (!err.message?.includes('rate-overlimit') && !err.message?.includes('not-authorized')) {
                        console.error('Error handling message:', err.message);
                    }
                });

                // Background tasks
                setImmediate(async () => {
                    if (config.autoRead && from.endsWith('@g.us')) {
                        try { await sock.readMessages([msg.key]); } catch (e) {}
                    }
                    if (from.endsWith('@g.us')) {
                        try {
                            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
                            if (groupMetadata) await handler.handleAntilink(sock, msg, groupMetadata);
                        } catch (error) {}
                    }
                });
            } catch (e) {
                // per-message safe
            }
        }
    });

    // Message receipt updates (silently handled, no logging)
    sock.ev.on('message-receipt.update', () => {
        // Silently handle receipt updates
    });

    // messages.update anti-delete handler removed: messages.upsert handles verified REVOKE protocol messages exclusively

    // Group participant updates (join/leave)
    sock.ev.on('group-participants.update', async (update) => {
        await handler.handleGroupUpdate(sock, update);
    });

    // Handle errors - suppress common stream errors
    sock.ev.on('error', (error) => {
        const statusCode = error?.output?.statusCode;
        // Suppress verbose output for common stream errors
        if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
            // These are usually temporary connection issues, handled by reconnection
            return;
        }
        console.error('Socket error:', error.message || error);
    });

    return sock;
}
// Start the bot
console.log('🚀 Starting PrimeSA_WhatsApp MD Bot...\n');
console.log(`📦 Sahil.s_Bot Name: ${config.botName}`);
console.log(`⚡ PrimeSA_Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

// Proactively delete Puppeteer cache so it doesn't fill disk on panels
cleanupPuppeteerCache();

startBot().catch(err => {
    console.error('Error starting bot:', err);
    process.exit(1);
});
// Handle process termination
process.on('uncaughtException', (err) => {
    // Handle ENOSPC errors gracefully without crashing
    if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
        console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
        const { cleanupOldFiles } = require('./utils/cleanup');
        cleanupOldFiles();
        console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
        return; // Don't crash, just log and continue
    }
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
    // Handle ENOSPC errors gracefully
    if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
        console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
        const { cleanupOldFiles } = require('./utils/cleanup');
        cleanupOldFiles();
        console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
        return; // Don't crash, just log and continue
    }

    // Don't spam console with rate limit errors
    if (err.message && err.message.includes('rate-overlimit')) {
        console.warn('⚠️ Rate limit reached. Please slow down your requests.');
        return;
    }
    console.error('Unhandled Rejection:', err);
});
// Export store for use in commands
module.exports = { store };
