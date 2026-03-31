/**
 * Telegram API wrapper for Help bot (FitHad_helpbot) — separate token.
 */
const HELP_BOT_TOKEN = process.env.HELP_BOT_TOKEN || '';
const HELP_TELEGRAM_API_URL = HELP_BOT_TOKEN ? `https://api.telegram.org/bot${HELP_BOT_TOKEN}/` : '';

function callApi(method, params) {
  if (!HELP_TELEGRAM_API_URL) {
    console.error('HelpTelegram: HELP_BOT_TOKEN not set');
    return null;
  }
  const url = HELP_TELEGRAM_API_URL + method;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.ok) {
        console.error('Help Telegram API', method, data.description || '');
        return null;
      }
      return data.result;
    })
    .catch((err) => {
      console.error('Help Telegram API error', method, err.message);
      return null;
    });
}

function sendMessage(chatId, text, options = {}) {
  const body = String(text).slice(0, 4096);
  return callApi('sendMessage', { chat_id: chatId, text: body, ...options });
}

function sendKeyboard(chatId, text, keyboard, options = {}) {
  const reply_markup = { inline_keyboard: Array.isArray(keyboard) ? keyboard : [] };
  return sendMessage(chatId, text, { reply_markup, ...options });
}

function answerCallbackQuery(callbackQueryId) {
  return callApi('answerCallbackQuery', { callback_query_id: callbackQueryId });
}

module.exports = { sendMessage, sendKeyboard, answerCallbackQuery };

