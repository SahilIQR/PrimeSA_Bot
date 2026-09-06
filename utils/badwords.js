/**
 * Bad word list and detection for antibadword
 */

const BAD_WORDS = [
  'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda',
  'lauda', 'laude', 'betichod', 'chutiya', 'maa ki chut', 'behenchod',
  'behen ki chut', 'tatto ke saudagar', 'machar ki jhant', 'jhant ka baal',
  'randi', 'chuchi', 'boobs', 'boobies', 'tits', 'idiot', 'nigga', 'fuck',
  'dick', 'bitch', 'bastard', 'asshole', 'asu', 'awyu', 'teri ma ki chut',
  'teri maa ki', 'lund', 'lund ke baal', 'mc', 'lodu', 'benchod', 'chud', 
  'shit', 'damn', 'hell', 'piss', 'crap', 'slut', 'whore', 'prick',
  'motherfucker', 'cock', 'cunt', 'pussy', 'twat', 'wanker', 'douchebag', 'jackass',
  'moron', 'retard', 'scumbag', 'skank', 'slutty', 'arse', 'bugger',
  'chut', 'laude ka baal', 'madar', 'behen ke lode', 'chodne', 'sala kutta',
  'harami', 'randi ki aulad', 'gaand mara', 'chodu', 'lund le', 'gandu saala',
  'kameena', 'haramzada', 'chamiya', 'chodne wala', 'chudai', 'chutiye ke baap',
  'fck', 'fckr', 'fcker', 'fuk', 'fukk', 'fcuk', 'btch', 'bch', 'f*ck', 'assclown',
  'a**hole', 'f@ck', 'b!tch', 'd!ck', 'n!gga', 'f***er', 's***head', 'a$$', 'l0du', 'lund69',
  'spic', 'chink', 'cracker', 'towelhead', 'gook', 'kike', 'paki', 'honky',
  'wetback', 'raghead', 'beaner', 'gand', 'lawde', 'lavde', 'bhadwe', 'bhadwa', 'lawda', 
  'blowjob', 'handjob', 'cum', 'cumshot', 'jizz', 'deepthroat', 'fap', 'gandmare',
  'hentai', 'milf', 'anal', 'orgasm', 'dildo', 'vibrator', 'gangbang', 'gandu saala', 'gand mara',
  'threesome', 'porn', 'sex', 'xxx', 'kutta', 'kutte', 'kuttey', 'kutte ka baal', 'bkc',
  'fag', 'faggot', 'dyke', 'tranny', 'homo', 'sissy', 'fairy', 'lesbo',
  'weed', 'pot', 'coke', 'heroin', 'meth', 'crack', 'dope', 'bong', 'kush',
  'hash', 'trip', 'rolling', 'ma chuda', 'maa chuda', 'maa chudao', 'chudao', 'chuda'
];

const MULTI_WORD_BAD = BAD_WORDS.filter((w) => w.includes(' '));
const SINGLE_WORD_BAD = new Set(BAD_WORDS.filter((w) => !w.includes(' ')));

function containsBadWord(text) {
  if (!text || typeof text !== 'string') return false;

  const cleanMessage = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanMessage) return false;

  for (const phrase of MULTI_WORD_BAD) {
    if (cleanMessage.includes(phrase)) return true;
  }

  const messageWords = cleanMessage.split(' ');
  for (const word of messageWords) {
    if (word.length < 2) continue;
    if (SINGLE_WORD_BAD.has(word)) return true;
  }

  return false;
}

module.exports = { BAD_WORDS, containsBadWord };
