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
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const [h, min] = (slot.time || '0:0').toString().split(':').map((x) => parseInt(x, 10) || 0);
  const slotMoment = new Date(y, mo, day, h, min, 0, 0);
  return slotMoment.getTime() > Date.now();
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
    [{ text: '📆 Створити слоти', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_SLOTS }],
    [{ text: '⚙️ Налаштування', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '📅 Розклад тренувань\n\nОбери дію:', keyboard);
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

  let text = '📅 Мій розклад\n\n';
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
    for (const s of available) text += '• ' + formatSlotDateTime(s) + ' — Вільний\n';
  }
  if (future.length === 0) {
    text += 'Немає майбутніх слотів. Створи слоти кнопкою нижче.';
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
      { text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_CANCEL_REQ + ':' + s.id },
      { text: '🔄 Перенести', callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE_REQ + ':' + s.id }
    ]);
  }
  for (const s of available) {
    keyboard.push([{ text: '👤 Записати учня: ' + formatSlotDateTime(s) + ' (Вільний)', callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
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

// ——— Учень просить скасування → тренер підтверджує/відхиляє ———
async function studentRequestsCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showStudentMySchedule(chatId);
    return;
  }
  if (String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Це не твій запис.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const student = await User.getByChatId(chatId);
  const studentName = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : chatId;
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '⏳ Запит на скасування надіслано тренеру. Очікуй підтвердження.');
  const kbd = [
    [{ text: '✅ Підтвердити скасування', callback_data: CONSTANTS.CALLBACKS.SCH_COACH_CONF_CANCEL + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_COACH_DECLINE_CANCEL + ':' + slotId }]
  ];
  await Helpers.sendKeyboard(slot.coachId, '⏳ **Запит учня на скасування**\n\n' + studentName + ' просить скасувати тренування ' + dateTimeStr + '.', kbd, { parse_mode: 'Markdown' });
}

async function coachConfirmsStudentCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMySchedule(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.CANCELED);
  const dateTimeStr = formatSlotDateTime(slot);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив скасування тренування ' + dateTimeStr + '.');
  }
  await Helpers.safeSend(chatId, '✅ Скасування підтверджено.');
  await showCoachMySchedule(chatId);
}

async function coachDeclinesStudentCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMySchedule(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '❌ Тренер відхилив скасування тренування ' + dateTimeStr + '.');
  }
  await Helpers.safeSend(chatId, '❌ Скасування відхилено.');
  await showCoachMySchedule(chatId);
}

// ——— Учень просить перенести → обирає новий слот → тренер підтверджує/відхиляє ———
async function studentRequestsReschedule(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const user = await User.getByChatId(chatId);
  const coachId = user?.coachId || slot.coachId;
  const available = await supabase.getSlotsByCoachAndStatus(coachId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  const future = (available || []).filter((s) => isSlotInFuture(s) && String(s.id) !== String(slotId));
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів для переносу. Запитай тренера.');
    await showStudentMySchedule(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_S_RESCHEDULE_PICK, rescheduleOldSlotId: slotId });
  const keyboard = future.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE_PICK + ':' + s.id }]);
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  await Helpers.sendKeyboard(chatId, '🔄 Обери новий слот для переносу (було: ' + formatSlotDateTime(slot) + '):', keyboard);
}

async function studentPicksRescheduleSlot(chatId, newSlotId) {
  const state = await State.get(chatId);
  const oldSlotId = state?.rescheduleOldSlotId;
  if (!oldSlotId || !newSlotId) {
    await State.clear(chatId);
    await showStudentMySchedule(chatId);
    return;
  }
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!oldSlot || !newSlot || String(oldSlot.studentId) !== String(chatId) || String(newSlot.coachId) !== String(oldSlot.coachId) || newSlot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showStudentMySchedule(chatId);
    return;
  }
  const student = await User.getByChatId(chatId);
  const studentName = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : chatId;
  await Helpers.safeSend(chatId, '⏳ Запит на перенос надіслано тренеру. Очікуй підтвердження.');
  const kbd = [
    [{ text: '✅ Підтвердити перенос', callback_data: CONSTANTS.CALLBACKS.SCH_COACH_CONF_RESCHEDULE + ':' + oldSlotId + ':' + newSlotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_COACH_DECLINE_RESCHEDULE + ':' + oldSlotId }]
  ];
  await Helpers.sendKeyboard(
    oldSlot.coachId,
    '⏳ **Запит учня на перенос**\n\n' + studentName + ' просить перенести тренування з ' + formatSlotDateTime(oldSlot) + ' на ' + formatSlotDateTime(newSlot) + '.',
    kbd,
    { parse_mode: 'Markdown' }
  );
  await State.clear(chatId);
  await showStudentMySchedule(chatId);
}

async function coachConfirmsReschedule(chatId, oldSlotId, newSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!oldSlot || !newSlot || String(oldSlot.coachId) !== String(chatId) || String(newSlot.coachId) !== String(chatId) || newSlot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showCoachMySchedule(chatId);
    return;
  }
  const studentId = oldSlot.studentId;
  await supabase.updateScheduleSlotStatus(oldSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(oldSlotId, null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotStudentId(newSlotId, String(studentId));
  const newStr = formatSlotDateTime(newSlot);
  if (studentId) {
    await Helpers.safeSend(studentId, '✅ Тренер підтвердив перенос тренування на ' + newStr + '.');
  }
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено.');
  await showCoachMySchedule(chatId);
}

async function coachDeclinesReschedule(chatId, oldSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  if (!oldSlot || String(oldSlot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMySchedule(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(oldSlot);
  if (oldSlot.studentId) {
    await Helpers.safeSend(oldSlot.studentId, '❌ Тренер відхилив перенос тренування ' + dateTimeStr + '.');
  }
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  await showCoachMySchedule(chatId);
}

// ——— Тренер просить скасування → учень підтверджує/відхиляє ———
async function coachRequestsCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMySchedule(chatId);
    return;
  }
  if (!slot.studentId) {
    await cancelSlot(chatId, slotId);
    return;
  }
  const coach = await User.getByChatId(chatId);
  const coachName = coach ? (coach.firstName || '') + (coach.lastName ? ' ' + coach.lastName : '') : 'Тренер';
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '⏳ Запит на скасування надіслано учню. Очікуй підтвердження.');
  const kbd = [
    [{ text: '✅ Підтвердити скасування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_CONF_CANCEL + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_DECLINE_CANCEL + ':' + slotId }]
  ];
  await Helpers.sendKeyboard(slot.studentId, '⏳ **Запит тренера на скасування**\n\n' + coachName + ' просить скасувати тренування ' + dateTimeStr + '.', kbd, { parse_mode: 'Markdown' });
}

async function studentConfirmsCoachCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showStudentMySchedule(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.CANCELED);
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(slot.coachId, '✅ Учень підтвердив скасування тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '✅ Тренування скасовано.');
  await showStudentMySchedule(chatId);
}

async function studentDeclinesCoachCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showStudentMySchedule(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(slot.coachId, '❌ Учень відхилив скасування тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '❌ Скасування відхилено.');
  await showStudentMySchedule(chatId);
}

// ——— Тренер просить перенести → обирає новий слот → учень підтверджує/відхиляє ———
async function coachRequestsReschedule(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMySchedule(chatId);
    return;
  }
  const available = await supabase.getSlotsByCoachAndStatus(chatId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  const future = (available || []).filter((s) => isSlotInFuture(s) && String(s.id) !== String(slotId));
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів для переносу. Додай вікно в розклад.');
    await showCoachMySchedule(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_COACH_RESCHEDULE_PICK, rescheduleSlotId: slotId });
  const keyboard = future.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE_PICK + ':' + s.id }]);
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  await Helpers.sendKeyboard(chatId, '🔄 Обери новий слот для переносу (було: ' + formatSlotDateTime(slot) + '):', keyboard);
}

async function coachPicksRescheduleSlot(chatId, newSlotId) {
  const state = await State.get(chatId);
  const oldSlotId = state?.rescheduleSlotId;
  if (!oldSlotId || !newSlotId) {
    await State.clear(chatId);
    await showCoachMySchedule(chatId);
    return;
  }
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!oldSlot || !newSlot || String(oldSlot.coachId) !== String(chatId) || String(newSlot.coachId) !== String(chatId) || newSlot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showCoachMySchedule(chatId);
    return;
  }
  const coach = await User.getByChatId(chatId);
  const coachName = coach ? (coach.firstName || '') + (coach.lastName ? ' ' + coach.lastName : '') : 'Тренер';
  const studentId = oldSlot.studentId;
  await Helpers.safeSend(chatId, '⏳ Запит на перенос надіслано учню. Очікуй підтвердження.');
  const kbd = [
    [{ text: '✅ Підтвердити перенос', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_CONF_RESCHEDULE + ':' + oldSlotId + ':' + newSlotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_DECLINE_RESCHEDULE + ':' + oldSlotId }]
  ];
  await Helpers.sendKeyboard(
    studentId,
    '⏳ **Запит тренера на перенос**\n\n' + coachName + ' просить перенести тренування з ' + formatSlotDateTime(oldSlot) + ' на ' + formatSlotDateTime(newSlot) + '.',
    kbd,
    { parse_mode: 'Markdown' }
  );
  await State.clear(chatId);
  await showCoachMySchedule(chatId);
}

async function studentConfirmsCoachReschedule(chatId, oldSlotId, newSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!oldSlot || !newSlot || String(oldSlot.studentId) !== String(chatId) || String(newSlot.coachId) !== String(oldSlot.coachId) || newSlot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showStudentMySchedule(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(oldSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(oldSlotId, null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotStudentId(newSlotId, String(chatId));
  const newStr = formatSlotDateTime(newSlot);
  await Helpers.safeSend(oldSlot.coachId, '✅ Учень підтвердив перенос тренування на ' + newStr + '.');
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено. Тренування на ' + newStr + '.');
  await showStudentMySchedule(chatId);
}

async function studentDeclinesCoachReschedule(chatId, oldSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  if (!oldSlot || String(oldSlot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showStudentMySchedule(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(oldSlot);
  await Helpers.safeSend(oldSlot.coachId, '❌ Учень відхилив перенос тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  await showStudentMySchedule(chatId);
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

// ——— 1K: Налаштування шаблону слотів (дні відпочинку, тривалість, робочий день) ———
const WEEKDAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function formatSettingsSummary(settings) {
  const restStr = !settings.restDays || settings.restDays.length === 0
    ? 'без вихідних'
    : settings.restDays.sort((a, b) => a - b).map((d) => WEEKDAYS_UA[d]).join(', ');
  return (
    'Ваші дані:\n\n' +
    '📅 Дні відпочинку: ' + restStr + '\n' +
    '⏱️ Тривалість тренування: ' + (settings.workoutDurationMin || 60) + ' хв\n' +
    '🕐 Робочий день: ' + (settings.workStart || '09:00') + ' — ' + (settings.workEnd || '21:00')
  );
}

async function startSettingsFlow(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const existing = await supabase.getCoachScheduleSettings(chatId);
  if (existing) {
    await showSettingsSummary(chatId, existing);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_REST_DAYS, settingsRestDays: [] });
  await showSettingsRestDays(chatId, [], false);
}

async function showSettingsRestDays(chatId, selectedDays, editingFromSummary) {
  const sel = selectedDays || [];
  const dayButtons = WEEKDAYS_UA.map((label, idx) => {
    const isSelected = sel.indexOf(idx) >= 0;
    return { text: (isSelected ? '✓ ' : '') + label, callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY + ':' + idx };
  });
  const keyboard = [
    dayButtons.slice(0, 4),
    dayButtons.slice(4, 7),
    [{ text: 'Без вихідних', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY_NONE }]
  ];
  if (editingFromSummary) {
    keyboard.push([{ text: '✓ Готово', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY_DONE }]);
  }
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  const msg = editingFromSummary
    ? '📅 Встановіть день відпочинку:\n\nОбрані: ' + (sel.length ? sel.sort((a, b) => a - b).map((d) => WEEKDAYS_UA[d]).join(', ') : 'немає') + '. Натисни «Готово» коли обереш.'
    : '📅 Встановіть день відпочинку:\n\nОбери один день або «Без вихідних» — одразу перейдемо далі.';
  await Helpers.sendKeyboard(chatId, msg, keyboard);
}

async function showSettingsDuration(chatId) {
  await Helpers.safeSend(
    chatId,
    '⏱️ Встановіть тривалість тренування в хвилинах:\n\nВведи число від ' +
      CONSTANTS.SCHEDULE_SETTINGS.DURATION_MIN +
      ' до ' +
      CONSTANTS.SCHEDULE_SETTINGS.DURATION_MAX +
      ' (наприклад: 60)'
  );
}

async function showSettingsWorkDay(chatId) {
  const keyboard = [
    [{ text: 'За замовчуванням (09:00–21:00)', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_WORK + ':default' }],
    [{ text: 'Ввести вручну', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_WORK + ':custom' }],
    [{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '🕐 Встановіть початок і кінець робочого дня:\n\nОбери варіант або за замовчуванням буде 09:00–21:00.',
    keyboard
  );
}

async function showSettingsSummary(chatId, settings) {
  const text = formatSettingsSummary(settings);
  const keyboard = [
    [{ text: '✏️ Змінити', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT }],
    [{ text: '💾 Зберегти', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_SAVE }],
    [{ text: '📅 Розклад тренувань', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function handleSettingsDayToggle(chatId, dayIndex) {
  const state = await State.get(chatId);
  if (state?.editingFromSummary) {
    const current = state?.settingsRestDays || [];
    const idx = current.indexOf(dayIndex);
    const next = idx >= 0 ? current.filter((d) => d !== dayIndex) : [...current, dayIndex];
    await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_REST_DAYS, settingsRestDays: next, editingFromSummary: true });
    await showSettingsRestDays(chatId, next, true);
  } else {
    const restDays = [dayIndex];
    await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_DURATION, settingsRestDays: restDays });
    await showSettingsDuration(chatId);
  }
}

async function handleSettingsDayDone(chatId) {
  const state = await State.get(chatId);
  const restDays = state?.settingsRestDays || [];
  if (state?.editingFromSummary) {
    const existing = await supabase.getCoachScheduleSettings(chatId);
    const draft = existing
      ? { ...existing, restDays }
      : { coachId: String(chatId), restDays, workoutDurationMin: 60, workStart: '09:00', workEnd: '21:00' };
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: draft });
    await showSettingsSummary(chatId, draft);
  } else {
    await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_DURATION, settingsRestDays: restDays });
    await showSettingsDuration(chatId);
  }
}

async function handleSettingsDurationInput(chatId, text) {
  const num = parseInt(String(text).trim(), 10);
  const min = CONSTANTS.SCHEDULE_SETTINGS.DURATION_MIN;
  const max = CONSTANTS.SCHEDULE_SETTINGS.DURATION_MAX;
  if (isNaN(num) || num < min || num > max) {
    await Helpers.safeSend(chatId, '❌ Введи число від ' + min + ' до ' + max + '.');
    return;
  }
  const state = await State.get(chatId);
  if (state?.editingFromSummary) {
    const existing = await supabase.getCoachScheduleSettings(chatId);
    const draft = existing
      ? { ...existing, workoutDurationMin: num }
      : { coachId: String(chatId), restDays: state?.settingsRestDays || [], workoutDurationMin: num, workStart: '09:00', workEnd: '21:00' };
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: draft });
    await showSettingsSummary(chatId, draft);
  } else {
    await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_WORK_DAY, settingsDurationMin: num });
    await showSettingsWorkDay(chatId);
  }
}

async function handleSettingsWorkDefault(chatId) {
  const state = await State.get(chatId);
  let settings;
  if (state?.editingFromSummary) {
    const existing = await supabase.getCoachScheduleSettings(chatId);
    settings = existing
      ? { ...existing, workStart: CONSTANTS.SCHEDULE_SETTINGS.WORK_START_DEFAULT, workEnd: CONSTANTS.SCHEDULE_SETTINGS.WORK_END_DEFAULT }
      : { coachId: String(chatId), restDays: [], workoutDurationMin: 60, workStart: '09:00', workEnd: '21:00' };
  } else {
    settings = {
      coachId: String(chatId),
      restDays: state?.settingsRestDays || [],
      workoutDurationMin: state?.settingsDurationMin || 60,
      workStart: CONSTANTS.SCHEDULE_SETTINGS.WORK_START_DEFAULT,
      workEnd: CONSTANTS.SCHEDULE_SETTINGS.WORK_END_DEFAULT
    };
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: settings });
  await showSettingsSummary(chatId, settings);
}

async function handleSettingsWorkCustom(chatId) {
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_WORK_DAY, awaitingWorkTime: true });
  await Helpers.safeSend(chatId, 'Введи робочий день у форматі початок–кінець (наприклад: 09:00–21:00)');
}

function parseWorkTime(str) {
  const m = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  const start = m[1];
  const end = m[2];
  const startMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(start);
  const endMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(end);
  if (!startMatch || !endMatch) return null;
  const startMin = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMin = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);
  if (startMin >= endMin) return null;
  return { workStart: start, workEnd: end };
}

async function handleSettingsWorkTimeInput(chatId, text) {
  const parsed = parseWorkTime(text);
  if (!parsed) {
    await Helpers.safeSend(chatId, '❌ Невірний формат. Введи, наприклад: 09:00–21:00');
    return;
  }
  const state = await State.get(chatId);
  let settings;
  if (state?.editingFromSummary) {
    const existing = await supabase.getCoachScheduleSettings(chatId);
    settings = existing
      ? { ...existing, workStart: parsed.workStart, workEnd: parsed.workEnd }
      : { coachId: String(chatId), restDays: [], workoutDurationMin: 60, workStart: parsed.workStart, workEnd: parsed.workEnd };
  } else {
    settings = {
      coachId: String(chatId),
      restDays: state?.settingsRestDays || [],
      workoutDurationMin: state?.settingsDurationMin || 60,
      workStart: parsed.workStart,
      workEnd: parsed.workEnd
    };
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: settings });
  await showSettingsSummary(chatId, settings);
}

async function handleSettingsEdit(chatId) {
  const keyboard = [
    [{ text: '📅 День відпочинку', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_REST }],
    [{ text: '⏱️ Час тренування', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_DURATION }],
    [{ text: '🕐 Робочий день', callback_data: CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_WORK + ':menu' }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }]
  ];
  await Helpers.sendKeyboard(chatId, '✏️ Що змінити?', keyboard);
}

async function handleSettingsEditRest(chatId) {
  const state = await State.get(chatId);
  const existing = (await supabase.getCoachScheduleSettings(chatId)) || state?.settingsDraft;
  const restDays = existing ? (existing.restDays || []) : [];
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_REST_DAYS, settingsRestDays: restDays, settingsDraft: existing, editingFromSummary: true });
  await showSettingsRestDays(chatId, restDays, true);
}

async function handleSettingsEditDuration(chatId) {
  const state = await State.get(chatId);
  const existing = (await supabase.getCoachScheduleSettings(chatId)) || state?.settingsDraft;
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_DURATION, settingsDraft: existing, editingFromSummary: true });
  await showSettingsDuration(chatId);
}

async function handleSettingsEditWorkMenu(chatId) {
  const state = await State.get(chatId);
  const existing = (await supabase.getCoachScheduleSettings(chatId)) || state?.settingsDraft;
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_WORK_DAY, settingsDraft: existing, editingFromSummary: true });
  await showSettingsWorkDay(chatId);
}

async function handleSettingsSave(chatId) {
  const state = await State.get(chatId);
  let settings = state?.settingsDraft;
  if (!settings) {
    settings = await supabase.getCoachScheduleSettings(chatId);
  }
  if (!settings) {
    await Helpers.safeSend(chatId, '❌ Спочатку заповни налаштування.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  const ok = await supabase.upsertCoachScheduleSettings(settings);
  if (ok) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '✅ Налаштування збережено!');
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  await showCoachScheduleMenu(chatId);
}

// При поверненні з кроку редагування до summary (edit flow)
async function returnToSettingsSummaryFromEdit(chatId, draft) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: draft });
  await showSettingsSummary(chatId, draft);
}

// ——— 2K: Автоматичне створення слотів ———
function parseTimeToMinutes(str) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(str || '').trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutesToTimeStr(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function dateToISODate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + mo + '-' + day;
}

// 0=Пн, 1=Вт, ..., 6=Нд (відповідно до rest_days)
function getDayOfWeekUA(date) {
  const jsDow = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return (jsDow + 6) % 7; // Mon=0, ..., Sun=6
}

async function computeDaysAvailable(chatId) {
  const settings = await supabase.getCoachScheduleSettings(chatId);
  if (!settings) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxHorizon = new Date(today);
  maxHorizon.setDate(maxHorizon.getDate() + CONSTANTS.SCHEDULE_SETTINGS.SLOTS_HORIZON_DAYS);

  const lastSlotDate = await supabase.getMaxSlotDateByCoach(chatId);
  let startDate;
  if (!lastSlotDate) {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() + 1);
  } else {
    startDate = new Date(lastSlotDate);
    startDate.setDate(startDate.getDate() + 1);
  }

  if (startDate.getTime() > maxHorizon.getTime()) {
    return { daysAvailable: 0, startDate: null, message: 'Через 7 днів ви зможете додати нові слоти на майбутнє.' };
  }

  const endLimit = new Date(maxHorizon);
  const daysAvailable = Math.floor((endLimit.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const capped = Math.min(daysAvailable, CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MAX);

  return {
    daysAvailable: Math.max(0, capped),
    startDate,
    settings
  };
}

async function generateSlotsForCoach(chatId, numDays) {
  const info = await computeDaysAvailable(chatId);
  if (!info || !info.settings) return { ok: false, created: 0, message: 'Спочатку налаштуй шаблон («Налаштування»).' };
  if (info.daysAvailable < CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MIN) {
    return { ok: false, created: 0, message: info.message || 'Наразі немає доступних днів для створення слотів.' };
  }

  const { settings, startDate } = info;
  const reqDays = Math.min(numDays, info.daysAvailable);
  const reqDaysCapped = Math.max(CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MIN, Math.min(reqDays, CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MAX));

  const restDays = settings.restDays || [];
  const workStartMin = parseTimeToMinutes(settings.workStart || '09:00');
  const workEndMin = parseTimeToMinutes(settings.workEnd || '21:00');
  const durationMin = settings.workoutDurationMin || 60;

  let created = 0;
  const current = new Date(startDate);

  for (let d = 0; d < reqDaysCapped; d++) {
    const dow = getDayOfWeekUA(current);
    if (restDays.indexOf(dow) >= 0) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dateStr = dateToISODate(current);
    let slotMin = workStartMin;
    while (slotMin + durationMin <= workEndMin) {
      const timeStr = minutesToTimeStr(slotMin);
      const exists = await supabase.slotExists(chatId, dateStr, timeStr);
      if (!exists) {
        const id = crypto.randomUUID();
        const inserted = await supabase.insertScheduleSlot({
          id,
          coachId: String(chatId),
          studentId: null,
          date: dateStr + 'T12:00:00.000Z',
          time: timeStr,
          status: CONSTANTS.SCHEDULE_STATUS.AVAILABLE,
          updatedAt: new Date(),
          calEventId: null,
          priceCharged: null,
          currency: '',
          trainingType: ''
        });
        if (inserted) created++;
      }
      slotMin += durationMin;
    }
    current.setDate(current.getDate() + 1);
  }

  return { ok: true, created };
}

async function startCreateSlotsFlow(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }

  const settings = await supabase.getCoachScheduleSettings(chatId);
  if (!settings) {
    await Helpers.safeSend(chatId, '❌ Спочатку налаштуй шаблон: натисни «Налаштування» і заповни дні відпочинку, тривалість тренування та робочий день.');
    await showCoachScheduleMenu(chatId);
    return;
  }

  const info = await computeDaysAvailable(chatId);
  if (!info || info.daysAvailable < CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MIN) {
    await Helpers.safeSend(chatId, info?.message || 'Через 7 днів ви зможете додати нові слоти на майбутнє.');
    await showCoachScheduleMenu(chatId);
    return;
  }

  const minD = CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MIN;
  const maxD = Math.min(info.daysAvailable, CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MAX);
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_CREATE_SLOTS_DAYS, createSlotsMaxDays: maxD });
  const keyboard = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]];
  await Helpers.sendKeyboard(
    chatId,
    '📅 Створити слоти\n\n' +
      'Ви можете створити слоти на ' +
      maxD +
      ' днів.\n\n' +
      'Встановіть кількість днів (цифрами від ' +
      minD +
      ' до ' +
      maxD +
      '):\n\n' +
      'Через 7 днів ви зможете додати нові слоти на майбутнє.',
    keyboard
  );
}

async function handleCreateSlotsDaysInput(chatId, text) {
  const state = await State.get(chatId);
  const maxD = state?.createSlotsMaxDays ?? CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MAX;
  const num = parseInt(String(text).trim(), 10);
  const minD = CONSTANTS.SCHEDULE_SETTINGS.SLOTS_DAYS_MIN;

  if (isNaN(num) || num < minD || num > maxD) {
    await Helpers.safeSend(chatId, '❌ Введи число від ' + minD + ' до ' + maxD + '.');
    return;
  }

  await Helpers.safeSend(chatId, '⏳ Створюю слоти...');
  const result = await generateSlotsForCoach(chatId, num);

  await State.clear(chatId);
  if (result.ok) {
    await Helpers.safeSend(chatId, '✅ Створено ' + result.created + ' слотів.');
  } else {
    await Helpers.safeSend(chatId, '❌ ' + (result.message || 'Не вдалося створити слоти.'));
  }
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
  const keyboard = [];
  for (const s of future) {
    keyboard.push([
      { text: '❌ Скасувати ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_S_CANCEL_REQ + ':' + s.id },
      { text: '🔄 Перенести', callback_data: CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE + ':' + s.id }
    ]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
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
  if (action === CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE) {
    await startSettingsFlow(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CREATE_SLOTS) {
    await startCreateSlotsFlow(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY && rest) {
    const dayIdx = parseInt(rest.trim(), 10);
    if (dayIdx >= 0 && dayIdx <= 6) await handleSettingsDayToggle(chatId, dayIdx);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY_NONE) {
    const state = await State.get(chatId);
    const restDays = [];
    if (state?.editingFromSummary) {
      const existing = await supabase.getCoachScheduleSettings(chatId);
      const draft = existing
        ? { ...existing, restDays }
        : { coachId: String(chatId), restDays, workoutDurationMin: 60, workStart: '09:00', workEnd: '21:00' };
      await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_SETTINGS_SUMMARY, settingsDraft: draft });
      await showSettingsSummary(chatId, draft);
    } else {
      await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.SCH_SETTINGS_DURATION, settingsRestDays: restDays });
      await showSettingsDuration(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_DAY_DONE) {
    await handleSettingsDayDone(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_WORK && rest) {
    const param = rest.trim();
    if (param === 'default') await handleSettingsWorkDefault(chatId);
    else if (param === 'custom') await handleSettingsWorkCustom(chatId);
    else if (param === 'menu') await handleSettingsEditWorkMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT) {
    await handleSettingsEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_REST) {
    await handleSettingsEditRest(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_EDIT_DURATION) {
    await handleSettingsEditDuration(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SETTINGS_SAVE) {
    await handleSettingsSave(chatId);
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
  if (action === CONSTANTS.CALLBACKS.SCH_CANCEL_REQ && rest) {
    await coachRequestsCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_CANCEL_REQ && rest) {
    await studentRequestsCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_COACH_CONF_CANCEL && rest) {
    await coachConfirmsStudentCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_COACH_DECLINE_CANCEL && rest) {
    await coachDeclinesStudentCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE && rest) {
    await studentRequestsReschedule(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE_PICK && rest) {
    await studentPicksRescheduleSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_COACH_CONF_RESCHEDULE && rest) {
    const [oldId, newId] = rest.split(':').map((x) => x.trim());
    if (oldId && newId) await coachConfirmsReschedule(chatId, oldId, newId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_COACH_DECLINE_RESCHEDULE && rest) {
    await coachDeclinesReschedule(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_RESCHEDULE_REQ && rest) {
    await coachRequestsReschedule(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_RESCHEDULE_PICK && rest) {
    await coachPicksRescheduleSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_STUDENT_CONF_CANCEL && rest) {
    await studentConfirmsCoachCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_STUDENT_DECLINE_CANCEL && rest) {
    await studentDeclinesCoachCancel(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_STUDENT_CONF_RESCHEDULE && rest) {
    const [oldId, newId] = rest.split(':').map((x) => x.trim());
    if (oldId && newId) await studentConfirmsCoachReschedule(chatId, oldId, newId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_STUDENT_DECLINE_RESCHEDULE && rest) {
    await studentDeclinesCoachReschedule(chatId, rest.trim());
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

  if (step === CONSTANTS.FSM_STATES.SCH_SETTINGS_DURATION) {
    await handleSettingsDurationInput(chatId, text);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SCH_CREATE_SLOTS_DAYS) {
    await handleCreateSlotsDaysInput(chatId, text);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SCH_SETTINGS_WORK_DAY && state.awaitingWorkTime) {
    await handleSettingsWorkTimeInput(chatId, text);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SCH_S_RESCHEDULE_PICK) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, 'Оберіть слот кнопкою вище або натисніть «Скасувати».');
    await showStudentMySchedule(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SCH_COACH_RESCHEDULE_PICK) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, 'Оберіть слот кнопкою вище або натисніть «Скасувати».');
    await showCoachMySchedule(chatId);
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
