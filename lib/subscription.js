/**
 * Subscription (Абонемент залу) — опційно заповнюється користувачем: сума, кількість тренувань або безліміт, термін.
 * Меню «Абонемент», історія, нагадування за 3 і 2 дні до кінця та після останньої тренування.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');

function parseDateDDMMYYYY(str) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(str).trim());
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function toYYYYMMDD(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

async function showMenu(chatId) {
  await State.update(chatId, { step: 'sub_menu' });
  const active = await supabase.getActiveGymSubscription(chatId);
  let text = '🎫 **Абонемент залу**\n\n';
  if (active) {
    text += 'Поточний абонемент:\n';
    if (active.amount != null) text += '• Сума: ' + active.amount + ' грн\n';
    text += active.isUnlimited
      ? '• Безлімітне відвідування\n'
      : '• Тренувань: ' + (active.trainingsCount || 0) + '\n';
    text += '• Період: ' + formatDateUA(active.startDate) + ' — ' + formatDateUA(active.endDate) + '\n';
    if (!active.isUnlimited) {
      const used = await supabase.getWorkoutDaysCountInRange(chatId, active.startDate, active.endDate);
      text += '• Використано тренувань: ' + used + ' з ' + active.trainingsCount + '\n';
    }
    text += '\n';
  } else {
    text += 'У тебе поки немає активного абонемента. Можна додати оплату (опційно).\n\n';
  }
  text += 'Тут можна фіксувати оплату абонемента в залі: сума, кількість тренувань або безліміт, термін дії. Нагадування прийдуть за 3 і 2 дні до кінця.';
  const keyboard = [
    [{ text: '➕ Додати оплату', callback_data: CONSTANTS.CALLBACKS.SUB_ADD }],
    [{ text: '📋 Історія абонементів', callback_data: CONSTANTS.CALLBACKS.SUB_HISTORY }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

function formatDateUA(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-');
  if (!d) return ymd;
  const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const mi = parseInt(m, 10) - 1;
  return d + ' ' + (months[mi] || m) + ' ' + y;
}

async function showHistory(chatId) {
  const list = await supabase.getGymSubscriptionsByChatId(chatId);
  let text = '📋 **Історія абонементів**\n\n';
  if (!list || list.length === 0) {
    text += 'Історія порожня. Додай перший абонемент у «Додати оплату».';
  } else {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      text += (i + 1) + '. ' + formatDateUA(s.startDate) + ' — ' + formatDateUA(s.endDate);
      if (s.amount != null) text += ', ' + s.amount + ' грн';
      if (s.isUnlimited) text += ', безліміт';
      else text += ', ' + (s.trainingsCount || 0) + ' тренувань';
      const used = await supabase.getWorkoutDaysCountInRange(chatId, s.startDate, s.endDate);
      if (!s.isUnlimited) text += ' (використано: ' + used + ')';
      text += '\n';
    }
  }
  const keyboard = [[{ text: '◀ Назад', callback_data: 'SUB_BACK' }]];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function startAddAmount(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_AMOUNT });
  await Helpers.safeSend(chatId, '💰 Введіть суму оплати абонемента (грн), або цифру 0 щоб пропустити:\n\nПриклад: 1200');
}

async function askType(chatId) {
  await State.update(chatId, { step: 'sub_add_type' });
  const keyboard = [
    [{ text: 'Безлімітне відвідування', callback_data: CONSTANTS.CALLBACKS.SUB_TYPE_UNLIMITED }],
    [{ text: 'Фіксована кількість тренувань', callback_data: CONSTANTS.CALLBACKS.SUB_TYPE_FIXED }],
    [{ text: '◀ Скасувати', callback_data: 'SUB_BACK' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Оберіть тип абонемента:', keyboard);
}

async function askCount(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_COUNT });
  await Helpers.safeSend(chatId, '🔢 Введіть кількість тренувань у абонементі:\n\nПриклад: 12');
}

async function askStartDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_START });
  const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '01.03.2026';
  await Helpers.safeSend(chatId, '📅 Введіть дату початку дії абонемента (ДД.ММ.РРРР):\n\nПриклад: ' + ex);
}

async function askEndDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_END });
  const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '15.03.2026';
  await Helpers.safeSend(chatId, '📅 Введіть дату закінчення абонемента (ДД.ММ.РРРР):\n\nПриклад: ' + ex);
}

async function saveSubscriptionAndReturn(chatId, state) {
  const amount = state.subAmount != null ? parseFloat(state.subAmount) : null;
  const isUnlimited = state.subType === 'unlimited';
  const trainingsCount = isUnlimited ? null : (state.subCount != null ? parseInt(state.subCount, 10) : null);
  const startDate = toYYYYMMDD(state.subStartDate);
  const endDate = toYYYYMMDD(state.subEndDate);
  if (!startDate || !endDate) {
    await Helpers.safeSend(chatId, '❌ Невірні дати. Спробуй знову з меню «Абонемент».');
    await showMenu(chatId);
    return;
  }
  const id = await supabase.insertGymSubscription({
    chatId,
    amount: amount && amount > 0 ? amount : null,
    isUnlimited,
    trainingsCount,
    startDate,
    endDate
  });
  if (id) {
    await Helpers.safeSend(chatId, '✅ Абонемент збережено. Нагадування прийдуть за 3 і 2 дні до кінця терміну.');
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  await State.update(chatId, { step: undefined, subAmount: undefined, subType: undefined, subCount: undefined, subStartDate: undefined, subEndDate: undefined });
  await showMenu(chatId);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  if (action === 'SUB_BACK') {
    await State.update(chatId, { step: undefined, subAmount: undefined, subType: undefined, subCount: undefined, subStartDate: undefined, subEndDate: undefined });
    await showMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_ADD) {
    await State.update(chatId, { subAmount: undefined, subType: undefined, subCount: undefined, subStartDate: undefined, subEndDate: undefined });
    await startAddAmount(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_HISTORY) {
    await showHistory(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_TYPE_UNLIMITED) {
    await State.update(chatId, { subType: 'unlimited' });
    await askStartDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_TYPE_FIXED) {
    await State.update(chatId, { subType: 'fixed' });
    await askCount(chatId);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_AMOUNT) {
    const v = String(text).trim();
    const num = v === '0' || v === '' ? 0 : parseFloat(v);
    if (isNaN(num) || num < 0) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число (0 щоб пропустити).');
      return true;
    }
    await State.update(chatId, { subAmount: num === 0 ? null : num });
    await askType(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_COUNT) {
    const n = parseInt(String(text).trim(), 10);
    if (isNaN(n) || n < 1 || n > 999) {
      await Helpers.safeSend(chatId, '⚠️ Введіть кількість тренувань від 1 до 999.');
      return true;
    }
    await State.update(chatId, { subCount: n });
    await askStartDate(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_START) {
    const d = parseDateDDMMYYYY(text);
    if (!d) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР');
      return true;
    }
    await State.update(chatId, { subStartDate: d });
    await askEndDate(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_END) {
    const d = parseDateDDMMYYYY(text);
    if (!d) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР');
      return true;
    }
    const start = state.subStartDate;
    if (start && d < start) {
      await Helpers.safeSend(chatId, '⚠️ Дата закінчення має бути не раніше дати початку.');
      return true;
    }
    await State.update(chatId, { subEndDate: d });
    await saveSubscriptionAndReturn(chatId, { ...state, subEndDate: d });
    return true;
  }

  return false;
}

/** Перевірити, чи була щойно завершена остання тренування в рамках активного абонемента; якщо так — надіслати повідомлення. */
async function notifyIfLastTrainingInSubscription(chatId) {
  try {
    const active = await supabase.getActiveGymSubscription(chatId);
    if (!active || active.isUnlimited) return;
    const used = await supabase.getWorkoutDaysCountInRange(chatId, active.startDate, active.endDate);
    if (used >= (active.trainingsCount || 0)) {
      await Helpers.safeSend(chatId, '🏁 Тренування в рамках абонемента закінчились. Потрібно оплатити новий абонемент.\n\nМожна додати новий у меню «Абонемент».');
    }
  } catch (e) {
    console.error('Subscription.notifyIfLastTrainingInSubscription', e.message);
  }
}

module.exports = { showMenu, showHistory, handleCallback, handleTextMessage, notifyIfLastTrainingInSubscription };
