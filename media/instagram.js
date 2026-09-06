/**
 * Instagram Downloader - Using ruhend-scraper
 */

const { igdl } = require('ruhend-scraper');
const config = require('../../config');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

// Function to extract unique media URLs with simple deduplication
function extractUniqueMedia(mediaData) {
  const uniqueMedia = [];
  const seenUrls = new Set();
  
  for (const media of mediaData) {
    if (!media.url) continue;
    
    // Only check for exact URL duplicates
    if (!seenUrls.has(media.url)) {
      seenUrls.add(media.url);
      uniqueMedia.push(media);
    }
  }
  
  return uniqueMedia;
}

// Function to validate media URL
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Accept any URL that looks like media
  return url.includes('cdninstagram.com') || 
         url.includes('instagram') || 
         url.includes('http');
}

module.exports = {
  name: 'instagram',
  aliases: ['ig', 'insta', 'igdl', 'reels'],
  category: 'media',
  description: 'Download Instagram photos/videos/reels',
  usage: '<Instagram URL>',
  
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        return;
      }
      
      // Add message ID to processed set
      processedMessages.add(msg.key.id);
      
      // Clean up old message IDs after 5 minutes
      setTimeout(() => {
        processedMessages.delete(msg.key.id);
      }, 5 * 60 * 1000);
      
      const text = (args && args.length ? args.join(' ') : null) || msg.message?.conversation || msg.message?.extendedTextMessage?.text;

      if (!text) {
        return extra.reply('Please provide an Instagram link for the video.');
      }
      
      // Check for various Instagram URL formats
      const instagramPatterns = [
        /https?:\/\/(?:www\.)?instagram\.com\//,
        /https?:\/\/(?:www\.)?instagr\.am\//,
        /https?:\/\/(?:www\.)?instagram\.com\/p\//,
        /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
        /https?:\/\/(?:www\.)?instagram\.com\/tv\//
      ];
      
      const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));
      
      if (!isValidUrl) {
        return extra.reply('That is not a valid Instagram link. Please provide a valid Instagram post, reel, or video link.');
      }
      
      await sock.sendMessage(chatId, {
        react: { text: '📥', key: msg.key }
      });
      
      const urlMatch = text.match(/https?:\/\/[^\s]+/i);
      const inputUrl = urlMatch ? urlMatch[0] : text;
      const downloadData = await igdl(inputUrl);
      
      if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
        return extra.reply('❌ No media found at the provided link. The post might be private or the link is invalid.');
      }
      
      const mediaData = downloadData.data;
      
      // Simple deduplication - just remove exact URL duplicates
      const uniqueMedia = extractUniqueMedia(mediaData);
      
      // Limit to maximum 20 unique media items
      const mediaToDownload = uniqueMedia.slice(0, 20);
      
      if (mediaToDownload.length === 0) {
        return extra.reply('❌ No valid media found to download. This might be a private post or the scraper failed.');
      }
      
      // Download all media silently without status messages
      for (let i = 0; i < mediaToDownload.length; i++) {
        try {
          const media = mediaToDownload[i];
          const mediaUrl = media.url;
          
          // Check if URL ends with common video extensions
          const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || 
                        media.type === 'video' || 
                        text.includes('/reel/') || 
                        text.includes('/tv/');
          
          if (isVideo) {
            await sock.sendMessage(chatId, {
              video: { url: mediaUrl },
              mimetype: 'video/mp4',
              caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(chatId, {
              image: { url: mediaUrl },
              caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*`
            }, { quoted: msg });
          }
          
          // Add small delay between downloads to prevent rate limiting
          if (i < mediaToDownload.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (mediaError) {
          console.error(`Error downloading media ${i + 1}:`, mediaError);
          // Continue with next media if one fails
        }
      }
    } catch (error) {
      console.error('Error in Instagram command:', error);
      await extra.reply('❌ An error occurred while processing the Instagram request. Please try again.');
    }
  }
};
