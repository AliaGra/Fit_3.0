/**
 * Menu — головне меню (coach / student)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');

async function show(chatId) {
  await State.clear(chatId);
  const user = await User.getByChatId(chatId);
  if (!user) {
    const Registration = require('./registration');
    await Registration.start(chatId, { force: true });
    return;
  }
  if (user.role === CONSTANTS.ROLES.COACH) {
    await showCoachMenu(chatId, user);
  } else if (user.role === CONSTANTS.ROLES.STUDENT) {
    await showStudentMenu(chatId, user);
  } else {
    await Helpers.safeSend(chatId, '❌ Невідома роль. Почни спочатку: /start');
  }
}

function showCoachMenu(chatId, user) {
  const firstName = user.firstName || 'Тренере';
  const coachId = user.coachId || '';
  const coachButton = coachId
    ? { text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE + ':' + coachId }
    : { text: '👨‍🏫 Обрати тренера', callback_data: CONSTANTS.CALLBACKS.COACH_PICK_START };
  const keyboard = [
    [{ text: '👤 Профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: '💪 Самостійне тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '💪 Тренування учнів', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_START }],
    [{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }],
    [{ text: '📅 Розклад тренувань', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '📈 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [coachButton],
    [{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏋️ Головне меню тренера:', keyboard);
}

function showStudentMenu(chatId, user) {
  const firstName = user.firstName || 'Учне';
  const coachId = user.coachId || '';
  const coachProfileCb = coachId
    ? CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE + ':' + coachId
    : CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE;
  const keyboard = [
    [{ text: '👤 Профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '📅 Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }],
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }],
    [{ text: '👨‍🏫 Мій тренер', callback_data: coachProfileCb }],
    [{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏃 Головне меню учня:', keyboard);
}

module.exports = { show, showCoachMenu, showStudentMenu };
