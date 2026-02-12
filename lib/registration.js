/**
 * Registration — старт реєстрації (привітання + вибір: нова / інвайт)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');

async function start(chatId, options = {}) {
  const force = !!options.force;
  if (!force) {
    // Трохи спрощено: без кешу welcome throttle; можна додати Redis або bot_state
  }
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

module.exports = { start };
