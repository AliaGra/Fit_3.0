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
const fs = require('fs');
const path = require('path');

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
    [{ text: '🎯 Учень', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_STUDENT }],
    [{ text: '💪 Тренер', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_COACH }]
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
  await Helpers.sendKeyboard(
    chatId,
    '📐 Заміри тіла потрібні для складання коректного плану тренувань.\n\n' +
      '💡 Ти зможеш у будь-який момент додати або змінити параметри свого тіла в меню «👤 Профіль → 📊 Оновити заміри».\n\n' +
      'Можна пропустити зараз і дозаповнити в профілі пізніше.',
    keyboard
  );
}

async function askRegHeight(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_HEIGHT });
  const v = CONSTANTS.VALIDATION || {};
  const min = v.HEIGHT_MIN != null ? v.HEIGHT_MIN : 100;
  const max = v.HEIGHT_MAX != null ? v.HEIGHT_MAX : 250;
  await Helpers.safeSend(chatId, '📏 Введи зріст (см):\n\nДіапазон: ' + min + '–' + max + '\nПриклад: 175');
}

async function askRegWeight(chatId) {
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
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_WAIST });
  await Helpers.safeSend(
    chatId,
    '⭕ Введи обхват талії (см):\n\n' +
      'Підказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\n' +
      'Приклад: 72'
  );
}

async function askRegHip(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_HIP });
  await Helpers.safeSend(chatId, '⭕ Введи обхват стегна (см):\n\nВимірюй найширшу частину.\nПриклад: 95');
}

async function askRegGlutes(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_GLUTES });
  await Helpers.safeSend(
    chatId,
    '⭕ Введи обхват ягодиць (см):\n\n' +
      'Підказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\n' +
      'Приклад: 98'
  );
}

async function askRegArm(chatId) {
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
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REG_OBLAST_INPUT, regOblast: null });
  await Helpers.safeSend(chatId, '🗺️ Укажи місце свого проживання в Україні:\n\nВведи область (від 2 літер):');
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
      coachTrainingTypes: Array.isArray(stateData.regCoachTrainingTypes) ? stateData.regCoachTrainingTypes : [],
      calendarId: stateData.calendarId || '',
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
        gender: userData.gender,
        goal: userData.goal,
        birthDate: userData.birthDate || null,
        age: userData.age != null ? userData.age : null,
        instagram: userData.instagram,
        coachTrainingTypes: userData.coachTrainingTypes,
        calendarId: userData.calendarId,
        accentZones: userData.accentZones,
        avoidZones: userData.avoidZones
      });
      if (!ok) throw new Error('Failed to update user');
    } else {
      await User.createUser(userData);
    }
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
    await askGender(chatId);
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
  if (action === CONSTANTS.CALLBACKS.REG_NEW) {
    // Тестовий режим: нова реєстрація поки закрита, доступ лише по інвайт-коду
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
    await State.update(chatId, { city: param || '' });
    const stateData = await State.get(chatId);
    const oblast = stateData?.regOblast ? String(stateData.regOblast) : '';
    const city = param || '';
    const Venues = require('./venues');
    await Venues.showRegistrationVenueOffer(chatId, oblast, city);
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
      try {
        await User.activateInvite(inviteCode, chatId);
      } catch (e1) {
        // Учень уже має рядок у users (раніше почав реєстрацію) — не можна «замінити» інвайт на chatId через activateInvite
        if (e1 && e1.message === 'This Telegram account is already registered') {
          // For linking to coach, invite must have coachId
          const inv = await supabase.findUserByInviteCode(inviteCode);
          const coachId = inv && inv.coachId ? String(inv.coachId) : '';
          if (!coachId) {
            // Start onboarding questions instead of showing main menu immediately
            await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_ROLE, inviteOnboarding: true });
            await showRoleStep(chatId);
            return true;
          }
          await User.linkCoachByInviteCode(chatId, inviteCode);
        } else {
          throw e1;
        }
      }
      // After invite activation always proceed with registration questions before showing the main menu
      await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_ROLE, inviteOnboarding: true });
      await showRoleStep(chatId);
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
