/**
 * Telegram API wrapper for Admin bot (separate token).
 */
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || '';
const ADMIN_TELEGRAM_API_URL = ADMIN_BOT_TOKEN ? `https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/` : '';

function callApi(method, params) {
  if (!ADMIN_TELEGRAM_API_URL) {
    console.error('AdminTelegram: ADMIN_BOT_TOKEN not set');
    return null;
  }
  const url = ADMIN_TELEGRAM_API_URL + method;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        console.error('Admin Telegram API', method, data.description || '');
        return null;
      }
      return data.result;
    })
    .catch((err) => {
      console.error('Admin Telegram API error', method, err.message);
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

function editMessageText(chatId, messageId, text, keyboard, options = {}) {
  const body = String(text).slice(0, 4096);
  const params = {
    chat_id: chatId,
    message_id: messageId,
    text: body,
    ...options
  };
  if (keyboard && Array.isArray(keyboard)) {
    params.reply_markup = { inline_keyboard: keyboard };
  }
  return callApi('editMessageText', params);
}

function answerCallbackQuery(callbackQueryId, extra = {}) {
  return callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, ...extra });
}

function sendLocation(chatId, latitude, longitude, options = {}) {
  return callApi('sendLocation', {
    chat_id: chatId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    ...options
  });
}

module.exports = { sendMessage, sendKeyboard, editMessageText, answerCallbackQuery, sendLocation };

