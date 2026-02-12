/**
 * Registration — старт реєстрації (привітання + вибір: нова / інвайт), потім вибір ролі
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');

async function start(chatId, options = {}) {
  const force = !!options.force;
  const stepState = CONSTANTS.FSM_STATES.WAITING_FOR_START_CHOICE;
  await State.set(chatId, { step: stepState });

  const keyboard = [
    [{ text: '✅ Нова реєстрація', callback_data: CONSTANTS.CALLBACKS.REG_NEW }],
    [{ text: '🎟️ У мене є код', callback_data: CONSTANTS.CALLBACKS.REG_INVITE }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '👋 Привіт! Вітаю в системі FIT 3.0\n\nОбери варіант:',
    keyboard
  );
}

/** Показати вибір ролі (після натискання «Нова реєстрація») */
async function showRoleStep(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_ROLE });
  const keyboard = [
    [{ text: '🎓 Учень', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_STUDENT }],
    [{ text: '💪 Тренер', callback_data: CONSTANTS.CALLBACKS.REG_ROLE_COACH }]
  ];
  await Helpers.sendKeyboard(chatId, 'Обери роль:', keyboard);
}

module.exports = { start, showRoleStep };
