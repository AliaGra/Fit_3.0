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
  if (!user) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const keyboard = [
    [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.splice(1, 0, [{ text: '📈 Кількість тренувань', callback_data: CONSTANTS.CALLBACKS.REPORTS_TRAININGS }]);
    keyboard.splice(2, 0, [{ text: '💰 Сума доходів', callback_data: CONSTANTS.CALLBACKS.REPORTS_INCOME }]);
  }
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

async function startIncomeReport(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REPORTS_INCOME_INPUT_DAYS });
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]];
  await Helpers.sendKeyboard(
    chatId,
    '💰 **Звіт: Сума доходів**\n\nЗа скільки днів порахувати дохід?\n\nВведи число від 1 до 365 (наприклад: 7, 30, 90):',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function sendIncomeReport(chatId, daysInput) {
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
  const slots = await supabase.getCompletedTrainingsByCoach(chatId, days);
  const withPrice = (slots || []).filter((s) => s.priceCharged != null && !isNaN(parseFloat(s.priceCharged)));
  const totalSum = withPrice.reduce((sum, s) => sum + parseFloat(s.priceCharged), 0);
  const byStudent = {};
  const byCurrency = {};
  for (const s of withPrice) {
    const amount = parseFloat(s.priceCharged);
    const cur = (s.currency || 'UAH').toString().trim() || 'UAH';
    byCurrency[cur] = (byCurrency[cur] || 0) + amount;
    const sid = s.studentId ? String(s.studentId) : 'unknown';
    if (!byStudent[sid]) byStudent[sid] = { sum: 0, currency: cur };
    byStudent[sid].sum += amount;
  }
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  let message = '💰 **Звіт по доходах**\n\n';
  message += `📅 Період: останні **${days} днів**\n`;
  message += `(з ${formatDate(startDate)} до ${formatDate(endDate)})\n\n`;
  if (withPrice.length === 0) {
    message += 'ℹ️ За цей період немає проведених тренувань з записаною вартістю.\n\n';
    message += 'Вартість записується автоматично при відмітці тренування як «Виконано» (якщо налаштовані тарифи в «Вартість тренувань»).';
  } else {
    if (Object.keys(byCurrency).length === 1) {
      const currency = Object.keys(byCurrency)[0];
      message += `✅ **Загальний дохід: ${totalSum.toFixed(2)} ${currency}**\n\n`;
    } else {
      message += `✅ **Загальний дохід:**\n`;
      for (const [cur, sum] of Object.entries(byCurrency)) {
        message += `• ${sum.toFixed(2)} ${cur}\n`;
      }
      message += '\n';
    }
    const studentIds = Object.keys(byStudent).filter((id) => id !== 'unknown');
    if (studentIds.length > 0) {
      message += '**По учнях:**\n';
      const lines = [];
      for (const sid of studentIds) {
        const student = await User.getByChatId(sid);
        const name = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : sid;
        const rec = byStudent[sid];
        lines.push({ name, sum: rec.sum, currency: rec.currency });
      }
      lines.sort((a, b) => b.sum - a.sum);
      for (const l of lines) {
        message += `• ${l.name}: ${l.sum.toFixed(2)} ${l.currency}\n`;
      }
    }
    message += `\n📈 **Проведено тренувань:** ${withPrice.length}`;
  }
  const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад до звітів', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]];
  await Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
  await State.clear(chatId);
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
    await startIncomeReport(chatId);
    return true;
  }
  return false;
}

module.exports = {
  showReportsMenu,
  startTrainingsReport,
  sendTrainingReport,
  startIncomeReport,
  sendIncomeReport,
  handleCallback,
  validateReportDays
};
