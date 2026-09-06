// Lightweight in-memory message store optimized for low RAM
// - No per-message timers
// - Single cleanup interval
// - TTL default 30 minutes
// - Max 20 messages per chat

const ID_STORE = new Map(); // Map<msgId, { msg, jid, ts }>
const CHAT_INDEX = new Map(); // Map<jid, Map<msgId, ts>>

const DEFAULTS = {
  ttlMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxPerChat: 20
};

let cleanupInterval = null;

function startCleanup(opts = {}) {
  const ttlMs = opts.ttlMs || DEFAULTS.ttlMs;
  const intervalMs = opts.cleanupIntervalMs || DEFAULTS.cleanupIntervalMs;
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    try {
      const now = Date.now();
      for (const [id, entry] of ID_STORE.entries()) {
        if (now - entry.ts > ttlMs) {
          ID_STORE.delete(id);
          const chatMap = CHAT_INDEX.get(entry.jid);
          if (chatMap) chatMap.delete(id);
        }
      }
      // clean empty chat maps
      for (const [jid, chatMap] of CHAT_INDEX.entries()) {
        if (!chatMap || chatMap.size === 0) CHAT_INDEX.delete(jid);
      }
    } catch (e) {
      // never throw from cleanup
      try { console.error('[messageStore] cleanup error', e?.message || e); } catch {}
    }
  }, intervalMs);
}

// Ensure cleanup starts immediately
startCleanup();

function saveMessage(msg, opts = {}) {
  if (!msg || !msg.key || !msg.key.id) return;
  const id = msg.key.id;
  const jid = msg.key.remoteJid || (msg.key.participant ? msg.key.participant.split(':')[0] : null) || 'unknown';
  const ts = Date.now();

  // store id -> msg
  ID_STORE.set(id, { msg, jid, ts });

  // store per-chat index
  if (!CHAT_INDEX.has(jid)) CHAT_INDEX.set(jid, new Map());
  const chatMap = CHAT_INDEX.get(jid);
  chatMap.set(id, ts);

  // enforce per-chat cap
  const maxPerChat = opts.maxPerChat || DEFAULTS.maxPerChat;
  if (chatMap.size > maxPerChat) {
    // remove oldest entries until within cap
    const items = Array.from(chatMap.entries()).sort((a, b) => a[1] - b[1]);
    const toRemove = items.slice(0, chatMap.size - maxPerChat);
    for (const [oldId] of toRemove) {
      chatMap.delete(oldId);
      ID_STORE.delete(oldId);
    }
  }
}

function getMessage(id) {
  const e = ID_STORE.get(id);
  return e ? e.msg : null;
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  saveMessage,
  getMessage,
  // expose internals for debugging/tests (not recommended for production use)
  _internal: {
    ID_STORE,
    CHAT_INDEX,
    startCleanup,
    stopCleanup
  }
};
