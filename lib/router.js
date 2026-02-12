/**
 * Router — маршрутизація update: текст / callback → /start, меню, реєстрація, BACK_TO_MAIN
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const State = require('./state');
const User = require('./user');
const Menu = require('./menu');
const Registration = require('./registration');
const Coach = require('./coach');

async function route(update) {
  let data = null;
  try {
    data = Helpers.extractMessage(update);
    if (!data || !data.chatId) {
      console.log('Router: no chatId');
      return;
    }

    if (data.type === 'text') {
      await handleTextMessage(data.chatId, data.text);
    } else if (data.type === 'callback') {
      if (data.callbackQueryId) {
        Helpers.answerCallback(data.callbackQueryId).catch(() => {});
      }
      await handleCallback(data.chatId, data.callbackData);
    }
  } catch (error) {
    console.error('Router.route', error.message);
    if (data && data.chatId) {
      const backLabel = (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME) ? CONSTANTS.EMOJI.HOME + ' Головне меню' : '🏠 Головне меню';
      const keyboard = [[{ text: backLabel, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
      await Helpers.sendKeyboard(data.chatId, '❌ Виникла технічна помилка. Спробуй /start або зв\'яжися з підтримкою.', keyboard);
    }
  }
}

async function handleTextMessage(chatId, text) {
  if (Helpers.isCommand({ message: { text } }, 'start')) {
    await State.clear(chatId);
    const user = await User.getByChatId(chatId);
    if (user) {
      await Menu.show(chatId);
    } else {
      await Registration.start(chatId, { force: true });
    }
    return;
  }

  const state = await State.getSafe(chatId);
  if (!state || !state.step) {
    const user = await User.getByChatId(chatId);
    if (!user) {
      await Helpers.safeSend(chatId, '👋 Привіт! Натисни /start щоб почати.');
      return;
    }
    await Menu.show(chatId);
    return;
  }

  const step = state.step;
  if (step && (step.indexOf('reg_') === 0 || step === CONSTANTS.FSM_STATES.REG_ROLE || step === 'WAITING_FOR_START_CHOICE')) {
    const handled = await Registration.handleTextMessage(chatId, text);
    if (handled) return;
    await Helpers.safeSend(chatId, 'Обери варіант кнопкою вище або напиши /start');
    return;
  }
  if (step.indexOf('profile_') === 0 || step.indexOf('training_') === 0 || step.indexOf('sch_') === 0) {
    await Helpers.safeSend(chatId, '⚠️ Цей крок ще в розробці на новому боті. Натисни "🏠 Головне меню".');
    return;
  }
  await State.clear(chatId);
  await Helpers.safeSend(chatId, '⚠️ Щось пішло не так. Почни спочатку: /start');
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return;
  const action = String(callbackData).split(':')[0].trim();
  const params = String(callbackData).split(':').slice(1);

  if (action === CONSTANTS.CALLBACKS.BACK_TO_MAIN) {
    await Menu.show(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.CANCEL_ACTION) {
    await Menu.show(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.REG_NEW) {
    await Registration.showRoleStep(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.REG_INVITE) {
    await Helpers.safeSend(chatId, '🎟️ Функція «У мене є код» ще в розробці на новому боті. Обери «Нова реєстрація» або /start.');
    return;
  }
  const regHandled = await Registration.handleCallback(chatId, callbackData);
  if (regHandled) return;

  const coachHandled = await Coach.handleCallback(chatId, callbackData);
  if (coachHandled) return;

  const user = await User.getByChatId(chatId);
  if (!user) {
    await Registration.start(chatId, { force: true });
    return;
  }
  await Menu.show(chatId);
}

module.exports = { route };
