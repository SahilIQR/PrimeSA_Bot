// Improved Anti-Delete system
// Requirements addressed:
// - store every incoming message (text, image, video, audio, voice, document, sticker, GIF, contact, location, poll, reaction, view-once, edits)
// - lightweight in-memory cache, per-chat and global limits, TTL (24h default)
// - recover deleted messages immediately, resend original media/text
// - never crash on missing data
// - logging

const {
    downloadContentFromMessage,
    normalizeMessageContent
} = require('@whiskeysockets/baileys');
const { normalizeJidWithLid } = require('./jidHelper');
const DEFAULTS = {
    maxPerChat: 100,
    maxTotal: 2000,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    maxVersions: 5
};

function initAntidelete(sock, opts = {}) {
    if (!sock || !sock.ev) throw new Error('Baileys socket (sock) required');
    if (sock._antideleteInitialized) return; // avoid duplicate listeners
    sock._antideleteInitialized = true;

    const maxPerChat = opts.maxPerChat || DEFAULTS.maxPerChat;
    const maxTotal = opts.maxTotal || DEFAULTS.maxTotal;
    const ttlMs = opts.ttlMs || DEFAULTS.ttlMs;
    const cleanupIntervalMs = opts.cleanupIntervalMs || DEFAULTS.cleanupIntervalMs;
    const maxVersions = opts.maxVersions || DEFAULTS.maxVersions;

    // Map<chatId, Map<messageId, { versions: [{msg,ts}], ts }>>
    const chats = new Map();
    let totalMessages = 0;
    const recoveredIds = new Set();

    const now = () => Date.now();

    const fs = require('fs');
    const path = require('path');
    const config = require('../config');
    const DB_PATH = path.join(__dirname, '../database');

    function readRuntimeFlag() {
        try {
            const RUNTIME_PATH = path.join(DB_PATH, 'runtime.json');
            if (!fs.existsSync(RUNTIME_PATH)) return true; // default enabled
            const raw = fs.readFileSync(RUNTIME_PATH, 'utf8') || '{}';
            const obj = JSON.parse(raw);
            if (typeof obj.antidelete === 'undefined') return true;
            return !!obj.antidelete;
        } catch (e) {
            return true;
        }
    }
    function log(...args) { if (config && config.debug) console.log('[AntiDelete]', ...args); }
    function warn(...args) { console.warn('[AntiDelete]', ...args); }
    function error(...args) { console.error('[AntiDelete]', ...args); }

    const isSystemJid = (jid = '') => {
        if (!jid) return true;
        return jid.includes('@broadcast') || jid.includes('status.broadcast') || jid.includes('@newsletter');
    };

    function ensureChat(jid) {
        if (!chats.has(jid)) chats.set(jid, new Map());
        return chats.get(jid);
    }

    function enforceLimits() {
        try {
            if (totalMessages <= maxTotal) return;
            // Remove oldest across all chats
            const entries = [];
            for (const [jid, chat] of chats.entries()) {
                for (const [id, entry] of chat.entries()) {
                    entries.push({ jid, id, ts: entry.ts });
                }
            }
            entries.sort((a, b) => a.ts - b.ts);
            const toRemove = totalMessages - maxTotal;
            for (let i = 0; i < toRemove && entries[i]; i++) {
                const e = entries[i];
                const chat = chats.get(e.jid);
                if (chat && chat.has(e.id)) {
                    chat.delete(e.id);
                    totalMessages--;
                    if (chat.size === 0) chats.delete(e.jid);
                }
            }
        } catch (e) {
            error('enforceLimits error', e?.message || e);
        }
    }

    function storeMessage(m) {
        try {
            if (!m || !m.key || !m.key.id) return false;
            if (m.key.fromMe) return false;
            const jid = m.key.remoteJid;
            if (!jid || isSystemJid(jid)) return false;

            const chat = ensureChat(jid);
            const id = m.key.id;

            // if already present, push a version (edited messages support)
            if (chat.has(id)) {
                const entry = chat.get(id);
                entry.versions.unshift({ msg: m, ts: now() });
                entry.ts = now();
                // trim versions
                if (entry.versions.length > maxVersions) entry.versions.length = maxVersions;
                log('Updated (edited) message stored:', id, 'chat:', jid);
                return true;
            }

            // new message
            chat.set(id, { versions: [{ msg: m, ts: now() }], ts: now() });
            totalMessages++;

            // per-chat enforcement
            if (chat.size > maxPerChat) {
                // remove oldest in this chat
                let oldestId = null; let oldestTs = Infinity;
                for (const [mid, ent] of chat.entries()) {
                    if (ent.ts < oldestTs) { oldestTs = ent.ts; oldestId = mid; }
                }
                if (oldestId) {
                    chat.delete(oldestId);
                    totalMessages = Math.max(0, totalMessages - 1);
                }
            }

            enforceLimits();
            // helpful debug log (always visible) — lightweight
            try {
                const t = detectMessageType(m);
                console.log('[AntiDelete] Stored message', { chat: jid, id, type: t });
                if (t === 'unknown') {
                    try {
                        const u = unwrapMessage(m) || {};
                        console.log('[AntiDelete] Unknown message keys:', Object.keys(u));
                    } catch (e) { }
                }
            } catch (e) { }
            log('Stored:', id, 'chat:', jid);
            return true;
        } catch (e) {
            error('storeMessage error', e?.message || e);
            return false;
        }
    }

    // Robust unwrapping helper (similar to handler.getMessageContent)
    function unwrapMessage(msg) {
        if (!msg) return null;
        let m = msg.message || msg;

        if (!m) return null;
        try {
            if (m.ephemeralMessage) m = m.ephemeralMessage.message;
            if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
            if (m.viewOnceMessage) m = m.viewOnceMessage.message;
            if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
        } catch (e) {
            // ignore
        }
        return m;
    }

    // Helper to detect message type using unwrapped content
    function detectMessageType(message) {
        const m = unwrapMessage(message);
        if (!m) return 'unknown';

        if (m.conversation || m.extendedTextMessage) return 'text';
        if (m.imageMessage) return 'image';
        if (m.videoMessage) return m.videoMessage.gifPlayback ? 'gif' : 'video';
        if (m.audioMessage) return 'audio';
        if (m.documentMessage) return 'document';
        if (m.stickerMessage) return 'sticker';
        if (m.contactMessage) return 'contact';
        if (m.contactsArrayMessage) return 'contacts';
        if (m.locationMessage || m.liveLocationMessage) return 'location';
        if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) return 'poll';
        if (m.reactionMessage) return 'reaction';

        // Fallback: try to detect any key that ends with 'Message'
        try {
            const keys = Object.keys(m || {});
            const msgKey = keys.find(k => /Message$/.test(k));
            if (msgKey) {
                const k = msgKey.toLowerCase();
                if (k.includes('image')) return 'image';
                if (k.includes('video')) return 'video';
                if (k.includes('audio')) return 'audio';
                if (k.includes('document')) return 'document';
                if (k.includes('sticker')) return 'sticker';
                if (k.includes('contact')) return 'contact';
                if (k.includes('location')) return 'location';
                if (k.includes('buttonsresponse') || k.includes('buttonsresponsemessage')) return 'button';
                if (k.includes('listresponse') || k.includes('list')) return 'list';
            }
        } catch (e) { }

        return 'unknown';
    }
    // Download media buffer (retry)
    async function downloadMediaBuffer(message, maxAttempts = 2) {
        try {
            const content = unwrapMessage(message);

            if (!content) {
                warn('No unwrapped content available');
                return null;
            }

            const mediaTypes = [
                'imageMessage',
                'videoMessage',
                'audioMessage',
                'documentMessage',
                'stickerMessage'
            ];

            const mediaKey = mediaTypes.find(key => content[key]);

            if (!mediaKey) {
                warn('No supported media type found');
                return null;
            }

            const media = content[mediaKey];

            if (!media) {
                warn('Media object missing:', mediaKey);
                return null;
            }

            const mediaType = mediaKey.replace('Message', '').toLowerCase();

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    console.log(
                        `[AntiDelete] Downloading ${mediaType}, attempt ${attempt}`
                    );

                    // Use the unwrapped content object when calling Baileys download
                    // Pass the specific media object (imageMessage/videoMessage/etc.) to Baileys
                    const stream = await downloadContentFromMessage(
                        media,
                        mediaType
                    );

                    const chunks = [];

                    for await (const chunk of stream) {
                        chunks.push(chunk);
                    }

                    const buffer = Buffer.concat(chunks);

                    if (!buffer || buffer.length === 0) {
                        throw new Error('Downloaded media is empty');
                    }

                    console.log(
                        `[AntiDelete] Media downloaded: ${buffer.length} bytes`
                    );

                    return {
                        buffer,
                        mimetype: media.mimetype || 'application/octet-stream',
                        media,
                        mediaType
                    };

                } catch (err) {
                    warn(
                        `[AntiDelete] Download attempt ${attempt} failed:`,
                        err?.message || err
                    );

                    if (attempt < maxAttempts) {
                        await new Promise(resolve =>
                            setTimeout(resolve, 500 * attempt)
                        );
                    }
                }
            }

        } catch (err) {
            error(
                '[AntiDelete] downloadMediaBuffer error:',
                err?.message || err
            );
        }

        return null;
    }

    async function recoverMessage(jid, id, deletedBy) {
        try {
            const chat = chats.get(jid);
            if (!chat) return { ok: false, reason: 'no-chat' };
            const entry = chat.get(id);
            if (!entry) return { ok: false, reason: 'no-entry' };

            const stored = entry.versions[0]?.msg; // latest version
            const content = unwrapMessage(stored);

            if (!content) {
                return {
                    ok: false,
                    reason: 'no-content'
                };
            }
            if (!stored) return { ok: false, reason: 'no-msg' };

            // avoid recovering own messages
            if (stored.key?.fromMe) {
                chat.delete(id);
                totalMessages = Math.max(0, totalMessages - 1);
                if (chat.size === 0) chats.delete(jid);
                return { ok: false, reason: 'fromMe' };
            }

            // The protocol message identifies the participant who revoked it.
            // Fall back to the original sender only for delete events that omit it.
            let senderJid = stored.key.participant || stored.key.remoteJid || jid;
            let recipientJid = deletedBy || senderJid;
            // remove device id suffix if present
            if (typeof senderJid === 'string' && senderJid.includes(':')) senderJid = senderJid.split(':')[0] + (senderJid.includes('@') ? '@' + senderJid.split('@')[1] : '');
            const senderShort = String(senderJid || '').split('@')[0];
            const ts = stored.messageTimestamp ? new Date(stored.messageTimestamp * 1000) : new Date(entry.ts);
            const hhmm = ts.toLocaleTimeString();
            const mtype = detectMessageType(stored);

            const header = `🗑️ *PRIME SA ANTI-DELETE*\n\n━━━━━━━━━━━━━━━━━━\n\n⚠️ A message you sent was deleted.\n\n👤 *Sender:* @${senderShort}\n💬 *Type:* ${mtype.toUpperCase()}\n⏰ *Time:* ${hhmm}\n\n━━━━━━━━━━━━━━━━━━\n\n🔄 *Recovering your deleted message...*`;

            // Decide target: send recovered content back to the original sender privately ONLY.
            // Resolve LID/hosted JIDs via shared helper to preferred PN JID when possible
            let targetJid = recipientJid;
            try {
                const resolved = normalizeJidWithLid(senderJid);
                if (resolved) targetJid = resolved;
            } catch (e) {
                // ignore
            }

            // Safety: ensure targetJid is a personal JID (not group, not broadcast/newsletter)
            const isSafePrivate = !!(targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us') && !isSystemJid(targetJid));
            if (!isSafePrivate) {
                console.log('[AntiDelete] Cannot safely resolve original sender. Recovery cancelled. targetJid=', targetJid);
                return { ok: false, reason: 'cannot-resolve-sender' };
            }

            // send header to original sender
            try {
                await sock.sendMessage(targetJid, { text: header, mentions: [] });
            } catch (e) { warn('failed to send antidelete header to original sender', e?.message || e); }

            // Handle text
            if (mtype === 'text') {
                const text =
                    content.conversation ||
                    content.extendedTextMessage?.text ||
                    content.imageMessage?.caption ||
                    content.videoMessage?.caption ||
                    content.documentMessage?.caption ||
                    '';

                try {
                    await sock.sendMessage(targetJid, { text });
                } catch (e) {
                    warn('failed to send recovered text', e?.message || e);
                }

            } else if (
                ['image', 'video', 'audio', 'document', 'sticker'].includes(mtype)
            ) {

                const dl = await downloadMediaBuffer(stored, 2);

                if (!dl?.buffer) {
                    warn('[AntiDelete] Could not download media:', id);
                    return {
                        ok: false,
                        reason: 'media-download-failed'
                    };
                }

                const media = dl.media;

                try {

                    if (mtype === 'image') {
                        try {
                            await sock.sendMessage(targetJid, {
                                image: dl.buffer,
                                mimetype: dl.mimetype,
                                caption: media.caption || ''
                            });
                        } catch (e) {
                            warn('Failed to send recovered image to original sender', e?.message || e);
                            return { ok: false, reason: 'send-failed' };
                        }
                    }

                    else if (mtype === 'video') {
                        try {
                            await sock.sendMessage(targetJid, {
                                video: dl.buffer,
                                mimetype: dl.mimetype || 'video/mp4',
                                caption: media.caption || '',
                                gifPlayback: !!media.gifPlayback
                            });
                        } catch (e) {
                            warn('Failed to send recovered video to original sender', e?.message || e);
                            return { ok: false, reason: 'send-failed' };
                        }
                    }

                    else if (mtype === 'audio') {
                        try {
                            await sock.sendMessage(targetJid, {
                                audio: dl.buffer,
                                mimetype: dl.mimetype || 'audio/mp4',
                                ptt: !!media.ptt
                            });
                        } catch (e) {
                            warn('Failed to send recovered audio to original sender', e?.message || e);
                            return { ok: false, reason: 'send-failed' };
                        }
                    }

                    else if (mtype === 'document') {
                        try {
                            await sock.sendMessage(targetJid, {
                                document: dl.buffer,
                                mimetype: dl.mimetype || 'application/octet-stream',
                                fileName: media.fileName || 'Recovered_Document'
                            });
                        } catch (e) {
                            warn('Failed to send recovered document to original sender', e?.message || e);
                            return { ok: false, reason: 'send-failed' };
                        }
                    }

                    else if (mtype === 'sticker') {
                        try {
                            await sock.sendMessage(targetJid, { sticker: dl.buffer });
                        } catch (e) {
                            warn('Failed to send recovered sticker to original sender', e?.message || e);
                            return { ok: false, reason: 'send-failed' };
                        }
                    }

                    log(
                        '[AntiDelete] Media recovered successfully:',
                        mtype,
                        id
                    );

                } catch (sendError) {
                    error(
                        '[AntiDelete] Media resend failed:',
                        sendError?.message || sendError
                    );

                    return {
                        ok: false,
                        reason: 'media-send-failed'
                    };
                }
            } else if (mtype === 'contact') {
                try {
                    const c = content.contactMessage || content.contactsArrayMessage;
                    if (c) {
                        // contactsArrayMessage may have contacts array; normalize
                        if (c.vcard) {
                            await sock.sendMessage(targetJid, { contacts: { displayName: c.displayName || '', contacts: [c.vcard] } });
                        } else if (c.contacts) {
                            await sock.sendMessage(targetJid, { contacts: c });
                        } else {
                            warn('recover contact: unknown contact payload');
                        }
                    } else {
                        warn('recover contact: no contact payload found in unwrapped content');
                    }
                } catch (e) { warn('recover contact failed', e?.message || e); }
            } else if (mtype === 'location') {
                try {
                    const l = content.locationMessage || content.liveLocationMessage;
                    if (l) {
                        await sock.sendMessage(targetJid, { location: { degreesLatitude: l.degreesLatitude, degreesLongitude: l.degreesLongitude, name: l.name, address: l.address } });
                    } else {
                        warn('recover location: no location payload found in unwrapped content');
                    }
                } catch (e) { warn('recover location failed', e?.message || e); }
            } else if (mtype === 'reaction') {
                try {
                    const r = content.reactionMessage || stored.message.reactionMessage;
                    if (r) await sock.sendMessage(targetJid, { text: `Reaction: ${r.text} to ${r.key.id}` });
                    else warn('recover reaction: no reaction payload');
                } catch (e) { warn('recover reaction failed', e?.message || e); }
            } else {
                // Fallback: try copyNForward to the target (prefer sender private chat)
                try { await sock.copyNForward(targetJid, stored, true); } catch (e) { warn('fallback copyNForward failed', e?.message || e); }
            }
            // Also resend the recovered message back to the original chat (so group sees it)
            try {
                const originalChat = jid;
                // Avoid double-sending if original sender private chat equals target
                if (originalChat && originalChat !== targetJid) {
                    const groupHeader = `🗑️ *PRIME SA ANTI-DELETE*\n\nA message was deleted in this chat. Recovering original content below.`;
                    try { await sock.sendMessage(originalChat, { text: groupHeader, mentions: [senderJid] }); } catch (_) {}

                    if (mtype === 'text') {
                        const text = content.conversation || content.extendedTextMessage?.text || '';
                        try { await sock.sendMessage(originalChat, { text }); } catch (e) { warn('failed to send recovered text to chat', e?.message || e); }
                    } else if (['image','video','audio','document','sticker'].includes(mtype)) {
                        // try to forward the stored message directly to preserve original metadata
                        try {
                            await sock.copyNForward(originalChat, stored, true);
                        } catch (e) {
                            // fallback to re-uploading downloaded media
                            try {
                                const dl2 = await downloadMediaBuffer(stored, 1);
                                if (dl2 && dl2.buffer) {
                                    if (mtype === 'image') await sock.sendMessage(originalChat, { image: dl2.buffer, mimetype: dl2.mimetype, caption: dl2.media?.caption || '' });
                                    else if (mtype === 'video') await sock.sendMessage(originalChat, { video: dl2.buffer, mimetype: dl2.mimetype || 'video/mp4', caption: dl2.media?.caption || '', gifPlayback: !!dl2.media?.gifPlayback });
                                    else if (mtype === 'audio') await sock.sendMessage(originalChat, { audio: dl2.buffer, mimetype: dl2.mimetype || 'audio/mp4', ptt: !!dl2.media?.ptt });
                                    else if (mtype === 'document') await sock.sendMessage(originalChat, { document: dl2.buffer, mimetype: dl2.mimetype || 'application/octet-stream', fileName: dl2.media?.fileName || 'Recovered_Document' });
                                    else if (mtype === 'sticker') await sock.sendMessage(originalChat, { sticker: dl2.buffer });
                                }
                            } catch (e) { warn('failed to resend media to chat', e?.message || e); }
                        }
                    } else {
                        try { await sock.copyNForward(originalChat, stored, true); } catch (e) { warn('fallback copyNForward to chat failed', e?.message || e); }
                    }
                }
            } catch (e) {
                warn('resend to original chat failed', e?.message || e);
            }

            // cleanup this entry
            chat.delete(id);
            totalMessages = Math.max(0, totalMessages - 1);
            if (chat.size === 0) chats.delete(jid);

            // mark recovered to avoid duplicate processing
            recoveredIds.add(`${jid}|${id}`);

            log('Recovered:', id, 'Media:', mtype, 'Status: SUCCESS');
            return { ok: true };
        } catch (e) {
            error('recoverMessage error', e?.message || e);
            return { ok: false, reason: e?.message || e };
        }
    }

    // messages.upsert -> capture recent messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (type !== 'notify') return;
            if (!messages || !Array.isArray(messages)) return;
            for (const m of messages) {
                try {
                    if (!m || !m.key || !m.key.id) continue;
                    if (m.key.fromMe) continue;
                    // If this upsert contains a protocolMessage (delete/revoke), handle immediately
                    const proto = unwrapMessage(m)?.protocolMessage;
                    if (proto && proto.key) {
                        try {
                            console.log('[AntiDelete] DELETE PROTOCOL RECEIVED');
                            const origKey = proto.key;
                            const origId = origKey.id;
                            const origRemote = origKey.remoteJid || m.key.remoteJid || '';
                            console.log('[AntiDelete] Original message ID:', origId);
                            console.log('[AntiDelete] Original chat:', origRemote);

                            if (!origRemote || !origId) {
                                console.log('[AntiDelete] Protocol message missing original key data');
                                continue;
                            }

                            // check runtime flag: do not recover when disabled
                            if (!readRuntimeFlag()) {
                                log('AntiDelete disabled by runtime flag; skipping protocol recovery');
                                continue;
                            }

                            // prevent duplicate recovery
                            if (recoveredIds.has(`${origRemote}|${origId}`)) {
                                log('Duplicate protocol delete ignored for', origRemote, origId);
                                continue;
                            }

                            console.log('[AntiDelete] Looking for cached original...');

                            const chat = chats.get(origRemote);
                            if (!chat) {
                                console.log('[AntiDelete] Original chat not found in cache:', origRemote);
                                continue;
                            }

                            if (!chat.has(origId)) {
                                console.log('[AntiDelete] Original message not found in cache:', origId);
                                continue;
                            }

                            console.log('[AntiDelete] Original message found');
                            console.log('[AntiDelete] Recovering...');

                            const deletedBy = m.key.participant || m.key.remoteJid;
                            const res = await recoverMessage(origRemote, origId, deletedBy);
                            console.log('[AntiDelete] Recovery result (protocol):', res);
                            if (res && res.ok) recoveredIds.add(`${origRemote}|${origId}`);
                        } catch (e) {
                            error('[AntiDelete] protocol handler error', e?.message || e);
                        }

                        // Do NOT store protocol messages
                        continue;
                    }

                    const j = m.key.remoteJid || '';
                    if (isSystemJid(j)) continue;

                    // Normal message: store for potential recovery
                    storeMessage(m);
                } catch (e) { /* ignore per message */ }
            }
        } catch (e) { error('messages.upsert handler error', e?.message || e); }
    });

    // messages.delete -> recover immediately
    sock.ev.on('messages.delete', async (ev) => {
        try {
            console.log(
                '🗑️ [AntiDelete] DELETE EVENT:',
                JSON.stringify(ev, null, 2)
            );

            const keys = ev?.keys;

            if (!Array.isArray(keys)) {
                console.log('[AntiDelete] Delete event has no keys');
                return;
            }

            for (const key of keys) {

                console.log(
                    '[AntiDelete] Deleted key:',
                    key
                );

                const jid = key.remoteJid;
                const id = key.id;

                if (!jid || !id) {
                    console.log('[AntiDelete] Missing JID or ID');
                    continue;
                }

                // check runtime flag
                if (!readRuntimeFlag()) {
                    log('AntiDelete disabled by runtime flag; skipping');
                    return;
                }

                // avoid duplicate recoveries
                if (recoveredIds.has(`${jid}|${id}`)) {
                    log('Duplicate delete event ignored for', jid, id);
                    continue;
                }

                const chat = chats.get(jid);

                if (!chat) {
                    console.log(
                        '[AntiDelete] Chat not found:',
                        jid
                    );
                    continue;
                }

                if (!chat.has(id)) {
                    console.log(
                        '[AntiDelete] Message not found in cache:',
                        id
                    );
                    continue;
                }

                const result = await recoverMessage(jid, id, key.participant || key.remoteJid);

                console.log(
                    '[AntiDelete] Recovery result:',
                    result
                );
            }

        } catch (err) {
            error(
                '[AntiDelete] Delete event error:',
                err?.message || err
            );
        }
    });

    // Periodic cleanup to remove old messages and free memory
    const cleanupInterval = setInterval(() => {
        try {
            const nowTs = now();
            for (const [jid, chat] of chats.entries()) {
                for (const [id, entry] of chat.entries()) {
                    if (nowTs - entry.ts > ttlMs) {
                        chat.delete(id);
                        totalMessages = Math.max(0, totalMessages - 1);
                    }
                }
                if (chat.size === 0) chats.delete(jid);
            }
            enforceLimits();
        } catch (e) {
            error('antidelete cleanup error', e?.message || e);
        }
    }, cleanupIntervalMs);

    // Clear cleanup interval on socket close
    sock.ev.on('connection.update', (u) => {
        if (u?.connection === 'close') {
            clearInterval(cleanupInterval);
        }
    });

    return {
        _chats: chats,
        _stop: () => clearInterval(cleanupInterval),
        stats: () => ({ chats: chats.size, totalMessages }),
        clear: () => {
            try {
                chats.clear();
                totalMessages = 0;
                recoveredIds.clear();
                return true;
            } catch (e) { return false; }
        }
    };
}

module.exports = { initAntidelete };
