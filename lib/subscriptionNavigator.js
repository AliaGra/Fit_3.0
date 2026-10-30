/**
 * Спільний розділ «Абонемент залу» для Навігаторів тренера та користувача.
 * Бізнес-логіка абонементів — у subscription.js / supabase; тут лише UI перегляду.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const State = require('./state');
const supabase = require('./supabase');

const ROLE_COACH = 'coach';
const ROLE_STUDENT = 'student';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateUA(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-');
  if (!d) return ymd;
  return d + '.' + m + '.' + y;
}

function calendarDaysLeft(endYmd, today) {
  if (!endYmd) return null;
  const a = new Date(String(today).slice(0, 10) + 'T12:00:00');
  const b = new Date(String(endYmd).slice(0, 10) + 'T12:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function isNotYetStarted(sub, today) {
  const start = sub && sub.startDate ? String(sub.startDate).slice(0, 10) : '';
  return !!(start && start > today);
}

function navigatorCallbackForRole(role) {
  return role === ROLE_COACH
    ? CONSTANTS.CALLBACKS.MENU_HINTS
    : CONSTANTS.CALLBACKS.STUDENT_HINTS_MENU;
}

async function resolveRole(chatId, roleHint) {
  if (roleHint === ROLE_COACH || roleHint === ROLE_STUDENT) return roleHint;
  const st = await State.get(chatId);
  if (st && (st.subNavRole === ROLE_COACH || st.subNavRole === ROLE_STUDENT)) {
    return st.subNavRole;
  }
  return ROLE_STUDENT;
}

async function venueName(venueId) {
  if (!venueId) return 'Заклад не вказано';
  try {
    const v = await supabase.getVenueById(venueId);
    const name = v && (v.nameUa || v.name || v.title);
    return name && String(name).trim() ? String(name).trim() : 'Заклад';
  } catch (e) {
    return 'Заклад';
  }
}

/**
 * Абонементи для екрана: діючі + ще не активовані (майбутній start).
 * Використовує isGymSubscriptionActive (не змінюємо її для створення).
 */
async function listDisplayableSubscriptions(chatId) {
  const list = await supabase.getActiveGymSubscriptions(chatId);
  const sorted = (list || []).slice().sort((a, b) => {
    const ea = a.endDate ? String(a.endDate) : '9999-99-99';
    const eb = b.endDate ? String(b.endDate) : '9999-99-99';
    if (ea < eb) return -1;
    if (ea > eb) return 1;
    return 0;
  });
  return sorted;
}

async function formatSubscriptionCard(sub, today) {
  const place = await venueName(sub.venueId);
  let text = '🎟 **Абонемент**\n🏢 ' + place + '\n';

  if (isNotYetStarted(sub, today)) {
    text += 'Статус: Ще не активований\n';
    if (sub.startDate) text += '📅 Початок дії: ' + formatDateUA(sub.startDate) + '\n';
    return text.trim();
  }

  if (sub.isUnlimited) {
    text += 'Тип: Безлімітний\n';
  } else {
    text += 'Тип: На ' + (sub.trainingsCount || 0) + ' днів тренувань у залі\n';
  }

  if (sub.endDate) {
    text += '📅 Діє до: ' + formatDateUA(sub.endDate) + '\n';
    const leftCal = calendarDaysLeft(sub.endDate, today);
    if (leftCal != null) {
      text +=
        '⏳ Залишилося ' +
        leftCal +
        (sub.isUnlimited ? ' календарні дні' : ' календарні дні дії') +
        '\n';
    }
  }

  if (!sub.isUnlimited) {
    const used = await supabase.getWorkoutDaysCountInRange(
      sub.chatId,
      sub.startDate,
      sub.endDate,
      sub.venueId || undefined
    );
    const leftTrain = Math.max(0, (sub.trainingsCount || 0) - used);
    text += '🎟 Залишилося ' + leftTrain + ' днів тренувань у залі\n';
  }

  return text.trim();
}

async function showHub(chatId, roleHint) {
  const role = await resolveRole(chatId, roleHint);
  await State.update(chatId, { subNavRole: role });
  const text =
    '🎟 **Абонементи в залах**\n\n' +
    'Контролюй свої абонементи в усіх залах MAYAG Fit.\n' +
    'Переглядай терміни дії, залишок днів тренувань та отримуй нагадування про завершення.';
  const kb = [
    [{ text: '🎟 Мої абонементи', callback_data: CONSTANTS.CALLBACKS.SUB_NAV_LIST }],
    [{ text: '🔔 Нагадування', callback_data: CONSTANTS.CALLBACKS.SUB_NAV_REMINDERS }],
    [{ text: '⬅️ Навігатор', callback_data: navigatorCallbackForRole(role) }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, kb, { parse_mode: 'Markdown' });
}

async function showMySubscriptions(chatId, roleHint) {
  const role = await resolveRole(chatId, roleHint);
  await State.update(chatId, { subNavRole: role });
  const today = todayYmd();
  const list = await listDisplayableSubscriptions(chatId);
  let text = '🎟 **Мої абонементи**\n\n';
  if (!list.length) {
    text +=
      '**У тебе поки немає активних абонементів.**\n\n' +
      'Тут відображатимуться твої абонементи в спортивних залах.';
  } else {
    const blocks = [];
    for (const sub of list) {
      blocks.push(await formatSubscriptionCard(sub, today));
    }
    text += blocks.join('\n\n');
  }
  const keyboard = [
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.SUB_NAV_HUB }],
    [{ text: '⬅️ Навігатор', callback_data: navigatorCallbackForRole(role) }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showRemindersInfo(chatId, roleHint) {
  const role = await resolveRole(chatId, roleHint);
  await State.update(chatId, { subNavRole: role });
  const text =
    '🔔 **Нагадування про абонементи**\n\n' +
    'MAYAG Fit автоматично нагадує про завершення терміну дії абонемента та залишок днів тренувань у залі.\n\n' +
    '**📅 Нагадування про завершення абонемента:**\n' +
    '- за 3 дні до завершення;\n' +
    '- за 2 дні до завершення.\n\n' +
    '**🎟 Для абонементів на N днів тренувань у залі:**\n' +
    '- коли залишається 2 дні тренувань;\n' +
    '- коли залишається 1 день тренувань.\n\n' +
    'Кожне нагадування містить назву залу, щоб ти завжди розумів, якого саме абонемента воно стосується.';
  const keyboard = [
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.SUB_NAV_HUB }],
    [{ text: '⬅️ Навігатор', callback_data: navigatorCallbackForRole(role) }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function handleCallback(chatId, callbackData, roleHint) {
  if (!callbackData) return false;
  const action = String(callbackData).split(':')[0].trim();

  if (
    action === CONSTANTS.CALLBACKS.SUB_NAV_HUB ||
    action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION ||
    action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION_TEXT ||
    action === CONSTANTS.CALLBACKS.STUDENT_HINTS_SUBSCRIPTION
  ) {
    let role = roleHint;
    if (action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION || action === CONSTANTS.CALLBACKS.HINTS_SUBSCRIPTION_TEXT) {
      role = ROLE_COACH;
    } else if (action === CONSTANTS.CALLBACKS.STUDENT_HINTS_SUBSCRIPTION) {
      role = ROLE_STUDENT;
    }
    await showHub(chatId, role);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_NAV_LIST) {
    await showMySubscriptions(chatId, roleHint);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_NAV_REMINDERS) {
    await showRemindersInfo(chatId, roleHint);
    return true;
  }
  return false;
}

module.exports = {
  ROLE_COACH,
  ROLE_STUDENT,
  showHub,
  showMySubscriptions,
  showRemindersInfo,
  handleCallback,
  listDisplayableSubscriptions,
  isNotYetStarted,
  todayYmd
};
