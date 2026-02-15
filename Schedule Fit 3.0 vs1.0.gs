/**
 * Schedule.gs - Управління розкладом
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Запис учнів на тренування
 * - Управління розкладом тренера
 * - Синхронізація з Google Calendar (якщо Calendar.gs є)
 *
 * НЕ МІСТИТЬ:
 * - Логіку тренувань (це Training.gs)
 * - Виклики Training.gs (уникнення циклів)
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API (експорт для Router)
// ═══════════════════════════════════════════════════════════

var Schedule = {
  handleCallback: function (chatId, action, params) {
    params = params || [];
    handleScheduleCallback_(chatId, action, params);
  },
  handleTextMessage: function (chatId, text) {
    handleScheduleTextMessage_(chatId, text);
  },
  startCoachBookingForStudent: function (chatId, studentChatId) {
    startCoachBookingForStudent_(chatId, studentChatId);
  },
  closeActiveBooking: function (studentChatId) {
    closeActiveBooking_(studentChatId);
  }
};

// ═══════════════════════════════════════════════════════════
// PRIVATE - CALLBACK HANDLER
// ═══════════════════════════════════════════════════════════

function handleScheduleCallback_(chatId, action, params) {
  var C = CONSTANTS.CALLBACKS;
  var FS = CONSTANTS.FSM_STATES;
  var ST = CONSTANTS.SCHEDULE_STATUS;

  // ─── Тренер: мій розклад ───
  if (action === C.SCH_MY_SCHEDULE) {
    showCoachMySchedule_(chatId);
    return;
  }

  // ─── Тренер: записати когось на слот ───
  if (action === C.SCH_BOOK_COACH && params[0]) {
    askSelectStudentForSlot_(chatId, params[0]);
    return;
  }

  // ─── Тренер: обрано учня для запису на слот (SCH_C_REQ:slotId_studentChatId) ───
  if (action === C.SCH_C_REQ && params[0]) {
    var parts = String(params[0]).split('_');
    if (parts.length >= 2) {
      coachBookStudentToSlot_(chatId, parts[0], parts[1]);
    } else {
      showCoachScheduleMenu_(chatId);
    }
    return;
  }

  // ─── Тренер: підтвердити запит учня ───
  if (action === C.SCH_CONF && params[0]) {
    confirmSlot_(chatId, params[0]);
    return;
  }

  // ─── Тренер: відхилити запит учня ───
  if (action === C.SCH_DECLINE && params[0]) {
    declineSlot_(chatId, params[0]);
    return;
  }

  // ─── Тренер: скасувати запис ───
  if (action === C.SCH_CANCEL && params[0]) {
    cancelSlot_(chatId, params[0]);
    return;
  }

  // ─── Тренер: перенести слот ───
  if (action === C.SCH_RESCHEDULE && params[0]) {
    askRescheduleSlot_(chatId, params[0]);
    return;
  }

  // ─── Тренер: завершити слот (тренування виконано) ───
  if (action === C.SCH_COMPLETE && params[0]) {
    completeSlot_(chatId, params[0]);
    return;
  }

  // ─── Учень: записатись на тренування (меню) ───
  if (action === C.SCH_STUDENT_BOOK) {
    showStudentAvailableSlots_(chatId);
    return;
  }

  // ─── Учень: запит на запис (вибір слоту) ───
  if (action === C.SCH_S_REQ && params[0]) {
    requestBookSlot_(chatId, params[0]);
    return;
  }

  // ─── Учень: підтвердити запис (від тренера) ───
  if (action === C.SCH_S_CONFIRM && params[0]) {
    studentConfirmSlot_(chatId, params[0]);
    return;
  }

  // ─── Учень: відхилити запис (від тренера) ───
  if (action === C.SCH_S_DECLINE && params[0]) {
    studentDeclineSlot_(chatId, params[0]);
    return;
  }

  // ─── Учень: мій розклад ───
  if (action === C.SCH_S_MY_SCHEDULE) {
    try {
      Logger.log('Schedule: SCH_S_MY_SCHEDULE chatId=' + chatId);
      showStudentMySchedule_(chatId);
    } catch (err) {
      Logger.log('Schedule.showStudentMySchedule_ error: ' + (err && err.message));
      try {
        if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
          Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Schedule.showStudentMySchedule_', (err && err.message) || 'unknown');
        }
      } catch (e2) {}
      Helpers.safeSend(chatId, '❌ Не вдалося завантажити розклад. Спробуй /start або пізніше.');
      Menu.show(chatId);
    }
    return;
  }

  // ─── Учень: запит на скасування ───
  if (action === C.SCH_S_CANCEL_REQ && params[0]) {
    requestCancelSlot_(chatId, params[0]);
    return;
  }

  // ─── Учень: запит на перенесення ───
  if (action === C.SCH_S_RESCHEDULE_REQ && params[0]) {
    requestRescheduleSlot_(chatId, params[0]);
    return;
  }

  Logger.log('Schedule.handleCallback: unknown action ' + action);
  State.clear(chatId);
  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - TEXT MESSAGE HANDLER (FSM)
// ═══════════════════════════════════════════════════════════

function handleScheduleTextMessage_(chatId, text) {
  var state = State.get(chatId);
  if (!state || !state.step) {
    State.clear(chatId);
    Menu.show(chatId);
    return;
  }

  var FS = CONSTANTS.FSM_STATES;
  var step = state.step;

  if (step === FS.SCH_SELECT_NEW_SLOT) {
    processNewSlotDateTime_(chatId, text, state.rescheduleSlotId);
    return;
  }

  State.clear(chatId);
  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// CLOSE ACTIVE BOOKING (викликається з Training.gs)
// КРИТИЧНО: НЕ викликати Training — уникнення циклів
// ═══════════════════════════════════════════════════════════

function closeActiveBooking_(studentChatId) {
  studentChatId = String(studentChatId);
  var slots = Sheets.getSlotsByStudentAndStatus(studentChatId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  if (!slots || slots.length === 0) {
    return;
  }
  var slot = slots[0];
  var slotId = slot.id;
  if (!slotId) {
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  // Запис вартості (I, J) та типу (K): один слот з розкладу = PERSONAL
  if (slot.coachId && slot.studentId) {
    try {
      if (typeof Sheets.getCurrentPrice === 'function' && typeof Sheets.updateScheduleSlotPrice === 'function') {
        var pc = Sheets.getCurrentPrice(slot.coachId, slot.studentId, CONSTANTS.TRAINING_TYPES.PERSONAL);
        if (pc && pc.price != null) {
          var cur = (pc.currency || (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString().trim();
          Sheets.updateScheduleSlotPrice(slotId, pc.price, cur);
        }
      }
      if (typeof Sheets.updateScheduleSlotTrainingType === 'function') {
        Sheets.updateScheduleSlotTrainingType(slotId, CONSTANTS.TRAINING_TYPES.PERSONAL);
      }
    } catch (e) {
      Logger.log('Schedule confirmByStudent price/type: ' + (e && e.message));
    }
  }
  syncSlotToCalendar_(slot, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  var coach = User.getByChatId(slot.coachId);
  var student = User.getByChatId(studentChatId);
  var dateTimeStr = formatSlotDateTime_(slot);
  if (coach && coach.chatId) {
    Helpers.safeSend(slot.coachId, '✅ Тренування завершено.\nУчень: ' + (student ? student.firstName : studentChatId) + '\nЧас: ' + dateTimeStr);
  }
  Helpers.safeSend(studentChatId, '✅ Тренування відмічено як виконане. Час: ' + dateTimeStr);
}

// ═══════════════════════════════════════════════════════════
// COACH - МІЙ РОЗКЛАД
// ═══════════════════════════════════════════════════════════

function showCoachMySchedule_(chatId) {
  var allSlots = Sheets.getSlotsByCoachAndStatus(chatId, null);
  if (!allSlots || allSlots.length === 0) {
    Helpers.safeSend(chatId, '📅 Розклад порожній.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  Helpers.sendKeyboard(chatId, '📅 **Мій розклад:**', [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]], { parse_mode: 'Markdown' });
  for (var i = 0; i < allSlots.length; i++) {
    sendCoachSlotCard_(chatId, allSlots[i], i + 1);
  }
}

function sendCoachSlotCard_(chatId, slot, index) {
  var dateTimeStr = formatSlotDateTime_(slot);
  var statusIcon = slot.status === CONSTANTS.SCHEDULE_STATUS.BOOKED ? '✅' : (slot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED ? '⏳' : '🆓');
  var student = slot.studentId ? User.getByChatId(slot.studentId) : null;
  var message = (index ? index + '. ' : '') + statusIcon + ' ' + dateTimeStr + '\n';
  if (slot.studentId) {
    message += 'Учень: ' + (student ? student.firstName : slot.studentId) + '\n';
  }
  message += 'Статус: ' + slot.status;
  var keyboard = [];
  if (slot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
    keyboard.push([{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + slot.id }]);
    keyboard.push([{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + slot.id }]);
  } else if (slot.status === CONSTANTS.SCHEDULE_STATUS.BOOKED) {
    keyboard.push([{ text: '✅ Завершити', callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + slot.id }]);
    keyboard.push([{ text: '📅 Перенести', callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE + ':' + slot.id }]);
    keyboard.push([{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_CANCEL + ':' + slot.id }]);
  } else if (slot.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    keyboard.push([{ text: '➕ Записати учня', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_COACH + ':' + slot.id }]);
  }
  Helpers.sendKeyboard(chatId, message, keyboard);
}

function startCoachBookingForStudent_(chatId, studentChatId) {
  var slots = Sheets.getSlotsByCoachAndStatus(chatId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  if (!slots || slots.length === 0) {
    Helpers.safeSend(chatId, '📅 Немає вільних слотів для запису.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  var student = User.getByChatId(studentChatId);
  var message = '📅 Вибери слот для учня: ' + (student ? student.firstName : studentChatId);
  var keyboard = [];
  for (var i = 0; i < slots.length; i++) {
    keyboard.push([{
      text: formatSlotDateTime_(slots[i]),
      callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + slots[i].id + '_' + studentChatId
    }]);
  }
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  Helpers.sendKeyboard(chatId, message, keyboard);
}

function showCoachScheduleMenu_(chatId) {
  var keyboard = [
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  Helpers.sendKeyboard(chatId, '📅 **Розклад тренувань**\n\nОбери дію:', keyboard, { parse_mode: 'Markdown' });
}

// ─── Тренер: записати когось на слот (вибір учня) ───
function askSelectStudentForSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  var students = User.getStudentsByCoach(chatId);
  if (!students || students.length === 0) {
    Helpers.safeSend(chatId, '❌ У тебе немає учнів. Додай учня в меню «Мої учні».');
    showCoachScheduleMenu_(chatId);
    return;
  }
  State.set(chatId, {
    step: CONSTANTS.FSM_STATES.SCH_SELECT_STUDENT,
    bookingSlotId: slotId
  });
  var keyboard = [];
  var i;
  for (i = 0; i < students.length; i++) {
    keyboard.push([{
      text: students[i].firstName + (students[i].lastName ? ' ' + students[i].lastName : ''),
      callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + slotId + '_' + students[i].chatId
    }]);
  }
  keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  Helpers.sendKeyboard(chatId, '👥 Обери учня для запису на слот:', keyboard);
}

function coachBookStudentToSlot_(chatId, slotId, studentChatId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    State.clear(chatId);
    showCoachScheduleMenu_(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  Sheets.updateScheduleSlotStudentId(slotId, String(studentChatId));
  syncSlotToCalendar_(slot, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  var student = User.getByChatId(studentChatId);
  var dateTimeStr = formatSlotDateTime_(slot);
  Helpers.safeSend(chatId, '✅ Записано учня ' + (student ? student.firstName : studentChatId) + ' на ' + dateTimeStr);
  Helpers.safeSend(studentChatId, '✅ Тренер записав тебе на тренування: ' + dateTimeStr);
  State.clear(chatId);
  showCoachScheduleMenu_(chatId);
}

// ─── Тренер підтверджує запит учня ───
function confirmSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  syncSlotToCalendar_(slot, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  var student = slot.studentId ? User.getByChatId(slot.studentId) : null;
  var dateTimeStr = formatSlotDateTime_(slot);
  Helpers.safeSend(chatId, '✅ Запис підтверджено. Учень: ' + (student ? student.firstName : slot.studentId) + ', ' + dateTimeStr);
  if (slot.studentId) {
    Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив твоїй запис на тренування: ' + dateTimeStr);
  }
  showCoachScheduleMenu_(chatId);
}

// ─── Тренер відхиляє запит учня ───
function declineSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  Sheets.updateScheduleSlotStudentId(slotId, '');
  var prevStudentId = slot.studentId;
  if (prevStudentId) {
    Helpers.safeSend(prevStudentId, '❌ Тренер відхилив запит на тренування.');
  }
  Helpers.safeSend(chatId, '❌ Запит відхилено.');
  showCoachScheduleMenu_(chatId);
}

// ─── Тренер скасовує запис ───
function cancelSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.CANCELED);
  syncSlotToCalendar_(slot, CONSTANTS.SCHEDULE_STATUS.CANCELED);
  if (slot.studentId) {
    Helpers.safeSend(slot.studentId, '❌ Тренер скасував запис на тренування.');
  }
  Helpers.safeSend(chatId, '✅ Запис скасовано.');
  showCoachScheduleMenu_(chatId);
}

// ─── Тренер переносить слот ───
function askRescheduleSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  State.set(chatId, {
    step: CONSTANTS.FSM_STATES.SCH_SELECT_NEW_SLOT,
    rescheduleSlotId: slotId
  });
  Helpers.safeSend(chatId,
    '📅 Введи нову дату та час:\n\n' +
    'Формат: ДД.ММ.РРРР ГГ:ХХ\n' +
    'Приклад: 10.02.2026 15:00'
  );
}

// ─── Тренер завершує слот ───
function completeSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    showCoachScheduleMenu_(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  // Запис вартості (I, J) та типу (K): підтвердження тренером = PERSONAL
  if (slot.coachId && slot.studentId) {
    try {
      if (typeof Sheets.getCurrentPrice === 'function' && typeof Sheets.updateScheduleSlotPrice === 'function') {
        var pc = Sheets.getCurrentPrice(slot.coachId, slot.studentId, CONSTANTS.TRAINING_TYPES.PERSONAL);
        if (pc && pc.price != null) {
          var cur = (pc.currency || (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString().trim();
          Sheets.updateScheduleSlotPrice(slotId, pc.price, cur);
        }
      }
      if (typeof Sheets.updateScheduleSlotTrainingType === 'function') {
        Sheets.updateScheduleSlotTrainingType(slotId, CONSTANTS.TRAINING_TYPES.PERSONAL);
      }
    } catch (e) {
      Logger.log('Schedule completeSlot_ price/type: ' + (e && e.message));
    }
  }
  syncSlotToCalendar_(slot, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  Helpers.safeSend(chatId, '✅ Тренування відмічено як виконане.');
  if (slot.studentId) {
    Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив завершення тренування.');
  }
  showCoachScheduleMenu_(chatId);
}

// ═══════════════════════════════════════════════════════════
// STUDENT - ЗАПИС НА ТРЕНУВАННЯ
// ═══════════════════════════════════════════════════════════

function showStudentAvailableSlots_(chatId) {
  var user = User.getByChatId(chatId);
  if (!user || !user.coachId) {
    Helpers.safeSend(chatId, '❌ У тебе немає призначеного тренера. Зв\'яжися з тренером для запису.');
    Menu.show(chatId);
    return;
  }
  var slots = Sheets.getSlotsByCoachAndStatus(user.coachId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  if (!slots || slots.length === 0) {
    Helpers.safeSend(chatId, '📅 Наразі немає вільних слотів. Запитай тренера.');
    Menu.show(chatId);
    return;
  }
  var keyboard = [];
  var i;
  var slot;
  for (i = 0; i < slots.length; i++) {
    slot = slots[i];
    keyboard.push([{
      text: formatSlotDateTime_(slot),
      callback_data: CONSTANTS.CALLBACKS.SCH_S_REQ + ':' + slot.id
    }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  Helpers.sendKeyboard(chatId, '📅 **Вільні слоти тренера**\n\nОбери час:', keyboard, { parse_mode: 'Markdown' });
}

function requestBookSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    Menu.show(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    Helpers.safeSend(chatId, '❌ Цей слот вже зайнятий.');
    Menu.show(chatId);
    return;
  }
  var user = User.getByChatId(chatId);
  if (!user || String(user.coachId) !== String(slot.coachId)) {
    Helpers.safeSend(chatId, '❌ Цей слот не від твого тренера.');
    Menu.show(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  Sheets.updateScheduleSlotStudentId(slotId, String(chatId));
  State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_WAITING_CONFIRM, requestedSlotId: slotId });
  var coach = User.getByChatId(slot.coachId);
  var dateTimeStr = formatSlotDateTime_(slot);
  Helpers.safeSend(chatId, '⏳ Запит на запис надіслано тренеру. Очікуй підтвердження.');
  Helpers.safeSend(slot.coachId,
    '⏳ **Запит на запис**\n\n' +
    'Учень: ' + (user.firstName || '') + '\n' +
    'Час: ' + dateTimeStr + '\n\n' +
    'Підтверди або відхили.',
    { parse_mode: 'Markdown' }
  );
  var kbd = [
    [{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + slotId }]
  ];
  Helpers.sendKeyboard(slot.coachId, 'Оберіть дію:', kbd);
}

function studentConfirmSlot_(chatId, slotId) {
  var state = State.get(chatId);
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    State.clear(chatId);
    Menu.show(chatId);
    return;
  }
  State.clear(chatId);
  Helpers.safeSend(chatId, '✅ Ти підтвердив запис. Чекай тренера о ' + formatSlotDateTime_(slot));
  Menu.show(chatId);
}

function studentDeclineSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    State.clear(chatId);
    Menu.show(chatId);
    return;
  }
  Sheets.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  State.clear(chatId);
  Helpers.safeSend(slot.coachId, '❌ Учень відхилив запис на ' + formatSlotDateTime_(slot));
  Helpers.safeSend(chatId, '❌ Запис відхилено.');
  Menu.show(chatId);
}

function showStudentMySchedule_(chatId) {
  chatId = String(chatId || '');
  var myBookings;
  try {
    myBookings = (typeof Sheets !== 'undefined' && Sheets.getSlotsByStudentAndStatus)
      ? Sheets.getSlotsByStudentAndStatus(chatId, null)
      : [];
  } catch (e) {
    Logger.log('Schedule.showStudentMySchedule_ getSlots error: ' + (e && e.message));
    myBookings = [];
  }
  if (!Array.isArray(myBookings)) myBookings = [];
  var bookedOrRequested = [];
  var i;
  for (i = 0; i < myBookings.length; i++) {
    var slot = myBookings[i];
    if (slot && (slot.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || slot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED)) {
      bookedOrRequested.push(slot);
    }
  }
  if (bookedOrRequested.length === 0) {
    Helpers.safeSend(chatId, '📅 У тебе немає активних записів. Якщо тренер щойно записав тебе — натисни «Мій розклад» ще раз або /start.');
    Menu.show(chatId);
    return;
  }
  Helpers.sendKeyboard(chatId, '📅 Мої записи:', [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]);
  for (i = 0; i < bookedOrRequested.length; i++) {
    sendStudentSlotCard_(chatId, bookedOrRequested[i], i + 1);
  }
}

function sendStudentSlotCard_(chatId, slot, index) {
  var coach = User.getByChatId(slot.coachId);
  var message = (index ? index + '. ' : '') + formatSlotDateTime_(slot) + '\n';
  message += 'Тренер: ' + (coach ? coach.firstName : slot.coachId) + '\n';
  message += 'Статус: ' + slot.status;
  var keyboard = [
    [{ text: '❌ Запит на скасування', callback_data: CONSTANTS.CALLBACKS.SCH_S_CANCEL_REQ + ':' + slot.id }],
    [{ text: '📅 Запит на перенесення', callback_data: CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE_REQ + ':' + slot.id }]
  ];
  Helpers.sendKeyboard(chatId, message, keyboard);
}

function requestCancelSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    Menu.show(chatId);
    return;
  }
  var student = User.getByChatId(chatId);
  var dateTimeStr = formatSlotDateTime_(slot);
  Helpers.safeSend(slot.coachId,
    '⚠️ **Запит на скасування**\n\n' +
    'Учень: ' + (student ? student.firstName : chatId) + '\n' +
    'Час: ' + dateTimeStr + '\n\n' +
    'Учень просить скасувати запис.',
    { parse_mode: 'Markdown' }
  );
  Helpers.safeSend(chatId, '✅ Запит надіслано тренеру.');
  Menu.show(chatId);
}

function requestRescheduleSlot_(chatId, slotId) {
  var slot = Sheets.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    Menu.show(chatId);
    return;
  }
  var student = User.getByChatId(chatId);
  var dateTimeStr = formatSlotDateTime_(slot);
  Helpers.safeSend(slot.coachId,
    '📅 **Запит на перенесення**\n\n' +
    'Учень: ' + (student ? student.firstName : chatId) + '\n' +
    'Поточний час: ' + dateTimeStr + '\n\n' +
    'Учень просить перенести тренування.',
    { parse_mode: 'Markdown' }
  );
  Helpers.safeSend(chatId, '✅ Запит надіслано тренеру.');
  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// FSM: ВВЕДЕННЯ НОВОЇ ДАТИ/ЧАСУ (тренер переносить слот)
// ═══════════════════════════════════════════════════════════

function processNewSlotDateTime_(chatId, text, rescheduleSlotId) {
  var parsed = parseDateTime_(text);
  if (!parsed) {
    Helpers.safeSend(chatId, '❌ Невірний формат. Введи: ДД.ММ.РРРР ГГ:ХХ');
    return;
  }
  if (parsed.getTime() < Date.now()) {
    Helpers.safeSend(chatId, '❌ Дата та час не можуть бути в минулому.');
    return;
  }
  var slot = Sheets.getSlotById(rescheduleSlotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    State.clear(chatId);
    Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    Menu.show(chatId);
    return;
  }
  var day = ('0' + parsed.getDate()).slice(-2);
  var month = ('0' + (parsed.getMonth() + 1)).slice(-2);
  var year = parsed.getFullYear();
  var timeStr = ('0' + parsed.getHours()).slice(-2) + ':' + ('0' + parsed.getMinutes()).slice(-2);
  if (!Sheets.updateScheduleSlotDateTime(rescheduleSlotId, parsed, timeStr)) {
    State.clear(chatId);
    Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    Menu.show(chatId);
    return;
  }
  State.clear(chatId);
  var updatedSlot = Sheets.getSlotById(rescheduleSlotId);
  syncSlotToCalendar_(updatedSlot || slot, updatedSlot ? updatedSlot.status : slot.status);
  Helpers.safeSend(chatId, '✅ Слот перенесено на ' + day + '.' + month + '.' + year + ' ' + timeStr + '.');
  showCoachScheduleMenu_(chatId);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function formatSlotDateTime_(slot) {
  if (!slot) return '';
  var d = slot.date instanceof Date ? slot.date : new Date(slot.date);
  var parts = (slot.time || '0:0').split(':');
  d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
  if (typeof Menu !== 'undefined' && typeof Menu.formatDateTime === 'function') {
    return Menu.formatDateTime(d);
  }
  var day = ('0' + d.getDate()).slice(-2);
  var month = ('0' + (d.getMonth() + 1)).slice(-2);
  var year = d.getFullYear();
  var h = ('0' + d.getHours()).slice(-2);
  var m = ('0' + d.getMinutes()).slice(-2);
  return day + '.' + month + '.' + year + ' ' + h + ':' + m;
}

function parseDateTime_(text) {
  if (!text || typeof text !== 'string') return null;
  var t = text.trim();
  var space = t.indexOf(' ');
  if (space === -1) return null;
  var dateStr = t.substring(0, space);
  var timeStr = t.substring(space + 1).trim();
  var dateParts = dateStr.split('.');
  if (dateParts.length !== 3) return null;
  var day = parseInt(dateParts[0], 10);
  var month = parseInt(dateParts[1], 10) - 1;
  var year = parseInt(dateParts[2], 10);
  var timeParts = timeStr.split(':');
  var hour = timeParts.length >= 1 ? parseInt(timeParts[0], 10) : 0;
  var min = timeParts.length >= 2 ? parseInt(timeParts[1], 10) : 0;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  var date = new Date(year, month, day, hour, min, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function syncSlotToCalendar_(slot, status) {
  if (typeof Calendar === 'undefined' || typeof Calendar.syncSlot !== 'function') {
    return;
  }
  try {
    var coach = User.getByChatId(slot.coachId);
    if (!coach || !coach.calendarId) {
      return;
    }
    var studentName = slot.studentId ? (function () {
      var u = User.getByChatId(slot.studentId);
      return u ? u.firstName : '';
    }()) : '';
    var newEventId = Calendar.syncSlot(coach.calendarId, slot, status, studentName);
    if (newEventId && slot.id) {
      Sheets.updateScheduleSlotCalEventId(slot.id, newEventId);
    }
  } catch (e) {
    Logger.log('Schedule.syncSlotToCalendar error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC: Calendar → Schedule (daily)
// ═══════════════════════════════════════════════════════════

function setupDailyCalendarSync_() {
  // Remove duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncCalendarDaily_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('syncCalendarDaily_')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
}

function syncCalendarDaily_() {
  var coaches = (typeof User !== 'undefined' && typeof User.getCoaches === 'function') ? User.getCoaches() : [];
  for (var i = 0; i < coaches.length; i++) {
    syncCalendarToScheduleForCoach_(coaches[i]);
  }
}

function syncCalendarToScheduleForCoach_(coach) {
  try {
    if (!coach || !coach.calendarId || typeof Calendar === 'undefined' || typeof Calendar.getEvents !== 'function') {
      return;
    }
    var now = new Date();
    var end = new Date();
    end.setDate(end.getDate() + 30);
    var events = Calendar.getEvents(coach.calendarId, now, end);
    if (!events || events.length === 0) {
      return;
    }
    var slots = Sheets.getSlotsByCoachAndStatus(coach.chatId, null) || [];
    var slotByEvent = {};
    for (var s = 0; s < slots.length; s++) {
      if (slots[s].calEventId) {
        slotByEvent[String(slots[s].calEventId)] = slots[s];
      }
    }
    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      var existing = slotByEvent[String(ev.id)];
      var date = ev.startTime instanceof Date ? ev.startTime : new Date(ev.startTime);
      var time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
      if (existing) {
        if (existing.date && existing.time && (existing.date.getTime() !== new Date(date).setHours(0, 0, 0, 0) || existing.time !== time)) {
          Sheets.updateScheduleSlotDateTime(existing.id, date, time);
        }
      } else {
        Sheets.insertScheduleSlot({
          id: Utilities.getUuid(),
          coachId: coach.chatId,
          studentId: '',
          date: date,
          time: time,
          status: CONSTANTS.SCHEDULE_STATUS.AVAILABLE,
          updatedAt: new Date(),
          calEventId: ev.id
        });
      }
    }
  } catch (error) {
    Logger.log('Schedule.syncCalendarToSchedule error: ' + error.message);
  }
}

// PUBLIC WRAPPER (for GAS Run dropdown)
function setupDailyCalendarSync() {
  setupDailyCalendarSync_();
}
