/**
 * Helpers.gs - Telegram Bot API Wrapper
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Відправка повідомлень (safeSend)
 * - Відправка клавіатур (sendKeyboard)
 * - Редагування повідомлень (editMessage)
 * - Відповідь на callback (answerCallback)
 * - Парсинг Telegram update
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - FSM логіку
 * - Роботу з БД
 */

// ═══════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Виклик Telegram API
 * @private
 * @param {string} method - Назва методу (sendMessage, editMessageText...)
 * @param {Object} params - Параметри запиту
 * @returns {Object|null} - Відповідь API (result) або null
 */
function callTelegramAPI_(method, params) {
  try {
    var url = TELEGRAM_API_URL + method;

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    if (!result.ok) {
      Logger.log('Telegram API error [' + method + ']: ' + (result.description || ''));
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Helpers.callTelegramAPI_', method + ' error: ' + (result.description || ''));
        }
      } catch (e1) {}
      return null;
    }

    return result.result;
  } catch (error) {
    Logger.log('callTelegramAPI_ error [' + method + ']: ' + error.message);
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Helpers.callTelegramAPI_', method + ' exception: ' + error.message);
      }
    } catch (e2) {}
    return null;
  }
}

/**
 * Об'єднати об'єкт опцій з базовим (без spread)
 * @private
 */
function mergeOptions_(base, options) {
  var k;
  if (!options || typeof options !== 'object') {
    return base;
  }
  for (k in options) {
    if (options.hasOwnProperty(k)) {
      base[k] = options[k];
    }
  }
  return base;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ВІДПРАВКА ПОВІДОМЛЕНЬ
// ═══════════════════════════════════════════════════════════

/**
 * Безпечна відправка повідомлення
 *
 * @param {string|number} chatId - Telegram ChatID
 * @param {string} text - Текст повідомлення
 * @param {Object} options - Додаткові опції (parse_mode, reply_markup...)
 * @returns {Object|null} - Message object або null
 *
 * @example
 * Helpers.safeSend(chatId, "Привіт! 👋");
 * Helpers.safeSend(chatId, "**Жирний текст**", { parse_mode: 'Markdown' });
 */
function safeSend(chatId, text, options) {
  options = options || {};
  if (!text || String(text).trim() === '') {
    Logger.log('safeSend: Empty text');
    return null;
  }

  text = String(text);
  if (text.length > 4096) {
    text = text.substring(0, 4093) + '...';
  }

  var params = { chat_id: chatId, text: text };
  mergeOptions_(params, options);
  return callTelegramAPI_('sendMessage', params);
}

/**
 * Відправка повідомлення з inline клавіатурою
 *
 * @param {string|number} chatId
 * @param {string} text
 * @param {Array<Array<Object>>} keyboard - Inline keyboard
 * @param {Object} options - Додаткові опції
 * @returns {Object|null}
 *
 * @example
 * var keyboard = [
 *   [{ text: 'Кнопка 1', callback_data: 'btn1' }],
 *   [{ text: 'Кнопка 2', callback_data: 'btn2' }]
 * ];
 * Helpers.sendKeyboard(chatId, "Виберіть:", keyboard);
 */
function sendKeyboard(chatId, text, keyboard, options) {
  options = options || {};
  var params = {
    chat_id: chatId,
    text: String(text),
    reply_markup: { inline_keyboard: keyboard }
  };
  mergeOptions_(params, options);
  return callTelegramAPI_('sendMessage', params);
}

/**
 * Редагування існуючого повідомлення
 *
 * @param {string|number} chatId
 * @param {number} messageId - ID повідомлення для редагування
 * @param {string} newText - Новий текст
 * @param {Object} options - Додаткові опції
 * @returns {Object|null}
 *
 * @example
 * Helpers.editMessage(chatId, 123, "Оновлений текст");
 */
function editMessage(chatId, messageId, newText, options) {
  options = options || {};
  if (!newText || String(newText).trim() === '') {
    Logger.log('editMessage: Empty text');
    return null;
  }
  var params = {
    chat_id: chatId,
    message_id: messageId,
    text: String(newText)
  };
  mergeOptions_(params, options);
  return callTelegramAPI_('editMessageText', params);
}

/**
 * Редагування клавіатури існуючого повідомлення
 *
 * @param {string|number} chatId
 * @param {number} messageId
 * @param {Array<Array<Object>>} newKeyboard
 * @returns {Object|null}
 */
function editKeyboard(chatId, messageId, newKeyboard) {
  var params = {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: newKeyboard }
  };
  return callTelegramAPI_('editMessageReplyMarkup', params);
}

/**
 * Видалення повідомлення
 *
 * @param {string|number} chatId
 * @param {number} messageId
 * @returns {boolean}
 */
function deleteMessage(chatId, messageId) {
  var params = { chat_id: chatId, message_id: messageId };
  var result = callTelegramAPI_('deleteMessage', params);
  return result !== null;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - CALLBACK QUERIES
// ═══════════════════════════════════════════════════════════

/**
 * Відповідь на callback query (прибрати "годинник" на кнопці)
 *
 * @param {string} callbackQueryId - ID callback query
 * @param {string} text - Текст для показу (опціонально)
 * @param {boolean} showAlert - Показати як alert (true) або toast (false)
 * @returns {boolean}
 *
 * КРИТИЧНО: Завжди викликати ПЕРШИМ при обробці callback!
 *
 * @example
 * Helpers.answerCallback(callbackQueryId);
 * Helpers.answerCallback(callbackQueryId, "✅ Збережено!");
 * Helpers.answerCallback(callbackQueryId, "❌ Помилка!", true);
 */
function answerCallback(callbackQueryId, text, showAlert) {
  text = text || '';
  showAlert = showAlert === true;
  var params = { callback_query_id: callbackQueryId };
  if (text) {
    params.text = text;
    params.show_alert = showAlert;
  }
  var result = callTelegramAPI_('answerCallbackQuery', params);
  return result !== null;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ПАРСИНГ UPDATE
// ═══════════════════════════════════════════════════════════

/**
 * Витягти інформацію з Telegram update
 *
 * @param {Object} update - Telegram update object
 * @returns {Object} - { chatId, text, messageId, type, callbackData, callbackQueryId }
 *
 * @example
 * var data = Helpers.extractMessage(update);
 */
function extractMessage(update) {
  var result = {
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
    // Захист: callback_query без message (напр. видалене повідомлення) — chatId з from (приватний чат: from.id === chat.id)
    var msg = update.callback_query.message;
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

/**
 * Перевірити чи update містить команду
 *
 * @param {Object} update
 * @param {string} command - Команда без "/" (наприклад, "start")
 * @returns {boolean}
 */
function isCommand(update, command) {
  if (!update.message || !update.message.text) {
    return false;
  }
  var text = String(update.message.text).trim();
  var cmdPrefix = '/' + command;
  return text === cmdPrefix || text.indexOf(cmdPrefix + ' ') === 0;
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD BUILDERS
// ═══════════════════════════════════════════════════════════

/**
 * Створити inline клавіатуру з одного ряду кнопок
 *
 * @param {Array<Object>} buttons - Масив { text, callback_data }
 * @returns {Array<Array<Object>>}
 *
 * @example
 * var keyboard = Helpers.buildInlineRow([
 *   { text: 'Так ✅', callback_data: 'yes' },
 *   { text: 'Ні ❌', callback_data: 'no' }
 * ]);
 */
function buildInlineRow(buttons) {
  return [buttons];
}

/**
 * Створити inline клавіатуру з кількох рядів
 *
 * @param {Array<Array<Object>>} rows - Масив рядів кнопок
 * @returns {Array<Array<Object>>}
 *
 * @example
 * var keyboard = Helpers.buildInlineKeyboard([
 *   [{ text: 'Кнопка 1', callback_data: 'btn1' }],
 *   [{ text: '🔙 Назад', callback_data: CALLBACKS.BACK_TO_MAIN }]
 * ]);
 */
function helpersBuildInlineKeyboard_(rows) {
  return rows;
}

/**
 * Додати кнопку "Назад" до клавіатури
 *
 * @param {Array<Array<Object>>} keyboard - Існуюча клавіатура
 * @param {string} backCallback - callback_data для кнопки назад
 * @returns {Array<Array<Object>>}
 *
 * @example
 * var keyboard = [[{ text: 'Option 1', callback_data: 'opt1' }]];
 * keyboard = Helpers.addBackButton(keyboard, CONSTANTS.CALLBACKS.BACK_TO_MAIN);
 */
function addBackButton(keyboard, backCallback) {
  var backLabel = (typeof CONSTANTS !== 'undefined' && CONSTANTS.EMOJI && CONSTANTS.EMOJI.BACK)
    ? CONSTANTS.EMOJI.BACK + ' Назад'
    : '🔙 Назад';
  var backButton = { text: backLabel, callback_data: backCallback };
  var newRows = [];
  var i;
  for (i = 0; i < keyboard.length; i++) {
    newRows.push(keyboard[i]);
  }
  newRows.push([backButton]);
  return newRows;
}

// ═══════════════════════════════════════════════════════════
// ADVANCED (retry)
// ═══════════════════════════════════════════════════════════

/** Затримка мс між спробами retry (якщо немає CONSTANTS.PERFORMANCE) */
var RETRY_DELAY_MS = 500;

/**
 * Відправка повідомлення з retry
 *
 * @param {string|number} chatId
 * @param {string} text
 * @param {number} maxRetries - Кількість спроб (за замовчуванням 3)
 * @returns {Object|null}
 */
function safeSendWithRetry(chatId, text, maxRetries) {
  maxRetries = maxRetries != null ? maxRetries : 3;
  var delayMs = (typeof CONSTANTS !== 'undefined' && CONSTANTS.PERFORMANCE && CONSTANTS.PERFORMANCE.RETRY_DELAY_MS != null)
    ? CONSTANTS.PERFORMANCE.RETRY_DELAY_MS
    : RETRY_DELAY_MS;
  var attempts = 0;
  var result;

  while (attempts < maxRetries) {
    result = safeSend(chatId, text);

    if (result !== null) {
      return result;
    }

    if (attempts < maxRetries - 1) {
      Utilities.sleep(delayMs * (attempts + 1));
    }
    attempts++;
  }

  Logger.log('safeSendWithRetry failed after ' + maxRetries + ' attempts');
  return null;
}

/**
 * Лог у таблицю Logs через Sheets.insertLog (якщо доступно).
 * Використовується, коли немає доступу до Executions/Logger.
 *
 * @param {string} level - рівень логування (CONSTANTS.LOG_LEVELS)
 * @param {string} module - назва модуля/контекст
 * @param {string} message - повідомлення
 */
function logToSheets(level, module, message) {
  try {
    try {
      var logEnabled = PropertiesService.getScriptProperties().getProperty('LOG_TO_SHEETS');
      if (String(logEnabled || '') !== '1') {
        return false;
      }
    } catch (pErr) {}
    if (typeof Sheets === 'undefined' || typeof Sheets.insertLog !== 'function') {
      Logger.log('logToSheets: Sheets.insertLog not available');
      return false;
    }
    if (typeof CONSTANTS === 'undefined' || !CONSTANTS.LOG_LEVELS) {
      Logger.log('logToSheets: CONSTANTS.LOG_LEVELS not available');
      return false;
    }
    var lvl = level || CONSTANTS.LOG_LEVELS.INFO;
    return Sheets.insertLog(new Date().toISOString(), lvl, module || 'logToSheets', message || '');
  } catch (e) {
    Logger.log('logToSheets error: ' + (e && e.message));
    return false;
  }
}

// Експорт для Router та інших модулів (GAS один глобальний namespace)
var Helpers = {
  safeSend: safeSend,
  sendKeyboard: sendKeyboard,
  editMessage: editMessage,
  editKeyboard: editKeyboard,
  deleteMessage: deleteMessage,
  answerCallback: answerCallback,
  extractMessage: extractMessage,
  isCommand: isCommand,
  buildInlineRow: buildInlineRow,
  buildInlineKeyboard: helpersBuildInlineKeyboard_,
  addBackButton: addBackButton,
  safeSendWithRetry: safeSendWithRetry,
  logToSheets: logToSheets
};
