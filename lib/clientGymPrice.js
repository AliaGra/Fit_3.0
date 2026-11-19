/**
 * Етап 6 — клієнтська прозорість: ціна тренера + політика клубу по закладу.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function normalizeClientGymPolicy(raw) {
  const v = String(raw || 'unset').trim().toLowerCase();
  const allowed = CONSTANTS.CLIENT_GYM_POLICIES || {};
  if (v === allowed.INCLUDED) return allowed.INCLUDED;
  if (v === allowed.HINT) return allowed.HINT;
  if (v === allowed.OWN_MEMBERSHIP) return allowed.OWN_MEMBERSHIP;
  return allowed.UNSET;
}

function moneyUa(amount, currency) {
  const cur = String(currency || 'UAH').toUpperCase() === 'UAH' ? 'грн' : String(currency || 'UAH');
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return s + ' ' + cur;
}

function pricingAmountIsSet(value) {
  if (value == null || value === '') return false;
  const n = parseFloat(value);
  return !Number.isNaN(n) && n >= 0;
}

function formatTrainerPriceLines(pricing) {
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  if (!pricing) return [];
  const cur = pricing.currency || 'UAH';
  const lines = [];
  if (pricingAmountIsSet(pricing.pricePersonal)) {
    lines.push('• Персональна: ' + moneyUa(pricing.pricePersonal, cur));
  }
  if (pricingAmountIsSet(pricing.priceSplit)) {
    lines.push('• Спліт (2 особи): ' + moneyUa(pricing.priceSplit, cur) + ' — за обох');
  }
  if (pricingAmountIsSet(pricing.priceTrio)) {
    lines.push('• Тріо (3 особи): ' + moneyUa(pricing.priceTrio, cur) + ' — за трьох');
  }
  return lines;
}

function policyLabelUa(policy) {
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  const p = normalizeClientGymPolicy(policy);
  if (p === P.INCLUDED) return 'клуб включено в умови тренера';
  if (p === P.HINT) return 'клуб окремо (ціна на картці)';
  if (p === P.OWN_MEMBERSHIP) return 'клуб — за вашим абонементом';
  return 'не обрано';
}

function formatVenueGymLineHtml(venueName, eco) {
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  if (!eco) return '';
  const policy = normalizeClientGymPolicy(eco.clientGymPolicy);
  if (policy === P.UNSET) return '';
  const vname = Helpers.escapeHtml(String(venueName || 'Заклад').trim());
  if (policy === P.INCLUDED) {
    return (
      '  <i>' +
      vname +
      ': вхід у клуб включено в оплату тренеру (за умовами тренера).</i>\n'
    );
  }
  if (policy === P.HINT) {
    const txt =
      eco.clientGymHintText && String(eco.clientGymHintText).trim()
        ? Helpers.escapeHtml(String(eco.clientGymHintText).trim())
        : 'вхід/аренда клубу оплачується окремо від тренера; вартість — на картці закладу.';
    return '  <i>' + vname + ': ' + txt + '</i>\n';
  }
  if (policy === P.OWN_MEMBERSHIP) {
    return (
      '  <i>' +
      vname +
      ': клуб — за вашим абонементом. Абонементи див. на картці закладу.</i>\n'
    );
  }
  return '';
}

/**
 * HTML-блок для картки тренера (клієнт / публічний перегляд).
 * @param {string} coachChatId
 * @param {{ studentChatId?: string }} options
 */
async function buildCoachClientPricingHtmlBlock(coachChatId, options = {}) {
  const cid = String(coachChatId || '').trim();
  if (!cid) return '';
  const studentId = options.studentChatId ? String(options.studentChatId).trim() : '';
  let pricing = null;
  if (studentId) {
    pricing = await supabase.getStudentPricing(cid, studentId);
  }
  if (!pricing) pricing = await supabase.getCoachPricing(cid);
  const priceLines = formatTrainerPriceLines(pricing);
  const venues = (await supabase.getCoachVenuesWhereTeach(cid)) || [];
  const active = venues.filter((v) => v && v.isActive !== false);
  const economics = await supabase.listCoachVenueEconomics(cid);
  const ecoByVenue = new Map((economics || []).map((e) => [String(e.venueId), e]));
  const gymLines = [];
  for (const v of active) {
    const eco = ecoByVenue.get(String(v.id));
    const line = formatVenueGymLineHtml(v.nameUa || v.name || 'Заклад', eco);
    if (line) gymLines.push(line);
  }
  if (!priceLines.length && !gymLines.length) return '';
  let block = '\n💰 <b>Вартість тренувань</b>\n';
  if (priceLines.length) {
    for (const l of priceLines) {
      block += Helpers.escapeHtml(l) + '\n';
    }
  } else {
    block += '<i>Прайс тренера ще не вказано — уточни у тренера.</i>\n';
  }
  if (gymLines.length) {
    block += '\n🏋 <b>Клуб</b> (орієнтовно, не оферта):\n' + gymLines.join('');
  } else if (active.length) {
    block += '\n<i>Щодо оплати клубу — уточни у тренера.</i>\n';
  }
  return block;
}

/** Кнопки «Абонементи клубу» для картки тренера */
async function membershipButtonsForCoachCard(coachChatId) {
  const cid = String(coachChatId || '').trim();
  const economics = await supabase.listCoachVenueEconomics(cid);
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  const venues = (await supabase.getCoachVenuesWhereTeach(cid)) || [];
  const nameById = new Map(venues.map((v) => [String(v.id), (v.nameUa || v.name || 'Заклад').trim()]));
  const rows = [];
  for (const eco of economics || []) {
    const pol = normalizeClientGymPolicy(eco.clientGymPolicy);
    if (pol !== P.OWN_MEMBERSHIP && pol !== P.HINT) continue;
    const vid = String(eco.venueId);
    const prefix = pol === P.OWN_MEMBERSHIP ? '🎫 Абонементи — ' : '💰 Ціни клубу — ';
    let label = prefix + (nameById.get(vid) || 'заклад');
    if (label.length > 64) label = label.slice(0, 61) + '…';
    rows.push([
      {
        text: label,
        callback_data: CONSTANTS.CALLBACKS.VENUES_PRICES + ':' + vid
      }
    ]);
  }
  return rows;
}

/**
 * Коротка підказка після запису на слот (personal за замовч.).
 * @returns {Promise<string>} plain text or ''
 */
async function buildSlotBookingPriceNote(studentChatId, coachId, slotVenueId) {
  const coach = String(coachId || '').trim();
  const student = String(studentChatId || '').trim();
  if (!coach) return '';
  let venueId = slotVenueId ? String(slotVenueId).trim() : '';
  if (!venueId) {
    const venues = (await supabase.getCoachVenuesWhereTeach(coach)) || [];
    const active = venues.filter((v) => v && v.isActive !== false);
    if (active.length === 1) venueId = String(active[0].id);
  }
  let pricing = await supabase.getStudentPricing(coach, student);
  if (!pricing) pricing = await supabase.getCoachPricing(coach);
  const lines = formatTrainerPriceLines(pricing);
  const personal =
    pricing && pricingAmountIsSet(pricing.pricePersonal)
      ? moneyUa(pricing.pricePersonal, pricing.currency)
      : lines.length
        ? null
        : null;
  let eco = null;
  let venueName = 'клуб';
  if (venueId) {
    eco = await supabase.getCoachVenueEconomics(coach, venueId);
    const v = await supabase.getVenueById(venueId);
    if (v) venueName = (v.nameUa || v.name || 'клуб').trim();
  }
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  const policy = eco ? normalizeClientGymPolicy(eco.clientGymPolicy) : P.UNSET;
  let out = '\n\n💡 Орієнтовно';
  if (personal) out += ': тренер ' + personal;
  else if (lines.length) out += ' (прайс тренера — на картці «Мій тренер»)';
  else out += ' — прайс уточни у тренера';
  if (policy === P.INCLUDED) {
    out += '; ' + venueName + ' — у ціні тренера.';
  } else if (policy === P.HINT) {
    out +=
      '; ' +
      venueName +
      ' — окремо (вхід/аренда клубу; див. ціни на картці закладу).';
  } else if (policy === P.OWN_MEMBERSHIP) {
    out += '; ' + venueName + ' — за вашим абонементом (ціни на картці закладу).';
  } else if (venueId) {
    out += '.';
  }
  out += ' Не оферта.';
  return out;
}

function parseClientGymHintInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*[-–—:]\s*(.+)$/);
  if (m) {
    const amt = parseFloat(m[1].replace(',', '.'));
    if (!Number.isNaN(amt) && amt >= 0) {
      return { amount: Math.round(amt * 100) / 100, hintText: m[2].trim() };
    }
  }
  const m2 = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (m2) {
    const amt = parseFloat(m2[1].replace(',', '.'));
    if (!Number.isNaN(amt) && amt >= 0 && m2[2].length > 3) {
      return { amount: Math.round(amt * 100) / 100, hintText: m2[2].trim() };
    }
  }
  return { amount: null, hintText: raw };
}

function formatCoachClientPolicySummary(eco) {
  const P = CONSTANTS.CLIENT_GYM_POLICIES;
  const policy = normalizeClientGymPolicy(eco && eco.clientGymPolicy);
  if (policy === P.UNSET) return '• Для клієнта: ще не налаштовано';
  if (policy === P.INCLUDED) return '• Для клієнта: клуб у ціні тренера';
  if (policy === P.HINT) {
    return '• Для клієнта: клуб окремо — ціна тренера + оренда/вхід (ціни на картці клубу)';
  }
  if (policy === P.OWN_MEMBERSHIP) return '• Для клієнта: свій абонемент клубу';
  return '• Для клієнта: —';
}

module.exports = {
  normalizeClientGymPolicy,
  formatTrainerPriceLines,
  formatVenueGymLineHtml,
  buildCoachClientPricingHtmlBlock,
  membershipButtonsForCoachCard,
  buildSlotBookingPriceNote,
  parseClientGymHintInput,
  formatCoachClientPolicySummary,
  policyLabelUa
};