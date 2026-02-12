/**
 * Router.gs - Маршрутизатор запитів
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Парсинг Telegram update
 * - Розподіл по Handler модулям
 * - SMART ROUTING з перевіркою State
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - FSM переходи
 * - Роботу з БД
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Головна функція маршрутизації
 * Викликається з Main.doPost()
 *
 * @param {Object} update - Telegram update object
 */
function route(update) {
  var data = null;
  try {
    data = Helpers.extractMessage(update);

    if (!data || !data.chatId) {
      Logger.log('Router: Invalid update structure (chatId missing). type=' + (data ? data.type : 'null'));
      return;
    }

    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Router.route', 'type=' + (data.type || 'null') + ' chatId=' + (data.chatId || ''));
      }
    } catch (elog) {}

    if (data.type === 'text') {
      handleTextMessage_(data.chatId, data.text, data.messageId);
    } else if (data.type === 'callback') {
      try {
        if (typeof CONSTANTS !== 'undefined' && CONSTANTS.CONFIG && CONSTANTS.CONFIG.DEBUG) {
          Logger.log('Router: callback_data=' + (data.callbackData || '') + ' chatId=' + data.chatId);
        }
      } catch (e) {}
      handleCallback_(data.chatId, data.callbackData, data.callbackQueryId, data.messageId);
    } else {
      Logger.log('Router: Unknown update type: ' + (data.type || 'null'));
    }
  } catch (error) {
    Logger.log('Router.route error: ' + error.message);
    if (error.stack) {
      Logger.log(error.stack);
    }
    var errChatId = (data && data.chatId) ? data.chatId : null;
    if (!errChatId && update) {
      if (update.message && update.message.chat) {
        errChatId = update.message.chat.id;
      } else if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
        errChatId = update.callback_query.message.chat.id;
      }
    }
    if (errChatId && typeof Helpers !== 'undefined' && Helpers.safeSend) {
      var backLabel = (typeof CONSTANTS !== 'undefined' && CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME)
        ? CONSTANTS.EMOJI.HOME + ' Головне меню'
        : '🏠 Головне меню';
      var backAction = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && CONSTANTS.CALLBACKS.BACK_TO_MAIN)
        ? CONSTANTS.CALLBACKS.BACK_TO_MAIN
        : 'BACK_TO_MAIN';
      var keyboard = [[{ text: backLabel, callback_data: backAction }]];
      try {
        if (typeof Helpers.sendKeyboard === 'function') {
          Helpers.sendKeyboard(errChatId, "❌ Виникла технічна помилка. Спробуй /start або зв'яжися з підтримкою.", keyboard);
        } else {
          Helpers.safeSend(errChatId, "❌ Виникла технічна помилка. Спробуй /start або зв'яжися з підтримкою.");
        }
      } catch (sendErr) {
        Helpers.safeSend(errChatId, "❌ Виникла технічна помилка. Спробуй /start або зв'яжися з підтримкою.");
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - TEXT MESSAGE ROUTING
// ═══════════════════════════════════════════════════════════

/**
 * Обробка текстового повідомлення
 * @private
 */
function handleTextMessage_(chatId, text, messageId) {
  var fakeUpdate = { message: { text: text } };

  if (Helpers.isCommand(fakeUpdate, 'start')) {
    State.clear(chatId);
    try {
      var cache = CacheService.getScriptCache();
      cache.remove('WELCOME_' + String(chatId));
      var regKey = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_STEP)
        ? CONSTANTS.CACHE.PREFIX_REG_STEP
        : 'REG_STEP_';
      cache.remove(regKey + String(chatId));
    } catch (e0) {}
    var user = User.getByChatId(chatId);
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Router.handleTextMessage', '/start user=' + (user ? 'found' : 'not_found'));
      }
    } catch (e) {}
    if (user) {
      Menu.show(chatId);
    } else {
      Registration.start(chatId, { force: true });
    }
    return;
  }

  var state = State.getSafe(chatId, 3, 100);

  if (!state || !state.step) {
    var regStep = null;
    try {
      var regCache = CacheService.getScriptCache();
      var regKey2 = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_STEP)
        ? CONSTANTS.CACHE.PREFIX_REG_STEP
        : 'REG_STEP_';
      regStep = regCache.get(regKey2 + String(chatId));
      if (!regStep) {
        try {
          regStep = PropertiesService.getScriptProperties().getProperty(regKey2 + String(chatId));
        } catch (pErr) {}
      }
    } catch (eReg) {}
    if (regStep && (String(regStep).indexOf('reg_') === 0 || String(regStep).indexOf('coach_') === 0)) {
      State.set(chatId, { step: String(regStep) });
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.WARN, 'Router.handleTextMessage', 'state missing, restored step=' + regStep + ' chatId=' + chatId);
        }
      } catch (elog) {}
      Registration.handleTextMessage(chatId, text);
      return;
    }
    var userExists = User.getByChatId(chatId);
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.WARN, 'Router.handleTextMessage', 'state missing, regStep=' + (regStep || '') + ' userExists=' + (userExists ? 'yes' : 'no') + ' chatId=' + chatId);
      }
    } catch (elog2) {}
    if (!userExists) {
      Helpers.safeSend(chatId, "👋 Привіт! Натисни /start щоб почати.");
      return;
    }
    Menu.show(chatId);
    return;
  }

  var step = state.step;

  if (step.indexOf('reg_') === 0) {
    Registration.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('profile_') === 0) {
    Profile.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('training_') === 0) {
    Training.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('history_') === 0) {
    Training.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('reports_') === 0) {
    Training.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('coach_') === 0) {
    Registration.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('pricing_') === 0) {
    Registration.handleTextMessage(chatId, text);
    return;
  }

  if (step.indexOf('sch_') === 0) {
    if (typeof Schedule !== 'undefined' && typeof Schedule.handleTextMessage === 'function') {
      Schedule.handleTextMessage(chatId, text);
    } else {
      State.clear(chatId);
      Menu.show(chatId);
    }
    return;
  }

  Logger.log('Router: Unknown FSM state: ' + step);
  State.clear(chatId);
  Helpers.safeSend(chatId, "⚠️ Щось пішло не так. Почни спочатку:\n/start");
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - CALLBACK ROUTING
// ═══════════════════════════════════════════════════════════

/**
 * Обробка callback query (натискання кнопки)
 * КРИТИЧНО: answerCallback() викликається першим (Схемы_технических_данных_v2, діаграма 2.2).
 * WORKAROUND: Затримка 300ms перед читанням State (Проблемные_зоны.md §1 — Race Condition).
 * @private
 */
function handleCallback_(chatId, callbackData, callbackQueryId, messageId) {
  if (callbackQueryId != null && String(callbackQueryId) !== '') {
    try { Helpers.answerCallback(callbackQueryId); } catch (acErr) {
      try { Logger.log('Router answerCallback: ' + (acErr && acErr.message)); } catch (x) {}
    }
  }

  if (callbackData == null || String(callbackData).trim() === '') {
    Logger.log('Router: callback_data empty, chatId=' + chatId);
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.WARN, 'Router.handleCallback', 'callback_data empty chatId=' + chatId);
      }
    } catch (e0) {}
    return;
  }
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Router.handleCallback', 'enter raw=' + String(callbackData));
    }
  } catch (e00) {}

  var parsed;
  try {
    parsed = typeof parseCallbackData === 'function'
      ? parseCallbackData(callbackData)
      : { action: String(callbackData).split(':')[0], params: String(callbackData).split(':').slice(1) };
  } catch (parseErr) {
    parsed = { action: String(callbackData).split(':')[0], params: String(callbackData).split(':').slice(1) };
  }
  var action = String(parsed.action || '').trim();
  var params = parsed.params || [];
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Router.handleCallback', 'raw=' + callbackData + ' action=' + action);
    }
  } catch (e1) {}

  var C = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS) ? CONSTANTS.CALLBACKS : {};
  var BACK_TO_MAIN = C.BACK_TO_MAIN || 'BACK_TO_MAIN';
  var CANCEL_ACTION = C.CANCEL_ACTION || 'CANCEL_ACTION';
  var BACK_TO_PROFILE = C.BACK_TO_PROFILE || 'BACK_TO_PROFILE';
  var BACK_TO_HISTORY = C.BACK_TO_HISTORY || 'BACK_TO_HISTORY';
  var BACK_TO_STUDENTS = C.BACK_TO_STUDENTS || 'BACK_TO_STUDENTS';

  Utilities.sleep(300);

  if (action === BACK_TO_MAIN) {
    State.clear(chatId);
    Menu.show(chatId);
    return;
  }

  if (action === CANCEL_ACTION) {
    State.clear(chatId);
    Helpers.safeSend(chatId, "❌ Дію скасовано");
    Menu.show(chatId);
    return;
  }

  if (action.indexOf('REG_') === 0 || action === 'CITY') {
    try { Logger.log('Router: calling Registration.handleCallback, action=' + action); } catch (e) {}
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Router.handleCallback', 'action=' + action);
      }
    } catch (e2) {}
    Registration.handleCallback(chatId, action, params);
    return;
  }

  if (action.indexOf('PROFILE_') === 0) {
    Profile.handleCallback(chatId, action, params);
    return;
  }

  if (action.indexOf('TRAINING_') === 0 ||
      action.indexOf('HISTORY_') === 0 ||
      action.indexOf('REPORTS_') === 0 ||
      action === 'GROUP' ||
      action === 'EXERCISE' ||
      action.indexOf('CIRCUIT_') === 0 ||
      action.indexOf('SELF_') === 0 ||
      action.indexOf('LIBRARY_') === 0) {
    Training.handleCallback(chatId, action, params);
    return;
  }

  // Coach-учні: список, картка учня; Pricing; тип тренування за замовчуванням (STUDENT_TRAINING_TYPE, STUDENT_TYPE_*)
  if (action.indexOf('COACH_') === 0 || action === 'VIEW_STUDENT' || action.indexOf('PRICING_') === 0 ||
      action === 'STUDENT_TRAINING_TYPE' || action.indexOf('STUDENT_TYPE_') === 0) {
    Registration.handleCallback(chatId, action, params);
    return;
  }

  if (action.indexOf('SCH_') === 0) {
    if (typeof Schedule !== 'undefined' && typeof Schedule.handleCallback === 'function') {
      Schedule.handleCallback(chatId, action, params);
    } else {
      State.clear(chatId);
      Menu.show(chatId);
    }
    return;
  }

  if (action === BACK_TO_PROFILE) {
    State.clear(chatId);
    Profile.handleCallback(chatId, (C.PROFILE_VIEW || 'PROFILE_VIEW'), []);
    return;
  }

  if (action === BACK_TO_HISTORY) {
    State.clear(chatId);
    Training.handleCallback(chatId, (C.HISTORY_MENU || 'HISTORY_MENU'), []);
    return;
  }

  if (action === BACK_TO_STUDENTS) {
    State.clear(chatId);
    Registration.handleCallback(chatId, (C.COACH_STUDENTS || 'COACH_STUDENTS'), []);
    return;
  }

  Logger.log('Router: Unknown callback: ' + callbackData);
  Helpers.safeSend(chatId, "⚠️ Ця кнопка більше не активна. Повертаю до меню.");
  State.clear(chatId);
  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// ADVANCED - SMART ROUTING (для конфліктних callback)
// ═══════════════════════════════════════════════════════════

/**
 * Роутинг за контекстом State (наприклад BACK без префіксу).
 * @private
 */
function smartRouteByState_(chatId, action, params) {
  var state = State.get(chatId);

  if (!state || !state.step) {
    Menu.show(chatId);
    return;
  }

  var step = state.step;

  if (action === 'BACK') {
    if (step.indexOf('reg_') === 0) {
      Registration.handleCallback(chatId, 'BACK', params);
    } else if (step.indexOf('profile_') === 0) {
      Profile.handleCallback(chatId, 'BACK', params);
    } else if (step.indexOf('training_') === 0 || step.indexOf('history_') === 0) {
      Training.handleCallback(chatId, 'BACK', params);
    } else {
      Menu.show(chatId);
    }
    return;
  }

  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// DEBUG HELPERS (для розробки)
// ═══════════════════════════════════════════════════════════

var ROUTER_DEBUG = false;

function logUpdate_(update) {
  if (ROUTER_DEBUG) {
    Logger.log('=== ROUTER DEBUG ===');
    Logger.log('Update: ' + JSON.stringify(update));
  }
}

/**
 * Перевірка доступності модулів (для аудиту)
 */
function checkModulesAvailability() {
  Logger.log('=== MODULE AVAILABILITY CHECK ===');
  Logger.log((typeof State !== 'undefined' && typeof State.get === 'function' ? '✅' : '❌') + ' State.get()');
  Logger.log((typeof Helpers !== 'undefined' && typeof Helpers.safeSend === 'function' ? '✅' : '❌') + ' Helpers.safeSend()');
  Logger.log((typeof User !== 'undefined' && typeof User.getByChatId === 'function' ? '✅' : '❌') + ' User.getByChatId()');
  Logger.log((typeof Menu !== 'undefined' && typeof Menu.show === 'function' ? '✅' : '❌') + ' Menu.show()');
  Logger.log((typeof Registration !== 'undefined' && typeof Registration.start === 'function' ? '✅' : '❌') + ' Registration.start()');
  Logger.log((typeof Profile !== 'undefined' && typeof Profile.handleCallback === 'function' ? '✅' : '❌') + ' Profile.handleCallback()');
  Logger.log((typeof Training !== 'undefined' && typeof Training.handleCallback === 'function' ? '✅' : '❌') + ' Training.handleCallback()');
  Logger.log((typeof Schedule !== 'undefined' && typeof Schedule.handleCallback === 'function' ? '✅' : '❌') + ' Schedule.handleCallback()');
}

// Експорт для Main.checkModules (Main.doPost викликає глобальну route())
var Router = {
  route: route
};
