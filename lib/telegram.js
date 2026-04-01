/**
 * Виклики Telegram Bot API (Node.js)
 */
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

module.exports = { callApi, sendMessage, sendKeyboard, answerCallbackQuery, sendDocument, sendPhoto };
