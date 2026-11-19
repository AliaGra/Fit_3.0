/**
 * Етап 4: звіт «Після клубу» — розрахунок vs зафіксована Каса.
 */
const Calc = require('./coachEconomicsCalc');
const supabase = require('./supabase');

function monthsInRange(fromYmd, toYmd) {
  const from = String(fromYmd || '').slice(0, 10);
  const to = String(toYmd || '').slice(0, 10);
  if (from.length < 10 || to.length < 10) return [];
  const partsF = from.split('-').map((x) => parseInt(x, 10));
  const partsT = to.split('-').map((x) => parseInt(x, 10));
  const start = new Date(partsF[0], partsF[1] - 1, partsF[2]);
  const end = new Date(partsT[0], partsT[1] - 1, partsT[2]);
  const set = new Set();
  const cur = new Date(start);
  while (cur <= end) {
    set.add(Calc.dateKey(cur).slice(0, 7));
    cur.setDate(cur.getDate() + 1);
  }
  return Array.from(set).sort();
}

function venueLabel(venueNames, venueKey) {
  const vk = String(venueKey || 'none');
  return (venueNames && venueNames[vk]) || (vk === 'none' ? 'Без клубу' : vk);
}

/**
 * @returns {Promise<string>} блок тексту для append у sendNetReport (може бути '').
 */
async function buildCashReconcileSection(coachChatId, ctx) {
  const fromYmd = String(ctx.fromYmd || '').slice(0, 10);
  const toYmd = String(ctx.toYmd || '').slice(0, 10);
  const slots = ctx.slots || [];
  const groupSubs = ctx.groupSubs || [];
  const ecoMap = ctx.ecoMap || {};
  const fallbackVenueId = ctx.fallbackVenueId || null;
  const venueNames = ctx.venueNames || {};

  const settlements = await supabase.listCashSettlementsByCoachPeriod(coachChatId, fromYmd, toYmd);
  const sessClosed = new Map();
  const grpClosed = new Map();
  let sessFixedSum = 0;
  let grpFixedSum = 0;
  for (const s of settlements) {
    if (s.kind === 'sessions') {
      const k = String(s.businessDate).slice(0, 10) + '|' + String(s.venueId);
      sessClosed.set(k, s);
      sessFixedSum = Calc.round2(sessFixedSum + Number(s.factAmount) || 0);
    } else if (s.kind === 'group_month') {
      const ym = String(s.businessDate).slice(0, 7);
      const k = ym + '|' + String(s.venueId);
      grpClosed.set(k, s);
      grpFixedSum = Calc.round2(grpFixedSum + Number(s.factAmount) || 0);
    }
  }

  const byDay = {};
  for (const sl of slots) {
    const dk = Calc.dateKey(sl.date);
    if (!dk || dk < fromYmd || dk > toYmd) continue;
    if (!byDay[dk]) byDay[dk] = [];
    byDay[dk].push(sl);
  }

  let sessPlanSum = 0;
  let neededSess = 0;
  let doneSess = 0;
  const sessLines = [];

  for (const dk of Object.keys(byDay).sort()) {
    const plan = Calc.buildCashSessionVenuePlans(byDay[dk], ecoMap, fallbackVenueId, dk);
    for (const v of plan.venues || []) {
      if (!v.canClose) continue;
      neededSess++;
      sessPlanSum = Calc.round2(sessPlanSum + v.planAmount);
      const k = dk + '|' + String(v.venueKey);
      const closed = sessClosed.get(k);
      const title = venueLabel(venueNames, v.venueKey);
      if (closed) {
        doneSess++;
        sessLines.push({
          ok: true,
          text: '✅ ' + Calc.ymdToUa(dk) + ' · ' + title + ' — ' + Calc.moneyLabel(closed.factAmount)
        });
      } else {
        sessLines.push({
          ok: false,
          text: '⬜ ' + Calc.ymdToUa(dk) + ' · ' + title + ' — не оплачено (розрах. ' + Calc.moneyLabel(v.planAmount) + ')'
        });
      }
    }
  }

  const months = monthsInRange(fromYmd, toYmd);
  const subsByMonth = {};
  for (const sub of groupSubs) {
    const st = String(sub.startDate || '').slice(0, 10);
    if (!st) continue;
    const ym = st.slice(0, 7);
    if (!subsByMonth[ym]) subsByMonth[ym] = [];
    subsByMonth[ym].push(sub);
  }

  let grpPlanSum = 0;
  let neededGrp = 0;
  let doneGrp = 0;
  const grpLines = [];

  for (const ym of months) {
    const subs = subsByMonth[ym] || [];
    if (!subs.length) continue;
    const plan = Calc.buildCashGroupVenuePlans(subs, ecoMap);
    for (const v of plan.venues || []) {
      if (!v.subsCount) continue;
      const title = venueLabel(venueNames, v.venueKey);
      if (!v.canClose) {
        grpLines.push({
          ok: false,
          text: '⚠️ ' + Calc.ymToUa(ym) + ' · ' + title + ' — немає умов / % (Каса)'
        });
        continue;
      }
      neededGrp++;
      grpPlanSum = Calc.round2(grpPlanSum + v.planAmount);
      const k = ym + '|' + String(v.venueKey);
      const closed = grpClosed.get(k);
      if (closed) {
        doneGrp++;
        grpLines.push({
          ok: true,
          text: '✅ ' + Calc.ymToUa(ym) + ' · ' + title + ' — ' + Calc.moneyLabel(closed.factAmount)
        });
      } else {
        grpLines.push({
          ok: false,
          text: '⬜ ' + Calc.ymToUa(ym) + ' · ' + title + ' — не оплачено (розрах. ' + Calc.moneyLabel(v.planAmount) + ')'
        });
      }
    }
  }

  if (neededSess === 0 && neededGrp === 0 && !sessLines.length && !grpLines.length) {
    return '';
  }

  let block = '\n\n💰 Каса — оплати з клубом\n';
  block += '(Розрахунок vs суми, які ти вже відмітив як оплачені в Касі)\n';

  if (neededSess > 0 || sessLines.length) {
    block += '\nСесії (день × клуб):\n';
    block += '• Розрахунок: ' + Calc.moneyLabel(sessPlanSum) + '\n';
    block += '• Оплачено (у Касі): ' + Calc.moneyLabel(sessFixedSum) + '\n';
    block +=
      '• Статус: ' +
      doneSess +
      ' з ' +
      neededSess +
      ' оплачено' +
      (doneSess === neededSess && neededSess > 0 ? ' ✅' : neededSess > doneSess ? ' ⬜' : '') +
      '\n';
    for (const line of sessLines.slice(-12)) {
      block += line.text + '\n';
    }
    if (sessLines.length > 12) {
      block += '… ще ' + (sessLines.length - 12) + '\n';
    }
  }

  if (neededGrp > 0 || grpLines.length) {
    block += '\nГрупові (місяць × клуб):\n';
    block += '• Розрахунок: ' + Calc.moneyLabel(grpPlanSum) + '\n';
    block += '• Оплачено (у Касі): ' + Calc.moneyLabel(grpFixedSum) + '\n';
    block +=
      '• Статус: ' +
      doneGrp +
      ' з ' +
      neededGrp +
      ' оплачено' +
      (doneGrp === neededGrp && neededGrp > 0 ? ' ✅' : neededGrp > doneGrp ? ' ⬜' : '') +
      '\n';
    for (const line of grpLines.slice(-8)) {
      block += line.text + '\n';
    }
    if (grpLines.length > 8) {
      block += '… ще ' + (grpLines.length - 8) + '\n';
    }
  }

  if (sessPlanSum !== sessFixedSum && neededSess > 0) {
    block += '\nℹ️ Суми сесій: розрахунок і оплачене не збігаються — перевір дні «не оплачено» в Касі.\n';
  }
  if (grpPlanSum !== grpFixedSum && neededGrp > 0) {
    block += '\nℹ️ Суми групових: розрахунок і оплачене не збігаються — перевір місяці в Касі.\n';
  }

  return block;
}

module.exports = {
  buildCashReconcileSection,
  monthsInRange
};