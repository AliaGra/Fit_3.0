/**
 * Menu.gs - Генератор меню та клавіатур
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Генерація головних меню (coach/student)
 * - Створення inline клавіатур
 * - Навігаційні кнопки
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - FSM переходів
 * - Обробки callback
 */

// Текст кнопки "Назад" (якщо немає UI.BUTTONS)
var BACK_BUTTON_TEXT = (typeof CONSTANTS !== 'undefined' && CONSTANTS.EMOJI && CONSTANTS.EMOJI.BACK)
  ? CONSTANTS.EMOJI.BACK + ' Назад'
  : '🔙 Назад';
var CANCEL_BUTTON_TEXT = (typeof CONSTANTS !== 'undefined' && CONSTANTS.EMOJI && CONSTANTS.EMOJI.CANCEL)
  ? CONSTANTS.EMOJI.CANCEL + ' Скасувати'
  : '❌ Скасувати';

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Показати головне меню
 * Визначає роль користувача та показує відповідне меню.
 * КРИТИЧНО: Очищає State перед показом.
 *
 * @param {string|number} chatId
 */
function show(chatId) {
  try {
    State.clear(chatId);

    var user = User.getByChatId(chatId);
    if (!user) {
      Logger.log('Menu.show: User not found ' + chatId + ' → запуск реєстрації');
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Menu.show', 'user not found → Registration.start');
        }
      } catch (e0) {}
      Registration.start(chatId, { force: true });
      return;
    }

    if (user.role === CONSTANTS.ROLES.COACH) {
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Menu.show', 'show coach menu');
        }
      } catch (e1) {}
      showCoachMenu_(chatId, user);
    } else if (user.role === CONSTANTS.ROLES.STUDENT) {
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Menu.show', 'show student menu');
        }
      } catch (e2) {}
      showStudentMenu_(chatId, user);
    } else {
      Logger.log('Menu.show: Unknown role ' + user.role);
      Helpers.safeSend(chatId, "❌ Невідома роль користувача.\nПочни спочатку: /start");
    }
  } catch (error) {
    Logger.log('Menu.show error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Помилка завантаження меню.\nСпробуй ще раз: /start");
  }
}

/**
 * Створити inline клавіатуру з масиву рядів кнопок
 *
 * @param {Array<Array<Object>>} rows - Масив рядів кнопок
 * @returns {Array<Array<Object>>}
 */
function menuBuildInlineKeyboard_(rows) {
  return rows;
}

/**
 * Додати кнопку "Назад до меню"
 *
 * @param {Array<Array<Object>>} keyboard - Існуюча клавіатура
 * @returns {Array<Array<Object>>}
 */
function addBackToMainButton(keyboard) {
  var result = [];
  var i;
  for (i = 0; i < keyboard.length; i++) {
    result.push(keyboard[i]);
  }
  result.push([{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  return result;
}

/**
 * Додати кнопку "Скасувати"
 *
 * @param {Array<Array<Object>>} keyboard
 * @returns {Array<Array<Object>>}
 */
function addCancelButton(keyboard) {
  var result = [];
  var i;
  for (i = 0; i < keyboard.length; i++) {
    result.push(keyboard[i]);
  }
  result.push([{ text: CANCEL_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  return result;
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - COACH MENU
// ═══════════════════════════════════════════════════════════

function showCoachMenu_(chatId, user) {
  var firstName = user.firstName || 'Тренере';
  var coachId = user.coachId || '';
  var coachButton = coachId
    ? { text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE + ':' + coachId }
    : { text: '👨‍🏫 Обрати тренера', callback_data: CONSTANTS.CALLBACKS.COACH_PICK_START };
  var keyboard = [
    [{ text: '👤 Профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: '💪 Самостійне тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '💪 Тренування учнів', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_START }],
    [{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }],
    [{ text: '📅 Розклад тренувань', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '📈 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [coachButton],
    [{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]
  ];
  Helpers.sendKeyboard(chatId, "👋 Привіт, " + firstName + "!\n\n🏋️ Головне меню тренера:", keyboard);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - STUDENT MENU
// ═══════════════════════════════════════════════════════════

function showStudentMenu_(chatId, user) {
  var firstName = user.firstName || 'Учне';
  var coachId = user.coachId || '';
  var coachProfileCb = coachId
    ? (CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE + ':' + coachId)
    : CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE;
  var keyboard = [
    [{ text: '👤 Профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '📅 Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }],
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }],
    [{ text: '👨‍🏫 Мій тренер', callback_data: coachProfileCb }],
    [{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]
  ];
  Helpers.sendKeyboard(chatId, "👋 Привіт, " + firstName + "!\n\n🏃 Головне меню учня:", keyboard);
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD BUILDERS
// ═══════════════════════════════════════════════════════════

function buildRoleKeyboard() {
  return [
    [{ text: '🎓 Учень', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_STUDENT }],
    [{ text: '💪 Тренер', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_COACH }]
  ];
}

function buildGenderKeyboard() {
  return [
    [{ text: '👨 Чоловік', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_MALE }],
    [{ text: '👩 Жінка', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_FEMALE }]
  ];
}

function buildGoalKeyboard() {
  return [
    [{ text: '📉 Схуднути', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_LOSE }],
    [{ text: '📈 Набрати масу', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_GAIN }],
    [{ text: '⚖️ Підтримувати форму', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_KEEP }]
  ];
}

function buildCityKeyboard(cities) {
  var keyboard = [];
  var i;
  for (i = 0; i < cities.length; i += 2) {
    var row = [{ text: cities[i], callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i] }];
    if (i + 1 < cities.length) {
      row.push({ text: cities[i + 1], callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i + 1] });
    }
    keyboard.push(row);
  }
  return keyboard;
}

function buildMuscleGroupKeyboard(groups) {
  var keyboard = [];
  var i;
  for (i = 0; i < groups.length; i++) {
    keyboard.push([{ text: groups[i], callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP + ':' + groups[i] }]);
  }
  keyboard.push([{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  return keyboard;
}

function buildExerciseKeyboard(exercises, groupName) {
  var keyboard = [];
  var i;
  for (i = 0; i < exercises.length; i++) {
    keyboard.push([{ text: exercises[i].exerciseName, callback_data: CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':' + exercises[i].id }]);
  }
  keyboard.push([{ text: "🔙 До груп м'язів", callback_data: CONSTANTS.CALLBACKS.TRAINING_START }]);
  return keyboard;
}

function buildHistoryFiltersKeyboard() {
  return [
    [{ text: '📝 Поточне тренування', callback_data: CONSTANTS.CALLBACKS.HISTORY_CURRENT }],
    [{ text: '⏮️ Попереднє тренування', callback_data: CONSTANTS.CALLBACKS.HISTORY_PREVIOUS }],
    [{ text: "📋 Всі тренування", callback_data: CONSTANTS.CALLBACKS.HISTORY_ALL }],
    [{ text: "🎯 За групою м'язів", callback_data: CONSTANTS.CALLBACKS.HISTORY_BY_GROUP }],
    [{ text: '💪 За вправою', callback_data: CONSTANTS.CALLBACKS.HISTORY_BY_EXERCISE }],
    [{ text: '📈 Прогрес по вправі', callback_data: CONSTANTS.CALLBACKS.HISTORY_PROGRESS }],
    [{ text: '🔢 Останні N тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_LAST_N }],
    [{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

function buildHistorySubfiltersKeyboard() {
  return [
    [{ text: '📝 Поточне тренування', callback_data: CONSTANTS.CALLBACKS.HISTORY_CURRENT }],
    [{ text: '⏮️ Попереднє тренування', callback_data: CONSTANTS.CALLBACKS.HISTORY_PREVIOUS }],
    [{ text: '🔢 Останні N тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_LAST_N }],
    [{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]
  ];
}

function buildTrainingModeKeyboard() {
  return [
    [{ text: '💪 Одинарна вправа', callback_data: CONSTANTS.CALLBACKS.TRAINING_MODE_SINGLE }],
    [{ text: '🔄 Круговий сет', callback_data: CONSTANTS.CALLBACKS.TRAINING_MODE_CIRCUIT }],
    [{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

function buildFinishTrainingKeyboard() {
  return [
    [{ text: '✅ Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }],
    [{ text: '➕ Додати ще вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '🔙 До меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

function buildProfileEditKeyboard() {
  return [
    [{ text: "✏️ Змінити ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }],
    [{ text: '✏️ Змінити прізвище', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME }],
    [{ text: '🏙️ Змінити місто', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }],
    [{ text: '📏 Змінити зріст', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT }],
    [{ text: '📅 Змінити дату народження', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE }],
    [{ text: BACK_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
  ];
}

// ═══════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════

function formatProfileMessage(user) {
  var message = '👤 **Твій профіль**\n\n';
  message += "Ім'я: " + (user.firstName || '') + ' ' + (user.lastName || '') + '\n';
  message += 'Роль: ' + (user.role === CONSTANTS.ROLES.COACH ? 'Тренер 💪' : 'Учень 🎓') + '\n';
  message += 'Місто: ' + (user.city || 'не вказано') + '\n';

  if (user.gender) {
    message += 'Стать: ' + (user.gender === CONSTANTS.GENDERS.MALE ? 'Чоловік' : 'Жінка') + '\n';
  }
  if (user.age) {
    message += 'Вік: ' + user.age + ' років\n';
  }
  if (user.goal) {
    message += 'Мета: ' + formatGoal(user.goal) + '\n';
  }

  if (user.height || user.weight || user.waist || user.hip || user.glutes || user.arm) {
    message += '\n📊 **Параметри:**\n';
    if (user.height) message += '📏 Зріст: ' + user.height + ' см\n';
    if (user.weight) message += '⚖️ Вага: ' + user.weight + ' кг\n';
    if (user.waist) message += '⭕ Талія: ' + user.waist + ' см\n';
    if (user.hip) message += '⭕ Стегно: ' + user.hip + ' см\n';
    if (user.glutes) message += '⭕ Ягодиці: ' + user.glutes + ' см\n';
    if (user.arm) message += '💪 Рука: ' + user.arm + ' см\n';
  }

  if (user.role === CONSTANTS.ROLES.COACH) {
    message += '\n📋 **Додатково:**\n';
    if (user.instagram) message += '📸 Instagram: ' + user.instagram + '\n';
    if (user.calendarId) message += '📆 Calendar: ' + user.calendarId + '\n';
  }

  return message;
}

function formatGoal(goal) {
  if (goal === CONSTANTS.GOALS.LOSE) return '📉 Схуднути';
  if (goal === CONSTANTS.GOALS.GAIN) return '📈 Набрати масу';
  if (goal === CONSTANTS.GOALS.KEEP) return '⚖️ Підтримувати форму';
  return 'не вказано';
}

function menuFormatDate_(date) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  var day = ('0' + date.getDate()).slice(-2);
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var year = date.getFullYear();
  return day + '.' + month + '.' + year;
}

function menuFormatDateTime_(date) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  var dateStr = menuFormatDate_(date);
  var hours = ('0' + date.getHours()).slice(-2);
  var minutes = ('0' + date.getMinutes()).slice(-2);
  return dateStr + ' ' + hours + ':' + minutes;
}

// ═══════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════

function isValidKeyboard(keyboard) {
  if (!keyboard || !(keyboard instanceof Array)) {
    return false;
  }
  if (keyboard.length === 0) {
    return false;
  }
  for (var i = 0; i < keyboard.length; i++) {
    if (!(keyboard[i] instanceof Array) || keyboard[i].length === 0) {
      return false;
    }
  }
  return true;
}

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

// Експорт для Router та Audit (GAS один глобальний namespace)
var Menu = {
  show: show,
  buildInlineKeyboard: menuBuildInlineKeyboard_,
  formatProfileMessage: formatProfileMessage
};
