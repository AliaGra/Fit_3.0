/**
 * Helpers: парсинг update, команди, обгортки відправки
 */
const telegram = require('./telegram');

function normalizeTelegramUsername(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim().replace(/^@+/, '');
  if (!s || !/^[a-zA-Z0-9_]{4,32}$/.test(s)) return '';
  return s;
}

function extractTelegramUsernameFromUpdate(update) {
  if (!update) return '';
  const from =
    (update.message && update.message.from) ||
    (update.callback_query && update.callback_query.from) ||
    null;
  return normalizeTelegramUsername(from && from.username);
}

function telegramDirectMessageUrl(user) {
  if (!user) return '';
  const username = normalizeTelegramUsername(user.telegramUsername);
  if (username) return 'https://t.me/' + username;
  const chatId = user.chatId != null ? String(user.chatId).trim() : '';
  if (chatId && /^-?\d+$/.test(chatId)) return 'tg://user?id=' + chatId;
  return '';
}

/** Кнопка url для особистого чату в Telegram; null якщо контакт недоступний. */
function telegramContactButton(label, user) {
  const url = telegramDirectMessageUrl(user);
  if (!url) return null;
  return { text: label, url };
}

function canTelegramDirectMessage(user) {
  return !!telegramDirectMessageUrl(user);
}

function extractMessage(update) {
  const result = {
    chatId: null,
    text: null,
    messageId: null,
    type: null,
    callbackData: null,
    callbackQueryId: null,
    file: null,
    telegramUsername: ''
  };
  if (update.message) {
    result.chatId = update.message.chat.id;
    result.messageId = update.message.message_id;
    result.telegramUsername = extractTelegramUsernameFromUpdate(update);
    if (update.message.location && update.message.location.latitude != null && update.message.location.longitude != null) {
      result.type = 'location';
      result.location = {
        latitude: update.message.location.latitude,
        longitude: update.message.location.longitude
      };
    } else if (update.message.contact && update.message.contact.phone_number) {
      result.type = 'contact';
      result.contact = {
        phone_number: update.message.contact.phone_number,
        user_id: update.message.contact.user_id || null
      };
    } else if (update.message.text) {
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
    result.telegramUsername = extractTelegramUsernameFromUpdate(update);
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

/**
 * Посилання на «сторінку» тренера в цьому боті (deep link /start pvch_<chatId>).
 * Потрібен TELEGRAM_BOT_USERNAME або BOT_USERNAME у змінних середовища.
 * @param {string|number} coachChatId
 * @returns {string}
 */
/** Username основного бота (без @): для deep link і кнопок url у адмінці. */
function mainBotUsername() {
  return String(
    process.env.TELEGRAM_BOT_USERNAME || process.env.MAIN_BOT_USERNAME || process.env.BOT_USERNAME || ''
  )
    .replace(/^@/, '')
    .trim();
}

function publicCoachPageLink(coachChatId) {
  const uname = mainBotUsername();
  if (!uname) return '';
  const id = String(coachChatId || '').trim();
  if (!id) return '';
  return `https://t.me/${uname}?start=pvch_${id}`;
}

/** Deep link на картку закладу в цьому боті (/start venue_<venueId>). */
function publicVenuePageLink(venueId) {
  const uname = mainBotUsername();
  if (!uname) return '';
  const id = String(venueId || '').trim();
  if (!id) return '';
  return `https://t.me/${uname}?start=venue_${id}`;
}

/** Атрибут href у Telegram HTML: лише & та ". */
function htmlHrefAttr(url) {
  if (url == null || url === '') return '';
  return String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

module.exports = {
  extractMessage,
  extractTelegramUsernameFromUpdate,
  normalizeTelegramUsername,
  telegramDirectMessageUrl,
  telegramContactButton,
  canTelegramDirectMessage,
  isCommand,
  escapeHtml,
  safeSend,
  safeSendDocument,
  safeSendPhoto,
  sendKeyboard,
  answerCallback,
  getExperienceStatusLabel,
  publicCoachPageLink,
  publicVenuePageLink,
  mainBotUsername,
  htmlHrefAttr
};
