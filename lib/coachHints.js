/**
 * Меню «Підказки» для тренера.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const {
  COACH_FIRST_STEPS,
  getDoneMap,
  toggleStep,
  countDone
} = require('./coachFirstSteps');
const {
  COACH_PUBLIC_STEPS,
  getDoneMap: getPublicDoneMap,
  toggleStep: togglePublicStep,
  countDone: countPublicDone,
  buildPublicDataIntroText
} = require('./coachPublicSteps');

async function showHintsMenu(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || me.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише тренерам.');
    return;
  }
  const keyboard = [
    [{ text: '🚀 В першу чергу', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: '📢 Публічні дані', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '💡 **Підказки**\n\nОбери розділ:', keyboard, { parse_mode: 'Markdown' });
}

async function showFirstStepsChecklist(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || me.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише тренерам.');
    return;
  }
  const done = await getDoneMap(chatId);
  const doneCount = countDone(done);
  const total = COACH_FIRST_STEPS.length;
  let header =
    '🚀 **В першу чергу**\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Обери пункт — відкриється повний текст. Відмітку ✅ можна поставити після прочитання.\n\n';

  const keyboard = [];
  for (const item of COACH_FIRST_STEPS) {
    const mark = done[item.id] ? '✅' : '☐';
    const label = mark + ' ' + item.id + '. ' + item.shortLabel;
    keyboard.push([
      { text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW + ':' + item.id }
    ]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS_TEXT }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showPublicStepsChecklist(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || me.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише тренерам.');
    return;
  }
  const done = await getPublicDoneMap(chatId);
  const doneCount = countPublicDone(done);
  const total = COACH_PUBLIC_STEPS.length;
  let header =
    '📢 **Публічні дані**\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Ці дані бачитимуть твої учні та користувачі платформи, які шукають тренера.\n\n' +
    'Обери пункт — відкриється повний текст. Відмітку ✅ можна поставити після прочитання.\n\n';

  const keyboard = [];
  for (const item of COACH_PUBLIC_STEPS) {
    const mark = done[item.id] ? '✅' : '☐';
    const label = mark + ' ' + item.id + '. ' + item.shortLabel;
    keyboard.push([
      { text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW + ':' + item.id }
    ]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS_TEXT }]);
  keyboard.push([{ text: '👁 Перегляд картки тренера', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
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

async function showStepDetail(chatId, stepId) {
  const id = parseInt(String(stepId), 10);
  const item = COACH_FIRST_STEPS.find((s) => s.id === id);
  if (!item) {
    await showFirstStepsChecklist(chatId);
    return;
  }
  const done = await getDoneMap(chatId);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';
  const keyboard = [];
  if (id === 1) {
    keyboard.push([
      { text: '⚙️ Налаштування розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }
    ]);
  } else if (id === 2) {
    keyboard.push([{ text: '📆 Створити слоти', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_SLOTS }]);
  } else if (id === 3) {
    keyboard.push([{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
  } else if (id === 4 || id === 6 || id === 7) {
    keyboard.push([{ text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }]);
  } else if (id === 8) {
    keyboard.push([
      { text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_PRICING },
      { text: '📋 Список учнів', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS_LIST }
    ]);
  }
  keyboard.push([{ text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
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
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE && param) {
    await toggleStep(chatId, param);
    await showStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW && param) {
    await showStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_TOGGLE && param) {
    await togglePublicStep(chatId, param);
    await showPublicStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_PUB_VIEW && param) {
    await showPublicStepDetail(chatId, param);
    return true;
  }
  return false;
}

module.exports = {
  showHintsMenu,
  showFirstStepsChecklist,
  showPublicStepsChecklist,
  showFirstStepsFullText,
  showPublicStepsFullText,
  showStepDetail,
  showPublicStepDetail,
  handleCallback
};
