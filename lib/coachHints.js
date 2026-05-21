/**
 * Меню «Підсказки» для тренера.
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

async function showHintsMenu(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || me.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '💡 Підказки доступні лише тренерам.');
    return;
  }
  const keyboard = [
    [{ text: '🚀 В першу чергу', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '💡 **Підсказки**\n\nОбери розділ:', keyboard, { parse_mode: 'Markdown' });
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
  keyboard.push([{ text: '🔙 Підсказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
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
  }
  keyboard.push([{ text: toggleLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: CONSTANTS.CALLBACKS.HINTS_FIRST_STEPS }],
    [{ text: '🔙 Підсказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
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
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_TOGGLE && param) {
    await toggleStep(chatId, param);
    await showStepDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HINT_STEP_VIEW && param) {
    await showStepDetail(chatId, param);
    return true;
  }
  return false;
}

module.exports = {
  showHintsMenu,
  showFirstStepsChecklist,
  showFirstStepsFullText,
  showStepDetail,
  handleCallback
};
