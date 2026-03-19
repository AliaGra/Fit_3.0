/**
 * Profile — перегляд профілю, оновлення замірів, редагування даних (ім'я, прізвище, місто, зріст, дата народження, зони акценту та уникнення)
 */
const { CONSTANTS, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const { getActivityLevelLabelUA } = require('./activityProfile');

function formatProfileMessage(user) {
  let msg = '👤 Профіль\n\n';
  msg += "Ім'я: " + (user.firstName || '') + ' ' + (user.lastName || '') + '\n';
  msg += 'Місто: ' + (user.city || 'не вказано') + '\n';
  msg += 'Зріст: ' + (user.height != null ? user.height + ' см' : 'не вказано') + '\n';
  msg += 'Вага: ' + (user.weight != null ? user.weight + ' кг' : 'не вказано') + '\n';
  msg += 'Вік: ' + (user.age != null ? user.age + ' років' : 'не вказано') + '\n';
  if (user.waist != null || user.hip != null || user.glutes != null || user.arm != null || user.shoulders != null || user.chest != null || user.bodyFatPct != null) {
    msg += '\nЗаміри: ';
    const parts = [];
    if (user.waist != null) parts.push('талія ' + user.waist + ' см');
    if (user.hip != null) parts.push('стегно ' + user.hip + ' см');
    if (user.glutes != null) parts.push('ягодиці ' + user.glutes + ' см');
    if (user.arm != null) parts.push('рука ' + user.arm + ' см');
    if (user.shoulders != null) parts.push('плечі ' + user.shoulders + ' см');
    if (user.chest != null) parts.push('груди ' + user.chest + ' см');
    if (user.bodyFatPct != null) parts.push('жир ' + user.bodyFatPct + '%');
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
  if (user.activityLevel != null || user.neatCoefficient != null) {
    const levelLabel = getActivityLevelLabelUA(user.activityLevel);
    msg += '\nАктивність: ' + (user.activityLevel ? levelLabel + (user.neatCoefficient != null ? ' (NEAT ×' + user.neatCoefficient + ')' : '') : 'не вказано') + '\n';
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
    [{ text: '🏃 Активність', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_ACTIVITY }],
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

const ACTIVITY_JOB_LABELS = { office_sitting: 'Сиджу за комп\'ютером весь день', office_mixed: 'Переважно сиджу, але є пересування', standing: 'Весь день на ногах', physical: 'Фізична праця' };
const ACTIVITY_TRANSPORT_LABELS = { car_transit: 'Машина / транспорт сидячи', walk_bike: 'Пішки або велосипед 20+ хв', combined: 'Комбіновано' };
const ACTIVITY_STEPS_LABELS = { under_5k: 'Менше 5 000', '5k_10k': '5 000 – 10 000', '10k_15k': '10 000 – 15 000', over_15k: 'Більше 15 000' };
const ACTIVITY_EXTRA_LABELS = { none: 'Ні', light: 'Легка (прогулянки, йога)', moderate: 'Помірна (танці, велосипед)', intense: 'Інтенсивна (біг, ігри)' };

async function showProfileActivityJob(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB });
  const keyboard = [
    [{ text: ACTIVITY_JOB_LABELS.office_sitting, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':office_sitting' }],
    [{ text: ACTIVITY_JOB_LABELS.office_mixed, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':office_mixed' }],
    [{ text: ACTIVITY_JOB_LABELS.standing, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':standing' }],
    [{ text: ACTIVITY_JOB_LABELS.physical, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':physical' }]
  ];
  await Helpers.sendKeyboard(chatId, '🏃 **Активність**\n\nЯка у вас робота?', keyboard);
}

async function showProfileActivityTransport(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT });
  const keyboard = [
    [{ text: ACTIVITY_TRANSPORT_LABELS.car_transit, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':car_transit' }],
    [{ text: ACTIVITY_TRANSPORT_LABELS.walk_bike, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':walk_bike' }],
    [{ text: ACTIVITY_TRANSPORT_LABELS.combined, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':combined' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Як добираєтесь до роботи?', keyboard);
}

async function showProfileActivitySteps(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS });
  const keyboard = [
    [{ text: ACTIVITY_STEPS_LABELS.under_5k, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':under_5k' }],
    [{ text: ACTIVITY_STEPS_LABELS['5k_10k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':5k_10k' }],
    [{ text: ACTIVITY_STEPS_LABELS['10k_15k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':10k_15k' }],
    [{ text: ACTIVITY_STEPS_LABELS.over_15k, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':over_15k' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Скільки кроків приблизно на день?', keyboard);
}

async function showProfileActivityExtra(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA });
  const keyboard = [
    [{ text: ACTIVITY_EXTRA_LABELS.none, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':none' }],
    [{ text: ACTIVITY_EXTRA_LABELS.light, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':light' }],
    [{ text: ACTIVITY_EXTRA_LABELS.moderate, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':moderate' }],
    [{ text: ACTIVITY_EXTRA_LABELS.intense, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':intense' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Чи є інша активність поза залом?', keyboard);
}

// ─── Оновлення замірів (FSM) ─────────────────────────────────────────────────

async function startMeasurementsUpdate(chatId) {
  await showMeasurementsPicker(chatId);
}

function buildMeasurementsPickerKeyboard(prefix) {
  const p = prefix;
  return [
    [{ text: '📏 Зріст', callback_data: p + ':height' }, { text: '⚖️ Вага', callback_data: p + ':weight' }],
    [{ text: '⭕ Талія', callback_data: p + ':waist' }, { text: '⭕ Стегно', callback_data: p + ':hip' }],
    [{ text: '💪 Рука', callback_data: p + ':arm' }, { text: '🧣 Шия', callback_data: p + ':neck' }],
    [{ text: '⌚ Запʼястя', callback_data: p + ':wrist' }, { text: '📐 Плечі', callback_data: p + ':shoulders' }],
    [{ text: '📐 Груди', callback_data: p + ':chest' }, { text: '📊 Жир (%)', callback_data: p + ':bodyFatPct' }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
  ];
}

async function showMeasurementsPicker(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE });
  const keyboard = buildMeasurementsPickerKeyboard(CONSTANTS.CALLBACK_PREFIXES.PROFILE_MEAS_PICK);
  await Helpers.sendKeyboard(chatId, '📊 Оновлення замірів\n\nОбери, який обмір хочеш змінити:', keyboard);
}

function getMeasurementAskText(field) {
  switch (field) {
    case 'height': return '📏 Введи зріст (см):\n\nПриклад: 175';
    case 'weight': return '⚖️ Введи вагу (кг):\n\nПриклад: 72';
    case 'waist': return '⭕ Введи обхват талії (см):\n\nПриклад: 72';
    case 'hip': return '⭕ Введи обхват стегна (см):\n\nПриклад: 95';
    case 'glutes': return '⭕ Введи обхват ягодиць (см):\n\nПриклад: 98';
    case 'arm': return '💪 Введи обхват руки (біцепс, см):\n\nПриклад: 32';
    case 'neck': return '🧣 Введи обхват шиї (см):\n\nПриклад: 36';
    case 'wrist': return '⌚ Введи обхват запʼястя (см):\n\nПриклад: 16';
    case 'shoulders': return "📐 Введіть обхват плечей (см)\nПриклад: 98";
    case 'chest': return '📐 Введіть обхват грудей (см)\nПриклад: 86';
    case 'bodyFatPct': return '📊 Введіть відсоток жиру (%):\n\nПриклад: 22.5';
    default: return 'Введи значення:';
  }
}

function parseAndValidateMeasurement(field, text, v) {
  const raw = parseFloat(String(text).trim().replace(',', '.'));
  if (isNaN(raw)) return { ok: false, error: '⚠️ Введіть числове значення.' };
  const val = Math.round(raw * 10) / 10;
  const ranges = {
    height: [v.HEIGHT_MIN ?? 100, v.HEIGHT_MAX ?? 250],
    weight: [v.WEIGHT_MIN ?? 30, v.WEIGHT_MAX ?? 300],
    waist: [v.WAIST_MIN ?? 40, v.WAIST_MAX ?? 200],
    hip: [v.HIP_MIN ?? 40, v.HIP_MAX ?? 200],
    glutes: [v.GLUTES_MIN ?? 40, v.GLUTES_MAX ?? 200],
    arm: [v.ARM_MIN ?? 15, v.ARM_MAX ?? 80],
    neck: [v.NECK_MIN ?? 20, v.NECK_MAX ?? 80],
    wrist: [v.WRIST_MIN ?? 10, v.WRIST_MAX ?? 35],
    shoulders: [v.SHOULDERS_MIN ?? 40, v.SHOULDERS_MAX ?? 200],
    chest: [v.CHEST_MIN ?? 40, v.CHEST_MAX ?? 200],
    bodyFatPct: [v.BODY_FAT_MIN ?? 3, v.BODY_FAT_MAX ?? 60]
  };
  const r = ranges[field];
  if (r) {
    const [min, max] = r;
    if (val < min || val > max) return { ok: false, error: '⚠️ Введіть число від ' + min + ' до ' + max + '.' };
  }
  return { ok: true, value: val };
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

async function askNeck(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_NECK });
  await Helpers.safeSend(chatId, '🧣 Введи обхват шиї (в см):\n\nПриклад: 36');
}

async function askWrist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WRIST });
  await Helpers.safeSend(chatId, '⌚ Введи обхват запʼястя (в см):\n\nПриклад: 16');
}

async function askShoulders(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_SHOULDERS });
  await Helpers.safeSend(chatId, "📐 Введіть обхват плечей (см)\nВимірювати по найширшій точці дельтоподібних м'язів, горизонтально.\nПриклад: 98");
}

async function askChest(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_CHEST });
  await Helpers.safeSend(chatId, '📐 Введіть обхват грудей (см)\nВимірювати по найширшій точці грудної клітки.\nПриклад: 86');
}

async function askBodyFat(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_FAT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_BODY_FAT_SKIP }]];
  await Helpers.sendKeyboard(chatId, 'Введіть відсоток жиру якщо вимірювали каліпером.\nПриклад: 22.5\nАбо натисніть «Пропустити»', keyboard);
}

async function saveMeasurements(chatId) {
  try {
    const stateData = await State.get(chatId);
    const measurements = {
      weight: stateData.weight,
      waist: stateData.waist,
      hip: stateData.hip,
      glutes: stateData.glutes,
      arm: stateData.arm,
      neck: stateData.neck,
      wrist: stateData.wrist,
      shoulders: stateData.shoulders,
      chest: stateData.chest,
      bodyFatPct: stateData.bodyFatPct
    };
    await User.updateMeasurements(chatId, measurements);
    await State.clear(chatId);
    let msg = '✅ Заміри оновлено!\n\n⚖️ Вага: ' + measurements.weight + ' кг\n⭕ Талія: ' + measurements.waist + ' см\n⭕ Стегно: ' + measurements.hip + ' см\n⭕ Ягодиці: ' + measurements.glutes + ' см\n💪 Рука: ' + measurements.arm + ' см';
    if (measurements.neck != null) msg += '\n🧣 Шия: ' + measurements.neck + ' см';
    if (measurements.wrist != null) msg += '\n⌚ Запʼястя: ' + measurements.wrist + ' см';
    if (measurements.shoulders != null) msg += '\n📐 Плечі: ' + measurements.shoulders + ' см';
    if (measurements.chest != null) msg += '\n📐 Груди: ' + measurements.chest + ' см';
    if (measurements.bodyFatPct != null) msg += '\n📊 Жир: ' + measurements.bodyFatPct + '%';
    await Helpers.safeSend(chatId, msg);
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
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();

  if (action === CONSTANTS.CALLBACKS.PROFILE_VIEW) {
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS) {
    await startMeasurementsUpdate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_MEAS_PICK && param) {
    const field = param.trim();
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE, measEditField: field });
    await Helpers.safeSend(chatId, getMeasurementAskText(field));
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
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_ACTIVITY) {
    const user = await User.getByChatId(chatId);
    await State.set(chatId, {
      step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB,
      profileActivityJob: user && user.jobType ? user.jobType : null,
      profileActivityTransport: user && user.transportType ? user.transportType : null,
      profileActivitySteps: user && user.stepsCategory ? user.stepsCategory : null,
      profileActivityExtra: user && user.extraActivity ? user.extraActivity : null
    });
    await showProfileActivityJob(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB) return false;
    await State.update(chatId, { profileActivityJob: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT });
    await showProfileActivityTransport(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT) return false;
    await State.update(chatId, { profileActivityTransport: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS });
    await showProfileActivitySteps(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS) return false;
    await State.update(chatId, { profileActivitySteps: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA });
    await showProfileActivityExtra(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA) return false;
    await User.updateActivityProfile(chatId, {
      jobType: state.profileActivityJob || null,
      transportType: state.profileActivityTransport || null,
      stepsCategory: state.profileActivitySteps || null,
      extraActivity: param || null
    });
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '✅ Активність збережено.');
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT) return false;
    const zone = (param || '').trim();
    let accentZones = [...(state.profileAccentZones || [])];
    if (zone === 'full') {
      accentZones = ['full'];
    } else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) accentZones = accentZones.filter((z) => z !== zone);
      else if (accentZones.length < 2) accentZones.push(zone);
    }
    await State.update(chatId, { profileAccentZones: accentZones });
    // Автоматично переходимо до "Зони, які не розвиваємо" при: "full" або 2 вибраних зони
    if (accentZones[0] === 'full' || accentZones.length === 2) {
      await showProfileAvoidZones(chatId);
    } else {
      await showProfileAccentZones(chatId);
    }
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
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_BODY_FAT_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_FAT) return false;
    await State.update(chatId, { bodyFatPct: undefined });
    await saveMeasurements(chatId);
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
  if (step === CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE && state.measEditField) {
    const field = String(state.measEditField);
    const parsed = parseAndValidateMeasurement(field, text, v);
    if (!parsed.ok) {
      await Helpers.safeSend(chatId, parsed.error);
      return true;
    }
    await User.updateMeasurements(chatId, { [field]: parsed.value });
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '✅ Заміри оновлено: ' + field);
    await show(chatId);
    return true;
  }

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
    await askNeck(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_NECK) {
    const neck = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.NECK_MIN != null ? v.NECK_MIN : 20;
    const max = v.NECK_MAX != null ? v.NECK_MAX : 80;
    if (isNaN(neck) || neck < min || neck > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват шиї має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { neck: Math.round(neck * 10) / 10 });
    await askWrist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_WRIST) {
    const wrist = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.WRIST_MIN != null ? v.WRIST_MIN : 10;
    const max = v.WRIST_MAX != null ? v.WRIST_MAX : 35;
    if (isNaN(wrist) || wrist < min || wrist > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват запʼястя має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { wrist: Math.round(wrist * 10) / 10 });
    await askShoulders(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_SHOULDERS) {
    const shoulders = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.SHOULDERS_MIN != null ? v.SHOULDERS_MIN : 40;
    const max = v.SHOULDERS_MAX != null ? v.SHOULDERS_MAX : 200;
    if (isNaN(shoulders) || shoulders < min || shoulders > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват плечей має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { shoulders: Math.round(shoulders * 10) / 10 });
    await askChest(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CHEST) {
    const chest = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.CHEST_MIN != null ? v.CHEST_MIN : 40;
    const max = v.CHEST_MAX != null ? v.CHEST_MAX : 200;
    if (isNaN(chest) || chest < min || chest > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват грудей має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { chest: Math.round(chest * 10) / 10 });
    await askBodyFat(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_FAT) {
    const bodyFatPct = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.BODY_FAT_MIN != null ? v.BODY_FAT_MIN : 3;
    const max = v.BODY_FAT_MAX != null ? v.BODY_FAT_MAX : 60;
    if (isNaN(bodyFatPct) || bodyFatPct < min || bodyFatPct > max) {
      await Helpers.safeSend(chatId, '⚠️ Відсоток жиру має бути від ' + min + ' до ' + max + '.\n\nСпробуй ще раз або натисни «Пропустити»:');
      return true;
    }
    await State.update(chatId, { bodyFatPct: Math.round(bodyFatPct * 10) / 10 });
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
