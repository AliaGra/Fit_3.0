/**
 * Каса тренера — етап 2 (сесії за день) + етап 3 (групові за місяць).
 * Мій профіль → Каса.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Calc = require('./coachEconomicsCalc');

const CB = CONSTANTS.CALLBACKS;

function parseMoney(raw) {
  const cleaned = String(raw || '')
    .replace(/\s/g, '')
    .replace(/грн|uah|₴/gi, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return Calc.round2(n);
}

function parseUaDateToYmd(text) {
  const m = String(text || '')
    .trim()
    .match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return Calc.dateKey(dt);
}

function parseMonthMmYyyy(text) {
  const m = String(text || '')
    .trim()
    .match(/^(\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const mo = parseInt(m[1], 10);
  const y = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  const mm = String(mo).padStart(2, '0');
  return y + '-' + mm;
}

async function ensureCoach(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ лише для тренера.');
    return null;
  }
  return user;
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

async function venueTitle(venueKey) {
  if (!venueKey || venueKey === 'none') return 'Без залу / онлайн';
  const v = await supabase.getVenueById(venueKey);
  if (!v) return venueKey;
  const name = v.nameUa || v.name || venueKey;
  return v.city ? name + ', ' + v.city : name;
}

function cashModeHint(mode) {
  if (mode === 'coach') {
    return 'Режим A: ти здав кошти з клієнтів — введи суму, яку віддаєш залу (плата залу).';
  }
  if (mode === 'venue') {
    return 'Режим B: зал зібрав з клієнтів — введи суму, яку отримуєш від залу.';
  }
  return 'Спочатку обери «Хто бере оплату (сесії)» в «Умовах залів».';
}

function groupCashModeHint(mode) {
  if (mode === 'coach') {
    return 'Режим A (групові): введи суму, яку віддаєш залу з оплат абонементів.';
  }
  if (mode === 'venue') {
    return 'Режим B (групові): введи суму, яку отримуєш від залу за абонементи.';
  }
  return 'Спочатку обери «Хто бере оплату (групові)» в «Умовах залів».';
}

async function studentLineName(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid || sid === 'unknown') return '—';
  if (sid.startsWith('INVITE_')) return 'Запрошення (' + sid.replace(/^INVITE_/i, '') + ')';
  const u = await User.getByChatId(sid);
  if (!u) return sid;
  const last = String(u.lastName || '').trim();
  const first = String(u.firstName || '').trim();
  if (last && first) return last + ' ' + first;
  return (last || first || sid).trim();
}

async function formatClientLines(clientLines, currency) {
  const out = [];
  for (const line of clientLines || []) {
    const name = await studentLineName(line.studentId);
    out.push('• ' + name + ' — ' + Calc.moneyLabel(line.amount, currency));
  }
  return out.join('\n');
}

async function findVenuePlan(chatId, ymd, venueKey) {
  const { plan, closedMap } = await loadDayContext(chatId, ymd);
  const vk = String(venueKey || '');
  const venue = (plan.venues || []).find((v) => String(v.venueKey) === vk) || null;
  const closed = closedMap[vk] || null;
  return { plan, venue, closed };
}

async function loadDayContext(chatId, ymd) {
  const slots = await supabase.getCompletedTrainingsByCoachOnDate(chatId, ymd);
  const ecoMap = await loadEconomicsMap(chatId);
  const fallbackVenueId = await resolveFallbackTeachVenueId(chatId);
  const plan = Calc.buildCashSessionVenuePlans(slots, ecoMap, fallbackVenueId, ymd);
  const closed = await supabase.listCashSettlementsForCoachDate(chatId, ymd, 'sessions');
  const closedMap = {};
  for (const c of closed || []) {
    closedMap[String(c.venueId)] = c;
  }
  return { slots, plan, closedMap, ymd };
}

async function loadGroupMonthContext(chatId, ym) {
  const range = Calc.monthRangeFromYm(ym);
  if (!range) return null;
  const subs = await supabase.listGroupClassSubscriptionsByCoachStartRange(
    chatId,
    range.fromYmd,
    range.toYmd
  );
  const ecoMap = await loadEconomicsMap(chatId);
  const plan = Calc.buildCashGroupVenuePlans(subs, ecoMap);
  const closed = await supabase.listCashSettlementsForCoachDate(chatId, range.businessDate, 'group_month');
  const closedMap = {};
  for (const c of closed || []) {
    closedMap[String(c.venueId)] = c;
  }
  return {
    subs,
    plan,
    closedMap,
    ym: range.ym,
    businessDate: range.businessDate
  };
}

async function findGroupVenuePlan(chatId, ym, venueKey) {
  const ctx = await loadGroupMonthContext(chatId, ym);
  if (!ctx) return { venue: null, closed: null, plan: { venues: [], warnings: [] } };
  const vk = String(venueKey || 'none');
  const venue = (ctx.plan.venues || []).find((v) => String(v.venueKey) === vk) || null;
  const closed = ctx.closedMap[vk] || null;
  return { plan: ctx.plan, venue, closed, businessDate: ctx.businessDate, ym: ctx.ym };
}

async function showHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  await State.update(chatId, { step: null });
  const text =
    '💰 Каса\n\n' +
    'Твій дохід від зробленої роботи — мінус частка залу. Тут фіксуєш результат розрахунку з клубом.\n\n' +
    'Обери тип:';
  const keyboard = [
    [{ text: '👤 Індив / спліт / тріо (день)', callback_data: CB.CASH_SESS }],
    [{ text: '👥 Групові (місяць)', callback_data: CB.CASH_GROUP }],
    [{ text: '⬅️ Мій профіль', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showSessionsHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const today = Calc.dateKey(new Date());
  const text =
    '💰 Каса — індив / спліт / тріо\n\n' +
    'Обери день. По кожному залу — окремий підсумок доходу.\n' +
    'Сьогодні: ' +
    Calc.ymdToUa(today);
  const keyboard = [
    [{ text: '📅 Сьогодні', callback_data: CB.CASH_SESS_TODAY }],
    [{ text: '🗓 Вказати дату', callback_data: CB.CASH_SESS_DATE }],
    [{ text: '⬅️ Каса', callback_data: CB.CASH_HUB }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showDayVenues(chatId, ymd) {
  if (!(await ensureCoach(chatId))) return;
  const dateYmd = String(ymd || '').slice(0, 10);
  if (dateYmd.length < 10) return showSessionsHub(chatId);
  const { plan, closedMap } = await loadDayContext(chatId, dateYmd);
  await State.update(chatId, { step: null, cashYmd: dateYmd });

  if (!(plan.venues && plan.venues.length)) {
    let text =
      '💰 Каса — ' +
      Calc.ymdToUa(dateYmd) +
      '\n\nНемає проведених тренувань із записаною вартістю за цей день.\n' +
      '(Лише проведені тренування через меню «Тренування».)';
    if (plan.warnings && plan.warnings.length) text += '\n\n⚠️ ' + plan.warnings.join('\n⚠️ ');
    await Helpers.sendKeyboard(chatId, text, [
      [{ text: '🗓 Інша дата', callback_data: CB.CASH_SESS_DATE }],
      [{ text: '⬅️ Назад', callback_data: CB.CASH_SESS }]
    ]);
    return;
  }

  let text = '💰 Каса — ' + Calc.ymdToUa(dateYmd) + '\n\nОбери зал:\n';
  if (plan.warnings && plan.warnings.length) {
    text += '\n⚠️ ' + plan.warnings.join('\n⚠️ ') + '\n';
  }

  const keyboard = [];
  for (const v of plan.venues) {
    const closed = closedMap[String(v.venueKey)];
    const title = await venueTitle(v.venueKey);
    const prefix = closed ? '✅ ' : v.canClose ? '⬜ ' : '⚠️ ';
    const planLbl = Calc.moneyLabel(v.planAmount, v.currency);
    const btn = prefix + title + (closed ? ' — зафіксовано' : ' — до фіксації ' + planLbl);
    keyboard.push([
      {
        text: btn.length > 64 ? btn.slice(0, 61) + '…' : btn,
        callback_data: CB.CASH_VENUE + ':' + dateYmd + ':' + String(v.venueKey)
      }
    ]);
  }
  keyboard.push([{ text: '🗓 Інша дата', callback_data: CB.CASH_SESS_DATE }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CB.CASH_SESS }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showGroupHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const ym = Calc.currentYearMonth();
  const text =
    '💰 Каса — групові абонементи\n\n' +
    'Дохід від абонементів з датою початку (start) у обраному місяці.\n' +
    'По кожному залу — окремий підсумок.\n' +
    'Поточний місяць: ' +
    Calc.ymToUa(ym);
  const keyboard = [
    [{ text: '📅 Цей місяць', callback_data: CB.CASH_GROUP_THIS_MONTH }],
    [{ text: '🗓 Вказати місяць', callback_data: CB.CASH_GROUP_MONTH_PICK }],
    [{ text: '⬅️ Каса', callback_data: CB.CASH_HUB }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showGroupMonthVenues(chatId, ym) {
  if (!(await ensureCoach(chatId))) return;
  const ctx = await loadGroupMonthContext(chatId, ym);
  if (!ctx) return showGroupHub(chatId);
  await State.update(chatId, { step: null, cashGroupYm: ctx.ym });

  if (!(ctx.plan.venues && ctx.plan.venues.length)) {
    let text =
      '💰 Каса — групові\n📅 ' +
      Calc.ymToUa(ctx.ym) +
      '\n\nНемає оплачених абонементів зі start у цьому місяці.';
    if (ctx.plan.warnings && ctx.plan.warnings.length) {
      text += '\n\n⚠️ ' + ctx.plan.warnings.join('\n⚠️ ');
    }
    await Helpers.sendKeyboard(chatId, text, [
      [{ text: '🗓 Інший місяць', callback_data: CB.CASH_GROUP_MONTH_PICK }],
      [{ text: '⬅️ Назад', callback_data: CB.CASH_GROUP }]
    ]);
    return;
  }

  let text = '💰 Каса — групові\n📅 ' + Calc.ymToUa(ctx.ym) + '\n\nОбери зал:\n';
  if (ctx.plan.warnings && ctx.plan.warnings.length) {
    text += '\n⚠️ ' + ctx.plan.warnings.join('\n⚠️ ') + '\n';
  }

  const keyboard = [];
  for (const v of ctx.plan.venues) {
    const closed = ctx.closedMap[String(v.venueKey)];
    const title = await venueTitle(v.venueKey);
    const prefix = closed ? '✅ ' : v.canClose ? '⬜ ' : '⚠️ ';
    const planLbl = Calc.moneyLabel(v.planAmount, v.currency);
    const btn = prefix + title + (closed ? ' — зафіксовано' : ' — до фіксації ' + planLbl);
    keyboard.push([
      {
        text: btn.length > 64 ? btn.slice(0, 61) + '…' : btn,
        callback_data: CB.CASH_GRP_VENUE + ':' + ctx.ym + ':' + String(v.venueKey)
      }
    ]);
  }
  keyboard.push([{ text: '🗓 Інший місяць', callback_data: CB.CASH_GROUP_MONTH_PICK }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CB.CASH_GROUP }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showGroupVenueMonth(chatId, ym, venueKey) {
  if (!(await ensureCoach(chatId))) return;
  const vk = String(venueKey || 'none');
  const { venue, closed, ym: monthYm } = await findGroupVenuePlan(chatId, ym, vk);
  if (!venue) {
    await Helpers.safeSend(chatId, '⚠️ Даних по залу за місяць немає.');
    return showGroupMonthVenues(chatId, ym);
  }

  const title = await venueTitle(vk);
  let text = '💰 ' + title + '\n📅 Місяць: ' + Calc.ymToUa(monthYm || ym) + '\n\n';
  text += 'Абонементів (start у місяці): ' + venue.subsCount + '\n';
  text += 'Оплати (валовий): ' + Calc.moneyLabel(venue.gross, venue.currency) + '\n';
  text += 'Плата залу: ' + Calc.moneyLabel(venue.venueShare, venue.currency) + '\n';
  text += 'Після залу: ' + Calc.moneyLabel(venue.net, venue.currency) + '\n\n';
  text += groupCashModeHint(venue.cashMode) + '\n';
  text += 'Сума до фіксації: ' + Calc.moneyLabel(venue.planAmount, venue.currency) + '\n';

  const breakdown = await formatClientLines(venue.clientLines, venue.currency);
  if (breakdown) {
    text += '\nПо клієнтах (якщо сума не збігається):\n' + breakdown + '\n';
  }

  const keyboard = [];
  const monthKey = monthYm || ym;

  if (closed) {
    text +=
      '\n✅ Розрахунок з клубом зафіксовано.\n' +
      'Розрахунок: ' +
      Calc.moneyLabel(closed.planAmount, closed.currency) +
      ' · Підтвердив: ' +
      Calc.moneyLabel(closed.factAmount, closed.currency);
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_GROUP_MONTH + ':' + monthKey }]);
  } else if (!venue.canClose) {
    text += '\n⚠️ Неможливо зафіксувати — доповни «Умови залів» (% групових, режим A/B).';
    keyboard.push([{ text: '🏋️ Умови залів', callback_data: CONSTANTS.CALLBACKS.VECON_HUB }]);
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_GROUP_MONTH + ':' + monthKey }]);
  } else {
    text += '\nНадішли суму після розрахунку з клубом (одне число).';
    await State.update(chatId, {
      step: CONSTANTS.FSM_STATES.CASH_GROUP_FACT_INPUT,
      cashGroupYm: monthKey,
      cashVenueKey: vk
    });
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_GROUP_MONTH + ':' + monthKey }]);
  }

  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Каса', callback_data: CB.CASH_HUB }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askGroupMonth(chatId) {
  if (!(await ensureCoach(chatId))) return;
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.CASH_GROUP_MONTH_INPUT });
  await Helpers.sendKeyboard(
    chatId,
    '💰 Каса — групові\n\nВведи місяць у форматі ММ.РРРР (наприклад 11.2026).',
    [[{ text: '⬅️ Назад', callback_data: CB.CASH_GROUP }]]
  );
}

async function handleGroupFactInput(chatId, text) {
  const state = (await State.get(chatId)) || {};
  const ym = String(state.cashGroupYm || '').slice(0, 7);
  const vk = String(state.cashVenueKey || 'none');
  const fact = parseMoney(text);
  if (fact == null) {
    await Helpers.safeSend(chatId, '⚠️ Введи додатне число (наприклад 300 або 300.50).');
    return true;
  }

  const { venue, closed, businessDate } = await findGroupVenuePlan(chatId, ym, vk);
  if (closed) {
    await State.update(chatId, { step: null });
    await showGroupVenueMonth(chatId, ym, vk);
    return true;
  }
  if (!venue || !venue.canClose) {
    await Helpers.safeSend(chatId, '⚠️ Неможливо зафіксувати — перевір «Умови залів».');
    return true;
  }

  const plan = Calc.round2(venue.planAmount);
  if (fact !== plan) {
    const lines = await formatClientLines(venue.clientLines, venue.currency);
    await Helpers.safeSend(
      chatId,
      '❌ Сума не збігається з розрахунком (' +
        Calc.moneyLabel(plan, venue.currency) +
        ').\n' +
        'Фіксацію заблоковано. Перевір абонементи:\n\n' +
        lines
    );
    return true;
  }

  const ins = await supabase.insertCashSettlementIfAbsent({
    coachChatId: chatId,
    venueId: vk,
    businessDate: businessDate || ym + '-01',
    kind: 'group_month',
    planAmount: plan,
    factAmount: fact,
    cashMode: venue.cashMode,
    currency: venue.currency
  });

  if (!ins.ok) {
    if (ins.alreadyExists) {
      await Helpers.safeSend(chatId, 'ℹ️ Цю касу вже зафіксовано раніше.');
    } else {
      await Helpers.safeSend(
        chatId,
        '❌ Не вдалося зберегти. Накати міграцію supabase_migration_coach_cash_settlements.sql у Supabase.'
      );
    }
  } else {
    await Helpers.safeSend(chatId, '✅ Розрахунок з клубом зафіксовано.');
  }

  await State.update(chatId, { step: null });
  await showGroupVenueMonth(chatId, ym, vk);
  return true;
}

async function showVenueDay(chatId, ymd, venueKey) {
  if (!(await ensureCoach(chatId))) return;
  const dateYmd = String(ymd || '').slice(0, 10);
  const vk = String(venueKey || 'none');
  const { venue, closed } = await findVenuePlan(chatId, dateYmd, vk);
  if (!venue) {
    await Helpers.safeSend(chatId, '⚠️ Даних по цьому залу за день немає.');
    return showDayVenues(chatId, dateYmd);
  }

  const title = await venueTitle(vk);
  let text = '💰 ' + title + '\n📅 ' + Calc.ymdToUa(dateYmd) + '\n\n';
  text += 'Сесій: ' + venue.sessionsCount + '\n';
  text += 'Валовий: ' + Calc.moneyLabel(venue.gross, venue.currency) + '\n';
  text += 'Плата залу: ' + Calc.moneyLabel(venue.venueShare, venue.currency) + '\n';
  text += 'Після залу: ' + Calc.moneyLabel(venue.net, venue.currency) + '\n\n';
  text += cashModeHint(venue.cashMode) + '\n';
  text += 'Сума до фіксації: ' + Calc.moneyLabel(venue.planAmount, venue.currency) + '\n';

  const breakdown = await formatClientLines(venue.clientLines, venue.currency);
  if (breakdown) text += '\nПо клієнтах (якщо сума не збігається):\n' + breakdown + '\n';

  const keyboard = [];

  if (closed) {
    text +=
      '\n✅ Розрахунок з клубом зафіксовано.\n' +
      'Розрахунок: ' +
      Calc.moneyLabel(closed.planAmount, closed.currency) +
      ' · Підтвердив: ' +
      Calc.moneyLabel(closed.factAmount, closed.currency);
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_SESS_DAY + ':' + dateYmd }]);
  } else if (!venue.canClose) {
    text += '\n⚠️ Неможливо зафіксувати — доповни «Умови залів».';
    keyboard.push([{ text: '🏋️ Умови залів', callback_data: CONSTANTS.CALLBACKS.VECON_HUB }]);
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_SESS_DAY + ':' + dateYmd }]);
  } else {
    text += '\nНадішли суму після розрахунку з клубом (одне число).';
    await State.update(chatId, {
      step: CONSTANTS.FSM_STATES.CASH_SESSION_FACT_INPUT,
      cashYmd: dateYmd,
      cashVenueKey: vk
    });
    keyboard.push([{ text: '⬅️ До списку залів', callback_data: CB.CASH_SESS_DAY + ':' + dateYmd }]);
  }

  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Каса', callback_data: CB.CASH_HUB }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askSessionDate(chatId) {
  if (!(await ensureCoach(chatId))) return;
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.CASH_SESSION_DATE_INPUT });
  await Helpers.sendKeyboard(
    chatId,
    '💰 Каса\n\nВведи дату у форматі ДД.ММ.РРРР (наприклад 19.11.2026).',
    [[{ text: '⬅️ Назад', callback_data: CB.CASH_SESS }]]
  );
}

async function handleFactInput(chatId, text) {
  const state = (await State.get(chatId)) || {};
  const dateYmd = String(state.cashYmd || '').slice(0, 10);
  const vk = String(state.cashVenueKey || 'none');
  const fact = parseMoney(text);
  if (fact == null) {
    await Helpers.safeSend(chatId, '⚠️ Введи додатне число (наприклад 300 або 300.50).');
    return true;
  }

  const { venue, closed } = await findVenuePlan(chatId, dateYmd, vk);
  if (closed) {
    await State.update(chatId, { step: null });
    await showVenueDay(chatId, dateYmd, vk);
    return true;
  }
  if (!venue || !venue.canClose) {
    await Helpers.safeSend(chatId, '⚠️ Неможливо зафіксувати — перевір «Умови залів».');
    return true;
  }

  const plan = Calc.round2(venue.planAmount);
  if (fact !== plan) {
    const lines = await formatClientLines(venue.clientLines, venue.currency);
    await Helpers.safeSend(
      chatId,
      '❌ Сума не збігається з розрахунком (' +
        Calc.moneyLabel(plan, venue.currency) +
        ').\n' +
        'Фіксацію заблоковано. Перевір оплати по клієнтах:\n\n' +
        lines
    );
    return true;
  }

  const ins = await supabase.insertCashSettlementIfAbsent({
    coachChatId: chatId,
    venueId: vk,
    businessDate: dateYmd,
    kind: 'sessions',
    planAmount: plan,
    factAmount: fact,
    cashMode: venue.cashMode,
    currency: venue.currency
  });

  if (!ins.ok) {
    if (ins.alreadyExists) {
      await Helpers.safeSend(chatId, 'ℹ️ Цю касу вже зафіксовано раніше.');
    } else {
      await Helpers.safeSend(
        chatId,
        '❌ Не вдалося зберегти. Накати міграцію supabase_migration_coach_cash_settlements.sql у Supabase.'
      );
    }
  } else {
    await Helpers.safeSend(chatId, '✅ Розрахунок з клубом зафіксовано.');
  }

  await State.update(chatId, { step: null });
  await showVenueDay(chatId, dateYmd, vk);
  return true;
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();

  if (action === CB.CASH_HUB) {
    await showHub(chatId);
    return true;
  }
  if (action === CB.CASH_SESS) {
    await showSessionsHub(chatId);
    return true;
  }
  if (action === CB.CASH_SESS_TODAY) {
    await showDayVenues(chatId, Calc.dateKey(new Date()));
    return true;
  }
  if (action === CB.CASH_SESS_DATE) {
    await askSessionDate(chatId);
    return true;
  }
  if (action === CB.CASH_SESS_DAY) {
    await showDayVenues(chatId, param);
    return true;
  }
  if (action === CB.CASH_VENUE) {
    const segs = param.split(':');
    const dateYmd = segs[0];
    const vk = segs.slice(1).join(':') || 'none';
    await showVenueDay(chatId, dateYmd, vk);
    return true;
  }
  if (action === CB.CASH_GROUP) {
    await showGroupHub(chatId);
    return true;
  }
  if (action === CB.CASH_GROUP_THIS_MONTH) {
    await showGroupMonthVenues(chatId, Calc.currentYearMonth());
    return true;
  }
  if (action === CB.CASH_GROUP_MONTH_PICK) {
    await askGroupMonth(chatId);
    return true;
  }
  if (action === CB.CASH_GROUP_MONTH) {
    await showGroupMonthVenues(chatId, param);
    return true;
  }
  if (action === CB.CASH_GRP_VENUE) {
    const segs = param.split(':');
    if (segs.length < 2) return true;
    const ym = segs[0] + '-' + segs[1];
    const vk = segs.slice(2).join(':') || 'none';
    await showGroupVenueMonth(chatId, ym, vk);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;

  if (state.step === CONSTANTS.FSM_STATES.CASH_SESSION_DATE_INPUT) {
    const ymd = parseUaDateToYmd(text);
    if (!ymd) {
      await Helpers.safeSend(chatId, '⚠️ Некоректна дата. Формат: ДД.ММ.РРРР');
      return true;
    }
    await State.update(chatId, { step: null });
    await showDayVenues(chatId, ymd);
    return true;
  }

  if (state.step === CONSTANTS.FSM_STATES.CASH_SESSION_FACT_INPUT) {
    return handleFactInput(chatId, text);
  }

  if (state.step === CONSTANTS.FSM_STATES.CASH_GROUP_MONTH_INPUT) {
    const ym = parseMonthMmYyyy(text);
    if (!ym) {
      await Helpers.safeSend(chatId, '⚠️ Некоректний місяць. Формат: ММ.РРРР');
      return true;
    }
    await State.update(chatId, { step: null });
    await showGroupMonthVenues(chatId, ym);
    return true;
  }

  if (state.step === CONSTANTS.FSM_STATES.CASH_GROUP_FACT_INPUT) {
    return handleGroupFactInput(chatId, text);
  }

  return false;
}

module.exports = {
  showHub,
  handleCallback,
  handleTextMessage
};