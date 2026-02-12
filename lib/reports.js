/**
 * Reports — звіти тренера (Кількість тренувань, Сума доходів — заглушка)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function validateReportDays(input) {
  const days = parseInt(String(input).trim(), 10);
  if (Number.isNaN(days)) return { valid: false, error: 'Введи число від 1 до 365' };
  if (days < 1 || days > 365) return { valid: false, error: 'Період має бути від 1 до 365 днів' };
  return { valid: true, value: days };
}

async function showReportsMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const keyboard = [
    [{ text: '📈 Кількість тренувань', callback_data: CONSTANTS.CALLBACKS.REPORTS_TRAININGS }],
    [{ text: '💰 Сума доходів', callback_data: CONSTANTS.CALLBACKS.REPORTS_INCOME }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '📊 **Звіти**\n\nОберіть тип звіту:', keyboard, { parse_mode: 'Markdown' });
}

async function startTrainingsReport(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REPORTS_TRAININGS_INPUT_DAYS });
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]];
  await Helpers.sendKeyboard(
    chatId,
    '📈 **Звіт: Кількість тренувань**\n\nЗа скільки днів показати статистику?\n\nВведи число від 1 до 365 (наприклад: 7, 14, 30, 90):',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function sendTrainingReport(chatId, daysInput) {
  const validation = validateReportDays(daysInput);
  if (!validation.valid) {
    await Helpers.safeSend(chatId, '❌ ' + validation.error);
    return;
  }
  const days = validation.value;
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await State.clear(chatId);
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const trainings = await supabase.getCompletedTrainingsByCoach(chatId, days);
  const totalCount = trainings.length;
  const grouped = {};
  for (const t of trainings) {
    const sid = t.studentId ? String(t.studentId) : 'unknown';
    if (!grouped[sid]) grouped[sid] = { count: 0, studentId: sid };
    grouped[sid].count++;
  }
  const byStudents = [];
  for (const sid of Object.keys(grouped)) {
    const g = grouped[sid];
    const student = sid !== 'unknown' ? await User.getByChatId(sid) : null;
    const name = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : 'Невідомий';
    byStudents.push({ studentName: name, count: g.count });
  }
  byStudents.sort((a, b) => b.count - a.count);
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  let message = '📊 **Звіт по тренуванням**\n\n';
  message += `📅 Період: останні **${days} днів**\n`;
  message += `(з ${formatDate(startDate)} до ${formatDate(endDate)})\n\n`;
  message += `✅ **Проведено тренувань: ${totalCount}**\n\n`;
  if (totalCount === 0) {
    message += 'ℹ️ У вас ще немає проведених тренувань за цей період.';
  } else {
    message += '**По учням:**\n';
    for (const s of byStudents) {
      message += `• ${s.studentName}: ${s.count} тренувань\n`;
    }
    const avgPerDay = (totalCount / days).toFixed(1);
    message += `\n📈 **Середньо:** ${avgPerDay} тренувань/день`;
  }
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад до звітів', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]];
  await Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
  await State.clear(chatId);
}

async function showIncomeStub(chatId) {
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад до звітів', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]];
  await Helpers.sendKeyboard(
    chatId,
    '⚙️ **Функція в розробці**\n\nСтатистика доходів буде доступна в наступній версії бота.\n\nТимчасово ви можете вести облік доходів вручну.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const action = String(callbackData).split(':')[0].trim();
  if (action === CONSTANTS.CALLBACKS.REPORTS_MENU) {
    await showReportsMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REPORTS_TRAININGS) {
    await startTrainingsReport(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REPORTS_INCOME) {
    await showIncomeStub(chatId);
    return true;
  }
  return false;
}

module.exports = {
  showReportsMenu,
  startTrainingsReport,
  sendTrainingReport,
  showIncomeStub,
  handleCallback,
  validateReportDays
};
