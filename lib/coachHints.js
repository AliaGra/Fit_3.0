/**
 * Меню «Навігатор по MAYAG Fit» для тренера (колишні «Підказки»).
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const {
  FIRST_STEPS_OTHER_IDS,
  toggleStep: toggleFirstStep,
  getStepById,
  formatStepPageText
} = require('./coachFirstSteps');
const {
  toggleStep: togglePublicStep,
  getPublicStepById,
  formatPublicStepPageText
} = require('./coachPublicSteps');
const {
  COACH_PLAN_HINTS,
  COACH_TRAINING_HINTS,
  COACH_GROUP_HINTS,
  COACH_BREAKS_HINTS,
  COACH_REPORTS_HINTS,
  COACH_SUBSCRIPTION_HINTS,
  getSectionByKey,
  getDoneMap: getSectionDoneMap,
  toggleStep: toggleSectionStep,
  countDone: countSectionDone,
  buildSectionIntroText,
  formatPlanStepPageText,
  getPlanStepById,
  formatTrainingStepPageText,
  getTrainingStepById,
  formatGroupStepPageText,
  getGroupStepById,
  formatBreaksStepPageText,
  getBreaksStepById
} = require('./coachHintSections');

const SECTION_META = Object.freeze({
  plan: {
    section: COACH_PLAN_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_PLAN,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_PLAN_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW
  },
  training: {
    section: COACH_TRAINING_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_TRAINING,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_TRAINING_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_TRN_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_TRN_VIEW
  },
  group: {
    section: COACH_GROUP_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_GROUP,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_GROUP_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_VIEW
  },
  breaks: {
    section: COACH_BREAKS_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_BREAKS,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_BREAKS_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_BRK_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_BRK_VIEW
  },
  reports: {
    section: COACH_REPORTS_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_REPORTS,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_REPORTS_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_RPT_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_RPT_VIEW
  },
  subscription: {
    section: COACH_SUBSCRIPTION_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION,
    fullTextCallback: CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_SUB_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.HINT_SUB_VIEW
  }
});

async function ensureCoach(chatId) {
  const me = await User.getByChatId(chatId);
  if (!User.isCoach(me)) {
    await Helpers.safeSend(chatId, CONSTANTS.UI_LABELS.NAVIGATOR + ' доступний лише тренерам.');
    return null;
  }
  return me;
}

function hintsMenuProgressLabel(baseLabel, doneCount, total) {
  const suffix = ' (' + total + '/' + doneCount + ')';
  const full = baseLabel + suffix;
  if (full.length <= 64) return full;
  const maxBase = Math.max(8, 64 - suffix.length - 1);
  return baseLabel.slice(0, maxBase) + '…' + suffix;
}

async function showHintsMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const [
    reportsDone,
    subscriptionDone
  ] = await Promise.all([
    getSectionDoneMap(chatId, COACH_REPORTS_HINTS),
    getSectionDoneMap(chatId, COACH_SUBSCRIPTION_HINTS)
  ]);
  const keyboard = [
    [
      {
        text: '🚀 В першу чергу',
        callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS
      }
    ],
    [
      {
        text: '📢 Публічні дані',
        callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS
      }
    ],
    [
      {
        text: COACH_PLAN_HINTS.menuLabel,
        callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN
      }
    ],
    [
      {
        text: COACH_TRAINING_HINTS.menuLabel,
        callback_data: CONSTANTS.CALLBACKS.HINTS_TRAINING
      }
    ],
    [
      {
        text: COACH_GROUP_HINTS.menuLabel,
        callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP
      }
    ],
    [
      {
        text: COACH_BREAKS_HINTS.menuLabel,
        callback_data: CONSTANTS.CALLBACKS.HINTS_BREAKS
      }
    ],
    [
      {
        text: hintsMenuProgressLabel(
          COACH_REPORTS_HINTS.menuLabel,
          countSectionDone(reportsDone, COACH_REPORTS_HINTS),
          COACH_REPORTS_HINTS.steps.length
        ),
        callback_data: CONSTANTS.CALLBACKS.HINTS_REPORTS
      }
    ],
    [
      {
        text: hintsMenuProgressLabel(
          COACH_SUBSCRIPTION_HINTS.menuLabel,
          countSectionDone(subscriptionDone, COACH_SUBSCRIPTION_HINTS),
          COACH_SUBSCRIPTION_HINTS.steps.length
        ),
        callback_data: CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION
      }
    ],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  const menuText =
    '**' + CONSTANTS.UI_LABELS.NAVIGATOR_HEADER + '**\n\n' +
    '**Цифри в дужках** біля кожного розділу — спочатку скільки пунктів загалом, потім скільки вже виконано.\n' +
    'Наприклад, **9/3** означає: у розділі 9 пунктів, виконано 3, залишилось ще 6.\n' +
    'Усередині розділу відмічай кроки **✅**, коли зробив їх.\n\n' +
    'Обери розділ:';
  await Helpers.sendKeyboard(chatId, menuText, keyboard, { parse_mode: 'Markdown' });
}

/** Головний екран «В першу чергу» — швидкий старт без чекліста. */
async function showFirstStepsChecklist(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '🚀 **Почни з MAYAG Fit**\n\n' +
    'Не потрібно вивчати все одразу 😊\n\n' +
    'Обери, що хочеш зробити зараз. Я допоможу розібратися крок за кроком.';
  const keyboard = [
    [{ text: '📅 Налаштуй розклад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':1' }],
    [{ text: '👥 Додай клієнта', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':3' }],
    [
      {
        text: '🗓 Запиши клієнта на тренування',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':4'
      }
    ],
    [{ text: '📋 Створи план тренувань', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':7' }],
    [{ text: '📚 Інші підказки', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_OTHER }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

/** Додаткові інструкції з колишнього чекліста (без обовʼязкового прогресу). */
async function showFirstStepsOtherTips(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📚 **Інші можливості MAYAG Fit**\n\n' +
    'Основні кроки вже під рукою. Тут зібрані інші корисні підказки — відкривай ті, які потрібні саме зараз.';
  const keyboard = [];
  for (const id of FIRST_STEPS_OTHER_IDS) {
    const item = getStepById(id);
    if (!item) continue;
    const label = item.title || item.shortLabel;
    keyboard.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':' + id + ':other'
      }
    ]);
  }
  keyboard.push([{ text: '⬅️ До основних дій', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }]);
  keyboard.push([{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

/** Хаб «Моя публічна картка» — без чекліста; кожен пункт відкриває коротку інструкцію. */
async function showPublicStepsChecklist(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📢 **Моя публічна картка**\n\n' +
    'Тут ти можеш керувати інформацією, яку бачать клієнти та користувачі MAYAG Fit.\n\n' +
    'Додавай потрібні дані, перевіряй свою картку та повертайся до редагування, коли захочеш.';
  const keyboard = [
    [{ text: '👁 Переглянути мою картку', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }],
    [{ text: '📸 Instagram', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW + ':1' }],
    [{ text: '🎓 Документи про освіту', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW + ':2' }],
    [{ text: '📍 Де я треную', callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW + ':3' }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

/** Кнопки повернення: підменю картки + Навігатор + головне меню. */
function publicCardBackKeyboard(extraRows = []) {
  return [
    ...extraRows,
    [{ text: '⬅️ До публічної картки', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

async function showSectionChecklist(chatId, sectionKey) {
  if (!(await ensureCoach(chatId))) return;
  if (sectionKey === 'plan') {
    await showPlanHintsHub(chatId);
    return;
  }
  if (sectionKey === 'training') {
    await showTrainingHintsHub(chatId);
    return;
  }
  if (sectionKey === 'group') {
    await showGroupHintsHub(chatId);
    return;
  }
  if (sectionKey === 'breaks') {
    await showBreaksHintsHub(chatId);
    return;
  }
  const meta = SECTION_META[sectionKey];
  if (!meta) return;
  const section = meta.section;
  const done = await getSectionDoneMap(chatId, section);
  const doneCount = countSectionDone(done, section);
  const total = section.steps.length;
  const header =
    section.headerTitle +
    '\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Натисни **☐** або **✅** біля пункту, щоб відмітити виконання. Натисни назву — відкриється детальний текст.\n\n';

  const keyboard = [];
  for (const item of section.steps) {
    const mark = done[item.id] ? '✅' : '☐';
    const title = item.id + '. ' + item.shortLabel;
    const titleBtn = title.length > 38 ? title.slice(0, 35) + '…' : title;
    keyboard.push([
      { text: titleBtn, callback_data: meta.viewPrefix + ':' + item.id },
      { text: mark, callback_data: meta.togglePrefix + ':' + item.id + ':list' }
    ]);
  }
  keyboard.push([{ text: '📚 Усі інструкції', callback_data: meta.fullTextCallback }]);
  keyboard.push([{ text: CONSTANTS.UI_LABELS.NAVIGATOR_BACK, callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function planNavKeyboard(parentCallback, extraRows = []) {
  return [
    ...extraRows,
    [{ text: '⬅️ Назад', callback_data: parentCallback }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

/** Головний екран розділу планів у Навігаторі (без чекліста). */
async function showPlanHintsHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📋 **Плани тренувань**\n\n' +
    'Створи план для клієнта або відкрий уже наявний.\n\n' +
    'Обери, з чого хочеш почати. Інші можливості завжди можна переглянути в підказках.';
  const keyboard = [
    [{ text: '➕ Створити план тренувань', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN_CREATE }],
    [
      {
        text: '📂 Відкрити план клієнта',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':3:hub'
      }
    ],
    [{ text: '👤 Підготувати клієнта', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN_PREP }],
    [{ text: '📚 Усі підказки', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN_TEXT }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showPlanCreateMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '➕ **Створити план тренувань**\n\n' +
    'Обери зручний спосіб створення програми для клієнта.';
  const keyboard = planNavKeyboard(CONSTANTS.CALLBACKS.HINTS_PLAN, [
    [
      {
        text: '✨ Авто-підбір плану',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':4:create'
      }
    ],
    [
      {
        text: '✍️ Створити план вручну',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':5:create'
      }
    ]
  ]);
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showPlanPrepMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '👤 **Підготовка клієнта**\n\n' +
    'Перед створенням плану можеш переглянути профіль клієнта та ознайомитися з AI-аналітикою.';
  const keyboard = planNavKeyboard(CONSTANTS.CALLBACKS.HINTS_PLAN, [
    [
      {
        text: '👤 Профіль клієнта',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':1:prep'
      }
    ],
    [
      {
        text: '🤖 AI-аналітика клієнта',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':2:prep'
      }
    ]
  ]);
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showPlanAllTips(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📚 **Усі підказки: плани тренувань**\n\n' +
    'Довідкові інструкції — відкривай лише ті, які потрібні зараз.';
  const tipRows = [];
  for (const item of COACH_PLAN_HINTS.steps) {
    const label = item.title || item.shortLabel;
    tipRows.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PLN_VIEW + ':' + item.id + ':all'
      }
    ]);
  }
  const keyboard = [
    ...tipRows,
    [{ text: '⬅️ До меню планів', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function resolvePlanStepBack(fromCtx) {
  if (fromCtx === 'create') return CONSTANTS.CALLBACKS.HINTS_PLAN_CREATE;
  if (fromCtx === 'prep') return CONSTANTS.CALLBACKS.HINTS_PLAN_PREP;
  if (fromCtx === 'all') return CONSTANTS.CALLBACKS.HINTS_PLAN_TEXT;
  return CONSTANTS.CALLBACKS.HINTS_PLAN;
}

function resolvePlanCtaCallback(item) {
  if (item && item.ctaCallback === 'COACH_STUDENTS_LIST') {
    return CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST;
  }
  return CONSTANTS.CALLBACKS.HINTS_PLAN_STUDENTS_LIST;
}

async function showPlanStepDetail(chatId, stepId, fromCtx) {
  if (!(await ensureCoach(chatId))) return;
  const id = parseInt(String(stepId), 10);
  const item = getPlanStepById(id);
  if (!item) {
    await showPlanHintsHub(chatId);
    return;
  }
  const backCb = resolvePlanStepBack(fromCtx);
  const backLabel =
    fromCtx === 'all'
      ? '⬅️ До підказок'
      : fromCtx === 'create' || fromCtx === 'prep'
        ? '⬅️ Назад'
        : '⬅️ До меню планів';
  const ctaRows = [
    [{ text: item.ctaLabel || '📋 Список клієнтів', callback_data: resolvePlanCtaCallback(item) }]
  ];
  if (id === 5) {
    ctaRows.push([{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]);
    ctaRows.push([{ text: '⭐ Мої вправи', callback_data: CONSTANTS.CALLBACKS.MY_EX_MENU }]);
  }
  const keyboard = [
    ...ctaRows,
    [{ text: backLabel, callback_data: backCb }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, formatPlanStepPageText(item), keyboard);
}

/** Головний екран розділу тренувань у Навігаторі (без чекліста). */
async function showTrainingHintsHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '💪 **Проведення тренувань**\n\n' +
    'Тут усе для роботи з тренуваннями.\n\n' +
    'Обери потрібну дію та продовжуй працювати. Якщо знадобиться допомога — відкрий підказки.';
  const view = CONSTANTS.CALLBACK_PREFIXES.HINT_TRN_VIEW;
  const keyboard = [
    [{ text: '👥 Тренування з клієнтом', callback_data: view + ':1:hub' }],
    [{ text: '✅ Відмітити тренування', callback_data: view + ':2:hub' }],
    [{ text: '💪 Моє тренування', callback_data: view + ':3:hub' }],
    [{ text: '📚 Бібліотека та мої вправи', callback_data: view + ':4:hub' }],
    [{ text: '📖 Усі підказки', callback_data: CONSTANTS.CALLBACKS.HINTS_TRAINING_TEXT }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showTrainingAllTips(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📖 **Усі підказки: проведення тренувань**\n\n' +
    'Довідкові інструкції — відкривай лише ті, які потрібні зараз.';
  const tipRows = [];
  for (const item of COACH_TRAINING_HINTS.steps) {
    const label = item.title || item.shortLabel;
    tipRows.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_TRN_VIEW + ':' + item.id + ':all'
      }
    ]);
  }
  const keyboard = [
    ...tipRows,
    [{ text: '⬅️ До меню тренувань', callback_data: CONSTANTS.CALLBACKS.HINTS_TRAINING }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function resolveTrainingCtaCallback(name) {
  const map = {
    TRAINING_COACH_START: CONSTANTS.CALLBACKS.TRAINING_COACH_START,
    SCH_MARK_TRAINING: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING,
    TRAINING_START: CONSTANTS.CALLBACKS.TRAINING_START,
    LIBRARY_VIEW: CONSTANTS.CALLBACKS.LIBRARY_VIEW,
    MY_EX_MENU: CONSTANTS.CALLBACKS.MY_EX_MENU
  };
  return map[name] || null;
}

async function showTrainingStepDetail(chatId, stepId, fromCtx) {
  if (!(await ensureCoach(chatId))) return;
  const id = parseInt(String(stepId), 10);
  const item = getTrainingStepById(id);
  if (!item) {
    await showTrainingHintsHub(chatId);
    return;
  }
  const backCb =
    fromCtx === 'all' ? CONSTANTS.CALLBACKS.HINTS_TRAINING_TEXT : CONSTANTS.CALLBACKS.HINTS_TRAINING;
  const backLabel = fromCtx === 'all' ? '⬅️ До підказок' : '⬅️ До меню тренувань';
  const ctaRows = [];
  const mainCb = resolveTrainingCtaCallback(item.ctaCallback);
  if (mainCb) {
    ctaRows.push([{ text: item.ctaLabel || item.shortLabel, callback_data: mainCb }]);
  }
  if (Array.isArray(item.ctaExtra)) {
    for (const extra of item.ctaExtra) {
      const cb = resolveTrainingCtaCallback(extra.callback);
      if (cb) ctaRows.push([{ text: extra.label, callback_data: cb }]);
    }
  }
  const keyboard = [
    ...ctaRows,
    [{ text: backLabel, callback_data: backCb }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, formatTrainingStepPageText(item), keyboard);
}

/** Головний екран розділу групових у Навігаторі (без чекліста). */
async function showGroupHintsHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '👥 **Групові заняття**\n\n' +
    'Працюєш із груповими заняттями? Тут можна налаштувати груповий формат, перейти до занять у закладі, ' +
    'переглянути розклад і перевірити, як інформація відображається для користувачів.\n\n' +
    'Обери потрібну дію — решту можна переглянути в підказках.';
  const view = CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_VIEW;
  const keyboard = [
    [{ text: '⚙️ Налаштувати груповий формат', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP_SETUP }],
    [{ text: '🏢 Обрати групові в закладі', callback_data: view + ':3:hub' }],
    [{ text: '📅 Розклад групових занять', callback_data: view + ':4:hub' }],
    [{ text: '👁 Переглянути публічні картки', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP_CARDS }],
    [{ text: '📚 Усі підказки', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP_TEXT }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showGroupSetupMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '⚙️ **Налаштування групового формату**\n\n' + 'Обери, що хочеш налаштувати.';
  const view = CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_VIEW;
  const keyboard = [
    [{ text: '👤 Тип «Групові» в профілі', callback_data: view + ':1:setup' }],
    [{ text: '🏢 Заклад «Де треную»', callback_data: view + ':2:setup' }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showGroupCardsMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '👁 **Як тебе бачать користувачі**\n\n' +
    'Переглянь, як інформація про тренера та заклад відображається в MAYAG Fit.';
  const view = CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_VIEW;
  const keyboard = [
    [{ text: '👤 Картка тренера', callback_data: view + ':5:cards' }],
    [{ text: '🏢 Картка закладу', callback_data: view + ':6:cards' }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showGroupAllTips(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📚 **Усі підказки: групові заняття**\n\n' +
    'Довідкові інструкції — відкривай лише ті, які потрібні зараз.';
  const tipRows = [];
  for (const item of COACH_GROUP_HINTS.steps) {
    const label = item.title || item.shortLabel;
    tipRows.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_GRP_VIEW + ':' + item.id + ':all'
      }
    ]);
  }
  const keyboard = [
    ...tipRows,
    [{ text: '⬅️ До меню групових занять', callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function resolveGroupStepBack(fromCtx) {
  if (fromCtx === 'setup') return CONSTANTS.CALLBACKS.HINTS_GROUP_SETUP;
  if (fromCtx === 'cards') return CONSTANTS.CALLBACKS.HINTS_GROUP_CARDS;
  if (fromCtx === 'all') return CONSTANTS.CALLBACKS.HINTS_GROUP_TEXT;
  return CONSTANTS.CALLBACKS.HINTS_GROUP;
}

function resolveGroupCtaCallback(name) {
  const map = {
    PROFILE_EDIT_TRAINING_TYPES: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES,
    PROFILE_COACH_VENUES: CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES,
    PROFILE_GROUP_TRAINING_OPEN: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_OPEN,
    PROFILE_GROUP_SCHEDULE_OPEN: CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_OPEN,
    HINTS_PUBLIC_PREVIEW: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW
  };
  return map[name] || null;
}

async function showGroupStepDetail(chatId, stepId, fromCtx) {
  if (!(await ensureCoach(chatId))) return;
  const id = parseInt(String(stepId), 10);
  const item = getGroupStepById(id);
  if (!item) {
    await showGroupHintsHub(chatId);
    return;
  }
  const backCb = resolveGroupStepBack(fromCtx);
  const backLabel =
    fromCtx === 'all'
      ? '⬅️ До підказок'
      : fromCtx === 'setup' || fromCtx === 'cards'
        ? '⬅️ Назад'
        : '⬅️ До меню групових занять';
  const ctaRows = [];
  const mainCb = resolveGroupCtaCallback(item.ctaCallback);
  if (mainCb) {
    ctaRows.push([{ text: item.ctaLabel || item.shortLabel, callback_data: mainCb }]);
  }
  const keyboard = [
    ...ctaRows,
    [{ text: backLabel, callback_data: backCb }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, formatGroupStepPageText(item), keyboard);
}

/** Головний екран розділу перерв/відпусток у Навігаторі (без чекліста). */
async function showBreaksHintsHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📅 **Перерви та відпустки**\n\n' +
    'Потрібно змінити свою доступність у розкладі?\n\n' +
    'Заплануй перерву на окремий час або відпустку на потрібний період. Усі зміни можна переглянути в календарі.';
  const view = CONSTANTS.CALLBACK_PREFIXES.HINT_BRK_VIEW;
  const keyboard = [
    [{ text: '☕ Запланувати перерву', callback_data: view + ':1:hub' }],
    [{ text: '🏖 Запланувати відпустку', callback_data: view + ':2:hub' }],
    [{ text: '📖 Підказки', callback_data: CONSTANTS.CALLBACKS.HINTS_BREAKS_TEXT }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showBreaksAllTips(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const header =
    '📖 **Підказки: перерви та відпустки**\n\n' +
    'Довідкові інструкції — відкривай лише ті, які потрібні зараз.';
  const tipRows = [];
  for (const item of COACH_BREAKS_HINTS.steps) {
    const label = item.title || item.shortLabel;
    tipRows.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_BRK_VIEW + ':' + item.id + ':all'
      }
    ]);
  }
  const keyboard = [
    ...tipRows,
    [{ text: '⬅️ До меню перерв і відпусток', callback_data: CONSTANTS.CALLBACKS.HINTS_BREAKS }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function resolveBreaksCtaCallback(name) {
  const map = {
    SCH_CREATE_RESERVE: CONSTANTS.CALLBACKS.SCH_CREATE_RESERVE,
    SCH_VACATION_ADD: CONSTANTS.CALLBACKS.SCH_VACATION_ADD
  };
  return map[name] || null;
}

async function showBreaksStepDetail(chatId, stepId, fromCtx) {
  if (!(await ensureCoach(chatId))) return;
  const id = parseInt(String(stepId), 10);
  const item = getBreaksStepById(id);
  if (!item) {
    await showBreaksHintsHub(chatId);
    return;
  }
  const backCb =
    fromCtx === 'all' ? CONSTANTS.CALLBACKS.HINTS_BREAKS_TEXT : CONSTANTS.CALLBACKS.HINTS_BREAKS;
  const backLabel = fromCtx === 'all' ? '⬅️ До підказок' : '⬅️ До меню перерв і відпусток';
  const ctaRows = [];
  const mainCb = resolveBreaksCtaCallback(item.ctaCallback);
  if (mainCb) {
    ctaRows.push([{ text: item.ctaLabel || item.shortLabel, callback_data: mainCb }]);
  }
  const keyboard = [
    ...ctaRows,
    [{ text: backLabel, callback_data: backCb }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, formatBreaksStepPageText(item), keyboard);
}

function appendFirstStepNavButtons(keyboard, id) {
  if (id === 1) {
    keyboard.push([
      { text: '⚙️ Налаштування розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }
    ]);
  } else if (id === 3) {
    keyboard.push([{ text: '➕ Додати клієнта', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
  } else if (id === 4) {
    keyboard.push([{ text: '📆 Календар (21 день)', callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR }]);
    keyboard.push([{ text: '📋 Список клієнтів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
  } else if (id === 6 || id === 9) {
    keyboard.push([{ text: '📋 Список клієнтів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
  } else if (id === 7) {
    keyboard.push([
      { text: '📋 Список клієнтів (план)', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN_STUDENTS_LIST }
    ]);
  } else if (id === 8) {
    keyboard.push([
      { text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_PRICING },
      { text: '📋 Список клієнтів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }
    ]);
  }
}

function appendSectionNavButtons(keyboard, sectionKey, id) {
  if (sectionKey === 'plan') {
    if (id === 1) {
      keyboard.push([{ text: '📋 Список клієнтів', callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN_STUDENTS_LIST }]);
    } else if (id === 2 || id === 3 || id === 4 || id === 5 || id === 6) {
      keyboard.push([{ text: '📋 Список клієнтів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
    }
    if (id === 5) {
      keyboard.push([{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]);
      keyboard.push([{ text: '⭐ Мої вправи', callback_data: CONSTANTS.CALLBACKS.MY_EX_MENU }]);
    }
  } else if (sectionKey === 'training') {
    if (id === 1) {
      keyboard.push([{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }]);
    } else if (id === 2) {
      keyboard.push([{ text: '✔️ Відмітити тренування', callback_data: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING }]);
    } else if (id === 3) {
      keyboard.push([{ text: '💪 Моє тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }]);
    } else if (id === 4) {
      keyboard.push([{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]);
      keyboard.push([{ text: '⭐ Мої вправи', callback_data: CONSTANTS.CALLBACKS.MY_EX_MENU }]);
    }
  } else if (sectionKey === 'group') {
    if (id === 1) {
      keyboard.push([
        { text: '💪 Тип тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES }
      ]);
    } else if (id === 2) {
      keyboard.push([{ text: '🏢 Де треную', callback_data: CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES }]);
      keyboard.push([{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]);
    } else if (id === 3) {
      keyboard.push([
        { text: '👥 Групові по закладах', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_OPEN }
      ]);
    } else if (id === 4) {
      keyboard.push([
        { text: '🗓 Розклад групових', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_OPEN }
      ]);
    } else if (id === 5 || id === 6) {
      keyboard.push([
        { text: '👁 Картка тренера', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }
      ]);
    }
  } else if (sectionKey === 'breaks') {
    if (id === 1) {
      keyboard.push([
        { text: '☕ Запланувати перерву', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_RESERVE }
      ]);
    } else if (id === 2) {
      keyboard.push([
        { text: '🏖 Запланувати відпустку', callback_data: CONSTANTS.CALLBACKS.SCH_VACATION_ADD }
      ]);
    }
  } else if (sectionKey === 'reports') {
    if (id === 1) {
      keyboard.push([{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]);
    } else if (id === 2) {
      keyboard.push([{ text: '✔️ Відмітити тренування', callback_data: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING }]);
      keyboard.push([{ text: '📋 Графік роботи', callback_data: CONSTANTS.CALLBACKS.SCH_7_BOOKED }]);
      keyboard.push([{ text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_PRICING }]);
    }
  } else if (sectionKey === 'subscription' && id === 1) {
    keyboard.push([{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]);
    keyboard.push([{ text: '🎫 Абонемент', callback_data: CONSTANTS.CALLBACKS.MENU_SUBSCRIPTION }]);
  }
}

/** Сумісність зі старим callback HINTS_FIRST_TEXT → додаткові підказки. */
async function showFirstStepsFullText(chatId) {
  await showFirstStepsOtherTips(chatId);
}

/** Сумісність зі старим HINTS_PUB_TXT → хаб картки. */
async function showPublicStepsFullText(chatId) {
  await showPublicStepsChecklist(chatId);
}

async function showSectionFullText(chatId, sectionKey) {
  if (sectionKey === 'plan') {
    await showPlanAllTips(chatId);
    return;
  }
  if (sectionKey === 'training') {
    await showTrainingAllTips(chatId);
    return;
  }
  if (sectionKey === 'group') {
    await showGroupAllTips(chatId);
    return;
  }
  if (sectionKey === 'breaks') {
    await showBreaksAllTips(chatId);
    return;
  }
  const meta = SECTION_META[sectionKey];
  if (!meta) return;
  const text = buildSectionIntroText(meta.section);
  const keyboard = [
    [{ text: '🔙 До чекліста', callback_data: meta.menuCallback }],
    [{ text: CONSTANTS.UI_LABELS.NAVIGATOR_BACK, callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/**
 * Сторінка інструкції «В першу чергу».
 * @param {string|number} stepId
 * @param {{ fromOther?: boolean }} [opts]
 */
async function showStepDetail(chatId, stepId, opts = {}) {
  const raw = String(stepId || '').trim();
  const fromOther = !!opts.fromOther || /(^|:)other$/.test(raw);
  const id = parseInt(raw.split(':')[0], 10);
  const item = getStepById(id);
  if (!item) {
    await showFirstStepsChecklist(chatId);
    return;
  }
  const keyboard = [];
  appendFirstStepNavButtons(keyboard, id);
  const backCb = fromOther
    ? CONSTANTS.CALLBACKS.HINTS_FIRST_OTHER
    : CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS;
  keyboard.push(
    [{ text: '⬅️ До підказок', callback_data: backCb }],
    [{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  );
  await Helpers.sendKeyboard(chatId, formatStepPageText(item), keyboard);
}

async function showPublicStepDetail(chatId, stepId) {
  const id = parseInt(String(stepId), 10);
  const item = getPublicStepById(id);
  if (!item) {
    await showPublicStepsChecklist(chatId);
    return;
  }
  const ctaRows = [];
  if (id === 1) {
    ctaRows.push([
      {
        text: item.ctaLabel || '📸 Додати або змінити Instagram',
        callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_INSTAGRAM
      }
    ]);
  } else if (id === 2) {
    ctaRows.push([
      {
        text: item.ctaLabel || '🎓 Додати або змінити дані',
        callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS
      }
    ]);
  } else if (id === 3) {
    ctaRows.push([
      {
        text: item.ctaLabel || '📍 Додати або змінити місце',
        callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_COACH_VENUES
      }
    ]);
  }
  await Helpers.sendKeyboard(
    chatId,
    formatPublicStepPageText(item),
    publicCardBackKeyboard(ctaRows)
  );
}

function parsePlanViewParam(param) {
  const raw = String(param || '').trim();
  const colon = raw.indexOf(':');
  if (colon < 0) return { stepId: raw, fromCtx: 'hub' };
  const stepId = raw.slice(0, colon);
  const fromCtx = raw.slice(colon + 1).trim() || 'hub';
  if (fromCtx === 'list') return { stepId, fromCtx: 'hub' };
  return { stepId, fromCtx };
}

async function showSectionStepDetail(chatId, sectionKey, stepId) {
  if (sectionKey === 'plan') {
    const { stepId: id, fromCtx } = parsePlanViewParam(stepId);
    await showPlanStepDetail(chatId, id, fromCtx);
    return;
  }
  if (sectionKey === 'training') {
    const { stepId: id, fromCtx } = parsePlanViewParam(stepId);
    await showTrainingStepDetail(chatId, id, fromCtx);
    return;
  }
  if (sectionKey === 'group') {
    const { stepId: id, fromCtx } = parsePlanViewParam(stepId);
    await showGroupStepDetail(chatId, id, fromCtx);
    return;
  }
  if (sectionKey === 'breaks') {
    const { stepId: id, fromCtx } = parsePlanViewParam(stepId);
    await showBreaksStepDetail(chatId, id, fromCtx);
    return;
  }
  const meta = SECTION_META[sectionKey];
  if (!meta) return;
  const section = meta.section;
  const id = parseInt(String(stepId), 10);
  const item = section.steps.find((s) => s.id === id);
  if (!item) {
    await showSectionChecklist(chatId, sectionKey);
    return;
  }
  const done = await getSectionDoneMap(chatId, section);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';
  const keyboard = [];
  appendSectionNavButtons(keyboard, sectionKey, id);
  keyboard.push([{ text: toggleLabel, callback_data: meta.togglePrefix + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: meta.menuCallback }],
    [{ text: CONSTANTS.UI_LABELS.NAVIGATOR_BACK, callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  );
  await Helpers.sendKeyboard(
    chatId,
    '**Пункт ' + id + '.** ' + item.shortLabel + '\n\n' + mark + '\n\n' + item.body,
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

function findSectionKeyByTogglePrefix(action) {
  for (const key of Object.keys(SECTION_META)) {
    if (SECTION_META[key].togglePrefix === action) return key;
  }
  return null;
}

function findSectionKeyByViewPrefix(action) {
  for (const key of Object.keys(SECTION_META)) {
    if (SECTION_META[key].viewPrefix === action) return key;
  }
  return null;
}

function parseHintToggleParam(param) {
  const raw = String(param || '').trim();
  const colon = raw.indexOf(':');
  if (colon < 0) return { stepId: raw, fromList: false };
  const tail = raw.slice(colon + 1);
  if (tail === 'list') return { stepId: raw.slice(0, colon), fromList: true };
  return { stepId: raw, fromList: false };
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.MENU_HINTS) {
    await showHintsMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS) {
    await showFirstStepsChecklist(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_FIRST_OTHER) {
    await showFirstStepsOtherTips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS_TEXT) {
    await showFirstStepsFullText(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS) {
    await showPublicStepsChecklist(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS_TEXT) {
    await showPublicStepsFullText(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW) {
    const Coach = require('./coach');
    await Coach.showCoachProfilePreviewForCoach(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PUBLIC_INSTAGRAM) {
    if (!(await ensureCoach(chatId))) return true;
    const Profile = require('./profile');
    await Profile.askProfileInstagram(chatId, { fromHintsPublic: true });
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PUBLIC_COACH_VENUES) {
    if (!(await ensureCoach(chatId))) return true;
    const Venues = require('./venues');
    await Venues.openCoachVenuesTeach(chatId, { fromHintsPublic: true });
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_FIRST_PRICING) {
    if (!(await ensureCoach(chatId))) return true;
    const Coach = require('./coach');
    await Coach.startDefaultPricingFromHints(chatId, 8);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN_STUDENTS_LIST) {
    if (!(await ensureCoach(chatId))) return true;
    const Coach = require('./coach');
    await Coach.openStudentsListFromHintsPlan(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN) {
    await showPlanHintsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN_CREATE) {
    await showPlanCreateMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN_PREP) {
    await showPlanPrepMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN_TEXT) {
    await showPlanAllTips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_TRAINING) {
    await showTrainingHintsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_TRAINING_TEXT) {
    await showTrainingAllTips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP) {
    await showGroupHintsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP_SETUP) {
    await showGroupSetupMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP_CARDS) {
    await showGroupCardsMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP_TEXT) {
    await showGroupAllTips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_BREAKS) {
    await showBreaksHintsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_BREAKS_TEXT) {
    await showBreaksAllTips(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_REPORTS) {
    await showSectionChecklist(chatId, 'reports');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_REPORTS_TEXT) {
    await showSectionFullText(chatId, 'reports');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION) {
    await showSectionChecklist(chatId, 'subscription');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION_TEXT) {
    await showSectionFullText(chatId, 'subscription');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE && param) {
    // Сумісність зі старими повідомленнями: відмітку зберігаємо, UI чекліста більше немає.
    const { stepId } = parseHintToggleParam(param);
    await toggleFirstStep(chatId, stepId);
    await showStepDetail(chatId, stepId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW && param) {
    const fromOther = String(param).includes(':other');
    await showStepDetail(chatId, param, { fromOther });
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_TOGGLE && param) {
    // Сумісність зі старими повідомленнями: відмітку зберігаємо, UI чекліста більше немає.
    const { stepId } = parseHintToggleParam(param);
    await togglePublicStep(chatId, stepId);
    await showPublicStepDetail(chatId, stepId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW && param) {
    await showPublicStepDetail(chatId, param);
    return true;
  }

  const toggleSectionKey = findSectionKeyByTogglePrefix(action);
  if (toggleSectionKey && param) {
    const section = getSectionByKey(toggleSectionKey);
    if (section) {
      const { stepId, fromList } = parseHintToggleParam(param);
      await toggleSectionStep(chatId, section, stepId);
      if (fromList) await showSectionChecklist(chatId, toggleSectionKey);
      else await showSectionStepDetail(chatId, toggleSectionKey, stepId);
      return true;
    }
  }
  const viewSectionKey = findSectionKeyByViewPrefix(action);
  if (viewSectionKey && param) {
    await showSectionStepDetail(chatId, viewSectionKey, param);
    return true;
  }

  return false;
}

module.exports = {
  showHintsMenu,
  showFirstStepsChecklist,
  showFirstStepsOtherTips,
  showPublicStepsChecklist,
  showSectionChecklist,
  showPlanHintsHub,
  showPlanCreateMenu,
  showPlanPrepMenu,
  showPlanAllTips,
  showPlanStepDetail,
  showTrainingHintsHub,
  showTrainingAllTips,
  showTrainingStepDetail,
  showGroupHintsHub,
  showGroupSetupMenu,
  showGroupCardsMenu,
  showGroupAllTips,
  showGroupStepDetail,
  showBreaksHintsHub,
  showBreaksAllTips,
  showBreaksStepDetail,
  showFirstStepsFullText,
  showPublicStepsFullText,
  showSectionFullText,
  showStepDetail,
  showPublicStepDetail,
  showSectionStepDetail,
  handleCallback
};
