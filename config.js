/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Debugging
    // Use lowercase `debug` for modules in this project. `DEBUG` kept for backwards compatibility.
    DEBUG: false, // set to true to enable verbose debug logs (legacy key)
    debug: false, // set to true to enable verbose debug logs (preferred)
    // AI debug - detailed AI internals
    debugAI: false,

    // Bot Owner Configuration
    ownerNumber: ['27835515085'], // Add your number without + or spaces
    ownerName: ['Pro Sahil'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'PrimeSA_Bot',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    sessionApiUrl: process.env.SESSION_API_URL || '',
    sessionApiKey: process.env.SESSION_API_KEY || '',
    sessionsDir: process.env.SESSIONS_DIR || './sessions',
    newsletterJid: '120363161513685998@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: process.env.UPDATE_ZIP_URL || '', // Optional URL to the PrimeSA update ZIP
    
    // Sticker Configuration
    packname: 'PrimeSA_Bot',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot',
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      antibotAction: 'warn', // 'warn' | 'kick'
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      antigroupstatus: false, // Block group status posts
      antigroupstatusAction: 'delete', // 'delete', 'kick'
      antisticker: false, // Stickers not allowed in group
      antistickerAction: 'delete', // 'delete', 'kick'
      antibadword: false, // Block bad words in group
      antibadwordAction: 'delete', // 'delete', 'kick', 'warn'
      welcome: false,
      welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
      antiSpam: false,
      antidelete: true,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },

    // Music API keys
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
    spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    // Movie clip max download size (MB)
    movieClipMaxMB: 12,
    // Max audio file to attempt to download and send (MB)
    maxAudioMB: 25,
    // Max video file size to attempt to download and send (MB)
    videoMaxMB: 50,

    // Facebook download fallbacks and request settings
    facebookFallbackAPIs: [
        'https://api.princetechn.com/api/download/facebook'
    ],
    facebookApiKey: 'prince',
    requestRetries: 3,
    retryBackoffBase: 500,
    requestTimeout: 60000,
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },

    // Timezone
    timeZone: 'Africa/Johannesburg',

    // Limits
    maxWarnings: 3,

    // Social Links (optional)
    social: {
        github: 'https://github.com/sahillume',
        youtube: 'https://youtube.com/@professorsahil-m7q?si=DXed6qhMosB_JQyL',
        whatsapp: 'https://whatsapp.com/channel/0029VbCIUrC4tRrmjdI9QM1x',
        website: 'https://primesa-bot-26.onrender.com'
    }
};