/**
 * sheets.gs
 *
 * Абстракція доступу до Google Sheets для FIT 3.0
 *
 * ЄДИНА ВІДПОВІДАЛЬНІСТЬ:
 *  - Читання / запис у таблиці Google Sheets
 *  - Маппінг рядків в об'єкти та навпаки
 *  - Кешування гарячих даних (Users, ExerciseLibrary, CityList)
 *
 * ❌ НЕ МІСТИТЬ бізнес-логіки / FSM / Telegram API
 *
 * Версія: 1.0
 * Дата: 05.02.2026
 */

// ЗРУЧНІ АЛІАСИ (lazy init — порядок завантаження .gs файлів у GAS не гарантований)
var SHEETS_ID = null;
var SHEETS_NAMES = null;
var COLS = null;

/**
 * Ініціалізація аліасів з CONSTANTS при першому виклику (unique namespace).
 * @private
 */
function _ensureSheetsAliases() {
  if (SHEETS_ID === null && typeof CONSTANTS !== 'undefined') {
    SHEETS_ID = CONSTANTS.CONFIG.SPREADSHEET_ID;
    SHEETS_NAMES = CONSTANTS.SHEETS;
    COLS = CONSTANTS.COLUMNS;
  }
}

// ============================================================
// USERS TABLE
// ============================================================

/**
 * Знайти користувача по ChatID.
 * @param {string|number} chatId
 * @return {Object|null}
 */
function getUserByChatId(chatId) {
  try {
    _ensureSheetsAliases();
    chatId = String(chatId);

    var cache = CacheService.getScriptCache();
    var cacheKey = CONSTANTS.CACHE.PREFIX_USER + chatId;
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return null;
    }

    var data = sheet.getRange(3, 1, lastRow, 20).getValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.USERS.CHAT_ID]) === chatId) {
        var user = mapRowToUser_(row);
        cache.put(cacheKey, JSON.stringify(user), CONSTANTS.CACHE.TTL_USER);
        return user;
      }
    }

    return null;
  } catch (error) {
    Logger.log('ERROR in sheets.getUserByChatId: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getUserByChatId', error.message);
    return null;
  }
}

/**
 * Отримати користувачів за роллю.
 * @param {string} role
 * @return {Array<Object>}
 */
function getUsersByRole(role) {
  try {
    _ensureSheetsAliases();
    if (!role) {
      return [];
    }
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }
    var data = sheet.getRange(3, 1, lastRow, 20).getValues();
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.USERS.ROLE]) === String(role)) {
        result.push(mapRowToUser_(row));
      }
    }
    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getUsersByRole: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getUsersByRole', error.message);
    return [];
  }
}

/**
 * Вставити нового користувача.
 * @param {Object} userData
 * @return {boolean}
 */
function insertUser(userData) {
  try {
    _ensureSheetsAliases();
    if (!userData || !userData.chatId || !userData.firstName || !userData.role) {
      throw new Error('Missing required fields: chatId, firstName, role');
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var row = userToRow_(userData);
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    invalidateUserCache_(userData.chatId);
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.insertUser: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.insertUser', error.message);
    return false;
  }
}

/**
 * Оновити існуючого користувача.
 * @param {string|number} chatId
 * @param {Object} updates
 * @return {boolean}
 */
function updateUser(chatId, updates) {
  try {
    _ensureSheetsAliases();
    chatId = String(chatId);

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      throw new Error('Users table empty');
    }

    var colIndexChat = COLS.USERS.CHAT_ID + 1; // -> 1-based
    var range = sheet.getRange(3, colIndexChat, lastRow - 2, 1);
    var data = range.getValues();

    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === chatId) {
        rowIndex = i + 3;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('User not found: ' + chatId);
    }

    // Оновлюємо тільки відомі поля (мінімальний набір, без бізнес-логіки)
    if (updates.firstName !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.FIRST_NAME + 1).setValue(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.LAST_NAME + 1).setValue(updates.lastName);
    }
    if (updates.city !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.CITY + 1).setValue(updates.city);
    }
    if (updates.role !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.ROLE + 1).setValue(updates.role);
    }
    if (updates.gender !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.GENDER + 1).setValue(updates.gender);
    }
    if (updates.goal !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.GOAL + 1).setValue(updates.goal);
    }
    if (updates.coachId !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.COACH_ID + 1).setValue(updates.coachId);
    }
    if (updates.birthDate !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.BIRTH_DATE + 1).setValue(toDateForSheet_(updates.birthDate) || '');
    }
    if (updates.age !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.AGE + 1).setValue(updates.age === '' ? '' : updates.age);
    }
    if (updates.height !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.HEIGHT + 1).setValue(updates.height);
    }
    if (updates.weight !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.WEIGHT + 1).setValue(updates.weight);
    }
    if (updates.waist !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.WAIST + 1).setValue(updates.waist);
    }
    if (updates.hip !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.HIP + 1).setValue(updates.hip);
    }
    if (updates.glutes !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.GLUTES + 1).setValue(updates.glutes);
    }
    if (updates.arm !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.ARM + 1).setValue(updates.arm);
    }
    if (updates.instagram !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.INSTAGRAM + 1).setValue(updates.instagram);
    }
    if (updates.calendarId !== undefined) {
      sheet.getRange(rowIndex, COLS.USERS.CALENDAR_ID + 1).setValue(updates.calendarId);
    }

    SpreadsheetApp.flush();
    invalidateUserCache_(chatId);
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateUser: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateUser', error.message);
    return false;
  }
}

/**
 * Знайти користувача по інвайт-коду (UserID === inviteCode).
 * @param {string} inviteCode
 * @return {{rowIndex:number,userData:Object}|null}
 */
function findUserByInviteCode(inviteCode) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return null;
    }

    var colIndexUserId = COLS.USERS.USER_ID + 1;
    var range = sheet.getRange(3, colIndexUserId, lastRow - 2, 1);
    var data = range.getValues();

    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === inviteCode) {
        var rowIndex = i + 3;
        var fullRow = sheet.getRange(rowIndex, 1, rowIndex, 20).getValues()[0];
        return {
          rowIndex: rowIndex,
          userData: mapRowToUser_(fullRow)
        };
      }
    }

    return null;
  } catch (error) {
    Logger.log('ERROR in sheets.findUserByInviteCode: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.findUserByInviteCode', error.message);
    return null;
  }
}

/**
 * Замінити INVITE_ код на реальний ChatID.
 * @param {string} inviteCode
 * @param {number|string} realChatId
 * @return {boolean}
 */
function replaceInviteWithChatId(inviteCode, realChatId) {
  try {
    _ensureSheetsAliases();
    var result = findUserByInviteCode(inviteCode);
    if (!result) {
      throw new Error('Invite code not found: ' + inviteCode);
    }

    // Перевірка: код ще не активовано
    if (String(result.userData.chatId) !== String(inviteCode)) {
      throw new Error('Invite code already activated');
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var rowIndex = result.rowIndex;
    var chatIdStr = String(realChatId);

    sheet.getRange(rowIndex, COLS.USERS.CREATED_AT + 1).setValue(new Date());
    sheet.getRange(rowIndex, COLS.USERS.USER_ID + 1).setValue(chatIdStr);
    sheet.getRange(rowIndex, COLS.USERS.CHAT_ID + 1).setValue(chatIdStr);

    SpreadsheetApp.flush();
    invalidateUserCache_(chatIdStr);
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.replaceInviteWithChatId: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.replaceInviteWithChatId', error.message);
    return false;
  }
}

/**
 * Отримати всіх учнів конкретного тренера.
 * @param {string|number} coachChatId
 * @return {Array<Object>}
 */
function getStudentsByCoachId(coachChatId) {
  try {
    _ensureSheetsAliases();
    coachChatId = String(coachChatId);

    var cache = CacheService.getScriptCache();
    var cacheKey = (CONSTANTS && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_COACH_STUDENTS ? CONSTANTS.CACHE.PREFIX_COACH_STUDENTS : 'COACH_STUDENTS_') + coachChatId;
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.USERS);
    if (!sheet) {
      throw new Error('Users sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    // A3:T[lastRow]
    var data = sheet.getRange(3, 1, lastRow - 2, 20).getValues();
    var students = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var role = row[COLS.USERS.ROLE];
      var coachId = row[COLS.USERS.COACH_ID];
      if (role === CONSTANTS.ROLES.STUDENT &&
          String(coachId || '') === coachChatId) {
        students.push(mapRowToUser_(row));
      }
    }

    var ttl = (CONSTANTS && CONSTANTS.CACHE && CONSTANTS.CACHE.TTL_COACH_STUDENTS != null)
      ? CONSTANTS.CACHE.TTL_COACH_STUDENTS
      : 300;
    cache.put(cacheKey, JSON.stringify(students), ttl);

    return students;
  } catch (error) {
    Logger.log('ERROR in sheets.getStudentsByCoachId: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getStudentsByCoachId', error.message);
    return [];
  }
}

// ============================================================
// EXERCISE LIBRARY TABLE
// ============================================================

/**
 * Отримати всі активні вправи.
 * @return {Array<Object>}
 */
function getAllExercises() {
  try {
    _ensureSheetsAliases();
    var cache = CacheService.getScriptCache();
    var cacheKey = CONSTANTS.CACHE.PREFIX_EXERCISES + 'ALL';
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.EXERCISE_LIBRARY);
    if (!sheet) {
      throw new Error('ExerciseLibrary sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    var rowCount = lastRow - 2;
    var data = sheet.getRange(3, 1, rowCount, 12).getValues();
    var result = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[COLS.EXERCISE_LIBRARY.ID]) {
        continue;
      }
      if (row[COLS.EXERCISE_LIBRARY.ACTIVE] !== CONSTANTS.ACTIVE_STATUS.YES) {
        continue;
      }
      result.push(mapRowToExercise_(row));
    }

    cache.put(cacheKey, JSON.stringify(result), CONSTANTS.CACHE.TTL_EXERCISES);
    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getAllExercises: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getAllExercises', error.message);
    return [];
  }
}

/**
 * Отримати вправи по групі м'язів.
 * @param {string} groupName
 * @return {Array<Object>}
 */
function getExercisesByGroup(groupName) {
  try {
    groupName = String(groupName || '');
    var all = getAllExercises();
    if (!groupName) {
      return all;
    }
    var lower = groupName.toLowerCase();
    return all.filter(function (ex) {
      return String(ex.groupName || '').toLowerCase() === lower;
    });
  } catch (error) {
    Logger.log('ERROR in sheets.getExercisesByGroup: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getExercisesByGroup', error.message);
    return [];
  }
}

/**
 * Отримати вправу по ID.
 * @param {number|string} exerciseId
 * @return {Object|null}
 */
function getExerciseById(exerciseId) {
  try {
    var idStr = String(exerciseId);
    var all = getAllExercises();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === idStr) {
        return all[i];
      }
    }
    return null;
  } catch (error) {
    Logger.log('ERROR in sheets.getExerciseById: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getExerciseById', error.message);
    return null;
  }
}

// ============================================================
// BOT TRAINING DATA TABLE
// ============================================================

/**
 * Записати тренування в БД.
 * @param {Object} trainingData
 * @return {boolean}
 */
function insertTraining(trainingData) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.BOT_TRAINING_DATA);
    if (!sheet) {
      throw new Error('BotTrainingData sheet not found');
    }

    var row = trainingToRow_(trainingData);
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.insertTraining: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.insertTraining', error.message);
    return false;
  }
}

/**
 * Отримати історію тренувань користувача.
 * @param {string|number} chatId
 * @param {Object} filters (опційно)
 * @return {Array<Object>}
 */
function getTrainingHistory(chatId, filters) {
  try {
    _ensureSheetsAliases();
    chatId = String(chatId);
    filters = filters || {};

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.BOT_TRAINING_DATA);
    if (!sheet) {
      throw new Error('BotTrainingData sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    var rowCount = lastRow - 2;

    var data = sheet.getRange(3, 1, rowCount, 8).getValues();
    var result = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.BOT_TRAINING_DATA.CHAT_ID] || '') !== chatId) {
        continue;
      }
      var obj = mapRowToTraining_(row);
      result.push(obj);
    }

    // Проста фільтрація по даті, якщо потрібно
    if (filters.fromDate || filters.toDate) {
      var from = filters.fromDate ? new Date(filters.fromDate) : null;
      var to = filters.toDate ? new Date(filters.toDate) : null;
      result = result.filter(function (item) {
        var d = item.date instanceof Date ? item.date : new Date(item.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }

    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getTrainingHistory: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getTrainingHistory', error.message);
    return [];
  }
}

/**
 * Отримати останнє тренування користувача.
 * @param {string|number} chatId
 * @return {Object|null}
 */
function getLastTraining(chatId) {
  var history = getTrainingHistory(chatId);
  if (!history.length) {
    return null;
  }
  history.sort(function (a, b) {
    return (b.date instanceof Date ? b.date : new Date(b.date)) -
           (a.date instanceof Date ? a.date : new Date(a.date));
  });
  return history[0];
}

// ============================================================
// MEASUREMENTS HISTORY TABLE
// ============================================================

/**
 * Записати замір в БД.
 * @param {Object} measurementData
 * @return {boolean}
 */
function insertMeasurement(measurementData) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.MEASUREMENTS_HISTORY);
    if (!sheet) {
      throw new Error('MeasurementsHistory sheet not found');
    }

    var row = measurementToRow_(measurementData);
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.insertMeasurement: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.insertMeasurement', error.message);
    return false;
  }
}

/**
 * Отримати історію замірів користувача.
 * @param {string|number} chatId
 * @return {Array<Object>}
 */
function getMeasurementHistory(chatId) {
  try {
    _ensureSheetsAliases();
    chatId = String(chatId);

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.MEASUREMENTS_HISTORY);
    if (!sheet) {
      throw new Error('MeasurementsHistory sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    var rowCount = lastRow - 2;
    var data = sheet.getRange(3, 1, rowCount, 9).getValues();
    var result = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.MEASUREMENTS_HISTORY.CHAT_ID] || '') !== chatId) {
        continue;
      }
      result.push(mapRowToMeasurement_(row));
    }

    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getMeasurementHistory: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getMeasurementHistory', error.message);
    return [];
  }
}

/**
 * Отримати останній замір користувача.
 * @param {string|number} chatId
 * @return {Object|null}
 */
function getLastMeasurement(chatId) {
  var history = getMeasurementHistory(chatId);
  if (!history.length) {
    return null;
  }
  history.sort(function (a, b) {
    var da = a.date instanceof Date ? a.date : new Date(a.date);
    var db = b.date instanceof Date ? b.date : new Date(b.date);
    return db - da;
  });
  return history[0];
}

// ============================================================
// WORKOUT SCHEDULE TABLE
// ============================================================

/**
 * Вставити новий слот розкладу.
 * @param {Object} slotData - id опційно (згенерується якщо немає)
 * @return {string|boolean} - id створеного слоту або false при помилці
 */
function insertScheduleSlot(slotData) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var data = slotData || {};
    if (!data.id) {
      data.id = Utilities.getUuid();
    }
    var row = slotToRow_(data);
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return data.id;
  } catch (error) {
    Logger.log('ERROR in sheets.insertScheduleSlot: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.insertScheduleSlot', error.message);
    return false;
  }
}

/**
 * Знайти слот за тренером, учнем та датою/часом (для прив'язки логованої тренування до розкладу).
 * @param {string} coachChatId
 * @param {string} studentChatId
 * @param {Date} dateTime - дата/час старту тренування
 * @return {Object|null} - слот або null
 */
function findSlotByCoachStudentAndDateTime(coachChatId, studentChatId, dateTime) {
  try {
    _ensureSheetsAliases();
    coachChatId = String(coachChatId);
    studentChatId = String(studentChatId);
    if (!dateTime || !(dateTime instanceof Date)) {
      return null;
    }
    var timeStr = _formatTimeHHMM_(dateTime);
    var slots = getSlotsByCoachAndStatus(coachChatId, null);
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (String(slot.studentId || '') !== studentChatId) {
        continue;
      }
      var slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
      if (slotDate.getFullYear() !== dateTime.getFullYear() ||
          slotDate.getMonth() !== dateTime.getMonth() ||
          slotDate.getDate() !== dateTime.getDate()) {
        continue;
      }
      var slotTime = (slot.time || '').toString().replace(/\s/g, '');
      if (slotTime === timeStr) {
        return slot;
      }
    }
    return null;
  } catch (error) {
    Logger.log('ERROR in sheets.findSlotByCoachStudentAndDateTime: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.findSlotByCoachStudentAndDateTime', error.message);
    return null;
  }
}

function _formatTimeHHMM_(date) {
  var d = date instanceof Date ? date : new Date();
  var h = d.getHours();
  var m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/**
 * Оновити статус слоту за його ID (колонка A).
 * @param {string} id
 * @param {string} newStatus
 * @return {boolean}
 */
function updateScheduleSlotStatus(id, newStatus) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }

    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow - 2, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(id)) {
        rowIndex = i + 3;
        break;
      }
    }
    if (rowIndex === -1) {
      return false;
    }

    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.STATUS + 1).setValue(newStatus);
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.UPDATED_AT + 1).setValue(new Date());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotStatus: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotStatus', error.message);
    return false;
  }
}

/**
 * Встановити вартість (та валюту) для слоту (заповнюється при COMPLETED).
 * @param {string} slotId
 * @param {number} priceCharged - сума з одного учня
 * @param {string} currency
 * @return {boolean}
 */
function updateScheduleSlotPrice(slotId, priceCharged, currency) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }
    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(slotId)) {
        rowIndex = i + 3;
        break;
      }
    }
    if (rowIndex === -1) {
      return false;
    }
    var colPrice = COLS.WORKOUT_SCHEDULE.PRICE_CHARGED + 1;
    var colCurr = COLS.WORKOUT_SCHEDULE.CURRENCY + 1;
    sheet.getRange(rowIndex, colPrice).setValue(priceCharged != null ? priceCharged : '');
    sheet.getRange(rowIndex, colCurr).setValue((currency || '').toString());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotPrice: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotPrice', error.message);
    return false;
  }
}

/**
 * Записати тип тренування (PERSONAL/SPLIT/TRIO) у слот WorkoutSchedule (колонка K).
 * @param {string} slotId
 * @param {string} trainingType - CONSTANTS.TRAINING_TYPES.PERSONAL | SPLIT | TRIO
 * @return {boolean}
 */
function updateScheduleSlotTrainingType(slotId, trainingType) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID).getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) return false;
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return false;
    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(slotId)) { rowIndex = i + 3; break; }
    }
    if (rowIndex === -1) return false;
    var col = COLS.WORKOUT_SCHEDULE.TRAINING_TYPE + 1;
    sheet.getRange(rowIndex, col).setValue((trainingType || '').toString());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotTrainingType: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotTrainingType', error.message);
    return false;
  }
}

// ============================================================
// PRICING (тарифи тренера та індивідуальні ціни)
// ============================================================
function getCoachPricing(coachId) {
  return getPricingRow_(String(coachId), '');
}
function getStudentPricing(coachId, studentId) {
  return getPricingRow_(String(coachId), String(studentId));
}

/**
 * Поточна ціна за типом тренування (персональне/спліт/тріо).
 * Повертає ціну за повне заняття; викликач ділить на 1/2/3 для запису в WorkoutSchedule.PriceCharged (з одного учня).
 * @param {string|number} coachId
 * @param {string|number} studentId
 * @param {string} trainingType - CONSTANTS.TRAINING_TYPES.PERSONAL | SPLIT | TRIO
 * @return {{ price: number, currency: string }|null}
 */
function getCurrentPrice(coachId, studentId, trainingType) {
  _ensureSheetsAliases();
  coachId = String(coachId);
  studentId = String(studentId);
  var row = getStudentPricing(coachId, studentId);
  if (!row) row = getCoachPricing(coachId);
  if (!row) return null;
  var price = null;
  if (trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL) price = row.pricePersonal;
  else if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) price = row.priceSplit;
  else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) price = row.priceTrio;
  if (price === null || price === undefined || price === '') return null;
  var num = parseFloat(price);
  if (isNaN(num) || num < 0) return null;
  return { price: num, currency: (row.currency || (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString().trim() };
}
function setPricing(coachId, studentId, data) {
  try {
    _ensureSheetsAliases();
    coachId = String(coachId);
    studentId = studentId != null ? String(studentId) : '';
    var sheet = SpreadsheetApp.openById(SHEETS_ID).getSheetByName(SHEETS_NAMES.PRICING);
    if (!sheet) throw new Error('Pricing sheet not found');
    var lastRow = sheet.getLastRow();
    var numCols = COLS.PRICING.DEFAULT_TRAINING_TYPE + 1;
    var now = new Date();
    if (lastRow >= 3) {
      var rows = sheet.getRange(3, 1, lastRow, numCols).getValues();
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (String(r[COLS.PRICING.COACH_ID] || '') !== coachId) continue;
        if (String(r[COLS.PRICING.STUDENT_ID] || '').trim() !== studentId.trim()) continue;
        var rowIndex = i + 3;
        sheet.getRange(rowIndex, COLS.PRICING.PRICE_PERSONAL + 1).setValue(data.pricePersonal != null ? data.pricePersonal : '');
        sheet.getRange(rowIndex, COLS.PRICING.PRICE_SPLIT + 1).setValue(data.priceSplit != null ? data.priceSplit : '');
        sheet.getRange(rowIndex, COLS.PRICING.PRICE_TRIO + 1).setValue(data.priceTrio != null ? data.priceTrio : '');
        sheet.getRange(rowIndex, COLS.PRICING.CURRENCY + 1).setValue((data.currency || (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString());
        sheet.getRange(rowIndex, COLS.PRICING.UPDATED_AT + 1).setValue(now);
        sheet.getRange(rowIndex, COLS.PRICING.DEFAULT_TRAINING_TYPE + 1).setValue((data.defaultTrainingType || '').toString());
        SpreadsheetApp.flush();
        return true;
      }
    }
    sheet.appendRow([coachId, studentId, data.pricePersonal != null ? data.pricePersonal : '', data.priceSplit != null ? data.priceSplit : '', data.priceTrio != null ? data.priceTrio : '', (data.currency || (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString(), now, (data.defaultTrainingType || '').toString()]);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.setPricing: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.setPricing', error.message);
    return false;
  }
}
function getPricingRow_(coachId, studentId) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID).getSheetByName(SHEETS_NAMES.PRICING);
    if (!sheet) return null;
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return null;
    var numCols = COLS.PRICING.DEFAULT_TRAINING_TYPE + 1;
    var rows = sheet.getRange(3, 1, lastRow, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r[COLS.PRICING.COACH_ID] || '') !== coachId) continue;
      if ((r[COLS.PRICING.STUDENT_ID] || '').toString().trim() !== (studentId || '').toString().trim()) continue;
      var u = r[COLS.PRICING.UPDATED_AT];
      if (!(u instanceof Date)) u = u ? new Date(u) : new Date();
      var defType = (r[COLS.PRICING.DEFAULT_TRAINING_TYPE] || '').toString().trim();
      return { pricePersonal: r[COLS.PRICING.PRICE_PERSONAL], priceSplit: r[COLS.PRICING.PRICE_SPLIT], priceTrio: r[COLS.PRICING.PRICE_TRIO], currency: (r[COLS.PRICING.CURRENCY] || '').toString(), updatedAt: u, defaultTrainingType: defType };
    }
    return null;
  } catch (e) { Logger.log('getPricingRow_: ' + (e && e.message)); return null; }
}

/**
 * Встановити або очистити studentId у слоті.
 * @param {string} slotId
 * @param {string} studentChatId - порожній рядок для очищення
 * @return {boolean}
 */
function updateScheduleSlotStudentId(slotId, studentChatId) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }
    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(slotId)) {
        rowIndex = i + 3;
        break;
      }
    }
    if (rowIndex === -1) {
      return false;
    }
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.STUDENT_ID + 1).setValue(studentChatId || '');
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.UPDATED_AT + 1).setValue(new Date());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotStudentId: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotStudentId', error.message);
    return false;
  }
}

/**
 * Оновити дату та час слоту (для перенесення).
 * @param {string} slotId
 * @param {Date} date
 * @param {string} time - "HH:mm"
 * @return {boolean}
 */
function updateScheduleSlotDateTime(slotId, date, time) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }
    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(slotId)) {
        rowIndex = i + 3;
        break;
      }
    }
    if (rowIndex === -1) {
      return false;
    }
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.DATE + 1).setValue(toDateForSheet_(date) || new Date());
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.TIME + 1).setValue(time || '');
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.UPDATED_AT + 1).setValue(new Date());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotDateTime: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotDateTime', error.message);
    return false;
  }
}

/**
 * Встановити Calendar Event ID для слоту (після створення події в Google Calendar).
 * @param {string} slotId
 * @param {string} eventId - ID події з CalendarApp
 * @return {boolean}
 */
function updateScheduleSlotCalEventId(slotId, eventId) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }
    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(slotId)) {
        rowIndex = i + 3;
        break;
      }
    }
    if (rowIndex === -1) {
      return false;
    }
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.CAL_EVENT_ID + 1).setValue(eventId || '');
    sheet.getRange(rowIndex, COLS.WORKOUT_SCHEDULE.UPDATED_AT + 1).setValue(new Date());
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.updateScheduleSlotCalEventId: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.updateScheduleSlotCalEventId', error.message);
    return false;
  }
}

/**
 * Отримати слоти тренера за статусом.
 * @param {string|number} coachChatId
 * @param {string} status
 * @return {Array<Object>}
 */
function getSlotsByCoachAndStatus(coachChatId, status) {
  try {
    _ensureSheetsAliases();
    coachChatId = String(coachChatId);

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    var numCols = COLS.WORKOUT_SCHEDULE.TRAINING_TYPE + 1;
    var data = sheet.getRange(3, 1, lastRow, numCols).getValues();
    var result = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.WORKOUT_SCHEDULE.COACH_ID] || '') !== coachChatId) {
        continue;
      }
      if (status && row[COLS.WORKOUT_SCHEDULE.STATUS] !== status) {
        continue;
      }
      result.push(mapRowToSlot_(row));
    }

    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getSlotsByCoachAndStatus: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getSlotsByCoachAndStatus', error.message);
    return [];
  }
}

/**
 * Отримати один слот по ID (колонка A).
 * @param {string} slotId
 * @return {Object|null}
 */
function getSlotById(slotId) {
  try {
    _ensureSheetsAliases();
    slotId = String(slotId);
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return null;
    }
    var numCols = COLS.WORKOUT_SCHEDULE.TRAINING_TYPE + 1;
    var data = sheet.getRange(3, 1, lastRow, numCols).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.WORKOUT_SCHEDULE.ID] || '') === slotId) {
        return mapRowToSlot_(row);
      }
    }
    return null;
  } catch (error) {
    Logger.log('ERROR in sheets.getSlotById: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getSlotById', error.message);
    return null;
  }
}

/**
 * Отримати слоти учня за статусом.
 * @param {string|number} studentChatId
 * @param {string} status - опціонально (AVAILABLE, REQUESTED, BOOKED, COMPLETED, CANCELED)
 * @return {Array<Object>}
 */
function getSlotsByStudentAndStatus(studentChatId, status) {
  try {
    _ensureSheetsAliases();
    studentChatId = String(studentChatId);
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }
    var numCols = COLS.WORKOUT_SCHEDULE.TRAINING_TYPE + 1;
    var data = sheet.getRange(3, 1, lastRow, numCols).getValues();
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[COLS.WORKOUT_SCHEDULE.STUDENT_ID] || '') !== studentChatId) {
        continue;
      }
      if (status && row[COLS.WORKOUT_SCHEDULE.STATUS] !== status) {
        continue;
      }
      result.push(mapRowToSlot_(row));
    }
    return result;
  } catch (error) {
    Logger.log('ERROR in sheets.getSlotsByStudentAndStatus: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getSlotsByStudentAndStatus', error.message);
    return [];
  }
}

/**
 * Видалити слот по його ID (колонка A).
 * @param {string} id
 * @return {boolean}
 */
function deleteScheduleSlot(id) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.WORKOUT_SCHEDULE);
    if (!sheet) {
      throw new Error('WorkoutSchedule sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return false;
    }

    var data = sheet.getRange(3, COLS.WORKOUT_SCHEDULE.ID + 1, lastRow - 2, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === String(id)) {
        rowIndex = i + 3;
        break;
      }
    }

    if (rowIndex === -1) {
      return false;
    }

    sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    Logger.log('ERROR in sheets.deleteScheduleSlot: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.deleteScheduleSlot', error.message);
    return false;
  }
}

// ============================================================
// CITY LIST TABLE
// ============================================================

/**
 * Отримати всі міста.
 * @return {Array<string>}
 */
function getAllCities() {
  try {
    _ensureSheetsAliases();
    var cache = CacheService.getScriptCache();
    var cacheKey = CONSTANTS.CACHE.PREFIX_CITIES + 'ALL';
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.CITY_LIST);
    if (!sheet) {
      throw new Error('CityList sheet not found');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return [];
    }

    var rowCount = lastRow - 2;
    var data = sheet.getRange(3, 1, rowCount, 2).getValues();
    var cities = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[COLS.CITY_LIST.CITY_ID]) {
        continue;
      }
      cities.push(row[COLS.CITY_LIST.CITY_NAME] || '');
    }

    cache.put(cacheKey, JSON.stringify(cities), CONSTANTS.CACHE.TTL_CITIES);
    return cities;
  } catch (error) {
    Logger.log('ERROR in sheets.getAllCities: ' + error.message);
    insertLog(new Date().toISOString(), CONSTANTS.LOG_LEVELS.ERROR, 'sheets.getAllCities', error.message);
    return [];
  }
}

// ============================================================
// LOGS TABLE
// ============================================================

/**
 * Записати лог в БД Logs.
 * @param {string} timestamp ISO
 * @param {string} level     рівень (ERROR/WARN/INFO/DEBUG)
 * @param {string} module    модуль/функція
 * @param {string} message   повідомлення
 * @return {boolean}
 */
function insertLog(timestamp, level, module, message) {
  try {
    _ensureSheetsAliases();
    var sheet = SpreadsheetApp.openById(SHEETS_ID)
      .getSheetByName(SHEETS_NAMES.LOGS);
    if (!sheet) {
      // Якщо немає таблиці логів — не ламаємо виконання
      Logger.log('Logs sheet not found');
      return false;
    }

    var ts = timestamp ? new Date(timestamp) : new Date();
    var context = (level ? '[' + level + '] ' : '') + (module || '');
    var row = [
      ts,           // A: Timestamp
      context,      // B: Context
      message || '',// C: Message
      ''            // D: Stack (не використовується тут)
    ];

    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    // Не робимо вкладеного логування, щоб уникнути циклу
    Logger.log('ERROR in sheets.insertLog: ' + error.message);
    return false;
  }
}

// ============================================================
// ПРИВАТНІ HELPER-ФУНКЦІЇ
// ============================================================

/**
 * Маппінг рядка Users → об'єкт.
 * @param {Array} row
 * @return {Object}
 * @private
 */
function mapRowToUser_(row) {
  var createdAt = row[COLS.USERS.CREATED_AT];
  if (createdAt instanceof Date) {
    // ok
  } else if (typeof createdAt === 'string') {
    createdAt = new Date(createdAt);
  } else {
    createdAt = new Date();
  }

  return {
    createdAt: createdAt,
    userId: row[COLS.USERS.USER_ID] || '',
    chatId: String(row[COLS.USERS.CHAT_ID] || ''),
    firstName: row[COLS.USERS.FIRST_NAME] || '',
    lastName: row[COLS.USERS.LAST_NAME] || '',
    city: row[COLS.USERS.CITY] || '',
    role: row[COLS.USERS.ROLE] || '',
    gender: row[COLS.USERS.GENDER] || '',
    age: row[COLS.USERS.AGE] || null,
    goal: row[COLS.USERS.GOAL] || '',
    coachId: row[COLS.USERS.COACH_ID] ? String(row[COLS.USERS.COACH_ID]) : '',
    birthDate: row[COLS.USERS.BIRTH_DATE] || null,
    height: row[COLS.USERS.HEIGHT] || null,
    weight: row[COLS.USERS.WEIGHT] || null,
    waist: row[COLS.USERS.WAIST] || null,
    hip: row[COLS.USERS.HIP] || null,
    glutes: row[COLS.USERS.GLUTES] || null,
    arm: row[COLS.USERS.ARM] || null,
    instagram: row[COLS.USERS.INSTAGRAM] || '',
    calendarId: row[COLS.USERS.CALENDAR_ID] || ''
  };
}

/**
 * Нормалізація значення до Date для запису в таблицю (Структура: дати — Date Object).
 * @param {*} v
 * @return {Date|null}
 * @private
 */
function toDateForSheet_(v) {
  if (v instanceof Date) return v;
  if (v === null || v === undefined || v === '') return null;
  return new Date(v);
}

/**
 * Маппінг об'єкта Users → масив для appendRow.
 * @param {Object} userData
 * @return {Array}
 * @private
 */
function userToRow_(userData) {
  return [
    toDateForSheet_(userData.createdAt) || new Date(),  // A CreatedAt — Date
    userData.userId || '',                      // B
    userData.chatId || '',                      // C
    userData.firstName || '',                   // D
    userData.lastName || '',                    // E
    userData.city || '',                        // F
    userData.role || '',                        // G
    userData.gender || '',                      // H
    '',                                         // I Age — завжди "" при створенні (автообчислення)
    userData.goal || '',                        // J
    userData.coachId || '',                     // K
    toDateForSheet_(userData.birthDate) || null, // L BirthDate — Date
    userData.height || null,                    // M
    userData.weight || null,                    // N
    userData.waist || null,                     // O
    userData.hip || null,                       // P
    userData.glutes || null,                    // Q
    userData.arm || null,                       // R
    userData.instagram || '',                   // S
    userData.calendarId || ''                   // T
  ];
}

/**
 * Інвалідувати кеш користувача.
 * @param {string|number} chatId
 * @private
 */
function invalidateUserCache_(chatId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = CONSTANTS.CACHE.PREFIX_USER + String(chatId);
  cache.remove(cacheKey);
}

/**
 * Маппінг ExerciseLibrary рядка → об'єкт.
 * @param {Array} row
 * @return {Object}
 * @private
 */
function mapRowToExercise_(row) {
  return {
    id: row[COLS.EXERCISE_LIBRARY.ID],
    groupName: row[COLS.EXERCISE_LIBRARY.GROUP_NAME] || '',
    exerciseName: row[COLS.EXERCISE_LIBRARY.EXERCISE_NAME] || '',
    equipment: row[COLS.EXERCISE_LIBRARY.EQUIPMENT] || '',
    active: row[COLS.EXERCISE_LIBRARY.ACTIVE] || CONSTANTS.ACTIVE_STATUS.YES,
    comment: row[COLS.EXERCISE_LIBRARY.COMMENT] || '',
    focusPoint: row[COLS.EXERCISE_LIBRARY.FOCUS_POINT] || '',
    commonMistakes: row[COLS.EXERCISE_LIBRARY.COMMON_MISTAKES] || '',
    properFeeling: row[COLS.EXERCISE_LIBRARY.PROPER_FEELING] || '',
    staticHolds: row[COLS.EXERCISE_LIBRARY.STATIC_HOLDS] || '',
    youtubeLink: row[COLS.EXERCISE_LIBRARY.YOUTUBE_LINK] || '',
    myChannelLink: row[COLS.EXERCISE_LIBRARY.MY_CHANNEL_LINK] || ''
  };
}

/**
 * Маппінг BotTrainingData рядка → об'єкт.
 * @param {Array} row
 * @return {Object}
 * @private
 */
function mapRowToTraining_(row) {
  var d = row[COLS.BOT_TRAINING_DATA.DATE];
  if (!(d instanceof Date)) {
    d = d ? new Date(d) : new Date();
  }
  return {
    idRecords: row[COLS.BOT_TRAINING_DATA.ID_RECORDS],
    date: d,
    exerciseId: row[COLS.BOT_TRAINING_DATA.EXERCISE_ID],
    exercise: row[COLS.BOT_TRAINING_DATA.EXERCISE] || '',
    weight: row[COLS.BOT_TRAINING_DATA.WEIGHT] || null,
    reps: row[COLS.BOT_TRAINING_DATA.REPS] || null,
    set: row[COLS.BOT_TRAINING_DATA.SET] || null,
    chatId: String(row[COLS.BOT_TRAINING_DATA.CHAT_ID] || '')
  };
}

/**
 * Маппінг trainingData → рядок BotTrainingData.
 * @param {Object} data
 * @return {Array}
 * @private
 */
function trainingToRow_(data) {
  return [
    data.idRecords || '',                 // A
    toDateForSheet_(data.date) || new Date(),  // B Date
    data.exerciseId || '',                // C
    data.exercise || '',                  // D
    data.weight || null,                  // E
    data.reps || null,                    // F
    data.set || null,                     // G
    data.chatId || ''                     // H
  ];
}

/**
 * Маппінг MeasurementsHistory рядка → об'єкт.
 * @param {Array} row
 * @return {Object}
 * @private
 */
function mapRowToMeasurement_(row) {
  var d = row[COLS.MEASUREMENTS_HISTORY.DATE];
  if (!(d instanceof Date)) {
    d = d ? new Date(d) : new Date();
  }
  return {
    chatId: String(row[COLS.MEASUREMENTS_HISTORY.CHAT_ID] || ''),
    date: d,
    height: row[COLS.MEASUREMENTS_HISTORY.HEIGHT] || null,
    weight: row[COLS.MEASUREMENTS_HISTORY.WEIGHT] || null,
    waist: row[COLS.MEASUREMENTS_HISTORY.WAIST] || null,
    hip: row[COLS.MEASUREMENTS_HISTORY.HIP] || null,
    glutes: row[COLS.MEASUREMENTS_HISTORY.GLUTES] || null,
    arm: row[COLS.MEASUREMENTS_HISTORY.ARM] || null,
    source: row[COLS.MEASUREMENTS_HISTORY.SOURCE] || ''
  };
}

/**
 * Маппінг measurementData → рядок MeasurementsHistory.
 * @param {Object} data
 * @return {Array}
 * @private
 */
function measurementToRow_(data) {
  return [
    data.chatId || '',             // A
    toDateForSheet_(data.date) || new Date(),  // B Date
    data.height || null,           // C
    data.weight || null,           // D
    data.waist || null,            // E
    data.hip || null,              // F
    data.glutes || null,           // G
    data.arm || null,              // H
    data.source || ''              // I
  ];
}

/**
 * Маппінг WorkoutSchedule рядка → об'єкт.
 * @param {Array} row
 * @return {Object}
 * @private
 */
function mapRowToSlot_(row) {
  var date = row[COLS.WORKOUT_SCHEDULE.DATE];
  if (!(date instanceof Date)) {
    date = date ? new Date(date) : new Date();
  }
  var updatedAt = row[COLS.WORKOUT_SCHEDULE.UPDATED_AT];
  if (!(updatedAt instanceof Date)) {
    updatedAt = updatedAt ? new Date(updatedAt) : new Date();
  }
  var priceCharged = row[COLS.WORKOUT_SCHEDULE.PRICE_CHARGED];
  if (priceCharged !== undefined && priceCharged !== null && priceCharged !== '') {
    priceCharged = parseFloat(priceCharged);
  } else {
    priceCharged = null;
  }
  var trainingType = (row[COLS.WORKOUT_SCHEDULE.TRAINING_TYPE] || '').toString().trim();
  if (trainingType !== CONSTANTS.TRAINING_TYPES.PERSONAL && trainingType !== CONSTANTS.TRAINING_TYPES.SPLIT && trainingType !== CONSTANTS.TRAINING_TYPES.TRIO) trainingType = '';
  return {
    id: row[COLS.WORKOUT_SCHEDULE.ID] || '',
    coachId: String(row[COLS.WORKOUT_SCHEDULE.COACH_ID] || ''),
    studentId: row[COLS.WORKOUT_SCHEDULE.STUDENT_ID] ? String(row[COLS.WORKOUT_SCHEDULE.STUDENT_ID]) : '',
    date: date,
    time: row[COLS.WORKOUT_SCHEDULE.TIME] || '',
    status: row[COLS.WORKOUT_SCHEDULE.STATUS] || CONSTANTS.SCHEDULE_STATUS.AVAILABLE,
    updatedAt: updatedAt,
    calEventId: row[COLS.WORKOUT_SCHEDULE.CAL_EVENT_ID] || '',
    priceCharged: isNaN(priceCharged) ? null : priceCharged,
    currency: (row[COLS.WORKOUT_SCHEDULE.CURRENCY] || '').toString().trim() || '',
    trainingType: trainingType
  };
}

/**
 * Маппінг slotData → рядок WorkoutSchedule.
 * @param {Object} data
 * @return {Array}
 * @private
 */
function slotToRow_(data) {
  return [
    data.id || '',                         // A
    data.coachId || '',                    // B
    data.studentId || '',                  // C
    toDateForSheet_(data.date) || new Date(),   // D
    data.time || '',                       // E
    data.status || CONSTANTS.SCHEDULE_STATUS.AVAILABLE, // F
    toDateForSheet_(data.updatedAt) || new Date(),  // G
    data.calEventId || '',                 // H
    data.priceCharged != null ? data.priceCharged : '',  // I
    (data.currency || '').toString(),      // J
    (data.trainingType || '').toString()   // K
  ];
}

// Експорт для User, Schedule, Training, Calendar та інших (GAS один глобальний namespace)
var Sheets = {
  getUserByChatId: getUserByChatId,
  getUsersByRole: getUsersByRole,
  insertUser: insertUser,
  updateUser: updateUser,
  findUserByInviteCode: findUserByInviteCode,
  replaceInviteWithChatId: replaceInviteWithChatId,
  getStudentsByCoachId: getStudentsByCoachId,
  getAllExercises: getAllExercises,
  getExercisesByGroup: getExercisesByGroup,
  getExerciseById: getExerciseById,
  insertTraining: insertTraining,
  getTrainingHistory: getTrainingHistory,
  getLastTraining: getLastTraining,
  insertMeasurement: insertMeasurement,
  getMeasurementHistory: getMeasurementHistory,
  getLastMeasurement: getLastMeasurement,
  insertScheduleSlot: insertScheduleSlot,
  findSlotByCoachStudentAndDateTime: findSlotByCoachStudentAndDateTime,
  updateScheduleSlotStatus: updateScheduleSlotStatus,
  updateScheduleSlotPrice: updateScheduleSlotPrice,
  updateScheduleSlotTrainingType: updateScheduleSlotTrainingType,
  updateScheduleSlotStudentId: updateScheduleSlotStudentId,
  updateScheduleSlotDateTime: updateScheduleSlotDateTime,
  updateScheduleSlotCalEventId: updateScheduleSlotCalEventId,
  getSlotsByCoachAndStatus: getSlotsByCoachAndStatus,
  getCoachPricing: getCoachPricing,
  getStudentPricing: getStudentPricing,
  getCurrentPrice: getCurrentPrice,
  setPricing: setPricing,
  getSlotById: getSlotById,
  getSlotsByStudentAndStatus: getSlotsByStudentAndStatus,
  deleteScheduleSlot: deleteScheduleSlot,
  getAllCities: getAllCities,
  insertLog: insertLog
};
