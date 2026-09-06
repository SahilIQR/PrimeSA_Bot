/**
 * Status Recovery Utility
 * -----------------------
 * Saves WhatsApp Status updates that the bot receives.
 *
 * Features:
 * - Save status information
 * - Save status media
 * - Get saved statuses
 * - Get a specific status
 * - Delete a saved status
 * - Clear all saved statuses
 *
 * Database:
 * database/statusRecovery.json
 *
 * Media:
 * database/statuses/
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

const DB_PATH = path.join(__dirname, '../database');
const STATUS_FILE = path.join(DB_PATH, 'statusRecovery.json');
const MEDIA_PATH = path.join(DB_PATH, 'statuses');

function isStatusRecoveryEnabled() {
    try {
        const RUNTIME_PATH = path.join(DB_PATH, 'runtime.json');
        if (!fs.existsSync(RUNTIME_PATH)) return true; // default enabled
        const raw = fs.readFileSync(RUNTIME_PATH, 'utf8') || '{}';
        const obj = JSON.parse(raw);
        if (typeof obj.statusRecovery === 'undefined') return true;
        return !!obj.statusRecovery;
    } catch (e) {
        return true;
    }
}

function ensureDirectories() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.mkdirSync(DB_PATH, { recursive: true });
        }

        if (!fs.existsSync(MEDIA_PATH)) {
            fs.mkdirSync(MEDIA_PATH, { recursive: true });
        }

        if (!fs.existsSync(STATUS_FILE)) {
            fs.writeFileSync(
                STATUS_FILE,
                JSON.stringify([], null, 2),
                'utf8'
            );
        }
    } catch (e) {
        console.error('[statusRecovery] directory error:', e.message);
    }
}

function load() {
    try {
        ensureDirectories();

        if (!fs.existsSync(STATUS_FILE)) {
            return [];
        }

        const data = JSON.parse(
            fs.readFileSync(STATUS_FILE, 'utf8')
        );

        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('[statusRecovery] load error:', e.message);
        return [];
    }
}

function save(data) {
    try {
        ensureDirectories();

        fs.writeFileSync(
            STATUS_FILE,
            JSON.stringify(data, null, 2),
            'utf8'
        );

        return true;
    } catch (e) {
        console.error('[statusRecovery] save error:', e.message);
        return false;
    }
}

/**
 * Save a received WhatsApp Status.
 *
 * @param {Object} status
 * @returns {Object|null}
 */
function saveStatus(status) {
    try {
        if (!status || !status.sender) {
            return null;
        }

        const statuses = load();

        const id = status.id || `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        const entry = {
            id,
            sender: status.sender,
            senderName: status.senderName || 'Unknown',
            type: status.type || 'unknown',
            caption: status.caption || '',
            mediaPath: status.mediaPath || null,
            timestamp: status.timestamp || Date.now(),
            recovered: false
        };

        statuses.push(entry);

        /*
         * Keep the database from becoming huge.
         * Change 100 to whatever limit you prefer.
         */
        const limited = statuses.slice(-100);

        save(limited);

        return entry;
    } catch (e) {
        console.error('[statusRecovery] saveStatus error:', e.message);
        return null;
    }
}

/**
 * Get one saved Status by ID.
 */
function getStatus(id) {
    try {
        const statuses = load();

        return statuses.find(
            status => String(status.id) === String(id)
        ) || null;
    } catch (e) {
        console.error('[statusRecovery] getStatus error:', e.message);
        return null;
    }
}

/**
 * Get all saved statuses.
 */
function getAllStatuses() {
    return load();
}

/**
 * Get statuses from a specific user.
 */
function getUserStatuses(sender) {
    try {
        return load().filter(
            status => status.sender === sender
        );
    } catch (e) {
        console.error(
            '[statusRecovery] getUserStatuses error:',
            e.message
        );
        return [];
    }
}

/**
 * Mark a Status as recovered.
 */
function markRecovered(id) {
    try {
        const statuses = load();

        const index = statuses.findIndex(
            status => String(status.id) === String(id)
        );

        if (index === -1) {
            return false;
        }

        statuses[index].recovered = true;
        statuses[index].recoveredAt = Date.now();

        return save(statuses);
    } catch (e) {
        console.error(
            '[statusRecovery] markRecovered error:',
            e.message
        );
        return false;
    }
}

/**
 * Delete one saved Status.
 */
function deleteStatus(id) {
    try {
        const statuses = load();

        const status = statuses.find(
            item => String(item.id) === String(id)
        );

        if (!status) {
            return false;
        }

        const filtered = statuses.filter(
            item => String(item.id) !== String(id)
        );

        if (status.mediaPath && fs.existsSync(status.mediaPath)) {
            try {
                fs.unlinkSync(status.mediaPath);
            } catch (e) {
                console.error(
                    '[statusRecovery] media delete error:',
                    e.message
                );
            }
        }

        return save(filtered);
    } catch (e) {
        console.error(
            '[statusRecovery] deleteStatus error:',
            e.message
        );
        return false;
    }
}

/**
 * Clear all saved statuses.
 */
function clearStatuses() {
    try {
        const statuses = load();

        for (const status of statuses) {
            if (
                status.mediaPath &&
                fs.existsSync(status.mediaPath)
            ) {
                try {
                    fs.unlinkSync(status.mediaPath);
                } catch {}
            }
        }

        return save([]);
    } catch (e) {
        console.error(
            '[statusRecovery] clearStatuses error:',
            e.message
        );
        return false;
    }
}

/**
 * Get the media path for a saved Status.
 */
function getMediaPath(id) {
    const status = getStatus(id);

    if (!status || !status.mediaPath) {
        return null;
    }

    if (!fs.existsSync(status.mediaPath)) {
        return null;
    }

    return status.mediaPath;
}

// Initialize status recovery handlers on a Baileys socket
function initStatusRecovery(sock) {
    if (!sock || !sock.ev) throw new Error('Baileys socket required');
    if (sock._statusRecoveryInitialized) {
        // provide API to existing instance
        return sock._statusRecoveryAPI || {
            listStatuses: getAllStatuses,
            getStatus,
            clearStatuses
        };
    }

    sock._statusRecoveryInitialized = true;

    const { load: loadAutoCfg } = require('./autostatus');

    // helper to download media for status message
    async function downloadStatusMedia(message) {
        try {
            if (!message || !message.message) return null;
            const msg = message.message;
            const mediaKey = msg.imageMessage ? 'imageMessage' : msg.videoMessage ? 'videoMessage' : msg.audioMessage ? 'audioMessage' : msg.documentMessage ? 'documentMessage' : null;
            if (!mediaKey) return null;
            const mediaType = mediaKey.replace('Message', '');
            try {
                const stream = await downloadContentFromMessage(msg[mediaKey], mediaType.toLowerCase());
                const parts = [];
                for await (const chunk of stream) parts.push(chunk);
                const buffer = Buffer.concat(parts);
                return { buffer, mimetype: msg[mediaKey].mimetype || null };
            } catch (e) {
                console.error('[statusRecovery] download error:', e?.message || e);
                return null;
            }
        } catch (e) { return null; }
    }

    // store statuses and optionally view/react
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (type && type !== 'notify') return;
            if (!Array.isArray(messages)) return;
            const cfg = loadAutoCfg();
            for (const m of messages) {
                try {
                    if (!m || !m.key) continue;

                    const jid = m.key.remoteJid || '';
                    // Only process WhatsApp status broadcasts.
                    if (jid !== 'status@broadcast') continue;

                    // Save status (text or media)
                    const sender = m.key.participant || (m.key.fromMe ? (sock.user && sock.user.id) : m.key.remoteJid);
                    const normalizedSender = String(sender || '').split(':')[0];
                    const now = Date.now();

                    const entry = {
                        id: `${now}_${Math.random().toString(36).slice(2,8)}`,
                        sender: normalizedSender,
                        senderName: (m.pushName || '')
                    };

                    // Text status
                    const text = m.message?.conversation || m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '';
                    if (text) entry.type = 'text', entry.caption = text;

                    // If media, try download
                    const dl = await downloadStatusMedia(m);
                    if (dl && dl.buffer) {
                        // ensure dirs
                        try { if (!fs.existsSync(MEDIA_PATH)) fs.mkdirSync(MEDIA_PATH, { recursive: true }); } catch (e) {}
                        const fname = `status_${entry.id}`;
                        const ext = dl.mimetype ? dl.mimetype.split('/').pop() : 'bin';
                        const pathfile = path.join(MEDIA_PATH, `${fname}.${ext}`);
                        try { fs.writeFileSync(pathfile, dl.buffer); entry.mediaPath = pathfile; entry.type = entry.type || (dl.mimetype && dl.mimetype.startsWith('image') ? 'image' : dl.mimetype && dl.mimetype.startsWith('video') ? 'video' : 'document'); } catch (e) { console.error('[statusRecovery] write file error', e?.message || e); }
                    }

                    entry.timestamp = now;
                    if (isStatusRecoveryEnabled()) saveStatus(entry);

                    // Auto view
                    if (cfg.view && typeof sock.readMessages === 'function') {
                        try { await sock.readMessages([m.key]); console.log('[AutoStatus] Marked status as viewed for', normalizedSender); } catch (e) { console.error('[AutoStatus] view failed', e?.message || e); }
                    }

                    // Auto react
                    if (cfg.react && cfg.reaction) {
                        try {
                            // Prefer reaction API if available
                            if (typeof sock.sendMessage === 'function') {
                                // Try reaction object
                                try {
                                    await sock.sendMessage('status@broadcast', { react: { text: cfg.reaction, key: m.key } });
                                    console.log('[AutoStatus] Reaction sent via reaction API');
                                } catch (e) {
                                    console.error('[AutoStatus] reaction send failed', e?.message || e);
                                }
                            }
                        } catch (e) { console.error('[AutoStatus] react failed', e?.message || e); }
                    }
                } catch (e) { console.error('[statusRecovery] messages.upsert item error', e?.message || e); }
            }
        } catch (e) { console.error('[statusRecovery] messages.upsert error', e?.message || e); }
    });

    // provide API
    const api = {
        listStatuses: getAllStatuses,
        getStatus,
        clearStatuses
    };

    sock._statusRecoveryAPI = api;

    return api;
}

module.exports = {
    load,
    save,
    saveStatus,
    getStatus,
    getAllStatuses,
    getUserStatuses,
    markRecovered,
    deleteStatus,
    clearStatuses,
    getMediaPath,
    initStatusRecovery
};
