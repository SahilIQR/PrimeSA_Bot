/**
 * Text-to-Speech via Google Translate TTS (no API key required)
 */

const axios = require('axios');

const MAX_CHARS = 200;
const LANGS = new Set(['en', 'hi', 'id', 'es', 'fr', 'de', 'pt', 'ar', 'ja', 'ko']);

function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text)) return 'ja';
  return 'en';
}

async function generateSpeech(text, lang) {
  const trimmed = String(text).trim().slice(0, MAX_CHARS);
  if (!trimmed) throw new Error('No text provided');

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(trimmed)}`;

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const buffer = Buffer.from(response.data);
  if (!buffer.length) throw new Error('Empty audio response');
  return buffer;
}

function parseTtsInput(args) {
  if (!args.length) return { text: '', lang: 'en' };

  const first = args[0].toLowerCase();
  if (LANGS.has(first) && args.length > 1) {
    return { lang: first, text: args.slice(1).join(' ') };
  }

  const text = args.join(' ');
  return { text, lang: detectLang(text) };
}

module.exports = { generateSpeech, parseTtsInput, MAX_CHARS, LANGS };
