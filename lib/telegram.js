/**
 * Виклики Telegram Bot API (Node.js)
 */
const fs = require('fs');
const path = require('path');
const { TELEGRAM_API_URL } = require('./constants');

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
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([buf], { type: 'image/png' }), path.basename(filePath));
  if (options.caption) form.append('caption', String(options.caption).slice(0, 1024));
  if (options.parse_mode) form.append('parse_mode', options.parse_mode);
  if (options.reply_markup) form.append('reply_markup', JSON.stringify(options.reply_markup));
  return fetch(TELEGRAM_API_URL + 'sendPhoto', { method: 'POST', body: form })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        console.error('Telegram API sendPhoto', data.description || '');
        return null;
      }
      return data.result;
    })
    .catch((err) => {
      console.error('Telegram API error sendPhoto', err.message);
      return null;
    });
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
  sendLocation
};
