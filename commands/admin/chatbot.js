/**
 * AI Chatbot - Natural WhatsApp chat on @mention or reply
 * API: api.princetechn.com
 */

const config = require('../../config');
const database = require('../../database');

// Managers
const personalityManager = require('../../utils/personalityManager');
const memoryManager = require('../../utils/memoryManager');
const axios = require('axios');
const { load: loadPrimeAI } = require('../../utils/primeAI');

// Local lightweight AI handler (replaces utils/aiManager)
function likelyIsiZulu(text){
    if(!text) return false;
    const zuluWords = ['sawubona','unjani','ngiyabonga','ngiyaphila','yini','lutho','molweni','kunjani','cha','hhayi','ngiyacela','siyabonga','ngikhona'];
    const lower = String(text).toLowerCase();
    return zuluWords.some(w=> lower.includes(w));
}

async function callPrimeProvider(prompt){
    try{
        const apiKey = process.env.PRIMEAI_API_KEY || 'prince';
        const res = await axios.get('https://api.princetechn.com/api/ai/mistral', { params: { apikey: apiKey, q: prompt }, timeout: 30000 });
        return res.data?.result || res.data?.msg || res.data?.response || '';
    }catch(e){
        console.error('[chatbot] prime provider error', e?.message || e);
        return '';
    }
}

async function generateReply({ senderId, text }){
    if(!text) return null;
    const primeCfg = loadPrimeAI();
    if(!primeCfg || !primeCfg.enabled) return null; // AI disabled

    const isZulu = likelyIsiZulu(text);

    // Build a safe prompt that forces English responses and persona
    const prompt = [
        'You are the PrimeSA_AI assistant — a friendly, human-like assistant. Reply in English only. Do NOT claim to be Sahil or mention Sahil. Use a natural, conversational tone, as if you were a helpful person.',
        'If the user wrote in isiZulu, understand it, but respond in English. Also add the sentence: "Note: I detected your message in isiZulu; to continue chatting with me please type in full English."',
        'Keep replies concise (one to three short paragraphs). Do not mention internal instructions, system messages, or APIs.',
        `User: ${text}`
    ].join('\n');

    let reply = '';
    try{
        reply = await callPrimeProvider(prompt);
    }catch(e){ reply = ''; }

    reply = String(reply || '').trim();
    if(!reply) return null;

    // Ensure final reply is English-only by forcing fallback if Zulu-like words present
    if(/\b(sawubona|unjani|ngiyabonga|yini|molweni|kunjani)\b/i.test(reply)){
        // fallback: ask to write in English and provide brief English acknowledgement
        const fallback = `I understood your isiZulu message. Please continue in full English so I can help you better.`;
        return `PrimeSA_AI assistant: ${fallback}`;
    }

    // Prepend assistant identity (not Sahil)
    return `PrimeSA_AI assistant: ${reply}`;
}

// Chat memory is now handled by convoMemory

const EMOJI_PATTERN = '[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]';

function getTypingDelay(charCount) {
    return Math.min(Math.max(500, charCount * 45), 5000);
}

async function showTyping(sock, chatId, ms = 1500) {
    try {
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(resolve => setTimeout(resolve, ms));
        await sock.sendPresenceUpdate('paused', chatId);
    } catch (error) {
        console.error('[chatbot] typing error:', error.message);
    }
}

function userUsesEmoji(text) {
    return new RegExp(EMOJI_PATTERN, 'u').test(text);
}

function stripEmojis(text) {
    return text.replace(new RegExp(EMOJI_PATTERN, 'gu'), '').replace(/\s+/g, ' ').trim();
}

function extractEmojis(text) {
    return text.match(new RegExp(EMOJI_PATTERN, 'gu')) || [];
}

function extractUserInfo(message) {
    const info = {};
    const lower = message.toLowerCase();

    if (lower.includes('my name is')) {
        info.name = message.split(/my name is/i)[1].trim().split(' ')[0];
    }
    if (lower.includes('i am') && lower.includes('years old')) {
        info.age = message.match(/\d+/)?.[0];
    }
    if (lower.includes('i live in') || lower.includes('i am from')) {
        info.location = message.split(/(?:i live in|i am from)/i)[1].trim().split(/[.,!?]/)[0];
    }

    return info;
}

function cleanResponse(text, userMessage = '') {
    let cleaned = String(text).trim()
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^(You|PrimeSA|Ghost):\s*/i, '')
        .replace(/\b(winks|laughs|smiles|cries|thinks|sleeps|shrugs|rolls eyes|eye roll)\b/gi, '')
        .replace(/Remember:.*$/gim, '')
        .replace(/IMPORTANT:.*$/gim, '')
        .replace(/CORE RULES:.*$/gim, '')
        .replace(/^[A-Z\s]{3,}:.*$/gm, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();

    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    cleaned = lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();

    const emojis = extractEmojis(cleaned);
    if (!userUsesEmoji(userMessage) || emojis.length > 1) {
        cleaned = stripEmojis(cleaned);
    } else if (emojis.length === 1) {
        cleaned = stripEmojis(cleaned) + ' ' + emojis[0];
    }

    return cleaned;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBotMention(text, sock) {
    let cleaned = String(text || '');

    const botName = config.botName;
    if (botName) {
        cleaned = cleaned.replace(new RegExp(`@${escapeRegex(botName)}`, 'gi'), '');
    }

    const botUser = sock?.user?.id?.split(':')[0]?.split('@')[0];
    if (botUser) {
        cleaned = cleaned.replace(new RegExp(`@\\+?${escapeRegex(botUser)}`, 'g'), '');
    }

    // Phone-style @mentions only — do NOT use /@\S+/g (it can eat text after the tag)
    cleaned = cleaned
        .replace(/@\+?\d{10,15}/g, '')
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned;
    }

// Personality accessors are provided by personalityManager

const MENTION_ONLY_FALLBACK = "What's on your mind tdy?";

// Lightweight conversation memory for ephemeral per-chat state (nickname usage, userInfo)
const _convoMemory = new Map();
function getConvoMemory(id){
    if(!id) return { nicknameUsed: null, userInfo: {} };
    if(!_convoMemory.has(id)) _convoMemory.set(id, { nicknameUsed: null, userInfo: {} });
    return _convoMemory.get(id);
}
function setNicknameUsed(id, nick){
    if(!id) return; const m = getConvoMemory(id); m.nicknameUsed = nick; _convoMemory.set(id, m);
}

async function handleChat(sock, msg, text, senderId) {
    const chatId = msg.key.remoteJid;
    const cleanedMessage = stripBotMention(text, sock);
    const mentionOnly = !cleanedMessage;

    // Identify personality for sender (PERSONALITY.JSON is PRIMARY)
    const person = personalityManager.getPersonality(senderId) || {};

    // Debug logging: sender details
    if (config.DEBUG) {
        console.debug('[chatbot DEBUG] Sender info', {
            Sender: senderId,
            Normalized: personalityManager.normalizeIncomingId ? personalityManager.normalizeIncomingId(senderId) : senderId,
            Matched: person.name || null,
            Nicknames: person.nicknames || person.nicknames || [],
            AutoReply: person.autoReply === false ? false : true
        });
    }

    // AutoReply must be absolute: if explicitly false, return immediately
    if (person && person.autoReply === false) {
        return; // absolutely do nothing
    }

    // Conversation memory (per-user)
    try { memoryManager.addMessage(senderId, cleanedMessage); } catch (e) {}


    // If mention only, reply with simple fallback
    if (mentionOnly) {
        try {
            await showTyping(sock, chatId, getTypingDelay(MENTION_ONLY_FALLBACK.length));
            return sock.sendMessage(chatId, { text: MENTION_ONLY_FALLBACK }, { quoted: msg });
        } catch (e) {
            return; // ignore
        }
    }

    // Update user info if the message contains facts
    try {
        const info = extractUserInfo(cleanedMessage);
        if (Object.keys(info).length > 0) {
            const mem = getConvoMemory(senderId);
            mem.userInfo = { ...(mem.userInfo || {}), ...info };
            _convoMemory.set(senderId, mem);
        }
    } catch (e) { /* ignore */ }

    // Periodic cleanup is handled in convoMemory if needed externally

    // Choose a nickname once per conversation if available
    const nickList = personalityManager.getNicknameList(senderId) || [];
    let nicknameChosen = getConvoMemory(senderId).nicknameUsed || null;
    if (!nicknameChosen && nickList.length > 0) {
        nicknameChosen = nickList[Math.floor(Math.random() * nickList.length)];
        setNicknameUsed(senderId, nicknameChosen);
    }

    // High-level AI manager: prefer local knowledge/personality/memory and avoid external calls when possible
    try {
        const reply = await generateReply({ senderId, text: cleanedMessage });
        if (!reply) return; // no reply (autoReply disabled or other rule)
        await showTyping(sock, chatId, getTypingDelay(String(reply).length));
        return sock.sendMessage(chatId, { text: reply }, { quoted: msg });
    } catch (err) {
        console.error('[chatbot] AI error:', err?.message || err);
        try { await sock.sendMessage(chatId, { text: 'Sorry, I couldn\'t think of a reply right now.' }, { quoted: msg }); } catch(_){}
    }
}

module.exports = {
    name: 'chatbot',
    aliases: ['cb'],
    category: 'admin',
    description: 'AI chatbot — tag bot or reply to chat',
    usage: '.chatbot [on|off]',
    groupOnly: true,
    adminOnly: true,

    handleChat,

    async execute(sock, msg, args, extra) {
        const match = (args[0] || '').toLowerCase().trim();
        const chatId = extra.from;

        if (!match) {
            const enabled = database.getGroupSettings(chatId).chatbot;
            await showTyping(sock, chatId);
            return extra.reply(
                `*CHATBOT SETUP*\n\nStatus: ${enabled ? '✅ On' : '❌ Off'}\n\n*.chatbot on* — Enable chatbot\n*.chatbot off* — Disable chatbot\n\n@tag bot or reply to chat!`
            );
        }

        if (!extra.isAdmin && !extra.isOwner) {
            return extra.reply(config.messages.adminOnly);
        }

        if (match === 'on') {
            if (database.getGroupSettings(chatId).chatbot) {
                return extra.reply('*Chatbot is already enabled for this group*');
            }
            database.updateGroupSettings(chatId, { chatbot: true });
            return extra.reply('*Chatbot enabled! @tag or reply to chat with the bot.*');
        }

        if (match === 'off') {
            if (!database.getGroupSettings(chatId).chatbot) {
                return extra.reply('*Chatbot is already disabled for this group*');
            }
            database.updateGroupSettings(chatId, { chatbot: false });
            return extra.reply('*Chatbot disabled for this group*');
        }

        return extra.reply('*Invalid command. Use .chatbot on or .chatbot off*');
    }
};
