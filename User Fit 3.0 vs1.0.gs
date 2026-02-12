/**
 * User.gs - Бізнес-логіка користувачів
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Валідація даних користувачів
 * - Бізнес-правила (FK, Age)
 * - Трансформація даних
 * - Активація інвайтів
 *
 * НЕ МІСТИТЬ:
 * - UI генерацію
 * - FSM логіку
 * - Telegram API виклики
 */

// Маппінг імен полів для updateField (назва колонки → ключ об'єкта updates)
var USER_FIELD_MAP = {
  FIRST_NAME: 'firstName',
  LAST_NAME: 'lastName',
  CITY: 'city',
  ROLE: 'role',
  GENDER: 'gender',
  GOAL: 'goal',
  COACH_ID: 'coachId',
  BIRTH_DATE: 'birthDate',
  AGE: 'age',
  HEIGHT: 'height',
  WEIGHT: 'weight',
  WAIST: 'waist',
  HIP: 'hip',
  GLUTES: 'glutes',
  ARM: 'arm',
  INSTAGRAM: 'instagram',
  CALENDAR_ID: 'calendarId'
};

var PATTERNS = {
  INSTAGRAM_URL: /^https?:\/\/(www\.)?instagram\.com\/[^\s/]+\/?(\?.*)?$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INVITE_CODE: null
};

(function initInvitePattern() {
  PATTERNS.INVITE_CODE = typeof CONSTANTS !== 'undefined' && CONSTANTS.INVITE && CONSTANTS.INVITE.PREFIX
    ? new RegExp('^' + CONSTANTS.INVITE.PREFIX + '[A-Za-z0-9]+$')
    : /^INVITE_[A-Za-z0-9]+$/;
})();

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ЧИТАННЯ
// ═══════════════════════════════════════════════════════════

/**
 * Отримати користувача по ChatID
 *
 * @param {string|number} chatId - Telegram ChatID
 * @returns {Object|null} - User object або null
 */
function getByChatId(chatId) {
  try {
    var userData = Sheets.getUserByChatId(chatId);
    if (!userData) {
      return null;
    }
    if (!validateUserStructure_(userData)) {
      Logger.log('Invalid user structure for chatId: ' + chatId);
      return null;
    }
    return userData;
  } catch (error) {
    Logger.log('User.getByChatId error: ' + error.message);
    return null;
  }
}

/**
 * Перевірити чи користувач існує
 *
 * @param {string|number} chatId
 * @returns {boolean}
 */
function userExists_(chatId) {
  return getByChatId(chatId) !== null;
}

/**
 * Отримати роль користувача
 *
 * @param {string|number} chatId
 * @returns {string|null} - "student" або "coach" або null
 */
function getRole(chatId) {
  var user = getByChatId(chatId);
  return user ? user.role : null;
}

/**
 * Перевірити чи користувач - тренер
 *
 * @param {string|number} chatId
 * @returns {boolean}
 */
function isCoach(chatId) {
  return getRole(chatId) === CONSTANTS.ROLES.COACH;
}

/**
 * Перевірити чи користувач - учень
 *
 * @param {string|number} chatId
 * @returns {boolean}
 */
function isStudent(chatId) {
  return getRole(chatId) === CONSTANTS.ROLES.STUDENT;
}

/**
 * Отримати учнів тренера
 *
 * @param {string|number} coachChatId - ChatID тренера
 * @returns {Array<Object>} - Масив учнів
 */
function getStudentsByCoach(coachChatId) {
  try {
    if (!isCoach(coachChatId)) {
      Logger.log('getStudentsByCoach: ' + coachChatId + ' is not a coach');
      return [];
    }
    return Sheets.getStudentsByCoachId(coachChatId);
  } catch (error) {
    Logger.log('User.getStudentsByCoach error: ' + error.message);
    return [];
  }
}

/**
 * Отримати список міст (для реєстрації)
 *
 * @returns {Array<string>}
 */
function getCities() {
  try {
    return Sheets.getAllCities();
  } catch (error) {
    Logger.log('User.getCities error: ' + error.message);
    return [];
  }
}

/**
 * Отримати історію замірів користувача
 *
 * @param {string|number} chatId
 * @param {number} limit - кількість записів (опційно)
 * @returns {Array<Object>}
 */
function getMeasurementsHistory(chatId, limit) {
  try {
    var history = Sheets.getMeasurementHistory(chatId);
    if (!history || !history.length) {
      return [];
    }
    history.sort(function (a, b) {
      var da = a.date instanceof Date ? a.date : new Date(a.date);
      var db = b.date instanceof Date ? b.date : new Date(b.date);
      return db - da;
    });
    if (limit != null && limit > 0) {
      history = history.slice(0, limit);
    }
    return history;
  } catch (error) {
    Logger.log('User.getMeasurementsHistory error: ' + error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - СТВОРЕННЯ
// ═══════════════════════════════════════════════════════════

/**
 * Створити нового користувача
 *
 * @param {Object} userData - Дані користувача
 * @returns {boolean} - true якщо успішно
 */
function createUser(userData) {
  try {
    if (!userData.chatId) {
      throw new Error('ChatID is required');
    }
    if (!userData.role) {
      throw new Error('Role is required');
    }
    if (!userData.firstName) {
      throw new Error('FirstName is required');
    }
    if (userData.role !== CONSTANTS.ROLES.STUDENT && userData.role !== CONSTANTS.ROLES.COACH) {
      throw new Error('Invalid role: ' + userData.role);
    }

    if (getByChatId(userData.chatId)) {
      throw new Error('User with this ChatID already exists');
    }

    if (userData.coachId) {
      var coach = getByChatId(userData.coachId);
      if (!coach) {
        throw new Error('CoachID not found: ' + userData.coachId);
      }
      if (coach.role !== CONSTANTS.ROLES.COACH) {
        throw new Error('CoachID must reference a coach');
      }
    }

    if (userData.birthDate) {
      userData.age = calculateAge(userData.birthDate);
    }

    if (userData.role === CONSTANTS.ROLES.COACH) {
      if (userData.instagram && !PATTERNS.INSTAGRAM_URL.test(userData.instagram)) {
        throw new Error('Invalid Instagram URL format');
      }
      if (userData.calendarId && !PATTERNS.EMAIL.test(userData.calendarId)) {
        throw new Error('Invalid CalendarId email format');
      }
    }

    var birthDateNorm = userData.birthDate
      ? (userData.birthDate instanceof Date ? userData.birthDate : new Date(userData.birthDate))
      : null;
    var fullUserData = {
      createdAt: new Date(),
      userId: userData.chatId,
      chatId: userData.chatId,
      firstName: userData.firstName,
      lastName: userData.lastName || '',
      city: userData.city || '',
      role: userData.role,
      gender: userData.gender || '',
      age: '',  // при створенні завжди "" (Age — автообчислення в таблиці)
      goal: userData.goal || '',
      coachId: userData.coachId || '',
      birthDate: birthDateNorm,
      height: userData.height || null,
      weight: userData.weight || null,
      waist: userData.waist || null,
      hip: userData.hip || null,
      glutes: userData.glutes || null,
      arm: userData.arm || null,
      instagram: userData.instagram || '',
      calendarId: userData.calendarId || ''
    };

    var result = Sheets.insertUser(fullUserData);
    if (!result) {
      throw new Error('Failed to insert user into Sheets');
    }
    Logger.log('User created: ' + userData.chatId + ' (' + userData.role + ')');
    return true;
  } catch (error) {
    Logger.log('User.createUser error: ' + error.message);
    throw error;
  }
}

/**
 * Створити учня по інвайту (placeholder з INVITE_XXXX)
 *
 * @param {string|number} coachChatId - ChatID тренера
 * @param {string} firstName - Ім'я учня
 * @param {string} lastName - Прізвище учня
 * @returns {string} - Згенерований invite code
 */
function createStudentByInvite(coachChatId, firstName, lastName) {
  try {
    var coach = getByChatId(coachChatId);
    if (!coach) {
      throw new Error('Coach not found');
    }
    if (coach.role !== CONSTANTS.ROLES.COACH) {
      throw new Error('User is not a coach');
    }

    var inviteCode;
    var attempts = 0;
    var maxAttempts = (typeof CONSTANTS !== 'undefined' && CONSTANTS.INVITE && CONSTANTS.INVITE.MAX_ATTEMPTS != null)
      ? CONSTANTS.INVITE.MAX_ATTEMPTS
      : 5;

    do {
      var suffix = Utilities.getUuid().split('-')[0].toUpperCase();
      inviteCode = 'INVITE_' + suffix;
      var existsInvite = Sheets.findUserByInviteCode(inviteCode);
      if (!existsInvite) {
        break;
      }
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Cannot generate unique invite code');
    }

    var placeholderData = {
      createdAt: new Date(),
      userId: inviteCode,
      chatId: inviteCode,
      firstName: firstName,
      lastName: lastName || '',
      city: '',
      role: CONSTANTS.ROLES.STUDENT,
      gender: '',
      age: '',
      goal: CONSTANTS.GOALS.KEEP,
      coachId: coachChatId,
      birthDate: null,
      height: null,
      weight: null,
      waist: null,
      hip: null,
      glutes: null,
      arm: null,
      instagram: '',
      calendarId: ''
    };

    var result = Sheets.insertUser(placeholderData);
    if (!result) {
      throw new Error('Failed to create placeholder user');
    }
    Logger.log('Invite created: ' + inviteCode + ' for coach ' + coachChatId);
    return inviteCode;
  } catch (error) {
    Logger.log('User.createStudentByInvite error: ' + error.message);
    throw error;
  }
}

/**
 * Створити учня по інвайту з деталями профілю.
 *
 * @param {string|number} coachChatId - ChatID тренера
 * @param {Object} data - деталі учня
 * @returns {string} - Згенерований invite code
 */
function createStudentByInviteDetailed(coachChatId, data) {
  try {
    data = data || {};
    var coach = getByChatId(coachChatId);
    if (!coach) {
      throw new Error('Coach not found');
    }
    if (coach.role !== CONSTANTS.ROLES.COACH) {
      throw new Error('User is not a coach');
    }

    var inviteCode;
    var attempts = 0;
    var maxAttempts = (typeof CONSTANTS !== 'undefined' && CONSTANTS.INVITE && CONSTANTS.INVITE.MAX_ATTEMPTS != null)
      ? CONSTANTS.INVITE.MAX_ATTEMPTS
      : 5;

    do {
      var suffix = Utilities.getUuid().split('-')[0].toUpperCase();
      inviteCode = 'INVITE_' + suffix;
      var existsInvite = Sheets.findUserByInviteCode(inviteCode);
      if (!existsInvite) {
        break;
      }
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Cannot generate unique invite code');
    }

    var placeholderData = {
      createdAt: new Date(),
      userId: inviteCode,
      chatId: inviteCode,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      city: data.city || '',
      role: CONSTANTS.ROLES.STUDENT,
      gender: data.gender || '',
      age: data.age || '',
      goal: data.goal || CONSTANTS.GOALS.KEEP,
      coachId: coachChatId,
      birthDate: data.birthDate || null,
      height: null,
      weight: null,
      waist: null,
      hip: null,
      glutes: null,
      arm: null,
      instagram: '',
      calendarId: ''
    };

    var result = Sheets.insertUser(placeholderData);
    if (!result) {
      throw new Error('Failed to create placeholder user');
    }
    Logger.log('Invite created: ' + inviteCode + ' for coach ' + coachChatId);
    return inviteCode;
  } catch (error) {
    Logger.log('User.createStudentByInviteDetailed error: ' + error.message);
    throw error;
  }
}

/**
 * Отримати список тренерів.
 * @returns {Array<Object>}
 */
function getCoaches() {
  try {
    return Sheets.getUsersByRole(CONSTANTS.ROLES.COACH) || [];
  } catch (error) {
    Logger.log('User.getCoaches error: ' + error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ОНОВЛЕННЯ
// ═══════════════════════════════════════════════════════════

/**
 * Оновити окреме поле користувача
 *
 * @param {string|number} chatId
 * @param {string} fieldName - Назва поля (FIRST_NAME, CITY, BIRTH_DATE, ...)
 * @param {*} value - Нове значення
 * @returns {boolean}
 */
function updateField(chatId, fieldName, value) {
  try {
    if (!userExists_(chatId)) {
      throw new Error('User not found');
    }
    var key = USER_FIELD_MAP[fieldName];
    if (!key) {
      throw new Error('Invalid field name: ' + fieldName);
    }

    if (fieldName === 'BIRTH_DATE') {
      var birthDateValue = value ? (value instanceof Date ? value : new Date(value)) : null;
      var age = birthDateValue ? calculateAge(birthDateValue) : '';
      return Sheets.updateUser(chatId, { birthDate: birthDateValue, age: age });
    }

    var updates = {};
    updates[key] = value;
    return Sheets.updateUser(chatId, updates);
  } catch (error) {
    Logger.log('User.updateField error: ' + error.message);
    throw error;
  }
}

/**
 * Оновити заміри тіла (Users + MeasurementsHistory)
 *
 * @param {string|number} chatId
 * @param {Object} measurements - { weight, waist, hip, glutes, arm }
 * @returns {boolean}
 */
function updateMeasurements(chatId, measurements) {
  try {
    if (!userExists_(chatId)) {
      throw new Error('User not found');
    }

    var updates = {};
    if (measurements.weight !== undefined) updates.weight = measurements.weight;
    if (measurements.waist !== undefined) updates.waist = measurements.waist;
    if (measurements.hip !== undefined) updates.hip = measurements.hip;
    if (measurements.glutes !== undefined) updates.glutes = measurements.glutes;
    if (measurements.arm !== undefined) updates.arm = measurements.arm;
    if (Object.keys(updates).length > 0) {
      Sheets.updateUser(chatId, updates);
    }

    var historyData = {
      chatId: chatId,
      date: new Date(),
      height: null,
      weight: measurements.weight,
      waist: measurements.waist,
      hip: measurements.hip,
      glutes: measurements.glutes,
      arm: measurements.arm,
      source: ''
    };
    Sheets.insertMeasurement(historyData);

    Logger.log('Measurements updated for ' + chatId);
    return true;
  } catch (error) {
    Logger.log('User.updateMeasurements error: ' + error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ІНВАЙТИ
// ═══════════════════════════════════════════════════════════

/**
 * Активувати інвайт (замінити INVITE_XXXX на реальний ChatID)
 *
 * @param {string} inviteCode - Код інвайту (INVITE_XXXX)
 * @param {string|number} realChatId - Реальний Telegram ChatID
 * @returns {boolean}
 */
function activateInvite(inviteCode, realChatId) {
  try {
    if (!PATTERNS.INVITE_CODE.test(inviteCode)) {
      throw new Error('Invalid invite code format');
    }

    var result = Sheets.findUserByInviteCode(inviteCode);
    if (!result || !result.userData) {
      throw new Error('Invite code not found');
    }
    var inviteUser = result.userData;

    if (String(inviteUser.chatId) !== String(inviteCode)) {
      throw new Error('Invite code already activated');
    }

    if (getByChatId(realChatId)) {
      throw new Error('This Telegram account is already registered');
    }

    var ok = Sheets.replaceInviteWithChatId(inviteCode, realChatId);
    if (!ok) {
      throw new Error('Failed to activate invite');
    }
    Logger.log('Invite activated: ' + inviteCode + ' → ' + realChatId);
    return true;
  } catch (error) {
    Logger.log('User.activateInvite error: ' + error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API - ДОПОМІЖНІ (дати, вік)
// ═══════════════════════════════════════════════════════════

/**
 * Обчислити вік з дати народження
 *
 * @param {Date} birthDate
 * @returns {number|string} - Вік або "" якщо дати немає
 */
function calculateAge(birthDate) {
  if (!birthDate) {
    return '';
  }
  var today = new Date();
  var birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  var age = today.getFullYear() - birth.getFullYear();
  var monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Парсинг дати з рядка ДД.ММ.РРРР
 *
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseUserDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  var parts = dateStr.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) {
    return null;
  }
  var date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Форматування дати для відображення (ДД.ММ.РРРР)
 *
 * @param {Date} date
 * @returns {string}
 */
function userFormatDate_(date) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  var day = ('0' + date.getDate()).slice(-2);
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var year = date.getFullYear();
  return day + '.' + month + '.' + year;
}

// ═══════════════════════════════════════════════════════════
// PRIVATE
// ═══════════════════════════════════════════════════════════

/**
 * Валідація структури user object (мінімальні обов'язкові поля)
 * @private
 */
function validateUserStructure_(userData) {
  try {
    if (!userData.chatId) {
      return false;
    }
    if (!userData.role || (userData.role !== CONSTANTS.ROLES.STUDENT && userData.role !== CONSTANTS.ROLES.COACH)) {
      return false;
    }
    if (!userData.firstName || String(userData.firstName).length < 2) {
      return false;
    }
    if (userData.instagram && !PATTERNS.INSTAGRAM_URL.test(userData.instagram)) {
      return false;
    }
    if (userData.calendarId && !PATTERNS.EMAIL.test(userData.calendarId)) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Експорт для Router та інших модулів (GAS один глобальний namespace)
var User = {
  getByChatId: getByChatId,
  exists: userExists_,
  getRole: getRole,
  getStudentsByCoach: getStudentsByCoach,
  getCities: getCities,
  getMeasurementsHistory: getMeasurementsHistory,
  createUser: createUser,
  createStudentByInvite: createStudentByInvite,
  createStudentByInviteDetailed: createStudentByInviteDetailed,
  activateInvite: activateInvite,
  getCoaches: getCoaches,
  updateField: updateField,
  updateMeasurements: updateMeasurements,
  parseUserDate: parseUserDate,
  calculateAge: calculateAge,
  validateUserData: validateUserStructure_
};
