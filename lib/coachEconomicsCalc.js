/**
 * Розрахунки економіки тренера з залом (крок 3):
 * факт COMPLETED + план BOOKED + групові абонементи (місяць start_date).
 */
const { CONSTANTS } = require('./constants');

function round2(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.round(x * 100) / 100;
}

function moneyLabel(amount, currency) {
  const cur = String(currency || 'UAH').toUpperCase() === 'UAH' ? 'грн' : String(currency || 'UAH');
  return round2(amount) + ' ' + cur;
}

function dateKey(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function ymdToUa(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (s.length < 10) return s || '—';
  const [y, m, d] = s.split('-');
  return d + '.' + m + '.' + y;
}

function normalizeTrainingType(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (t === CONSTANTS.TRAINING_TYPES.SPLIT || t === 'SPLIT') return CONSTANTS.TRAINING_TYPES.SPLIT;
  if (t === CONSTANTS.TRAINING_TYPES.TRIO || t === 'TRIO') return CONSTANTS.TRAINING_TYPES.TRIO;
  if (t === CONSTANTS.TRAINING_TYPES.PERSONAL || t === 'PERSONAL') return CONSTANTS.TRAINING_TYPES.PERSONAL;
  return CONSTANTS.TRAINING_TYPES.PERSONAL;
}

function sessionParticipants(type) {
  if (type === CONSTANTS.TRAINING_TYPES.SPLIT) return 2;
  if (type === CONSTANTS.TRAINING_TYPES.TRIO) return 3;
  return 1;
}

/**
 * Частка залу з однієї сесії (indiv/split/trio).
 * @returns {{ share: number|null, reason: string }}
 */
function calcSessionVenueShare(sessionGross, trainingType, eco) {
  if (!eco || eco.sessionMode === 'unset' || !eco.sessionMode) {
    return { share: null, reason: 'unset' };
  }
  const type = normalizeTrainingType(trainingType);
  if (eco.sessionMode === 'percent') {
    if (eco.sessionPercent == null || Number.isNaN(Number(eco.sessionPercent))) {
      return { share: null, reason: 'unset' };
    }
    return { share: round2((Number(sessionGross) || 0) * (Number(eco.sessionPercent) / 100)), reason: 'percent' };
  }
  if (eco.sessionMode === 'fixed') {
    let fixed = null;
    if (type === CONSTANTS.TRAINING_TYPES.SPLIT) fixed = eco.sessionFixedSplit;
    else if (type === CONSTANTS.TRAINING_TYPES.TRIO) fixed = eco.sessionFixedTrio;
    else fixed = eco.sessionFixedPersonal;
    if (fixed == null || Number.isNaN(Number(fixed))) return { share: null, reason: 'unset' };
    return { share: round2(Number(fixed)), reason: 'fixed' };
  }
  return { share: null, reason: 'unset' };
}

/**
 * Частка залу від оплати групового абонемента (режим percent_subs).
 */
function calcGroupSubVenueShare(amountPaid, eco) {
  if (!eco || eco.groupMode !== 'percent_subs') {
    return { share: null, reason: eco && eco.groupMode === 'fixed_per_attendee' ? 'fixed_needs_visits' : 'unset' };
  }
  if (eco.groupPercent == null || Number.isNaN(Number(eco.groupPercent))) {
    return { share: null, reason: 'unset' };
  }
  return { share: round2((Number(amountPaid) || 0) * (Number(eco.groupPercent) / 100)), reason: 'percent_subs' };
}

/**
 * Групує слоти в «сесії» (один слот часу × тип × зал).
 * Для split/trio кілька student-рядків = одна сесія.
 */
function groupSlotsIntoSessions(slots) {
  const map = new Map();
  for (const s of slots || []) {
    if (!s) continue;
    const dk = dateKey(s.date);
    const time = String(s.time || '').trim();
    const type = normalizeTrainingType(s.trainingType);
    const venueKey = s.venueId ? String(s.venueId) : 'none';
    const key = dk + '|' + time + '|' + type + '|' + venueKey;
    if (!map.has(key)) {
      map.set(key, {
        key,
        dateKey: dk,
        time,
        trainingType: type,
        venueId: s.venueId || null,
        currency: s.currency || 'UAH',
        slots: []
      });
    }
    map.get(key).slots.push(s);
  }
  return Array.from(map.values());
}

/**
 * Фактичний звіт по сесіях + частка залу.
 * economicsByVenueId: Map/object venueId → eco
 * fallbackVenueId: якщо у слота немає venue і в тренера один зал «де треную»
 */
function buildFactSessionReport(slots, economicsByVenueId, fallbackVenueId) {
  const sessions = groupSlotsIntoSessions(slots);
  const warnings = [];
  let grossTotal = 0;
  let venueShareTotal = 0;
  let netTotal = 0;
  let sessionsCounted = 0;
  let missingPrice = 0;
  let missingEcoVenues = new Set();
  const byVenue = {};
  const byStudent = {};

  for (const sess of sessions) {
    const venueId = sess.venueId || fallbackVenueId || null;
    const eco = venueId ? economicsByVenueId[String(venueId)] || null : null;
    let sessionGross = 0;
    let priced = 0;
    for (const sl of sess.slots) {
      if (sl.priceCharged != null && !Number.isNaN(Number(sl.priceCharged))) {
        sessionGross += Number(sl.priceCharged);
        priced++;
      }
    }
    sessionGross = round2(sessionGross);
    if (priced === 0) {
      missingPrice++;
      continue;
    }
    sessionsCounted++;
    grossTotal = round2(grossTotal + sessionGross);

    let share = 0;
    let shareKnown = true;
    if (!venueId) {
      share = 0;
    } else {
      const calc = calcSessionVenueShare(sessionGross, sess.trainingType, eco);
      if (calc.share == null) {
        shareKnown = false;
        missingEcoVenues.add(String(venueId));
        share = 0;
      } else {
        share = calc.share;
      }
    }
    venueShareTotal = round2(venueShareTotal + share);
    const net = round2(sessionGross - share);
    netTotal = round2(netTotal + net);

    const vKey = venueId || 'none';
    if (!byVenue[vKey]) byVenue[vKey] = { gross: 0, share: 0, net: 0, sessions: 0, missingEco: false };
    byVenue[vKey].gross = round2(byVenue[vKey].gross + sessionGross);
    byVenue[vKey].share = round2(byVenue[vKey].share + share);
    byVenue[vKey].net = round2(byVenue[vKey].net + net);
    byVenue[vKey].sessions += 1;
    if (!shareKnown) byVenue[vKey].missingEco = true;

    const n = Math.max(1, sess.slots.length);
    for (const sl of sess.slots) {
      const g =
        sl.priceCharged != null && !Number.isNaN(Number(sl.priceCharged))
          ? Number(sl.priceCharged)
          : round2(sessionGross / n);
      const sid = sl.studentId ? String(sl.studentId) : 'unknown';
      if (!byStudent[sid]) byStudent[sid] = { gross: 0, share: 0, net: 0 };
      const studentShare = round2(share / n);
      byStudent[sid].gross = round2(byStudent[sid].gross + g);
      byStudent[sid].share = round2(byStudent[sid].share + studentShare);
      byStudent[sid].net = round2(byStudent[sid].net + (g - studentShare));
    }
  }

  if (missingPrice > 0) {
    warnings.push('Сесій без записаної вартості: ' + missingPrice + ' (налаштуй «Вартість тренувань»).');
  }
  for (const vid of missingEcoVenues) {
    warnings.push('Немає умов залу для закладу — додай у «Умови залів».');
    break;
  }

  return {
    sessionsCounted,
    grossTotal,
    venueShareTotal,
    netTotal,
    byVenue,
    byStudent,
    warnings,
    missingEcoVenueIds: Array.from(missingEcoVenues)
  };
}

/**
 * Плановий звіт: майбутні BOOKED + прайс (без прайсу → 0 + warning).
 * slotPriceResolver(slot) → { pricePerStudent, currency, fullSessionPrice } | null
 */
function buildPlanSessionReport(slots, economicsByVenueId, fallbackVenueId, slotPriceResolver) {
  const enriched = [];
  const warnings = [];
  let missingPrice = 0;
  for (const s of slots || []) {
    const type = normalizeTrainingType(s.trainingType);
    const resolved = typeof slotPriceResolver === 'function' ? slotPriceResolver(s) : null;
    if (!resolved || resolved.pricePerStudent == null) {
      missingPrice++;
      enriched.push({
        ...s,
        trainingType: type,
        priceCharged: 0,
        currency: (resolved && resolved.currency) || s.currency || 'UAH',
        venueId: s.venueId || fallbackVenueId || null
      });
      continue;
    }
    enriched.push({
      ...s,
      trainingType: type,
      priceCharged: resolved.pricePerStudent,
      currency: resolved.currency || 'UAH',
      venueId: s.venueId || fallbackVenueId || null
    });
  }
  if (missingPrice > 0) {
    warnings.push(
      'Слотів без прайсу: ' + missingPrice + ' (у плані = 0 грн). Налаштуй «Вартість тренувань».'
    );
  }
  const factLike = buildFactSessionReport(enriched, economicsByVenueId, fallbackVenueId);
  factLike.warnings = warnings.concat(factLike.warnings || []);
  return factLike;
}

/**
 * Групові абонементи → gross оплат + частка залу (percent_subs).
 */
function buildGroupSubsReport(subs, economicsByVenueId) {
  let grossTotal = 0;
  let venueShareTotal = 0;
  let netTotal = 0;
  const byVenue = {};
  const warnings = [];
  let fixedModeSkipped = 0;

  for (const sub of subs || []) {
    const amount = Number(sub.amountPaid) || 0;
    const venueId = sub.venueId ? String(sub.venueId) : null;
    const eco = venueId ? economicsByVenueId[venueId] || null : null;
    grossTotal = round2(grossTotal + amount);
    const calc = calcGroupSubVenueShare(amount, eco);
    let share = 0;
    if (calc.reason === 'fixed_needs_visits') {
      fixedModeSkipped++;
      share = 0;
    } else if (calc.share == null) {
      if (venueId) {
        warnings.push('Групові: немає % залу для одного з закладів (Умови залів).');
      }
      share = 0;
    } else {
      share = calc.share;
    }
    venueShareTotal = round2(venueShareTotal + share);
    netTotal = round2(netTotal + (amount - share));
    const vKey = venueId || 'none';
    if (!byVenue[vKey]) byVenue[vKey] = { gross: 0, share: 0, net: 0, count: 0 };
    byVenue[vKey].gross = round2(byVenue[vKey].gross + amount);
    byVenue[vKey].share = round2(byVenue[vKey].share + share);
    byVenue[vKey].net = round2(byVenue[vKey].net + (amount - share));
    byVenue[vKey].count += 1;
  }
  if (fixedModeSkipped > 0) {
    warnings.push(
      'Групові (плата залу × відвідувач): ' +
        fixedModeSkipped +
        ' абонемент(ів) — облік візитів ще не в звітах; у % від оплат рахується окремий режим.'
    );
  }
  // unique warnings
  const uniq = [];
  for (const w of warnings) {
    if (uniq.indexOf(w) === -1) uniq.push(w);
  }
  return { grossTotal, venueShareTotal, netTotal, byVenue, warnings: uniq, count: (subs || []).length };
}

/**
 * План каси за день по залах (етап 2): лише COMPLETED-слоти за ymd.
 * planAmount залежить від sessionCashMode: coach → частка залу; venue → після залу.
 * clientLines — сума «здачі/отримання» по клієнту (не валовий).
 */
function buildCashSessionVenuePlans(slots, economicsByVenueId, fallbackVenueId, ymd) {
  const target = String(ymd || '').slice(0, 10);
  const daySlots = (slots || []).filter((s) => s && dateKey(s.date) === target);
  const sessions = groupSlotsIntoSessions(daySlots);
  const warnings = [];
  const venueMap = {};

  for (const sess of sessions) {
    const venueId = sess.venueId || fallbackVenueId || null;
    const venueKey = venueId ? String(venueId) : 'none';
    const eco = venueId ? economicsByVenueId[String(venueId)] || null : null;
    const cashMode = eco && eco.sessionCashMode ? String(eco.sessionCashMode) : 'unset';

    let sessionGross = 0;
    let priced = 0;
    for (const sl of sess.slots) {
      if (sl.priceCharged != null && !Number.isNaN(Number(sl.priceCharged))) {
        sessionGross += Number(sl.priceCharged);
        priced++;
      }
    }
    sessionGross = round2(sessionGross);
    if (priced === 0) continue;

    let share = 0;
    let shareKnown = true;
    if (!venueId) {
      share = 0;
    } else {
      const calc = calcSessionVenueShare(sessionGross, sess.trainingType, eco);
      if (calc.share == null) {
        shareKnown = false;
        share = 0;
      } else {
        share = calc.share;
      }
    }
    const net = round2(sessionGross - share);

    if (!venueMap[venueKey]) {
      venueMap[venueKey] = {
        venueKey,
        venueId,
        gross: 0,
        venueShare: 0,
        net: 0,
        planAmount: 0,
        cashMode: cashMode === 'coach' || cashMode === 'venue' ? cashMode : 'unset',
        canClose: true,
        clientAmounts: {},
        sessionsCount: 0,
        currency: sess.currency || 'UAH',
        missingEco: false,
        missingCashMode: false
      };
    }
    const bucket = venueMap[venueKey];
    bucket.gross = round2(bucket.gross + sessionGross);
    bucket.venueShare = round2(bucket.venueShare + share);
    bucket.net = round2(bucket.net + net);
    bucket.sessionsCount += 1;
    if (!shareKnown) bucket.missingEco = true;

    const modeForPlan = bucket.cashMode;
    if (modeForPlan === 'coach') {
      bucket.planAmount = round2(bucket.planAmount + share);
    } else if (modeForPlan === 'venue') {
      bucket.planAmount = round2(bucket.planAmount + net);
    } else {
      bucket.missingCashMode = true;
    }

    const n = Math.max(1, sess.slots.length);
    for (const sl of sess.slots) {
      const sid = sl.studentId ? String(sl.studentId) : 'unknown';
      const g =
        sl.priceCharged != null && !Number.isNaN(Number(sl.priceCharged))
          ? Number(sl.priceCharged)
          : round2(sessionGross / n);
      const studentShare = round2(share / n);
      let transfer = 0;
      if (modeForPlan === 'coach') transfer = studentShare;
      else if (modeForPlan === 'venue') transfer = round2(g - studentShare);
      else transfer = round2(g);
      if (!bucket.clientAmounts[sid]) bucket.clientAmounts[sid] = 0;
      bucket.clientAmounts[sid] = round2(bucket.clientAmounts[sid] + transfer);
    }
  }

  const venues = [];
  for (const v of Object.values(venueMap)) {
    if (v.missingEco) {
      warnings.push('Заклад без умов сесій — налаштуй «Умови залів».');
      v.canClose = false;
    }
    if (v.missingCashMode || v.cashMode === 'unset') {
      warnings.push('Не обрано «Хто бере оплату (сесії)» — відкрий «Умови залів».');
      v.canClose = false;
    }
    const clientLines = Object.keys(v.clientAmounts).map((studentId) => ({
      studentId,
      amount: v.clientAmounts[studentId]
    }));
    clientLines.sort((a, b) => b.amount - a.amount);
    venues.push({
      venueKey: v.venueKey,
      venueId: v.venueId,
      gross: v.gross,
      venueShare: v.venueShare,
      net: v.net,
      planAmount: v.planAmount,
      cashMode: v.cashMode,
      canClose: v.canClose,
      clientLines,
      sessionsCount: v.sessionsCount,
      currency: v.currency
    });
  }
  venues.sort((a, b) => String(a.venueKey).localeCompare(String(b.venueKey)));
  const uniqWarn = [];
  for (const w of warnings) {
    if (uniqWarn.indexOf(w) === -1) uniqWarn.push(w);
  }
  return { venues, warnings: uniqWarn };
}

module.exports = {
  round2,
  moneyLabel,
  dateKey,
  ymdToUa,
  normalizeTrainingType,
  sessionParticipants,
  calcSessionVenueShare,
  calcGroupSubVenueShare,
  groupSlotsIntoSessions,
  buildFactSessionReport,
  buildPlanSessionReport,
  buildGroupSubsReport,
  buildCashSessionVenuePlans
};
