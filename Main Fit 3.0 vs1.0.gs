/**
 * Main.gs - Entry Point
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Прийом webhook від Telegram
 * - Делегування Router (route)
 * - Налаштування webhook
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - Роботу з БД
 * - FSM логіку
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API - WEBHOOK
// ═══════════════════════════════════════════════════════════

/**
 * Головна функція - точка входу webhook
 *
 * Викликається Telegram при кожному update (повідомлення, кнопка)
 *
 * @param {Object} e - Event object від Google Apps Script
 * @returns {ContentService.TextOutput} - Response для Telegram
 *
 * КРИТИЧНО:
 * - Завжди повертати 200 OK
 * - Обробляти помилки без падіння
 * - Логувати всі помилки
 */
// Єдиний об'єкт відповіді 200 (менше ризику throw у doPost)
var _okResponse;

/**
 * GET-запити (відкриття URL у браузері, або ping для прогріву).
 * Telegram вебхук використовує лише POST (doPost); doGet потрібен щоб не було помилки "doGet not found"
 * і для keepWarm — тригер кожні 1–2 хв викликає GET, щоб скрипт не засинав (менший cold start).
 */
function doGet() {
  return ContentService.createTextOutput('FIT 3.0 bot. Webhook: POST only.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ═══════════════════════════════════════════════════════════
// KEEP WARM — прогрів GAS (менший cold start, швидший відгук бота)
// ═══════════════════════════════════════════════════════════
// Script Properties: WEBAPP_URL — URL розгорнутого веб-додатку (той самий, що в webhook Telegram).
// Один раз виконайте installKeepWarmTrigger() — створиться тригер кожні 1 хв.

/**
 * Викликається тригером по часу. Робить GET на WEBAPP_URL, щоб «прогріти» інстанс GAS.
 */
function keepWarm() {
  var url = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');
  if (!url || !url.trim()) return;
  try {
    UrlFetchApp.fetch(url.trim(), { method: 'get', muteHttpExceptions: true });
  } catch (e) {
    try { Logger.log('keepWarm: ' + (e && e.message)); } catch (x) {}
  }
}

/**
 * Створити тригер: кожну 1 хвилину викликати keepWarm().
 * Запустіть один раз вручну (Редактор → вибрати installKeepWarmTrigger → Запустити).
 * Перед цим у Script Properties додайте WEBAPP_URL = URL вашого розгорнутого веб-додатку.
 */
function installKeepWarmTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = triggers.length - 1; i >= 0; i--) {
    if (triggers[i].getHandlerFunction() === 'keepWarm') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(1).create();
  Logger.log('Тригер keepWarm встановлено: кожну 1 хв.');
}

/**
 * Видалити тригер прогріву (якщо більше не потрібен).
 */
function removeKeepWarmTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'keepWarm') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  Logger.log('Видалено тригерів keepWarm: ' + n);
}

/**
 * Вхід по діаграмі 2 (Схемы_технических_данных): doPost → route → handleTextMessage_('/start')
 * → State.clear → User.getByChatId → Registration.start → safeSend.
 * 200 повертається лише після цього ланцюжка; User.getByChatId без кешу ~3с (діаграма 8),
 * тому Telegram встигає зробити retry ~через 5 с. Дедуплікація update_id — на вході, до route().
 */
function doPost(e) {
  try {
    var update = null;
    if (e && e.postData && e.postData.contents) {
      try {
        update = JSON.parse(e.postData.contents);
      } catch (parseError) {}
    }
    if (!update || typeof update !== 'object') {
      return getOkResponse_();
    }

    // Вхід: атомарна дедуплікація (Проблемные зоны §1 — Race Condition при retry Telegram)
    // Lock гарантує: при retry того ж update_id лише один doPost обробить update, інші одразу повернуть 200
    var updateId = update.update_id;
    if (updateId != null) {
      var dedupeKey = 'UPD_' + String(updateId);
      var cache = CacheService.getScriptCache();
      var lock = LockService.getScriptLock();
      var skipProcess = false;
      try {
        lock.waitLock(5000);
        if (cache.get(dedupeKey)) {
          skipProcess = true;
        } else {
          cache.put(dedupeKey, '1', 300);
        }
      } catch (lockErr) {
        try { Logger.log('doPost dedupe lock: ' + (lockErr && lockErr.message)); } catch (x) {}
        if (cache.get(dedupeKey)) { skipProcess = true; }
      } finally {
        try { lock.releaseLock(); } catch (e) {}
      }
      if (skipProcess) {
        return getOkResponse_();
      }
    }

    try {
      if (typeof Logger !== 'undefined' && Logger.log) {
        if (update.callback_query) {
          Logger.log('doPost: callback_query received, data=' + (update.callback_query.data || ''));
        } else {
          Logger.log('doPost: request received');
        }
      }
    } catch (logErr) {}
    try {
      if (shouldLogToSheets_() && typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        var logType = update.callback_query ? 'callback' : (update.message ? 'message' : 'other');
        var logData = update.callback_query ? (update.callback_query.data || '') : (update.message && update.message.text ? update.message.text : '');
        var updId = (update.update_id != null) ? String(update.update_id) : '';
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Main.doPost', 'update_id=' + updId + ' type=' + logType + ' data=' + logData);
      }
    } catch (xlog) {}
    try {
      if (typeof CONSTANTS !== 'undefined' && CONSTANTS.CONFIG && CONSTANTS.CONFIG.DEBUG) {
        Logger.log('=== NEW UPDATE ===');
        Logger.log(JSON.stringify(update, null, 2));
      }
    } catch (x) {}

    if (typeof route === 'function') {
      route(update);
    } else {
      try { Logger.log('doPost: route is not a function'); } catch (x) {}
    }
    return getOkResponse_();
  } catch (error) {
    try {
      Logger.log('=== CRITICAL ERROR in doPost ===');
      Logger.log('Error: ' + (error && error.message ? error.message : String(error)));
      if (error && error.stack) Logger.log('Stack: ' + error.stack);
    } catch (logErr) {}
    return getOkResponse_();
  }
}

function getOkResponse_() {
  if (_okResponse) return _okResponse;
  _okResponse = ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
  return _okResponse;
}

/**
 * Увімкнути логування у таблицю Logs (Script Properties LOG_TO_SHEETS=1).
 * Run → enableSheetLogs
 */
function enableSheetLogs() {
  try {
    PropertiesService.getScriptProperties().setProperty('LOG_TO_SHEETS', '1');
    Logger.log('✅ LOG_TO_SHEETS=1 (sheet logging enabled)');
  } catch (e) {
    Logger.log('❌ enableSheetLogs error: ' + (e && e.message));
  }
}

/**
 * Вимкнути логування у таблицю Logs (Script Properties LOG_TO_SHEETS=0).
 * Run → disableSheetLogs
 */
function disableSheetLogs() {
  try {
    PropertiesService.getScriptProperties().setProperty('LOG_TO_SHEETS', '0');
    Logger.log('✅ LOG_TO_SHEETS=0 (sheet logging disabled)');
  } catch (e) {
    Logger.log('❌ disableSheetLogs error: ' + (e && e.message));
  }
}

/**
 * Перевірка доступу до таблиці Logs (запис тестового рядка).
 * Run → testLogsWrite
 */
function testLogsWrite() {
  try {
    if (typeof Sheets === 'undefined' || typeof Sheets.insertLog !== 'function') {
      Logger.log('❌ testLogsWrite: Sheets.insertLog not available');
      return;
    }
    if (typeof CONSTANTS === 'undefined' || !CONSTANTS.LOG_LEVELS) {
      Logger.log('❌ testLogsWrite: CONSTANTS.LOG_LEVELS not available');
      return;
    }
    var ok = Sheets.insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.INFO, 'Main.testLogsWrite', 'Test log record');
    Logger.log(ok ? '✅ testLogsWrite: OK (row added)' : '❌ testLogsWrite: FAILED (row not added)');
  } catch (e) {
    Logger.log('❌ testLogsWrite error: ' + (e && e.message));
  }
}

/**
 * Показати назви листів у таблиці (для перевірки наявності Logs).
 * Run → listSheetNames
 */
function listSheetNames() {
  try {
    var ssId = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CONFIG) ? CONSTANTS.CONFIG.SPREADSHEET_ID : null;
    if (!ssId) {
      Logger.log('❌ listSheetNames: SPREADSHEET_ID not found');
      return;
    }
    var ss = SpreadsheetApp.openById(ssId);
    var sheets = ss.getSheets();
    Logger.log('=== SHEET NAMES ===');
    for (var i = 0; i < sheets.length; i++) {
      Logger.log('  - ' + sheets[i].getName());
    }
  } catch (e) {
    Logger.log('❌ listSheetNames error: ' + (e && e.message));
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - SETUP
// ═══════════════════════════════════════════════════════════

/**
 * Зареєструвати webhook
 *
 * ВИКОРИСТАННЯ:
 * 1. Опублікувати скрипт як Web App
 * 2. Скопіювати URL
 * 3. Викликати цю функцію вручну (Run → setWebhook)
 * 4. Перевірити логи
 *
 * @returns {Object} - Результат реєстрації
 */
function setWebhook() {
  try {
    var webAppUrl = getWebAppUrl_();
    var resolvedUrl = resolveWebhookUrl_(webAppUrl);
    var targetUrl = resolvedUrl || webAppUrl;

    if (!targetUrl) {
      Logger.log('❌ Error: Web App URL not found');
      Logger.log('Please deploy the script as Web App first!');
      return {
        success: false,
        error: 'Web App URL not found'
      };
    }

    var url = TELEGRAM_API_URL + 'setWebhook';

    // КРИТИЧНО: callback_query обов'язковий — без нього бот не реагує на натискання inline-кнопок (реєстрація, меню).
    var payload = {
      url: targetUrl,
      allowed_updates: ['message', 'callback_query']
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    Logger.log('=== WEBHOOK SETUP ===');
    Logger.log('Web App URL: ' + webAppUrl);
    if (resolvedUrl && resolvedUrl !== webAppUrl) {
      Logger.log('Resolved URL (no redirect): ' + resolvedUrl);
    }
    Logger.log('Response: ' + JSON.stringify(result, null, 2));

    if (result.ok) {
      Logger.log('✅ Webhook set successfully!');
    } else {
      Logger.log('❌ Webhook setup failed: ' + (result.description || ''));
    }

    return result;

  } catch (error) {
    Logger.log('❌ setWebhook error: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Зареєструвати webhook через PROXY (Cloudflare Worker / Vercel).
 *
 * ВИКОРИСТАННЯ:
 * 1. Розгорнути proxy і отримати URL.
 * 2. Записати URL у Script Properties: PROXY_URL
 * 3. Run → setWebhookViaProxy
 *
 * @returns {Object} - Результат реєстрації
 */
function setWebhookViaProxy() {
  try {
    var proxyUrl = null;
    try { proxyUrl = PropertiesService.getScriptProperties().getProperty('PROXY_URL'); } catch (e) {}
    if (!proxyUrl || String(proxyUrl).trim().indexOf('http') !== 0) {
      Logger.log('❌ Error: PROXY_URL not found in Script Properties');
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Main.setWebhookViaProxy', 'PROXY_URL not found');
        }
      } catch (elog0) {}
      return { success: false, error: 'PROXY_URL not found' };
    }

    var url = TELEGRAM_API_URL + 'setWebhook';
    var payload = {
      url: String(proxyUrl).trim(),
      allowed_updates: ['message', 'callback_query']
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    Logger.log('=== WEBHOOK SETUP (PROXY) ===');
    Logger.log('Proxy URL: ' + proxyUrl);
    Logger.log('Response: ' + JSON.stringify(result, null, 2));

    if (result.ok) {
      Logger.log('✅ Webhook set successfully via proxy!');
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Main.setWebhookViaProxy', 'ok=true');
        }
      } catch (elog1) {}
    } else {
      Logger.log('❌ Webhook setup failed: ' + (result.description || ''));
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Main.setWebhookViaProxy', 'ok=false ' + (result.description || ''));
        }
      } catch (elog2) {}
    }

    return result;
  } catch (error) {
    Logger.log('❌ setWebhookViaProxy error: ' + error.message);
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Main.setWebhookViaProxy', 'exception ' + (error && error.message ? error.message : error));
      }
    } catch (elog3) {}
    return { success: false, error: error.message };
  }
}

/**
 * Видалити webhook
 *
 * ВИКОРИСТАННЯ: Для дебагу або переналаштування
 *
 * @returns {Object} - Результат видалення
 */
function deleteWebhook() {
  try {
    var url = TELEGRAM_API_URL + 'deleteWebhook';

    var options = {
      method: 'post',
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    Logger.log('=== WEBHOOK DELETED ===');
    Logger.log('Response: ' + JSON.stringify(result, null, 2));

    if (result.ok) {
      Logger.log('✅ Webhook deleted successfully!');
    } else {
      Logger.log('❌ Delete failed: ' + (result.description || ''));
    }

    return result;

  } catch (error) {
    Logger.log('❌ deleteWebhook error: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Отримати інформацію про webhook
 *
 * ВИКОРИСТАННЯ: Для перевірки налаштувань
 *
 * @returns {Object} - Інформація про webhook
 */
function getWebhookInfo() {
  try {
    var url = TELEGRAM_API_URL + 'getWebhookInfo';

    var response = UrlFetchApp.fetch(url);
    var result = JSON.parse(response.getContentText());

    Logger.log('=== WEBHOOK INFO ===');
    Logger.log(JSON.stringify(result, null, 2));

    if (result.ok && result.result) {
      var info = result.result;
      Logger.log('URL: ' + (info.url || '(not set)'));
      Logger.log('Pending updates: ' + (info.pending_update_count || 0));
      Logger.log('allowed_updates: ' + (info.allowed_updates ? info.allowed_updates.join(', ') : '(всі за замовч.)'));
      if (info.last_error_message) {
        Logger.log('⚠️ Last error: ' + info.last_error_message);
      }
    }

    return result;

  } catch (error) {
    Logger.log('❌ getWebhookInfo error: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ЧАСТИНА 1: Чи доходить callback_query до скрипта (webhook, allowed_updates).
 * Run → checkCallbackQueryReachability. Переглянь журнал: усі пункти мають бути OK.
 */
function checkCallbackQueryReachability() {
  Logger.log('');
  Logger.log('══════ ЧАСТИНА 1: callback_query доходить до скрипта? ══════');
  Logger.log('');

  var result = getWebhookInfo();
  if (!result || !result.ok || !result.result) {
    Logger.log('❌ 1. Webhook: не вдалося отримати getWebhookInfo. Перевір BOT_TOKEN у Script Properties.');
    Logger.log('');
    return;
  }

  var info = result.result;
  var url = info.url || '';
  var allowed = info.allowed_updates || [];
  var hasCallback = allowed.indexOf('callback_query') !== -1;
  var lastErr = info.last_error_message || '';

  if (url && url.indexOf('http') === 0) {
    Logger.log('✅ 1. Webhook URL встановлено: ' + url);
  } else {
    Logger.log('❌ 1. Webhook URL не встановлено. Run → setWebhook (після деплою Web App і, за потреби, WEB_APP_URL у Script Properties).');
  }

  if (hasCallback) {
    Logger.log('✅ 2. allowed_updates містить callback_query — Telegram надсилатиме натискання кнопок.');
  } else {
    Logger.log('❌ 2. allowed_updates НЕ містить callback_query. Run → setWebhook (у коді вже є allowed_updates: [message, callback_query]).');
    if (allowed.length > 0) {
      Logger.log('   Зараз: ' + allowed.join(', '));
    }
  }

  if (!lastErr) {
    Logger.log('✅ 3. Остання помилка доставки: немає (норма).');
  } else {
    Logger.log('❌ 3. Остання помилка доставки: ' + lastErr);
    Logger.log('   Якщо є — Telegram не зміг доставити update на URL. Перевір URL, SSL, доступність.');
    if (lastErr.indexOf('302') !== -1) {
      Logger.log('');
      Logger.log('   ⚠️ 302 Moved Temporarily: Telegram НЕ слідує за редіректами. Webhook має одразу повертати 200 з того самого URL.');
      Logger.log('   РІШЕННЯ: 1) Деплой → Керування розгортаннями → скопіюй URL розгортання (закінчується на /exec, НЕ /dev).');
      Logger.log('   2) Script Properties → WEB_APP_URL = цей URL. 3) Run → setWebhook(). Не використовуй посилання з редактора (dev).');
    }
  }

  Logger.log('');
  Logger.log('Як перевірити, що callback реально прийшов: натисни кнопку в боті → Executions → останній виклик doPost. У логах має з\'явитися рядок "doPost: callback_query received, data=...".');
  Logger.log('');
}

/**
 * ЧАСТИНА 2: Чи Router викликає Registration.handleCallback.
 * Run → checkRouterCallsRegistration. Потім натисни кнопку в боті і переглянь логи останнього doPost.
 */
function checkRouterCallsRegistration() {
  Logger.log('');
  Logger.log('══════ ЧАСТИНА 2: Router викликає Registration.handleCallback? ══════');
  Logger.log('');
  Logger.log('Перевірка динамічна: натисни в боті кнопку "Нова реєстрація" або "У мене є код", потім відкрий Executions → останній doPost → Логи.');
  Logger.log('');
  Logger.log('Що шукати в логах (по порядку):');
  Logger.log('  1. "doPost: callback_query received, data=REG_NEW" (або REG_INVITE) — callback дійшов до скрипта (частина 1 ОК).');
  Logger.log('  2. "Router: calling Registration.handleCallback, action=REG_NEW" — Router передав керування в Registration.');
  Logger.log('  3. "Registration.handleCallback: action=REG_NEW chatId=..." — обробник реєстрації викликано.');
  Logger.log('');
  Logger.log('Діагностика:');
  Logger.log('  • Є (1), немає (2) — проблема в Router: extractMessage (chatId?), парсинг action, або умова action.indexOf(\'REG_\') не спрацювала.');
  Logger.log('  • Є (1) і (2), немає (3) — Registration.handleCallback не викликався або впав до логу (перевір помилки вище в логах).');
  Logger.log('  • Є (1),(2),(3), але бот не показує наступний крок — проблема після handleCallback: askRole_/sendKeyboard або Telegram API.');
  Logger.log('');
  Logger.log('Статична перевірка: Registration.handleCallback існує? ' + (typeof Registration !== 'undefined' && typeof Registration.handleCallback === 'function' ? '✅ Так' : '❌ Ні'));
  Logger.log('');
}

/**
 * Діагностика 302: перевірити HTTP-відповідь на GET/POST до Web App URL.
 * Run → testWebhookHttpResponse. У логах буде код відповіді та заголовки.
 */
function testWebhookHttpResponse() {
  var url = getWebAppUrl_();
  if (!url) {
    Logger.log('❌ testWebhookHttpResponse: WEB_APP_URL не задано.');
    return;
  }

  Logger.log('=== TEST WEBHOOK HTTP RESPONSE ===');
  Logger.log('URL: ' + url);

  // GET
  try {
    var getRes = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true
    });
    Logger.log('GET status: ' + getRes.getResponseCode());
    var getHeaders = getRes.getAllHeaders();
    if (getHeaders && getHeaders.Location) {
      Logger.log('GET Location: ' + getHeaders.Location);
    }
  } catch (e) {
    Logger.log('GET error: ' + (e && e.message));
  }

  // POST (імітація Telegram webhook)
  try {
    var fakeUpdate = { update_id: 1, message: { message_id: 1, chat: { id: 1, type: 'private' }, text: '/start' } };
    var postRes = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(fakeUpdate),
      followRedirects: false,
      muteHttpExceptions: true
    });
    Logger.log('POST status: ' + postRes.getResponseCode());
    var postHeaders = postRes.getAllHeaders();
    if (postHeaders && postHeaders.Location) {
      Logger.log('POST Location: ' + postHeaders.Location);
    }
  } catch (e2) {
    Logger.log('POST error: ' + (e2 && e2.message));
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Отримати URL Web App для webhook.
 * Пріоритет: Script Properties WEB_APP_URL → getUrl() (контекст виконання).
 * Читаємо WEB_APP_URL безпосередньо з Script Properties, щоб при Run → setWebhook
 * не підставлявся getUrl() (= .../dev). Інакше кожен запуск setWebhook перезаписує webhook на /dev.
 * @private
 * @returns {string|null}
 */
function getWebAppUrl_() {
  var fromProps = null;
  try {
    fromProps = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  } catch (e) {}
  if (fromProps && String(fromProps).trim().indexOf('http') === 0) {
    return String(fromProps).trim();
  }
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    Logger.log('getWebAppUrl_ error: ' + err.message);
    return null;
  }
}

/**
 * Розв'язати редірект для Web App URL (302 → script.googleusercontent.com).
 * Telegram не слідує за редіректами, тому повертаємо фінальний URL без редіректу.
 * @private
 * @param {string} url
 * @returns {string|null}
 */
function resolveWebhookUrl_(url) {
  if (!url || String(url).trim() === '') return null;
  try {
    var res = UrlFetchApp.fetch(String(url), {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
      var headers = res.getAllHeaders();
      var loc = headers && headers.Location ? headers.Location : null;
      if (loc && String(loc).indexOf('http') === 0) {
        return String(loc);
      }
    }
  } catch (e) {
    Logger.log('resolveWebhookUrl_ error: ' + (e && e.message));
  }
  return null;
}

/**
 * Перевірка прапора LOG_TO_SHEETS (Script Properties).
 * @private
 */
function shouldLogToSheets_() {
  try {
    var val = PropertiesService.getScriptProperties().getProperty('LOG_TO_SHEETS');
    return String(val) === '1';
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// TEST HELPERS (для розробки)
// ═══════════════════════════════════════════════════════════

/**
 * Тестування doPost з фейковим update
 *
 * ВИКОРИСТАННЯ: Run → testDoPost
 */
function testDoPost() {
  var fakeUpdate = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: {
        id: 987654321,
        first_name: 'Test User'
      },
      chat: {
        id: 987654321,
        type: 'private'
      },
      date: Math.floor(new Date().getTime() / 1000),
      text: '/start'
    }
  };

  var fakeEvent = {
    postData: {
      contents: JSON.stringify(fakeUpdate)
    }
  };

  Logger.log('=== TEST doPost ===');

  try {
    var response = doPost(fakeEvent);
    Logger.log('✅ Test passed!');
    Logger.log('Response: ' + response.getContent());
  } catch (error) {
    Logger.log('❌ Test failed!');
    Logger.log('Error: ' + error.message);
  }
}

/**
 * Перевірка доступності всіх модулів
 *
 * ВИКОРИСТАННЯ: Run → checkModules
 */
function checkModules() {
  Logger.log('=== MODULE CHECK ===');

  var modules = [
    { name: 'Router', method: 'route' },
    { name: 'State', method: 'get' },
    { name: 'Helpers', method: 'safeSend' },
    { name: 'User', method: 'getByChatId' },
    { name: 'Menu', method: 'show' },
    { name: 'Registration', method: 'start' },
    { name: 'Profile', method: 'handleCallback' },
    { name: 'Training', method: 'startWorkout' },
    { name: 'Schedule', method: 'handleCallback' },
    { name: 'Calendar', method: 'createEvent' },
    { name: 'Sheets', method: 'getUserByChatId' }
  ];

  var allOk = true;
  var i;
  var mod;
  var fnExists;

  for (i = 0; i < modules.length; i++) {
    mod = modules[i];
    try {
      fnExists = typeof eval(mod.name + '.' + mod.method) === 'function';
      if (fnExists) {
        Logger.log('✅ ' + mod.name + '.' + mod.method + '()');
      } else {
        Logger.log('❌ ' + mod.name + '.' + mod.method + '() - NOT FOUND');
        allOk = false;
      }
    } catch (error) {
      Logger.log('❌ ' + mod.name + ' - ERROR: ' + error.message);
      allOk = false;
    }
  }

  if (allOk) {
    Logger.log('\n✅ All modules OK!');
  } else {
    Logger.log('\n❌ Some modules missing!');
  }
}

/**
 * Видалити всі тригери processWebhookQueue_ (залишки від попередньої версії).
 * Запусти один раз у GAS (Run → deleteWebhookQueueTriggers), якщо бот що-хвилини надсилав повідомлення.
 */
function deleteWebhookQueueTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWebhookQueue_') {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  Logger.log('Видалено тригерів processWebhookQueue_: ' + deleted);
  return deleted;
}

/**
 * Видалити ВСІ тригери по часу (CLOCK). Джерело повторних привітань кожні 5 хв — зазвичай саме вони.
 * Run → deleteAllTimeTriggers, переглянь журнал, потім перезапусти бота.
 */
function deleteAllTimeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    try {
      if (t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
        var handler = t.getHandlerFunction();
        ScriptApp.deleteTrigger(t);
        deleted++;
        Logger.log('Видалено тригер по часу: ' + handler);
      }
    } catch (e) {
      Logger.log('Помилка при видаленні тригера: ' + (e && e.message));
    }
  }
  Logger.log('=== Всього видалено тригерів по часу: ' + deleted + ' ===');
  return deleted;
}

/**
 * Показати всі тригери проєкту (для діагностики "повідомлення кожну хвилину").
 * Run → listAllTriggers, переглянь журнал. Якщо є тригер по часу (кожну хв) — видали його вручну або через deleteWebhookQueueTriggers.
 */
function listAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('=== ВСІ ТРИГЕРИ ПРОЄКТУ: ' + triggers.length + ' ===');
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    var handler = t.getHandlerFunction();
    var type = '';
    try {
      if (t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
        type = 'Тригер по часу';
      } else if (t.getTriggerSource() === ScriptApp.TriggerSource.WEB_APP) {
        type = 'Web App';
      } else {
        type = 'Інше';
      }
    } catch (e) {
      type = '?';
    }
    Logger.log('  ' + (i + 1) + '. Handler: ' + handler + ' | ' + type);
  }
  if (triggers.length === 0) {
    Logger.log('  (немає тригерів)');
  }
  return triggers.length;
}

// Експорт для Audit та перевірок (GAS один глобальний namespace)
var Main = {
  doPost: doPost,
  setWebhook: setWebhook,
  setWebhookViaProxy: setWebhookViaProxy,
  deleteWebhook: deleteWebhook,
  getWebhookInfo: getWebhookInfo,
  checkCallbackQueryReachability: checkCallbackQueryReachability,
  checkRouterCallsRegistration: checkRouterCallsRegistration,
  testWebhookHttpResponse: testWebhookHttpResponse,
  testDoPost: testDoPost,
  checkModules: checkModules,
  enableSheetLogs: enableSheetLogs,
  disableSheetLogs: disableSheetLogs,
  testLogsWrite: testLogsWrite,
  listSheetNames: listSheetNames,
  deleteWebhookQueueTriggers: deleteWebhookQueueTriggers,
  deleteAllTimeTriggers: deleteAllTimeTriggers,
  listAllTriggers: listAllTriggers,
  keepWarm: keepWarm,
  installKeepWarmTrigger: installKeepWarmTrigger,
  removeKeepWarmTrigger: removeKeepWarmTrigger
};
