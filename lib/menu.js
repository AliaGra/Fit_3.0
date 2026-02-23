/**
 * Menu — головне меню (coach / student)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

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
    [{ text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }],
    [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏋️ Головне меню:', keyboard);
}

async function showStudentMenu(chatId, user) {
  const firstName = user.firstName || 'Учне';
  const keyboard = [
    [{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.MENU_SCHEDULE }],
    [{ text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }],
    [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }]
  ];

  let menuText = '👋 Привіт, ' + firstName + '!\n\n';
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();
  try {
    const allSlots = await supabase.getSlotsByStudentAndStatus(chatId, null);
    const todaySlots = (allSlots || []).filter((s) => {
      if (!s.date || !s.time) return false;
      const status = (s.status || '').toUpperCase();
      if (status !== 'BOOKED' && status !== 'RESERVED') return false;
      const slotDate = s.date instanceof Date ? s.date : new Date(s.date);
      return slotDate.getFullYear() === todayY && slotDate.getMonth() === todayM && slotDate.getDate() === todayD;
    });
    if (todaySlots.length > 0) {
      const times = todaySlots.map((s) => (String(s.time || '').match(/^\d{1,2}:\d{2}/) || [s.time])[0]).filter(Boolean);
      const coachIds = [...new Set(todaySlots.map((s) => s.coachId).filter(Boolean))];
      let coachName = 'Тренер';
      if (coachIds.length > 0) {
        const coach = await User.getByChatId(coachIds[0]);
        if (coach) coachName = (coach.firstName || '').trim() + (coach.lastName ? ' ' + coach.lastName : '').trim() || 'Тренер';
      }
      menuText += '⏰ **Сьогодні тренування** о ' + (times.length === 1 ? times[0] : times.join(', ')) + ' · ' + coachName + '\n\n';
    }
  } catch (e) {
    console.error('Menu.showStudentMenu reminder', e.message);
  }
  menuText += '🏃 Головне меню:';
  return Helpers.sendKeyboard(chatId, menuText, keyboard, { parse_mode: 'Markdown' });
}

async function showScheduleSubmenu(chatId) {
  const keyboard = [
    [{ text: '📅 Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }],
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
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
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.splice(1, 0, [{ text: '💪 Тренування учнів', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_START }]);
  }
  await Helpers.sendKeyboard(chatId, '💪 Тренування', keyboard);
}

module.exports = { show, showCoachMenu, showStudentMenu, showTrainingSubmenu, showScheduleSubmenu };
