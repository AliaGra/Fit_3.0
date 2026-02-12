/**
 * Registration.gs - FSM Handler реєстрації
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - FSM реєстрації користувачів
 * - Активація інвайт-кодів
 * - Управління учнями (coach)
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку (це User.gs)
 * - Роботу з БД напряму (тільки через User)
 */

// Валідаційні патерни (Instagram, email, інвайт — константи де немає готових)
var REG_PATTERNS = {
  DATE: null,
  INSTAGRAM_URL: /^https?:\/\/(www\.)?instagram\.com\/[^\s/]+\/?(\?.*)?$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INVITE_CODE: null
};

(function initPatterns() {
  if (typeof CONSTANTS !== 'undefined' && CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.INPUT_DATE_PATTERN) {
    REG_PATTERNS.DATE = CONSTANTS.DATE_FORMATS.INPUT_DATE_PATTERN;
  } else {
    REG_PATTERNS.DATE = /^\d{2}\.\d{2}\.\d{4}$/;
  }
  if (typeof CONSTANTS !== 'undefined' && CONSTANTS.INVITE && CONSTANTS.INVITE.PREFIX) {
    REG_PATTERNS.INVITE_CODE = new RegExp('^' + CONSTANTS.INVITE.PREFIX + '[A-Za-z0-9]+$');
  } else {
    REG_PATTERNS.INVITE_CODE = /^INVITE_[A-Za-z0-9]+$/;
  }
})();

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Стартова точка реєстрації
 * @param {string|number} chatId
 * @param {Object} options
 */
function regStart_(chatId, options) {
  options = options || {};
  var force = !!options.force;
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
  } catch (e0) {}

  if (!force && cache) {
    var cacheKey = 'WELCOME_' + String(chatId);
    var existing = cache.get(cacheKey);
    if (existing) {
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.start', 'throttle welcome chatId=' + chatId);
        }
      } catch (e1) {}
      return;
    }
    cache.put(cacheKey, '1', 900);
  }

  var stepState = (typeof CONSTANTS !== 'undefined' && CONSTANTS.FSM_STATES && CONSTANTS.FSM_STATES.WAITING_FOR_START_CHOICE)
    ? CONSTANTS.FSM_STATES.WAITING_FOR_START_CHOICE
    : 'WAITING_FOR_START_CHOICE';
  State.set(chatId, { step: stepState });
  cacheRegStep_(chatId, stepState);

  var keyboard = [
    [{ text: '✅ Нова реєстрація', callback_data: CONSTANTS.CALLBACKS.REG_NEW }],
    [{ text: '🎟️ У мене є код', callback_data: CONSTANTS.CALLBACKS.REG_INVITE }]
  ];
  var msg = Helpers.sendKeyboard(
    chatId,
    '👋 Привіт! Вітаю в системі FIT 3.0\n\nОбери варіант:',
    keyboard
  );
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.start', (msg && msg.message_id ? 'welcome sent message_id=' + msg.message_id : 'welcome send failed') + ' chatId=' + chatId);
    }
  } catch (e3) {}
}

/**
 * Обробка callback (натискання кнопок)
 *
 * @param {string|number} chatId
 * @param {string} action - callback_data (або action з парсингу)
 * @param {Array} params - параметри з callback (якщо є)
 */
function regHandleCallback_(chatId, action, params) {
  params = params || [];
  try { Logger.log('Registration.handleCallback: action=' + (action || '') + ' chatId=' + chatId); } catch (e) {}
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.handleCallback', 'action=' + (action || '') + ' chatId=' + chatId);
    }
  } catch (e2) {}

  // Порівняння з рядком щоб callback працював навіть якщо CONSTANTS ще не завантажені
  if (action === 'REG_NEW' || (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && action === CONSTANTS.CALLBACKS.REG_NEW)) {
    askRole_(chatId);
    return;
  }

  if (action === 'REG_INVITE' || (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && action === CONSTANTS.CALLBACKS.REG_INVITE)) {
    askInviteCode_(chatId);
    return;
  }

  if (action === 'REG_ROLE_STUDENT' || (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && action === CONSTANTS.CALLBACKS.REG_ROLE_STUDENT)) {
    State.update(chatId, { role: (typeof CONSTANTS !== 'undefined' && CONSTANTS.ROLES) ? CONSTANTS.ROLES.STUDENT : 'student' });
    askFirstName_(chatId);
    return;
  }

  if (action === 'REG_ROLE_COACH' || (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && action === CONSTANTS.CALLBACKS.REG_ROLE_COACH)) {
    State.update(chatId, { role: (typeof CONSTANTS !== 'undefined' && CONSTANTS.ROLES) ? CONSTANTS.ROLES.COACH : 'coach' });
    askFirstName_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_GENDER_MALE) {
    State.update(chatId, { gender: CONSTANTS.GENDERS.MALE });
    askGoal_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_GENDER_FEMALE) {
    State.update(chatId, { gender: CONSTANTS.GENDERS.FEMALE });
    askGoal_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_GOAL_LOSE) {
    State.update(chatId, { goal: CONSTANTS.GOALS.LOSE });
    askBirthDate_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_GOAL_GAIN) {
    State.update(chatId, { goal: CONSTANTS.GOALS.GAIN });
    askBirthDate_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_GOAL_KEEP) {
    State.update(chatId, { goal: CONSTANTS.GOALS.KEEP });
    askBirthDate_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY || (typeof action === 'string' && action.indexOf('CITY:') === 0)) {
    var cityName = params[0] || (action.split(':').slice(1).join(':'));
    State.update(chatId, { city: cityName });
    var stateData = State.getData(chatId);
    if (stateData.role === CONSTANTS.ROLES.COACH) {
      askInstagram_(chatId);
    } else {
      finishRegistration_(chatId);
    }
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_SKIP_LASTNAME) {
    State.update(chatId, { lastName: '' });
    askCity_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_CONTINUE) {
    askLastName_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REG_START_TRAINING) {
    setRegResume_(chatId);
    Training.startWorkout(chatId, chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.COACH_STUDENTS) {
    showStudentsList_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.COACH_PICK_START) {
    showCoachPickList_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_PICK || (typeof action === 'string' && action.indexOf('COACH_PICK:') === 0)) {
    var pickedCoachId = params[0] || (action.split(':').slice(1).join(':'));
    setCoachForUser_(chatId, pickedCoachId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.COACH_ADD_STUDENT) {
    askStudentName_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT || (typeof action === 'string' && action.indexOf('VIEW_STUDENT:') === 0)) {
    var studentChatId = params[0] || (action.split(':').slice(1).join(':'));
    showStudentProfile_(chatId, studentChatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN || (typeof action === 'string' && action.indexOf('COACH_TRAIN:') === 0)) {
    var trainStudentId = params[0] || (action.split(':').slice(1).join(':'));
    Training.startWorkout(chatId, trainStudentId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY || (typeof action === 'string' && action.indexOf('COACH_HISTORY:') === 0)) {
    var histStudentId = params[0] || (action.split(':').slice(1).join(':'));
    if (typeof Training !== 'undefined' && typeof Training.showHistoryForStudent === 'function') {
      Training.showHistoryForStudent(chatId, histStudentId);
    } else {
      State.update(chatId, { targetUserId: histStudentId });
      Training.handleCallback(chatId, CONSTANTS.CALLBACKS.HISTORY_MENU, []);
    }
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_BOOK || (typeof action === 'string' && action.indexOf('COACH_BOOK:') === 0)) {
    var bookStudentId = params[0] || (action.split(':').slice(1).join(':'));
    if (typeof Schedule !== 'undefined' && typeof Schedule.startCoachBookingForStudent === 'function') {
      Schedule.startCoachBookingForStudent(chatId, bookStudentId);
    } else {
      Helpers.safeSend(chatId, '⚠️ Модуль розкладу недоступний.');
    }
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE || (typeof action === 'string' && action.indexOf('COACH_PROFILE') === 0)) {
    var coachIdFromParam = params[0] || (action.split(':').slice(1).join(':'));
    showCoachProfileForStudent_(chatId, coachIdFromParam);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PRICING_SET_DEFAULT || action === CONSTANTS.CALLBACKS.PRICING_CHANGE) {
    State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_TYPE_SELECT, pricingStudentId: '' });
    showPricingTypeSelect_(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_SET_INDIVIDUAL) {
    State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_SELECT_STUDENT });
    showPricingStudentSelect_(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_PERSONAL) {
    State.update(chatId, { pricingType: CONSTANTS.TRAINING_TYPES.PERSONAL, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    Helpers.safeSend(chatId, '💰 Введіть вартість персональної тренування (ціле число, грн):');
    return;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_SPLIT) {
    State.update(chatId, { pricingType: CONSTANTS.TRAINING_TYPES.SPLIT, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    Helpers.safeSend(chatId, '💰 Введіть вартість тренування спліт (ціле число, грн):');
    return;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_TRIO) {
    State.update(chatId, { pricingType: CONSTANTS.TRAINING_TYPES.TRIO, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    Helpers.safeSend(chatId, '💰 Введіть вартість тренування тріо (ціле число, грн):');
    return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT || (typeof action === 'string' && action.indexOf('PRICING_STUDENT:') === 0)) {
    var pricingStudentId = params[0] || (action.split(':').slice(1).join(':'));
    State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_TYPE_SELECT, pricingStudentId: pricingStudentId });
    showPricingTypeSelect_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE || (typeof action === 'string' && action.indexOf('STUDENT_TRAINING_TYPE:') === 0)) {
    var studentIdForType = params[0] || (action.split(':').slice(1).join(':'));
    showStudentTrainingTypeSelect_(chatId, studentIdForType);
    return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_PERSONAL || (typeof action === 'string' && action.indexOf('STUDENT_TYPE_PERSONAL:') === 0)) {
    var sid = params[0] || (action.split(':').slice(1).join(':'));
    saveDefaultTrainingType_(chatId, sid, CONSTANTS.TRAINING_TYPES.PERSONAL);
    return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_SPLIT || (typeof action === 'string' && action.indexOf('STUDENT_TYPE_SPLIT:') === 0)) {
    var sid = params[0] || (action.split(':').slice(1).join(':'));
    saveDefaultTrainingType_(chatId, sid, CONSTANTS.TRAINING_TYPES.SPLIT);
    return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_TRIO || (typeof action === 'string' && action.indexOf('STUDENT_TYPE_TRIO:') === 0)) {
    var sid = params[0] || (action.split(':').slice(1).join(':'));
    saveDefaultTrainingType_(chatId, sid, CONSTANTS.TRAINING_TYPES.TRIO);
    return;
  }

  Logger.log('Registration: Unknown callback: ' + action);
}

/**
 * Обробка текстового введення
 *
 * @param {string|number} chatId
 * @param {string} text - текст від користувача
 */
function regHandleTextMessage_(chatId, text) {
  var state = State.get(chatId);
  if (!state || !state.step) {
    Logger.log('Registration: No state found');
    return;
  }

  var step = state.step;
  var stateData = state || {};

  if (step === CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT) {
    handlePricingAmountInput_(chatId, text);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_FIRST_NAME) {
    var firstName = String(text).trim();
    var minLen = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.NAME_MIN_LENGTH != null) ? CONSTANTS.VALIDATION.NAME_MIN_LENGTH : 2;
    var maxLen = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.NAME_MAX_LENGTH != null) ? CONSTANTS.VALIDATION.NAME_MAX_LENGTH : 30;
    if (firstName.length < minLen || firstName.length > maxLen) {
      Helpers.safeSend(chatId, "⚠️ Ім'я має бути від " + minLen + " до " + maxLen + " символів.\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { firstName: firstName });
    askContinueOrStart_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_FIRST_NAME_DECISION) {
    Helpers.safeSend(chatId, "⚠️ Обери дію кнопкою нижче.");
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_LAST_NAME) {
    var lastName = String(text).trim();
    var lastMin = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.LASTNAME_MIN_LENGTH != null) ? CONSTANTS.VALIDATION.LASTNAME_MIN_LENGTH : 2;
    var lastMax = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.LASTNAME_MAX_LENGTH != null) ? CONSTANTS.VALIDATION.LASTNAME_MAX_LENGTH : 50;
    if (lastName.length < lastMin || lastName.length > lastMax) {
      Helpers.safeSend(chatId, "⚠️ Прізвище має бути від " + lastMin + " до " + lastMax + " символів.\nСпробуй ще раз або натисни [Пропустити]:");
      return;
    }
    State.update(chatId, { lastName: lastName });
    askGender_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CITY) {
    var city = String(text).trim();
    var cityMin = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.CITY_MIN_LENGTH != null) ? CONSTANTS.VALIDATION.CITY_MIN_LENGTH : 2;
    var cityMax = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.CITY_MAX_LENGTH != null) ? CONSTANTS.VALIDATION.CITY_MAX_LENGTH : 50;
    if (city.length < cityMin || city.length > cityMax) {
      Helpers.safeSend(chatId, "⚠️ Назва міста має бути від " + cityMin + " до " + cityMax + " символів.\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { city: city });
    if (stateData.role === CONSTANTS.ROLES.COACH) {
      askInstagram_(chatId);
    } else {
      finishRegistration_(chatId);
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_BIRTH_DATE) {
    var dateText = String(text).trim();
    if (!REG_PATTERNS.DATE || !REG_PATTERNS.DATE.test(dateText)) {
      Helpers.safeSend(chatId, "⚠️ Невірний формат дати.\n\nОчікується: ДД.ММ.РРРР\nПриклад: 15.05.1995\n\nСпробуй ще раз:");
      return;
    }
    var birthDate = (typeof User !== 'undefined' && typeof User.parseUserDate === 'function') ? User.parseUserDate(dateText) : parseDateFallback_(dateText);
    if (!birthDate) {
      Helpers.safeSend(chatId, "⚠️ Некоректна дата.\nСпробуй ще раз:");
      return;
    }
    var age = (typeof User !== 'undefined' && typeof User.calculateAge === 'function') ? User.calculateAge(birthDate) : calculateAgeFallback_(birthDate);
    if (age < 12 || age > 100) {
      Helpers.safeSend(chatId, "⚠️ Вік має бути від 12 до 100 років.\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { birthDate: birthDate, age: age });
    askCity_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_INSTAGRAM) {
    var instagram = String(text).trim();
    if (instagram === '') {
      State.update(chatId, { instagram: '' });
      askCalendarId_(chatId);
      return;
    }
    if (!REG_PATTERNS.INSTAGRAM_URL.test(instagram)) {
      Helpers.safeSend(chatId, "⚠️ Невірний формат посилання Instagram.\n\nПриклад: https://www.instagram.com/your_name\n\nСпробуй ще раз або надішли порожнє повідомлення щоб пропустити:");
      return;
    }
    State.update(chatId, { instagram: instagram });
    askCalendarId_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CALENDAR_ID) {
    var calendarId = String(text).trim();
    if (calendarId === '') {
      State.update(chatId, { calendarId: '' });
      finishRegistration_(chatId);
      return;
    }
    if (!REG_PATTERNS.EMAIL.test(calendarId)) {
      Helpers.safeSend(chatId, "⚠️ Невірний формат email.\n\nПриклад: your.email@gmail.com\n\nСпробуй ще раз або надішли порожнє повідомлення щоб пропустити:");
      return;
    }
    State.update(chatId, { calendarId: calendarId });
    finishRegistration_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REG_INVITE_INPUT) {
    var inviteCode = String(text).trim().toUpperCase();
    if (!REG_PATTERNS.INVITE_CODE.test(inviteCode)) {
      Helpers.safeSend(chatId, "⚠️ Невірний формат коду.\n\nКод має починатися з INVITE_\nПриклад: INVITE_A3F7\n\nСпробуй ще раз:");
      return;
    }
    try {
      var success = User.activateInvite(inviteCode, chatId);
      if (success) {
        State.clear(chatId);
        clearRegStep_(chatId);
        clearRegResume_(chatId);
        try {
          var cache = CacheService.getScriptCache();
          var key = (CONSTANTS && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_COACH_STUDENTS)
            ? CONSTANTS.CACHE.PREFIX_COACH_STUDENTS
            : 'COACH_STUDENTS_';
          var coachId = stateData && stateData.coachId ? stateData.coachId : '';
          if (coachId) {
            cache.remove(key + String(coachId));
          }
        } catch (eInv) {}
        Helpers.safeSend(chatId, "✅ Код прийнято!\nТи успішно приєднався до команди.");
        Menu.show(chatId);
      } else {
        Helpers.safeSend(chatId, "❌ Код недійсний або вже використано.\nСпробуй ще раз або натисни [🔙 Назад]");
      }
    } catch (error) {
      Logger.log('Invite activation error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка активації коду:\n" + error.message + "\n\nСпробуй ще раз або натисни [🔙 Назад]");
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_NAME) {
    var fullName = String(text).trim();
    var parts = fullName.split(/\s+/);
    if (parts.length < 2) {
      Helpers.safeSend(chatId, "⚠️ Введи ім'я та прізвище учня одним повідомленням.\n\nФормат: Ім'я Прізвище\nПриклад: Марія Коваль\n\nСпробуй ще раз:");
      return;
    }
    var first = parts[0];
    var last = parts.slice(1).join(' ');
    try {
      var inviteCode2 = User.createStudentByInvite(chatId, first, last);
      State.clear(chatId);
      clearRegStep_(chatId);
      try {
        var cache2 = CacheService.getScriptCache();
        var key2 = (CONSTANTS && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_COACH_STUDENTS)
          ? CONSTANTS.CACHE.PREFIX_COACH_STUDENTS
          : 'COACH_STUDENTS_';
        cache2.remove(key2 + String(chatId));
      } catch (eInv2) {}
      Helpers.safeSend(chatId, "✅ Учня створено!\n\nПередай йому цей код доступу:\n`" + inviteCode2 + "`\n\nКоли він введе його у боті, його профіль автоматично прив'яжеться до тебе.", { parse_mode: 'Markdown' });
      Menu.show(chatId);
    } catch (error) {
      Logger.log('Create student error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка створення учня:\n" + error.message + "\n\nСпробуй ще раз.");
    }
    return;
  }

  Logger.log('Registration: Unknown state: ' + step);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - FSM КРОКИ
// ═══════════════════════════════════════════════════════════

function setRegStep_(chatId, step) {
  var ok = State.setStep(chatId, step);
  cacheRegStep_(chatId, step);
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.setRegStep', 'step=' + step + ' ok=' + ok + ' chatId=' + chatId);
    }
  } catch (e) {}
  return ok;
}

function cacheRegStep_(chatId, step) {
  try {
    var cache = CacheService.getScriptCache();
    var key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_STEP)
      ? CONSTANTS.CACHE.PREFIX_REG_STEP
      : 'REG_STEP_';
    var ttl = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.TTL_REG_STEP != null)
      ? CONSTANTS.CACHE.TTL_REG_STEP
      : 1800;
    cache.put(key + String(chatId), String(step || ''), ttl);
    try {
      PropertiesService.getScriptProperties()
        .setProperty(key + String(chatId), String(step || ''));
    } catch (pErr) {}
  } catch (e) {}
}

function clearRegStep_(chatId) {
  try {
    var cache = CacheService.getScriptCache();
    var key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_STEP)
      ? CONSTANTS.CACHE.PREFIX_REG_STEP
      : 'REG_STEP_';
    cache.remove(key + String(chatId));
    try {
      PropertiesService.getScriptProperties()
        .deleteProperty(key + String(chatId));
    } catch (pErr2) {}
  } catch (e) {}
}

function setRegResume_(chatId) {
  try {
    var stateData = State.getData(chatId) || {};
    var payload = {
      step: CONSTANTS.FSM_STATES.REG_LAST_NAME,
      firstName: stateData.firstName || '',
      role: stateData.role || ''
    };
    var cache = CacheService.getScriptCache();
    var key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_RESUME)
      ? CONSTANTS.CACHE.PREFIX_REG_RESUME
      : 'REG_RESUME_';
    var ttl = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.TTL_REG_RESUME != null)
      ? CONSTANTS.CACHE.TTL_REG_RESUME
      : 86400;
    cache.put(key + String(chatId), JSON.stringify(payload), ttl);
    try {
      PropertiesService.getScriptProperties()
        .setProperty(key + String(chatId), JSON.stringify(payload));
    } catch (pErr) {}
  } catch (e) {}
}

function getRegResume_(chatId) {
  try {
    var cache = CacheService.getScriptCache();
    var key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_RESUME)
      ? CONSTANTS.CACHE.PREFIX_REG_RESUME
      : 'REG_RESUME_';
    var raw = cache.get(key + String(chatId));
    if (!raw) {
      try {
        raw = PropertiesService.getScriptProperties().getProperty(key + String(chatId));
      } catch (pErr) {}
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearRegResume_(chatId) {
  try {
    var cache = CacheService.getScriptCache();
    var key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CACHE && CONSTANTS.CACHE.PREFIX_REG_RESUME)
      ? CONSTANTS.CACHE.PREFIX_REG_RESUME
      : 'REG_RESUME_';
    cache.remove(key + String(chatId));
    try {
      PropertiesService.getScriptProperties()
        .deleteProperty(key + String(chatId));
    } catch (pErr2) {}
  } catch (e) {}
}

function regResumePending_(chatId) {
  var payload = getRegResume_(chatId);
  if (!payload || !payload.step) {
    return false;
  }
  State.set(chatId, {
    step: payload.step,
    firstName: payload.firstName || '',
    role: payload.role || ''
  });
  clearRegResume_(chatId);
  askLastName_(chatId);
  return true;
}

function askRole_(chatId) {
  var stepRole = (typeof CONSTANTS !== 'undefined' && CONSTANTS.FSM_STATES && CONSTANTS.FSM_STATES.REG_ROLE)
    ? CONSTANTS.FSM_STATES.REG_ROLE
    : 'reg_role';
  setRegStep_(chatId, stepRole);
  var cbStudent = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && CONSTANTS.CALLBACKS.REG_ROLE_STUDENT) ? CONSTANTS.CALLBACKS.REG_ROLE_STUDENT : 'REG_ROLE_STUDENT';
  var cbCoach = (typeof CONSTANTS !== 'undefined' && CONSTANTS.CALLBACKS && CONSTANTS.CALLBACKS.REG_ROLE_COACH) ? CONSTANTS.CALLBACKS.REG_ROLE_COACH : 'REG_ROLE_COACH';
  var keyboard = [
    [{ text: '🎓 Учень', callback_data: cbStudent }],
    [{ text: '💪 Тренер', callback_data: cbCoach }]
  ];
  var msg = Helpers.sendKeyboard(chatId, '👤 Обери свою роль:', keyboard);
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.askRole', (msg && msg.message_id ? 'role sent message_id=' + msg.message_id : 'role send failed') + ' chatId=' + chatId);
    }
  } catch (e) {}
}

function askFirstName_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_FIRST_NAME);
  Helpers.safeSend(chatId, "✍️ Напиши своє ім'я:");
}

function askContinueOrStart_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_FIRST_NAME_DECISION);
  var keyboard = [
    [{ text: '✅ Продовжити реєстрацію', callback_data: CONSTANTS.CALLBACKS.REG_CONTINUE }],
    [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACKS.REG_START_TRAINING }]
  ];
  Helpers.sendKeyboard(chatId, "Приємно познайомитись! Обери наступний крок:", keyboard);
}

function askLastName_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_LAST_NAME);
  var data = State.getData(chatId);
  var firstName = data.firstName || '';
  var keyboard = [[{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACKS.REG_SKIP_LASTNAME }]];
  Helpers.sendKeyboard(chatId, "Приємно, " + firstName + "! 👋\n\n✍️ Тепер напиши своє прізвище:", keyboard);
}

function askCity_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_CITY);
  var cities = (typeof User !== 'undefined' && typeof User.getCities === 'function') ? User.getCities() : [];
  var keyboard = [];
  var i;
  for (i = 0; i < cities.length; i += 2) {
    var row = [{ text: cities[i], callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i] }];
    if (i + 1 < cities.length) {
      row.push({ text: cities[i + 1], callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i + 1] });
    }
    keyboard.push(row);
  }
  Helpers.sendKeyboard(chatId, "🏙️ Обери своє місто або напиши його:", keyboard);
}

function askGender_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_GENDER);
  var keyboard = [
    [{ text: '👨 Чоловік', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_MALE }],
    [{ text: '👩 Жінка', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_FEMALE }]
  ];
  Helpers.sendKeyboard(chatId, '👤 Обери стать:', keyboard);
}

function askGoal_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_GOAL);
  var keyboard = [
    [{ text: '📉 Схуднути', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_LOSE }],
    [{ text: '📈 Набрати масу', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_GAIN }],
    [{ text: '⚖️ Підтримувати форму', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_KEEP }]
  ];
  Helpers.sendKeyboard(chatId, '🎯 Яка твоя мета?', keyboard);
}

function askBirthDate_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_BIRTH_DATE);
  Helpers.safeSend(chatId, "📅 Напиши свою дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: 15.05.1995");
}

function askInstagram_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_INSTAGRAM);
  Helpers.safeSend(chatId, "📸 Надішли посилання на свій Instagram:\n\nПриклад: https://www.instagram.com/your_name\n\nАбо надішли порожнє повідомлення щоб пропустити.");
}

function askCalendarId_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_CALENDAR_ID);
  Helpers.safeSend(chatId, "📆 Надішли email свого Google Calendar:\n\nПриклад: your.email@gmail.com\n\nЦе потрібно для синхронізації розкладу.\n\nАбо надішли порожнє повідомлення щоб пропустити.");
}

function askInviteCode_(chatId) {
  setRegStep_(chatId, CONSTANTS.FSM_STATES.REG_INVITE_INPUT);
  var keyboard = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
  Helpers.sendKeyboard(chatId, "🎟️ Введи код, який надав твій тренер:\n\nПриклад: INVITE_A3F7", keyboard);
}

function finishRegistration_(chatId) {
  try {
    var stateData = State.getData(chatId);
    var userData = {
      chatId: chatId,
      role: stateData.role,
      firstName: stateData.firstName,
      lastName: stateData.lastName || '',
      city: stateData.city || '',
      gender: stateData.gender || '',
      goal: stateData.goal || '',
      birthDate: stateData.birthDate || null,
      age: stateData.age || '',
      instagram: stateData.instagram || '',
      calendarId: stateData.calendarId || ''
    };
    var success = User.createUser(userData);
    if (success) {
      State.clear(chatId);
      clearRegStep_(chatId);
      clearRegResume_(chatId);
      var roleText = userData.role === CONSTANTS.ROLES.COACH ? 'тренере' : 'учне';
      Helpers.safeSend(chatId, "🎉 Вітаю, " + userData.firstName + "!\n\nРеєстрацію завершено. Ласкаво просимо в FIT 3.0, " + roleText + "!");
      Menu.show(chatId);
    } else {
      Helpers.safeSend(chatId, "❌ Не вдалося створити профіль.\nСпробуй ще раз через /start");
      State.clear(chatId);
      clearRegStep_(chatId);
      clearRegResume_(chatId);
    }
  } catch (error) {
    Logger.log('Registration finish error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Виникла помилка при завершенні реєстрації:\n" + error.message + "\n\nСпробуй ще раз через /start");
    State.clear(chatId);
    clearRegStep_(chatId);
    clearRegResume_(chatId);
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - COACH УПРАВЛІННЯ УЧНЯМИ
// ═══════════════════════════════════════════════════════════

function showStudentsList_(chatId) {
  try {
    var students = (typeof User !== 'undefined' && typeof User.getStudentsByCoach === 'function') ? User.getStudentsByCoach(chatId) : [];
    if (students.length === 0) {
      var keyboard = [
        [{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }],
        [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ];
      Helpers.sendKeyboard(chatId, "📋 У тебе поки немає учнів.\n\nДодай першого учня:", keyboard);
      return;
    }
    var keyboard = [];
    var s;
    for (s = 0; s < students.length; s++) {
      var student = students[s];
      var name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
      var isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
      var status = isInvite ? '⏳ Очікує' : '✅ Активний';
      keyboard.push([{ text: name + ' (' + status + ')', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + student.chatId }]);
    }
    keyboard.push([{ text: '💰 Ввести вартість тренування', callback_data: CONSTANTS.CALLBACKS.PRICING_SET_DEFAULT }]);
    keyboard.push([{ text: '💰 Індивідуальна вартість', callback_data: CONSTANTS.CALLBACKS.PRICING_SET_INDIVIDUAL }]);
    keyboard.push([{ text: '💰 Змінити вартість', callback_data: CONSTANTS.CALLBACKS.PRICING_CHANGE }]);
    keyboard.push([{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    Helpers.sendKeyboard(chatId, "👥 Твої учні (" + students.length + "):\n\nОбери учня або дію:", keyboard);
  } catch (error) {
    Logger.log('Show students error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Помилка завантаження списку учнів.");
  }
}

function showStudentProfile_(chatId, studentChatId) {
  try {
    var student = User.getByChatId(studentChatId);
    if (!student) {
      Helpers.safeSend(chatId, "❌ Учня не знайдено.");
      return;
    }
    if (String(student.coachId) !== String(chatId)) {
      Helpers.safeSend(chatId, "⛔ Доступ заборонено.");
      return;
    }
    var message = "👤 **Профіль учня**\n\n";
    message += "Ім'я: " + (student.firstName || '') + " " + (student.lastName || '') + "\n";
    message += "Місто: " + (student.city || 'не вказано') + "\n";
    message += "Стать: " + (student.gender === CONSTANTS.GENDERS.MALE ? 'Чоловік' : 'Жінка') + "\n";
    message += "Вік: " + (student.age || 'не вказано') + " років\n";
    message += "Мета: " + getGoalText_(student.goal) + "\n\n";
    if (student.height) message += "📏 Зріст: " + student.height + " см\n";
    if (student.weight) message += "⚖️ Вага: " + student.weight + " кг\n";
    var pricing = (typeof Sheets !== 'undefined' && typeof Sheets.getStudentPricing === 'function')
      ? Sheets.getStudentPricing(chatId, studentChatId) : null;
    if (!pricing && typeof Sheets !== 'undefined' && typeof Sheets.getCoachPricing === 'function') {
      pricing = Sheets.getCoachPricing(chatId);
    }
    if (pricing) {
      message += "\n💰 **Вартість тренувань:**\n";
      var cur = (pricing.currency || 'UAH').toString();
      if (pricing.pricePersonal != null && pricing.pricePersonal !== '') message += "• Персональна: " + pricing.pricePersonal + " " + cur + "\n";
      if (pricing.priceSplit != null && pricing.priceSplit !== '') message += "• Спліт: " + pricing.priceSplit + " " + cur + "\n";
      if (pricing.priceTrio != null && pricing.priceTrio !== '') message += "• Тріо: " + pricing.priceTrio + " " + cur + "\n";
      if (pricing.defaultTrainingType) {
        var typeLabel = pricing.defaultTrainingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'Персональна' : (pricing.defaultTrainingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'Спліт' : 'Тріо');
        message += "🎯 **Тип тренування за замовчуванням:** " + typeLabel + "\n";
      }
    }
    var isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
    if (isInvite) {
      message += "\n⏳ Статус: Очікує активації\nКод: `" + (student.userId || '') + "`";
    } else {
      message += "\n✅ Статус: Активний";
    }
    var kbd = [
      [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN + ':' + studentChatId }],
      [{ text: '🎯 Тип тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE + ':' + studentChatId }, { text: '🔄 Змінити тип тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE + ':' + studentChatId }],
      [{ text: '📊 Історія', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY + ':' + studentChatId }],
      [{ text: '📅 Записати', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_BOOK + ':' + studentChatId }],
      [{ text: '🔙 До списку', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]
    ];
    Helpers.sendKeyboard(chatId, message, kbd, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('Show student profile error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Помилка завантаження профілю.");
  }
}

function askStudentName_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_NAME });
  cacheRegStep_(chatId, CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_NAME);
  Helpers.safeSend(chatId, "➕ **Додавання нового учня**\n\nВведи ім'я та прізвище учня одним повідомленням:\n\nФормат: Ім'я Прізвище\nПриклад: Марія Коваль", { parse_mode: 'Markdown' });
}

function showPricingTypeSelect_(chatId) {
  var keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_TRIO }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]
  ];
  Helpers.sendKeyboard(chatId, '💰 Обери вид тренування для введення вартості:', keyboard);
}

function showPricingStudentSelect_(chatId) {
  var students = (typeof User !== 'undefined' && typeof User.getStudentsByCoach === 'function') ? User.getStudentsByCoach(chatId) : [];
  if (!students || students.length === 0) {
    Helpers.safeSend(chatId, '📋 У тебе поки немає учнів.');
    showStudentsList_(chatId);
    return;
  }
  var keyboard = [];
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var name = (s.firstName || '') + ' ' + (s.lastName || '').trim();
    keyboard.push([{ text: name, callback_data: CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT + ':' + s.chatId }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]);
  Helpers.sendKeyboard(chatId, '💰 Обери учня для індивідуальної вартості:', keyboard);
}

function showStudentTrainingTypeSelect_(chatId, studentChatId) {
  var keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_PERSONAL + ':' + studentChatId }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_SPLIT + ':' + studentChatId }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_TRIO + ':' + studentChatId }],
    [{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]
  ];
  Helpers.sendKeyboard(chatId, '🎯 Обери тип тренування за замовчуванням для цього учня:', keyboard);
}

function saveDefaultTrainingType_(chatId, studentChatId, trainingType) {
  var current = (typeof Sheets !== 'undefined' && typeof Sheets.getStudentPricing === 'function')
    ? Sheets.getStudentPricing(chatId, studentChatId) : null;
  if (!current && typeof Sheets !== 'undefined' && typeof Sheets.getCoachPricing === 'function') {
    current = Sheets.getCoachPricing(chatId);
  }
  if (!current) current = { pricePersonal: '', priceSplit: '', priceTrio: '', currency: (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) ? CONSTANTS.PRICING.DEFAULT_CURRENCY : 'UAH' };
  current.defaultTrainingType = trainingType;
  if (typeof Sheets !== 'undefined' && typeof Sheets.setPricing === 'function') {
    Sheets.setPricing(chatId, studentChatId, current);
  }
  var label = trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'Персональна' : (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'Спліт' : 'Тріо');
  Helpers.safeSend(chatId, '✅ Тип тренування за замовчуванням встановлено: ' + label);
  showStudentProfile_(chatId, studentChatId);
}

function handlePricingAmountInput_(chatId, text) {
  var state = State.get(chatId) || {};
  var amount = parseInt(String(text).trim().replace(/\s/g, ''), 10);
  if (isNaN(amount)) {
    Helpers.safeSend(chatId, '⚠️ Введіть ціле число.');
    return;
  }
  var minPrice = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.PRICE_MIN != null) ? CONSTANTS.VALIDATION.PRICE_MIN : 0;
  var maxPrice = (CONSTANTS.VALIDATION && CONSTANTS.VALIDATION.PRICE_MAX != null) ? CONSTANTS.VALIDATION.PRICE_MAX : 999999;
  if (amount < minPrice) {
    Helpers.safeSend(chatId, '⚠️ Мінімум: ' + minPrice + ' грн.');
    return;
  }
  if (amount > maxPrice) {
    Helpers.safeSend(chatId, '⚠️ Сума занадто велика. Максимум: ' + maxPrice);
    return;
  }
  var pricingType = state.pricingType || CONSTANTS.TRAINING_TYPES.PERSONAL;
  var pricingStudentId = state.pricingStudentId != null ? String(state.pricingStudentId) : '';
  var currency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) ? CONSTANTS.PRICING.DEFAULT_CURRENCY : 'UAH';
  var current = pricingStudentId && typeof Sheets.getStudentPricing === 'function'
    ? Sheets.getStudentPricing(chatId, pricingStudentId)
    : (typeof Sheets.getCoachPricing === 'function' ? Sheets.getCoachPricing(chatId) : null);
  if (!current) {
    current = { pricePersonal: '', priceSplit: '', priceTrio: '', currency: currency };
  }
  if (pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL) current.pricePersonal = amount;
  else if (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT) current.priceSplit = amount;
  else current.priceTrio = amount;
  if (typeof Sheets.setPricing === 'function') {
    Sheets.setPricing(chatId, pricingStudentId, current);
  }
  State.clear(chatId);
  var typeName = pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'персональної' : (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'спліт' : 'тріо');
  Helpers.safeSend(chatId, '✅ Вартість ' + typeName + ' встановлено: ' + amount + ' ' + currency);
  showStudentsList_(chatId);
}

function showCoachPickList_(chatId) {
  try {
    var me = User.getByChatId(chatId);
    if (!me || me.role !== CONSTANTS.ROLES.COACH) {
      Helpers.safeSend(chatId, 'ℹ️ Функція доступна лише тренеру.');
      Menu.show(chatId);
      return;
    }
    var coaches = (typeof User !== 'undefined' && typeof User.getCoaches === 'function') ? User.getCoaches() : [];
    var keyboard = [];
    for (var i = 0; i < coaches.length; i++) {
      var c = coaches[i];
      if (!c || String(c.chatId) === String(chatId)) {
        continue;
      }
      var name = (c.firstName || '') + (c.lastName ? ' ' + c.lastName : '');
      keyboard.push([{ text: name || String(c.chatId), callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_PICK + ':' + c.chatId }]);
    }
    if (keyboard.length === 0) {
      Helpers.safeSend(chatId, 'ℹ️ Немає доступних тренерів для вибору.');
      Menu.show(chatId);
      return;
    }
    keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    Helpers.sendKeyboard(chatId, '👨‍🏫 Обери тренера зі списку:', keyboard);
  } catch (error) {
    Logger.log('showCoachPickList error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження списку тренерів.');
    Menu.show(chatId);
  }
}

function setCoachForUser_(chatId, coachId) {
  try {
    if (!coachId) {
      Helpers.safeSend(chatId, '⚠️ Тренера не знайдено.');
      Menu.show(chatId);
      return;
    }
    var coach = User.getByChatId(coachId);
    if (!coach || coach.role !== CONSTANTS.ROLES.COACH) {
      Helpers.safeSend(chatId, '⚠️ Тренера не знайдено.');
      Menu.show(chatId);
      return;
    }
    User.updateField(chatId, 'COACH_ID', String(coachId));
    Helpers.safeSend(chatId, '✅ Тренера обрано.');
    showCoachProfileForStudent_(chatId, coachId);
  } catch (error) {
    Logger.log('setCoachForUser error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка при виборі тренера.');
    Menu.show(chatId);
  }
}

function showCoachProfileForStudent_(chatId, coachIdFromParam) {
  try {
    var student = User.getByChatId(chatId);
    var coachId = coachIdFromParam || (student ? student.coachId : '');
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Registration.showCoachProfile', 'chatId=' + chatId + ' coachId=' + (coachId || ''));
      }
    } catch (elog) {}
    if (!coachId) {
      Helpers.safeSend(chatId, '⚠️ Тренера не знайдено.');
      Menu.show(chatId);
      return;
    }
    var coach = User.getByChatId(coachId);
    if (!coach) {
      Helpers.safeSend(chatId, '⚠️ Тренера не знайдено.');
      Menu.show(chatId);
      return;
    }
    var msg = "👨‍🏫 **Мій тренер**\n\n";
    msg += "Ім'я: " + (coach.firstName || '') + " " + (coach.lastName || '') + "\n";
    msg += "Місто: " + (coach.city || 'не вказано') + "\n";
    if (coach.instagram) {
      msg += "Instagram: " + coach.instagram + "\n";
    }
    var kb = [[{ text: '🔙 До меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
    Helpers.sendKeyboard(chatId, msg, kb);
  } catch (error) {
    Logger.log('Show coach profile error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження профілю тренера.');
    Menu.show(chatId);
  }
}

function getGoalText_(goal) {
  if (goal === CONSTANTS.GOALS.LOSE) return 'Схуднути';
  if (goal === CONSTANTS.GOALS.GAIN) return 'Набрати масу';
  if (goal === CONSTANTS.GOALS.KEEP) return 'Підтримувати форму';
  return 'не вказано';
}

// Fallback якщо User.parseUserDate / User.calculateAge відсутні
function parseDateFallback_(dateStr) {
  var parts = String(dateStr).split('.');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  var date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function calculateAgeFallback_(birthDate) {
  var now = new Date();
  var b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  var age = now.getFullYear() - b.getFullYear();
  var m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// Експорт для Router (GAS один глобальний namespace)
var Registration = {
  start: regStart_,
  handleCallback: regHandleCallback_,
  handleTextMessage: regHandleTextMessage_
};
