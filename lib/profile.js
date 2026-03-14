/**
 * Profile — перегляд профілю, оновлення замірів, редагування даних (ім'я, прізвище, місто, зріст, дата народження, зони акценту та уникнення)
 */
const { CONSTANTS, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function formatProfileMessage(user) {
  let msg = '👤 Профіль\n\n';
  msg += "Ім'я: " + (user.firstName || '') + ' ' + (user.lastName || '') + '\n';
  msg += 'Місто: ' + (user.city || 'не вказано') + '\n';
  msg += 'Зріст: ' + (user.height != null ? user.height + ' см' : 'не вказано') + '\n';
  msg += 'Вага: ' + (user.weight != null ? user.weight + ' кг' : 'не вказано') + '\n';
  msg += 'Вік: ' + (user.age != null ? user.age + ' років' : 'не вказано') + '\n';
  if (user.waist != null || user.hip != null || user.glutes != null || user.arm != null) {
    msg += '\nЗаміри: ';
    const parts = [];
    if (user.waist != null) parts.push('талія ' + user.waist + ' см');
    if (user.hip != null) parts.push('стегно ' + user.hip + ' см');
    if (user.glutes != null) parts.push('ягодиці ' + user.glutes + ' см');
    if (user.arm != null) parts.push('рука ' + user.arm + ' см');
    msg += parts.length ? parts.join(', ') + '\n' : '—\n';
  }
  const az = user.accentZones;
  const av = user.avoidZones;
  if (Array.isArray(az) && az.length > 0) {
    const labels = az.map((z) => (ACCENT_LABELS && ACCENT_LABELS[z]) || z);
    msg += '\nАкцент: ' + (az.includes('full') ? 'все рівномірно' : labels.join(', ')) + '\n';
  }
  if (Array.isArray(av) && av.length > 0) {
    const labels = av.map((z) => (ACCENT_LABELS && ACCENT_LABELS[z]) || z);
    msg += 'Не розвиваємо: ' + labels.join(', ') + '\n';
  }
  return msg;
}

async function show(chatId) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) {
      await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
      return;
    }
    const message = formatProfileMessage(user);
    const keyboard = [
      [{ text: '📊 Оновити заміри', callback_data: CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS }],
      [{ text: '✏️ Редагувати дані', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA }]
    ];
    if (user.role === CONSTANTS.ROLES.COACH) {
      keyboard.push([{ text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_PRICING }]);
    }
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    await Helpers.sendKeyboard(chatId, message, keyboard);
  } catch (err) {
    console.error('Profile.show', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження профілю.');
  }
}

function buildEditKeyboard() {
  return [
    [{ text: "✏️ Ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }],
    [{ text: '✏️ Прізвище', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME }],
    [{ text: '🏙️ Місто', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }],
    [{ text: '📏 Зріст', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT }],
    [{ text: '📅 Дата народження', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE }],
    [{ text: '🎯 Зони акценту та уникнення', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_ACCENT }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
  ];
}

async function showEditMenu(chatId) {
  await Helpers.sendKeyboard(chatId, '✏️ Що хочеш змінити?', buildEditKeyboard());
}

async function showProfileAccentZones(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT });
  const state = await State.get(chatId);
  const accentZones = state?.profileAccentZones || [];
  const keyboard = [];
  const row = [];
  for (const zone of ACCENT_ZONES_ORDER) {
    const label = (ACCENT_LABELS[zone] || zone) + (accentZones.includes(zone) ? ' ✓' : '');
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_TGL + ':' + zone });
    if (row.length >= 3) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_BCK }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_NXT }]);
  await Helpers.sendKeyboard(chatId, '🎯 На що робимо акцент? Обери 1–2 зони (або «Все рівномірно»).', keyboard);
}

async function showProfileAvoidZones(chatId) {
  const state = await State.get(chatId);
  const accentZones = state?.profileAccentZones || [];
  const avoidZones = state?.profileAvoidZones || [];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT });
  const keyboard = [];
  for (const zone of AVOID_ZONES_ORDER) {
    if (accentZones.includes(zone)) continue;
    const label = (ACCENT_LABELS[zone] || zone) + (avoidZones.includes(zone) ? ' ✓' : '');
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_TGL + ':' + zone }]);
  }
  keyboard.push([{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_SKP }, { text: '→ Зберегти', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_NXT }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_BCK }]);
  await Helpers.sendKeyboard(chatId, 'Є зони, які НЕ розвиваємо або мінімізуємо? (необов\'язково)', keyboard);
}

// ─── Оновлення замірів (FSM) ─────────────────────────────────────────────────

async function startMeasurementsUpdate(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WEIGHT });
  await Helpers.safeSend(chatId, '📊 Оновлення замірів\n\nВведи свою поточну вагу (в кг):\n\nПриклад: 72');
}

async function askWaist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WAIST });
  await Helpers.safeSend(chatId, '⭕ Введи обхват талії (в см):\n\nПриклад: 72');
}

async function askHip(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_HIP });
  await Helpers.safeSend(chatId, '⭕ Введи обхват стегна (в см):\n\nВимірюй найширшу частину.\nПриклад: 95');
}

async function askGlutes(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GLUTES });
  await Helpers.safeSend(chatId, '⭕ Введи обхват ягодиць (в см):\n\nПриклад: 98');
}

async function askArm(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ARM });
  await Helpers.safeSend(chatId, '💪 Введи обхват руки (біцепс, в см):\n\nПриклад: 32');
}

async function saveMeasurements(chatId) {
  try {
    const stateData = await State.get(chatId);
    const measurements = {
      weight: stateData.weight,
      waist: stateData.waist,
      hip: stateData.hip,
      glutes: stateData.glutes,
      arm: stateData.arm
    };
    await User.updateMeasurements(chatId, measurements);
    await State.clear(chatId);
    await Helpers.safeSend(chatId,
      '✅ Заміри оновлено!\n\n' +
      '⚖️ Вага: ' + measurements.weight + ' кг\n' +
      '⭕ Талія: ' + measurements.waist + ' см\n' +
      '⭕ Стегно: ' + measurements.hip + ' см\n' +
      '⭕ Ягодиці: ' + measurements.glutes + ' см\n' +
      '💪 Рука: ' + measurements.arm + ' см'
    );
    await show(chatId);
  } catch (err) {
    console.error('Profile.saveMeasurements', err.message);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Помилка збереження замірів. Спробуй ще раз.');
  }
}

// ─── Редагування полів (FSM) ─────────────────────────────────────────────────

async function askProfileFirstName(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME });
  await Helpers.safeSend(chatId, "✏️ Введи нове ім'я:");
}

async function askProfileLastName(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME });
  await Helpers.safeSend(chatId, '✏️ Введи нове прізвище:');
}

async function askProfileCity(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_CITY });
  await Helpers.safeSend(chatId, '🏙️ Введи нове місто:');
}

async function askHeight(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT });
  await Helpers.safeSend(chatId, '📏 Введи новий зріст (в см):\n\nПриклад: 175');
}

async function askProfileBirthDate(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE });
  await Helpers.safeSend(chatId, '📅 Введи нову дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: 15.05.1995');
}

// ─── Handle callback ─────────────────────────────────────────────────────────

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const action = String(callbackData).split(':')[0].trim();

  if (action === CONSTANTS.CALLBACKS.PROFILE_VIEW) {
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS) {
    await startMeasurementsUpdate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA) {
    await showEditMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME) {
    await askProfileFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME) {
    await askProfileLastName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY) {
    await askProfileCity(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT) {
    await askHeight(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE) {
    await askProfileBirthDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_ACCENT) {
    const user = await User.getByChatId(chatId);
    const accentZones = user && Array.isArray(user.accentZones) ? user.accentZones : [];
    const avoidZones = user && Array.isArray(user.avoidZones) ? user.avoidZones : [];
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT, profileAccentZones: accentZones, profileAvoidZones: avoidZones });
    await showProfileAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT) return false;
    const zone = (param || '').trim();
    let accentZones = [...(state.profileAccentZones || [])];
    if (zone === 'full') accentZones = ['full'];
    else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) accentZones = accentZones.filter((z) => z !== zone);
      else if (accentZones.length < 2) accentZones.push(zone);
    }
    await State.update(chatId, { profileAccentZones: accentZones });
    await showProfileAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT) return false;
    const accentZones = state.profileAccentZones || [];
    if (!accentZones.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б одну зону або «Все рівномірно».');
      await showProfileAccentZones(chatId);
      return true;
    }
    await showProfileAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_BCK) {
    await State.clear(chatId);
    await showEditMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT) return false;
    const zone = (param || '').trim();
    let avoidZones = [...(state.profileAvoidZones || [])];
    if (avoidZones.includes(zone)) avoidZones = avoidZones.filter((z) => z !== zone);
    else avoidZones.push(zone);
    await State.update(chatId, { profileAvoidZones: avoidZones });
    await showProfileAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_SKP || action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT) return false;
    const accentZones = state.profileAccentZones || [];
    const avoidZones = state.profileAvoidZones || [];
    const toSaveAccent = accentZones.length > 0 ? accentZones : ['full'];
    await supabase.updateUser(chatId, { accentZones: toSaveAccent, avoidZones: Array.isArray(avoidZones) ? avoidZones : [] });
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '✅ Зони акценту та уникнення збережено.');
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_BCK) {
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT });
    await showProfileAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BACK_TO_PROFILE) {
    await State.clear(chatId);
    await show(chatId);
    return true;
  }
  return false;
}

// ─── Handle text (profile FSM steps) ──────────────────────────────────────────

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
  const v = CONSTANTS.VALIDATION || {};

  if (step === CONSTANTS.FSM_STATES.PROFILE_WEIGHT) {
    const weight = parseFloat(String(text).trim());
    const min = v.WEIGHT_MIN != null ? v.WEIGHT_MIN : 30;
    const max = v.WEIGHT_MAX != null ? v.WEIGHT_MAX : 300;
    if (isNaN(weight) || weight < min || weight > max) {
      await Helpers.safeSend(chatId, '⚠️ Вага має бути від ' + min + ' до ' + max + ' кг.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { weight });
    await askWaist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_WAIST) {
    const waist = parseFloat(String(text).trim());
    const min = v.WAIST_MIN != null ? v.WAIST_MIN : 40;
    const max = v.WAIST_MAX != null ? v.WAIST_MAX : 200;
    if (isNaN(waist) || waist < min || waist > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват талії має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { waist });
    await askHip(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_HIP) {
    const hip = parseFloat(String(text).trim());
    const min = v.HIP_MIN != null ? v.HIP_MIN : 40;
    const max = v.HIP_MAX != null ? v.HIP_MAX : 200;
    if (isNaN(hip) || hip < min || hip > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват стегна має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { hip });
    await askGlutes(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GLUTES) {
    const glutes = parseFloat(String(text).trim());
    const min = v.GLUTES_MIN != null ? v.GLUTES_MIN : 40;
    const max = v.GLUTES_MAX != null ? v.GLUTES_MAX : 200;
    if (isNaN(glutes) || glutes < min || glutes > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват ягодиць має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { glutes });
    await askArm(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_ARM) {
    const arm = parseFloat(String(text).trim());
    const min = v.ARM_MIN != null ? v.ARM_MIN : 15;
    const max = v.ARM_MAX != null ? v.ARM_MAX : 80;
    if (isNaN(arm) || arm < min || arm > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват руки має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { arm });
    await saveMeasurements(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME) {
    const firstName = String(text).trim();
    const minLen = v.NAME_MIN_LENGTH != null ? v.NAME_MIN_LENGTH : 2;
    const maxLen = v.NAME_MAX_LENGTH != null ? v.NAME_MAX_LENGTH : 30;
    if (firstName.length < minLen || firstName.length > maxLen) {
      await Helpers.safeSend(chatId, "⚠️ Ім'я має бути від " + minLen + ' до ' + maxLen + " символів.\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.updateField(chatId, 'FIRST_NAME', firstName);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, "✅ Ім'я оновлено!");
      await show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME) {
    const lastName = String(text).trim();
    const minLen = v.LASTNAME_MIN_LENGTH != null ? v.LASTNAME_MIN_LENGTH : 2;
    const maxLen = v.LASTNAME_MAX_LENGTH != null ? v.LASTNAME_MAX_LENGTH : 50;
    if (lastName.length < minLen || lastName.length > maxLen) {
      await Helpers.safeSend(chatId, "⚠️ Прізвище має бути від " + minLen + ' до ' + maxLen + " символів.\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.updateField(chatId, 'LAST_NAME', lastName);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Прізвище оновлено!');
      await show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_CITY) {
    const city = String(text).trim();
    const minLen = v.CITY_MIN_LENGTH != null ? v.CITY_MIN_LENGTH : 2;
    const maxLen = v.CITY_MAX_LENGTH != null ? v.CITY_MAX_LENGTH : 50;
    if (city.length < minLen || city.length > maxLen) {
      await Helpers.safeSend(chatId, '⚠️ Назва міста має бути від ' + minLen + ' до ' + maxLen + " символів.\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.updateField(chatId, 'CITY', city);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Місто оновлено!');
      await show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT) {
    const height = parseFloat(String(text).trim());
    const min = v.HEIGHT_MIN != null ? v.HEIGHT_MIN : 100;
    const max = v.HEIGHT_MAX != null ? v.HEIGHT_MAX : 250;
    if (isNaN(height) || height < min || height > max) {
      await Helpers.safeSend(chatId, '⚠️ Зріст має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    try {
      await User.updateField(chatId, 'HEIGHT', height);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Зріст оновлено!');
      await show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE) {
    const dateText = String(text).trim();
    const datePattern = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.INPUT_PATTERN) ? CONSTANTS.DATE_FORMATS.INPUT_PATTERN : /^\d{2}\.\d{2}\.\d{4}$/;
    if (!datePattern.test(dateText)) {
      const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) ? CONSTANTS.DATE_FORMATS.EXAMPLE : '15.05.1995';
      await Helpers.safeSend(chatId, '⚠️ Невірний формат дати.\n\nОчікується: ДД.ММ.РРРР\nПриклад: ' + ex + '\n\nСпробуй ще раз:');
      return true;
    }
    const birthDate = User.parseBirthDate(dateText);
    if (!birthDate) {
      await Helpers.safeSend(chatId, '⚠️ Некоректна дата.\n\nСпробуй ще раз:');
      return true;
    }
    const age = User.calculateAge(birthDate);
    const ageMin = v.AGE_MIN != null ? v.AGE_MIN : 12;
    const ageMax = v.AGE_MAX != null ? v.AGE_MAX : 100;
    if (age < ageMin || age > ageMax) {
      await Helpers.safeSend(chatId, '⚠️ Вік має бути від ' + ageMin + ' до ' + ageMax + ' років.\n\nСпробуй ще раз:');
      return true;
    }
    try {
      await User.updateField(chatId, 'BIRTH_DATE', birthDate);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Дату народження оновлено!');
      await show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  return false;
}

module.exports = { show, showEditMenu, handleCallback, handleTextMessage, formatProfileMessage };
