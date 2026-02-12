/**
 * Helpers: парсинг update, команди, обгортки відправки
 */
const telegram = require('./telegram');

function extractMessage(update) {
  const result = {
    chatId: null,
    text: null,
    messageId: null,
    type: null,
    callbackData: null,
    callbackQueryId: null
  };
  if (update.message) {
    result.chatId = update.message.chat.id;
    result.messageId = update.message.message_id;
    if (update.message.text) {
      result.text = update.message.text;
      result.type = 'text';
    }
  }
  if (update.callback_query) {
    const msg = update.callback_query.message;
    if (msg && msg.chat) {
      result.chatId = msg.chat.id;
      result.messageId = msg.message_id;
    } else if (update.callback_query.from && update.callback_query.from.id != null) {
      result.chatId = update.callback_query.from.id;
    }
    result.callbackData = update.callback_query.data;
    result.callbackQueryId = update.callback_query.id;
    result.type = 'callback';
  }
  return result;
}

function isCommand(update, command) {
  if (!update.message || !update.message.text) return false;
  const text = String(update.message.text).trim();
  const cmd = '/' + command;
  return text === cmd || text.indexOf(cmd + ' ') === 0;
}

function safeSend(chatId, text, options) {
  if (!text || String(text).trim() === '') return Promise.resolve(null);
  return telegram.sendMessage(chatId, String(text).slice(0, 4096), options || {});
}

function sendKeyboard(chatId, text, keyboard) {
  return telegram.sendKeyboard(chatId, text, keyboard);
}

function answerCallback(callbackQueryId) {
  return telegram.answerCallbackQuery(callbackQueryId);
}

module.exports = {
  extractMessage,
  isCommand,
  safeSend,
  sendKeyboard,
  answerCallback
};
