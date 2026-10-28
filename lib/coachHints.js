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
  buildSectionIntroText
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
    planDone,
    trainingDone,
    groupDone,
    breaksDone,
    reportsDone,
    subscriptionDone
  ] = await Promise.all([
    getSectionDoneMap(chatId, COACH_PLAN_HINTS),
    getSectionDoneMap(chatId, COACH_TRAINING_HINTS),
    getSectionDoneMap(chatId, COACH_GROUP_HINTS),
    getSectionDoneMap(chatId, COACH_BREAKS_HINTS),
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
        text: hintsMenuProgressLabel(
          COACH_PLAN_HINTS.menuLabel,
          countSectionDone(planDone, COACH_PLAN_HINTS),
          COACH_PLAN_HINTS.steps.length
        ),
        callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN
      }
    ],
    [
      {
        text: hintsMenuProgressLabel(
          COACH_TRAINING_HINTS.menuLabel,
          countSectionDone(trainingDone, COACH_TRAINING_HINTS),
          COACH_TRAINING_HINTS.steps.length
        ),
        callback_data: CONSTANTS.CALLBACKS.HINTS_TRAINING
      }
    ],
    [
      {
        text: hintsMenuProgressLabel(
          COACH_GROUP_HINTS.menuLabel,
          countSectionDone(groupDone, COACH_GROUP_HINTS),
          COACH_GROUP_HINTS.steps.length
        ),
        callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP
      }
    ],
    [
      {
        text: hintsMenuProgressLabel(
          COACH_BREAKS_HINTS.menuLabel,
          countSectionDone(breaksDone, COACH_BREAKS_HINTS),
          COACH_BREAKS_HINTS.steps.length
        ),
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
        { text: '🍔 Перерви / відпустки', callback_data: CONSTANTS.CALLBACKS.SCH_BREAKS_VACATION_MENU }
      ]);
      keyboard.push([{ text: '📆 Календар (21 день)', callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR }]);
    } else if (id === 2) {
      keyboard.push([
        { text: '🏖 Створити відпустку', callback_data: CONSTANTS.CALLBACKS.SCH_VACATION_ADD }
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

async function showSectionStepDetail(chatId, sectionKey, stepId) {
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
    await showSectionChecklist(chatId, 'plan');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_PLAN_TEXT) {
    await showSectionFullText(chatId, 'plan');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_TRAINING) {
    await showSectionChecklist(chatId, 'training');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_TRAINING_TEXT) {
    await showSectionFullText(chatId, 'training');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP) {
    await showSectionChecklist(chatId, 'group');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_GROUP_TEXT) {
    await showSectionFullText(chatId, 'group');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_BREAKS) {
    await showSectionChecklist(chatId, 'breaks');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.HINTS_BREAKS_TEXT) {
    await showSectionFullText(chatId, 'breaks');
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
  showFirstStepsFullText,
  showPublicStepsFullText,
  showSectionFullText,
  showStepDetail,
  showPublicStepDetail,
  showSectionStepDetail,
  handleCallback
};
