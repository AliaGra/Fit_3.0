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
    callbackQueryId: null,
    file: null
  };
  if (update.message) {
    result.chatId = update.message.chat.id;
    result.messageId = update.message.message_id;
    if (update.message.text) {
      result.text = update.message.text;
      result.type = 'text';
    } else if (update.message.document && update.message.document.file_id) {
      result.type = 'file';
      result.file = {
        kind: 'document',
        fileId: update.message.document.file_id,
        fileUniqueId: update.message.document.file_unique_id || null,
        fileName: update.message.document.file_name || null,
        mimeType: update.message.document.mime_type || null
      };
    } else if (Array.isArray(update.message.photo) && update.message.photo.length) {
      // take biggest size
      const p = update.message.photo[update.message.photo.length - 1];
      if (p && p.file_id) {
        result.type = 'file';
        result.file = {
          kind: 'photo',
          fileId: p.file_id,
          fileUniqueId: p.file_unique_id || null,
          fileName: null,
          mimeType: null
        };
      }
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

/** Для parse_mode: HTML у Telegram (екранування &lt; &gt; &amp;) */
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeSend(chatId, text, options) {
  if (!text || String(text).trim() === '') return Promise.resolve(null);
  return telegram.sendMessage(chatId, String(text).slice(0, 4096), options || {});
}

function safeSendDocument(chatId, fileId, options) {
  if (!fileId || String(fileId).trim() === '') return Promise.resolve(null);
  return telegram.sendDocument(chatId, String(fileId).trim(), options || {});
}

function safeSendPhoto(chatId, fileId, options) {
  if (!fileId || String(fileId).trim() === '') return Promise.resolve(null);
  return telegram.sendPhoto(chatId, String(fileId).trim(), options || {});
}

function sendKeyboard(chatId, text, keyboard, options) {
  return telegram.sendKeyboard(chatId, text, keyboard, options);
}

function answerCallback(callbackQueryId) {
  return telegram.answerCallbackQuery(callbackQueryId);
}

/**
 * Статус досвіду учня: від дати реєстрації (createdAt) та дати встановлення досвіду тренером (experienceStartDate).
 * 0–90 днів = 0–3 м-ців, 91–180 = 4–6 м-ців, 181–365 = 6–12 м-ців, 366+ днів від реєстрації = Більше року.
 * @param {{ createdAt?: Date|null, experienceStartDate?: Date|null }} student
 * @returns {string}
 */
function getExperienceStatusLabel(student) {
  if (!student) return 'не вказано';
  const now = Date.now();
  const created = student.createdAt instanceof Date ? student.createdAt.getTime() : (student.createdAt ? new Date(student.createdAt).getTime() : 0);
  const daysReg = created ? Math.floor((now - created) / (24 * 60 * 60 * 1000)) : 0;
  if (daysReg >= 366) return 'Більше року';
  const expStart = student.experienceStartDate instanceof Date ? student.experienceStartDate.getTime() : (student.experienceStartDate ? new Date(student.experienceStartDate).getTime() : null);
  if (expStart == null) return 'не вказано';
  const daysExp = Math.floor((now - expStart) / (24 * 60 * 60 * 1000));
  if (daysExp <= 90) return '0-3 м-ців';
  if (daysExp <= 180) return '4-6 м-ців';
  if (daysExp <= 365) return '6-12 м-ців';
  return 'Більше року';
}

module.exports = {
  extractMessage,
  isCommand,
  escapeHtml,
  safeSend,
  safeSendDocument,
  safeSendPhoto,
  sendKeyboard,
  answerCallback,
  getExperienceStatusLabel
};
