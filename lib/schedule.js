/**
 * Schedule — розклад тренувань (слоти), запис тренера/учня (без Google Calendar)
 */
const crypto = require('crypto');
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

// Telegram reply_markup limit ~4096 bytes; limit rows to avoid "reply markup is too long"
const MAX_AVAILABLE_SLOT_BUTTONS = 8;
const MAX_SLOT_BUTTONS_PER_PAGE = 8;
const SLOTS_PER_DAY_PAGE = 8;
/** Макс. майбутніх записів у «Мій розклад» / «Змінити запис» (було 3; Telegram вміщає десятки рядків у одному повідомленні). */
const MAX_STUDENT_MY_SCHEDULE_SLOTS = 20;
/** «Мій розклад» (лічильники на кнопках + списки фільтрів + «Відмітити тренування»): сьогодні + наступні 20 днів = 21 календарний день. */
const COACH_MY_SCHEDULE_WINDOW_DAYS = 21;

function getDateKey(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Діапазон дат для вікна тренера «Мій розклад» (ключі YYYY-MM-DD). */
function getCoachMyScheduleWindowStartEndKeys() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + COACH_MY_SCHEDULE_WINDOW_DAYS - 1);
  return { startKey: getDateKey(today), endKey: getDateKey(endDate) };
}

function formatDateShort(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return x.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

/** Дата + короткий день тижня, напр. "20.02 пн" */
function formatDateShortWithWeekday(d) {
  const short = formatDateShort(d);
  if (!short) return '';
  const x = d instanceof Date ? d : new Date(d);
  const w = WEEKDAY_UA[x.getDay()];
  return w ? short + ' ' + w : short;
}

const WEEKDAY_UA = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** День тижня повною назвою (називний), неділя = 0 — заголовки в «Зайняті слоти». */
const WEEKDAY_LONG_UA = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];

/** Дата дд.мм + час без року і без скорочення дня тижня. */
function formatSlotDayMonthTimeNoWeekday(slot) {
  try {
    if (!slot || slot.date == null) return '';
    const d = slot.date instanceof Date ? slot.date : new Date(slot.date);
    if (isNaN(d.getTime())) return '';
    const dateStr = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
    const timeStr = (slot.time || '').toString().trim() || '—';
    return dateStr + ' ' + timeStr;
  } catch (e) {
    return '';
  }
}

/** Емодзі на кнопці дня (звичайний день зі вільними слотами — без префікса). */
function studentBookCalendarEmoji(hasPending, hasConfirmed, isToday, isSunday, count) {
  if (hasPending) return '🟡 ';
  if (hasConfirmed) return '🔵 ';
  if (isToday) return '🟢 ';
  if (isSunday) return '🔴 ';
  if (count === 0) return '⬜ ';
  return '';
}

/** Текст кнопки календаря (Telegram до ~256 символів; не відкидаємо емодзі через хибний ліміт 64). */
function trimStudentCalendarButtonText(label) {
  const max = 250;
  if (label.length <= max) return label;
  return label.slice(0, max) + '…';
}

function formatSlotDateTime(slot, options) {
  try {
    if (!slot || slot.date == null) return '';
    const d = slot.date instanceof Date ? slot.date : new Date(slot.date);
    if (isNaN(d.getTime())) return '';
    const noYear = options && options.noYear;
    const dateStr = noYear
      ? d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
      : d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dayOfWeek = WEEKDAY_UA[d.getDay()] || '';
    const timeStr = (slot.time || '').toString().trim() || '—';
    return dayOfWeek ? dateStr + ', ' + dayOfWeek + ' ' + timeStr : dateStr + ' ' + timeStr;
  } catch (e) {
    return '';
  }
}

function isSlotInDateRange(slot, startKey, endKey) {
  const key = slot?.date ? getDateKey(slot.date) : '';
  return key && key >= startKey && key <= endKey;
}

function isSlotOnDate(slot, dateKey) {
  return slot?.date && getDateKey(slot.date) === dateKey;
}

/** Ім'я учня для відображення (в т.ч. для INVITE_ — з профілю запрошення). */
async function getStudentDisplayName(studentId) {
  if (!studentId) return '';
  const id = String(studentId);
  if (id.startsWith('INVITE_')) {
    const u = await supabase.findUserByInviteCode(id);
    if (u) return ((u.firstName || '') + (u.lastName ? ' ' + u.lastName : '')).trim() || id;
    return id;
  }
  const u = await User.getByChatId(id);
  return u ? ((u.firstName || '') + (u.lastName ? ' ' + u.lastName : '')).trim() || id : id;
}

/** Прізвище ім'я (для списку зайнятих); якщо немає окремо прізвища — як у getStudentDisplayName. */
async function getStudentSurnameFirstName(studentId) {
  if (!studentId) return '';
  const id = String(studentId);
  if (id.startsWith('INVITE_')) {
    const u = await supabase.findUserByInviteCode(id);
    if (!u) return id;
    const ln = (u.lastName || '').trim();
    const fn = (u.firstName || '').trim();
    if (ln && fn) return ln + ' ' + fn;
    return ((fn + ' ' + ln).trim() || id);
  }
  const u = await User.getByChatId(id);
  if (!u) return id;
  const ln = (u.lastName || '').trim();
  const fn = (u.firstName || '').trim();
  if (ln && fn) return ln + ' ' + fn;
  return ((fn + ' ' + ln).trim() || id);
}

/** Вільні для запису учня слоти (AVAILABLE, без днів відпустки) */
async function getAvailableSlotsForStudent(coachId) {
  const slots = await supabase.getSlotsByCoachAndStatus(coachId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  const vacationKeys = await supabase.getCoachVacationDateKeys(coachId);
  const vacationSet = new Set(vacationKeys || []);
  return (slots || []).filter((s) => !vacationSet.has(getDateKey(s.date)));
}

/** Скидає контекст навігації тренера (після SCH_COMPLETE, після підтвердження/відхилення запиту тощо). */
async function clearCoachMarkTrainingReturnMode(chatId) {
  try {
    await State.update(chatId, { afterCompleteSlot: null, afterCoachConfirmDecline: null });
  } catch (e) {
    /* ignore */
  }
}

/** Кількості майбутніх слотів у вікні «Мій розклад» (21 день, як у showCoach7DaysView). */
async function getCoachSlotsCountsMyScheduleWindow(chatId) {
  const { startKey, endKey } = getCoachMyScheduleWindowStartEndKeys();
  const slots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const inRange = (slots || []).filter((s) => isSlotInDateRange(s, startKey, endKey) && isSlotInFuture(s));
  return {
    booked: inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED).length,
    available: inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE).length,
    reserved: inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED).length,
    requested: inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED).length
  };
}

function isSlotInFuture(slot) {
  try {
    if (!slot || slot.date == null) return false;
    const d = slot.date instanceof Date ? slot.date : new Date(slot.date);
    if (isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    const [h, min] = (slot.time || '0:0').toString().split(':').map((x) => parseInt(x, 10) || 0);
    const slotMoment = new Date(y, mo, day, h, min, 0, 0);
    return !isNaN(slotMoment.getTime()) && slotMoment.getTime() > Date.now();
  } catch (e) {
    return false;
  }
}

async function showCoachScheduleMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await clearCoachMarkTrainingReturnMode(chatId);
  const keyboard = [
    [{ text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SLOTS }],
    [{ text: '✔️ Відмітити тренування', callback_data: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING }],
    [{ text: '📆 Створити слоти', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_SLOTS }],
    [{ text: '📆 Додати слоти на день', callback_data: CONSTANTS.CALLBACKS.SCH_ADD_SLOTS_FOR_DAY }],
    [{ text: '🍔 Створити перерву', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_RESERVE }],
    [{ text: '🏖 Створити відпустку', callback_data: CONSTANTS.CALLBACKS.SCH_VACATION }],
    [{ text: '⚙️ Налаштування', callback_data: CONSTANTS.CALLBACKS.SCH_CREATE_TEMPLATE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  const createHint = '💡 **Як створити слоти:** натисни «Створити слоти» → введи кількість днів (наприклад 7) → слоти створюються автоматично за робочим часом з «Налаштування». Можна також «Додати слоти на день» для одного обраного дня.';
  await Helpers.sendKeyboard(chatId, '📅 Розклад\n\n' + createHint + '\n\nОбери дію:', keyboard, { parse_mode: 'Markdown' });
}

// ——— Відпустка тренера: цілий день недоступний для учнів ———
async function showVacationMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const vacationKeys = await supabase.getCoachVacationDateKeys(chatId);
  const sorted = (vacationKeys || []).filter(Boolean).sort();
  let text = '🏖 Відпустка\n\nДні, коли учні не бачать твої слоти (цей день недоступний для запису).\n\n';
  if (sorted.length === 0) {
    text += 'Немає днів відпустки. Натисни «Додати день» і обери дату (лише день без записів).';
  } else {
    text += 'Твої дні відпустки:\n';
    for (const k of sorted) {
      const d = new Date(k);
      text += '• ' + d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + '\n';
    }
  }
  const keyboard = [[{ text: '➕ Додати день', callback_data: CONSTANTS.CALLBACKS.SCH_VACATION_ADD }]];
  for (const dateKey of sorted.slice(0, 10)) {
    keyboard.push([{ text: '❌ Зняти ' + new Date(dateKey).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }), callback_data: CONSTANTS.CALLBACKS.SCH_VACATION_REMOVE + ':' + dateKey }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showVacationCalendar(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = getDateKey(today);
  const vacationKeys = await supabase.getCoachVacationDateKeys(chatId);
  const vacationSet = new Set(vacationKeys || []);
  const keyboard = [];
  const DAYS_IN_WEEK = 7;
  const ROWS = 4;
  for (let row = 0; row < ROWS; row++) {
    const rowButtons = [];
    for (let col = 0; col < DAYS_IN_WEEK; col++) {
      const dayOffset = row * DAYS_IN_WEEK + col;
      const d = new Date(today);
      d.setDate(d.getDate() + dayOffset);
      const key = getDateKey(d);
      const isVacation = vacationSet.has(key);
      const dayOfWeek = d.getDay();
      const isSunday = dayOfWeek === 0;
      const isToday = key === todayKey;
      let emoji = '';
      if (isToday) emoji = '🟢 ';
      else if (isSunday) emoji = '🟡 ';
      else if (isVacation) emoji = '🏖 ';
      const dateLabel = formatDateShortWithWeekday(d);
      const label = emoji + dateLabel;
      rowButtons.push({
        text: label.length > 64 ? dateLabel : label,
        callback_data: CONSTANTS.CALLBACKS.SCH_VACATION_DAY + ':' + key
      });
    }
    keyboard.push(rowButtons);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.SCH_VACATION }]);
  await Helpers.sendKeyboard(chatId, '🏖 Обери день відпустки (тільки день без записів):', keyboard);
}

async function addVacationDay(chatId, dateKey) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const occupied = await supabase.getCoachOccupiedSlotsOnDate(chatId, dateKey);
  if (occupied.length > 0) {
    await Helpers.safeSend(chatId, '❌ На цей день є записі (підтверджені або очікують). Спочатку скасуй або перенеси їх.');
    await showVacationCalendar(chatId);
    return;
  }
  const ok = await supabase.addCoachVacationDay(chatId, dateKey);
  if (ok) {
    const d = new Date(dateKey);
    await Helpers.safeSend(chatId, '✅ День відпустки додано: ' + d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }));
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти.');
  }
  await showVacationMenu(chatId);
}

async function removeVacationDay(chatId, dateKey) {
  const ok = await supabase.removeCoachVacationDay(chatId, dateKey);
  if (ok) {
    await Helpers.safeSend(chatId, '✅ День відпустки знято.');
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зняти.');
  }
  await showVacationMenu(chatId);
}

async function showCoachMyScheduleMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await clearCoachMarkTrainingReturnMode(chatId);
  const c = await getCoachSlotsCountsMyScheduleWindow(chatId);
  const keyboard = [
    [{ text: '📆 Календар (21 день)', callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR }],
    [{ text: 'Зайняті слоти (' + c.booked + ')', callback_data: CONSTANTS.CALLBACKS.SCH_7_BOOKED }],
    [{ text: 'Вільні слоти (' + c.available + ')', callback_data: CONSTANTS.CALLBACKS.SCH_7_AVAILABLE }],
    [{ text: 'Мої перерви (' + c.reserved + ')', callback_data: CONSTANTS.CALLBACKS.SCH_7_RESERVED }],
    [{ text: 'Чекають підтвердження (' + c.requested + ')', callback_data: CONSTANTS.CALLBACKS.SCH_7_REQUESTED }],
    [{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '📅 Мій розклад\n\nЧисла в дужках — кількість майбутніх слотів на **21 день** від сьогодні (включно).\n\nОбери перегляд:',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showCoach7DaysView(chatId, filter, page) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    await clearCoachMarkTrainingReturnMode(chatId);
    const { startKey, endKey } = getCoachMyScheduleWindowStartEndKeys();

    const slots = await supabase.getSlotsByCoachAndStatus(chatId, null);
    const inRange = (slots || []).filter((s) => isSlotInDateRange(s, startKey, endKey) && isSlotInFuture(s));
    const requested = inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED);
    const booked = inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED);
    const available = inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
    const reserved = inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED);

    let filtered = inRange;
    let filterLabel = 'всі слоти';
    if (filter === 'requested') {
      filtered = requested;
      filterLabel = 'чекають підтвердження';
    } else if (filter === 'booked') {
      filtered = booked;
      filterLabel = 'зайняті слоти';
    } else if (filter === 'available') {
      filtered = available;
      filterLabel = 'вільні слоти';
    } else if (filter === 'reserved') {
      filtered = reserved;
      filterLabel = 'мої перерви';
    }

    if (filter === 'requested') {
      await State.update(chatId, { afterCoachConfirmDecline: 'requested' });
    }

    let maxBookedPerDay = 0;
    if (filter === 'booked' && booked.length) {
      const countsByDay = {};
      for (const s of booked) {
        const k = getDateKey(s.date);
        const n = (countsByDay[k] || 0) + 1;
        countsByDay[k] = n;
        if (n > maxBookedPerDay) maxBookedPerDay = n;
      }
    }

    const showHint = filter !== 'booked' && filter !== 'reserved';
    const viewHint = '✅ — підтвердити запис | ❌ — відхилити/скасувати | 🍔 — перерва (учні не бачать) | 🔄 — перенести. Вільний слот: можна записати учня або зробити перерву.';
    let text = '📅 Мій розклад — ' + filterLabel;
    if (filter === 'booked') {
      text +=
        '\n\n📊 Максимум зайнятих слотів на один день: ' +
        maxBookedPerDay +
        '\n\n💡 Щоб відмітити тренування як виконане: «Розклад» → «Відмітити тренування».';
    }
    text += (showHint ? '\n\n' + viewHint : '') + '\n\n';
    if (requested.length && (filter === 'all' || filter === 'requested')) {
      text += '⏳ Запити на підтвердження:\n';
      for (const s of requested) {
        const name = await getStudentDisplayName(s.studentId);
        text += '• ' + formatSlotDateTime(s) + ' — ' + name + '\n';
      }
      if (filter === 'all') text += '\n';
    }
    if (booked.length && (filter === 'all' || filter === 'booked')) {
      if (filter === 'booked') {
        text += '✅ Підтверджені:\n\n';
        const sortedBooked = [...booked].sort((a, b) => {
          const ta = getDateKey(a.date) + String(a.time || '');
          const tb = getDateKey(b.date) + String(b.time || '');
          return ta.localeCompare(tb);
        });
        let prevDateKey = '';
        for (const s of sortedBooked) {
          const dk = getDateKey(s.date);
          if (dk !== prevDateKey) {
            if (prevDateKey) text += '\n';
            const d0 = s.date instanceof Date ? s.date : new Date(s.date);
            const w = WEEKDAY_LONG_UA[d0.getDay()] || '';
            text += (w || 'День') + ':\n';
            prevDateKey = dk;
          }
          const name = await getStudentSurnameFirstName(s.studentId);
          text += formatSlotDayMonthTimeNoWeekday(s) + ' ' + name + '\n';
        }
        text += '\n';
      } else {
        text += '✅ Підтверджені:\n';
        for (const s of booked) {
          const name = await getStudentDisplayName(s.studentId);
          text += '• ' + formatSlotDateTime(s) + ' — ' + name + '\n';
        }
        if (filter === 'all') text += '\n';
      }
    }
    if (available.length && (filter === 'all' || filter === 'available')) {
      text += '🕐 Вільні вікна:\n';
      for (const s of available) text += '• ' + formatSlotDateTime(s) + ' — Вільний\n';
    }
    if (reserved.length && (filter === 'all' || filter === 'reserved')) {
      text += '🍔 Перерви:\n';
      for (const s of reserved) text += '• ' + formatSlotDateTime(s) + ' — перерва\n';
    }
    if (filtered.length === 0) {
      text += 'Немає слотів у цьому перегляді на найближчі 21 день. Створи слоти в меню «Розклад».';
    }

    const keyboard = [];
    const fromIdx = page * MAX_SLOT_BUTTONS_PER_PAGE;
    const pageSlots = filtered.slice(fromIdx, fromIdx + MAX_SLOT_BUTTONS_PER_PAGE);
    for (const s of pageSlots) {
      if (s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
        keyboard.push([
          { text: '✅ ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + s.id },
          { text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + s.id }
        ]);
      } else if (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED) {
        if (filter === 'booked') {
          /* Відмітити виконання — лише в «Розклад» → «Відмітити тренування». */
        } else {
          keyboard.push([
            { text: '✔️ ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + s.id },
            { text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_CANCEL_REQ + ':' + s.id },
            { text: '🔄 Перенести', callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE_REQ + ':' + s.id }
          ]);
        }
      } else if (s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED) {
        keyboard.push([
          { text: '🍔 ' + formatSlotDateTime(s) + ' (перерва)', callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id },
          { text: 'Відкрити слот', callback_data: CONSTANTS.CALLBACKS.SCH_SLOT_UNRESERVE + ':' + s.id }
        ]);
      } else {
        const btnText = '👤 ' + formatSlotDateTime(s) + ' (Вільний)';
        keyboard.push([{ text: btnText.length > 64 ? '👤 ' + formatSlotDateTime(s) : btnText, callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id }]);
      }
    }
    const totalPages = Math.ceil(filtered.length / MAX_SLOT_BUTTONS_PER_PAGE);
    if (totalPages > 1) {
      const nav = [];
      if (page > 0) nav.push({ text: '◀ Назад', callback_data: CONSTANTS.CALLBACKS.SCH_7_VIEW + ':' + filter + ':' + (page - 1) });
      if (page < totalPages - 1) nav.push({ text: 'Далі ▶', callback_data: CONSTANTS.CALLBACKS.SCH_7_VIEW + ':' + filter + ':' + (page + 1) });
      if (nav.length) keyboard.push(nav);
    }
    if (totalPages > 1) {
      text += '\n(Сторінка ' + (page + 1) + ' з ' + totalPages + ')\n';
    }
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SLOTS }]);
    await Helpers.sendKeyboard(chatId, text, keyboard);
  } catch (err) {
    console.error('Schedule.showCoach7DaysView', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити розклад.');
    await showCoachMyScheduleMenu(chatId);
  }
}

/** Підтверджені записи у вікні «Мій розклад» (21 день) — лише кнопки ✔️ (відмітити як виконане). */
async function showCoachMarkTrainingView(chatId, page) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    await State.update(chatId, { afterCompleteSlot: 'mark_training' });

    const { startKey, endKey } = getCoachMyScheduleWindowStartEndKeys();

    const slots = await supabase.getSlotsByCoachAndStatus(chatId, null);
    const inRange = (slots || []).filter((s) => isSlotInDateRange(s, startKey, endKey) && isSlotInFuture(s));
    const booked = inRange.filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED);

    let maxBookedPerDay = 0;
    if (booked.length) {
      const countsByDay = {};
      for (const s of booked) {
        const k = getDateKey(s.date);
        const n = (countsByDay[k] || 0) + 1;
        countsByDay[k] = n;
        if (n > maxBookedPerDay) maxBookedPerDay = n;
      }
    }

    let text =
      '✔️ **Відмітити тренування**\n\n' +
      'Підтверджені записи на **21 день** від сьогодні (майбутні). Натисни ✔️ біля часу, щоб відмітити тренування як **виконане**.\n\n' +
      '📊 Максимум зайнятих слотів на один день: ' +
      maxBookedPerDay +
      '\n\n';

    if (booked.length === 0) {
      text += 'Немає підтверджених записів на найближчі 21 день.';
    } else {
      text += '✅ Підтверджені:\n';
      for (const s of booked) {
        const name = await getStudentDisplayName(s.studentId);
        text += '• ' + formatSlotDateTime(s) + ' — ' + name + '\n';
      }
    }

    const keyboard = [];
    const fromIdx = page * MAX_SLOT_BUTTONS_PER_PAGE;
    const pageSlots = booked.slice(fromIdx, fromIdx + MAX_SLOT_BUTTONS_PER_PAGE);
    for (const s of pageSlots) {
      keyboard.push([{ text: '✔️ ' + formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + s.id }]);
    }
    const totalPages = Math.ceil(booked.length / MAX_SLOT_BUTTONS_PER_PAGE) || 1;
    if (totalPages > 1) {
      const nav = [];
      if (page > 0) nav.push({ text: '◀ Назад', callback_data: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING + ':' + (page - 1) });
      if (page < totalPages - 1) nav.push({ text: 'Далі ▶', callback_data: CONSTANTS.CALLBACKS.SCH_MARK_TRAINING + ':' + (page + 1) });
      if (nav.length) keyboard.push(nav);
    }
    if (totalPages > 1) {
      text += '\n(Сторінка ' + (page + 1) + ' з ' + totalPages + ')\n';
    }
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]);
    await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Schedule.showCoachMarkTrainingView', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити список.');
    await showCoachScheduleMenu(chatId);
  }
}

async function showCoachCalendar(chatId) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    await clearCoachMarkTrainingReturnMode(chatId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getDateKey(today);

    const [slots, settings, vacationKeys] = await Promise.all([
      supabase.getSlotsByCoachAndStatus(chatId, null),
      supabase.getCoachScheduleSettings(chatId),
      supabase.getCoachVacationDateKeys(chatId)
    ]);
    const restDays = (settings && settings.restDays) || [];
    const vacationSet = new Set(vacationKeys || []);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 20);
    const endKey = getDateKey(endDate);
    const inRange = (slots || []).filter((s) => isSlotInDateRange(s, todayKey, endKey) && isSlotInFuture(s));

    const occupiedByDate = {};
    const totalByDate = {};
    for (const s of inRange) {
      const k = getDateKey(s.date);
      totalByDate[k] = (totalByDate[k] || 0) + 1;
      if (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
        occupiedByDate[k] = (occupiedByDate[k] || 0) + 1;
      }
    }

    /** 21 день: сітка 7 рядків (вниз) × 3 стовпці (вправо) — «квадратики». */
    const CAL_COLS = 3;
    const CAL_ROWS = 7;
    const keyboard = [];
    for (let row = 0; row < CAL_ROWS; row++) {
      const rowButtons = [];
      for (let col = 0; col < CAL_COLS; col++) {
        const dayOffset = col * CAL_ROWS + row;
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const key = getDateKey(d);
        const total = totalByDate[key] || 0;
        const occupied = occupiedByDate[key] || 0;
        const dow = getDayOfWeekUA(d);
        const isRestDay = restDays.indexOf(dow) >= 0;
        const isVacation = vacationSet.has(key);
        const isSunday = d.getDay() === 0;
        const isToday = key === todayKey;
        let emoji = '';
        if (isToday) emoji = '🟢 ';
        else if (isSunday || isVacation || isRestDay) emoji = '🟡 ';
        else if (total === 0) emoji = '⬜ ';
        const dateLabel = formatDateShortWithWeekday(d);
        const label = emoji + dateLabel + ' (' + occupied + ')';
        rowButtons.push({
          text: label.length > 64 ? dateLabel + ' (' + occupied + ')' : label,
          callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR_DAY + ':' + key
        });
      }
      keyboard.push(rowButtons);
    }
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SLOTS }]);
    const hint = '**Кольори кнопок:**\n🟢 — сьогодні\n🟡 — неділя або відпустка\n⬜ — немає слотів (створи в «Створити слоти»)\n\nЧисло в дужках — кількість зайнятих слотів на день. Натисни на дату — відкриються слоти та дії (підтвердити, зробити перерву, перенести).';
    await Helpers.sendKeyboard(chatId, '📆 Календар — 21 день від сьогодні\n\n' + hint + '\n\nОбері дату:', keyboard, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Schedule.showCoachCalendar', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити календар.');
    await showCoachMyScheduleMenu(chatId);
  }
}

async function showCoachDaySlots(chatId, dateKey, page) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    await clearCoachMarkTrainingReturnMode(chatId);
    const slots = await supabase.getSlotsByCoachAndStatus(chatId, null);
    const daySlots = (slots || []).filter((s) => isSlotOnDate(s, dateKey) && isSlotInFuture(s)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const d = new Date(dateKey);
    const dateLabel = d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    const dateLabelShort = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleDateString('uk-UA', { weekday: 'long' });
    const requested = (daySlots || []).filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED);
    const booked = (daySlots || []).filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED);
    const available = (daySlots || []).filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
    const reserved = (daySlots || []).filter((s) => s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED);

    const dayHint = 'Дії: ✅ підтвердити запис | ❌ відхилити/скасувати | 🍔 перерва або відкрити слот | 🔄 перенести.';
    let text = '📅 Слоти на ' + dateLabelShort + '\n\n' + dayHint + '\n\n';
    if (daySlots.length === 0) {
      text += 'Немає слотів на цей день.';
    } else {
      const fmt = (s) => formatSlotDateTime(s, { noYear: true });
      text += '✔️ **Заняті:**\n';
      if (booked.length) {
        for (const s of booked) {
          const name = await getStudentDisplayName(s.studentId);
          text += '• ' + fmt(s) + ' — ' + name + '\n';
        }
      } else text += '—\n';
      text += '\n🍔 **Перерви:**\n';
      if (reserved.length) {
        for (const s of reserved) text += '• ' + fmt(s) + '\n';
      } else text += '—\n';
      text += '\n⏳ **На підтвердженні:**\n';
      if (requested.length) {
        for (const s of requested) {
          const name = await getStudentDisplayName(s.studentId);
          text += '• ' + fmt(s) + ' — ' + name + '\n';
        }
      } else text += '—\n';
      text += '\n🕐 **Вільні:**\n';
      if (available.length) {
        for (const s of available) text += '• ' + fmt(s) + '\n';
      } else text += '—\n';
    }

    const keyboard = [];
    const fromIdx = page * SLOTS_PER_DAY_PAGE;
    const pageSlots = daySlots.slice(fromIdx, fromIdx + SLOTS_PER_DAY_PAGE);
    for (const s of pageSlots) {
      const fmt = (sl) => formatSlotDateTime(sl, { noYear: true });
      if (s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
        keyboard.push([
          { text: '✅ ' + fmt(s), callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + s.id },
          { text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + s.id }
        ]);
      } else if (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED) {
        keyboard.push([
          { text: '✔️ ' + fmt(s), callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + s.id },
          { text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_CANCEL_REQ + ':' + s.id },
          { text: '🔄 Перенести', callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE_REQ + ':' + s.id }
        ]);
      } else if (s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
        const btnText = '👤 ' + fmt(s) + ' (Вільний)';
        keyboard.push([
          { text: btnText.length > 64 ? '👤 ' + fmt(s) : btnText, callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id },
          { text: '🍔 Хочу перерву', callback_data: CONSTANTS.CALLBACKS.SCH_SLOT_RESERVE + ':' + s.id }
        ]);
      } else if (s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED) {
        keyboard.push([
          { text: '🍔 ' + fmt(s) + ' (перерва)', callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id },
          { text: 'Відкрити слот', callback_data: CONSTANTS.CALLBACKS.SCH_SLOT_UNRESERVE + ':' + s.id }
        ]);
      } else {
        const btnText = '👤 ' + fmt(s) + ' (Вільний)';
        keyboard.push([{ text: btnText.length > 64 ? '👤 ' + fmt(s) : btnText, callback_data: CONSTANTS.CALLBACKS.SCH_C_REQ + ':' + s.id }]);
      }
    }
    const totalPages = Math.ceil(daySlots.length / SLOTS_PER_DAY_PAGE);
    if (totalPages > 1) {
      const nav = [];
      if (page > 0) nav.push({ text: '◀ Назад', callback_data: CONSTANTS.CALLBACKS.SCH_DAY_VIEW + ':' + dateKey + ':' + (page - 1) });
      if (page < totalPages - 1) nav.push({ text: 'Далі ▶', callback_data: CONSTANTS.CALLBACKS.SCH_DAY_VIEW + ':' + dateKey + ':' + (page + 1) });
      if (nav.length) keyboard.push(nav);
    }
    keyboard.push(
      [{ text: CONSTANTS.EMOJI.BACK + ' До календаря', callback_data: CONSTANTS.CALLBACKS.SCH_CALENDAR }],
      [{ text: 'До Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SLOTS }]
    );
    await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Schedule.showCoachDaySlots', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити слоти.');
    await showCoachCalendar(chatId);
  }
}

async function setSlotReserve(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await Helpers.safeSend(chatId, '❌ Можна позначити резервом лише вільний слот.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  const ok = await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.RESERVED);
  if (ok) {
    await Helpers.safeSend(chatId, '🍔 ' + formatSlotDateTime(slot) + ' — позначено як перерва. Учні цей слот не бачать.');
    // Коротка пауза щоб тренер встиг прочитати підтвердження
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const dateKey = getDateKey(slot.date);
  await showCoachDaySlots(chatId, dateKey, 0);
}

async function setSlotUnreserve(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.RESERVED) {
    await Helpers.safeSend(chatId, '❌ Цей слот не в резерві.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  const ok = await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  if (ok) {
    await Helpers.safeSend(chatId, '✅ Слот знову вільний для запису учнів.');
  }
  const dateKey = getDateKey(slot.date);
  await showCoachDaySlots(chatId, dateKey, 0);
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
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE && slot.status !== CONSTANTS.SCHEDULE_STATUS.RESERVED) {
    await Helpers.safeSend(chatId, '❌ Цей слот вже зайнятий.');
    await State.clear(chatId);
    await showCoachScheduleMenu(chatId);
    return;
  }
  const coach = await User.getByChatId(chatId);
  const coachName = coach ? ((coach.firstName || '') + (coach.lastName ? ' ' + coach.lastName : '')).trim() || 'Тренер' : 'Тренер';
  const student = await User.getByChatId(studentChatId);
  const dateTimeStr = formatSlotDateTime(slot);
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  await supabase.updateScheduleSlotStudentId(slotId, String(studentChatId));
  const isInviteStudent = String(studentChatId).indexOf('INVITE_') === 0;
  if (isInviteStudent) {
    await Helpers.safeSend(chatId, '⏳ Запис збережено. Учень ще **не активував код** — повідомлення з кнопками «Підтвердити»/«Відхилити» прийде йому в бот після того, як він введе код у боті (У мене є код). Передай учню код і попроси активувати.');
    await showBookStudentCalendar(chatId, studentChatId);
    return;
  }
  const kbd = [
    [{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.SCH_SC_CONF + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_SC_DECL + ':' + slotId }]
  ];
  const studentMsg = '👋 Твій тренер ' + coachName + ' хоче записати тебе на тренування:\n🗓 ' + dateTimeStr;
  const sentToStudent = await Helpers.sendKeyboard(studentChatId, studentMsg, kbd);
  if (sentToStudent) {
    await Helpers.safeSend(chatId, '⏳ Запит на запис надіслано учню. Очікуй підтвердження.');
    const Menu = require('./menu');
    await Menu.show(studentChatId);
  } else {
    console.error('Schedule.coachBookStudentToSlot: send to student failed (chatId=' + studentChatId + ')');
    await Helpers.safeSend(chatId, '⏳ Запис збережено, але не вдалося надіслати повідомлення учню (учень має спочатку написати боту /start). Попроси учня відкрити бота і підтвердити запис у «Мій розклад».');
  }
  await showBookStudentCalendar(chatId, studentChatId);
}

async function studentConfirmsCoachBooking(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
    await Helpers.safeSend(chatId, '❌ Цей запит вже оброблено.');
    await showStudentMySchedule(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '✅ Запис підтверджено! Тренування: ' + dateTimeStr);
  const student = await User.getByChatId(chatId);
  await Helpers.safeSend(slot.coachId, '✅ Учень ' + (student ? student.firstName : chatId) + ' підтвердив запис на ' + dateTimeStr);
  await showStudentMySchedule(chatId);
}

async function studentDeclinesCoachBooking(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
    await Helpers.safeSend(chatId, '❌ Цей запит вже оброблено.');
    await showStudentMySchedule(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(slotId, null);
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(chatId, '❌ Запис відхилено.');
  const student = await User.getByChatId(chatId);
  await Helpers.safeSend(slot.coachId, '❌ Учень ' + (student ? student.firstName : chatId) + ' відхилив запис на ' + dateTimeStr);
  await showStudentMySchedule(chatId);
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
  const ctx = await State.get(chatId);
  if (ctx && ctx.afterCoachConfirmDecline === 'requested') {
    await showCoach7DaysView(chatId, 'requested', 0);
    return;
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
  const ctx = await State.get(chatId);
  if (ctx && ctx.afterCoachConfirmDecline === 'requested') {
    await showCoach7DaysView(chatId, 'requested', 0);
    return;
  }
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
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(slotId, null);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив скасування тренування ' + dateTimeStr + '.');
  }
  await Helpers.safeSend(chatId, '✅ Скасування підтверджено.');
  await showCoachMyScheduleMenu(chatId);
}

async function coachDeclinesStudentCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '❌ Тренер відхилив скасування. Запис залишається в силі: ' + dateTimeStr + '.');
  }
  await Helpers.safeSend(chatId, '❌ Скасування відхилено.');
  await showCoachMyScheduleMenu(chatId);
}

// ——— Учень просить перенести: календар → дата → вільні слоти на дату ———
async function studentRequestsReschedule(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const coachId = slot.coachId;
  const available = await getAvailableSlotsForStudent(coachId);
  const future = (available || []).filter((s) => isSlotInFuture(s) && String(s.id) !== String(slotId));
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів для переносу. Запитай тренера.');
    await showStudentMySchedule(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_S_RESCHEDULE_PICK, rescheduleOldSlotId: slotId });
  await showStudentRescheduleCalendar(chatId);
}

async function showStudentRescheduleCalendar(chatId) {
  try {
    const state = await State.get(chatId);
    const oldSlotId = state?.rescheduleOldSlotId;
    if (!oldSlotId) {
      await State.clear(chatId);
      await showStudentMySchedule(chatId);
      return;
    }
    const slot = await supabase.getSlotById(oldSlotId);
    if (!slot || String(slot.studentId) !== String(chatId)) {
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
      await showStudentMySchedule(chatId);
      return;
    }
    const coachId = slot.coachId;
    const available = await getAvailableSlotsForStudent(coachId);
    const future = (available || []).filter((s) => isSlotInFuture(s) && String(s.id) !== String(oldSlotId));
    const availableByDate = buildAvailableSlotsByDate(future);
    const { pending: myPendingDates, confirmed: myConfirmedDates } = await buildStudentBookingCalendarSets(chatId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getDateKey(today);

    const keyboard = [];
    /** 7 рядків (1–7 день «сітки» вниз) × 3 стовпці (тижні): 1|8|15, 2|9|16, … */
    const CAL_ROWS = 7;
    const CAL_COLS = 3;
    for (let row = 0; row < CAL_ROWS; row++) {
      const rowButtons = [];
      for (let col = 0; col < CAL_COLS; col++) {
        const dayOffset = row + col * CAL_ROWS;
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const key = getDateKey(d);
        const count = availableByDate[key] || 0;
        const dayOfWeek = d.getDay();
        const isSunday = dayOfWeek === 0;
        const isToday = key === todayKey;
        const emoji = studentBookCalendarEmoji(
          myPendingDates.has(key),
          myConfirmedDates.has(key),
          isToday,
          isSunday,
          count
        );
        const dateLabel = formatDateShortWithWeekday(d);
        const label = emoji + dateLabel + (count ? ' (' + count + ')' : '');
        rowButtons.push({
          text: trimStudentCalendarButtonText(label),
          callback_data: CONSTANTS.CALLBACKS.SCH_S_RES_DAY + ':' + key
        });
      }
      keyboard.push(rowButtons);
    }
    keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_S_RES_CANCEL }]);
    const msg =
      '🔄 Перенести тренування (було: ' +
      Helpers.escapeHtml(formatSlotDateTime(slot)) +
      ')\n\n' +
      '<b>Легенда:</b>\n' +
      '🟢 — сьогодні\n' +
      '🔴 — неділя\n' +
      '🟡 — запис очікує підтвердження тренера\n' +
      '🔵 — запис підтверджено\n' +
      '⬜ — немає вільних слотів\n\n' +
      '📆 Обері дату:';
    await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Schedule.showStudentRescheduleCalendar', err.message);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити календар.');
    await showStudentMySchedule(chatId);
  }
}

async function showStudentRescheduleDaySlots(chatId, dateKey) {
  try {
    const state = await State.get(chatId);
    const oldSlotId = state?.rescheduleOldSlotId;
    if (!oldSlotId) {
      await State.clear(chatId);
      await showStudentMySchedule(chatId);
      return;
    }
    const slot = await supabase.getSlotById(oldSlotId);
    if (!slot || String(slot.studentId) !== String(chatId)) {
      await State.clear(chatId);
      await showStudentMySchedule(chatId);
      return;
    }
    const coachId = slot.coachId;
    const available = await getAvailableSlotsForStudent(coachId);
    const daySlots = (available || [])
      .filter((s) => isSlotOnDate(s, dateKey) && isSlotInFuture(s) && String(s.id) !== String(oldSlotId))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (daySlots.length === 0) {
      await Helpers.safeSend(chatId, '📅 На цю дату немає вільних слотів. Обері іншу дату.');
      await showStudentRescheduleCalendar(chatId);
      return;
    }
    const d = new Date(dateKey);
    const dateLabel = d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    const toShow = daySlots.slice(0, MAX_AVAILABLE_SLOT_BUTTONS);
    const keyboard = toShow.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE_PICK + ':' + s.id }]);
    keyboard.push([{ text: '🔙 До календаря', callback_data: CONSTANTS.CALLBACKS.SCH_S_RES_CALENDAR }]);
    await Helpers.sendKeyboard(chatId, '📅 Вільні слоти на ' + dateLabel + '\n\nОбери час:', keyboard);
  } catch (err) {
    console.error('Schedule.showStudentRescheduleDaySlots', err.message);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження слотів.');
    await showStudentMySchedule(chatId);
  }
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
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний. Можливо, хтось вже зайняв цей час.');
    await showStudentMyScheduleEdit(chatId);
    return;
  }
  // Беремо coachId з профілю учня (надійніше, ніж зі слота — слот може зберігати старий ID)
  const student = await User.getByChatId(chatId);
  const coachChatId = (student && student.coachId && String(student.coachId).trim())
    ? String(student.coachId).trim()
    : (oldSlot.coachId ? String(oldSlot.coachId).trim() : null);

  console.log('Schedule.studentPicksRescheduleSlot: coachChatId=' + coachChatId + ' (from student.coachId=' + (student && student.coachId) + ', slot.coachId=' + oldSlot.coachId + ')');

  if (!coachChatId) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Помилка: тренера не визначено. Звернись до підтримки.');
    await showStudentMySchedule(chatId);
    return;
  }

  // Зберігаємо запит у БД: резервуємо новий слот за учнем (REQUESTED) — запит не загубиться, навіть якщо сповіщення не дійде
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  await supabase.updateScheduleSlotStudentId(newSlotId, String(chatId));
  await supabase.updateScheduleSlotRescheduleFrom(newSlotId, null);

  await State.clear(chatId);
  await Helpers.safeSend(chatId, '⏳ Запит на перенос надіслано тренеру. Очікуй підтвердження.');

  // Сповіщення тренеру
  const studentName = student ? ((student.firstName || '') + (student.lastName ? ' ' + student.lastName : '')).trim() : String(chatId);
  // Короткі константи — щоб не перевищити ліміт Telegram 64 байти на callback_data
  const kbd = [
    [{ text: '✅ Підтвердити перенос', callback_data: CONSTANTS.CALLBACKS.SCH_CR_OK + ':' + newSlotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_CR_NO + ':' + newSlotId }]
  ];
  const coachMsg = '⏳ Запит учня на перенос\n\n' + studentName + ' просить перенести тренування з ' + formatSlotDateTime(oldSlot) + ' на ' + formatSlotDateTime(newSlot) + '.';
  try {
    const sent = await Helpers.sendKeyboard(coachChatId, coachMsg, kbd);
    if (!sent) {
      console.error('Schedule.studentPicksRescheduleSlot: coach notify returned null, coachChatId=' + coachChatId);
    } else {
      console.log('Schedule.studentPicksRescheduleSlot: coach notified ok');
    }
  } catch (err) {
    console.error('Schedule.studentPicksRescheduleSlot: coach notify exception', err.message);
  }

  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

async function coachConfirmsReschedule(chatId, oldSlotId, newSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  // Новий слот може бути REQUESTED (збережений запит) або AVAILABLE (старий флоу)
  const newSlotOk = newSlot && (newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED || newSlot.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  if (!oldSlot || !newSlot || String(oldSlot.coachId) !== String(chatId) || String(newSlot.coachId) !== String(chatId) || !newSlotOk) {
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const studentId = oldSlot.studentId || newSlot.studentId;
  await supabase.updateScheduleSlotStatus(oldSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(oldSlotId, null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotStudentId(newSlotId, String(studentId));
  const newStr = formatSlotDateTime(newSlot);
  if (studentId) {
    await Helpers.safeSend(String(studentId), '✅ Тренер підтвердив перенос тренування на ' + newStr + '.');
  }
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено.');
  await showCoachMyScheduleMenu(chatId);
}

async function coachDeclinesReschedule(chatId, oldSlotId, newSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  if (!oldSlot || String(oldSlot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  // Повертаємо новий слот у AVAILABLE і знімаємо учня з нього (якщо був збережений запит)
  if (newSlotId) {
    const newSlot = await supabase.getSlotById(newSlotId);
    if (newSlot && String(newSlot.coachId) === String(chatId) && newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
      await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
      await supabase.updateScheduleSlotStudentId(newSlotId, null);
    }
  }
  const dateTimeStr = formatSlotDateTime(oldSlot);
  if (oldSlot.studentId) {
    await Helpers.safeSend(String(oldSlot.studentId), '❌ Тренер відхилив перенос тренування ' + dateTimeStr + '. Запис залишається в силі.');
  }
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  await showCoachMyScheduleMenu(chatId);
}

// ——— Тренер просить скасування → учень підтверджує/відхиляє ———
async function coachRequestsCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
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
  await Helpers.sendKeyboard(slot.studentId, '⏳ Запит тренера на скасування\n\n' + coachName + ' просить скасувати тренування ' + dateTimeStr + '.', kbd);
}

async function studentConfirmsCoachCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(slotId, null);
  await Helpers.safeSend(slot.coachId, '✅ Учень підтвердив скасування тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '✅ Дякую, скасування підтверджено.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

async function studentDeclinesCoachCancel(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(slot);
  await Helpers.safeSend(slot.coachId, '❌ Учень відхилив скасування тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '❌ Скасування відхилено.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

// ——— Тренер просить перенести → обирає новий слот → учень підтверджує/відхиляє ———
async function coachRequestsReschedule(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const bookable = (allSlots || []).filter(
    (s) => (s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED) && isSlotInFuture(s) && String(s.id) !== String(slotId)
  );
  if (bookable.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів для переносу. Додай вікно в розклад.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_COACH_RESCHEDULE_PICK, rescheduleSlotId: slotId });
  await showCoachRescheduleCalendar(chatId);
}

async function showCoachRescheduleCalendar(chatId) {
  try {
    const state = await State.get(chatId);
    const oldSlotId = state?.rescheduleSlotId;
    if (!oldSlotId) { await State.clear(chatId); await showCoachCalendar(chatId); return; }
    const oldSlot = await supabase.getSlotById(oldSlotId);
    if (!oldSlot || String(oldSlot.coachId) !== String(chatId)) {
      await State.clear(chatId); await showCoachCalendar(chatId); return;
    }
    const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
    const bookable = (allSlots || []).filter(
      (s) => (s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED) && isSlotInFuture(s) && String(s.id) !== String(oldSlotId)
    );
    const availableByDate = buildAvailableSlotsByDate(bookable);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getDateKey(today);
    const keyboard = [];
    const DAYS_IN_WEEK = 7;
    const COLS = 3;
    for (let col = 0; col < COLS; col++) {
      const rowButtons = [];
      for (let r = 0; r < DAYS_IN_WEEK; r++) {
        const dayOffset = col * DAYS_IN_WEEK + r;
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const key = getDateKey(d);
        const count = availableByDate[key] || 0;
        const isToday = key === todayKey;
        const isSunday = d.getDay() === 0;
        let emoji = '';
        if (isToday) emoji = '🟢 ';
        else if (isSunday) emoji = '🔴 ';
        else if (count === 0) emoji = '⬜ ';
        const dateLabel = formatDateShortWithWeekday(d);
        const label = emoji + dateLabel + (count ? ' (' + count + ')' : '');
        rowButtons.push({ text: label.length > 64 ? dateLabel : label, callback_data: CONSTANTS.CALLBACKS.SCH_C_RES_DAY + ':' + key });
      }
      keyboard.push(rowButtons);
    }
    keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_C_RES_CANCEL }]);
    await Helpers.sendKeyboard(chatId, '🔄 Перенести з ' + formatSlotDateTime(oldSlot) + '\n\nОбери нову дату:', keyboard);
  } catch (err) {
    console.error('Schedule.showCoachRescheduleCalendar', err.message);
    await State.clear(chatId);
    await showCoachCalendar(chatId);
  }
}

async function showCoachRescheduleDaySlots(chatId, dateKey) {
  try {
    const state = await State.get(chatId);
    const oldSlotId = state?.rescheduleSlotId;
    if (!oldSlotId) { await State.clear(chatId); await showCoachCalendar(chatId); return; }
    const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
    const daySlots = (allSlots || [])
      .filter((s) => isSlotOnDate(s, dateKey) && isSlotInFuture(s) && String(s.id) !== String(oldSlotId) && (s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (daySlots.length === 0) {
      await Helpers.safeSend(chatId, '📅 На цю дату немає вільних слотів. Обери іншу дату.');
      await showCoachRescheduleCalendar(chatId);
      return;
    }
    const d = new Date(dateKey);
    const dateLabel = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleDateString('uk-UA', { weekday: 'long' });
    const keyboard = daySlots.slice(0, MAX_AVAILABLE_SLOT_BUTTONS).map((s) => [{ text: formatSlotDateTime(s, { noYear: true }), callback_data: CONSTANTS.CALLBACKS.SCH_RESCHEDULE_PICK + ':' + s.id }]);
    keyboard.push([{ text: '🔙 До календаря', callback_data: CONSTANTS.CALLBACKS.SCH_C_RES_CAL }]);
    keyboard.push([{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACKS.SCH_C_RES_CANCEL }]);
    await Helpers.sendKeyboard(chatId, '🔄 Вільні слоти на ' + dateLabel + '\n\nОбери час:', keyboard);
  } catch (err) {
    console.error('Schedule.showCoachRescheduleDaySlots', err.message);
    await State.clear(chatId);
    await showCoachCalendar(chatId);
  }
}

async function coachPicksRescheduleSlot(chatId, newSlotId) {
  const state = await State.get(chatId);
  const oldSlotId = state?.rescheduleSlotId;
  if (!oldSlotId || !newSlotId) {
    await State.clear(chatId);
    await showCoachCalendar(chatId);
    return;
  }
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  const newSlotOk = newSlot && (newSlot.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || newSlot.status === CONSTANTS.SCHEDULE_STATUS.RESERVED);
  if (!oldSlot || !newSlot || String(oldSlot.coachId) !== String(chatId) || String(newSlot.coachId) !== String(chatId) || !newSlotOk) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    await showCoachCalendar(chatId);
    return;
  }
  const coach = await User.getByChatId(chatId);
  const coachName = coach ? (coach.firstName || '') + (coach.lastName ? ' ' + coach.lastName : '') : 'Тренер';
  const studentId = oldSlot.studentId;
  const prevNewSlotStatus = newSlot.status;
  if (studentId) {
    // Зберігаємо запит у БД (новий слот REQUESTED), щоб callback міг містити лише newSlotId (ліміт Telegram 64 байти)
    await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
    await supabase.updateScheduleSlotStudentId(newSlotId, String(studentId));
    // Який саме старий слот звільняти при підтвердженні (у учня може бути кілька BOOKED у того ж тренера)
    const linked = await supabase.updateScheduleSlotRescheduleFrom(newSlotId, oldSlotId);
    if (!linked) {
      console.error(
        'Schedule.coachPicksRescheduleSlot: updateScheduleSlotRescheduleFrom failed — виконайте supabase_migration_reschedule_from_slot.sql'
      );
      await supabase.updateScheduleSlotStatus(newSlotId, prevNewSlotStatus);
      await supabase.updateScheduleSlotStudentId(newSlotId, null);
      await Helpers.safeSend(
        chatId,
        '❌ Не вдалося зберегти перенос у базі. Виконайте SQL-міграцію `supabase_migration_reschedule_from_slot.sql` у Supabase, потім спробуйте знову.'
      );
      await State.clear(chatId);
      await showCoachCalendar(chatId);
      return;
    }
    await Helpers.safeSend(chatId, '⏳ Запит на перенос надіслано учню. Очікуй підтвердження.');
    const kbd = [
      [{ text: '✅ Підтвердити перенос', callback_data: CONSTANTS.CALLBACKS.SCH_SR_OK + ':' + newSlotId }],
      [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_SR_NO + ':' + newSlotId }]
    ];
    const msg =
      '⏳ Запит тренера на перенос\n\n' +
      coachName +
      ' просить перенести тренування з ' +
      formatSlotDateTime(oldSlot) +
      ' на ' +
      formatSlotDateTime(newSlot) +
      '.';
    try {
      const sent = await Helpers.sendKeyboard(studentId, msg, kbd);
      if (!sent) {
        console.error('Schedule.coachPicksRescheduleSlot: student notify returned null, studentId=' + studentId);
      } else {
        console.log('Schedule.coachPicksRescheduleSlot: student notified ok');
      }
    } catch (e) {
      console.error('Schedule.coachPicksRescheduleSlot notify student', e.message);
    }
  }
  await State.clear(chatId);
  await showCoachCalendar(chatId);
}

/** Підтвердження переносу від учня за newSlotId (короткий callback; ініціатор — тренер). */
async function studentConfirmsCoachRescheduleByNewSlot(chatId, newSlotId) {
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!newSlot || String(newSlot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Запит не знайдено або вже недійсний.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const newOk =
    newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED || newSlot.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE;
  if (!newOk) {
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const coachId = newSlot.coachId;
  /** Старий слот: спочатку з БД (reschedule_from_slot_id), інакше перший BOOKED — помилково при кількох записах */
  let oldSlot = null;
  if (newSlot.rescheduleFromSlotId) {
    const from = await supabase.getSlotById(newSlot.rescheduleFromSlotId);
    if (
      from &&
      String(from.studentId) === String(chatId) &&
      String(from.coachId) === String(coachId) &&
      from.status === CONSTANTS.SCHEDULE_STATUS.BOOKED &&
      String(from.id) !== String(newSlotId)
    ) {
      oldSlot = from;
    }
  }
  if (!oldSlot) {
    const studentSlots = await supabase.getSlotsByStudentAndStatus(String(chatId), CONSTANTS.SCHEDULE_STATUS.BOOKED);
    oldSlot = (studentSlots || []).find(
      (s) => String(s.coachId) === String(coachId) && String(s.id) !== String(newSlotId)
    );
  }
  if (!oldSlot) {
    await Helpers.safeSend(chatId, '❌ Не знайдено поточний запис для переносу.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  if (String(newSlot.coachId) !== String(oldSlot.coachId)) {
    await Helpers.safeSend(chatId, '❌ Помилка координат слотів.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(String(oldSlot.id), CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(String(oldSlot.id), null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotRescheduleFrom(newSlotId, null);
  const newStr = formatSlotDateTime(newSlot);
  await Helpers.safeSend(oldSlot.coachId, '✅ Учень підтвердив перенос тренування на ' + newStr + '.');
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено. Тренування на ' + newStr + '.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

/** Відхилення переносу від учня за newSlotId (короткий callback; ініціатор — тренер). */
async function studentDeclinesCoachRescheduleByNewSlot(chatId, newSlotId) {
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!newSlot || String(newSlot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const fromId = newSlot.rescheduleFromSlotId;
  if (newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
    await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
    await supabase.updateScheduleSlotStudentId(newSlotId, null);
    await supabase.updateScheduleSlotRescheduleFrom(newSlotId, null);
  }
  let oldSlot = fromId ? await supabase.getSlotById(fromId) : null;
  if (!oldSlot || String(oldSlot.studentId) !== String(chatId)) {
    const studentSlots = await supabase.getSlotsByStudentAndStatus(String(chatId), CONSTANTS.SCHEDULE_STATUS.BOOKED);
    oldSlot = (studentSlots || []).find((s) => String(s.coachId) === String(newSlot.coachId)) || null;
  }
  const dateTimeStr = oldSlot ? formatSlotDateTime(oldSlot) : '';
  await Helpers.safeSend(
    newSlot.coachId,
    '❌ Учень відхилив перенос тренування' + (dateTimeStr ? ' ' + dateTimeStr : '') + '.'
  );
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

async function studentConfirmsCoachReschedule(chatId, oldSlotId, newSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  const newSlot = await supabase.getSlotById(newSlotId);
  const newOk =
    newSlot &&
    (newSlot.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE ||
      newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  if (!oldSlot || !newSlot || String(oldSlot.studentId) !== String(chatId) || String(newSlot.coachId) !== String(oldSlot.coachId) || !newOk) {
    await Helpers.safeSend(chatId, '❌ Один із слотів недоступний.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(oldSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(oldSlotId, null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await supabase.updateScheduleSlotStudentId(newSlotId, String(chatId));
  const newStr = formatSlotDateTime(newSlot);
  await Helpers.safeSend(oldSlot.coachId, '✅ Учень підтвердив перенос тренування на ' + newStr + '.');
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено. Тренування на ' + newStr + '.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

async function studentDeclinesCoachReschedule(chatId, oldSlotId) {
  const oldSlot = await supabase.getSlotById(oldSlotId);
  if (!oldSlot || String(oldSlot.studentId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    const Menu = require('./menu');
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  const dateTimeStr = formatSlotDateTime(oldSlot);
  await Helpers.safeSend(oldSlot.coachId, '❌ Учень відхилив перенос тренування ' + dateTimeStr + '.');
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  const Menu = require('./menu');
  await Menu.showScheduleSubmenu(chatId);
}

async function completeSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  if (!slot || String(slot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
  const trainingType = (slot.trainingType || '').toString() || CONSTANTS.TRAINING_TYPES.PERSONAL;
  const pc = await supabase.getCurrentPrice(slot.coachId, slot.studentId, trainingType);
  if (pc && pc.price != null && !isNaN(pc.price)) {
    let perStudent = pc.price;
    if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) perStudent = pc.price / 2;
    else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) perStudent = pc.price / 3;
    await supabase.updateScheduleSlotPrice(slotId, perStudent, pc.currency || 'UAH');
  }
  await Helpers.safeSend(chatId, '✅ Тренування відмічено як виконане.');
  if (slot.studentId) {
    await Helpers.safeSend(slot.studentId, '✅ Тренер підтвердив завершення тренування.');
  }
  const state = await State.get(chatId);
  if (state && state.afterCompleteSlot === 'mark_training') {
    await showCoachMarkTrainingView(chatId, 0);
    return;
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
    [{ text: '📅 Розклад', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]
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

/** Створити слоти на один обраний день (наприклад після зняття відпустки). */
async function createSlotsForCoachForDate(chatId, dateKey) {
  const settings = await supabase.getCoachScheduleSettings(chatId);
  if (!settings) return { ok: false, created: 0, message: 'Спочатку налаштуй шаблон («Налаштування»).' };
  const d = new Date(dateKey + 'T12:00:00.000Z');
  if (isNaN(d.getTime())) return { ok: false, created: 0, message: 'Невірна дата.' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (getDateKey(d) < getDateKey(today)) return { ok: false, created: 0, message: 'Не можна створювати слоти на минулу дату.' };
  const dow = getDayOfWeekUA(d);
  const restDays = settings.restDays || [];
  if (restDays.indexOf(dow) >= 0) return { ok: false, created: 0, message: 'Цей день позначено як вихідний в налаштуваннях.' };
  const workStartMin = parseTimeToMinutes(settings.workStart || '09:00');
  const workEndMin = parseTimeToMinutes(settings.workEnd || '21:00');
  const durationMin = settings.workoutDurationMin || 60;
  let created = 0;
  const dateStr = dateToISODate(d);
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
  return { ok: true, created };
}

async function showAddSlotsForDayCalendar(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const settings = await supabase.getCoachScheduleSettings(chatId);
  if (!settings) {
    await Helpers.safeSend(chatId, '❌ Спочатку налаштуй шаблон: «Налаштування» в меню Розклад.');
    await showCoachScheduleMenu(chatId);
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = getDateKey(today);
  const vacationKeys = await supabase.getCoachVacationDateKeys(chatId);
  const vacationSet = new Set(vacationKeys || []);
  const restDays = settings.restDays || [];
  const keyboard = [];
  const DAYS_IN_WEEK = 7;
  const ROWS = 4;
  for (let row = 0; row < ROWS; row++) {
    const rowButtons = [];
    for (let col = 0; col < DAYS_IN_WEEK; col++) {
      const dayOffset = row * DAYS_IN_WEEK + col;
      const d = new Date(today);
      d.setDate(d.getDate() + dayOffset);
      const key = getDateKey(d);
      const dayOfWeek = d.getDay();
      const isSunday = dayOfWeek === 0;
      const dow = getDayOfWeekUA(d);
      const isRest = restDays.indexOf(dow) >= 0;
      const isVacation = vacationSet.has(key);
      const isPast = key < todayKey;
      let emoji = '';
      if (isPast) emoji = '⬜ ';
      else if (isSunday) emoji = '🔴 ';
      else if (isRest) emoji = '⚪ ';
      else if (isVacation) emoji = '🏖 ';
      else if (key === todayKey) emoji = '🟢 ';
      const dateLabel = formatDateShortWithWeekday(d);
      const label = emoji + dateLabel;
      rowButtons.push({ text: label.length > 64 ? dateLabel : label, callback_data: CONSTANTS.CALLBACKS.SCH_ADD_SLOTS_DAY_PICK + ':' + key });
    }
    keyboard.push(rowButtons);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE }]);
  await Helpers.sendKeyboard(
    chatId,
    '📆 Додати слоти на день\n\nОбери дату (⬜ минуле, 🔴 неділя, ⚪ вихідний, 🏖 відпустка):',
    keyboard
  );
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
      '💡 Нагадування: спочатку в «Налаштування» (меню Розклад) вкажіть робочий час та вихідний день за потреби.\n\n' +
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

// ——— Тренер записує учня: календар → дата → вільні + резерв слоти ———
async function startBookStudent(chatId, studentChatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const bookable = (allSlots || []).filter(
    (s) => (s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED)
  );
  const future = bookable.filter(isSlotInFuture);
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Немає вільних слотів.\n\n💡 Як створити: Головне меню → Розклад → «Створити слоти» → введи кількість днів (наприклад 7). Слоти створюються за робочим часом з Налаштувань.');
    const Coach = require('./coach');
    await Coach.showStudentProfile(chatId, studentChatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.SCH_BOOK_STUDENT, targetStudentId: studentChatId });
  await showBookStudentCalendar(chatId, studentChatId);
}

function buildAvailableSlotsByDate(slots) {
  const byDate = {};
  for (const s of slots || []) {
    const k = getDateKey(s.date);
    if (!byDate[k]) byDate[k] = 0;
    byDate[k]++;
  }
  return byDate;
}

async function showBookStudentCalendar(chatId, studentChatId) {
  const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const bookable = (allSlots || []).filter(
    (s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED
  );
  const future = bookable.filter(isSlotInFuture);
  const availableByDate = buildAvailableSlotsByDate(future);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = getDateKey(today);
  const student = await User.getByChatId(studentChatId);
  const studentName = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '').trim() : 'учня';
  const keyboard = [];
  const DAYS_IN_WEEK = 7;
  const ROWS = 4;
  for (let row = 0; row < ROWS; row++) {
    const rowButtons = [];
    for (let col = 0; col < DAYS_IN_WEEK; col++) {
      const dayOffset = row * DAYS_IN_WEEK + col;
      const d = new Date(today);
      d.setDate(d.getDate() + dayOffset);
      const key = getDateKey(d);
      const count = availableByDate[key] || 0;
      const dayOfWeek = d.getDay();
      const isSunday = dayOfWeek === 0;
      const isToday = key === todayKey;
      let emoji = '';
      if (isToday) emoji = '🟢 ';
      else if (isSunday) emoji = '🔴 ';
      else if (count === 0) emoji = '⬜ ';
      const dateLabel = formatDateShortWithWeekday(d);
      const label = emoji + dateLabel + (count ? ' (' + count + ')' : '');
      rowButtons.push({
        text: label.length > 64 ? dateLabel + (count ? '(' + count + ')' : '') : label,
        callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_DAY + ':' + key
      });
    }
    keyboard.push(rowButtons);
  }
  const homeEmoji = (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME) ? CONSTANTS.EMOJI.HOME : '🏠';
  keyboard.push([{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_STUDENTS }, { text: homeEmoji + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_MAIN }]);
  const bookHint = '**Кольори:** 🟢 сьогодні, 🔴 неділя (вихідний), ⬜ немає слотів. Число в дужках — кількість вільних слотів на день. Натисни на дату — обереш час.\n\n💡 Якщо немає слотів або потрібних днів: Розклад → Створити слоти → введи кількість днів (наприклад 7).';
  await Helpers.sendKeyboard(chatId, '📅 Обери дату для запису ' + studentName + '\n\n' + bookHint + '\n\nОбері дату:', keyboard, { parse_mode: 'Markdown' });
}

async function showBookStudentDaySlots(chatId, dateKey) {
  const state = await State.get(chatId);
  const targetStudentId = state && state.targetStudentId ? String(state.targetStudentId) : null;
  if (!targetStudentId) {
    await State.clear(chatId);
    await showCoachScheduleMenu(chatId);
    return;
  }
  const allSlots = await supabase.getSlotsByCoachAndStatus(chatId, null);
  const bookable = (allSlots || []).filter(
    (s) => s.status === CONSTANTS.SCHEDULE_STATUS.AVAILABLE || s.status === CONSTANTS.SCHEDULE_STATUS.RESERVED
  );
  const daySlots = (bookable || [])
    .filter((s) => isSlotOnDate(s, dateKey) && isSlotInFuture(s))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (daySlots.length === 0) {
    await Helpers.safeSend(chatId, '📅 На цю дату немає вільних слотів.');
    await showBookStudentCalendar(chatId, targetStudentId);
    return;
  }
  const d = new Date(dateKey);
  const dateLabel = d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
  const student = await User.getByChatId(targetStudentId);
  const studentName = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '').trim() : 'учня';
  const toShow = daySlots.slice(0, MAX_AVAILABLE_SLOT_BUTTONS);
  const keyboard = toShow.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_FOR + ':' + s.id }]);
  keyboard.push([{ text: '🔙 До календаря', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_CALENDAR_BACK }]);
  const homeEmoji = (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME) ? CONSTANTS.EMOJI.HOME : '🏠';
  keyboard.push([{ text: '👥 Мої учні', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_STUDENTS }, { text: homeEmoji + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_MAIN }]);
  const slotHint = 'Обери час — учня буде записано на обраний слот. Учень отримає запит на підтвердження в «Мій розклад».';
  await Helpers.sendKeyboard(chatId, '📅 Вільні слоти на ' + dateLabel + ' для ' + studentName + '\n\n' + slotHint + '\n\nОбері слот:', keyboard);
}

async function showStudentAvailableSlots(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || !user.coachId) {
    await Helpers.safeSend(chatId, "❌ У тебе немає призначеного тренера. Зв'яжися з тренером для запису.");
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await getAvailableSlotsForStudent(user.coachId);
  const future = (slots || []).filter(isSlotInFuture);
  if (future.length === 0) {
    await Helpers.safeSend(chatId, '📅 Наразі немає вільних слотів. Запитай тренера.');
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await showStudentBookCalendar(chatId);
}

/** Дати з записом учня в календарі «Записатись»: окремо очікує підтвердження (REQUESTED) і підтверджено (BOOKED). */
async function buildStudentBookingCalendarSets(studentChatId) {
  const pending = new Set();
  const confirmed = new Set();
  try {
    const slots = await supabase.getSlotsByStudentAndStatus(String(studentChatId), null);
    const list = Array.isArray(slots) ? slots : [];
    const relevant = list.filter(
      (s) =>
        s &&
        isSlotInFuture(s) &&
        (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED)
    );
    for (const s of relevant) {
      const k = s.date ? getDateKey(s.date) : '';
      if (!k) continue;
      if (s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) pending.add(k);
      else if (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED) confirmed.add(k);
    }
  } catch (e) {
    console.error('buildStudentBookingCalendarSets', e.message);
  }
  return { pending, confirmed };
}

async function showStudentBookCalendar(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || !user.coachId) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await getAvailableSlotsForStudent(user.coachId);
  const future = (slots || []).filter(isSlotInFuture);
  const availableByDate = buildAvailableSlotsByDate(future);
  const { pending: myPendingDates, confirmed: myConfirmedDates } = await buildStudentBookingCalendarSets(chatId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = getDateKey(today);
  const keyboard = [];
  /** 7 рядків вниз × 3 стовпці: колонки = тижні (1→8→15, 2→9→16, …) */
  const CAL_ROWS = 7;
  const CAL_COLS = 3;
  for (let row = 0; row < CAL_ROWS; row++) {
    const rowButtons = [];
    for (let col = 0; col < CAL_COLS; col++) {
      const dayOffset = row + col * CAL_ROWS;
      const d = new Date(today);
      d.setDate(d.getDate() + dayOffset);
      const key = getDateKey(d);
      const count = availableByDate[key] || 0;
      const dayOfWeek = d.getDay();
      const isSunday = dayOfWeek === 0;
      const isToday = key === todayKey;
      const emoji = studentBookCalendarEmoji(
        myPendingDates.has(key),
        myConfirmedDates.has(key),
        isToday,
        isSunday,
        count
      );
      const dateLabel = formatDateShortWithWeekday(d);
      const label = emoji + dateLabel + (count ? ' (' + count + ')' : '');
      rowButtons.push({
        text: trimStudentCalendarButtonText(label),
        callback_data: CONSTANTS.CALLBACKS.SCH_S_BOOK_DAY + ':' + key
      });
    }
    keyboard.push(rowButtons);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  const bookCalMsg =
    '📅 <b>Вільні слоти тренера</b> (21 день)\n\n' +
    '<b>Легенда:</b>\n' +
    '🟢 — сьогодні\n' +
    '🔴 — неділя\n' +
    '🟡 — запис очікує підтвердження тренера\n' +
    '🔵 — запис підтверджено\n' +
    '⬜ — немає вільних слотів\n\n' +
    'Обери дату:';
  await Helpers.sendKeyboard(chatId, bookCalMsg, keyboard, { parse_mode: 'HTML' });
}

async function showStudentBookDaySlots(chatId, dateKey) {
  const user = await User.getByChatId(chatId);
  if (!user || !user.coachId) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const slots = await getAvailableSlotsForStudent(user.coachId);
  const daySlots = (slots || [])
    .filter((s) => isSlotOnDate(s, dateKey) && isSlotInFuture(s))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (daySlots.length === 0) {
    await Helpers.safeSend(chatId, '📅 На цю дату немає вільних слотів.');
    await showStudentBookCalendar(chatId);
    return;
  }
  const d = new Date(dateKey);
  const dateLabel = d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
  const toShow = daySlots.slice(0, MAX_AVAILABLE_SLOT_BUTTONS);
  const keyboard = toShow.map((s) => [{ text: formatSlotDateTime(s), callback_data: CONSTANTS.CALLBACKS.SCH_S_REQ + ':' + s.id }]);
  keyboard.push([{ text: '🔙 До календаря', callback_data: CONSTANTS.CALLBACKS.SCH_S_BOOK_CALENDAR_BACK }]);
  await Helpers.sendKeyboard(
    chatId,
    '📅 <b>Вільні слоти на ' + Helpers.escapeHtml(dateLabel) + '</b>\n\nОбери час:',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function requestBookSlot(chatId, slotId) {
  const slot = await supabase.getSlotById(slotId);
  const dateKey = slot && slot.date ? getDateKey(slot.date) : '';

  const rerenderStudentBookingView = async () => showStudentBookCalendar(chatId);

  if (!slot) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showStudentBookCalendar(chatId);
    return;
  }
  if (slot.status !== CONSTANTS.SCHEDULE_STATUS.AVAILABLE) {
    await Helpers.safeSend(chatId, '❌ Цей слот вже зайнятий.');
    await rerenderStudentBookingView();
    return;
  }
  const user = await User.getByChatId(chatId);
  if (!user || String(user.coachId) !== String(slot.coachId)) {
    await Helpers.safeSend(chatId, '❌ Цей слот не від твого тренера.');
    await showStudentBookCalendar(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.REQUESTED);
  await supabase.updateScheduleSlotStudentId(slotId, String(chatId));
  const dateTimeStr = formatSlotDateTime(slot);
  const studentName = (user.firstName || '') + (user.lastName ? ' ' + user.lastName : '').trim() || 'Учень';
  await Helpers.safeSend(chatId, '⏳ Запит на запис надіслано тренеру. Очікуй підтвердження.');
  const kbd = [
    [{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.SCH_CONF + ':' + slotId }],
    [{ text: '❌ Відхилити', callback_data: CONSTANTS.CALLBACKS.SCH_DECLINE + ':' + slotId }]
  ];
  await Helpers.sendKeyboard(
    slot.coachId,
    '⏳ <b>Запит на запис</b>\n\nУчень: ' +
      Helpers.escapeHtml(studentName) +
      '\n🗓 Час: ' +
      Helpers.escapeHtml(dateTimeStr) +
      '\n\nПідтверди або відхили:',
    kbd,
    { parse_mode: 'HTML' }
  );
  // Після відправки запиту повертаємо учня в календар (не в список слотів дня).
  await rerenderStudentBookingView();
}

async function showStudentMySchedule(chatId) {
  try {
    const studentId = String(chatId || '');
    const slots = await supabase.getSlotsByStudentAndStatus(studentId, null);
    const list = Array.isArray(slots) ? slots : [];
    const future = list.filter((s) => s && isSlotInFuture(s) && (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED));

    if (future.length === 0) {
      const keyboard = [
        [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ];
      await Helpers.sendKeyboard(chatId, '📅 Мій розклад\n\nНемає майбутніх записів. Записатись можна кнопкою «Записатись на тренування».\n\nЯкщо тренер щойно записав тебе — натисни «Мій розклад» ще раз або /start.', keyboard);
      return;
    }

    let text = '📅 Мій розклад\n\n';
    for (const s of future.slice(0, MAX_STUDENT_MY_SCHEDULE_SLOTS)) {
      const statusLabel = s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED ? '⏳ очікує підтвердження' : '✅ підтверджено';
      text += '• ' + formatSlotDateTime(s) + ' — ' + statusLabel + '\n';
    }
    if (future.length > MAX_STUDENT_MY_SCHEDULE_SLOTS) {
      text += '\n(Показано перші ' + MAX_STUDENT_MY_SCHEDULE_SLOTS + ' з ' + future.length + '.)';
    }
    const keyboard = [
      [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(chatId, text, keyboard);
  } catch (err) {
    console.error('Schedule.showStudentMySchedule', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити розклад. Спробуй пізніше.');
    const Menu = require('./menu');
    await Menu.show(chatId);
  }
}

async function showStudentMyScheduleEdit(chatId) {
  try {
    const studentId = String(chatId || '');
    const slots = await supabase.getSlotsByStudentAndStatus(studentId, null);
    const list = Array.isArray(slots) ? slots : [];
    const future = list.filter((s) => s && isSlotInFuture(s) && (s.status === CONSTANTS.SCHEDULE_STATUS.BOOKED || s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED));

    if (future.length === 0) {
      await Helpers.safeSend(chatId, '📅 Немає майбутніх тренувань для зміни.');
      await showStudentMySchedule(chatId);
      return;
    }

    await Helpers.safeSend(chatId, '🔄 Змінити запис\n\nОбери тренування та дію:');

    const showSlots = future.slice(0, MAX_STUDENT_MY_SCHEDULE_SLOTS);
    for (const s of showSlots) {
      const statusLabel = s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED ? '⏳' : '✅';
      const line = statusLabel + ' ' + formatSlotDateTime(s);
      const cbConf = CONSTANTS.CALLBACKS.SCH_SC_CONF + ':' + String(s.id);
      const cbDecl = CONSTANTS.CALLBACKS.SCH_SC_DECL + ':' + String(s.id);
      const cbRes = CONSTANTS.CALLBACKS.SCH_S_RES + ':' + String(s.id);
      const keyboard = [];
      if (s.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
        keyboard.push([{ text: '✅ Підтвердити', callback_data: cbConf }, { text: '❌ Відхилити', callback_data: cbDecl }]);
      }
      keyboard.push([{ text: line, callback_data: CONSTANTS.CALLBACKS.SCH_S_SLOT_INFO + ':' + String(s.id) }, { text: '🔄 Перенести', callback_data: cbRes }]);
      try {
        await Helpers.sendKeyboard(chatId, '.', keyboard);
      } catch (e) {
        console.error('Schedule.showStudentMyScheduleEdit send slot', s.id, e.message);
      }
    }

    await Helpers.sendKeyboard(chatId, '.', [[{ text: CONSTANTS.EMOJI.BACK + ' До мого розкладу', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }]]);
  } catch (err) {
    console.error('Schedule.showStudentMyScheduleEdit', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося завантажити розклад.');
    await showStudentMySchedule(chatId);
  }
}

/** Підтвердити перенос за newSlotId (короткий callback, без oldSlotId щоб не перевищити 64 байти). */
async function coachConfirmsRescheduleByNewSlot(chatId, newSlotId) {
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!newSlot || String(newSlot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const studentId = newSlot.studentId;
  if (!studentId) {
    await Helpers.safeSend(chatId, '❌ Учня не визначено для цього слоту.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  // Знаходимо старий слот: BOOKED слот цього учня у цього тренера
  const studentSlots = await supabase.getSlotsByStudentAndStatus(String(studentId), CONSTANTS.SCHEDULE_STATUS.BOOKED);
  const oldSlot = (studentSlots || []).find((s) => String(s.coachId) === String(chatId) && String(s.id) !== String(newSlotId));
  if (!oldSlot) {
    // Якщо старого BOOKED слота немає — просто підтверджуємо новий
    await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
    await Helpers.safeSend(String(studentId), '✅ Тренер підтвердив перенос тренування на ' + formatSlotDateTime(newSlot) + '.');
    await Helpers.safeSend(chatId, '✅ Перенос підтверджено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  await supabase.updateScheduleSlotStatus(String(oldSlot.id), CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
  await supabase.updateScheduleSlotStudentId(String(oldSlot.id), null);
  await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.BOOKED);
  await Helpers.safeSend(String(studentId), '✅ Тренер підтвердив перенос тренування на ' + formatSlotDateTime(newSlot) + '.');
  await Helpers.safeSend(chatId, '✅ Перенос підтверджено.');
  await showCoachMyScheduleMenu(chatId);
}

/** Відхилити перенос за newSlotId (короткий callback). */
async function coachDeclinesRescheduleByNewSlot(chatId, newSlotId) {
  const newSlot = await supabase.getSlotById(newSlotId);
  if (!newSlot || String(newSlot.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Слот не знайдено.');
    await showCoachMyScheduleMenu(chatId);
    return;
  }
  const studentId = newSlot.studentId;
  // Повертаємо новий слот у AVAILABLE
  if (newSlot.status === CONSTANTS.SCHEDULE_STATUS.REQUESTED) {
    await supabase.updateScheduleSlotStatus(newSlotId, CONSTANTS.SCHEDULE_STATUS.AVAILABLE);
    await supabase.updateScheduleSlotStudentId(newSlotId, null);
  }
  if (studentId) {
    const studentSlots = await supabase.getSlotsByStudentAndStatus(String(studentId), CONSTANTS.SCHEDULE_STATUS.BOOKED);
    const oldSlot = (studentSlots || []).find((s) => String(s.coachId) === String(chatId));
    const dateStr = oldSlot ? formatSlotDateTime(oldSlot) : '';
    await Helpers.safeSend(String(studentId), '❌ Тренер відхилив перенос.' + (dateStr ? ' Запис залишається: ' + dateStr + '.' : ''));
  }
  await Helpers.safeSend(chatId, '❌ Перенос відхилено.');
  await showCoachMyScheduleMenu(chatId);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData).split(':')[0].trim();
  const rest = String(callbackData).split(':').slice(1).join(':');

  if (action === CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_STUDENTS) {
    await State.clear(chatId);
    const Coach = require('./coach');
    await Coach.showStudentsList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_BOOK_EXIT_MAIN) {
    await State.clear(chatId);
    const Menu = require('./menu');
    await Menu.show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_MY_SCHEDULE) {
    await showCoachScheduleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_MARK_TRAINING) {
    const page = Math.max(0, parseInt(String(rest || '').trim(), 10) || 0);
    await showCoachMarkTrainingView(chatId, page);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_MY_SLOTS) {
    await showCoachMyScheduleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_VACATION) {
    await showVacationMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_VACATION_ADD) {
    await showVacationCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_VACATION_DAY && rest) {
    await addVacationDay(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_VACATION_REMOVE && rest) {
    await removeVacationDay(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CALENDAR) {
    await showCoachCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CREATE_RESERVE) {
    await Helpers.safeSend(chatId, '🍔 **Створити перерву**\n\nОберіть день в календарі нижче, потім на вільному слоті натисніть «🍔 Хочу перерву». Слот у перерві учні не бачать; записати на нього можна з «Записати» учня.', { parse_mode: 'Markdown' });
    await showCoachCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_ALL) {
    await showCoachMyScheduleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_AVAILABLE) {
    await showCoach7DaysView(chatId, 'available', 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_BOOKED) {
    await showCoach7DaysView(chatId, 'booked', 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_REQUESTED) {
    await showCoach7DaysView(chatId, 'requested', 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_RESERVED) {
    await showCoach7DaysView(chatId, 'reserved', 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_7_VIEW && rest) {
    const [f, p] = rest.split(':').map((x) => x.trim());
    const page = parseInt(p || '0', 10) || 0;
    await showCoach7DaysView(chatId, f || 'all', page);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CALENDAR_DAY && rest) {
    const dateKey = rest.trim();
    await showCoachDaySlots(chatId, dateKey, 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_BOOK_DAY && rest) {
    const dateKey = rest.trim();
    await showBookStudentDaySlots(chatId, dateKey);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_BOOK_CALENDAR_BACK) {
    const state = await State.get(chatId);
    const targetStudentId = state && state.targetStudentId ? String(state.targetStudentId) : null;
    if (targetStudentId) await showBookStudentCalendar(chatId, targetStudentId);
    else {
      await State.clear(chatId);
      await showCoachScheduleMenu(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_DAY_VIEW && rest) {
    const [dateKey, p] = rest.split(':').map((x) => x.trim());
    const page = parseInt(p || '0', 10) || 0;
    if (dateKey) await showCoachDaySlots(chatId, dateKey, page);
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
  if (action === CONSTANTS.CALLBACKS.SCH_ADD_SLOTS_FOR_DAY) {
    await showAddSlotsForDayCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_ADD_SLOTS_DAY_PICK && rest) {
    const dateKey = rest.trim();
    const result = await createSlotsForCoachForDate(chatId, dateKey);
    if (result.ok) {
      await Helpers.safeSend(chatId, '✅ На ' + new Date(dateKey).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }) + ' створено ' + result.created + ' слотів.');
    } else {
      await Helpers.safeSend(chatId, '❌ ' + (result.message || 'Не вдалося створити слоти.'));
    }
    await showCoachScheduleMenu(chatId);
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
  if ((action === CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE || action === CONSTANTS.CALLBACKS.SCH_S_RES) && rest) {
    await studentRequestsReschedule(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RES_CANCEL) {
    await State.clear(chatId);
    await showStudentMyScheduleEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RES_CALENDAR) {
    await showStudentRescheduleCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_SLOT_INFO) {
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RES_DAY && rest) {
    await showStudentRescheduleDaySlots(chatId, rest.trim());
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
    const [oldId, newId] = rest.split(':').map((x) => x.trim());
    await coachDeclinesReschedule(chatId, oldId, newId || null);
    return true;
  }
  // Короткі форми для перенесення (уникнення ліміту 64 байти callback_data Telegram)
  if (action === CONSTANTS.CALLBACKS.SCH_CR_OK && rest) {
    await coachConfirmsRescheduleByNewSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_CR_NO && rest) {
    await coachDeclinesRescheduleByNewSlot(chatId, rest.trim());
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
  if (action === CONSTANTS.CALLBACKS.SCH_C_RES_CAL) {
    await showCoachRescheduleCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_C_RES_DAY && rest) {
    await showCoachRescheduleDaySlots(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_C_RES_CANCEL) {
    await State.clear(chatId);
    await showCoachCalendar(chatId);
    return true;
  }
  if ((action === CONSTANTS.CALLBACKS.SCH_STUDENT_CONF_COACH_BOOK || action === CONSTANTS.CALLBACKS.SCH_SC_CONF) && rest) {
    await studentConfirmsCoachBooking(chatId, rest.trim());
    return true;
  }
  if ((action === CONSTANTS.CALLBACKS.SCH_STUDENT_DECLINE_COACH_BOOK || action === CONSTANTS.CALLBACKS.SCH_SC_DECL) && rest) {
    await studentDeclinesCoachBooking(chatId, rest.trim());
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
  /** Перенос ініційований тренером: лише newSlotId у callback (ліміт 64 байти). */
  if (action === CONSTANTS.CALLBACKS.SCH_SR_OK && rest) {
    await studentConfirmsCoachRescheduleByNewSlot(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SR_NO && rest) {
    await studentDeclinesCoachRescheduleByNewSlot(chatId, rest.trim());
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
  if (action === CONSTANTS.CALLBACKS.SCH_SLOT_RESERVE && rest) {
    await setSlotReserve(chatId, rest.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_SLOT_UNRESERVE && rest) {
    await setSlotUnreserve(chatId, rest.trim());
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
  if (action === CONSTANTS.CALLBACKS.SCH_S_BOOK_DAY && rest) {
    const dateKey = rest.trim();
    await showStudentBookDaySlots(chatId, dateKey);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_BOOK_CALENDAR_BACK) {
    await showStudentBookCalendar(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE) {
    await showStudentMySchedule(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_MY_EDIT) {
    await showStudentMyScheduleEdit(chatId);
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
    await showCoachMyScheduleMenu(chatId);
    return true;
  }

  return false;
}

module.exports = {
  formatSlotDateTime,
  startBookStudent,
  showCoachScheduleMenu,
  showCoachMyScheduleMenu,
  showStudentAvailableSlots,
  showStudentMySchedule,
  showStudentMyScheduleEdit,
  handleCallback,
  handleTextMessage
};
