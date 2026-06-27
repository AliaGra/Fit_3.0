/**
 * Меню «Підказки» для тренера.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const {
  COACH_FIRST_STEPS,
  getDoneMap: getFirstDoneMap,
  toggleStep: toggleFirstStep,
  countDone: countFirstDone
} = require('./coachFirstSteps');
const {
  COACH_PUBLIC_STEPS,
  getDoneMap: getPublicDoneMap,
  toggleStep: togglePublicStep,
  countDone: countPublicDone,
  buildPublicDataIntroText
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
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише тренерам.');
    return null;
  }
  return me;
}

async function showHintsMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const keyboard = [
    [{ text: '🚀 В першу чергу', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: '📢 Публічні дані', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }],
    [{ text: COACH_PLAN_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_PLAN }],
    [{ text: COACH_TRAINING_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_TRAINING }],
    [{ text: COACH_GROUP_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_GROUP }],
    [{ text: COACH_BREAKS_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_BREAKS }],
    [{ text: COACH_REPORTS_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_REPORTS }],
    [{ text: COACH_SUBSCRIPTION_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '💡 **Підказки**\n\nОбери розділ:', keyboard, { parse_mode: 'Markdown' });
}

async function showFirstStepsChecklist(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const done = await getFirstDoneMap(chatId);
  const doneCount = countFirstDone(done);
  const total = COACH_FIRST_STEPS.length;
  const header =
    '🚀 **В першу чергу**\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Натисни **☐** або **✅** біля пункту, щоб відмітити виконання. Натисни назву — відкриється детальний текст.\n\n';

  const keyboard = [];
  for (const item of COACH_FIRST_STEPS) {
    const mark = done[item.id] ? '✅' : '☐';
    const title = item.id + '. ' + item.shortLabel;
    const titleBtn = title.length > 38 ? title.slice(0, 35) + '…' : title;
    keyboard.push([
      { text: titleBtn, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':' + item.id },
      { text: mark, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE + ':' + item.id + ':list' }
    ]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS_TEXT }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showPublicStepsChecklist(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const done = await getPublicDoneMap(chatId);
  const doneCount = countPublicDone(done);
  const total = COACH_PUBLIC_STEPS.length;
  const header =
    '📢 **Публічні дані**\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Ці дані бачитимуть твої учні та користувачі платформи, які шукають тренера.\n\n' +
    'Натисни **☐** або **✅** біля пункту, щоб відмітити виконання. Натисни назву — відкриється детальний текст.\n\n';

  const keyboard = [];
  for (const item of COACH_PUBLIC_STEPS) {
    const mark = done[item.id] ? '✅' : '☐';
    const title = item.id + '. ' + item.shortLabel;
    const titleBtn = title.length > 38 ? title.slice(0, 35) + '…' : title;
    keyboard.push([
      { text: titleBtn, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW + ':' + item.id },
      { text: mark, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_TOGGLE + ':' + item.id + ':list' }
    ]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS_TEXT }]);
  keyboard.push([{ text: '👁 Перегляд картки тренера', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
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
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: meta.fullTextCallback }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function appendFirstStepNavButtons(keyboard, id) {
  if (id === 1) {
    keyboard.push([
      { text: '⚙️ Налаштування розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }
    ]);
  } else if (id === 2) {
    keyboard.push([{ text: '📆 Створити слоти', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_SLOTS_HINTS }]);
  } else if (id === 3) {
    keyboard.push([{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
  } else if (id === 4) {
    keyboard.push([{ text: '📆 Календар (21 день)', callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR }]);
    keyboard.push([{ text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
  } else if (id === 6 || id === 7 || id === 9) {
    keyboard.push([{ text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
  } else if (id === 8) {
    keyboard.push([
      { text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_PRICING },
      { text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }
    ]);
  }
}

function appendSectionNavButtons(keyboard, sectionKey, id) {
  if (sectionKey === 'plan') {
    if (id === 1 || id === 2 || id === 3 || id === 4 || id === 5 || id === 6) {
      keyboard.push([{ text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
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

async function showFirstStepsFullText(chatId) {
  const { buildRegAiIntroHintsText } = require('./coachFirstSteps');
  const text = buildRegAiIntroHintsText(CONSTANTS.ROLES.COACH);
  const keyboard = [
    [{ text: '🔙 До чекліста', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text.trim(), keyboard);
}

async function showPublicStepsFullText(chatId) {
  const text = buildPublicDataIntroText();
  const keyboard = [
    [{ text: '👁 Перегляд картки тренера', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }],
    [{ text: '🔙 До чекліста', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showSectionFullText(chatId, sectionKey) {
  const meta = SECTION_META[sectionKey];
  if (!meta) return;
  const text = buildSectionIntroText(meta.section);
  const keyboard = [
    [{ text: '🔙 До чекліста', callback_data: meta.menuCallback }],
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showStepDetail(chatId, stepId) {
  const id = parseInt(String(stepId), 10);
  const item = COACH_FIRST_STEPS.find((s) => s.id === id);
  if (!item) {
    await showFirstStepsChecklist(chatId);
    return;
  }
  const done = await getFirstDoneMap(chatId);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';
  const keyboard = [];
  appendFirstStepNavButtons(keyboard, id);
  keyboard.push([{ text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  );
  await Helpers.sendKeyboard(
    chatId,
    'Пункт ' + id + '. ' + item.shortLabel + '\n\n' + mark + '\n\n' + item.body,
    keyboard
  );
}

async function showPublicStepDetail(chatId, stepId) {
  const id = parseInt(String(stepId), 10);
  const item = COACH_PUBLIC_STEPS.find((s) => s.id === id);
  if (!item) {
    await showPublicStepsChecklist(chatId);
    return;
  }
  const done = await getPublicDoneMap(chatId);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';
  const keyboard = [];
  if (id === 1) {
    keyboard.push([{ text: '📸 Instagram', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_INSTAGRAM }]);
  } else if (id === 2) {
    keyboard.push([{ text: '📄 Мої документи', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS }]);
  } else if (id === 3) {
    keyboard.push([{ text: '🏢 Де треную', callback_data: CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES }]);
    keyboard.push([{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]);
  } else if (id === 4) {
    keyboard.push([
      { text: '⚙️ Налаштування розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }
    ]);
  }
  keyboard.push([{ text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_TOGGLE + ':' + id }]);
  keyboard.push(
    [{ text: '👁 Перегляд картки тренера', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }],
    [{ text: '🔙 До списку пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }],
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  );
  await Helpers.sendKeyboard(
    chatId,
    '**Пункт ' + id + '.** ' + item.shortLabel + '\n\n' + mark + '\n\n' + item.body,
    keyboard,
    { parse_mode: 'Markdown' }
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
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
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
    const { stepId, fromList } = parseHintToggleParam(param);
    await toggleFirstStep(chatId, stepId);
    if (fromList) await showFirstStepsChecklist(chatId);
    else await showStepDetail(chatId, stepId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW && param) {
    await showStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_TOGGLE && param) {
    const { stepId, fromList } = parseHintToggleParam(param);
    await togglePublicStep(chatId, stepId);
    if (fromList) await showPublicStepsChecklist(chatId);
    else await showPublicStepDetail(chatId, stepId);
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
