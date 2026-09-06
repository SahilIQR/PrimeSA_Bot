const fs = require('fs');
const path = require('path');
const config = require('../config');

// Lightweight in-memory memory manager with optional persistence
// Stores per-user short profile and recent messages (rolling window)

const PERSIST_PATH = path.join(__dirname, '..', 'data', 'memories.json');
const MAX_MESSAGES = 20;
const MAX_USERS = 2000; // avoid unbounded growth
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for stale user memory

let store = new Map(); // key: normalized jid -> { profile: {...}, messages: [{text,ts}], updated }

function debug(...a){ if (config.debugAI || config.debug) console.debug('[MemoryManager]', ...a); }

function now(){ return Date.now(); }

function normalizeJid(jid){ if(!jid) return null; try { return String(jid).split(':')[0]; }catch(e){ return jid; } }

function load(){
  try{
    if (fs.existsSync(PERSIST_PATH)){
      const raw = fs.readFileSync(PERSIST_PATH,'utf8');
      const obj = JSON.parse(raw || '{}');
      for(const k of Object.keys(obj)){
        const v = obj[k];
        store.set(k, v);
      }
      debug('Loaded memories', store.size);
    }
  }catch(e){ debug('Load failed', e.message); }
}

function persist(){
  try{
    const obj = Object.fromEntries(store);
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(obj, null, 2));
    debug('Persisted memories', Object.keys(obj).length);
  }catch(e){ debug('Persist failed', e.message); }
}

function prune(){
  try{
    const nowTs = now();
    for(const [k,v] of store.entries()){
      if (!v || !v.updated || (nowTs - v.updated) > TTL_MS){
        store.delete(k);
      }
    }
    // cap total users
    if (store.size > MAX_USERS){
      const entries = Array.from(store.entries()).sort((a,b)=> (a[1].updated||0)-(b[1].updated||0));
      while(store.size > MAX_USERS) store.delete(entries.shift()[0]);
    }
  }catch(e){ debug('Prune failed', e.message); }
}

function ensure(user){
  const id = normalizeJid(user);
  if(!id) return null;
  if(!store.has(id)) store.set(id, { profile:{}, messages:[], updated: now() });
  return store.get(id);
}

function addMessage(user, text){
  try{
    if(!user || !text) return;
    const id = normalizeJid(user);
    const entry = ensure(id);
    entry.messages.push({ text: String(text), ts: now() });
    if(entry.messages.length > MAX_MESSAGES) entry.messages.splice(0, entry.messages.length - MAX_MESSAGES);
    entry.updated = now();
    // lightweight extraction of possible profile fields
    extractProfileHints(entry.profile, String(text));
  }catch(e){ debug('addMessage error', e.message); }
}

function extractProfileHints(profile, text){
  if(!text || typeof text !== 'string') return;
  const t = text.toLowerCase();
  // detect simple "i am X" patterns
  const nameMatch = t.match(/\b(?:i am|i'm|im|my name is)\s+([a-zA-Z]{2,20})/i);
  if(nameMatch) profile.name = nameMatch[1];
  const ageMatch = t.match(/\b(\d{1,2})\s*(?:years|yrs|yo)\b/i);
  if(ageMatch) profile.age = ageMatch[1];
  const langMatch = t.match(/\b(english|isiZulu|zulu|xhosa|afrikaans)\b/i);
  if(langMatch) profile.language = langMatch[1].toLowerCase();
  // favorite topics simple
  const topics = [];
  if(t.includes('football')||t.includes('soccer')) topics.push('football');
  if(t.includes('coding')||t.includes('programming')) topics.push('coding');
  if(topics.length) profile.topics = (profile.topics||[]).concat(topics).slice(0,5);
}

function getRecent(user){ const id = normalizeJid(user); const e = store.get(id); return e? e.messages.slice() : []; }
function getProfile(user){ const id = normalizeJid(user); const e = store.get(id); return e? Object.assign({}, e.profile) : {}; }
function clear(user){ const id = normalizeJid(user); if(store.has(id)) store.delete(id); }

// periodic persistence & pruning
load();
setInterval(()=>{ try{ prune(); persist(); }catch(e){} }, 60*1000);

module.exports = { addMessage, getRecent, getProfile, clear, _internal:{ store } };
