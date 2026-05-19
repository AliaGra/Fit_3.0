/**
 * Registration — FSM реєстрації: старт, вибір ролі, ім'я, прізвище, стать, ціль, дата народження, зони акценту/уникнення (опційно), місто, (тренер: Instagram, Calendar), завершення
 */
const { CONSTANTS, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER } = require('./constants');
const State = require('./state');
const User = require('./user');
const Menu = require('./menu');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const telegram = require('./telegram');
const bodyAnalysisAI = require('./ai/bodyAnalysis');
const goalsAI = require('./ai/goalsVsCurrent');
const bodyGoals = require('./bodyGoals');
const fs = require('fs');
const path = require('path');
const AdminHelpers = require('./adminHelpers');
const menstrualCycle = require('./menstrualCycle');

async function proceedAfterCycleRegistration(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) await askBirthDate(chatId);
  else await askGoal(chatId);
}

/** Після статі «Жінка»: пояснення + вибір заповнити цикл зараз чи пізніше в профілі. */
async function askRegCycleIntro(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CYCLE_INTRO, regCycleDeferred: false });
  const keyboard = [
    [{ text: '✅ Заповнити зараз', callback_data: CONSTANTS.CALLBACKS.REG_CYCLE_FILL_NOW }],
    [{ text: '⏭️ Заповнити пізніше', callback_data: CONSTANTS.CALLBACKS.REG_CYCLE_FILL_LATER }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '🌸 **Дані про цикл і менопаузу**\n\n' +
      'На платформі FIT 3.0 це потрібно, щоб:\n' +
      '• точніше **адаптувати навантаження** в авто-плані за фазою циклу;\n' +
      '• обережніше підбирати вправи в «чутливі» дні (наприклад, інверсії, високий ударний навантаження);\n' +
      '• нагадувати **підтвердити початок місячних** для точнішої фази.\n\n' +
      'Дані **лише у вашому профілі**, їх можна змінити будь-коли: ' +
      '👤 Мій профіль → ✏️ Редагувати дані → 🌸 **Цикл і менопауза**.\n\n' +
      'Це не медична консультація — при сумнівах звертайтесь до лікаря.\n\n' +
      'Заповнити зараз чи повернутись до цього пізніше?',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function askRegReproductiveStatus(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CYCLE_STATUS });
  const p = CONSTANTS.CALLBACK_PREFIXES;
  const keyboard = [
    [{ text: '🔁 Регулярний цикл', callback_data: `${p.REG_CYCLE_ST}:regular` }],
    [{ text: '〰️ Перименопауза (нерегулярно)', callback_data: `${p.REG_CYCLE_ST}:perimenopause` }],
    [{ text: '🛑 Менопауза / немає місячних 12+ міс.', callback_data: `${p.REG_CYCLE_ST}:menopause` }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '🌸 Репродуктивний статус (для персоналізації навантаження)\n\n' +
      'Обери варіант. Дані можна змінити пізніше в профілі.\n\n' +
      '• Регулярний — цикл передбачуваний.\n' +
      '• Перименопауза — нерегулярно; якщо давно не було місячних — план стає обережнішим.\n' +
      '• Менопауза — без циклічних фаз; лінійний план (сила / здоровʼя — за потреби з лікарем).',
    keyboard
  );
}

async function askRegCycleLength(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CYCLE_LEN });
  const k = CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_LEN;
  const keyboard = [
    [
      { text: '24 дн.', callback_data: `${k}:24` },
      { text: '26 дн.', callback_data: `${k}:26` },
      { text: '28 дн.', callback_data: `${k}:28` }
    ],
    [
      { text: '30 дн.', callback_data: `${k}:30` },
      { text: '32 дн.', callback_data: `${k}:32` }
    ]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '📅 Середня довжина циклу (від початку місячних до очікуваного наступного початку).\n\nОбери значення (типово — 28 днів).',
    keyboard
  );
}

async function askRegCycleBleeding(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CYCLE_BLEED });
  const k = CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_BLD;
  const keyboard = [
    [
      { text: '3 дн.', callback_data: `${k}:3` },
      { text: '4 дн.', callback_data: `${k}:4` },
      { text: '5 дн.', callback_data: `${k}:5` }
    ],
    [
      { text: '6 дн.', callback_data: `${k}:6` },
      { text: '7 дн.', callback_data: `${k}:7` }
    ]
  ];
  await Helpers.sendKeyboard(chatId, '🩸 Середня тривалість місячних (кровотечі):', keyboard);
}

async function askRegLastPeriodStart(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CYCLE_LAST });
  const keyboard = [[{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_LAST_SKIP }]];
  await Helpers.sendKeyboard(
    chatId,
    '📆 Коли почалися останні місячні?\n\n' +
      'Введи дату: ДД.ММ.РРРР (наприклад 15.04.2026) — так точніше визначаються фази циклу.\n\n' +
      'Або натисни «Пропустити» і уточни пізніше в профілі.',
    keyboard
  );
}

async function start(chatId, options = {}) {
  const force = !!options.force;
  const stepState = CONSTANTS.FSM_STATES.WAITING_FOR_START_CHOICE;
  await State.set(chatId, { step: stepState });
  const keyboard = [
    [{ text: '✅ Нова реєстрація', callback_data: CONSTANTS.CALLBACKS.REG_NEW }],
    [{ text: '🎟️ У мене є інвайт код', callback_data: CONSTANTS.CALLBACKS.REG_INVITE }]
  ];
  await Helpers.sendKeyboard(chatId, '👋 Привіт! Вітаю в системі FIT 3.0\n\nОбери варіант:', keyboard);
}

/** Показати вибір ролі (після «Нова реєстрація») */
async function showRoleStep(chatId) {
  // keep existing state (e.g., inviteOnboarding) while switching step
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ROLE });
  const keyboard = [
    [{ text: '💪 Тренер', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_COACH }],
    [{ text: '🎯 Учень', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_STUDENT }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '👤 Обери свою роль:\n\n' +
      '💪 Роль “тренер” — ти маєш освіту у сфері фітнесу та є фітнес‑тренером або інструктором у тренажерному залі.\n\n' +
      '🎓 Роль “учень” — ти займаєшся розвитком свого тіла і не тренуєш інших людей.',
    keyboard
  );
}

// ─── Кроки FSM ─────────────────────────────────────────────────────────────

async function askFirstName(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_FIRST_NAME });
  await Helpers.safeSend(chatId, "✍️ Напиши своє ім'я:");
}

async function askCoachDocs(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_COACH_DOCS });
  const keyboard = [
    [{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACKS.REG_COACH_DOCS_SKIP }],
    [{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.REG_COACH_DOCS_DONE }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '📄 Документи тренера\n\n' +
      'Надішли, будь ласка, документи про освіту у сфері фітнесу (фото або файл).\n' +
      'Можна надіслати кілька файлів — потім натисни «✅ Готово».\n\n' +
      'Якщо зараз не зручно — натисни «⏭️ Пропустити».',
    keyboard
  );
}

async function askCoachTrainingTypes(chatId) {
  const state = await State.get(chatId);
  const selected = Array.isArray(state?.regCoachTrainingTypes) ? state.regCoachTrainingTypes : [];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_COACH_TRAINING_TYPES, regCoachTrainingTypes: selected });
  const hasIndividual = selected.includes('individual');
  const hasGroup = selected.includes('group');
  const keyboard = [
    [
      {
        text: `${hasIndividual ? '✅' : '☐'} Індивідуальні (персональні, спліт, тріо)`,
        callback_data: CONSTANTS.CALLBACKS.REG_COACH_TRAINING_TOGGLE_INDIVIDUAL
      }
    ],
    [
      {
        text: `${hasGroup ? '✅' : '☐'} Групові заняття`,
        callback_data: CONSTANTS.CALLBACKS.REG_COACH_TRAINING_TOGGLE_GROUP
      }
    ],
    [{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.REG_COACH_TRAINING_DONE }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '💪 <b>Види тренувань тренера</b>\n\n' +
      'Обери, які формати тренувань ти проводиш (можна кілька):',
    keyboard,
    { parse_mode: 'HTML' }
  );
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
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'gender') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const gender = st?.gender || u?.gender || '';
      if (isFilled(gender)) {
        await askInviteKeepOrEdit(chatId, 'gender', 'Стать', gender === CONSTANTS.GENDERS.MALE ? 'Чоловік' : 'Жінка');
        return;
      }
    }
  }
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
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'birth_date') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const birthDate = st?.birthDate || u?.birthDate || null;
      if (isFilled(birthDate)) {
        await askInviteKeepOrEdit(chatId, 'birth_date', 'Дата народження', birthDate);
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BIRTH_DATE });
  const example = CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE ? CONSTANTS.DATE_FORMATS.EXAMPLE : '15.05.1995';
  await Helpers.safeSend(chatId, "📅 Напиши свою дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: " + example);
}

async function askAccentAvoidChoice(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'accent') {
      await State.update(chatId, { inviteEditField: null, regAccentZones: [], regAvoidZones: [] });
    } else {
      const u = await User.getByChatId(chatId);
      const accent = Array.isArray(st?.regAccentZones) && st.regAccentZones.length ? st.regAccentZones : (u?.accentZones || []);
      if (isFilled(accent)) {
        await askInviteKeepOrEdit(chatId, 'accent', 'Зони акценту', accent);
        return;
      }
    }
  }
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
  await Helpers.sendKeyboard(
    chatId,
    '📐 Заміри тіла потрібні для складання коректного плану тренувань.\n\n' +
      '💡 Ти зможеш у будь-який момент додати або змінити параметри свого тіла в меню «👤 Профіль → 📊 Оновити заміри».\n\n' +
      'Можна пропустити зараз і дозаповнити в профілі пізніше.',
    keyboard
  );
}

async function askRegHeight(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'height') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regHeight != null ? st.regHeight : u?.height;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'height', 'Зріст', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_HEIGHT });
  const v = CONSTANTS.VALIDATION || {};
  const min = v.HEIGHT_MIN != null ? v.HEIGHT_MIN : 100;
  const max = v.HEIGHT_MAX != null ? v.HEIGHT_MAX : 250;
  await Helpers.safeSend(chatId, '📏 Введи зріст (см):\n\nДіапазон: ' + min + '–' + max + '\nПриклад: 175');
}

async function askRegWeight(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'weight') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regWeight != null ? st.regWeight : u?.weight;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'weight', 'Вага', val + ' кг');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WEIGHT });
  const v = CONSTANTS.VALIDATION || {};
  const min = v.WEIGHT_MIN != null ? v.WEIGHT_MIN : 30;
  const max = v.WEIGHT_MAX != null ? v.WEIGHT_MAX : 300;
  await Helpers.safeSend(
    chatId,
    '⚖️ Введи вагу (кг):\n\n' +
      'Підказка: стань на ваги вранці, після туалету, але до прийому їжі або води.\n\n' +
      'Діапазон: ' +
      min +
      '–' +
      max +
      '\nПриклад: 72'
  );
}

async function askRegWaist(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'waist') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regWaist != null ? st.regWaist : u?.waist;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'waist', 'Талія', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WAIST });
  await Helpers.safeSend(
    chatId,
    '⭕ Введи обхват талії (см):\n\n' +
      'Підказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\n' +
      'Приклад: 72'
  );
}

async function askRegHip(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'hip') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regHip != null ? st.regHip : u?.hip;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'hip', 'Стегна', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_HIP });
  await Helpers.safeSend(chatId, '⭕ Введи обхват стегна (см):\n\nВимірюй найширшу частину.\nПриклад: 95');
}

async function askRegGlutes(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'glutes') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regGlutes != null ? st.regGlutes : u?.glutes;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'glutes', 'Ягодиці', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_GLUTES });
  await Helpers.safeSend(
    chatId,
    '⭕ Введи обхват ягодиць (см):\n\n' +
      'Підказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\n' +
      'Приклад: 98'
  );
}

async function askRegArm(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'arm') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regArm != null ? st.regArm : u?.arm;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'arm', 'Біцепс (розслаблено)', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ARM });
  await Helpers.safeSend(
    chatId,
    '💪 Введи обхват біцепса (найширша частина руки у верхній частині) у розслабленому стані (см):\n\n' +
      'Підказка: замір вранці, до тренування. Завжди міряй одну й ту саму руку (зазвичай домінантну).\n' +
      'Рука вздовж тіла, мʼяз повністю розслаблений. Стрічка перпендикулярно руці — у найширшій точці.\n\n' +
      'Приклад: 32'
  );
}

async function askRegArmFlex(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'arm_flex') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regArmFlex != null ? st.regArmFlex : u?.armFlex;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'arm_flex', 'Біцепс (напружено)', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_ARM_FLEX });
  await Helpers.safeSend(
    chatId,
    '💪 Введи обхват біцепса у напруженому стані (см):\n\n' +
      'Підказка: завжди міряй одну й ту саму руку (зазвичай домінантну).\n' +
      'У напруженому стані (пік біцепса): рука зігнута приблизно під 90°, біцепс максимально напружений.\n' +
      'Стрічка — у точці найбільшого випʼячування мʼяза.\n\n' +
      'Приклад: 34'
  );
}

async function askRegNeck(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'neck') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regNeck != null ? st.regNeck : u?.neck;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'neck', 'Шия', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_NECK });
  await Helpers.safeSend(
    chatId,
    '🧣 Введи обхват шиї (см):\n\n' +
      'Підказка:\n' +
      '- Голова прямо, погляд уперед, плечі опущені.\n' +
      '- Якщо ти хлопець: стрічка під кадиком (адамовим яблуком).\n' +
      '- Стрічка строго горизонтально.\n' +
      '- Щільно, але без стиснення (має проходити 1 палець).\n' +
      '- Мʼязи шиї розслаблені.\n\n' +
      'Важливо: заміряй завжди в однаковому положенні голови, не задирай/не опускай підборіддя. Вранці до їжі — шия трохи менша, ніж увечері.\n' +
      'Обхват шиї використовується для розрахунку % жиру, тому точність важлива.\n\n' +
      'Приклад: 36'
  );
}

async function askRegWrist(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'wrist') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regWrist != null ? st.regWrist : u?.wrist;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'wrist', 'Запʼястя', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WRIST });
  await Helpers.safeSend(
    chatId,
    '⌚ Введи обхват запʼястя (см):\n\n' +
      'Підказка: стрічка одразу під кісточкою (найвужче місце), горизонтально та перпендикулярно руці.\n' +
      'Щільно, без зазору, але не перетискай.\n' +
      'Обхват запʼястя — маркер типу тілобудови (кістяка) і впливає на розрахунок оптимальної ваги.\n\n' +
      'Приклад: 16'
  );
}

async function askRegShoulders(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'shoulders') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regShoulders != null ? st.regShoulders : u?.shoulders;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'shoulders', 'Плечі', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_SHOULDERS });
  await Helpers.safeSend(
    chatId,
    '📐 Введи обхват плечей (см):\n\n' +
      'Підказка:\n' +
      '- Стій прямо, руки вільно опущені вздовж тіла.\n' +
      '- Стрічка йде по спині через лопатки і по грудях.\n' +
      '- Плечі нейтральні — не піднімати, не зводити, не розгортати назад.\n' +
      '- Замір робиться на видиху.\n\n' +
      'Часті помилки: зводити плечі вперед (занижує), “розправляти груди” і відводити плечі назад (завищує), нахил стрічки (похибка).\n' +
      'Важливо: завжди однакова поза (краще перед дзеркалом і з помічником). Вранці, до тренування.\n\n' +
      'Приклад: 98'
  );
}

async function askRegChest(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'chest') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regChest != null ? st.regChest : u?.chest;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'chest', 'Груди', val + ' см');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_CHEST });
  await Helpers.safeSend(chatId, '📐 Введіть обхват грудей (см)\nВимірювати по найширшій точці грудної клітки.\nПриклад: 86');
}

async function askRegBodyFat(chatId) {
  const st = await State.get(chatId);
  if (isInviteStudentOnboarding(st)) {
    if (st?.inviteEditField === 'body_fat') {
      await State.update(chatId, { inviteEditField: null });
    } else {
      const u = await User.getByChatId(chatId);
      const val = st?.regBodyFatPct != null ? st.regBodyFatPct : u?.bodyFatPct;
      if (isFilled(val)) {
        await askInviteKeepOrEdit(chatId, 'body_fat', 'Відсоток жиру', val + '%');
        return;
      }
    }
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_FAT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_BODY_FAT_SKIP }]];
  await Helpers.sendKeyboard(chatId, 'Введіть відсоток жиру якщо вимірювали каліпером.\nПриклад: 22.5\nАбо натисніть «Пропустити»', keyboard);
}

const REG_ACTIVITY_JOB_LABELS = { office_sitting: 'Сиджу за комп\'ютером весь день', office_mixed: 'Переважно сиджу, але є пересування', standing: 'Весь день на ногах', physical: 'Фізична праця' };
const REG_ACTIVITY_TRANSPORT_LABELS = { car_transit: 'Машина / транспорт сидячи', walk_bike: 'Пішки або велосипед 20+ хв', combined: 'Комбіновано' };
const REG_ACTIVITY_STEPS_LABELS = { under_5k: 'Менше 5 000', '5k_10k': '5 000 – 10 000', '10k_15k': '10 000 – 15 000', over_15k: 'Більше 15 000' };
const REG_ACTIVITY_EXTRA_LABELS = { none: 'Ні', light: 'Легка (прогулянки, йога)', moderate: 'Помірна (танці, велосипед)', intense: 'Інтенсивна (біг, ігри)' };
const REG_EXPERIENCE_LABELS = {
  newbie: 'Початківець (до 3 міс.)',
  basic: 'Є база (3–12 міс.)',
  regular: 'Регулярно (1–3 роки)',
  advanced: 'Досвідчений (3+ роки)'
};

function experienceLevelToStartDate(level) {
  const now = Date.now();
  if (level === 'newbie') return new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
  if (level === 'basic') return new Date(now - 240 * 24 * 60 * 60 * 1000).toISOString();
  if (level === 'regular') return new Date(now - 730 * 24 * 60 * 60 * 1000).toISOString();
  if (level === 'advanced') return new Date(now - 1460 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function getActivitySummaryForGoals(state = {}, user = {}) {
  const job = state.regActivityJob || user.jobType || null;
  const transport = state.regActivityTransport || user.transportType || null;
  const steps = state.regActivitySteps || user.stepsCategory || null;
  const extra = state.regActivityExtra || user.extraActivity || null;
  const exp = state.regExperienceLevel || null;
  return {
    jobLabel: job ? REG_ACTIVITY_JOB_LABELS[job] || String(job) : '—',
    transportLabel: transport ? REG_ACTIVITY_TRANSPORT_LABELS[transport] || String(transport) : '—',
    stepsLabel: steps ? REG_ACTIVITY_STEPS_LABELS[steps] || String(steps) : '—',
    extraLabel: extra ? REG_ACTIVITY_EXTRA_LABELS[extra] || String(extra) : '—',
    expLabel: exp ? REG_EXPERIENCE_LABELS[exp] || String(exp) : '—'
  };
}

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

async function askRegExperience(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_EXPERIENCE });
  const keyboard = [
    [{ text: REG_EXPERIENCE_LABELS.newbie, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_EXPERIENCE + ':newbie' }],
    [{ text: REG_EXPERIENCE_LABELS.basic, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_EXPERIENCE + ':basic' }],
    [{ text: REG_EXPERIENCE_LABELS.regular, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_EXPERIENCE + ':regular' }],
    [{ text: REG_EXPERIENCE_LABELS.advanced, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_EXPERIENCE + ':advanced' }]
  ];
  await Helpers.sendKeyboard(chatId, '💪 Який у тебе досвід тренувань?', keyboard);
}

async function askCity(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_OBLAST_INPUT, regOblast: null });
  await Helpers.safeSend(chatId, '🗺️ Укажи місце свого проживання в Україні:\n\nВведи область (від 2 літер):');
}

async function askDistrictOptionalAfterCity(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_DISTRICT_INPUT });
  await Helpers.sendKeyboard(
    chatId,
    'Район у межах населеного пункту (необовʼязково). Для сповіщень про нові заклади варто вказати район, якщо хочеш точніші збіги.\n\nНапиши назву району або натисни «Без району».',
    [[{ text: '⏭️ Без району', callback_data: CONSTANTS.CALLBACKS.REG_DISTRICT_SKIP }]]
  );
}

async function proceedFromRegDistrictStep(chatId) {
  const st = await State.get(chatId);
  if (!st) return;
  if (isInviteStudentOnboarding(st)) {
    await askInviteVenuesIfNeeded(chatId);
    return;
  }
  const Venues = require('./venues');
  const ob = String(st.regOblast || '').trim();
  const ci = String(st.city || '').trim();
  await Venues.showRegistrationVenueOffer(chatId, ob, ci);
}

async function askInstagram(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_INSTAGRAM });
  await Helpers.safeSend(chatId, "📸 Надішли посилання на свій Instagram:\n\nПриклад: https://www.instagram.com/your_name\n\nАбо надішли порожнє повідомлення щоб пропустити.");
}

async function askCalendarId(chatId) {
  // Deprecated: Google Calendar integration is no longer used.
  await State.update(chatId, { calendarId: '' });
  await askRegBodyGoalsChoice(chatId);
}

async function askRegBodyGoalsChoice(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHOICE });
  const keyboard = [
    [{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP }],
    [{ text: 'Заповнити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_FILL }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Вказати бажані параметри тіла?\n\n(вага, талія, ягодиці, плечі, груди, біцепс)', keyboard);
}

async function buildRegBodyGoalsWeightPromptText(chatId) {
  const st = await State.get(chatId);
  const user = await User.getByChatId(chatId);
  if (!user) {
    return 'Бажана вага (кг)\nПриклад: 65.0\nАбо натисніть «Пропустити»';
  }
  const userCtx = {
    ...user,
    height: st?.regHeight != null ? st.regHeight : user.height,
    gender: st?.gender || user.gender,
    age: st?.age != null ? st.age : user.age,
    wrist: st?.regWrist != null ? st.regWrist : user.wrist,
    jobType: st?.regActivityJob || user.jobType || null,
    transportType: st?.regActivityTransport || user.transportType || null,
    stepsCategory: st?.regActivitySteps || user.stepsCategory || null,
    extraActivity: st?.regActivityExtra || user.extraActivity || null,
    experienceStartDate:
      st?.regExperienceStartDate != null ? st.regExperienceStartDate : user.experienceStartDate || null
  };
  const current = {
    weight: st?.regWeight != null ? st.regWeight : user.weight,
    waist: st?.regWaist != null ? st.regWaist : user.waist,
    glutes: st?.regGlutes != null ? st.regGlutes : user.glutes,
    shoulders: st?.regShoulders != null ? st.regShoulders : user.shoulders,
    chest: st?.regChest != null ? st.regChest : user.chest,
    neck: st?.regNeck != null ? st.regNeck : user.neck,
    wrist: st?.regWrist != null ? st.regWrist : user.wrist
  };
  let hintBlock = '';
  try {
    const model = bodyGoals.calcUnifiedIdealModel(userCtx);
    const med = model && model.weight ? model.weight.medical : null;
    const aest = model && model.weight ? model.weight.aesthetic : null;
    if (med && aest && med.min != null && med.max != null && aest.min != null && aest.max != null) {
      const activity = getActivitySummaryForGoals(st || {}, user || {});
      const comfortLine =
        aest.comfort != null ? `комфортна орієнтирна вага FIT — ${aest.comfort} кг.\n` : '';
      const ageBandLine =
        med.ageBand === '50_plus'
          ? 'вікова категорія: 50+\n'
          : med.ageBand === '36_49'
            ? 'вікова категорія: 36–49\n'
            : 'вікова категорія: 18–35\n';
      hintBlock =
        '🤖 Орієнтир за єдиним алгоритмом FIT:\n' +
        `медична вилка (ІМТ за віком) — ${med.min}–${med.max} кг.\n` +
        `естетична вилка FIT — ${aest.min}–${aest.max} кг.\n` +
        comfortLine +
        ageBandLine +
        '\n' +
        'Щоденна активність (не входить у формулу вилки, для контексту):\n' +
        `• Робота: ${activity.jobLabel}\n` +
        `• Транспорт: ${activity.transportLabel}\n` +
        `• Кроки: ${activity.stepsLabel}\n` +
        `• Додаткова активність: ${activity.extraLabel}\n` +
        `• Досвід: ${activity.expLabel}\n` +
        `• Рівень активності FIT: ${model.activity && model.activity.labelUa ? model.activity.labelUa : '—'}\n\n`;
    }
  } catch (e) {
    console.error('Registration.buildRegBodyGoalsWeightPromptText', e.message);
  }
  return (
    hintBlock +
    'Бажана вага (кг)\nПриклад: 65.0\nАбо натисніть «Пропустити»'
  );
}

async function askRegBodyGoalsWeight(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WEIGHT }]];
  const text = await buildRegBodyGoalsWeightPromptText(chatId);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function buildGoalRangeLine(chatId, goalField) {
  const st = await State.get(chatId);
  const user = await User.getByChatId(chatId);
  if (!user) return '';
  const userCtx = {
    ...user,
    height: st?.regHeight != null ? st.regHeight : user.height,
    gender: st?.gender || user.gender,
    age: st?.age != null ? st.age : user.age,
    wrist: st?.regWrist != null ? st.regWrist : user.wrist,
    jobType: st?.regActivityJob || user.jobType || null,
    transportType: st?.regActivityTransport || user.transportType || null,
    stepsCategory: st?.regActivitySteps || user.stepsCategory || null,
    extraActivity: st?.regActivityExtra || user.extraActivity || null,
    experienceStartDate:
      st?.regExperienceStartDate != null ? st.regExperienceStartDate : user.experienceStartDate || null
  };
  const model = bodyGoals.calcUnifiedIdealModel(userCtx);
  if (!model) return '';
  if (goalField === 'goal_waist' && model.waist) {
    const realistic = model.waistRealistic || model.waist;
    const optimal = model.waistOptimal || model.waist;
    return `Талія (реалістично зараз): ${realistic.min}–${realistic.max} см.\nТалія (оптимальна ціль): ${optimal.min}–${optimal.max} см.\n`;
  }
  if (goalField === 'goal_hips' && model.hips) {
    const realistic = model.hipsRealistic || model.hips;
    const optimal = model.hipsOptimal || model.hips;
    return `Ягодиці (реалістично зараз): ${realistic.min}–${realistic.max} см.\nЯгодиці (оптимальна ціль): ${optimal.min}–${optimal.max} см.\n`;
  }
  if (goalField === 'goal_shoulders' && model.shoulders) {
    const realistic = model.shouldersRealistic || model.shoulders;
    const optimal = model.shouldersOptimal || model.shoulders;
    return `Плечі (реалістично зараз): ${realistic.min}–${realistic.max} см.\nПлечі (оптимальна ціль): ${optimal.min}–${optimal.max} см.\n`;
  }
  if (goalField === 'goal_chest' && model.chest) {
    return `Орієнтирна вилка для грудей: ${model.chest.min}–${model.chest.max} см.\n`;
  }
  if (goalField === 'goal_arm' && model.biceps) {
    return `Орієнтирна вилка для біцепса: ${model.biceps.min}–${model.biceps.max} см.\n`;
  }
  return '';
}

async function askRegBodyGoalsWaist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_WAIST }]];
  const range = await buildGoalRangeLine(chatId, 'goal_waist');
  await Helpers.sendKeyboard(chatId, `${range}Бажана талія (см)\nПриклад: 70.0\nАбо натисніть «Пропустити»`, keyboard);
}

async function askRegBodyGoalsHips(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_HIPS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_HIPS }]];
  const range = await buildGoalRangeLine(chatId, 'goal_hips');
  await Helpers.sendKeyboard(chatId, `${range}Бажані ягодиці (см)\nПриклад: 95.0\nАбо натисніть «Пропустити»`, keyboard);
}

async function askRegBodyGoalsShoulders(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_SHOULDERS }]];
  const range = await buildGoalRangeLine(chatId, 'goal_shoulders');
  await Helpers.sendKeyboard(chatId, `${range}Бажані плечі (см)\nПриклад: 105.0\nАбо натисніть «Пропустити»`, keyboard);
}

async function askRegBodyGoalsChest(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_CHEST }]];
  const range = await buildGoalRangeLine(chatId, 'goal_chest');
  const text = `${range}Бажані груди (см)\nПриклад: 90.0\nАбо натисніть «Пропустити»`;
  try {
    await Helpers.sendKeyboard(chatId, text, keyboard);
  } catch (e) {
    // Fallback to plain message so the registration flow never "hangs" for the user.
    console.error('Registration.askRegBodyGoalsChest', e && e.message ? e.message : e);
    await Helpers.safeSend(chatId, text);
  }
}

async function askRegBodyGoalsArm(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_ARM });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_ARM }]];
  const range = await buildGoalRangeLine(chatId, 'goal_arm');
  await Helpers.sendKeyboard(chatId, `${range}Бажаний біцепс (см)\nПриклад: 34.0\nАбо натисніть «Пропустити»`, keyboard);
}

async function saveRegBodyGoalsAndFinish(chatId, goals) {
  const hasAny = goals.goal_weight != null || goals.goal_waist != null || goals.goal_hips != null || goals.goal_shoulders != null || goals.goal_chest != null || goals.goal_arm != null;
  if (hasAny) {
    const st = await State.get(chatId);
    const user = await User.getByChatId(chatId);
    const userCtx = {
      ...(user || {}),
      height: st?.regHeight != null ? st.regHeight : user?.height,
      gender: st?.gender || user?.gender,
      age: st?.age != null ? st.age : user?.age
    };
    const current = {
      weight: st?.regWeight != null ? st.regWeight : user?.weight,
      waist: st?.regWaist != null ? st.regWaist : user?.waist,
      glutes: st?.regGlutes != null ? st.regGlutes : user?.glutes,
      shoulders: st?.regShoulders != null ? st.regShoulders : user?.shoulders,
      chest: st?.regChest != null ? st.regChest : user?.chest,
      arm: st?.regArm != null ? st.regArm : user?.arm
    };
    const analysis = bodyGoals.analyzeGoalsVsCurrentState(goals, userCtx, current, 'registration_goals_save');
    const bgRes = await supabase.upsertBodyGoals(null, chatId, goals, analysis);
    if (!bgRes || !bgRes.ok) console.error('Registration: upsertBodyGoals failed', bgRes && bgRes.error);
    await Helpers.safeSend(chatId, '💡 Для точнішої валідації заповніть зріст у профілі.');
  }
  await finishRegistration(chatId);
}

const INVITE_CODE_PATTERN = /^INVITE_[A-Za-z0-9]+$/i;

function isInviteStudentOnboarding(state) {
  return !!(state && state.inviteOnboarding === true && state.role === CONSTANTS.ROLES.STUDENT);
}

function isFilled(v) {
  if (v == null) return false;
  if (typeof v === 'string') return String(v).trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Universal invite rows are created with technical placeholder fields
 * (e.g., firstName = "Інвайт", role = student). This should not be treated
 * as real prefilled profile data for onboarding questions.
 */
function isInvitePlaceholderUser(u) {
  if (!u) return false;
  const first = String(u.firstName || '')
    .trim()
    .toLowerCase();
  const last = String(u.lastName || '').trim();
  const city = String(u.city || '').trim();
  const oblast = String(u.oblast || '').trim();
  const hasRealProfileData =
    isFilled(u.gender) ||
    isFilled(u.birthDate) ||
    isFilled(u.height) ||
    isFilled(u.weight) ||
    isFilled(u.waist) ||
    isFilled(u.hip) ||
    isFilled(u.glutes) ||
    isFilled(u.arm) ||
    isFilled(u.armFlex) ||
    isFilled(u.neck) ||
    isFilled(u.wrist) ||
    isFilled(u.shoulders) ||
    isFilled(u.chest) ||
    isFilled(u.bodyFatPct);
  const isTechFirstName = first === 'інвайт' || first === 'invite';
  return isTechFirstName && !isFilled(last) && !isFilled(city) && !isFilled(oblast) && !hasRealProfileData;
}

async function ensureInvitePrefillSession(chatId, state) {
  if (isInviteStudentOnboarding(state)) return state;
  // Recover stale state (e.g., callback clicked after bot restart) instead of
  // dropping user to main menu.
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.REG_INVITE_PREFILL_REVIEW,
    inviteOnboarding: true,
    role: CONSTANTS.ROLES.STUDENT
  });
  return State.get(chatId);
}

function inviteProfileFromUser(st, u) {
  const fromUser = u && !isInvitePlaceholderUser(u);
  return {
    firstName: st?.firstName || (fromUser ? u.firstName : '') || '',
    lastName: st?.lastName || (fromUser ? u.lastName : '') || '',
    oblast: st?.regVenueOblast || st?.regOblast || (fromUser ? u.oblast : '') || '',
    city: st?.city || (fromUser ? u.city : '') || ''
  };
}

function prefillValueText(field, value) {
  if (!isFilled(value)) return '—';
  if (field === 'role') return value === CONSTANTS.ROLES.COACH ? 'Тренер' : 'Учень';
  if (field === 'name') return String(value);
  if (field === 'location') return String(value);
  if (field === 'birth_date') {
    const d = value instanceof Date ? value : new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('uk-UA');
  }
  if (field === 'accent' || field === 'avoid') {
    const arr = Array.isArray(value) ? value : [];
    if (!arr.length) return 'Не вказано';
    return arr.map((z) => ACCENT_LABELS[z] || z).join(', ');
  }
  if (field === 'venues') {
    const arr = Array.isArray(value) ? value : [];
    if (!arr.length) return 'Не обрано';
    return arr.map((v) => v && v.nameUa ? v.nameUa : '').filter(Boolean).join(', ');
  }
  return String(value);
}

async function askInviteKeepOrEdit(chatId, field, title, value) {
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.REG_INVITE_PREFILL_REVIEW,
    inviteReviewField: field
  });
  const keyboard = [
    [{ text: '✅ Залишити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_KEEP + ':' + field }],
    [{ text: '✏️ Змінити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_EDIT + ':' + field }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    `ℹ️ ${title} вже заповнено:\n<b>${Helpers.escapeHtml(prefillValueText(field, value))}</b>\n\nЗалишити чи змінити?`,
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function askInviteNameIfNeeded(chatId) {
  const st = await State.get(chatId);
  if (!isInviteStudentOnboarding(st)) {
    await askFirstName(chatId);
    return;
  }
  if (st?.inviteEditField === 'name') {
    await State.update(chatId, { inviteEditField: null });
    await askFirstName(chatId);
    return;
  }
  const u = await User.getByChatId(chatId);
  const prof = inviteProfileFromUser(st, u);
  if (isFilled(prof.firstName) && isFilled(prof.lastName)) {
    await askInviteKeepOrEdit(chatId, 'name', 'Імʼя та прізвище', `${prof.firstName} ${prof.lastName}`.trim());
    return;
  }
  await askFirstName(chatId);
}

async function askInviteRoleIfNeeded(chatId) {
  const st = await State.get(chatId);
  if (!st || st.inviteOnboarding !== true) {
    await showRoleStep(chatId);
    return;
  }
  if (st?.inviteEditField === 'role') {
    await State.update(chatId, { inviteEditField: null });
    await showRoleStep(chatId);
    return;
  }
  const u = await User.getByChatId(chatId);
  const role = st?.role || (isInvitePlaceholderUser(u) ? '' : u?.role || '');
  if (isFilled(role)) {
    await askInviteKeepOrEdit(chatId, 'role', 'Роль', role);
    return;
  }
  await showRoleStep(chatId);
}

async function askInviteLocationIfNeeded(chatId) {
  const st = await State.get(chatId);
  if (!isInviteStudentOnboarding(st)) {
    await askCity(chatId);
    return;
  }
  if (st?.inviteEditField === 'location' || st?.inviteEditField === 'city') {
    await State.update(chatId, { inviteEditField: null });
    await askCity(chatId);
    return;
  }
  const u = await User.getByChatId(chatId);
  const prof = inviteProfileFromUser(st, u);
  if (isFilled(prof.city) || isFilled(prof.oblast)) {
    const lines = [];
    if (isFilled(prof.oblast)) lines.push(`Область: ${prof.oblast}`);
    if (isFilled(prof.city)) lines.push(`Місто: ${prof.city}`);
    await askInviteKeepOrEdit(chatId, 'location', 'Місце проживання', lines.join('\n') || '—');
    return;
  }
  await askCity(chatId);
}

async function showInviteVenuesPicker(chatId, page = 0) {
  const st = await State.get(chatId);
  const city = String(st?.regVenueCity || st?.city || '').trim();
  const oblast = String(st?.regVenueOblast || '').trim();
  const selected = Array.isArray(st?.regVenueSelectedIds) ? st.regVenueSelectedIds : [];

  const list = await supabase.searchVenues({
    oblast: oblast || '',
    city: city || '',
    limit: 60
  });
  const p = Math.max(0, parseInt(String(page || 0), 10) || 0);
  const perPage = 8;
  const from = p * perPage;
  const slice = (list || []).slice(from, from + perPage);
  const pages = Math.max(1, Math.ceil((list || []).length / perPage));

  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.REG_INVITE_VENUES_PICK,
    regVenueSelectedIds: selected,
    regVenuePage: p
  });

  const keyboard = [];
  for (const v of slice) {
    const id = String(v.id);
    const nameLabel = `📍 ${v.nameUa || 'Заклад'}${v.city ? ' — ' + v.city : ''}`;
    const toggleLabel = selected.includes(id) ? '✅ Обрано' : '☑️ Обрати';
    keyboard.push([
      {
        text: nameLabel.length > 40 ? nameLabel.slice(0, 37) + '…' : nameLabel,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_CARD + ':' + id
      },
      { text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_TOGGLE + ':' + id }
    ]);
  }
  if (pages > 1) {
    const nav = [];
    if (p > 0) nav.push({ text: '◀️ Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_PAGE + ':' + (p - 1) });
    if (p < pages - 1) nav.push({ text: 'Далі ▶️', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_PAGE + ':' + (p + 1) });
    if (nav.length) keyboard.push(nav);
  }
  keyboard.push([{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_DONE }]);
  keyboard.push([{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_SKIP }]);

  const place = [city, oblast].filter(Boolean).join(', ');
  await Helpers.sendKeyboard(
    chatId,
    `🏢 Обери заклади у місті ${place || 'з профілю'} (можна декілька):\n\nОбрано: ${selected.length}`,
    keyboard
  );
}

async function showInviteVenueCard(chatId, venueId) {
  const st = await State.get(chatId);
  if (!st || st.step !== CONSTANTS.FSM_STATES.REG_INVITE_VENUES_PICK) return;
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const v = await supabase.getVenueById(vid);
  if (!v) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return;
  }
  const dirGc = await supabase.getVenueDirectoryCodes('group_class');
  const dirGroupMap = new Map(dirGc.map((d) => [d.code, d.labelUa]));
  const dirAmn = await supabase.getVenueDirectoryCodes('amenity');
  const dirAmnMap = new Map(dirAmn.map((d) => [d.code, d.labelUa]));
  const links = [];
  if (v.telegramUrl) links.push(`<a href="${Helpers.escapeHtml(v.telegramUrl)}">Telegram</a>`);
  if (v.instagramUrl) links.push(`<a href="${Helpers.escapeHtml(v.instagramUrl)}">Instagram</a>`);
  const linkLine = links.length ? '\n' + links.join(' · ') : '';
  const amnFacets = (v.facets || []).filter((f) => f.facetKind === 'amenity');
  const amnLine =
    amnFacets.length > 0
      ? '\n✨ ' +
        amnFacets
          .map((f) => Helpers.escapeHtml(dirAmnMap.get(f.code) || f.code))
          .join(', ')
      : '';
  const gcFacets = (v.facets || []).filter((f) => f.facetKind === 'group_class');
  const gcLine =
    gcFacets.length > 0
      ? '\n🏷 ' +
        gcFacets
          .map((f) => Helpers.escapeHtml(f.labelUa || dirGroupMap.get(f.code) || f.code))
          .join(', ')
      : '';
  const coaches = await supabase.listVenueCoaches(vid);
  const coachLines = coaches.length
    ? '\n\n🧑‍🏫 <b>Тренери закладу</b>\n' +
      coaches
        .map((c) => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
          return `• ${Helpers.escapeHtml(full)}${c.isPrimary ? ' ⭐' : ''}`;
        })
        .join('\n')
    : '';
  const text =
    `<b>${Helpers.escapeHtml(v.nameUa || 'Заклад')}</b>\n` +
    `${Helpers.escapeHtml(v.city || '')}${v.oblast ? ', ' + Helpers.escapeHtml(v.oblast) : ''}` +
    (v.address ? `\n📫 ${Helpers.escapeHtml(v.address)}` : '') +
    amnLine +
    gcLine +
    linkLine +
    coachLines;
  await Helpers.safeSend(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
  if (v.latitude != null && v.longitude != null) {
    await telegram.sendLocation(chatId, v.latitude, v.longitude);
  }
  const selected = Array.isArray(st.regVenueSelectedIds) ? st.regVenueSelectedIds : [];
  const isSelected = selected.includes(vid);
  await Helpers.sendKeyboard(chatId, 'Дії з закладом:', [
    [{ text: isSelected ? '✅ Заклад обрано (натисни, щоб прибрати)' : '☑️ Обрати цей заклад', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_TOGGLE + ':' + vid }],
    [{ text: '📋 До списку закладів', callback_data: CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_PAGE + ':' + String(st.regVenuePage || 0) }]
  ]);
}

async function askInviteVenuesIfNeeded(chatId) {
  const st = await State.get(chatId);
  if (!isInviteStudentOnboarding(st)) return;
  const city = String(st?.regVenueCity || st?.city || '').trim();
  const oblast = String(st?.regVenueOblast || '').trim();
  const place = [city, oblast].filter(Boolean).join(', ');
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_INVITE_VENUES_PICK, inviteEditField: null });
  await Helpers.sendKeyboard(
    chatId,
    `🏢 Спортивні та фітнес організації міста: ${place || '—'}\n\nОбери дію нижче:`,
    [
      [{ text: '🔎 Показати заклади міста', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_VENUES_OPEN }],
      [{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_VENUES_SKIP }]
    ]
  );
}

async function openInviteVenuesPicker(chatId) {
  const st = await State.get(chatId);
  if (!isInviteStudentOnboarding(st)) return;
  const inviteHasCoach = !!String(st?.inviteCoachId || '').trim();
  if (st?.inviteEditField === 'venues') {
    await State.update(chatId, { inviteEditField: null, regVenueSelectedIds: [] });
    await showInviteVenuesPicker(chatId, 0);
    return;
  }
  // For universal invites from help-bot (without coachId), do not prefill
  // venues from old profile links. Always ask to choose venues explicitly.
  if (!inviteHasCoach) {
    await showInviteVenuesPicker(chatId, 0);
    return;
  }
  const linked = await supabase.getUserVenues(chatId);
  if (linked && linked.length > 0) {
    await askInviteKeepOrEdit(chatId, 'venues', 'Заклади у профілі', linked);
    return;
  }
  await showInviteVenuesPicker(chatId, 0);
}

async function askInviteAiIntro(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_INVITE_AI_INTRO });
  const keyboard = [
    [{ text: '✅ Продовжити заповнення', callback_data: CONSTANTS.CALLBACKS.REG_AI_CONTINUE }],
    [{ text: '⏭️ Заповнити пізніше', callback_data: CONSTANTS.CALLBACKS.REG_AI_LATER }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '📋 Наступний крок: введи свої данні, **поточні** фізичні параметри (заміри), щоденну активність і **бажані** параметри тіла.\n\n' +
      '🤖 Дані потрібні для AI-аналітики тілобудови та коректного плану тренувань для максимального результату.\n\n' +
      'Можеш продовжити зараз або повернутись до заповнення пізніше.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function sendGoalRealtimeFeedback(chatId, goalsPatch) {
  try {
    const st = await State.get(chatId);
    const user = await User.getByChatId(chatId);
    if (!user) return;

    const goals = {
      goal_weight: st?.regGoalWeight != null ? st.regGoalWeight : null,
      goal_waist: st?.regGoalWaist != null ? st.regGoalWaist : null,
      goal_hips: st?.regGoalHips != null ? st.regGoalHips : null,
      goal_shoulders: st?.regGoalShoulders != null ? st.regGoalShoulders : null,
      goal_chest: st?.regGoalChest != null ? st.regGoalChest : null,
      goal_arm: st?.regGoalArm != null ? st.regGoalArm : null,
      ...(goalsPatch || {})
    };
    const current = {
      weight: st?.regWeight != null ? st.regWeight : user.weight,
      waist: st?.regWaist != null ? st.regWaist : user.waist,
      glutes: st?.regGlutes != null ? st.regGlutes : user.glutes,
      shoulders: st?.regShoulders != null ? st.regShoulders : user.shoulders,
      chest: st?.regChest != null ? st.regChest : user.chest,
      arm: st?.regArm != null ? st.regArm : user.arm
    };
    const userCtx = {
      ...user,
      height: st?.regHeight != null ? st.regHeight : user.height,
      gender: st?.gender || user.gender,
      age: st?.age != null ? st.age : user.age,
      jobType: st?.regActivityJob || user.jobType || null,
      transportType: st?.regActivityTransport || user.transportType || null,
      stepsCategory: st?.regActivitySteps || user.stepsCategory || null,
      extraActivity: st?.regActivityExtra || user.extraActivity || null,
      experienceStartDate: st?.regExperienceStartDate || user.experienceStartDate || null
    };
    const analysis = bodyGoals.analyzeGoalsVsCurrentState(goals, userCtx, current, 'registration_goal_step');
    const lines = [];
    const changedGoalKey = goalsPatch && typeof goalsPatch === 'object'
      ? Object.keys(goalsPatch).find((k) => goalsPatch[k] != null)
      : null;
    if (changedGoalKey) {
      const currentMap = {
        goal_weight: current.weight,
        goal_waist: current.waist,
        goal_hips: current.glutes,
        goal_shoulders: current.shoulders,
        goal_chest: current.chest,
        goal_arm: current.arm
      };
      const realism = bodyGoals.evaluateGoalRealism(
        changedGoalKey,
        goals[changedGoalKey],
        currentMap[changedGoalKey],
        userCtx
      );
      if (realism) {
        const term =
          realism.weeks != null
            ? `Орієнтовний строк: ~${realism.weeks} тиж.`
            : (realism.months != null ? `Орієнтовний строк: ~${realism.months} міс.` : null);
        lines.push(`📌 Реалістичність цілі: ${realism.verdict}`);
        if (term) lines.push(term);
      }
    }
    if (analysis.errors && analysis.errors.length) {
      lines.push('⚠️ ' + analysis.errors[0].message);
    } else {
      const deltaItems = Array.isArray(analysis.deltaItems) ? analysis.deltaItems : [];
      if (deltaItems.length) {
        const last = deltaItems[deltaItems.length - 1];
        if (last && !last.reached) {
          lines.push(`📈 ${last.label}: орієнтовний термін до цілі ~${last.months} міс.`);
        } else if (last && last.reached) {
          lines.push(`✅ ${last.label}: ціль уже досягнута.`);
        }
      }
      if (bodyGoals.shouldShowAIComment(analysis)) {
        const block = bodyGoals.buildDeterministicGoalsBlock(analysis);
        const aiText = await goalsAI.generateText(block);
        if (aiText) lines.push(aiText);
      }
    }
    if (lines.length) await Helpers.safeSend(chatId, lines.join('\n\n'));
  } catch (e) {
    console.error('Registration.sendGoalRealtimeFeedback', e.message);
  }
}

async function askInviteCode(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_INVITE_INPUT });
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
  await Helpers.sendKeyboard(chatId, "🎟️ Введи інвайт код:\n\nПриклад: INVITE_A3F7", keyboard);
}

function loadOfferTextSafe() {
  try {
    const filePath = path.join(__dirname, '..', 'OFERTA.md');
    const raw = fs.readFileSync(filePath, 'utf8');
    return String(raw || '').trim();
  } catch (e) {
    console.error('Registration.loadOfferTextSafe', e.message);
    return '';
  }
}

async function showBetaClosedNewRegistrationMessage(chatId) {
  const text =
    'Платформа FIT 3.0 зараз у режимі закритого бета‑тестування.\n' +
    'Доступ можливий лише за запрошенням (інвайт‑кодом).\n\n' +
    'Якщо потрібен доступ, запис у лист очікування або хочеш залишити пропозиції — напиши розробнику.';
  const keyboard = [
    [{ text: '💬 Написати розробнику', url: CONSTANTS.URLS.DEV_HELP_BOT }],
    [{ text: '🎟️ У мене є інвайт код', callback_data: CONSTANTS.CALLBACKS.REG_INVITE }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showInviteOfferGate(chatId, inviteCode) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_INVITE_OFFER, pendingInviteCode: inviteCode });
  const keyboard = [
    [{ text: '📋 Читати угоду', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_READ }],
    [
      { text: '✅ Приймаю умови', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_ACCEPT },
      { text: '❌ Відмовитись', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_DECLINE }
    ],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  const text =
    '📄 Перед початком роботи:\n\n' +
    'Ви отримали запрошення до закритого\n' +
    'бета‑тестування платформи FIT 3.0 / MA‑YaG\n\n' +
    'Оберіть дію нижче:';
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function finishRegistration(chatId) {
  try {
    const stateData = await State.get(chatId);
    if (!stateData || !stateData.role || !stateData.firstName) {
      await Helpers.safeSend(chatId, "❌ Недостатньо даних для реєстрації. Почни з /start");
      await State.clear(chatId);
      return;
    }
    const oblastSave = String(stateData.regOblast || stateData.regVenueOblast || '').trim();
    const districtSave = String(stateData.regDistrict || '').trim();
    const userData = {
      chatId: String(chatId),
      role: stateData.role,
      firstName: stateData.firstName,
      lastName: stateData.lastName || '',
      city: stateData.city || '',
      oblast: oblastSave,
      district: districtSave,
      gender: stateData.gender || '',
      goal: stateData.goal || '',
      birthDate: stateData.birthDate || null,
      age: stateData.age != null ? stateData.age : null,
      instagram: stateData.instagram || '',
      coachTrainingTypes: Array.isArray(stateData.regCoachTrainingTypes) ? stateData.regCoachTrainingTypes : [],
      calendarId: stateData.calendarId || '',
      experienceStartDate: stateData.regExperienceStartDate || null,
      accentZones: Array.isArray(stateData.regAccentZones) && stateData.regAccentZones.length > 0 ? stateData.regAccentZones : (stateData.regAccentZones === undefined ? [] : [].concat(stateData.regAccentZones || [])),
      avoidZones: Array.isArray(stateData.regAvoidZones) ? stateData.regAvoidZones : (stateData.regAvoidZones ? [].concat(stateData.regAvoidZones) : [])
    };
    // During invite activation we may already have a users row; in that case update profile instead of failing.
    const existing = await User.getByChatId(String(chatId));
    if (existing) {
      const ok = await supabase.updateUser(String(chatId), {
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        city: userData.city,
        oblast: userData.oblast || null,
        district: userData.district || null,
        gender: userData.gender,
        goal: userData.goal,
        birthDate: userData.birthDate || null,
        age: userData.age != null ? userData.age : null,
        instagram: userData.instagram,
        coachTrainingTypes: userData.coachTrainingTypes,
        calendarId: userData.calendarId,
        experienceStartDate: userData.experienceStartDate || null,
        accentZones: userData.accentZones,
        avoidZones: userData.avoidZones
      });
      if (!ok) throw new Error('Failed to update user');
    } else {
      await User.createUser(userData);
    }
    await supabase.syncUserIdToChatId(String(chatId));
    await supabase.touchUserInviteRegistrationStarted(chatId);
    const hasMeasurements = stateData.regHeight != null || stateData.regWeight != null || stateData.regWaist != null || stateData.regHip != null || stateData.regGlutes != null || stateData.regArm != null || stateData.regArmFlex != null || stateData.regNeck != null || stateData.regWrist != null || stateData.regShoulders != null || stateData.regChest != null || stateData.regBodyFatPct != null;
    if (hasMeasurements) {
      const updates = {};
      if (stateData.regHeight != null) updates.height = stateData.regHeight;
      if (stateData.regWeight != null) updates.weight = stateData.regWeight;
      if (stateData.regWaist != null) updates.waist = stateData.regWaist;
      if (stateData.regHip != null) updates.hip = stateData.regHip;
      if (stateData.regGlutes != null) updates.glutes = stateData.regGlutes;
      if (stateData.regArm != null) updates.arm = stateData.regArm;
      if (stateData.regArmFlex != null) updates.armFlex = stateData.regArmFlex;
      if (stateData.regNeck != null) updates.neck = stateData.regNeck;
      if (stateData.regWrist != null) updates.wrist = stateData.regWrist;
      if (stateData.regShoulders != null) updates.shoulders = stateData.regShoulders;
      if (stateData.regChest != null) updates.chest = stateData.regChest;
      if (stateData.regBodyFatPct != null) updates.bodyFatPct = stateData.regBodyFatPct;
      await supabase.updateUser(String(chatId), updates);
      await supabase.insertMeasurement({
        chatId: String(chatId),
        date: new Date(),
        height: stateData.regHeight,
        weight: stateData.regWeight,
        waist: stateData.regWaist,
        hip: stateData.regHip,
        glutes: stateData.regGlutes,
        arm: stateData.regArm,
        armFlex: stateData.regArmFlex,
        neck: stateData.regNeck,
        wrist: stateData.regWrist,
        shoulders: stateData.regShoulders,
        chest: stateData.regChest,
        bodyFatPct: stateData.regBodyFatPct,
        source: 'registration'
      });
    }
    await bodyAnalysisAI.generateAndSend(String(chatId), 'self_registration', {
      height: stateData.regHeight != null ? stateData.regHeight : null,
      weight: stateData.regWeight != null ? stateData.regWeight : null,
      waist: stateData.regWaist != null ? stateData.regWaist : null,
      hip: stateData.regHip != null ? stateData.regHip : null,
      glutes: stateData.regGlutes != null ? stateData.regGlutes : null,
      shoulders: stateData.regShoulders != null ? stateData.regShoulders : null,
      chest: stateData.regChest != null ? stateData.regChest : null,
      neck: stateData.regNeck != null ? stateData.regNeck : null,
      wrist: stateData.regWrist != null ? stateData.regWrist : null,
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
    if (
      userData.gender === CONSTANTS.GENDERS.FEMALE &&
      stateData.regReproductiveStatus &&
      ['regular', 'perimenopause', 'menopause'].includes(String(stateData.regReproductiveStatus))
    ) {
      let iso = null;
      if (stateData.regLastPeriodStart) {
        const s = String(stateData.regLastPeriodStart);
        iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
      }
      await supabase.upsertUserCycleSettings(String(chatId), {
        reproductiveStatus: stateData.regReproductiveStatus,
        avgCycleLengthDays: stateData.regAvgCycleLength != null ? stateData.regAvgCycleLength : null,
        avgBleedingDays: stateData.regAvgBleedingDays != null ? stateData.regAvgBleedingDays : null,
        lastPeriodStart: iso,
        lastPeriodUserEntered: !!iso
      });
      if (iso) {
        await supabase.insertCycleEventLog(String(chatId), {
          eventType: 'period_start',
          eventDate: iso,
          source: 'registration'
        });
      }
    }
    await State.clear(chatId);
    const roleText = userData.role === CONSTANTS.ROLES.COACH ? 'тренере' : 'учне';
    await Helpers.safeSend(chatId, "🎉 Вітаю, " + userData.firstName + "!\n\nРеєстрацію завершено. Ласкаво просимо в FIT 3.0, " + roleText + "!");
    if (userData.gender === CONSTANTS.GENDERS.FEMALE && stateData.regCycleDeferred) {
      await Helpers.safeSend(
        chatId,
        '🌸 Ви відклали заповнення даних про цикл.\n\n' +
          'Коли будете готові: 👤 Мій профіль → ✏️ Редагувати дані → 🌸 **Цикл і менопауза** ' +
          '(статус, менопауза, довжина циклу, дата початку).',
        { parse_mode: 'Markdown' }
      );
    } else if (
      userData.role === CONSTANTS.ROLES.STUDENT &&
      userData.gender === CONSTANTS.GENDERS.FEMALE &&
      ['regular', 'perimenopause'].includes(String(stateData.regReproductiveStatus || ''))
    ) {
      await Helpers.safeSend(
        chatId,
        '🌸 Нагадування: коли почнуться місячні, підтвердьте це в профілі:\n' +
          '👤 Мій профіль → ✏️ Редагувати дані → 🌸 Цикл і менопауза.\n\n' +
          'Це допоможе точніше адаптувати навантаження.'
      );
    }
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
    const updated = await State.get(chatId);
    // After invite activation we continue onboarding immediately (no "continue vs training" fork)
    if (updated && updated.inviteOnboarding === true) {
      await askLastName(chatId);
    } else {
      await askContinueOrStart(chatId);
    }
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_FIRST_NAME_DECISION) {
    await Helpers.safeSend(chatId, "⚠️ Обери дію кнопкою нижче.");
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CYCLE_INTRO) {
    await Helpers.safeSend(chatId, '⚠️ Обери «Заповнити зараз» або «Заповнити пізніше» кнопкою вище.');
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_INVITE_INPUT) {
    const inviteCode = String(text).trim().toUpperCase();
    if (!INVITE_CODE_PATTERN.test(inviteCode)) {
      await Helpers.safeSend(chatId, "⚠️ Невірний формат коду.\n\nКод має починатися з INVITE_\nПриклад: INVITE_A3F7\n\nСпробуй ще раз:");
      return true;
    }
    try {
      const inviteUser = await supabase.findUserByInviteCode(inviteCode);
      if (!inviteUser) throw new Error('Invite code not found');
      if (String(inviteUser.chatId) !== String(inviteCode)) throw new Error('Invite code already activated');
      await showInviteOfferGate(chatId, inviteCode);
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : '';
      let hint = '';
      if (msg === 'Invite code not found') hint = '\n\nКод не знайдено в базі. Перевір написання (INVITE_…) або попроси тренера новий код.';
      else if (msg === 'Invite code already activated') hint = '\n\nКод уже використано. Якщо ти вже прив’язаний до тренера — відкрий головне меню.';
      else if (msg === 'This Telegram account is already registered') hint = '\n\nЦей акаунт уже зареєстрований, але прив’язка до тренера не вдалась. Напиши тренеру або спробуй інший код.';
      await Helpers.safeSend(chatId, "❌ Не вдалося застосувати код.\nСпробуй ще раз або натисни [🔙 Назад].\n\nТехнічно: " + msg + hint);
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
    const st2 = await State.get(chatId);
    if (isInviteStudentOnboarding(st2)) await askInviteLocationIfNeeded(chatId);
    else await askGender(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_DISTRICT_INPUT) {
    const raw = String(text || '').trim();
    if (raw.length > 200) {
      await Helpers.safeSend(chatId, '⚠️ Занадто довгий текст. До 200 символів:');
      return true;
    }
    await State.update(chatId, { regDistrict: raw });
    await proceedFromRegDistrictStep(chatId);
    return true;
  }

  // REG_CITY is replaced by oblast->city flow (REG_OBLAST_INPUT / REG_CITY_IN_OBLAST_INPUT)

  if (step === CONSTANTS.FSM_STATES.REG_OBLAST_INPUT) {
    const q = String(text).trim();
    if (q.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи щонайменше 2 літери області:');
      return true;
    }
    const oblasts = await supabase.searchOblasts(q, 12);
    if (!oblasts.length) {
      await Helpers.safeSend(chatId, '❌ Не знайдено область. Спробуй інше написання (мін. 2 літери):');
      return true;
    }
    const keyboard = oblasts.map((o) => [{ text: o, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST + ':' + o }]);
    await Helpers.sendKeyboard(chatId, 'Обери область зі списку:', keyboard);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_CITY_IN_OBLAST_INPUT) {
    const st = await State.get(chatId);
    const oblast = st?.regOblast ? String(st.regOblast) : '';
    const q = String(text).trim();
    if (!oblast) {
      await askCity(chatId);
      return true;
    }
    if (q.length < 3) {
      await Helpers.safeSend(chatId, '⚠️ Введи щонайменше 3 літери назви населеного пункту:');
      return true;
    }
    const cities = await supabase.searchCitiesInOblast(oblast, q, 12);
    if (!cities.length) {
      await Helpers.safeSend(chatId, '❌ Не знайдено. Спробуй інші 3+ літери:');
      return true;
    }
    const keyboard = cities.map((c) => [{ text: c, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_PICK + ':' + c }]);
    keyboard.push([{ text: '⬅️ Змінити область', callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST + ':__BACK__' }]);
    await Helpers.sendKeyboard(chatId, `Обери населений пункт (область: ${oblast}):`, keyboard);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_HEIGHT) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.HEIGHT_MIN != null ? v.HEIGHT_MIN : 100;
    const max = v.HEIGHT_MAX != null ? v.HEIGHT_MAX : 250;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regHeight: Math.round(n * 10) / 10 });
    await askRegWeight(chatId);
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
    await askRegArmFlex(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_ARM_FLEX) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.ARM_MIN != null ? v.ARM_MIN : 15;
    const max = v.ARM_MAX != null ? v.ARM_MAX : 80;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regArmFlex: Math.round(n * 10) / 10 });
    await askRegNeck(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_NECK) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.NECK_MIN != null ? v.NECK_MIN : 20;
    const max = v.NECK_MAX != null ? v.NECK_MAX : 80;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regNeck: Math.round(n * 10) / 10 });
    await askRegWrist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_WRIST) {
    const n = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.WRIST_MIN != null ? v.WRIST_MIN : 10;
    const max = v.WRIST_MAX != null ? v.WRIST_MAX : 35;
    if (isNaN(n) || n < min || n > max) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число від ' + min + ' до ' + max + ' (см).');
      return true;
    }
    await State.update(chatId, { regWrist: Math.round(n * 10) / 10 });
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
    const st2 = await State.get(chatId);
    if (isInviteStudentOnboarding(st2)) await askRegActivityJob(chatId);
    else await askRegActivityJob(chatId);
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
      await askRegBodyGoalsChoice(chatId);
      return true;
    }
    if (!instagramPattern.test(instagram)) {
      await Helpers.safeSend(chatId, "⚠️ Невірний формат посилання Instagram.\n\nПриклад: https://www.instagram.com/your_name\n\nСпробуй ще раз або надішли порожнє повідомлення щоб пропустити:");
      return true;
    }
    await State.update(chatId, { instagram });
    await askRegBodyGoalsChoice(chatId);
    return true;
  }

  // REG_CALENDAR_ID step removed (Google Calendar integration is no longer used)

  if (step === CONSTANTS.FSM_STATES.REG_CYCLE_LAST) {
    const dt = menstrualCycle.parseUaDateString(text);
    if (!dt) {
      await Helpers.safeSend(chatId, '⚠️ Формат ДД.ММ.РРРР (наприклад 15.04.2026). Спробуй ще або натисни «Пропустити».');
      return true;
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dt > today) {
      await Helpers.safeSend(chatId, '⚠️ Дата не може бути в майбутньому.');
      return true;
    }
    const gapDays = Math.floor((today.getTime() - dt.getTime()) / 86400000);
    if (gapDays > 120) {
      await Helpers.safeSend(chatId, '⚠️ Дата занадто далеко в минулому (понад 120 днів). Введи дату початку останніх місячних ближче до сьогодні.');
      return true;
    }
    const iso = dt.toISOString().slice(0, 10);
    await State.update(chatId, { regLastPeriodStart: iso });
    await proceedAfterCycleRegistration(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_WEIGHT) {
    const st = await State.get(chatId);
    const user = await User.getByChatId(chatId);
    const h = st?.regHeight != null ? st.regHeight : user?.height || null;
    const validationCtx = {
      ...user,
      height: h,
      gender: st?.gender || user?.gender,
      age: st?.age != null ? st.age : user?.age,
      wrist: st?.regWrist != null ? st.regWrist : user?.wrist,
      jobType: st?.regActivityJob || user?.jobType || null,
      transportType: st?.regActivityTransport || user?.transportType || null,
      stepsCategory: st?.regActivitySteps || user?.stepsCategory || null,
      extraActivity: st?.regActivityExtra || user?.extraActivity || null,
      experienceStartDate: st?.regExperienceStartDate || user?.experienceStartDate || null
    };
    const check = bodyGoals.validateGoalField('goal_weight', String(text).trim(), h, validationCtx);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    try {
      const userCtx = {
        ...user,
        height: h,
        gender: st?.gender || user?.gender,
        age: st?.age != null ? st.age : user?.age,
        jobType: st?.regActivityJob || user?.jobType || null,
        transportType: st?.regActivityTransport || user?.transportType || null,
        stepsCategory: st?.regActivitySteps || user?.stepsCategory || null,
        extraActivity: st?.regActivityExtra || user?.extraActivity || null,
        experienceStartDate: st?.regExperienceStartDate || user?.experienceStartDate || null
      };
      const current = {
        weight: st?.regWeight != null ? st.regWeight : user?.weight,
        waist: st?.regWaist != null ? st.regWaist : user?.waist,
        glutes: st?.regGlutes != null ? st.regGlutes : user?.glutes,
        shoulders: st?.regShoulders != null ? st.regShoulders : user?.shoulders,
        chest: st?.regChest != null ? st.regChest : user?.chest,
        neck: st?.regNeck != null ? st.regNeck : user?.neck,
        wrist: st?.regWrist != null ? st.regWrist : user?.wrist
      };
      const analysis = bodyGoals.analyzeGoalsVsCurrentState({ goal_weight: check.value }, userCtx, current, 'registration_goal_weight_input');
      if (analysis && Array.isArray(analysis.errors) && analysis.errors.length > 0) {
        const iw = analysis?.snapshot?.idealWeight;
        const rangeHint = iw && iw.optMin != null && iw.optMax != null ? `\nОрієнтир для тебе: ${iw.optMin}–${iw.optMax} кг.` : '';
        await Helpers.safeSend(chatId, `⚠️ ${analysis.errors[0].message}${rangeHint}\n\nВведи іншу бажану вагу:`);
        return true;
      }
      const belowOptimal = (analysis?.hints || []).find((h2) => h2 && h2.type === 'goal_weight_below_optimal');
      if (belowOptimal) {
        const iw = analysis?.snapshot?.idealWeight;
        const rangeHint = iw && iw.optMin != null && iw.optMax != null ? `\nОрієнтир для тебе: ${iw.optMin}–${iw.optMax} кг.` : '';
        await Helpers.safeSend(chatId, `⚠️ ${belowOptimal.message}${rangeHint}\n\nВведи реалістичнішу бажану вагу:`);
        return true;
      }
    } catch (e) {
      console.error('Registration.goalWeight precheck', e.message);
    }
    await State.update(chatId, { regGoalWeight: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_WAIST });
    await sendGoalRealtimeFeedback(chatId, { goal_weight: check.value });
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
    await sendGoalRealtimeFeedback(chatId, { goal_waist: check.value });
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
    await sendGoalRealtimeFeedback(chatId, { goal_hips: check.value });
    await askRegBodyGoalsShoulders(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_SHOULDERS) {
    try {
      const check = bodyGoals.validateGoalField('goal_shoulders', String(text).trim(), null);
      if (!check.valid) {
        await Helpers.safeSend(chatId, '⚠️ ' + check.error);
        return true;
      }
      await State.update(chatId, { regGoalShoulders: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
      await sendGoalRealtimeFeedback(chatId, { goal_shoulders: check.value });
      await askRegBodyGoalsChest(chatId);
      return true;
    } catch (e) {
      console.error('Registration.REG_BODY_GOALS_SHOULDERS', e && e.message ? e.message : e);
      // Keep flow moving even if auxiliary feedback fails.
      await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST });
      await Helpers.safeSend(chatId, 'Прийнято. Переходимо до наступного кроку.');
      await askRegBodyGoalsChest(chatId);
      return true;
    }
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_CHEST) {
    const check = bodyGoals.validateGoalField('goal_chest', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalChest: check.value, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_ARM });
    await sendGoalRealtimeFeedback(chatId, { goal_chest: check.value });
    await askRegBodyGoalsArm(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.REG_BODY_GOALS_ARM) {
    const check = bodyGoals.validateGoalField('goal_arm', String(text).trim(), null);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    await State.update(chatId, { regGoalArm: check.value });
    await sendGoalRealtimeFeedback(chatId, { goal_arm: check.value });
    const stateData = await State.get(chatId);
    const goals = {
      goal_weight: stateData.regGoalWeight != null ? stateData.regGoalWeight : null,
      goal_waist: stateData.regGoalWaist != null ? stateData.regGoalWaist : null,
      goal_hips: stateData.regGoalHips != null ? stateData.regGoalHips : null,
      goal_shoulders: stateData.regGoalShoulders != null ? stateData.regGoalShoulders : null,
      goal_chest: stateData.regGoalChest != null ? stateData.regGoalChest : null,
      goal_arm: check.value
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

  if (action === CONSTANTS.CALLBACKS.REG_CYCLE_FILL_NOW) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_CYCLE_INTRO) return false;
    await State.update(chatId, { regCycleDeferred: false });
    await askRegReproductiveStatus(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_CYCLE_FILL_LATER) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_CYCLE_INTRO) return false;
    await State.update(chatId, {
      regCycleDeferred: true,
      regReproductiveStatus: null,
      regAvgCycleLength: null,
      regAvgBleedingDays: null,
      regLastPeriodStart: null
    });
    await proceedAfterCycleRegistration(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_ST && param) {
    const status = String(param).trim().toLowerCase();
    if (!['regular', 'perimenopause', 'menopause'].includes(status)) return false;
    await State.update(chatId, { regReproductiveStatus: status });
    if (status === 'menopause') {
      await State.update(chatId, {
        regAvgCycleLength: null,
        regAvgBleedingDays: null,
        regLastPeriodStart: null
      });
      await proceedAfterCycleRegistration(chatId);
      return true;
    }
    await askRegCycleLength(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_LEN && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_CYCLE_LEN) return false;
    const n = parseInt(String(param).trim(), 10);
    if (!isFinite(n) || n < 21 || n > 35) {
      await Helpers.safeSend(chatId, '⚠️ Обери довжину циклу кнопками.');
      return true;
    }
    await State.update(chatId, { regAvgCycleLength: n });
    await askRegCycleBleeding(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_BLD && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_CYCLE_BLEED) return false;
    const n = parseInt(String(param).trim(), 10);
    if (!isFinite(n) || n < 3 || n > 7) {
      await Helpers.safeSend(chatId, '⚠️ Обери тривалість кнопками.');
      return true;
    }
    await State.update(chatId, { regAvgBleedingDays: n });
    await askRegLastPeriodStart(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_CYCLE_LAST_SKIP) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_CYCLE_LAST) return false;
    await State.update(chatId, { regLastPeriodStart: null });
    await proceedAfterCycleRegistration(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_KEEP) {
    const field = (param || '').trim();
    let st = await State.get(chatId);
    const u = await User.getByChatId(chatId);
    st = await ensureInvitePrefillSession(chatId, st);
    if (!st || !isInviteStudentOnboarding(st)) return false;
    if (field === 'role') {
      await State.update(chatId, { role: u?.role || CONSTANTS.ROLES.STUDENT });
      await askInviteNameIfNeeded(chatId);
      return true;
    }
    if (field === 'name') {
      const prof = inviteProfileFromUser(st, u);
      await State.update(chatId, { firstName: prof.firstName, lastName: prof.lastName });
      await askInviteLocationIfNeeded(chatId);
      return true;
    }
    if (field === 'location' || field === 'city') {
      const prof = inviteProfileFromUser(st, u);
      const oblast = prof.oblast || '';
      const city = prof.city || '';
      await State.update(chatId, {
        city,
        regOblast: oblast,
        regVenueOblast: oblast,
        regVenueCity: city
      });
      if (isFilled(city)) await askDistrictOptionalAfterCity(chatId);
      else await askInviteVenuesIfNeeded(chatId);
      return true;
    }
    if (field === 'venues') {
      await askInviteAiIntro(chatId);
      return true;
    }
    if (field === 'gender') {
      const gVal = u?.gender || st.gender || '';
      await State.update(chatId, { gender: gVal });
      if (String(gVal).toLowerCase() === CONSTANTS.GENDERS.FEMALE) await askRegCycleIntro(chatId);
      else await askBirthDate(chatId);
      return true;
    }
    if (field === 'birth_date') {
      const bd = u?.birthDate || st.birthDate || null;
      const age = bd ? User.calculateAge(bd) : (u?.age != null ? u.age : null);
      await State.update(chatId, { birthDate: bd, age });
      await askAccentAvoidChoice(chatId);
      return true;
    }
    if (field === 'accent') {
      await State.update(chatId, { regAccentZones: Array.isArray(u?.accentZones) ? u.accentZones : [] });
      await showRegAvoidZones(chatId);
      return true;
    }
    if (field === 'avoid') {
      await State.update(chatId, { regAvoidZones: Array.isArray(u?.avoidZones) ? u.avoidZones : [] });
      await askRegHeight(chatId);
      return true;
    }
    const map = {
      height: ['regHeight', u?.height, askRegWeight],
      weight: ['regWeight', u?.weight, askRegWaist],
      waist: ['regWaist', u?.waist, askRegHip],
      hip: ['regHip', u?.hip, askRegGlutes],
      glutes: ['regGlutes', u?.glutes, askRegArm],
      arm: ['regArm', u?.arm, askRegArmFlex],
      arm_flex: ['regArmFlex', u?.armFlex, askRegNeck],
      neck: ['regNeck', u?.neck, askRegWrist],
      wrist: ['regWrist', u?.wrist, askRegShoulders],
      shoulders: ['regShoulders', u?.shoulders, askRegChest],
      chest: ['regChest', u?.chest, askRegBodyFat],
      body_fat: ['regBodyFatPct', u?.bodyFatPct, askRegBodyGoalsChoice]
    };
    if (map[field]) {
      const [stateKey, value, nextFn] = map[field];
      await State.update(chatId, { [stateKey]: value });
      await nextFn(chatId);
      return true;
    }
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_EDIT) {
    const field = (param || '').trim();
    let st = await State.get(chatId);
    st = await ensureInvitePrefillSession(chatId, st);
    if (!st || !isInviteStudentOnboarding(st)) return false;
    await State.update(chatId, { inviteEditField: field });
    if (field === 'role') {
      await showRoleStep(chatId);
      return true;
    }
    if (field === 'name') {
      await askFirstName(chatId);
      return true;
    }
    if (field === 'location' || field === 'city') {
      await askCity(chatId);
      return true;
    }
    if (field === 'venues') {
      await showInviteVenuesPicker(chatId, 0);
      return true;
    }
    if (field === 'gender') {
      await askGender(chatId);
      return true;
    }
    if (field === 'birth_date') {
      await askBirthDate(chatId);
      return true;
    }
    if (field === 'accent') {
      await askAccentAvoidChoice(chatId);
      return true;
    }
    if (field === 'avoid') {
      await showRegAvoidZones(chatId);
      return true;
    }
    if (field === 'height') {
      await askRegHeight(chatId);
      return true;
    }
    if (field === 'weight') {
      await askRegWeight(chatId);
      return true;
    }
    if (field === 'waist') {
      await askRegWaist(chatId);
      return true;
    }
    if (field === 'hip') {
      await askRegHip(chatId);
      return true;
    }
    if (field === 'glutes') {
      await askRegGlutes(chatId);
      return true;
    }
    if (field === 'arm') {
      await askRegArm(chatId);
      return true;
    }
    if (field === 'arm_flex') {
      await askRegArmFlex(chatId);
      return true;
    }
    if (field === 'neck') {
      await askRegNeck(chatId);
      return true;
    }
    if (field === 'wrist') {
      await askRegWrist(chatId);
      return true;
    }
    if (field === 'shoulders') {
      await askRegShoulders(chatId);
      return true;
    }
    if (field === 'chest') {
      await askRegChest(chatId);
      return true;
    }
    if (field === 'body_fat') {
      await askRegBodyFat(chatId);
      return true;
    }
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_TOGGLE && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_INVITE_VENUES_PICK) return false;
    const cur = Array.isArray(st.regVenueSelectedIds) ? [...st.regVenueSelectedIds] : [];
    const id = String(param).trim();
    const idx = cur.indexOf(id);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(id);
    await State.update(chatId, { regVenueSelectedIds: cur });
    await showInviteVenuesPicker(chatId, st.regVenuePage || 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_CARD && param) {
    await showInviteVenueCard(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_INVITE_VENUES_OPEN) {
    await openInviteVenuesPicker(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_INVITE_VENUES_SKIP) {
    await Helpers.safeSend(chatId, 'ℹ️ Можна додати заклади пізніше у меню «Клуби, студії».');
    await askInviteAiIntro(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_PAGE) {
    const p = Math.max(0, parseInt(String(param || '0'), 10) || 0);
    await showInviteVenuesPicker(chatId, p);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_DONE) {
    const st = await State.get(chatId);
    const ids = Array.isArray(st?.regVenueSelectedIds) ? st.regVenueSelectedIds : [];
    await supabase.setUserVenues(chatId, ids);
    await Helpers.safeSend(chatId, ids.length ? '✅ Заклади збережено в профілі.' : 'ℹ️ Заклади не обрано.');
    await askInviteAiIntro(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_VENUES_SKIP) {
    await Helpers.safeSend(chatId, 'ℹ️ Можна додати заклади пізніше у меню «Клуби, студії».');
    await askInviteAiIntro(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_AI_CONTINUE) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_INVITE_AI_INTRO) return false;
    await askGender(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_AI_LATER) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_INVITE_AI_INTRO) return false;
    await finishRegistration(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.REG_ROLE_STUDENT) {
    await State.update(chatId, { role: CONSTANTS.ROLES.STUDENT });
    const st = await State.get(chatId);
    if (isInviteStudentOnboarding(st)) await askInviteNameIfNeeded(chatId);
    else await askFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_NEW) {
    // Тестовий режим: нова реєстрація закрита для всіх, крім оператора (ADMIN_CHAT_ID — той самий акаунт, що й адмін-бот)
    if (AdminHelpers.isAdminChat(chatId)) {
      await showRoleStep(chatId);
      return true;
    }
    await showBetaClosedNewRegistrationMessage(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_ROLE_COACH) {
    await State.update(chatId, { role: CONSTANTS.ROLES.COACH });
    await askCoachDocs(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_COACH_DOCS_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_COACH_DOCS) return false;
    await askCoachTrainingTypes(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_COACH_DOCS_DONE) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_COACH_DOCS) return false;
    await askCoachTrainingTypes(chatId);
    return true;
  }
  if (
    action === CONSTANTS.CALLBACKS.REG_COACH_TRAINING_TOGGLE_INDIVIDUAL ||
    action === CONSTANTS.CALLBACKS.REG_COACH_TRAINING_TOGGLE_GROUP
  ) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_COACH_TRAINING_TYPES) return false;
    const cur = Array.isArray(state.regCoachTrainingTypes) ? state.regCoachTrainingTypes : [];
    const set = new Set(cur);
    const key = action === CONSTANTS.CALLBACKS.REG_COACH_TRAINING_TOGGLE_INDIVIDUAL ? 'individual' : 'group';
    if (set.has(key)) set.delete(key);
    else set.add(key);
    await State.update(chatId, { regCoachTrainingTypes: Array.from(set) });
    await askCoachTrainingTypes(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_COACH_TRAINING_DONE) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_COACH_TRAINING_TYPES) return false;
    const arr = Array.isArray(state.regCoachTrainingTypes) ? state.regCoachTrainingTypes : [];
    if (!arr.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б один вид тренувань.');
      await askCoachTrainingTypes(chatId);
      return true;
    }
    await askFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GENDER_MALE) {
    await State.update(chatId, { gender: CONSTANTS.GENDERS.MALE });
    const st = await State.get(chatId);
    if (isInviteStudentOnboarding(st)) await askBirthDate(chatId);
    else await askGoal(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_GENDER_FEMALE) {
    await State.update(chatId, { gender: CONSTANTS.GENDERS.FEMALE });
    await askRegCycleIntro(chatId);
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
    const st = await State.get(chatId);
    if (isInviteStudentOnboarding(st)) await askRegHeight(chatId);
    else await askCity(chatId);
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
    if (zone === 'full') {
      accentZones = ['full'];
    } else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) accentZones = accentZones.filter((z) => z !== zone);
      else if (accentZones.length < 2) accentZones.push(zone);
    }
    await State.update(chatId, { regAccentZones: accentZones });
    // Автоматично переходимо до "Зони, які не розвиваємо" при: "full" або 2 вибраних зони
    if (accentZones[0] === 'full' || accentZones.length === 2) {
      await showRegAvoidZones(chatId);
    } else {
      await showRegAccentZones(chatId);
    }
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
    if (isInviteStudentOnboarding(state)) await askRegHeight(chatId);
    else await askCity(chatId);
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

  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST) {
    if (param === '__BACK__') {
      await askCity(chatId);
      return true;
    }
    await State.update(chatId, { regOblast: param || '', step: CONSTANTS.FSM_STATES.REG_CITY_IN_OBLAST_INPUT });
    await Helpers.safeSend(chatId, '🏙️ Введи назву населеного пункту (від 3 літер):');
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY_PICK) {
    const stateBefore = await State.get(chatId);
    const oblast = stateBefore?.regOblast ? String(stateBefore.regOblast) : '';
    const city = param || '';
    const patch = { city, regOblast: oblast };
    if (isInviteStudentOnboarding(stateBefore)) {
      patch.regVenueOblast = oblast;
      patch.regVenueCity = city;
    }
    await State.update(chatId, patch);
    await askDistrictOptionalAfterCity(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_DISTRICT_SKIP) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.REG_DISTRICT_INPUT) return false;
    await State.update(chatId, { regDistrict: '' });
    await proceedFromRegDistrictStep(chatId);
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
    await askRegHeight(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_MEAS_BODY_FAT_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_FAT) return false;
    if (isInviteStudentOnboarding(state)) await askRegActivityJob(chatId);
    else await askRegActivityJob(chatId);
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
    await askRegExperience(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_EXPERIENCE && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_EXPERIENCE) return false;
    await State.update(chatId, {
      regExperienceLevel: param,
      regExperienceStartDate: experienceLevelToStartDate(param)
    });
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
    await State.update(chatId, { regGoalChest: null, step: CONSTANTS.FSM_STATES.REG_BODY_GOALS_ARM });
    await askRegBodyGoalsArm(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REG_BODY_GOALS_SKIP_ARM) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_BODY_GOALS_ARM) return false;
    const goals = {
      goal_weight: state.regGoalWeight != null ? state.regGoalWeight : null,
      goal_waist: state.regGoalWaist != null ? state.regGoalWaist : null,
      goal_hips: state.regGoalHips != null ? state.regGoalHips : null,
      goal_shoulders: state.regGoalShoulders != null ? state.regGoalShoulders : null,
      goal_chest: state.regGoalChest != null ? state.regGoalChest : null,
      goal_arm: null
    };
    await saveRegBodyGoalsAndFinish(chatId, goals);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REG_SKIP_LASTNAME) {
    await State.update(chatId, { lastName: '' });
    const st = await State.get(chatId);
    if (isInviteStudentOnboarding(st)) await askInviteLocationIfNeeded(chatId);
    else await askGender(chatId);
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

  if (action === CONSTANTS.CALLBACKS.REG_INVITE_OFFER_READ) {
    const offer = loadOfferTextSafe();
    if (!offer) {
      await Helpers.safeSend(chatId, '❌ Не вдалося завантажити текст угоди.');
      return true;
    }
    const keyboard = [
      [
        { text: '✅ Приймаю умови', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_ACCEPT },
        { text: '❌ Відмовитись', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_DECLINE }
      ],
      [{ text: '💬 Написати розробнику', url: CONSTANTS.URLS.DEV_HELP_BOT }],
      [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.REG_INVITE_OFFER_BACK }]
    ];
    await Helpers.sendKeyboard(chatId, offer, keyboard);
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.REG_INVITE_OFFER_BACK) {
    const st = await State.get(chatId);
    const inviteCode = st?.pendingInviteCode ? String(st.pendingInviteCode).trim().toUpperCase() : '';
    if (!inviteCode) {
      await start(chatId, { force: true });
      return true;
    }
    await showInviteOfferGate(chatId, inviteCode);
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.REG_INVITE_OFFER_DECLINE) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, 'Доступ не активовано.');
    await start(chatId, { force: true });
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.REG_INVITE_OFFER_ACCEPT) {
    const st = await State.get(chatId);
    const inviteCode = st?.pendingInviteCode ? String(st.pendingInviteCode).trim().toUpperCase() : '';
    if (!inviteCode) {
      await Helpers.safeSend(chatId, '❌ Не знайдено інвайт-код. Спробуй ще раз: /start → «У мене є код».');
      await State.clear(chatId);
      return true;
    }
    try {
      const invRow = await supabase.findUserByInviteCode(inviteCode);
      const inviteCoachId = invRow && invRow.coachId ? String(invRow.coachId) : '';
      try {
        await User.activateInvite(inviteCode, chatId);
      } catch (e1) {
        // Учень уже має рядок у users (раніше почав реєстрацію) — не можна «замінити» інвайт на chatId через activateInvite
        if (e1 && e1.message === 'This Telegram account is already registered') {
          // For linking to coach, invite must have coachId
          if (!inviteCoachId) {
            // Start onboarding questions instead of showing main menu immediately
            await State.set(chatId, {
              step: CONSTANTS.FSM_STATES.REG_ROLE,
              inviteOnboarding: true,
              inviteCoachId: ''
            });
            await supabase.touchUserInviteRegistrationStarted(chatId);
            await askInviteRoleIfNeeded(chatId);
            return true;
          }
          await User.linkCoachByInviteCode(chatId, inviteCode);
        } else {
          throw e1;
        }
      }
      // After invite activation always proceed with registration questions before showing the main menu
      await State.set(chatId, {
        step: CONSTANTS.FSM_STATES.REG_ROLE,
        inviteOnboarding: true,
        inviteCoachId: inviteCoachId || ''
      });
      await supabase.touchUserInviteRegistrationStarted(chatId);
      await askInviteRoleIfNeeded(chatId);
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : '';
      let hint = '';
      if (msg === 'Invite code not found') hint = '\n\nКод не знайдено в базі. Перевір написання (INVITE_…) або попроси тренера новий код.';
      else if (msg === 'Invite code already activated') hint = '\n\nКод уже використано. Якщо ти вже прив’язаний до тренера — відкрий головне меню.';
      else if (msg === 'This Telegram account is already registered') hint = '\n\nЦей акаунт уже зареєстрований, але прив’язка до тренера не вдалась. Напиши тренеру або спробуй інший код.';
      await Helpers.safeSend(chatId, "❌ Не вдалося застосувати код.\nСпробуй ще раз або натисни [🔙 Назад].\n\nТехнічно: " + msg + hint);
      await State.clear(chatId);
      await start(chatId, { force: true });
    }
    return true;
  }

  return false;
}

async function handleFileMessage(chatId, file) {
  try {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.REG_COACH_DOCS) return false;
    if (!file || !file.fileId) return true;

    const id = await supabase.insertCoachDocument({
      coachChatId: chatId,
      fileId: file.fileId,
      fileUniqueId: file.fileUniqueId || null,
      fileType: file.kind === 'photo' ? 'photo' : 'document',
      mimeType: file.mimeType || null,
      fileName: file.fileName || null
    });

    const cnt = await supabase.countCoachDocuments(chatId);
    const keyboard = [
      [{ text: '⏭️ Пропустити', callback_data: CONSTANTS.CALLBACKS.REG_COACH_DOCS_SKIP }],
      [{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.REG_COACH_DOCS_DONE }]
    ];
    if (!id) {
      await Helpers.sendKeyboard(chatId, '⚠️ Не вдалося зберегти документ. Спробуй надіслати ще раз або натисни «✅ Готово».', keyboard);
      return true;
    }
    await Helpers.sendKeyboard(chatId, '✅ Додано. Документів збережено: ' + cnt + '\n\nМожеш надіслати ще один файл або натиснути «✅ Готово».', keyboard);
    return true;
  } catch (e) {
    console.error('Registration.handleFileMessage', e.message);
    await Helpers.safeSend(chatId, '❌ Помилка при збереженні документа.');
    return true;
  }
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
  askRegHeight,
  askInstagram,
  askCalendarId,
  askInviteCode,
  finishRegistration,
  handleTextMessage,
  handleCallback,
  handleFileMessage
};
