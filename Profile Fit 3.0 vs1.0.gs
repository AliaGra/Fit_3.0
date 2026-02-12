/**
 * Profile.gs - FSM Handler профілю
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Перегляд профілю
 * - Оновлення замірів тіла
 * - Редагування даних профілю
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку (це User.gs)
 * - Роботу з БД напряму (тільки через User)
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Обробка callback (натискання кнопок)
 *
 * @param {string|number} chatId
 * @param {string} action - callback_data
 * @param {Array} params - параметри (якщо є)
 */
function profileHandleCallback_(chatId, action, params) {
  if (action === CONSTANTS.CALLBACKS.PROFILE_VIEW) {
    showProfile_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS) {
    startMeasurementsUpdate_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA) {
    showEditMenu_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME) {
    askProfileFirstName_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME) {
    askProfileLastName_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY) {
    askProfileCity_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT) {
    askHeight_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE) {
    askProfileBirthDate_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.BACK_TO_PROFILE) {
    State.clear(chatId);
    showProfile_(chatId);
    return;
  }

  Logger.log('Profile: Unknown callback: ' + action);
}

/**
 * Обробка текстового введення
 *
 * @param {string|number} chatId
 * @param {string} text
 */
function profileHandleTextMessage_(chatId, text) {
  var state = State.get(chatId);
  if (!state || !state.step) {
    Logger.log('Profile: No state found');
    return;
  }

  var step = state.step;
  var v = CONSTANTS.VALIDATION;

  if (step === CONSTANTS.FSM_STATES.PROFILE_WEIGHT) {
    var weight = parseFloat(String(text).trim());
    if (isNaN(weight) || weight < v.WEIGHT_MIN || weight > v.WEIGHT_MAX) {
      Helpers.safeSend(chatId, "⚠️ Вага має бути від " + v.WEIGHT_MIN + " до " + v.WEIGHT_MAX + " кг.\n\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { weight: weight });
    askWaist_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_WAIST) {
    var waist = parseFloat(String(text).trim());
    if (isNaN(waist) || waist < v.WAIST_MIN || waist > v.WAIST_MAX) {
      Helpers.safeSend(chatId, "⚠️ Обхват талії має бути від " + v.WAIST_MIN + " до " + v.WAIST_MAX + " см.\n\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { waist: waist });
    askHip_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_HIP) {
    var hip = parseFloat(String(text).trim());
    if (isNaN(hip) || hip < v.HIP_MIN || hip > v.HIP_MAX) {
      Helpers.safeSend(chatId, "⚠️ Обхват стегна має бути від " + v.HIP_MIN + " до " + v.HIP_MAX + " см.\n\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { hip: hip });
    askGlutes_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_GLUTES) {
    var glutes = parseFloat(String(text).trim());
    if (isNaN(glutes) || glutes < v.GLUTES_MIN || glutes > v.GLUTES_MAX) {
      Helpers.safeSend(chatId, "⚠️ Обхват ягодиць має бути від " + v.GLUTES_MIN + " до " + v.GLUTES_MAX + " см.\n\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { glutes: glutes });
    askArm_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_ARM) {
    var arm = parseFloat(String(text).trim());
    if (isNaN(arm) || arm < v.ARM_MIN || arm > v.ARM_MAX) {
      Helpers.safeSend(chatId, "⚠️ Обхват руки має бути від " + v.ARM_MIN + " до " + v.ARM_MAX + " см.\n\nСпробуй ще раз:");
      return;
    }
    State.update(chatId, { arm: arm });
    saveMeasurements_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME) {
    var firstName = String(text).trim();
    if (firstName.length < v.NAME_MIN_LENGTH || firstName.length > v.NAME_MAX_LENGTH) {
      Helpers.safeSend(chatId, "⚠️ Ім'я має бути від " + v.NAME_MIN_LENGTH + " до " + v.NAME_MAX_LENGTH + " символів.\n\nСпробуй ще раз:");
      return;
    }
    try {
      User.updateField(chatId, 'FIRST_NAME', firstName);
      State.clear(chatId);
      Helpers.safeSend(chatId, "✅ Ім'я оновлено!");
      showProfile_(chatId);
    } catch (error) {
      Logger.log('Update firstName error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка оновлення.");
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME) {
    var lastName = String(text).trim();
    if (lastName.length < v.LASTNAME_MIN_LENGTH || lastName.length > v.LASTNAME_MAX_LENGTH) {
      Helpers.safeSend(chatId, "⚠️ Прізвище має бути від " + v.LASTNAME_MIN_LENGTH + " до " + v.LASTNAME_MAX_LENGTH + " символів.\n\nСпробуй ще раз:");
      return;
    }
    try {
      User.updateField(chatId, 'LAST_NAME', lastName);
      State.clear(chatId);
      Helpers.safeSend(chatId, "✅ Прізвище оновлено!");
      showProfile_(chatId);
    } catch (error) {
      Logger.log('Update lastName error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка оновлення.");
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_CITY) {
    var city = String(text).trim();
    if (city.length < v.CITY_MIN_LENGTH || city.length > v.CITY_MAX_LENGTH) {
      Helpers.safeSend(chatId, "⚠️ Назва міста має бути від " + v.CITY_MIN_LENGTH + " до " + v.CITY_MAX_LENGTH + " символів.\n\nСпробуй ще раз:");
      return;
    }
    try {
      User.updateField(chatId, 'CITY', city);
      State.clear(chatId);
      Helpers.safeSend(chatId, "✅ Місто оновлено!");
      showProfile_(chatId);
    } catch (error) {
      Logger.log('Update city error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка оновлення.");
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT) {
    var height = parseFloat(String(text).trim());
    if (isNaN(height) || height < v.HEIGHT_MIN || height > v.HEIGHT_MAX) {
      Helpers.safeSend(chatId, "⚠️ Зріст має бути від " + v.HEIGHT_MIN + " до " + v.HEIGHT_MAX + " см.\n\nСпробуй ще раз:");
      return;
    }
    try {
      User.updateField(chatId, 'HEIGHT', height);
      State.clear(chatId);
      Helpers.safeSend(chatId, "✅ Зріст оновлено!");
      showProfile_(chatId);
    } catch (error) {
      Logger.log('Update height error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка оновлення.");
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE) {
    var dateText = String(text).trim();
    var datePattern = CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.INPUT_DATE_PATTERN ? CONSTANTS.DATE_FORMATS.INPUT_DATE_PATTERN : /^\d{2}\.\d{2}\.\d{4}$/;
    if (!datePattern.test(dateText)) {
      Helpers.safeSend(chatId, "⚠️ Невірний формат дати.\n\nОчікується: ДД.ММ.РРРР\nПриклад: 15.05.1995\n\nСпробуй ще раз:");
      return;
    }
    var birthDate = (typeof User !== 'undefined' && typeof User.parseUserDate === 'function') ? User.parseUserDate(dateText) : parseDateFallback_(dateText);
    if (!birthDate) {
      Helpers.safeSend(chatId, "⚠️ Некоректна дата.\n\nСпробуй ще раз:");
      return;
    }
    var age = (typeof User !== 'undefined' && typeof User.calculateAge === 'function') ? User.calculateAge(birthDate) : calculateAgeFallback_(birthDate);
    if (age < 12 || age > 100) {
      Helpers.safeSend(chatId, "⚠️ Вік має бути від 12 до 100 років.\n\nСпробуй ще раз:");
      return;
    }
    try {
      User.updateField(chatId, 'BIRTH_DATE', birthDate);
      State.clear(chatId);
      Helpers.safeSend(chatId, "✅ Дату народження оновлено!");
      showProfile_(chatId);
    } catch (error) {
      Logger.log('Update birthDate error: ' + error.message);
      Helpers.safeSend(chatId, "❌ Помилка оновлення.");
    }
    return;
  }

  Logger.log('Profile: Unknown state: ' + step);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ПЕРЕГЛЯД
// ═══════════════════════════════════════════════════════════

function showProfile_(chatId) {
  try {
    var user = User.getByChatId(chatId);
    if (!user) {
      Helpers.safeSend(chatId, "❌ Профіль не знайдено.");
      return;
    }
    var message = (typeof Menu !== 'undefined' && typeof Menu.formatProfileMessage === 'function') ? Menu.formatProfileMessage(user) : formatProfileMessageFallback_(user);
    var keyboard = [
      [{ text: '📊 Оновити заміри', callback_data: CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS }],
      [{ text: '✏️ Редагувати дані', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA }],
      [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showProfile error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Помилка завантаження профілю.");
  }
}

function showEditMenu_(chatId) {
  var keyboard = (typeof Menu !== 'undefined' && typeof Menu.buildProfileEditKeyboard === 'function') ? Menu.buildProfileEditKeyboard() : buildProfileEditKeyboardFallback_();
  Helpers.sendKeyboard(chatId, "✏️ **Що хочеш змінити?**", keyboard, { parse_mode: 'Markdown' });
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ОНОВЛЕННЯ ЗАМІРІВ (FSM)
// ═══════════════════════════════════════════════════════════

function startMeasurementsUpdate_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WEIGHT });
  Helpers.safeSend(chatId, "📊 **Оновлення замірів**\n\nВведи свою поточну вагу (в кг):\n\nПриклад: 72", { parse_mode: 'Markdown' });
}

function askWaist_(chatId) {
  State.setStep(chatId, CONSTANTS.FSM_STATES.PROFILE_WAIST);
  Helpers.safeSend(chatId, "⭕ Введи обхват талії (в см):\n\nПриклад: 72");
}

function askHip_(chatId) {
  State.setStep(chatId, CONSTANTS.FSM_STATES.PROFILE_HIP);
  Helpers.safeSend(chatId, "⭕ Введи обхват стегна (в см):\n\nВимірюй найширшу частину.\nПриклад: 95");
}

function askGlutes_(chatId) {
  State.setStep(chatId, CONSTANTS.FSM_STATES.PROFILE_GLUTES);
  Helpers.safeSend(chatId, "⭕ Введи обхват ягодиць (в см):\n\nПриклад: 98");
}

function askArm_(chatId) {
  State.setStep(chatId, CONSTANTS.FSM_STATES.PROFILE_ARM);
  Helpers.safeSend(chatId, "💪 Введи обхват руки (біцепс, в см):\n\nПриклад: 32");
}

function saveMeasurements_(chatId) {
  try {
    var stateData = State.getData(chatId);
    var measurements = {
      weight: stateData.weight,
      waist: stateData.waist,
      hip: stateData.hip,
      glutes: stateData.glutes,
      arm: stateData.arm
    };
    User.updateMeasurements(chatId, measurements);
    State.clear(chatId);
    Helpers.safeSend(chatId,
      "✅ **Заміри оновлено!**\n\n" +
      "⚖️ Вага: " + measurements.weight + " кг\n" +
      "⭕ Талія: " + measurements.waist + " см\n" +
      "⭕ Стегно: " + measurements.hip + " см\n" +
      "⭕ Ягодиці: " + measurements.glutes + " см\n" +
      "💪 Рука: " + measurements.arm + " см",
      { parse_mode: 'Markdown' }
    );
    showProfile_(chatId);
  } catch (error) {
    Logger.log('saveMeasurements error: ' + error.message);
    State.clear(chatId);
    Helpers.safeSend(chatId, "❌ Помилка збереження замірів.\nСпробуй ще раз.");
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - РЕДАГУВАННЯ ПОЛІВ (FSM)
// ═══════════════════════════════════════════════════════════

function askProfileFirstName_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME });
  Helpers.safeSend(chatId, "✏️ Введи нове ім'я:");
}

function askProfileLastName_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME });
  Helpers.safeSend(chatId, "✏️ Введи нове прізвище:");
}

function askProfileCity_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_CITY });
  Helpers.safeSend(chatId, "🏙️ Введи нове місто:");
}

function askHeight_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT });
  Helpers.safeSend(chatId, "📏 Введи новий зріст (в см):\n\nПриклад: 175");
}

function askProfileBirthDate_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE });
  Helpers.safeSend(chatId, "📅 Введи нову дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: 15.05.1995");
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ІСТОРІЯ ЗАМІРІВ (через User)
// ═══════════════════════════════════════════════════════════

function showMeasurementsHistory_(chatId, limit) {
  limit = limit != null ? limit : 5;
  try {
    var history = (typeof User !== 'undefined' && typeof User.getMeasurementsHistory === 'function') ? User.getMeasurementsHistory(chatId, limit) : [];
    if (history.length === 0) {
      Helpers.safeSend(chatId, "📊 Історія замірів порожня.");
      return;
    }
    var formatDateFn = (typeof Helpers !== 'undefined' && typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu !== 'undefined' && typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
    var message = "📊 **Історія замірів:**\n\n";
    var i;
    for (i = 0; i < history.length; i++) {
      var record = history[i];
      var dateStr = formatDateFn(record.date);
      message += "**" + (i + 1) + ". " + dateStr + "**\n";
      message += "⚖️ Вага: " + (record.weight != null ? record.weight : '-') + " кг\n";
      message += "⭕ Талія: " + (record.waist != null ? record.waist : '-') + " см\n";
      message += "⭕ Стегно: " + (record.hip != null ? record.hip : '-') + " см\n";
      message += "⭕ Ягодиці: " + (record.glutes != null ? record.glutes : '-') + " см\n";
      message += "💪 Рука: " + (record.arm != null ? record.arm : '-') + " см\n\n";
    }
    var keyboard = [[{ text: '🔙 Назад до профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]];
    Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showMeasurementsHistory error: ' + error.message);
    Helpers.safeSend(chatId, "❌ Помилка завантаження історії.");
  }
}

// ═══════════════════════════════════════════════════════════
// FALLBACKS (якщо Menu/User не мають функцій)
// ═══════════════════════════════════════════════════════════

function formatProfileMessageFallback_(user) {
  var msg = "👤 **Профіль**\n\n";
  msg += "Ім'я: " + (user.firstName || '') + " " + (user.lastName || '') + "\n";
  msg += "Місто: " + (user.city || 'не вказано') + "\n";
  msg += "Зріст: " + (user.height != null ? user.height + " см" : "не вказано") + "\n";
  msg += "Вага: " + (user.weight != null ? user.weight + " кг" : "не вказано") + "\n";
  msg += "Вік: " + (user.age != null ? user.age + " років" : "не вказано") + "\n";
  return msg;
}

function buildProfileEditKeyboardFallback_() {
  return [
    [{ text: "✏️ Ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }],
    [{ text: "✏️ Прізвище", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME }],
    [{ text: "🏙️ Місто", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }],
    [{ text: "📏 Зріст", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT }],
    [{ text: "📅 Дата народження", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE }],
    [{ text: "🔙 Назад", callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
  ];
}

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
var Profile = {
  handleCallback: profileHandleCallback_,
  handleTextMessage: profileHandleTextMessage_
};
