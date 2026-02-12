/**
 * Schedule — розклад тренувань (слоти), запис тренера/учня (без Google Calendar)
 */
const crypto = require('crypto');
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function formatSlotDateTime(slot) {
  if (!slot || !slot.date) return '';
  const d = slot.date instanceof Date ? slot.date : new Date(slot.date);
  const dateStr = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = (slot.time || '').toString().trim() || '—';
  return dateStr + ' ' + timeStr;
}

function isSlotInFuture(slot) {
  if (!slot || !slot.date) return false;
  const d = slot.date instanceof Date ? slot.date : new Date(slot.date);
  const [h, m] = (slot.time || '0:0').toString().split(':').map((x) => parseInt(x, 10) || 0);
  d.setHours(h, m, 0, 0);
  return d.getTime() > Date.now();
}

async function showCoachScheduleMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const keyboard = [
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SLOTS }],
    [{ text: '➕ Додати вікно', callback_data: CONSTANTS.CALLBACKS.SCH_ADD_SLOT }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '📅 **Розклад тренувань**\n\nОбери дію:', keyboard, { parse_mode: 'Markdown' });
}

async function showCoachMySchedule(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const future = (slots || []).filter(isSlotInFuture);
  const requested = future.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  const booked = future.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED);
  const available = future.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE);

  let text = '📅 **Мій розклад**\n\n';
  if (requested.length) {
    text += '⏳ Запити на підтвердження:\n';
    for (const s of requested) {
      const student = s.studentId ? await User.getByChatId(s.studentId) : null;
      const name = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : s.studentId;
      text += '• ' + formatSlotDateTime(s) + ' — ' + name + '\n';
    }
    text += '\n';
  }
  if (booked.length) {
    text += '✅ Підтверджені:\n';
    for (const s of booked) {
      const student = s.studentId ? await User.getByChatId(s.studentId) : null;
      const name = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : s.studentId;
      text += '• ' + formatSlotDateTime(s) + ' — ' + name + '\n';
    }
    text += '\n';
  }
  if (available.length) {
    text += '🕐 Вільні вікна:\n';
    for (const s of available) text += '• ' + formatSlotDateTime(s) + '\n';
  }
  if (future.length === 0) {
    text += 'Немає майбутніх слотів. Додай вікно кнопкою нижче.';
  }

  const keyboard = [];
  for (const s of requested) {
    keyboard.push([
      { text: '✅ ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + s.id },
      { text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + s.id }
    ]);
  }
  for (const s of booked) {
    keyboard.push([
      { text: '✔️ Завершити ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + s.id },
      { text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_CANCEL + ':' + s.id }
    ]);
  }
  for (const s of available) {
    keyboard.push([{ text: '👤 Записати учня: ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function askSelectStudentForSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  const students = await User.getStudentsByCoach(chatId);
  if (!students || students.length === 0) {
    await Helpers.safeSend(chatId, '❌ У тебе немає учнів. Додай учня в меню «Мої учні».');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SELECT_STUDENT, bookingSlotId: slotId });
  const keyboard = students.map((u) => [
    { text: (u.firstName || '') + (u.lastName ? ' ' + u.lastName : ''), callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + slotId + '_' + u.chatId }
  ]);
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  await Helpers.sendKeyboard(chatId, '👥 Обери учня для запису на слот ' + formatSlotDateTime(slot) + ':', keyboard);
}

async function coachBookStudentToSlot(chatId, slotId, studentChatId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await State.clear(chatId);
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotStudentId(slotId, String(studentChatId));
  const student = await User.getByChatId(studentChatId);
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '✅ Записано учня ' + (student ? student.firstName : studentChatId) + ' на ' + dateTimeStr);
  await Helpers.safeSend(studentChatId, '✅ Тренер записав тебе на тренування: ' + dateTimeStr);
  await State.clear(chatId);
  await showCoachScheduleMenu(chatId);
}

async function confirmSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  const student = slot.studentId ? await User.getByChatId(slot.studentId) : null;
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '✅ Запис підтверджено. Учень: ' + (student ? student.firstName : slot.studentId) + ', ' + dateTimeStr);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив твій запис на тренування: ' + dateTimeStr);
  }
  await showCoachScheduleMenu(chatId);
}

async function declineSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(slotId, null);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '❌ Тренер відхилив запит на тренування.');
  }
  await Helpers.safeSend(chatId, '❌ Запит відхилено.');
  await showCoachScheduleMenu(chatId);
}

async function cancelSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.CANCELED);
  const prevStudentId = slot.studentId;
  if (prevStudentId) {
    await Helpers.safeSend(prevStudentId, '❌ Тренування ' + formatSlotDateTime(slot) + ' скасовано тренером.');
  }
  await Helpers.safeSend(chatId, '❌ Запис скасовано.');
  await showCoachScheduleMenu(chatId);
}

async function completeSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  await Helpers.safeSend(chatId, '✅ Тренування відмічено як виконане.');
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив завершення тренування.');
  }
  await showCoachScheduleMenu(chatId);
}

// ——— Тренер: додати вікно (FSM: дата → час) ———
async function startAddSlot(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_ADD_SLOT_DATE });
  await Helpers.safeSend(
    chatId,
    '📅 Введи дату вікна (ДД.ММ.РРРР).\nПриклад: ' + CONSTANTS.SCHEDULE_FORMATS.DATE_EXAMPLE
  );
}

function parseScheduleDate(str) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(str).trim());
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function parseScheduleTime(str) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(str).trim());
  if (!m) return null;
  return m[0];
}

async function finishAddSlot(chatId, slotDate, timeStr) {
  const id = crypto.randomUUID();
  const d = slotDate instanceof Date ? slotDate : new Date(slotDate);
  const dateISO = d.toISOString().slice(0, 10);
  const inserted = await supabase.insertScheduleSlot({
    id,
    coachId: String(chatId),
    studentId: null,
    date: dateISO + 'T12:00:00.000Z',
    time: timeStr,
    status: CONSTANTS.SCHEDULE_STATUS.AVAILABLE,
    updatedAt: new Date(),
    calEventId: null,
    priceCharged: null,
    currency: '',
    trainingType: ''
  });
  if (inserted) {
    await Helpers.safeSend(chatId, '✅ Вікно додано: ' + d.toLocaleDateString('uk-UA') + ' ' + timeStr);
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти вікно. Спробуй ще раз.');
  }
  await State.clear(chatId);
  await showCoachScheduleMenu(chatId);
}

// ——— Учень: запис на тренування ———
async function startBookStudent(chatId, studentChatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await supabase.getSlotsByCoachAndStatus(chatId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  const future = (slots || []).filter(isSlotInFuture);
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів. Додай вікно в «Розклад тренувань» → «Додати вікно».');
    const Coach = require('./coach');
    await Coach.showStudentProfile(chatId, studentChatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_BOOK_STUDENT, targetStudentId: studentChatId });
  const student = await User.getByChatId(studentChatId);
  const studentName = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : 'учня';
  const keyboard = future.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_FOR + ':' + s.id }]);
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  await Helpers.sendKeyboard(chatId, '📅 Обери слот для запису **' + studentName + '**:', keyboard, { parse_mode: 'Markdown' });
}

async function showStudentAvailableSlots(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || !user.coachId) {
    await Helpers.safeSend(chatId, "❌ У тебе немає призначеного тренера. Зв'яжися з тренером для запису.");
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await supabase.getSlotsByCoachAndStatus(user.coachId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  const future = (slots || []).filter(isSlotInFuture);
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Наразі немає вільних слотів. Запитай тренера.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const keyboard = future.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_S_REQ + ':' + s.id }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '📅 **Вільні слоти тренера**\n\nОбери час:', keyboard, { parse_mode: 'Markdown' });
}

async function requestBookSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await Helpers.safeSend(chatId, '❌ Цей слот вже зайнятий.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const user = await User.getByChatId(chatId);
  if (!user || String(user.coachId) !== String(slot.coachId)) {
    await Helpers.safeSend(chatId, '❌ Цей слот не від твого тренера.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  await supabase.updateScheduleSlotStudentId(slotId, String(chatId));
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '⏳ Запит на запис надіслано тренеру. Очікуй підтвердження.');
  await Helpers.safeSend(
    slot.coachId,
    '⏳ **Запит на запис**\n\nУчень: ' + (user.firstName || '') + '\nЧас: ' + dateTimeStr + '\n\nПідтверди або відхили.',
    { parse_mode: 'Markdown' }
  );
  const kbd = [
    [{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + slotId }]
  ];
  await Helpers.sendKeyboard(slot.coachId, 'Оберіть дію:', kbd);
  const Menu = require('./menu');
  await Menu.show(chatId);
}

async function showStudentMySchedule(chatId) {
  const slots = await supabase.getSlotsByStudentAndStatus(chatId, null);
  const future = (slots || []).filter((s) => isSlotInFuture(s) && (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED));
  let text = '📅 **Мій розклад**\n\n';
  if (future.length === 0) {
    text += 'Немає майбутніх записів. Записатись можна кнопкою «Записатись на тренування».';
  } else {
    for (const s of future) {
      const statusLabel = s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED ? '⏳ очікує підтвердження' : '✅ підтверджено';
      text += '• ' + formatSlotDateTime(s) + ' — ' + statusLabel + '\n';
    }
  }
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData).split(':')[0].trim();
  const rest = String(callbackData).split(':').slice(1).join(':');

  if (action === CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE) {
    await showCoachScheduleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_MY_SLOTS) {
    await showCoachMySchedule(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_ADD_SLOT) {
    await startAddSlot(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CONF && rest) {
    await confirmSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_DECLINE && rest) {
    await declineSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CANCEL && rest) {
    await cancelSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_COMPLETE && rest) {
    await completeSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_BOOK_FOR && rest) {
    const slotId = rest.trim();
    const state = await State.get(chatId);
    const targetStudentId = state && state.targetStudentId ? String(state.targetStudentId) : null;
    if (targetStudentId && slotId) {
      await coachBookStudentToSlot(chatId, slotId, targetStudentId);
    } else {
      await State.clear(chatId);
      const Menu = require('./menu');
      await Menu.show(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_C_REQ && rest) {
    const [slotId, studentId] = rest.split('_');
    if (slotId && studentId) {
      await coachBookStudentToSlot(chatId, slotId.trim(), studentId.trim());
    } else if (slotId) {
      await askSelectStudentForSlot(chatId, slotId.trim());
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK) {
    await showStudentAvailableSlots(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE) {
    await showStudentMySchedule(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_REQ && rest) {
    await requestBookSlot(chatId, rest.trim());
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;

  if (step === CONSTANTS.FSM_STATES.SCH_ADD_SLOT_DATE) {
    const d = parseScheduleDate(text);
    if (!d) {
      await Helpers.safeSend(chatId, '❌ Невірний формат дати. Введи ДД.ММ.РРРР, наприклад ' + CONSTANTS.SCHEDULE_FORMATS.DATE_EXAMPLE);
      return true;
    }
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_ADD_SLOT_TIME, slotDate: d.toISOString() });
    await Helpers.safeSend(chatId, '🕐 Введи час (ГГ:ХХ). Приклад: ' + CONSTANTS.SCHEDULE_FORMATS.TIME_EXAMPLE);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SCH_ADD_SLOT_TIME) {
    const timeStr = parseScheduleTime(text);
    if (!timeStr) {
      await Helpers.safeSend(chatId, '❌ Невірний формат часу. Введи ГГ:ХХ, наприклад ' + CONSTANTS.SCHEDULE_FORMATS.TIME_EXAMPLE);
      return true;
    }
    const slotDate = state.slotDate ? new Date(state.slotDate) : null;
    if (!slotDate) {
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '❌ Сесію скинуто. Почни додавання вікна знову.');
      await showCoachScheduleMenu(chatId);
      return true;
    }
    await finishAddSlot(chatId, slotDate, timeStr);
    return true;
  }

  return false;
}

module.exports = {
  formatSlotDateTime,
  startBookStudent,
  showCoachScheduleMenu,
  showCoachMySchedule,
  showStudentAvailableSlots,
  showStudentMySchedule,
  handleCallback,
  handleTextMessage
};
