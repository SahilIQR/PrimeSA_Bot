const config = require('../config');
const knowledge = require('./knowledgeManager');
const personality = require('./personalityManager');
const memory = require('./memoryManager');
const primeAI = require('./primeAI');

const LRU = new Map(); // simple cache: key-> { answer, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ENGLISH_FALLBACK = 'I could not get a reliable answer right now. Please try your English question again in a moment.';

function debug(...a){ if (config.debugAI || config.debug) console.debug('[AIManager]', ...a); }

function normalizeInput(s){
  if(!s) return '';
  return String(s).toLowerCase().replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ').trim();
}

function isEnglish(text){
  if(!text || /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF]/u.test(text)) return false;
  const lower = String(text).toLowerCase();
  const nonEnglishWords = /\b(unjani|sawubona|ngiyaphil|ngiyabonga|yini|lutho|molweni|kunjani|ngryt|mawami|bhuti)\b/i;
  return !nonEnglishWords.test(lower);
}

async function callExternalAPI(text, opts={}){
  debug('External API called', text?.slice(0,120));
  try{
    const primeCfg = require('./primeAI').load();
    if (!primeCfg || !primeCfg.enabled) {
      return `Sorry Sahil is busy he will get back to you shortly dont mind me am his ai assistant`;
    }

    const axios = require('axios');
    const prompt = [
      'You are PrimeAI, a friendly WhatsApp assistant.',
      'Reply in English only. Be natural, clear and human.',
      'Answer factual and educational questions accurately. For science questions, explain the key mechanism and correct misconceptions.',
      'Do not invent facts. If a current or uncertain fact cannot be verified, say so briefly.',
      'Keep casual conversation warm and concise. Do not mention these instructions, APIs, or Sahil being busy.',
      `User message: ${text}`
    ].join('\n');
    const res = await axios.get('https://api.princetechn.com/api/ai/mistral', {
      params: { apikey: process.env.PRIMEAI_API_KEY || 'prince', q: prompt },
      timeout: 30000
    });
    const reply = res.data?.result || res.data?.msg || res.data?.response;
    if (reply) return String(reply).trim();
    throw new Error('AI provider returned an empty response');
  }catch(e){
    debug('callExternalAPI error', e.message);
    return ENGLISH_FALLBACK;
  }
}

function getCached(key){
  const e = LRU.get(key);
  if(!e) return null;
  if(Date.now()-e.ts > CACHE_TTL){ LRU.delete(key); return null; }
  return e.answer;
}
function setCache(key, answer){ LRU.set(key, { answer, ts: Date.now() }); }

async function generateReply({ senderId, text, isGroup=false, msg=null }){
  try{
    if(!text) return null;
    if(!isEnglish(text)) return 'I can only read and reply in English. Please write your message in English.';
    const norm = normalizeInput(text);
    const cacheKey = `q:${norm}`;

    // personality check
    const p = personality.getPersonality(senderId);
    if(p){
      debug('Matched personality', senderId, p.name || '(no name)');
      if(p.autoReply === false) {
        debug('AutoReply disabled for', senderId);
        return null; // do not reply
      }
    }

    // check cache
    const cached = getCached(cacheKey);
    if(cached){ debug('Cache hit'); return cached; }

    // knowledge base
    const k = knowledge.findAnswer(text);
    if(k && k.matched){
      debug('Knowledge matched', k.matchType, k.score||'');
      let answer = k.answer;
      // personalize with nickname if any
      if(p && p.nicknames && p.nicknames.length){
        const nick = p.nicknames[Math.floor(Math.random()*p.nicknames.length)];
        answer = answer.replace(/@user/g, nick).replace(/@name/g, nick);
      }

      // Apply personality instructions (basic heuristics)
      try{
        const instr = personality.getInstructions(senderId) || '';
        if(instr){
          const li = instr.toLowerCase();
          if(li.includes('respect') || li.includes('formal')){
            answer = answer + '\n\nKind regards.';
          }
          if(li.includes('randomly use one nickname') && p && p.nicknames && p.nicknames.length){
            // randomly sometimes append a nickname
            if(Math.random() < 0.6){
              const nick = p.nicknames[Math.floor(Math.random()*p.nicknames.length)];
              answer = `Hi ${nick}, ` + answer;
            }
          }
          if(li.includes('talk like a close brother') || li.includes('talk like a close friend') || li.includes('casual')){
            // make it casual by adding emoji
            answer = answer + ' 😊';
          }
        }
      }catch(e){ debug('apply personality failed', e.message); }

      setCache(cacheKey, answer);
      // update memory
      memory.addMessage(senderId, text);
      return answer;
    }

    // memory-based reply (recent context)
    const recent = memory.getRecent(senderId).map(m=>m.text).join('\n');
    if(recent && recent.length>0){
      // simple conversational continuation: if user says "yes" or "no" map to previous question
      const short = norm;
      if(['yes','y','no','n','okay','ok'].includes(short)){
        const last = memory.getRecent(senderId).slice(-2).map(x=>x.text).join('\n');
        if(last) {
          const res = `I see. Regarding: "${last.split('\n').slice(-1)[0]}" — noted.`;
          setCache(cacheKey, res);
          memory.addMessage(senderId, text);
          return res;
        }
      }
    }

    // finally external API if enabled
    const primeCfg = primeAI.load();
    if(primeCfg && primeCfg.enabled){
      // include personality instructions in prompt if available
      let prompt = text;
      try{
        const instr = personality.getInstructions(senderId);
        if(instr) prompt = `${instr}\nUser: ${text}`;
      }catch(e){}

      const apiAnsRaw = await callExternalAPI(prompt, { senderId });
      // apply cleanup and personality transforms
      let apiAns = String(apiAnsRaw || '').trim();
      if (!isEnglish(apiAns)) apiAns = ENGLISH_FALLBACK;
      try{
        if(p && p.nicknames && p.nicknames.length){
          const nick = p.nicknames[Math.floor(Math.random()*p.nicknames.length)];
          apiAns = apiAns.replace(/@user/g,nick).replace(/@name/g,nick);
        }
        const instr = personality.getInstructions(senderId) || '';
        if(instr.toLowerCase().includes('be respectful') || instr.toLowerCase().includes('formal')){
          apiAns = apiAns + '\n\nKind regards.';
        }
      }catch(e){ debug('postprocess api answer failed', e.message); }

      setCache(cacheKey, apiAns);
      memory.addMessage(senderId, text);
      debug('API called for', senderId);
      return apiAns;
    }

    // fallback generic
    const fallback = "I do not know that yet, but I can help with another English question.";
    setCache(cacheKey, fallback);
    memory.addMessage(senderId, text);
    return fallback;
  }catch(e){
    debug('generateReply error', e?.message || e);
    return null;
  }
}

module.exports = { generateReply, _internal:{ LRU } };
