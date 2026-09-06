/**
 * Helper Utilities
 */

const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

/**
 * Download media from message
 */
const downloadMedia = async (message) => {
  try {
    const messageType = Object.keys(message)[0];
    const stream = await downloadContentFromMessage(message[messageType], messageType.replace('Message', ''));
    
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    
    return buffer;
  } catch (error) {
    throw new Error(`Media download failed: ${error.message}`);
  }
};

/**
 * Format time duration
 */
const formatDuration = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ') || '0s';
};

/**
 * Format file size
 */
const formatSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Sleep function
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse mentions from message
 */
const parseMentions = (text) => {
  const mentions = [];
  const regex = /@(\d+)/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1] + '@s.whatsapp.net');
  }
  
  return mentions;
};

/**
 * Get quoted message
 */
const getQuoted = (msg) => {
  if (msg.message.extendedTextMessage) {
    return msg.message.extendedTextMessage.contextInfo?.quotedMessage;
  }
  return null;
};

/**
 * Upload file to temporary hosting
 */
const uploadFile = async (buffer) => {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buffer, { filename: 'file' });
    
    const response = await axios.post('https://file.io', form, {
      headers: form.getHeaders()
    });
    
    return response.data.link;
  } catch (error) {
    throw new Error('File upload failed');
  }
};

/**
 * Extract URL from text
 */
const extractUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
};

/**
 * Random element from array
 */
const random = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

/**
 * Check if text is valid URL
 */
const isUrl = (text) => {
  const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
  return urlRegex.test(text);
};

/**
 * Runtime information
 */
const runtime = (seconds) => {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor(seconds % (3600 * 24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  
  return parts.join(' ');
};

module.exports = {
  downloadMedia,
  formatDuration,
  formatSize,
  sleep,
  parseMentions,
  getQuoted,
  uploadFile,
  extractUrl,
  random,
  isUrl,
  runtime
};
