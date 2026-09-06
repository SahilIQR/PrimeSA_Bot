const fs = require('fs');
const path = require('path');
const config = require('../config');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'database', 'knowledge.json');

let _raw = {};
let _normalized = [];

function debug(...args){ if (config.DEBUG) console.debug('[KnowledgeManager]', ...args); }

function safeParse(raw){ try { return JSON.parse(raw||'{}'); } catch(e){ return {}; } }

function normalizeText(s){
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g,' ')
    .trim();
}

function reduceRepeatedChars(s){
  // simple normalization like heyyy -> hey
  return s.replace(/(.)\1{2,}/g, '$1$1');
}

function load(){
  try{
    const raw = fs.readFileSync(KNOWLEDGE_PATH,'utf8');
    _raw = safeParse(raw);
  }catch(e){
    console.warn('[KnowledgeManager] failed to load knowledge.json, using empty');
    _raw = {};
  }
  _normalized = Object.keys(_raw).map(k=>{
    const norm = normalizeText(reduceRepeatedChars(k));
    return { raw: k, norm, value: _raw[k] };
  });
  debug('Loaded knowledge entries', _normalized.length);
}

function levenshtein(a,b){
  a=String(a||''); b=String(b||'');
  const m=a.length, n=b.length;
  if(m===0) return n; if(n===0) return m;
  const dp = Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function findAnswer(question){
  if (!question) return { matched:false };
  const q = normalizeText(reduceRepeatedChars(question));

  // score each entry and pick best
  let best = { score: 0, entry: null, type: null };

  for (const e of _normalized) {
    if (!e || !e.norm) continue;
    if (e.norm === q) {
      return { matched: true, answer: e.value, matchType: 'exact', score: 1.0 };
    }

    // startsWith / endsWith
    if (q.startsWith(e.norm) || e.norm.startsWith(q)) {
      if (0.95 > best.score) best = { score: 0.95, entry: e, type: 'startswith' };
      continue;
    }

    // contains
    if (q.includes(e.norm) || e.norm.includes(q)) {
      if (0.85 > best.score) best = { score: 0.85, entry: e, type: 'contains' };
      continue;
    }

    // token overlap (keyword) - multiple keyword support
    const qTokens = new Set(q.split(' ').filter(Boolean));
    const eTokens = e.norm.split(' ').filter(Boolean);
    let common = 0;
    for (const t of eTokens) if (qTokens.has(t)) common++;
    if (common > 0) {
      const score = Math.min(0.8, 0.4 + (common / Math.max(eTokens.length, 1)) * 0.5);
      if (score > best.score) best = { score, entry: e, type: 'keyword' };
    }

    // fuzzy similarity
    const maxLen = Math.max(q.length, e.norm.length) || 1;
    const dist = levenshtein(q, e.norm);
    const sim = 1 - (dist / maxLen);
    const fuzzyScore = sim * 0.7; // lower weight for fuzzy
    if (fuzzyScore > best.score) best = { score: fuzzyScore, entry: e, type: 'fuzzy' };
  }

  if (best.entry && best.score >= 0.4) {
    return { matched: true, answer: best.entry.value, matchType: best.type, score: best.score };
  }

  return { matched: false };
}

load();

module.exports = { findAnswer, _internal:{ _raw, _normalized }, reload: load };
