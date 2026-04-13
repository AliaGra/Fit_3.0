/**
 * Menu — головне меню (coach / student)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

/**
 * Ім'я для привітання в головному меню: лише firstName (без прізвища).
 * Якщо в полі кілька слів — береться перше слово.
 * @param {{ firstName?: string }} user
 * @param {string} fallback
 */
function menuGreetingName(user, fallback) {
  const raw = user && user.firstName != null ? String(user.firstName).trim() : '';
  if (!raw) return fallback;
  const first = raw.split(/\s+/)[0];
  return first || fallback;
}

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

async function showCoachMenu(chatId, user) {
  const now = new Date();
  const in7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  try {
    const students = await User.getStudentsByCoach(chatId);
    const withBirthdayIn7 = (students || []).filter((s) => {
      if (!s.birthDate) return false;
      const bd = s.birthDate instanceof Date ? s.birthDate : new Date(s.birthDate);
      if (isNaN(bd.getTime())) return false;
      return bd.getMonth() === in7.getMonth() && bd.getDate() === in7.getDate();
    });
    if (withBirthdayIn7.length > 0) {
      const dateStr = in7.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
      const names = withBirthdayIn7.map((s) => (s.firstName || '') + ' ' + (s.lastName || '').trim()).filter(Boolean);
      const msg = '🎂 Через 7 днів (' + dateStr + ') день народження учня(ів): ' + names.join(', ');
      await Helpers.safeSend(chatId, msg);
    }
  } catch (e) {
    console.error('Menu.showCoachMenu birthday reminder', e.message);
  }
  const firstName = menuGreetingName(user, 'Тренере');
  const keyboard = [
    [{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }],
    [{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }],
    [{ text: '🎫 Абонемент', callback_data: CONSTANTS.CALLBACKS.MENU_SUBSCRIPTION }],
    [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }]
  ];
  return Helpers.sendKeyboard(chatId, '👋 Привіт, ' + firstName + '!\n\n🏋️ Головне меню:', keyboard);
}

async function showStudentMenu(chatId, user) {
  const firstName = user.firstName || 'Учне';
  const keyboard = [
    [{ text: '💪 Тренування', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.MENU_SCHEDULE }],
    [{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }],
    [{ text: '🎫 Абонемент', callback_data: CONSTANTS.CALLBACKS.MENU_SUBSCRIPTION }],
    [{ text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }],
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '🤖 AI-аналітика', callback_data: CONSTANTS.CALLBACKS.AI_ANALYTICS }],
    [{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }],
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }]
  ];

  let menuText = '👋 Привіт, ' + Helpers.escapeHtml(firstName) + '!\n\n';
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
        if (coach) coachName = menuGreetingName(coach, 'Тренер');
      }
      menuText +=
        '⏰ <b>Сьогодні тренування</b> о ' +
        Helpers.escapeHtml(times.length === 1 ? times[0] : times.join(', ')) +
        ' · ' +
        Helpers.escapeHtml(coachName) +
        '\n\n';
    }
  } catch (e) {
    console.error('Menu.showStudentMenu reminder', e.message);
  }
  menuText += '🏃 Головне меню:';
  return Helpers.sendKeyboard(chatId, menuText, keyboard, { parse_mode: 'HTML' });
}

function loadOfferTextSafe() {
  try {
    const filePath = path.join(__dirname, '..', 'OFERTA.md');
    const raw = fs.readFileSync(filePath, 'utf8');
    return String(raw || '').trim();
  } catch (e) {
    console.error('Menu.loadOfferTextSafe', e.message);
    return '';
  }
}

async function showDeveloperContactMenu(chatId) {
  const keyboard = [
    [{ text: '💬 Написати розробнику', url: CONSTANTS.URLS.DEV_HELP_BOT }],
    [{ text: '📄 Читати оферту', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_OFFER }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, 'Зв’язок з розробником\n\nОбери дію:', keyboard);
}

async function sendOfferText(chatId) {
  const text = loadOfferTextSafe();
  if (!text) {
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити текст оферти.');
    return;
  }
  const keyboard = [
    [{ text: '💬 Написати розробнику', url: CONSTANTS.URLS.DEV_HELP_BOT }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showScheduleSubmenu(chatId) {
  const keyboard = [
    [{ text: '📅 Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }],
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }],
    [{ text: '🔄 Змінити запис', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_EDIT }],
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
  const keyboard = [];
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.push([{ text: '💪 Тренування учнів', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_START }]);
    keyboard.push([{ text: '💪 Моє тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }]);
  } else {
    keyboard.push([{ text: '💪 Моє тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }]);
  }
  keyboard.push([{ text: '📖 Бібліотека вправ', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]);
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.push([{ text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '💪 Тренування', keyboard);
}

module.exports = {
  show,
  showCoachMenu,
  showStudentMenu,
  showTrainingSubmenu,
  showScheduleSubmenu,
  showDeveloperContactMenu,
  sendOfferText
};
