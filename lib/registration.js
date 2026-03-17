/**
 * Registration — FSM реєстрації: старт, вибір ролі, ім'я, прізвище, стать, ціль, дата народження, зони акценту/уникнення (опційно), місто, (тренер: Instagram, Calendar), завершення
 */
const { CONSTANTS, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER } = require('./constants');
const State = require('./state');
const User = require('./user');
const Menu = require('./menu');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const bodyAnalysisAI = require('./ai/bodyAnalysis');
const bodyGoals = require('./bodyGoals');

async function start(chatId, options = {}) {
  const force = !!options.force;
  const stepState = CONSTANTS.FSM_STATES.WAITING_FOR_START_CHOICE;
  await State.set(chatId, { step: stepState });
  const keyboard = [
    [{ text: '✅ Нова реєстрація', callback_data: CONSTANTS.CALLBACKS.REG_NEW }],
    [{ text: '🎟️ У мене є код', callback_data: CONSTANTS.CALLBACKS.REG_INVITE }]
  ];
  await Helpers.sendKeyboard(chatId, '👋 Привіт! Вітаю в системі FIT 3.0\n\nОбери варіант:', keyboard);
}

/** Показати вибір ролі (після «Нова реєстрація») */
async function showRoleStep(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_ROLE });
  const keyboard = [
    [{ text: '🎓 Учень', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_STUDENT }],
    [{ text: '💪 Тренер', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_COACH }]
  ];
  await Helpers.sendKeyboard(chatId, '👤 Обери свою роль:', keyboard);
}

// ─── Кроки FSM ─────────────────────────────────────────────────────────────

async function askFirstName(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_FIRST_NAME });
  await Helpers.safeSend(chatId, "✍️ Напиши своє ім'я:");
}

async function askContinueOrStart(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_FIRST_NAME_DECISION });
  const keyboard = [
    [{ text: '✅ Продовжити реєстрацію', callback_data: CONSTANTS.CALLBACKS.REG_CONTINUE }],
    [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACKS.REG_START_TRAINING }]
  ];
  await Helpers.sendKeyboard(chatId, 'Приємно познайомитись! Обери наступний крок:', keyboard);
}

async function askLastName(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_LAST_NAME });
  const state = await State.get(chatId);
  const firstName = (state && state.firstName) || '';
  const keyboard = [[{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACKS.REG_SKIP_LASTNAME }]];
  await Helpers.sendKeyboard(chatId, "Приємно, " + firstName + "! 👋\n\n✍️ Тепер напиши своє прізвище:", keyboard);
}

async function askGender(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_GENDER });
  const keyboard = [
    [{ text: '👨 Чоловік', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_MALE }],
    [{ text: '👩 Жінка', callback_data: CONSTANTS.CALLBACKS.REG_GENDER_FEMALE }]
  ];
  await Helpers.sendKeyboard(chatId, '👤 Обери стать:', keyboard);
}

async function askGoal(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_GOAL });
  const keyboard = [
    [{ text: '📉 Схуднути', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_LOSE }],
    [{ text: '📈 Набрати масу', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_GAIN }],
    [{ text: '⚖️ Підтримувати форму', callback_data: CONSTANTS.CALLBACKS.REG_GOAL_KEEP }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Яка твоя мета?', keyboard);
}

async function askBirthDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BIRTH_DATE });
  const example = CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE ? CONSTANTS.DATE_FORMATS.EXAMPLE : '15.05.1995';
  await Helpers.safeSend(chatId, "📅 Напиши свою дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: " + example);
}

async function askAccentAvoidChoice(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACCENT_CHOICE });
  const keyboard = [
    [{ text: '⏭️ Пропустити (можна заповнити в профілі)', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_SKIP }],
    [{ text: '🎯 Заповнити зараз', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_FILL }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 На що робимо акцент у тренуваннях? Що не розвиваємо або мінімізуємо?\n\nМожна пропустити і вказати пізніше в профілі.', keyboard);
}

async function showRegAccentZones(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACCENT_SELECT });
  const state = await State.get(chatId);
  const accentZones = state?.regAccentZones || [];
  const keyboard = [];
  const row = [];
  for (const zone of ACCENT_ZONES_ORDER) {
    const label = (ACCENT_LABELS[zone] || zone) + (accentZones.includes(zone) ? ' ✓' : '');
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_TGL + ':' + zone });
    if (row.length >= 3) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_BCK }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_NXT }]);
  await Helpers.sendKeyboard(chatId, 'На що робимо акцент? Обери 1–2 зони (або «Все рівномірно»).', keyboard);
}

async function showRegAvoidZones(chatId) {
  const state = await State.get(chatId);
  const accentZones = state?.regAccentZones || [];
  const avoidZones = state?.regAvoidZones || [];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_AVOID_SELECT });
  const keyboard = [];
  for (const zone of AVOID_ZONES_ORDER) {
    if (accentZones.includes(zone)) continue;
    const label = (ACCENT_LABELS[zone] || zone) + (avoidZones.includes(zone) ? ' ✓' : '');
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_AVD_TGL + ':' + zone }]);
  }
  keyboard.push([{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_AVD_SKP }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_AVD_NXT }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_AVD_BCK }]);
  await Helpers.sendKeyboard(chatId, 'Є зони, які НЕ розвиваємо або мінімізуємо? (необов\'язково)', keyboard);
}

async function showRegMeasurementsChoice(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_MEASUREMENTS_CHOICE });
  const keyboard = [
    [{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_SKIP }],
    [{ text: 'Ввести заміри', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_FILL }]
  ];
  await Helpers.sendKeyboard(chatId, '📐 Заміри тіла потрібні для складання коректного плану тренувань.\n\nМожна пропустити зараз і дозаповнити в профілі пізніше.', keyboard);
}

async function askRegWeight(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WEIGHT });
  const v = CONSTANTS.VALIDATION || {};
  const min = v.WEIGHT_MIN != null ? v.WEIGHT_MIN : 30;
  const max = v.WEIGHT_MAX != null ? v.WEIGHT_MAX : 300;
  await Helpers.safeSend(chatId, '⚖️ Введи вагу (кг):\n\nДіапазон: ' + min + '–' + max + '\nПриклад: 72');
}

async function askRegWaist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WAIST });
  await Helpers.safeSend(chatId, '⭕ Введи обхват талії (см):\n\nПриклад: 72');
}

async function askRegHip(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_HIP });
  await Helpers.safeSend(chatId, '⭕ Введи обхват стегна (см):\n\nВимірюй найширшу частину.\nПриклад: 95');
}

async function askRegGlutes(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_GLUTES });
  await Helpers.safeSend(chatId, '⭕ Введи обхват ягодиць (см):\n\nПриклад: 98');
}

async function askRegArm(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ARM });
  await Helpers.safeSend(chatId, '💪 Введи обхват руки (біцепс, см):\n\nПриклад: 32');
}

async function askRegShoulders(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_SHOULDERS });
  await Helpers.safeSend(chatId, "📐 Введіть обхват плечей (см)\nВимірювати по найширшій точці дельтоподібних м'язів, горизонтально.\nПриклад: 98");
}

async function askRegChest(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CHEST });
  await Helpers.safeSend(chatId, '📐 Введіть обхват грудей (см)\nВимірювати по найширшій точці грудної клітки.\nПриклад: 86');
}

async function askRegBodyFat(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_FAT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_BODY_FAT_SKIP }]];
  await Helpers.sendKeyboard(chatId, 'Введіть відсоток жиру якщо вимірювали каліпером.\nПриклад: 22.5\nАбо натисніть «Пропустити»', keyboard);
}

const REG_ACTIVITY_JOB_LABELS = { office_sitting: 'Сиджу за комп\'ютером весь день', office_mixed: 'Переважно сиджу, але є пересування', standing: 'Весь день на ногах', physical: 'Фізична праця' };
const REG_ACTIVITY_TRANSPORT_LABELS = { car_transit: 'Машина / транспорт сидячи', walk_bike: 'Пішки або велосипед 20+ хв', combined: 'Комбіновано' };
const REG_ACTIVITY_STEPS_LABELS = { under_5k: 'Менше 5 000', '5k_10k': '5 000 – 10 000', '10k_15k': '10 000 – 15 000', over_15k: 'Більше 15 000' };
const REG_ACTIVITY_EXTRA_LABELS = { none: 'Ні', light: 'Легка (прогулянки, йога)', moderate: 'Помірна (танці, велосипед)', intense: 'Інтенсивна (біг, ігри)' };

async function askRegActivityJob(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACTIVITY_JOB });
  const keyboard = [
    [{ text: REG_ACTIVITY_JOB_LABELS.office_sitting, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_JOB + ':office_sitting' }],
    [{ text: REG_ACTIVITY_JOB_LABELS.office_mixed, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_JOB + ':office_mixed' }],
    [{ text: REG_ACTIVITY_JOB_LABELS.standing, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_JOB + ':standing' }],
    [{ text: REG_ACTIVITY_JOB_LABELS.physical, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_JOB + ':physical' }]
  ];
  await Helpers.sendKeyboard(chatId, '🏃 **Активність**\n\nЯка у вас робота?', keyboard);
}

async function askRegActivityTransport(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACTIVITY_TRANSPORT });
  const keyboard = [
    [{ text: REG_ACTIVITY_TRANSPORT_LABELS.car_transit, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_TRANSPORT + ':car_transit' }],
    [{ text: REG_ACTIVITY_TRANSPORT_LABELS.walk_bike, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_TRANSPORT + ':walk_bike' }],
    [{ text: REG_ACTIVITY_TRANSPORT_LABELS.combined, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_TRANSPORT + ':combined' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Як добираєтесь до роботи?', keyboard);
}

async function askRegActivitySteps(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACTIVITY_STEPS });
  const keyboard = [
    [{ text: REG_ACTIVITY_STEPS_LABELS.under_5k, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_STEPS + ':under_5k' }],
    [{ text: REG_ACTIVITY_STEPS_LABELS['5k_10k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_STEPS + ':5k_10k' }],
    [{ text: REG_ACTIVITY_STEPS_LABELS['10k_15k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_STEPS + ':10k_15k' }],
    [{ text: REG_ACTIVITY_STEPS_LABELS.over_15k, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_STEPS + ':over_15k' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Скільки кроків приблизно на день?', keyboard);
}

async function askRegActivityExtra(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ACTIVITY_EXTRA });
  const keyboard = [
    [{ text: REG_ACTIVITY_EXTRA_LABELS.none, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_EXTRA + ':none' }],
    [{ text: REG_ACTIVITY_EXTRA_LABELS.light, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_EXTRA + ':light' }],
    [{ text: REG_ACTIVITY_EXTRA_LABELS.moderate, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_EXTRA + ':moderate' }],
    [{ text: REG_ACTIVITY_EXTRA_LABELS.intense, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_EXTRA + ':intense' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Чи є інша активність поза залом?', keyboard);
}

async function askCity(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CITY });
  const cities = await User.getCities();
  const keyboard = [];
  for (let i = 0; i < cities.length; i += 2) {
    const row = [{ text: cities[i].cityName, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i].cityName }];
    if (i + 1 < cities.length) {
      row.push({ text: cities[i + 1].cityName, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY + ':' + cities[i + 1].cityName });
    }
    keyboard.push(row);
  }
  await Helpers.sendKeyboard(chatId, '🏙️ Обери своє місто або напиши його:', keyboard);
}

async function askInstagram(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_INSTAGRAM });
  await Helpers.safeSend(chatId, "📸 Надішли посилання на свій Instagram:\n\nПриклад: https://www.instagram.com/your_name\n\nАбо надішли порожнє повідомлення щоб пропустити.");
}

async function askCalendarId(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CALENDAR_ID });
  await Helpers.safeSend(chatId, "📆 Надішли email свого Google Calendar:\n\nПриклад: your.email@gmail.com\n\nЦе потрібно для синхронізації розкладу.\n\nАбо надішли порожнє повідомлення щоб пропустити.");
}

async function askRegBodyGoalsChoice(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHOICE });
  const keyboard = [
    [{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP }],
    [{ text: 'Заповнити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_FILL }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Вказати бажані параметри тіла?\n\n(вага, талія, ягодиці, плечі, груди)', keyboard);
}

async function askRegBodyGoalsWeight(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WEIGHT }]];
  await Helpers.sendKeyboard(chatId, 'Бажана вага (кг)\nПриклад: 65.0\nАбо натисніть «Пропустити»', keyboard);
}

async function askRegBodyGoalsWaist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WAIST }]];
  await Helpers.sendKeyboard(chatId, 'Бажана талія (см)\nПриклад: 70.0\nАбо натисніть «Пропустити»', keyboard);
}

async function askRegBodyGoalsHips(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_HIPS }]];
  await Helpers.sendKeyboard(chatId, 'Бажані ягодиці (см)\nПриклад: 95.0\nАбо натисніть «Пропустити»', keyboard);
}

async function askRegBodyGoalsShoulders(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_SHOULDERS }]];
  await Helpers.sendKeyboard(chatId, 'Бажані плечі (см)\nПриклад: 105.0\nАбо натисніть «Пропустити»', keyboard);
}

async function askRegBodyGoalsChest(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_CHEST }]];
  await Helpers.sendKeyboard(chatId, 'Бажані груди (см)\nПриклад: 90.0\nАбо натисніть «Пропустити»', keyboard);
}

async function saveRegBodyGoalsAndFinish(chatId, goals) {
  const hasAny = goals.goal_weight != null || goals.goal_waist != null || goals.goal_hips != null || goals.goal_shoulders != null || goals.goal_chest != null;
  if (hasAny) {
    const bgRes = await supabase.upsertBodyGoals(null, chatId, goals);
    if (!bgRes || !bgRes.ok) console.error('Registration: upsertBodyGoals failed', bgRes && bgRes.error);
    await Helpers.safeSend(chatId, '💡 Для точнішої валідації заповніть зріст у профілі.');
  }
  await finishRegistration(chatId);
}

const INVITE_CODE_PATTERN = /^INVITE_[A-Za-z0-9]+$/i;

async function askInviteCode(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_INVITE_INPUT });
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
  await Helpers.sendKeyboard(chatId, "🎟️ Введи код, який надав твій тренер:\n\nПриклад: INVITE_A3F7", keyboard);
}

async function finishRegistration(chatId) {
  try {
    const stateData = await State.get(chatId);
    if (!stateData || !stateData.role || !stateData.firstName) {
      await Helpers.safeSend(chatId, "❌ Недостатньо даних для реєстрації. Почни з /start");
      await State.clear(chatId);
      return;
    }
    const userData = {
      chatId: String(chatId),
      role: stateData.role,
      firstName: stateData.firstName,
      lastName: stateData.lastName || '',
      city: stateData.city || '',
      gender: stateData.gender || '',
      goal: stateData.goal || '',
      birthDate: stateData.birthDate || null,
      age: stateData.age != null ? stateData.age : null,
      instagram: stateData.instagram || '',
      calendarId: stateData.calendarId || '',
      accentZones: Array.isArray(stateData.regAccentZones) && stateData.regAccentZones.length > 0 ? stateData.regAccentZones : (stateData.regAccentZones === undefined ? [] : [].concat(stateData.regAccentZones || [])),
      avoidZones: Array.isArray(stateData.regAvoidZones) ? stateData.regAvoidZones : (stateData.regAvoidZones ? [].concat(stateData.regAvoidZones) : [])
    };
    await User.createUser(userData);
    const hasMeasurements = stateData.regWeight != null || stateData.regWaist != null || stateData.regHip != null || stateData.regGlutes != null || stateData.regArm != null || stateData.regShoulders != null || stateData.regChest != null || stateData.regBodyFatPct != null;
    if (hasMeasurements) {
      const updates = {};
      if (stateData.regWeight != null) updates.weight = stateData.regWeight;
      if (stateData.regWaist != null) updates.waist = stateData.regWaist;
      if (stateData.regHip != null) updates.hip = stateData.regHip;
      if (stateData.regGlutes != null) updates.glutes = stateData.regGlutes;
      if (stateData.regArm != null) updates.arm = stateData.regArm;
      if (stateData.regShoulders != null) updates.shoulders = stateData.regShoulders;
      if (stateData.regChest != null) updates.chest = stateData.regChest;
      if (stateData.regBodyFatPct != null) updates.bodyFatPct = stateData.regBodyFatPct;
      await supabase.updateUser(String(chatId), updates);
      await supabase.insertMeasurement({
        chatId: String(chatId),
        date: new Date(),
        weight: stateData.regWeight,
        waist: stateData.regWaist,
        hip: stateData.regHip,
        glutes: stateData.regGlutes,
        arm: stateData.regArm,
        shoulders: stateData.regShoulders,
        chest: stateData.regChest,
        bodyFatPct: stateData.regBodyFatPct,
        source: 'registration'
      });
    }
    await bodyAnalysisAI.generateAndSend(String(chatId), 'self_registration', {
      height: null,
      weight: stateData.regWeight != null ? stateData.regWeight : null,
      waist: stateData.regWaist != null ? stateData.regWaist : null,
      hip: stateData.regHip != null ? stateData.regHip : null,
      glutes: stateData.regGlutes != null ? stateData.regGlutes : null,
      shoulders: stateData.regShoulders != null ? stateData.regShoulders : null,
      chest: stateData.regChest != null ? stateData.regChest : null,
      bodyFatPct: stateData.regBodyFatPct != null ? stateData.regBodyFatPct : null
    });
    const hasActivity = stateData.regActivityJob != null || stateData.regActivityTransport != null || stateData.regActivitySteps != null || stateData.regActivityExtra != null;
    if (hasActivity) {
      await User.updateActivityProfile(String(chatId), {
        jobType: stateData.regActivityJob || null,
        transportType: stateData.regActivityTransport || null,
        stepsCategory: stateData.regActivitySteps || null,
        extraActivity: stateData.regActivityExtra || null
      });
    }
    await State.clear(chatId);
    const roleText = userData.role === CONSTANTS.ROLES.COACH ? 'тренере' : 'учне';
    await Helpers.safeSend(chatId, "🎉 Вітаю, " + userData.firstName + "!\n\nРеєстрацію завершено. Ласкаво просимо в FIT 3.0, " + roleText + "!");
    await Menu.show(chatId);
  } catch (err) {
    console.error('Registration.finishRegistration', err.message);
    await Helpers.safeSend(chatId, "❌ Виникла помилка при завершенні реєстрації:\n" + err.message + "\n\nСпробуй ще раз через /start");
    await State.clear(chatId);
  }
}

// ─── Обробка тексту (реєстраційні кроки) ───────────────────────────────────

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
  const v = CONSTANTS.VALIDATION || {};
  const datePattern = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.INPUT_PATTERN) ? CONSTANTS.DATE_FORMATS.INPUT_PATTERN : /^\d{2}\.\d{2}\.\d{4}$/;
  const instagramPattern = (CONSTANTS.REG_PATTERNS && CONSTANTS.REG_PATTERNS.INSTAGRAM_URL) ? CONSTANTS.REG_PATTERNS.INSTAGRAM_URL : /^https?:\/\/(www\.)?instagram\.com\/[^\s/]+\/?(\?.*)?$/i;
  const emailPattern = (CONSTANTS.REG_PATTERNS && CONSTANTS.REG_PATTERNS.EMAIL) ? CONSTANTS.REG_PATTERNS.EMAIL : /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (step === CONSTANTS.FSM_STATES.REG_FIRST_NAME) {
    const firstName = String(text).trim();
    const minLen = v.NAME_MIN_LENGTH != null ? v.NAME_MIN_LENGTH : 2;
    const maxLen = v.NAME_MAX_LENGTH != null ? v.NAME_MAX_LENGTH : 30;
    if (firstName.length < minLen || firstName.length > maxLen) {
      await Helpers.safeSend(chatId, "⚠️ Ім'я має бути від " + minLen + " до " + maxLen + " символів.\nСпробуй ще раз:");
      return true;
    }
    await State.update(chatId, { firstName });
    await askContinueOrStart(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_FIRST_NAME_DECISION) {
    await Helpers.safeSend(chatId, "⚠️ Обери дію кнопкою нижче.");
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_INVITE_INPUT) {
    const inviteCode = String(text).trim().toUpperCase();
    if (!INVITE_CODE_PATTERN.test(inviteCode)) {
      await Helpers.safeSend(chatId, "⚠️ Невірний формат коду.\n\nКод має починатися з INVITE_\nПриклад: INVITE_A3F7\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.activateInvite(inviteCode, chatId);
      await bodyAnalysisAI.generateAndSend(chatId, 'invite_activate', {});
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Код прийнято!\nТи успішно приєднався до команди.');
      const Menu = require('./menu');
      await Menu.show(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, "❌ Код недійсний або вже використано.\nСпробуй ще раз або натисни [🔙 Назад].\n\nЯкщо помилка: " + err.message);
    }
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_LAST_NAME) {
    const lastName = String(text).trim();
    const lastMin = v.LASTNAME_MIN_LENGTH != null ? v.LASTNAME_MIN_LENGTH : 2;
    const lastMax = v.LASTNAME_MAX_LENGTH != null ? v.LASTNAME_MAX_LENGTH : 50;
    if (lastName.length < lastMin || lastName.length > lastMax) {
      await Helpers.safeSend(chatId, "⚠️ Прізвище має бути від " + lastMin + " до " + lastMax + " символів.\nСпробуй ще раз або натисни [Пропустити]:");
      return true;
    }
    await State.update(chatId, { lastName });
    await askGender(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CITY) {
    const city = String(text).trim();
    const cityMin = v.CITY_MIN_LENGTH != null ? v.CITY_MIN_LENGTH : 2;
    const cityMax = v.CITY_MAX_LENGTH != null ? v.CITY_MAX_LENGTH : 50;
    if (city.length < cityMin || city.length > cityMax) {
      await Helpers.safeSend(chatId, "⚠️ Назва міста має бути від " + cityMin + " до " + cityMax + " символів.\nСпробуй ще раз:");
      return true;
    }
    await State.update(chatId, { city });
    const updated = await State.get(chatId);
    if (updated && updated.role === CONSTANTS.ROLES.COACH) {
      await askInstagram(chatId);
    } else {
      await showRegMeasurementsChoice(chatId);
    }
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_WEIGHT) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.WEIGHT_MIN != null ? v.WEIGHT_MIN : 30;
    const max = v.WEIGHT_MAX != null ? v.WEIGHT_MAX : 300;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (кг).');
      return true;
    }
    await State.update(chatId, { regWeight: n });
    await askRegWaist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_WAIST) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.WAIST_MIN != null ? v.WAIST_MIN : 40;
    const max = v.WAIST_MAX != null ? v.WAIST_MAX : 200;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regWaist: Math.round(n * 10) / 10 });
    await askRegHip(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_HIP) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.HIP_MIN != null ? v.HIP_MIN : 40;
    const max = v.HIP_MAX != null ? v.HIP_MAX : 200;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regHip: Math.round(n * 10) / 10 });
    await askRegGlutes(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_GLUTES) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.GLUTES_MIN != null ? v.GLUTES_MIN : 40;
    const max = v.GLUTES_MAX != null ? v.GLUTES_MAX : 200;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regGlutes: Math.round(n * 10) / 10 });
    await askRegArm(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_ARM) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.ARM_MIN != null ? v.ARM_MIN : 15;
    const max = v.ARM_MAX != null ? v.ARM_MAX : 80;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regArm: Math.round(n * 10) / 10 });
    await askRegShoulders(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_SHOULDERS) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.SHOULDERS_MIN != null ? v.SHOULDERS_MIN : 40;
    const max = v.SHOULDERS_MAX != null ? v.SHOULDERS_MAX : 200;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regShoulders: Math.round(n * 10) / 10 });
    await askRegChest(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_CHEST) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.CHEST_MIN != null ? v.CHEST_MIN : 40;
    const max = v.CHEST_MAX != null ? v.CHEST_MAX : 200;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regChest: Math.round(n * 10) / 10 });
    await askRegBodyFat(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_FAT) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.BODY_FAT_MIN != null ? v.BODY_FAT_MIN : 3;
    const max = v.BODY_FAT_MAX != null ? v.BODY_FAT_MAX : 60;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' або натисніть «Пропустити».');
      return true;
    }
    await State.update(chatId, { regBodyFatPct: Math.round(n * 10) / 10 });
    await askRegActivityJob(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_BIRTH_DATE) {
    const dateText = String(text).trim();
    if (!datePattern.test(dateText)) {
      const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) ? CONSTANTS.DATE_FORMATS.EXAMPLE : '15.05.1995';
      await Helpers.safeSend(chatId, "⚠️ Невірний формат дати.\n\nОчікується: ДД.ММ.РРРР\nПриклад: " + ex + "\n\nСпробуй ще раз:");
      return true;
    }
    const birthDate = User.parseBirthDate(dateText);
    if (!birthDate) {
      await Helpers.safeSend(chatId, "⚠️ Некоректна дата.\nСпробуй ще раз:");
      return true;
    }
    const age = User.calculateAge(birthDate);
    const ageMin = v.AGE_MIN != null ? v.AGE_MIN : 12;
    const ageMax = v.AGE_MAX != null ? v.AGE_MAX : 100;
    if (age < ageMin || age > ageMax) {
      await Helpers.safeSend(chatId, "⚠️ Вік має бути від " + ageMin + " до " + ageMax + " років.\nСпробуй ще раз:");
      return true;
    }
    await State.update(chatId, { birthDate: birthDate.toISOString ? birthDate.toISOString() : birthDate, age });
    await askAccentAvoidChoice(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_INSTAGRAM) {
    const instagram = String(text).trim();
    if (instagram === '') {
      await State.update(chatId, { instagram: '' });
      await askCalendarId(chatId);
      return true;
    }
    if (!instagramPattern.test(instagram)) {
      await Helpers.safeSend(chatId, "⚠️ Невірний формат посилання Instagram.\n\nПриклад: https://www.instagram.com/your_name\n\nСпробуй ще раз або надішли порожнє повідомлення щоб пропустити:");
      return true;
    }
    await State.update(chatId, { instagram });
    await askCalendarId(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CALENDAR_ID) {
    const calendarId = String(text).trim();
    if (calendarId === '') {
      await State.update(chatId, { calendarId: '' });
      await askRegBodyGoalsChoice(chatId);
      return true;
    }
    if (!emailPattern.test(calendarId)) {
      await Helpers.safeSend(chatId, "⚠️ Невірний формат email.\n\nПриклад: your.email@gmail.com\n\nСпробуй ще раз або надішли порожнє повідомлення щоб пропустити:");
      return true;
    }
    await State.update(chatId, { calendarId });
    await askRegBodyGoalsChoice(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT) {
    const check = bodyGoals.validateGoalField('goal_weight', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalWeight: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST });
    await askRegBodyGoalsWaist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST) {
    const check = bodyGoals.validateGoalField('goal_waist', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalWaist: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS });
    await askRegBodyGoalsHips(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS) {
    const check = bodyGoals.validateGoalField('goal_hips', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalHips: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS });
    await askRegBodyGoalsShoulders(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS) {
    const check = bodyGoals.validateGoalField('goal_shoulders', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalShoulders: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
    await askRegBodyGoalsChest(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST) {
    const check = bodyGoals.validateGoalField('goal_chest', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    const stateData = await State.get(chatId);
    const goals = {
      goal_weight: stateData.regGoalWeight != null ? stateData.regGoalWeight : null,
      goal_waist: stateData.regGoalWaist != null ? stateData.regGoalWaist : null,
      goal_hips: stateData.regGoalHips != null ? stateData.regGoalHips : null,
      goal_shoulders: stateData.regGoalShoulders != null ? stateData.regGoalShoulders : null,
      goal_chest: check.value
    };
    await saveRegBodyGoalsAndFinish(chatId, goals);
    return true;
  }

  return false;
}

// ─── Обробка callback (реєстраційні кнопки) ───────────────────────────────

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.REG_ROLE_STUDENT) {
    await State.update(chatId, { role: CONSTANTS.ROLES.STUDENT });
    await askFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_ROLE_COACH) {
    await State.update(chatId, { role: CONSTANTS.ROLES.COACH });
    await askFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GENDER_MALE) {
    await State.update(chatId, { gender: CONSTANTS.GENDERS.MALE });
    await askGoal(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GENDER_FEMALE) {
    await State.update(chatId, { gender: CONSTANTS.GENDERS.FEMALE });
    await askGoal(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GOAL_LOSE) {
    await State.update(chatId, { goal: CONSTANTS.GOALS.LOSE });
    await askBirthDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GOAL_GAIN) {
    await State.update(chatId, { goal: CONSTANTS.GOALS.GAIN });
    await askBirthDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GOAL_KEEP) {
    await State.update(chatId, { goal: CONSTANTS.GOALS.KEEP });
    await askBirthDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_SKIP) {
    await State.update(chatId, { regAccentZones: [], regAvoidZones: [] });
    await askCity(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_FILL) {
    await State.update(chatId, { regAccentZones: [], regAvoidZones: [] });
    await showRegAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACCENT_SELECT) return false;
    const zone = (param || '').trim();
    let accentZones = [...(state.regAccentZones || [])];
    if (zone === 'full') accentZones = ['full'];
    else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) accentZones = accentZones.filter((z) => z !== zone);
      else if (accentZones.length < 2) accentZones.push(zone);
    }
    await State.update(chatId, { regAccentZones: accentZones });
    await showRegAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACCENT_SELECT) return false;
    const accentZones = state.regAccentZones || [];
    if (!accentZones.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б одну зону або «Все рівномірно».');
      await showRegAccentZones(chatId);
      return true;
    }
    await showRegAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACCENT_BCK) {
    await askAccentAvoidChoice(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_AVD_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_AVOID_SELECT) return false;
    const zone = (param || '').trim();
    let avoidZones = [...(state.regAvoidZones || [])];
    if (avoidZones.includes(zone)) avoidZones = avoidZones.filter((z) => z !== zone);
    else avoidZones.push(zone);
    await State.update(chatId, { regAvoidZones: avoidZones });
    await showRegAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_AVD_SKP || action === CONSTANTS.CALLBACK_PREFIXES.REG_AVD_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_AVOID_SELECT) return false;
    await askCity(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_AVD_BCK) {
    await showRegAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY) {
    await State.update(chatId, { city: param || '' });
    const stateData = await State.get(chatId);
    if (stateData && stateData.role === CONSTANTS.ROLES.COACH) {
      await askInstagram(chatId);
    } else {
      await showRegMeasurementsChoice(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_MEASUREMENTS_CHOICE) return false;
    await Helpers.safeSend(chatId, '💡 Дані замірів можна дозаповнити в профілі — це допоможе скласти коректний план тренувань.');
    await askRegBodyGoalsChoice(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_FILL) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_MEASUREMENTS_CHOICE) return false;
    await askRegWeight(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_BODY_FAT_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_FAT) return false;
    await askRegBodyGoalsChoice(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_JOB && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACTIVITY_JOB) return false;
    await State.update(chatId, { regActivityJob: param, step: CONSTANTS.FSM_STATES.REG_ACTIVITY_TRANSPORT });
    await askRegActivityTransport(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_TRANSPORT && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACTIVITY_TRANSPORT) return false;
    await State.update(chatId, { regActivityTransport: param, step: CONSTANTS.FSM_STATES.REG_ACTIVITY_STEPS });
    await askRegActivitySteps(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_STEPS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACTIVITY_STEPS) return false;
    await State.update(chatId, { regActivitySteps: param, step: CONSTANTS.FSM_STATES.REG_ACTIVITY_EXTRA });
    await askRegActivityExtra(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_ACTIVITY_EXTRA && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_ACTIVITY_EXTRA) return false;
    await State.update(chatId, { regActivityExtra: param });
    await askRegBodyGoalsChoice(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP) {
    await finishRegistration(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_FILL) {
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT });
    await askRegBodyGoalsWeight(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WEIGHT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT) return false;
    await State.update(chatId, { regGoalWeight: null, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST });
    await askRegBodyGoalsWaist(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WAIST) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST) return false;
    await State.update(chatId, { regGoalWaist: null, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS });
    await askRegBodyGoalsHips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_HIPS) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS) return false;
    await State.update(chatId, { regGoalHips: null, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS });
    await askRegBodyGoalsShoulders(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_SHOULDERS) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS) return false;
    await State.update(chatId, { regGoalShoulders: null, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
    await askRegBodyGoalsChest(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_CHEST) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST) return false;
    const goals = {
      goal_weight: state.regGoalWeight != null ? state.regGoalWeight : null,
      goal_waist: state.regGoalWaist != null ? state.regGoalWaist : null,
      goal_hips: state.regGoalHips != null ? state.regGoalHips : null,
      goal_shoulders: state.regGoalShoulders != null ? state.regGoalShoulders : null,
      goal_chest: null
    };
    await saveRegBodyGoalsAndFinish(chatId, goals);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_SKIP_LASTNAME) {
    await State.update(chatId, { lastName: '' });
    await askGender(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_CONTINUE) {
    await askLastName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_START_TRAINING) {
    await Helpers.safeSend(chatId, '💪 Модуль тренувань ще переноситься на новий бот. Заверши реєстрацію кнопкою «Продовжити реєстрацію», потім з\'явиться головне меню.');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_INVITE) {
    await askInviteCode(chatId);
    return true;
  }

  return false;
}

module.exports = {
  start,
  showRoleStep,
  askFirstName,
  askContinueOrStart,
  askLastName,
  askGender,
  askGoal,
  askBirthDate,
  askCity,
  askInstagram,
  askCalendarId,
  askInviteCode,
  finishRegistration,
  handleTextMessage,
  handleCallback
};
