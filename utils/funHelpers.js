const axios = require('axios');
const APIs = require('./api');

function tag(jid) {
  return `@${(jid || '').split('@')[0]}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function percentFromId(id, salt = 0) {
  const base = String(id).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return ((base + salt * 13) % 101 + Math.floor(Math.random() * 5)) % 101;
}

function percentFromPair(a, b, salt = 0) {
  const seed = (String(a) + String(b)).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return Math.abs(((seed * 7 + salt * 17) % 101));
}

function getTargetUser(msg, extra) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentioned = ctx.mentionedJid || [];
  let jid = mentioned[0] || ctx.participant || extra.sender;
  return { jid, tag: tag(jid) };
}

function findParticipant(jid, extra) {
  const participants = extra.groupMetadata?.participants || [];
  if (!jid || !participants.length) return null;
  const userPart = jid.split('@')[0].split(':')[0];
  return participants.find((p) => {
    const idUser = (p.id || '').split('@')[0].split(':')[0];
    const lidUser = (p.lid || '').split('@')[0].split(':')[0];
    const phoneUser = (p.phoneNumber || '').split('@')[0].split(':')[0];
    return p.id === jid || idUser === userPart || lidUser === userPart || phoneUser === userPart;
  }) || null;
}

function getUserName(jid, extra, msg) {
  const participant = findParticipant(jid, extra);
  const notify = (participant?.notify || participant?.name || '').trim();
  if (notify && !/^\d+$/.test(notify) && !notify.startsWith('+')) return notify;

  const ctx = msg?.message?.extendedTextMessage?.contextInfo;
  if (ctx?.participant === jid && ctx?.pushName?.trim()) return ctx.pushName.trim();

  if (participant?.phoneNumber?.includes('@s.whatsapp.net')) {
    return participant.phoneNumber.split('@')[0].split(':')[0];
  }
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.split('@')[0].split(':')[0];
  }

  const fromArgs = (msg?.message?.extendedTextMessage?.text || msg?.message?.conversation || '')
    .replace(/^[^\s]+\s*/, '')
    .trim();
  if (fromArgs && !fromArgs.includes('@') && !/^\d+$/.test(fromArgs)) return fromArgs;

  return 'this person';
}

function nameFromMentionText(msg) {
  const text = msg?.message?.extendedTextMessage?.text || msg?.message?.conversation || '';
  for (const m of text.matchAll(/@([^\s@]+)/g)) {
    const candidate = (m[1] || '').trim();
    if (candidate && !/^\d{5,}$/.test(candidate)) return candidate;
  }
  return null;
}

function getMentionTarget(msg, extra) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentioned = ctx.mentionedJid || [];
  let jid = null;
  if (mentioned.length) jid = mentioned[0];
  else if (ctx.participant) jid = ctx.participant;
  else jid = extra.sender;

  let name = nameFromMentionText(msg);
  if (!name) {
    const participant = findParticipant(jid, extra);
    name = (participant?.notify || participant?.name || '').trim();
  }
  if ((!name || /^\d+$/.test(name)) && ctx?.participant === jid && ctx?.pushName?.trim()) {
    name = ctx.pushName.trim();
  }
  if (!name || /^\d+$/.test(name)) {
    const fallback = getUserName(jid, extra, msg);
    if (fallback !== 'this person') name = fallback;
  }

  return { jid, name, atTag: `@${name || jid.split('@')[0]}` };
}

function getTwoUsers(msg, extra, sock) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentioned = ctx.mentionedJid || [];
  let a = null;
  let b = null;

  if (mentioned.length >= 2) {
    a = mentioned[0];
    b = mentioned[1];
  } else if (mentioned.length === 1) {
    a = mentioned[0];
    b = extra.sender;
  } else if (ctx.participant) {
    a = ctx.participant;
    b = extra.sender;
  } else if (extra.isGroup && extra.groupMetadata?.participants?.length >= 2) {
    const pool = extra.groupMetadata.participants
      .map((p) => p.id)
      .filter((id) => id !== sock.user?.id);
    if (pool.length < 2) return { error: '❌ Not enough members!' };
    const shuffled = pool.sort(() => Math.random() - 0.5);
    a = shuffled[0];
    b = shuffled[1];
  } else {
    return { error: '❌ Use in a group or mention/reply to users!' };
  }

  return { a, b };
}

function parseAiText(data) {
  const raw = data?.result || data?.msg || data?.response || data?.data?.msg;
  if (typeof raw === 'string') {
    return raw.replace(/\*([^*]+)\*/g, '$1').trim().slice(0, 4000);
  }
  if (raw && typeof raw === 'object' && raw.text) {
    return String(raw.text).trim().slice(0, 4000);
  }
  return '';
}

async function askPrinceAi(prompt) {
  const res = await axios.get('https://api.princetechn.com/api/ai/chat', {
    params: { apikey: 'prince_tech_api_azfsbshfb', q: prompt },
    timeout: 30000,
  });
  const text = parseAiText(res.data);
  if (!text) throw new Error('Empty prince response');
  return text;
}

async function askFunAi(prompt) {
  try {
    return await askPrinceAi(prompt);
  } catch (e) {
    console.error('[funAi] prince failed:', e.message);
  }

  try {
    const res = await APIs.chatAI(prompt);
    const text = parseAiText(res);
    if (text) return text;
    throw new Error('Empty shizo response');
  } catch (e) {
    console.error('[funAi] shizo failed:', e.message);
    throw new Error('AI unavailable');
  }
}

async function sendMention(sock, from, msg, text, jids) {
  const unique = [...new Set((jids || []).filter(Boolean))];
  await sock.sendMessage(from, { text, mentions: unique }, { quoted: msg });
}

function resolvePairText(opts, a, b) {
  if (typeof opts.text === 'function') {
    const result = opts.text(tag(a), tag(b), a, b);
    return Array.isArray(result) ? pick(result) : result;
  }
  return pick(opts.text);
}

function createRateCommand(name, aliases, opts) {
  return {
    name,
    aliases,
    category: 'fun',
    description: opts.description,
    usage: opts.usage,
    groupOnly: opts.groupOnly || false,
    async execute(sock, msg, args, extra) {
      try {
        const { jid, tag: t } = getTargetUser(msg, extra);
        const pct = percentFromId(jid, opts.salt || 0);
        const line = pick(opts.lines(pct, t));
        await sendMention(sock, extra.from, msg, line, [jid]);
      } catch (e) {
        console.error(`[${name}]`, e.message);
        await extra.reply('❌ Something went wrong.');
      }
    },
  };
}

function createPairRateCommand(name, aliases, opts) {
  return {
    name,
    aliases,
    category: 'fun',
    description: opts.description,
    usage: opts.usage,
    groupOnly: true,
    async execute(sock, msg, args, extra) {
      try {
        const pair = getTwoUsers(msg, extra, sock);
        if (pair.error) return extra.reply(pair.error);
        const { a, b } = pair;
        const pct = percentFromPair(a, b, opts.salt || 0);
        const line = pick(opts.lines(pct, tag(a), tag(b)));
        await sendMention(sock, extra.from, msg, line, [a, b]);
      } catch (e) {
        console.error(`[${name}]`, e.message);
        await extra.reply('❌ Something went wrong.');
      }
    },
  };
}

function createPairCommand(name, aliases, opts) {
  return {
    name,
    aliases,
    category: 'fun',
    description: opts.description,
    usage: opts.usage,
    groupOnly: true,
    async execute(sock, msg, args, extra) {
      try {
        const pair = getTwoUsers(msg, extra, sock);
        if (pair.error) return extra.reply(pair.error);
        const { a, b } = pair;
        const line = resolvePairText(opts, a, b);
        await sendMention(sock, extra.from, msg, line, [a, b]);
      } catch (e) {
        console.error(`[${name}]`, e.message);
        await extra.reply('❌ Something went wrong.');
      }
    },
  };
}

function createRandomCommand(name, aliases, opts) {
  return {
    name,
    aliases,
    category: 'fun',
    description: opts.description,
    usage: opts.usage,
    groupOnly: opts.groupOnly || false,
    async execute(sock, msg, args, extra) {
      try {
        let text;
        if (opts.build) {
          text = opts.build(args, extra, msg);
        } else if (opts.pool) {
          text = pick(opts.pool);
        }
        if (!text) return extra.reply(opts.empty || '❌ Provide input.');
        const { jid } = opts.mentionTarget ? getTargetUser(msg, extra) : {};
        if (opts.mentionTarget && jid) {
          await sendMention(sock, extra.from, msg, text.replace('{tag}', tag(jid)), [jid]);
        } else {
          await extra.reply(text);
        }
      } catch (e) {
        console.error(`[${name}]`, e.message);
        await extra.reply('❌ Something went wrong.');
      }
    },
  };
}

function createActionCommand(name, aliases, verb, emoji) {
  return {
    name,
    aliases,
    category: 'fun',
    description: `${verb} a user`,
    usage: `.${name} @user`,
    async execute(sock, msg, args, extra) {
      try {
        const { jid, tag: t } = getTargetUser(msg, extra);
        const fromTag = tag(extra.sender);
        await sendMention(
          sock,
          extra.from,
          msg,
          `${emoji} ${fromTag} ${verb} ${t}!`,
          [extra.sender, jid]
        );
      } catch (e) {
        console.error(`[${name}]`, e.message);
        await extra.reply('❌ Something went wrong.');
      }
    },
  };
}

module.exports = {
  tag,
  pick,
  percentFromId,
  percentFromPair,
  getTargetUser,
  getTwoUsers,
  getUserName,
  getMentionTarget,
  findParticipant,
  askFunAi,
  sendMention,
  createRateCommand,
  createPairRateCommand,
  createPairCommand,
  createRandomCommand,
  createActionCommand,
};
