/**
 * Auto Presence (Typing / Recording) Utility
 * - Reads runtime flags from database/runtime.json
 * - When incoming messages arrive, optionally show 'composing' or 'recording'
 */
const fs = require('fs');
const path = require('path');

const RUNTIME_PATH = path.join(__dirname, '..', 'database', 'runtime.json');

function readRuntime() {
  try {
    if (fs.existsSync(RUNTIME_PATH)) {
      const raw = fs.readFileSync(RUNTIME_PATH, 'utf8') || '{}';
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

function loadConfig() {
  const runtime = readRuntime();
  return {
    autoTyping: !!runtime.autoTyping,
    autoRecording: !!runtime.autoRecording
  };
}

function initAutoPresence(sock) {
  if (!sock || !sock.ev) throw new Error('Baileys socket required');
  if (sock._autoPresenceInitialized) return;
  sock._autoPresenceInitialized = true;

  const cfg = loadConfig();

  const canSendPresence = typeof sock.sendPresenceUpdate === 'function';

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify' || !Array.isArray(messages)) return;
      for (const m of messages) {
        try {
          if (!m || !m.key) continue;
          if (m.key.fromMe) continue;
          const jid = m.key.remoteJid;
          if (!jid) continue;

          // prefer participant when present
          const to = m.key.participant || m.key.remoteJid;

          if (canSendPresence) {
            if (cfg.autoTyping) {
              try {
                await sock.sendPresenceUpdate('composing', to);
                setTimeout(() => sock.sendPresenceUpdate('paused', to).catch(() => {}), 1500);
              } catch (e) {}
            }

            if (cfg.autoRecording) {
              try {
                await sock.sendPresenceUpdate('recording', to);
                setTimeout(() => sock.sendPresenceUpdate('paused', to).catch(() => {}), 2000);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  });
}

module.exports = { initAutoPresence, loadConfig };
