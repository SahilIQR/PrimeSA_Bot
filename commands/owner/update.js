/**
 * Update Command - Fetch latest code via ZIP (Owner Only)
 * Preserves runtime/state dirs: node_modules, session, tmp, temp, database, config.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('../../config');

const MAX_REDIRECTS = 5;

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
      resolve((stdout || '').toString());
    });
  });
}

async function updateViaGit(repoUrl) {
  const tmpDir = path.join(process.cwd(), 'tmp');
  const cloneDir = path.join(tmpDir, 'update_git');

  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  // cleanup existing
  try { if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (e) {}

  // ensure git available
  try {
    await run('git --version');
  } catch (e) {
    throw new Error('git is not available on this system. Install git or use a ZIP update URL.');
  }

  // Attempt shallow clone
  try {
    await run(`git clone --depth=1 "${repoUrl}" "${cloneDir}"`);
  } catch (e) {
    // fallback: try without depth
    try {
      await run(`git clone "${repoUrl}" "${cloneDir}"`);
    } catch (err) {
      throw new Error(`git clone failed: ${err.message || err}`);
    }
  }

  // If clone succeeded, copy files to cwd (respect ignore list)
  const ignore = [
    'node_modules',
    '.git',
    'session',
    'tmp',
    'temp',
    'database',
    'config.js'
  ];

  const copied = [];
  copyRecursive(cloneDir, process.cwd(), ignore, '', copied);

  // cleanup clone
  try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (_) {}

  return { copiedFiles: copied };
}

async function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\\\/g, '/')}' -Force"`;
    await run(cmd);
    return;
  }
  // Try unzip, then 7z, then busybox unzip
  try {
    await run('command -v unzip');
    await run(`unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  try {
    await run('command -v 7z');
    await run(`7z x -y '${zipPath}' -o'${outDir}'`);
    return;
  } catch {}
  try {
    await run('busybox unzip -h');
    await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  throw new Error('No unzip tool found (unzip/7z/busybox). Please install one or use a panel with unzip support.');
}

function downloadFile(url, dest, visited = new Set()) {
  return new Promise((resolve, reject) => {
    try {
      if (visited.has(url) || visited.size > MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }
      visited.add(url);

      const client = url.startsWith('https://') ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'PrimeSA-Bot-Updater/1.0',
          'Accept': '*/*'
        }
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
          const nextUrl = new URL(location, url).toString();
          res.resume();
          return downloadFile(nextUrl, dest, visited).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', err => {
          try { file.close(() => {}); } catch {}
          fs.unlink(dest, () => reject(err));
        });
      });
      req.on('error', err => {
        fs.unlink(dest, () => reject(err));
      });
    } catch (e) {
      reject(e);
    }
  });
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (ignore.includes(entry)) continue;
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) {
      copyRecursive(s, d, ignore, path.join(relative, entry), outList);
    } else {
      fs.copyFileSync(s, d);
      if (outList) outList.push(path.join(relative, entry).replace(/\\\\/g, '/'));
    }
  }
}

async function updateViaZip(zipUrl) {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'update.zip');
  const extractTo = path.join(tmpDir, 'update_extract');

  await downloadFile(zipUrl, zipPath);

  if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
  await extractZip(zipPath, extractTo);

  const entries = fs.readdirSync(extractTo);
  const rootCandidate = entries.length === 1 ? path.join(extractTo, entries[0]) : extractTo;
  const srcRoot = fs.existsSync(rootCandidate) && fs.lstatSync(rootCandidate).isDirectory() ? rootCandidate : extractTo;

  const ignore = [
    'node_modules',
    '.git',
    'session',
    'tmp',
    'temp',
    'database',
    'config.js'
  ];
  const copied = [];
  copyRecursive(srcRoot, process.cwd(), ignore, '', copied);

  try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(zipPath, { force: true }); } catch {}

  return { copiedFiles: copied };
}

module.exports = {
  name: 'update',
  aliases: ['upgrade'],
  category: 'owner',
  description: 'Update bot from configured ZIP URL (Owner Only)',
  usage: '.update [optional_zip_url]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const target = (args[0] || '').trim() || (config.updateGitRepo || 'https://github.com/SahilIQR/PrimeSA_Bot.git');

    try {
      await extra.reply('🔄 Updating the bot, please wait…');

      let res;
      if (target.endsWith('.zip') || target.includes('.zip')) {
        // ZIP update
        res = await updateViaZip(target);
      } else if (target.includes('.git') || target.startsWith('http')) {
        // Git update (prefer git when target is a repo or default)
        const repoUrl = target.includes('.git') ? target : (config.updateGitRepo || 'https://github.com/SahilIQR/PrimeSA_Bot.git');
        res = await updateViaGit(repoUrl);
      } else {
        // fallback to zip from config
        const zip = config.updateZipUrl || process.env.UPDATE_ZIP_URL || '';
        if (!zip) {
          return extra.reply('❌ No update source configured. Provide a .git repo URL or a ZIP URL, or set updateZipUrl/updateGitRepo in config.');
        }
        res = await updateViaZip(zip);
      }

      const copiedFiles = res && res.copiedFiles ? res.copiedFiles : [];
      const summary = copiedFiles.length
        ? `✅ Update complete. Files updated: ${copiedFiles.length}`
        : '✅ Update complete. No files needed updating.';

      await sock.sendMessage(chatId, { text: `${summary}\nRestarting…` }, { quoted: msg });

      // Attempt restart via pm2 if available, else exit to allow panel auto-restart
      try {
        await run('pm2 restart all');
        return;
      } catch {}

      setTimeout(() => process.exit(0), 500);
    } catch (error) {
      console.error('Update failed:', error);
      await sock.sendMessage(chatId, { text: `❌ Update failed:\n${String(error.message || error)}` }, { quoted: msg });
    }
  }
};

