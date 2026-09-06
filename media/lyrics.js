/**
 * Lyrics Finder
 */

const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'lyrics',
  aliases: ['lyric', 'lirik'],
  category: 'media',
  description: 'Get lyrics of a song',
  usage: '<song name>',
  
  async execute(sock, msg, args) {
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: `❌ Please provide a song name!\n\nExample: ${config.prefix}lyrics Despacito` 
        });
      }
      
      const query = args.join(' ');
      
      let lyricsData = null;
      
      // API 1: Vreden
      try {
        const response = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${encodeURIComponent(query)}`);
        if (response.data && response.data.result) {
          lyricsData = {
            title: response.data.result.title,
            artist: response.data.result.artist,
            lyrics: response.data.result.lyrics,
            thumbnail: response.data.result.thumbnail
          };
        }
      } catch (err) {
        console.log('Vreden API failed, trying next...');
      }
      
      // API 2: Siputzx (fallback)
      if (!lyricsData) {
        try {
          const response = await axios.get(`https://api.siputzx.my.id/api/s/lyrics?query=${encodeURIComponent(query)}`);
          if (response.data && response.data.status && response.data.data) {
            lyricsData = {
              title: response.data.data.title,
              artist: response.data.data.artist,
              lyrics: response.data.data.lyrics,
              thumbnail: response.data.data.image
            };
          }
        } catch (err) {
          console.log('Siputzx API failed');
        }
      }
      
      if (!lyricsData) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: '❌ Could not find lyrics for this song!' 
        });
      }
      
      // Format lyrics (limit to prevent message too long)
      let lyrics = lyricsData.lyrics;
      if (lyrics.length > 4000) {
        lyrics = lyrics.substring(0, 4000) + '...\n\n_Lyrics too long, showing first part only_';
      }
      
      const caption = `🎵 *${lyricsData.title}*\n` +
                     `👤 *Artist:* ${lyricsData.artist}\n\n` +
                     `📝 *Lyrics:*\n${lyrics}\n\n` +
                     `_Fetched by ${config.botName}_`;
      
      if (lyricsData.thumbnail) {
        await sock.sendMessage(msg.key.remoteJid, {
          image: { url: lyricsData.thumbnail },
          caption: caption
        });
      } else {
        await sock.sendMessage(msg.key.remoteJid, { text: caption });
      }
      
    } catch (error) {
      console.error('Lyrics command error:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: '❌ An error occurred while fetching lyrics!' 
      });
    }
  }
};
