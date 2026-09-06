/**
 * AI Chat Command - ChatGPT-style responses
 */

const APIs = require('../../utils/api');
const fs = require('fs');
const path = require('path');

// Load personal info folder/file
const PERSONAL_DIR = path.join(__dirname, '../../data/personal');
const SAHIL_FILE = path.join(PERSONAL_DIR, 'sahil.json');
let sahilInfo = null;
try {
  if (fs.existsSync(SAHIL_FILE)) {
    sahilInfo = JSON.parse(fs.readFileSync(SAHIL_FILE, 'utf8'));
  }
} catch (e) {
  console.error('[ai] failed loading sahil info:', e.message || e);
}

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply('❌ Usage: .ai <question>\n\nExample: .ai What is the capital of France?');
      }

      const question = args.join(' ').trim();

      // Inform user that AI is thinking (PrimeSA branding)
      let thinkingMsg = null;
      try {
        thinkingMsg = await sock.sendMessage(extra.from, { text: 'PrimeSA is thinking... 🤖' }, { quoted: msg });
      } catch (e) {
        // Non-fatal
        console.log('[ai] failed to send thinking message:', e.message || e);
      }

      // Check for direct personal info queries about Sahil
      try {
        const qLower = question.toLowerCase();
        if (qLower.includes('sahil')) {
          // Build a friendly answer from sahilInfo if available
          let replyText = '';
          if (sahilInfo) {
            replyText += `Name: ${sahilInfo.name || 'Sahil'}\n`;
            if (sahilInfo.title) replyText += `Title: ${sahilInfo.title}\n`;
            if (sahilInfo.role) replyText += `Role: ${sahilInfo.role}\n`;
            if (sahilInfo.bio) replyText += `Bio: ${sahilInfo.bio}\n`;
            if (sahilInfo.contact) replyText += `Contact: ${sahilInfo.contact}\n`;
            replyText += '\nSahil is the leader of PrimeSA.';
          } else {
            replyText = 'Sahil is the leader of PrimeSA.';
          }

          await sock.sendMessage(extra.from, { text: replyText }, { quoted: msg });

          // Delete thinking message if possible
          if (thinkingMsg && thinkingMsg.key) {
            try { await sock.sendMessage(extra.from, { delete: thinkingMsg.key }); } catch (_) { }
          }
          return;
        }
      } catch (e) {
        console.error('[ai] sahil-check failed:', e.message || e);
      }

      // Query AI backend
      try {
        const response = await APIs.chatAI(question);
        const answer = response.response || response.msg || response.data?.msg || response;
        await sock.sendMessage(extra.from, { text: String(answer) }, { quoted: msg });
      } catch (aiErr) {
        console.error('[ai] chatAI error:', aiErr.message || aiErr);
        await sock.sendMessage(extra.from, { text: `❌ AI Error: ${aiErr.message || 'Service unavailable'}` }, { quoted: msg });
      }

      // Cleanup thinking indicator
      if (thinkingMsg && thinkingMsg.key) {
        try { await sock.sendMessage(extra.from, { delete: thinkingMsg.key }); } catch (_) { }
      }

    } catch (error) {
      console.error('[ai] unexpected error:', error);
      try { await extra.reply(`❌ AI Error: ${error.message || 'Unknown error'}`); } catch (_) { }
    }
  }
};
