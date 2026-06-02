/**
 * Меню «Підказки» для власника закладу.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const {
  VENUE_OWNER_FIRST_STEPS,
  getDoneMap: getFirstDoneMap,
  toggleStep: toggleFirstStep,
  countDone: countFirstDone,
  buildRegAiIntroHintsText
} = require('./venueOwnerFirstSteps');
const {
  VENUE_OWNER_PROFILE_HINTS,
  VENUE_OWNER_CONTENT_HINTS,
  VENUE_OWNER_COACHES_HINTS,
  VENUE_OWNER_LIMITS_HINTS,
  getSectionByKey,
  getDoneMap: getSectionDoneMap,
  toggleStep: toggleSectionStep,
  countDone: countSectionDone,
  buildSectionIntroText
} = require('./venueOwnerHintSections');

const SECTION_META = Object.freeze({
  profile: {
    section: VENUE_OWNER_PROFILE_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.VOH_PROFILE,
    fullTextCallback: CONSTANTS.CALLBACKS.VOH_PROFILE_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_PRF_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_PRF_VIEW
  },
  content: {
    section: VENUE_OWNER_CONTENT_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.VOH_CONTENT,
    fullTextCallback: CONSTANTS.CALLBACKS.VOH_CONTENT_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_CNT_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_CNT_VIEW
  },
  coaches: {
    section: VENUE_OWNER_COACHES_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.VOH_COACHES,
    fullTextCallback: CONSTANTS.CALLBACKS.VOH_COACHES_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_CCH_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_CCH_VIEW
  },
  limits: {
    section: VENUE_OWNER_LIMITS_HINTS,
    menuCallback: CONSTANTS.CALLBACKS.VOH_LIMITS,
    fullTextCallback: CONSTANTS.CALLBACKS.VOH_LIMITS_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_LIM_TOGGLE,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.VOH_LIM_VIEW
  }
});

async function ensureVenueOwner(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || me.role !== CONSTANTS.ROLES.VENUE_OWNER) {
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише власникам закладу.');
    return null;
  }
  return me;
}

async function showHintsMenu(chatId) {
  if (!(await ensureVenueOwner(chatId))) return;
  const keyboard = [
    [{ text: '🚀 В першу чергу', callback_data: CONSTANTS.CALLBACKS.VOH_FIRST_STEPS }],
    [{ text: VENUE_OWNER_PROFILE_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.VOH_PROFILE }],
    [{ text: VENUE_OWNER_CONTENT_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.VOH_CONTENT }],
    [{ text: VENUE_OWNER_COACHES_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.VOH_COACHES }],
    [{ text: VENUE_OWNER_LIMITS_HINTS.menuLabel, callback_data: CONSTANTS.CALLBACKS.VOH_LIMITS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '💡 **Підказки**\n\nКерування карткою закладу, тренерами та межі ролі на фазі 0.\n\nОбери розділ:',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showFirstStepsChecklist(chatId) {
  if (!(await ensureVenueOwner(chatId))) return;
  const done = await getFirstDoneMap(chatId);
  const doneCount = countFirstDone(done);
  const total = VENUE_OWNER_FIRST_STEPS.length;
  const header =
    '🚀 **В першу чергу**\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Обери пункт — відкриється повний текст. Відмітку ✅ можна поставити після прочитання.\n\n';

  const keyboard = [];
  for (const item of VENUE_OWNER_FIRST_STEPS) {
    const mark = done[item.id] ? '✅' : '☐';
    keyboard.push([
      {
        text: mark + ' ' + item.id + '. ' + item.shortLabel,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.VOH_FS_VIEW + ':' + item.id
      }
    ]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: CONSTANTS.CALLBACKS.VOH_FIRST_STEPS_TEXT }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showSectionChecklist(chatId, sectionKey) {
  if (!(await ensureVenueOwner(chatId))) return;
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
    'Обери пункт — відкриється повний текст. Відмітку ✅ можна поставити після прочитання.\n\n';

  const keyboard = [];
  for (const item of section.steps) {
    const mark = done[item.id] ? '✅' : '☐';
    keyboard.push([{ text: mark + ' ' + item.id + '. ' + item.shortLabel, callback_data: meta.viewPrefix + ':' + item.id }]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: meta.fullTextCallback }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

function appendFirstStepNavButtons(keyboard, id) {
  if (id === 1) {
    keyboard.push([{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }]);
  } else if (id === 2) {
    keyboard.push([{ text: '✏️ Контакти та адреса', callback_data: CONSTANTS.CALLBACKS.VO_CONTACTS }]);
  } else if (id === 3) {
    keyboard.push([{ text: '🏷 Групові заняття', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS }]);
  } else if (id === 4) {
    keyboard.push([{ text: '👁 Як бачать учні', callback_data: CONSTANTS.CALLBACKS.VO_PREVIEW }]);
  } else if (id === 5) {
    keyboard.push([{ text: '🧑‍🏫 Тренери закладу', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }]);
  } else if (id === 6) {
    keyboard.push([
      { text: '💰 Ціни', callback_data: CONSTANTS.CALLBACKS.VO_PRICES },
      { text: '📅 Розклад групових', callback_data: CONSTANTS.CALLBACKS.VO_SCHEDULE }
    ]);
  }
}

function appendSectionNavButtons(keyboard, sectionKey, id) {
  if (sectionKey === 'profile') {
    if (id === 1) keyboard.push([{ text: '✏️ Контакти та адреса', callback_data: CONSTANTS.CALLBACKS.VO_CONTACTS }]);
    else if (id === 2) keyboard.push([{ text: '🏷 Групові заняття', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS }]);
    else if (id === 3) keyboard.push([{ text: '👁 Як бачать учні', callback_data: CONSTANTS.CALLBACKS.VO_PREVIEW }]);
  } else if (sectionKey === 'content') {
    if (id === 1) keyboard.push([{ text: '💰 Ціни', callback_data: CONSTANTS.CALLBACKS.VO_PRICES }]);
    else if (id === 2) keyboard.push([{ text: '📅 Розклад групових', callback_data: CONSTANTS.CALLBACKS.VO_SCHEDULE }]);
  } else if (sectionKey === 'coaches') {
    if (id >= 1 && id <= 4) {
      keyboard.push([{ text: '🧑‍🏫 Тренери закладу', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }]);
    }
  } else if (sectionKey === 'limits' && id === 3) {
    keyboard.push([{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }]);
  }
}

async function showFirstStepsFullText(chatId) {
  const text = buildRegAiIntroHintsText(CONSTANTS.ROLES.VENUE_OWNER);
  const keyboard = [
    [{ text: '🔙 До чекліста', callback_data: CONSTANTS.CALLBACKS.VOH_FIRST_STEPS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text.trim(), keyboard);
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
  const item = VENUE_OWNER_FIRST_STEPS.find((s) => s.id === id);
  if (!item) {
    await showFirstStepsChecklist(chatId);
    return;
  }
  const done = await getFirstDoneMap(chatId);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';
  const keyboard = [];
  appendFirstStepNavButtons(keyboard, id);
  keyboard.push([{ text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.VOH_FS_TOGGLE + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: CONSTANTS.CALLBACKS.VOH_FIRST_STEPS }],
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

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.MENU_HINTS) {
    await showHintsMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_FIRST_STEPS) {
    await showFirstStepsChecklist(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_FIRST_STEPS_TEXT) {
    await showFirstStepsFullText(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_PROFILE) {
    await showSectionChecklist(chatId, 'profile');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_PROFILE_TEXT) {
    await showSectionFullText(chatId, 'profile');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_CONTENT) {
    await showSectionChecklist(chatId, 'content');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_CONTENT_TEXT) {
    await showSectionFullText(chatId, 'content');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_COACHES) {
    await showSectionChecklist(chatId, 'coaches');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_COACHES_TEXT) {
    await showSectionFullText(chatId, 'coaches');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_LIMITS) {
    await showSectionChecklist(chatId, 'limits');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VOH_LIMITS_TEXT) {
    await showSectionFullText(chatId, 'limits');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VOH_FS_TOGGLE && param) {
    await toggleFirstStep(chatId, param);
    await showStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VOH_FS_VIEW && param) {
    await showStepDetail(chatId, param);
    return true;
  }

  const toggleSectionKey = findSectionKeyByTogglePrefix(action);
  if (toggleSectionKey && param) {
    const section = getSectionByKey(toggleSectionKey);
    if (section) {
      await toggleSectionStep(chatId, section, param);
      await showSectionStepDetail(chatId, toggleSectionKey, param);
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
  showSectionChecklist,
  showFirstStepsFullText,
  showSectionFullText,
  showStepDetail,
  showSectionStepDetail,
  handleCallback
};
