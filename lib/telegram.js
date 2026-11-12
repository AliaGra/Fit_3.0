/**
 * Виклики Telegram Bot API (Node.js)
 */
const fs = require('fs');
const path = require('path');
const { TELEGRAM_API_URL, BOT_TOKEN } = require('./constants');

const TELEGRAM_FILE_URL = BOT_TOKEN ? `https://api.telegram.org/file/bot${BOT_TOKEN}/` : '';

function callApi(method, params) {
  if (!TELEGRAM_API_URL) {
    console.error('Telegram: BOT_TOKEN not set');
    return null;
  }
  const url = TELEGRAM_API_URL + method;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        console.error('Telegram API', method, data.description || '');
        return null;
      }
      return data.result;
    })
    .catch((err) => {
      console.error('Telegram API error', method, err.message);
      return null;
    });
}

function sendMessage(chatId, text, options = {}) {
  const body = String(text).slice(0, 4096);
  return callApi('sendMessage', { chat_id: chatId, text: body, ...options });
}

function sendKeyboard(chatId, text, keyboard, options = {}) {
  const reply_markup = {
    inline_keyboard: Array.isArray(keyboard) ? keyboard : []
  };
  return sendMessage(chatId, text, { reply_markup, ...options });
}

function answerCallbackQuery(callbackQueryId) {
  return callApi('answerCallbackQuery', { callback_query_id: callbackQueryId });
}

function sendDocument(chatId, document, options = {}) {
  return callApi('sendDocument', { chat_id: chatId, document, ...options });
}

function sendPhoto(chatId, photo, options = {}) {
  return callApi('sendPhoto', { chat_id: chatId, photo, ...options });
}

function getFile(fileId) {
  return callApi('getFile', { file_id: String(fileId || '').trim() });
}

/** Завантажити файл Telegram за file_id → Buffer. */
async function downloadFile(fileId) {
  const id = String(fileId || '').trim();
  if (!id || !TELEGRAM_FILE_URL) return null;
  try {
    const meta = await getFile(id);
    const filePath = meta && meta.file_path ? String(meta.file_path) : '';
    if (!filePath) return null;
    const res = await fetch(TELEGRAM_FILE_URL + filePath);
    if (!res.ok) {
      console.error('Telegram downloadFile HTTP', res.status);
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.error('Telegram downloadFile', err.message);
    return null;
  }
}

function appendPhotoFormOptions(form, options = {}) {
  if (options.caption) form.append('caption', String(options.caption).slice(0, 1024));
  if (options.parse_mode) form.append('parse_mode', options.parse_mode);
  if (options.reply_markup) form.append('reply_markup', JSON.stringify(options.reply_markup));
  if (options.disable_notification) form.append('disable_notification', 'true');
}

/** Надіслати Buffer як фото; повертає Message (з photo[].file_id). */
function sendPhotoBuffer(chatId, buffer, filename = 'photo.jpg', options = {}) {
  if (!TELEGRAM_API_URL) {
    console.error('Telegram: BOT_TOKEN not set');
    return Promise.resolve(null);
  }
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return Promise.resolve(null);
  const form = new FormData();
  form.append('chat_id', String(chatId));
  const name = String(filename || 'photo.jpg');
  const mime = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  form.append('photo', new Blob([buffer], { type: mime }), name);
  appendPhotoFormOptions(form, options);
  return fetch(TELEGRAM_API_URL + 'sendPhoto', { method: 'POST', body: form })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        console.error('Telegram API sendPhotoBuffer', data.description || '');
        return null;
      }
      return data.result;
    })
    .catch((err) => {
      console.error('Telegram API error sendPhotoBuffer', err.message);
      return null;
    });
}

/** Надіслати локальний файл як фото (caption + inline-клавіатура). */
function sendPhotoFile(chatId, filePath, options = {}) {
  if (!TELEGRAM_API_URL) {
    console.error('Telegram: BOT_TOKEN not set');
    return Promise.resolve(null);
  }
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (err) {
    console.error('Telegram sendPhotoFile read', err.message);
    return Promise.resolve(null);
  }
  return sendPhotoBuffer(chatId, buf, path.basename(filePath), options);
}

/** Найбільший file_id з Message.photo. */
function largestPhotoFileId(message) {
  const photos = message && Array.isArray(message.photo) ? message.photo : [];
  if (!photos.length) return '';
  const p = photos[photos.length - 1];
  return p && p.file_id ? String(p.file_id) : '';
}

function deleteMessage(chatId, messageId) {
  if (chatId == null || messageId == null) return Promise.resolve(null);
  return callApi('deleteMessage', { chat_id: chatId, message_id: messageId });
}

function sendLocation(chatId, latitude, longitude, options = {}) {
  return callApi('sendLocation', {
    chat_id: chatId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    ...options
  });
}

module.exports = {
  callApi,
  sendMessage,
  sendKeyboard,
  answerCallbackQuery,
  sendDocument,
  sendPhoto,
  sendPhotoFile,
  sendPhotoBuffer,
  getFile,
  downloadFile,
  largestPhotoFileId,
  deleteMessage,
  sendLocation
};
