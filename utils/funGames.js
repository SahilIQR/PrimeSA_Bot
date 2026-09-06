const { pick, tag, sendMention, getTwoUsers, getTargetUser } = require('./funHelpers');

const guessGames = new Map();
const hangmanGames = new Map();
const quizGames = new Map();

const HANGMAN_WORDS = ['baileys', 'whatsapp', 'knight', 'bot', 'meme', 'group', 'status', 'tiktok', 'roast', 'legend'];
const QUIZ = [
  { q: 'Capital of India?', opts: ['Mumbai', 'Delhi', 'Kolkata', 'Chennai'], a: 1 },
  { q: '2 + 2 × 2 = ?', opts: ['6', '8', '4', '10'], a: 0 },
  { q: 'Largest planet?', opts: ['Earth', 'Saturn', 'Jupiter', 'Mars'], a: 2 },
  { q: 'Who built Taj Mahal?', opts: ['Akbar', 'Shah Jahan', 'Aurangzeb', 'Babur'], a: 1 },
  { q: 'Fastest land animal?', opts: ['Lion', 'Cheetah', 'Horse', 'Deer'], a: 1 },
];
const DARES = [
  'Send your last screenshot!',
  'Change your pfp for 1 hour!',
  'Text your crush "hi" right now!',
  'Send a voice note singing!',
  'Admit your biggest secret!',
  'Roast yourself in 3 lines!',
];
const WYR = [
  'Would you rather lose your phone or lose all photos forever?',
  'Would you rather always be 10 min late or 20 min early?',
  'Would you rather fight 1 horse-sized duck or 100 duck-sized horses?',
  'Would you rather never use social media or never watch videos again?',
  'Would you rather be famous or be rich?',
];
const NHIE = [
  'Never have I ever ghosted someone 👻',
  'Never have I ever cried during a movie 😭',
  'Never have I ever lied to get out of plans 🙃',
  'Never have I ever stalked an ex online 🔍',
  'Never have I ever sent a text to the wrong person 💀',
];
const HOTSEAT = [
  'Who was your first crush?',
  'What is your most embarrassing moment?',
  'What is a secret nobody here knows?',
];

function gameKey(from, sender) {
  return `${from}:${sender}`;
}

function cleanupMap(map, maxAge = 600000) {
  const now = Date.now();
  for (const [k, v] of map) {
    if (now - (v.at || 0) > maxAge) map.delete(k);
  }
}

async function handleGameInput(sock, msg, extra) {
  try {
    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ''
    ).trim().toLowerCase();
    if (!text) return false;

    const key = gameKey(extra.from, extra.sender);

    if (guessGames.has(key)) {
      const g = guessGames.get(key);
      const n = parseInt(text, 10);
      if (Number.isNaN(n)) return false;
      if (n === g.num) {
        await extra.reply(`🎉 Correct! The number was *${g.num}*!`);
        guessGames.delete(key);
      } else {
        await extra.reply(n < g.num ? '📈 Higher!' : '📉 Lower!');
      }
      return true;
    }

    if (hangmanGames.has(key)) {
      const g = hangmanGames.get(key);
      if (text.length !== 1) return false;
      const ch = text[0];
      if (g.guessed.has(ch)) {
        await extra.reply('Already guessed that letter!');
        return true;
      }
      g.guessed.add(ch);
      if (g.word.includes(ch)) {
        g.display = g.word.split('').map((c) => (g.guessed.has(c) ? c : '_')).join(' ');
        if (!g.display.includes('_')) {
          await extra.reply(`🎉 You won! Word: *${g.word}*`);
          hangmanGames.delete(key);
        } else {
          await extra.reply(`✅ ${g.display}\nLives: ${g.lives}`);
        }
      } else {
        g.lives--;
        if (g.lives <= 0) {
          await extra.reply(`💀 Game over! Word was: *${g.word}*`);
          hangmanGames.delete(key);
        } else {
          await extra.reply(`❌ Wrong! ${g.display}\nLives: ${g.lives}`);
        }
      }
      return true;
    }

    if (quizGames.has(key)) {
      const g = quizGames.get(key);
      const ans = parseInt(text, 10);
      if (Number.isNaN(ans) || ans < 1 || ans > 4) return false;
      quizGames.delete(key);
      if (ans - 1 === g.a) {
        await extra.reply('✅ Correct answer!');
      } else {
        await extra.reply(`❌ Wrong! Correct: *${g.opts[g.a]}*`);
      }
      return true;
    }
  } catch (e) {
    console.error('[funGames input]', e.message);
  }
  return false;
}

const rpsCmd = {
  name: 'rps',
  aliases: ['rockpaperscissors'],
  category: 'fun',
  description: 'Rock paper scissors vs bot',
  usage: '.rps rock|paper|scissors',
  async execute(sock, msg, args, extra) {
    try {
      const moves = ['rock', 'paper', 'scissors'];
      const user = (args[0] || '').toLowerCase();
      if (!moves.includes(user)) {
        return extra.reply('Usage: `.rps rock|paper|scissors`');
      }
      const bot = pick(moves);
      const win =
        (user === 'rock' && bot === 'scissors') ||
        (user === 'paper' && bot === 'rock') ||
        (user === 'scissors' && bot === 'paper');
      const result = user === bot ? '🤝 Draw!' : win ? '🎉 You win!' : '😂 Bot wins!';
      await extra.reply(`You: *${user}*\nBot: *${bot}*\n\n${result}`);
    } catch (e) {
      console.error('[rps]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const guessnumberCmd = {
  name: 'guessnumber',
  aliases: ['guess', 'guessthenumber'],
  category: 'fun',
  description: 'Guess a number 1-100',
  usage: '.guessnumber',
  async execute(sock, msg, args, extra) {
    try {
      cleanupMap(guessGames);
      const key = gameKey(extra.from, extra.sender);
      if (guessGames.has(key)) return extra.reply('You already have a game! Send a number.');
      guessGames.set(key, { num: Math.floor(Math.random() * 100) + 1, at: Date.now() });
      await extra.reply('🔢 I picked a number *1-100*!\nSend your guess (no prefix).');
    } catch (e) {
      console.error('[guessnumber]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const hangmanCmd = {
  name: 'hangman',
  aliases: ['hm'],
  category: 'fun',
  description: 'Play hangman',
  usage: '.hangman',
  async execute(sock, msg, args, extra) {
    try {
      cleanupMap(hangmanGames);
      const key = gameKey(extra.from, extra.sender);
      const word = pick(HANGMAN_WORDS);
      hangmanGames.set(key, {
        word,
        display: word.split('').map(() => '_').join(' '),
        guessed: new Set(),
        lives: 6,
        at: Date.now(),
      });
      await extra.reply(`🎯 Hangman started!\n${'_ '.repeat(word.length)}\nSend one letter (no prefix). Lives: 6`);
    } catch (e) {
      console.error('[hangman]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const quizCmd = {
  name: 'quiz',
  aliases: ['trivia'],
  category: 'fun',
  description: 'Quick quiz',
  usage: '.quiz',
  async execute(sock, msg, args, extra) {
    try {
      cleanupMap(quizGames);
      const key = gameKey(extra.from, extra.sender);
      const q = pick(QUIZ);
      quizGames.set(key, { ...q, at: Date.now() });
      const opts = q.opts.map((o, i) => `${i + 1}. ${o}`).join('\n');
      await extra.reply(`❓ *${q.q}*\n\n${opts}\n\nReply with 1-4 (no prefix).`);
    } catch (e) {
      console.error('[quiz]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const rouletteCmd = {
  name: 'roulette',
  aliases: ['spin'],
  category: 'fun',
  description: 'Spin the wheel on a random member',
  usage: '.roulette',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      const parts = extra.groupMetadata?.participants?.map((p) => p.id).filter((id) => id !== sock.user?.id) || [];
      if (!parts.length) return extra.reply('❌ No members found.');
      const victim = pick(parts);
      const dare = pick(DARES);
      await sendMention(sock, extra.from, msg, `🎰 The wheel landed on ${tag(victim)}!\n\n🎯 Dare: ${dare}`, [victim]);
    } catch (e) {
      console.error('[roulette]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const slotsCmd = {
  name: 'slots',
  aliases: ['slot'],
  category: 'fun',
  description: 'Spin the slot machine',
  usage: '.slots',
  async execute(sock, msg, args, extra) {
    try {
      const icons = ['🍒', '🍋', '💎', '7️⃣', '⭐'];
      const a = pick(icons);
      const b = pick(icons);
      const c = pick(icons);
      const win = a === b && b === c;
      await extra.reply(`${a} | ${b} | ${c}\n\n${win ? '🎉 JACKPOT! You win!' : '😅 Try again!'}`);
    } catch (e) {
      console.error('[slots]', e.message);
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const wyrCmd = {
  name: 'wyr',
  aliases: ['wouldyourather'],
  category: 'fun',
  description: 'Would you rather',
  usage: '.wyr',
  async execute(sock, msg, args, extra) {
    try {
      await extra.reply(`🤔 *Would You Rather?*\n\n${pick(WYR)}`);
    } catch (e) {
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const nhieCmd = {
  name: 'nhie',
  aliases: ['neverhaveiever'],
  category: 'fun',
  description: 'Never have I ever',
  usage: '.nhie',
  async execute(sock, msg, args, extra) {
    try {
      await extra.reply(`🙊 *Never Have I Ever*\n\n${pick(NHIE)}\n\nReact if guilty 😂`);
    } catch (e) {
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const hotseatCmd = {
  name: 'hotseat',
  aliases: ['hot'],
  category: 'fun',
  description: 'Hot seat questions for a user',
  usage: '.hotseat @user',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    try {
        const { jid, tag: t } = getTargetUser(msg, extra);
      const qs = HOTSEAT.sort(() => Math.random() - 0.5).slice(0, 3);
      await sendMention(
        sock,
        extra.from,
        msg,
        `🔥 *Hot Seat* — ${t}\n\n${qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
        [jid]
      );
    } catch (e) {
      await extra.reply('❌ Something went wrong.');
    }
  },
};

const roastbattleCmd = {
  name: 'roastbattle',
  aliases: ['rbattle'],
  category: 'fun',
  description: 'Roast battle between two random members',
  usage: '.roastbattle',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      const pair = getTwoUsers(msg, extra, sock);
      if (pair.error) return extra.reply(pair.error);
      const roasts = [
        'shows up late to their own funeral',
        'types with boxing gloves on',
        'would lose an argument with a wall',
        'has WiFi weaker than their excuses',
        'is the human version of a loading screen',
      ];
      const { a, b } = pair;
      await sendMention(
        sock,
        extra.from,
        msg,
        `⚔️ *ROAST BATTLE*\n\n${tag(a)} ${pick(roasts)}.\n${tag(b)} ${pick(roasts)}.\n\nWho won? 😂`,
        [a, b]
      );
    } catch (e) {
      await extra.reply('❌ Something went wrong.');
    }
  },
};

module.exports = {
  handleGameInput,
  gameCommands: [
    rpsCmd,
    guessnumberCmd,
    hangmanCmd,
    quizCmd,
    rouletteCmd,
    slotsCmd,
    wyrCmd,
    nhieCmd,
    hotseatCmd,
    roastbattleCmd,
  ],
};
