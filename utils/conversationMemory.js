// Simple conversation memory store per user
const DEFAULT = () => ({
  messages: [],
  lastTopic: null,
  lastQuestion: null,
  nicknameUsed: null,
  lastReply: null,
  lastActive: Date.now()
});

const store = new Map();

// Limits
const MAX_USERS = 5000; // don't allow unbounded growth
const INACTIVE_MS = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup to remove inactive memories
setInterval(() => {
  try {
    const now = Date.now();
    for (const [userId, mem] of store.entries()) {
      if (!mem || !mem.lastActive) {
        store.delete(userId);
        continue;
      }
      if (now - mem.lastActive > INACTIVE_MS) {
        store.delete(userId);
      }
    }
    // If still too many users, remove oldest by lastActive
    if (store.size > MAX_USERS) {
      const items = Array.from(store.entries()).sort((a, b) => (a[1].lastActive || 0) - (b[1].lastActive || 0));
      const toRemove = store.size - MAX_USERS;
      for (let i = 0; i < toRemove; i++) store.delete(items[i][0]);
    }
  } catch (e) {
    // ignore cleanup errors
  }
}, 5 * 60 * 1000);

function getMemory(userId){
  if(!userId) return DEFAULT();
  if(!store.has(userId)) store.set(userId, DEFAULT());
  return store.get(userId);
}

function appendMessage(userId, msg, limit=50){
  if(!userId) return;
  const mem = getMemory(userId);
  mem.lastActive = Date.now();
  mem.messages.push(msg);
  if(mem.messages.length>limit) mem.messages.shift();
}

function setLastTopic(userId, topic){
  const mem = getMemory(userId); mem.lastTopic = topic; mem.lastActive = Date.now();
}
function setLastQuestion(userId, q){ const mem = getMemory(userId); mem.lastQuestion = q; mem.lastActive = Date.now(); }
function setNicknameUsed(userId, n){ const mem = getMemory(userId); mem.nicknameUsed = n; mem.lastActive = Date.now(); }
function setLastReply(userId, r){ const mem = getMemory(userId); mem.lastReply = r; mem.lastActive = Date.now(); }

function clearMemory(userId){ if(store.has(userId)) store.delete(userId); }

module.exports = { getMemory, appendMessage, setLastTopic, setLastQuestion, setNicknameUsed, setLastReply, clearMemory, _internal: store };
