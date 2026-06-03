/**
 * Публічне відображення групових: картка тренера та список групових на картці закладу.
 */
const Helpers = require('./helpers');
const supabase = require('./supabase');

const WD = Object.freeze({ 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' });

function fmtTime(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return m[1].padStart(2, '0') + ':' + m[2];
}

function fmtScheduleInline(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) return '—';
  return arr
    .map((x) => `${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)}`)
    .join(', ');
}

function coachDisplayName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Тренер';
}

function coachLinkHtml(chatId, firstName, lastName) {
  const name = coachDisplayName(firstName, lastName);
  const url = Helpers.publicCoachPageLink(chatId);
  if (url) {
    return `<a href="${Helpers.htmlHrefAttr(url)}">${Helpers.escapeHtml(name)}</a>`;
  }
  return Helpers.escapeHtml(name);
}

function coachLeadsGroup(coachTrainingTypes, hasClassRows) {
  const arr = Array.isArray(coachTrainingTypes) ? coachTrainingTypes : [];
  return arr.includes('group') || !!hasClassRows;
}

/**
 * Блок групових для картки тренера: назви занять + дні/час (coach_group_schedule).
 * @param {string} coachChatId
 * @param {string[]|null} coachTrainingTypes
 * @param {{ groupByVenue?: boolean }} options — groupByVenue: true для повної картки, false — плоский список
 */
async function buildCoachGroupTrainingHtmlBlock(coachChatId, coachTrainingTypes, options = {}) {
  const cid = String(coachChatId || '').trim();
  if (!cid) return '';
  const groupByVenue = options.groupByVenue !== false;
  const venues = (await supabase.getCoachVenuesWhereTeach(cid)) || [];
  const activeVenues = venues.filter((v) => v && v.isActive !== false);
  const venueBlocks = [];
  let hasAnyClass = false;

  for (const v of activeVenues) {
    const classes = await supabase.listCoachGroupClasses(cid, v.id);
    if (!classes.length) continue;
    hasAnyClass = true;
    const coachSchedule = await supabase.listCoachGroupSchedule(cid, v.id);
    const lines = [];
    for (const gc of classes) {
      const code = String(gc.groupClassCode || '');
      const label = Helpers.escapeHtml(gc.labelUa || code);
      const own = coachSchedule.filter((x) => String(x.groupClassCode || '') === code);
      const sched = own.length ? Helpers.escapeHtml(fmtScheduleInline(own)) : '—';
      lines.push(`• ${label}: ${sched}`);
    }
    if (lines.length) {
      if (groupByVenue) {
        venueBlocks.push(`🏢 <b>${Helpers.escapeHtml(v.nameUa || 'Заклад')}</b>\n${lines.join('\n')}`);
      } else {
        venueBlocks.push(...lines);
      }
    }
  }

  if (!coachLeadsGroup(coachTrainingTypes, hasAnyClass)) return '';
  if (!hasAnyClass) {
    return '\n\n🏃 <b>Групові тренування</b>\n<i>Розклад групових ще не заповнено в профілі.</i>\n';
  }
  const body = groupByVenue ? venueBlocks.join('\n\n') : venueBlocks.join('\n');
  return `\n\n🏃 <b>Групові тренування</b>\n${body}\n`;
}

/**
 * Список групових на картці закладу: назва + тренер (ім’я з реєстрації) з посиланням на картку.
 */
async function buildVenueGroupClassesCoachesHtml(venueId, gcFacets, dirGroupMap) {
  const vid = String(venueId || '').trim();
  if (!vid) return '';
  const links = await supabase.listVenueCoachGroupClassLinks(vid);
  const byCode = new Map();
  for (const row of links) {
    const code = String(row.groupClassCode || '');
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(row);
  }
  const facets = Array.isArray(gcFacets) ? gcFacets : [];
  const codesFromFacets = facets.map((f) => String(f.code || '')).filter(Boolean);
  const allCodes = new Set([...codesFromFacets, ...byCode.keys()]);
  if (!allCodes.size) return '';

  const sorted = [...allCodes].sort((a, b) => {
    const la = (facets.find((f) => f.code === a)?.labelUa || dirGroupMap.get(a) || a).toLowerCase();
    const lb = (facets.find((f) => f.code === b)?.labelUa || dirGroupMap.get(b) || b).toLowerCase();
    return la.localeCompare(lb, 'uk');
  });

  const lines = [];
  for (const code of sorted) {
    const facet = facets.find((f) => f.code === code);
    const lab = facet?.labelUa || byCode.get(code)?.[0]?.labelUa || dirGroupMap.get(code) || code;
    const coaches = byCode.get(code) || [];
    if (coaches.length) {
      const coachPart = coaches
        .map((c) => coachLinkHtml(c.coachChatId, c.firstName, c.lastName))
        .join(', ');
      lines.push(`• ${Helpers.escapeHtml(String(lab))} — ${coachPart}`);
    } else {
      lines.push(`• ${Helpers.escapeHtml(String(lab))} — <i>тренер не вказано</i>`);
    }
  }
  return '\n\n🏷 <b>Групові заняття</b>\n' + lines.join('\n');
}

module.exports = {
  buildCoachGroupTrainingHtmlBlock,
  buildVenueGroupClassesCoachesHtml,
  coachLinkHtml,
  fmtScheduleInline
};
