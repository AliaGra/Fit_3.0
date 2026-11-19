/**
 * Reports — звіти тренера:
 * кількість тренувань, сума доходів (валовий факт),
 * дохід після залу (факт), плановий дохід (крок 3).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Calc = require('./coachEconomicsCalc');

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

function reportsBackKeyboard() {
  return [
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад до звітів', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
    [{ text: '⬅️ Мій профіль', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
}

async function showReportsMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  const keyboard = [
    [{ text: '📊 Історія моїх тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }],
    [{ text: '⬅️ Мій профіль', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  if (user.role === CONSTANTS.ROLES.COACH) {
    keyboard.splice(
      1,
      0,
      [{ text: '💰 Сума доходів (валовий факт)', callback_data: CONSTANTS.CALLBACKS.REPORTS_INCOME }],
      [{ text: '🏋️ Після залу (факт)', callback_data: CONSTANTS.CALLBACKS.REPORTS_NET }],
      [{ text: '📅 Плановий дохід', callback_data: CONSTANTS.CALLBACKS.REPORTS_PLAN }]
    );
  }
  await Helpers.sendKeyboard(
    chatId,
    '📊 Звіти\n\n' +
      'Валовий факт — сума price з проведених тренувань.\n' +
      'Після залу — мінус частка залу за «Умовами залів».\n' +
      'Плановий — майбутні підтверджені слоти + групові абонементи.',
    keyboard
  );
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
    '📈 Звіт: Кількість тренувань\n\nЗа скільки днів показати статистику?\n\nВведи число від 1 до 365 (наприклад: 7, 14, 30, 90):',
    keyboard
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
  let message = '📊 Звіт по тренуванням\n\n';
  message += '📅 Період: останні ' + days + ' днів\n';
  message += '(з ' + formatDate(startDate) + ' до ' + formatDate(endDate) + ')\n\n';
  message += '✅ Проведено тренувань: ' + totalCount + '\n\n';
  if (totalCount === 0) {
    message += 'ℹ️ У вас ще немає проведених тренувань за цей період.';
  } else {
    message += 'По клієнтам:\n';
    for (const s of byStudents) {
      message += '• ' + s.studentName + ': ' + s.count + ' тренувань\n';
    }
    const avgPerDay = (totalCount / days).toFixed(1);
    message += '\n📈 Середньо: ' + avgPerDay + ' тренувань/день';
  }
  await Helpers.sendKeyboard(chatId, message, reportsBackKeyboard());
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
    '💰 Звіт: Сума доходів (валовий факт)\n\nЗа скільки днів порахувати дохід?\n\nВведи число від 1 до 365 (наприклад: 7, 30, 90):',
    keyboard
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
  let message = '💰 Звіт по доходах (валовий факт)\n\n';
  message += '📅 Період: останні ' + days + ' днів\n';
  message += '(з ' + formatDate(startDate) + ' до ' + formatDate(endDate) + ')\n\n';
  if (withPrice.length === 0) {
    message += 'ℹ️ За цей період немає проведених тренувань з записаною вартістю.\n\n';
    message += 'Вартість записується автоматично при відмітці тренування як «Виконано» (якщо налаштовані тарифи в «Вартість тренувань»).';
  } else {
    if (Object.keys(byCurrency).length === 1) {
      const currency = Object.keys(byCurrency)[0];
      message += '✅ Загальний дохід: ' + totalSum.toFixed(2) + ' ' + currency + '\n\n';
    } else {
      message += '✅ Загальний дохід:\n';
      for (const [cur, sum] of Object.entries(byCurrency)) {
        message += '• ' + sum.toFixed(2) + ' ' + cur + '\n';
      }
      message += '\n';
    }
    const studentIds = Object.keys(byStudent).filter((id) => id !== 'unknown');
    if (studentIds.length > 0) {
      message += 'По клієнтах:\n';
      const lines = [];
      for (const sid of studentIds) {
        const student = await User.getByChatId(sid);
        const name = student ? (student.firstName || '') + (student.lastName ? ' ' + student.lastName : '') : sid;
        const rec = byStudent[sid];
        lines.push({ name, sum: rec.sum, currency: rec.currency });
      }
      lines.sort((a, b) => b.sum - a.sum);
      for (const l of lines) {
        message += '• ' + l.name + ': ' + l.sum.toFixed(2) + ' ' + l.currency + '\n';
      }
    }
    message += '\n📈 Проведено тренувань: ' + withPrice.length;
  }
  await Helpers.sendKeyboard(chatId, message, reportsBackKeyboard());
  await State.clear(chatId);
}

async function loadEconomicsMap(coachChatId) {
  const list = (await supabase.listCoachVenueEconomics(coachChatId)) || [];
  const map = {};
  for (const eco of list) {
    if (eco && eco.venueId) map[String(eco.venueId)] = eco;
  }
  return map;
}

async function resolveFallbackTeachVenueId(coachChatId) {
  const links = (await supabase.getCoachVenuesWhereTeach(coachChatId)) || [];
  if (links.length === 1 && links[0].id) return String(links[0].id);
  return null;
}

async function venueNameMap(venueIds) {
  const map = {};
  for (const id of venueIds) {
    if (!id || id === 'none') {
      map[id || 'none'] = 'Без залу / онлайн';
      continue;
    }
    try {
      const v = await supabase.getVenueById(id);
      map[id] = (v && (v.nameUa || v.name)) || id;
    } catch (_) {
      map[id] = id;
    }
  }
  return map;
}

function rangeYmdForPastDays(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { fromYmd: Calc.dateKey(start), toYmd: Calc.dateKey(end), start, end };
}

function rangeYmdForFutureDays(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { fromYmd: Calc.dateKey(start), toYmd: Calc.dateKey(end), start, end };
}

async function startNetReport(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REPORTS_NET_INPUT_DAYS });
  await Helpers.sendKeyboard(
    chatId,
    '🏋️ Звіт: дохід після залу (факт)\n\n' +
      'Рахує проведені тренування мінус частка залу за «Умовами залів».\n' +
      'Групові: % від оплат абонементів з start у періоді.\n\n' +
      'За скільки днів назад порахувати? (1–365)',
    [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]]
  );
}

async function sendNetReport(chatId, daysInput) {
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
  await Helpers.safeSend(chatId, '⏳ Рахую факт після залу…');
  const { fromYmd, toYmd, start, end } = rangeYmdForPastDays(days);
  const slots = await supabase.getCompletedTrainingsByCoach(chatId, days);
  const ecoMap = await loadEconomicsMap(chatId);
  const fallbackVenueId = await resolveFallbackTeachVenueId(chatId);
  const sess = Calc.buildFactSessionReport(slots, ecoMap, fallbackVenueId);
  const groupSubs = await supabase.listGroupClassSubscriptionsByCoachStartRange(chatId, fromYmd, toYmd);
  const grp = Calc.buildGroupSubsReport(groupSubs, ecoMap);

  const venueIds = new Set([
    ...Object.keys(sess.byVenue || {}),
    ...Object.keys(grp.byVenue || {}),
    ...((sess.missingEcoVenueIds || []).map(String))
  ]);
  const names = await venueNameMap(Array.from(venueIds));

  let message =
    '🏋️ Дохід після залу (факт)\n\n' +
    '📅 ' +
    formatDate(start) +
    ' — ' +
    formatDate(end) +
    ' (' +
    days +
    ' дн.)\n\n';

  message += 'Сесії (indiv/split/trio):\n';
  message += '• Валовий: ' + Calc.moneyLabel(sess.grossTotal) + '\n';
  message += '• Частка залу: ' + Calc.moneyLabel(sess.venueShareTotal) + '\n';
  message += '• Після залу: ' + Calc.moneyLabel(sess.netTotal) + '\n';
  message += '• Сесій з ціною: ' + sess.sessionsCounted + '\n\n';

  message += 'Групові абонементи (оплата в місяці start):\n';
  message += '• Оплат: ' + grp.count + ' / ' + Calc.moneyLabel(grp.grossTotal) + '\n';
  message += '• Частка залу: ' + Calc.moneyLabel(grp.venueShareTotal) + '\n';
  message += '• Після залу: ' + Calc.moneyLabel(grp.netTotal) + '\n\n';

  const grossAll = Calc.round2(sess.grossTotal + grp.grossTotal);
  const shareAll = Calc.round2(sess.venueShareTotal + grp.venueShareTotal);
  const netAll = Calc.round2(sess.netTotal + grp.netTotal);
  message += 'Разом:\n';
  message += '• Валовий: ' + Calc.moneyLabel(grossAll) + '\n';
  message += '• Залу: ' + Calc.moneyLabel(shareAll) + '\n';
  message += '• Тобі: ' + Calc.moneyLabel(netAll) + '\n';

  const venueLines = [];
  const allVenueKeys = new Set([...Object.keys(sess.byVenue || {}), ...Object.keys(grp.byVenue || {})]);
  for (const vk of allVenueKeys) {
    const s = sess.byVenue[vk] || { gross: 0, share: 0, net: 0 };
    const g = grp.byVenue[vk] || { gross: 0, share: 0, net: 0 };
    venueLines.push({
      name: names[vk] || vk,
      net: Calc.round2((s.net || 0) + (g.net || 0)),
      gross: Calc.round2((s.gross || 0) + (g.gross || 0)),
      share: Calc.round2((s.share || 0) + (g.share || 0))
    });
  }
  if (venueLines.length) {
    venueLines.sort((a, b) => b.net - a.net);
    message += '\nПо залах (після залу):\n';
    for (const v of venueLines.slice(0, 8)) {
      message += '• ' + v.name + ': ' + Calc.moneyLabel(v.net) + '\n';
    }
  }

  const studentIds = Object.keys(sess.byStudent || {}).filter((id) => id !== 'unknown');
  if (studentIds.length) {
    const lines = [];
    for (const sid of studentIds) {
      const st = await User.getByChatId(sid);
      const name = st ? ((st.firstName || '') + ' ' + (st.lastName || '')).trim() || sid : sid;
      lines.push({ name, net: sess.byStudent[sid].net, gross: sess.byStudent[sid].gross });
    }
    lines.sort((a, b) => b.net - a.net);
    message += '\nПо клієнтах (сесії, після залу):\n';
    for (const l of lines.slice(0, 12)) {
      message += '• ' + l.name + ': ' + Calc.moneyLabel(l.net) + '\n';
    }
  }

  const warns = [].concat(sess.warnings || [], grp.warnings || []);
  if (warns.length) {
    message += '\n⚠️ ' + warns.slice(0, 4).join('\n⚠️ ');
  }
  if (!fallbackVenueId) {
    message +=
      '\n\nℹ️ Слоти без venue_id не прив’язані до залу (частка = 0). Після міграції venue_id нові тренування записують зал автоматично.';
  }

  await Helpers.sendLongKeyboard(chatId, message, reportsBackKeyboard());
  await State.clear(chatId);
}

async function startPlanReport(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId);
    return;
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.REPORTS_PLAN_INPUT_DAYS });
  await Helpers.sendKeyboard(
    chatId,
    '📅 Плановий дохід\n\n' +
      'Рахує майбутні підтверджені слоти (BOOKED) + групові абонементи з start у горизонті.\n' +
      'Без прайсу слот = 0 грн + попередження.\n\n' +
      'На скільки днів уперед? (1–365, напр. 7 / 30)',
    [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }]]
  );
}

async function sendPlanReport(chatId, daysInput) {
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
  await Helpers.safeSend(chatId, '⏳ Рахую плановий дохід…');
  const { fromYmd, toYmd, start, end } = rangeYmdForFutureDays(days);
  const slots = await supabase.getBookedFutureSlotsByCoach(chatId, days);
  const ecoMap = await loadEconomicsMap(chatId);
  const fallbackVenueId = await resolveFallbackTeachVenueId(chatId);

  const priceCache = {};
  // Prefetch prices
  for (const s of slots || []) {
    const sid = s.studentId ? String(s.studentId) : '';
    if (!sid) continue;
    let type = Calc.normalizeTrainingType(s.trainingType);
    if (!s.trainingType) {
      try {
        const sp = await supabase.getStudentPricing(chatId, sid);
        const cp = sp || (await supabase.getCoachPricing(chatId));
        if (cp && cp.defaultTrainingType) type = Calc.normalizeTrainingType(cp.defaultTrainingType);
      } catch (_) {}
    }
    const cacheKey = sid + '|' + type;
    if (priceCache[cacheKey]) continue;
    const pc = await supabase.getCurrentPrice(chatId, sid, type);
    if (!pc || pc.price == null) {
      priceCache[cacheKey] = null;
      continue;
    }
    const n = Calc.sessionParticipants(type);
    priceCache[cacheKey] = {
      pricePerStudent: Calc.round2(Number(pc.price) / n),
      currency: pc.currency || 'UAH',
      fullSessionPrice: Number(pc.price),
      trainingType: type
    };
  }

  // Attach resolved type onto slots missing type
  const slotsForPlan = [];
  for (const s of slots || []) {
    const sid = s.studentId ? String(s.studentId) : '';
    let type = Calc.normalizeTrainingType(s.trainingType);
    if (!s.trainingType) {
      for (const k of Object.keys(priceCache)) {
        if (k.indexOf(sid + '|') === 0 && priceCache[k] && priceCache[k].trainingType) {
          type = priceCache[k].trainingType;
          break;
        }
      }
    }
    slotsForPlan.push({ ...s, trainingType: type });
  }

  const sess = Calc.buildPlanSessionReport(slotsForPlan, ecoMap, fallbackVenueId, (slot) => {
    const sid = slot.studentId ? String(slot.studentId) : '';
    const type = Calc.normalizeTrainingType(slot.trainingType);
    return priceCache[sid + '|' + type] || null;
  });
  const groupSubs = await supabase.listGroupClassSubscriptionsByCoachStartRange(chatId, fromYmd, toYmd);
  const grp = Calc.buildGroupSubsReport(groupSubs, ecoMap);

  const venueIds = new Set([...Object.keys(sess.byVenue || {}), ...Object.keys(grp.byVenue || {})]);
  const names = await venueNameMap(Array.from(venueIds));

  let message =
    '📅 Плановий дохід\n\n' +
    '📆 Горизонт: ' +
    formatDate(start) +
    ' — ' +
    formatDate(end) +
    ' (' +
    days +
    ' дн.)\n' +
    'Лише BOOKED + абонементи з start у горизонті.\n\n';

  message += 'Сесії (план):\n';
  message += '• Валовий: ' + Calc.moneyLabel(sess.grossTotal) + '\n';
  message += '• Частка залу: ' + Calc.moneyLabel(sess.venueShareTotal) + '\n';
  message += '• Після залу: ' + Calc.moneyLabel(sess.netTotal) + '\n';
  message += '• Сесій у плані: ' + sess.sessionsCounted + ' / слотів BOOKED: ' + (slots || []).length + '\n\n';

  message += 'Групові абонементи:\n';
  message += '• Оплат: ' + grp.count + ' / ' + Calc.moneyLabel(grp.grossTotal) + '\n';
  message += '• Частка залу: ' + Calc.moneyLabel(grp.venueShareTotal) + '\n';
  message += '• Після залу: ' + Calc.moneyLabel(grp.netTotal) + '\n\n';

  const grossAll = Calc.round2(sess.grossTotal + grp.grossTotal);
  const shareAll = Calc.round2(sess.venueShareTotal + grp.venueShareTotal);
  const netAll = Calc.round2(sess.netTotal + grp.netTotal);
  message += 'Разом (план):\n';
  message += '• Валовий: ' + Calc.moneyLabel(grossAll) + '\n';
  message += '• Залу: ' + Calc.moneyLabel(shareAll) + '\n';
  message += '• Тобі: ' + Calc.moneyLabel(netAll) + '\n';

  const venueLines = [];
  for (const vk of venueIds) {
    const s = sess.byVenue[vk] || { gross: 0, share: 0, net: 0 };
    const g = grp.byVenue[vk] || { gross: 0, share: 0, net: 0 };
    venueLines.push({
      name: names[vk] || vk,
      net: Calc.round2((s.net || 0) + (g.net || 0))
    });
  }
  if (venueLines.length) {
    venueLines.sort((a, b) => b.net - a.net);
    message += '\nПо залах (план, після залу):\n';
    for (const v of venueLines.slice(0, 8)) {
      message += '• ' + v.name + ': ' + Calc.moneyLabel(v.net) + '\n';
    }
  }

  const warns = [].concat(sess.warnings || [], grp.warnings || []);
  if (warns.length) {
    message += '\n⚠️ ' + warns.slice(0, 5).join('\n⚠️ ');
  }

  await Helpers.sendLongKeyboard(chatId, message, reportsBackKeyboard());
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
  if (action === CONSTANTS.CALLBACKS.REPORTS_NET) {
    await startNetReport(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REPORTS_PLAN) {
    await startPlanReport(chatId);
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
  startNetReport,
  sendNetReport,
  startPlanReport,
  sendPlanReport,
  handleCallback,
  validateReportDays
};
