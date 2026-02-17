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
  const keyboard = [
    [{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }],
    [{ text: '📦 Архів учнів', callback_data: CONSTANTS.CALLBACKS.COACH_ARCHIVE_MENU }],
    [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏋️ Головне меню:', keyboard);
}

function showStudentMenu(chatId, user) {
  const firstName = user.firstName || 'Учне';
  const coachId = user.coachId || '';
  const coachButton = coachId
    ? { text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE + ':' + coachId }
    : { text: '👨‍🏫 Обрати тренера', callback_data: CONSTANTS.CALLBACKS.COACH_PICK_START };
  const keyboard = [
    [{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.MENU_SCHEDULE }],
    [coachButton],
    [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏃 Головне меню:', keyboard);
}

async function showScheduleSubmenu(chatId) {
  const keyboard = [
    [{ text: '📅 Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }],
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '📅 Розклад', keyboard);
}

async function showTrainingSubmenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await show(chatId);
    return;
  }
  const keyboard = [
    [{ text: '💪 Моє тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }],
    [{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.splice(1, 0, [{ text: '💪 Тренування учнів', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_START }]);
  }
  await Helpers.sendKeyboard(chatId, '💪 Тренування', keyboard);
}

module.exports = { show, showCoachMenu, showStudentMenu, showTrainingSubmenu, showScheduleSubmenu };
