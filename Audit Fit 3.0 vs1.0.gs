/**
 * Audit.gs - Система самодіагностики
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Перевірка доступності модулів
 * - Валідація структури БД
 * - Виявлення конфліктів
 * - Генерація діагностичних звітів
 *
 * ВИКОРИСТАННЯ:
 * - Запуск вручну через Run (auditAll, auditQuick, auditFull)
 * - НЕ викликається з production коду
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ГОЛОВНІ ПЕРЕВІРКИ
// ═══════════════════════════════════════════════════════════

/**
 * Повна перевірка системи
 *
 * ВИКОРИСТАННЯ: Run → auditAll
 *
 * Перевіряє:
 * - Всі модулі та функції
 * - Константи
 * - Структуру БД
 * - Callback конфлікти
 */
function auditAll() {
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║           FIT 3.0 - СИСТЕМА САМОДІАГНОСТИКИ              ║');
  Logger.log('║                     ПОВНА ПЕРЕВІРКА                       ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');

  var allPassed = true;

  Logger.log('📦 ПЕРЕВІРКА МОДУЛІВ...');
  var modulesOk = checkAllModules();
  allPassed = allPassed && modulesOk;
  Logger.log('');

  Logger.log('🔧 ПЕРЕВІРКА КОНСТАНТ...');
  var constantsOk = checkConstants();
  allPassed = allPassed && constantsOk;
  Logger.log('');

  Logger.log('🗄️ ПЕРЕВІРКА СТРУКТУРИ БД...');
  var sheetsOk = checkSheets();
  allPassed = allPassed && sheetsOk;
  Logger.log('');

  Logger.log('🔘 ПЕРЕВІРКА CALLBACKS...');
  var callbacksOk = checkCallbacks();
  allPassed = allPassed && callbacksOk;
  Logger.log('');

  Logger.log('═══════════════════════════════════════════════════════════');
  if (allPassed) {
    Logger.log('✅ ВСІ ПЕРЕВІРКИ ПРОЙДЕНО УСПІШНО!');
  } else {
    Logger.log('❌ ВИЯВЛЕНО ПРОБЛЕМИ! Дивись деталі вище.');
  }
  Logger.log('═══════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════
// ПЕРЕВІРКА МОДУЛІВ
// ═══════════════════════════════════════════════════════════

/**
 * Перевірка доступності всіх модулів
 * @returns {boolean}
 */
function checkAllModules() {
  var modules = [
    { name: 'Main', methods: ['doPost', 'setWebhook'], fallbackGlobal: ['doPost', 'setWebhook'] },
    { name: 'Router', methods: ['route'], fallbackGlobal: ['route'] },
    { name: 'CONSTANTS', methods: [], fallbackGlobal: [] },
    { name: 'Registration', methods: ['start', 'handleCallback', 'handleTextMessage'], fallbackGlobal: [] },
    { name: 'Profile', methods: ['handleCallback', 'handleTextMessage'], fallbackGlobal: [] },
    { name: 'Training', methods: ['startWorkout', 'handleCallback', 'handleTextMessage'], fallbackGlobal: [] },
    { name: 'Schedule', methods: ['handleCallback', 'handleTextMessage', 'closeActiveBooking'], fallbackGlobal: [] },
    { name: 'Menu', methods: ['show', 'buildInlineKeyboard', 'formatProfileMessage'], fallbackGlobal: [] },
    { name: 'User', methods: ['getByChatId', 'createUser', 'updateField', 'activateInvite'], fallbackGlobal: [] },
    { name: 'Sheets', methods: ['getUserByChatId', 'insertUser', 'getAllExercises'], fallbackGlobal: [] },
    { name: 'State', methods: ['get', 'set', 'clear', 'update'], fallbackGlobal: [] },
    { name: 'Helpers', methods: ['safeSend', 'sendKeyboard', 'extractMessage', 'answerCallback'], fallbackGlobal: [] },
    { name: 'Calendar', methods: ['createEvent', 'updateEventStatus', 'deleteEvent', 'syncSlot'], fallbackGlobal: [] }
  ];

  var allOk = true;
  var checkedCount = 0;
  var failedCount = 0;
  var i;
  var j;
  var mod;
  var moduleExists;
  var methodExists;

  for (i = 0; i < modules.length; i++) {
    mod = modules[i];
    try {
      moduleExists = typeof eval(mod.name) !== 'undefined';

      if (!moduleExists && mod.fallbackGlobal && mod.fallbackGlobal.length > 0) {
        for (j = 0; j < mod.methods.length; j++) {
          checkedCount++;
          methodExists = typeof eval(mod.fallbackGlobal[j]) === 'function';
          if (methodExists) {
            Logger.log('  ✅ ' + mod.name + '.' + mod.methods[j] + '() (global)');
          } else {
            Logger.log('  ❌ ' + mod.name + '.' + mod.methods[j] + '() - NOT FOUND');
            allOk = false;
            failedCount++;
          }
        }
        continue;
      }

      if (!moduleExists) {
        Logger.log('  ❌ ' + mod.name + ' - MODULE NOT FOUND');
        allOk = false;
        failedCount++;
        continue;
      }

      for (j = 0; j < mod.methods.length; j++) {
        checkedCount++;
        try {
          methodExists = typeof eval(mod.name + '.' + mod.methods[j]) === 'function';
          if (methodExists) {
            Logger.log('  ✅ ' + mod.name + '.' + mod.methods[j] + '()');
          } else {
            Logger.log('  ❌ ' + mod.name + '.' + mod.methods[j] + '() - NOT FOUND');
            allOk = false;
            failedCount++;
          }
        } catch (err) {
          Logger.log('  ❌ ' + mod.name + '.' + mod.methods[j] + '() - ERROR: ' + err.message);
          allOk = false;
          failedCount++;
        }
      }
    } catch (err) {
      Logger.log('  ❌ ' + mod.name + ' - ERROR: ' + err.message);
      allOk = false;
      failedCount++;
    }
  }

  Logger.log('  📊 Перевірено: ' + checkedCount + ' функцій');
  Logger.log('  ' + (failedCount === 0 ? '✅' : '❌') + ' Помилок: ' + failedCount);

  return allOk;
}

// ═══════════════════════════════════════════════════════════
// ПЕРЕВІРКА КОНСТАНТ
// ═══════════════════════════════════════════════════════════

/**
 * Перевірка констант
 * @returns {boolean}
 */
function checkConstants() {
  var allOk = true;

  if (typeof CONSTANTS === 'undefined') {
    Logger.log('  ❌ CONSTANTS - NOT DEFINED');
    return false;
  }
  Logger.log('  ✅ CONSTANTS');

  var criticalKeys = ['CALLBACKS', 'FSM_STATES', 'ROLES', 'GENDERS', 'GOALS', 'SHEETS', 'COLUMNS', 'SCHEDULE_STATUS'];
  var k;
  for (k = 0; k < criticalKeys.length; k++) {
    try {
      if (CONSTANTS[criticalKeys[k]] !== undefined) {
        Logger.log('  ✅ CONSTANTS.' + criticalKeys[k]);
      } else {
        Logger.log('  ❌ CONSTANTS.' + criticalKeys[k] + ' - NOT DEFINED');
        allOk = false;
      }
    } catch (err) {
      Logger.log('  ❌ CONSTANTS.' + criticalKeys[k] + ' - ERROR: ' + err.message);
      allOk = false;
    }
  }

  if (typeof BOT_TOKEN !== 'undefined') {
    Logger.log('  ✅ BOT_TOKEN');
  } else {
    Logger.log('  ⚠️ BOT_TOKEN - not set (Script Properties?)');
  }
  if (typeof TELEGRAM_API_URL !== 'undefined') {
    Logger.log('  ✅ TELEGRAM_API_URL');
  } else {
    Logger.log('  ⚠️ TELEGRAM_API_URL - not set');
  }
  if (typeof SPREADSHEET_ID !== 'undefined') {
    Logger.log('  ✅ SPREADSHEET_ID');
  } else {
    Logger.log('  ⚠️ SPREADSHEET_ID - not set (Script Properties?)');
  }

  if (CONSTANTS.CALLBACKS && typeof CONSTANTS.CALLBACKS === 'object') {
    var callbackCount = 0;
    for (var key in CONSTANTS.CALLBACKS) {
      if (CONSTANTS.CALLBACKS.hasOwnProperty(key)) {
        callbackCount++;
      }
    }
    Logger.log('  📊 CALLBACKS визначено: ' + callbackCount);
  }
  if (CONSTANTS.FSM_STATES && typeof CONSTANTS.FSM_STATES === 'object') {
    var stateCount = 0;
    for (var sk in CONSTANTS.FSM_STATES) {
      if (CONSTANTS.FSM_STATES.hasOwnProperty(sk)) {
        stateCount++;
      }
    }
    Logger.log('  📊 FSM_STATES визначено: ' + stateCount);
  }

  return allOk;
}

// ═══════════════════════════════════════════════════════════
// ПЕРЕВІРКА БД
// ═══════════════════════════════════════════════════════════

/**
 * Перевірка структури БД
 * @returns {boolean}
 */
function checkSheets() {
  try {
    var spreadsheetId = typeof SPREADSHEET_ID !== 'undefined' ? SPREADSHEET_ID : (typeof CONSTANTS !== 'undefined' && CONSTANTS.CONFIG ? CONSTANTS.CONFIG.SPREADSHEET_ID : null);
    if (!spreadsheetId) {
      Logger.log('  ❌ SPREADSHEET_ID не знайдено (Script Properties або CONSTANTS.CONFIG)');
      return false;
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    if (!ss) {
      Logger.log('  ❌ Spreadsheet не знайдено!');
      return false;
    }

    Logger.log('  ✅ Spreadsheet підключено: ' + ss.getName());

    var expectedSheets = [
      { name: 'Users', columns: 20 },
      { name: 'ExerciseLibrary', columns: 12 },
      { name: 'BotTrainingData', columns: 8 },
      { name: 'MeasurementsHistory', columns: 8 },
      { name: 'WorkoutSchedule', columns: 8 },
      { name: 'CityList', columns: 2 },
      { name: 'TrainingPlans', columns: 7 },
      { name: 'Logs', columns: 4 }
    ];

    var allOk = true;
    var i;
    var expected;
    var sheet;
    var lastColumn;
    var headers;
    var hasHeaders;
    var h;

    for (i = 0; i < expectedSheets.length; i++) {
      expected = expectedSheets[i];
      sheet = ss.getSheetByName(expected.name);

      if (!sheet) {
        Logger.log('  ❌ Таблиця "' + expected.name + '" не знайдена');
        allOk = false;
        continue;
      }

      lastColumn = sheet.getLastColumn();
      if (lastColumn < expected.columns) {
        Logger.log('  ⚠️ ' + expected.name + ': очікується мін. ' + expected.columns + ' колонок, знайдено ' + lastColumn);
      } else {
        Logger.log('  ✅ ' + expected.name + ': ' + lastColumn + ' колонок');
      }

      headers = sheet.getRange(1, 1, 1, Math.min(expected.columns, lastColumn)).getValues()[0];
      hasHeaders = false;
      for (h = 0; h < headers.length; h++) {
        if (headers[h] && String(headers[h]).trim() !== '') {
          hasHeaders = true;
          break;
        }
      }
      if (hasHeaders) {
        Logger.log('     └─ Заголовки: ' + headers.slice(0, 3).join(', ') + '...');
      } else {
        Logger.log('     └─ ⚠️ Заголовки відсутні');
      }
    }

    return allOk;
  } catch (err) {
    Logger.log('  ❌ Помилка перевірки БД: ' + err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// ПЕРЕВІРКА CALLBACKS
// ═══════════════════════════════════════════════════════════

/**
 * Перевірка callback_data на конфлікти (дублікати значень)
 * @returns {boolean}
 */
function checkCallbacks() {
  if (typeof CONSTANTS === 'undefined' || !CONSTANTS.CALLBACKS) {
    Logger.log('  ⚠️ CONSTANTS.CALLBACKS не визначено');
    return false;
  }

  var callbackValues = [];
  var key;
  for (key in CONSTANTS.CALLBACKS) {
    if (CONSTANTS.CALLBACKS.hasOwnProperty(key)) {
      callbackValues.push(CONSTANTS.CALLBACKS[key]);
    }
  }

  var uniqueValues = {};
  var hasDuplicates = false;
  var v;
  for (v = 0; v < callbackValues.length; v++) {
    if (uniqueValues[callbackValues[v]]) {
      Logger.log('  ❌ Дублікат callback: "' + callbackValues[v] + '"');
      hasDuplicates = true;
    } else {
      uniqueValues[callbackValues[v]] = true;
    }
  }

  if (!hasDuplicates) {
    Logger.log('  ✅ Всі callbacks унікальні (' + callbackValues.length + ')');
  }

  Logger.log('  📋 Приклади callbacks:');
  var examples = [];
  var count = 0;
  for (key in CONSTANTS.CALLBACKS) {
    if (CONSTANTS.CALLBACKS.hasOwnProperty(key) && count < 5) {
      examples.push(key + ': "' + CONSTANTS.CALLBACKS[key] + '"');
      count++;
    }
  }
  Logger.log('     - ' + examples.join('\n     - '));

  return !hasDuplicates;
}

// ═══════════════════════════════════════════════════════════
// ДОДАТКОВІ ПЕРЕВІРКИ
// ═══════════════════════════════════════════════════════════

/**
 * Перевірка доступу до Telegram API
 * @returns {boolean}
 */
function checkTelegramAPI() {
  Logger.log('📡 ПЕРЕВІРКА TELEGRAM API...');

  try {
    var url = (typeof TELEGRAM_API_URL !== 'undefined' ? TELEGRAM_API_URL : '') + 'getMe';
    var response = UrlFetchApp.fetch(url);
    var result = JSON.parse(response.getContentText());

    if (result.ok) {
      var bot = result.result;
      Logger.log('  ✅ Бот підключено: @' + bot.username);
      Logger.log('     └─ ID: ' + bot.id);
      Logger.log('     └─ Ім\'я: ' + bot.first_name);
      return true;
    } else {
      Logger.log('  ❌ Помилка: ' + (result.description || ''));
      return false;
    }
  } catch (err) {
    Logger.log('  ❌ Помилка підключення: ' + err.message);
    return false;
  }
}

/**
 * Перевірка webhook
 * @returns {boolean}
 */
function checkWebhook() {
  Logger.log('🔗 ПЕРЕВІРКА WEBHOOK...');

  try {
    var url = (typeof TELEGRAM_API_URL !== 'undefined' ? TELEGRAM_API_URL : '') + 'getWebhookInfo';
    var response = UrlFetchApp.fetch(url);
    var result = JSON.parse(response.getContentText());

    if (result.ok) {
      var info = result.result;

      if (info.url) {
        Logger.log('  ✅ Webhook встановлено');
        Logger.log('     └─ URL: ' + info.url);
        Logger.log('     └─ Pending: ' + (info.pending_update_count || 0));

        if (info.last_error_message) {
          Logger.log('     └─ ⚠️ Остання помилка: ' + info.last_error_message);
        }
      } else {
        Logger.log('  ⚠️ Webhook не встановлено');
        Logger.log('     └─ Виконай: Run → setWebhook');
      }

      return true;
    } else {
      Logger.log('  ❌ Помилка: ' + (result.description || ''));
      return false;
    }
  } catch (err) {
    Logger.log('  ❌ Помилка: ' + err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// ШВИДКІ ПЕРЕВІРКИ
// ═══════════════════════════════════════════════════════════

/**
 * Швидка перевірка (тільки критичні модулі/функції)
 */
function auditQuick() {
  Logger.log('⚡ ШВИДКА ПЕРЕВІРКА...');
  Logger.log('');

  var critical = [
    'doPost',
    'route',
    'User.getByChatId',
    'Sheets.getUserByChatId',
    'get',
    'Helpers.safeSend'
  ];

  var allOk = true;
  var i;
  var path;
  var exists;

  for (i = 0; i < critical.length; i++) {
    path = critical[i];
    try {
      exists = typeof eval(path) === 'function';
      if (exists) {
        Logger.log('  ✅ ' + path + '()');
      } else {
        Logger.log('  ❌ ' + path + '() - NOT FOUND');
        allOk = false;
      }
    } catch (err) {
      Logger.log('  ❌ ' + path + '() - ERROR');
      allOk = false;
    }
  }

  Logger.log('');
  Logger.log(allOk ? '✅ Критичні модулі OK' : '❌ Є проблеми!');
}

/**
 * Повна діагностика (з перевіркою API та webhook)
 */
function auditFull() {
  auditAll();
  Logger.log('');
  checkTelegramAPI();
  Logger.log('');
  checkWebhook();
}
