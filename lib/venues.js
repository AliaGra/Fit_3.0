/**
 * Клуби, студії: пошук для всіх ролей; привʼязка закладу при реєстрації / профіль тренера.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const State = require('./state');
const User = require('./user');
const supabase = require('./supabase');
const telegram = require('./telegram');

const TEXT_SUB = Object.freeze({ OBLAST: 'oblast', CITY: 'city', NAME: 'name' });
const WD = Object.freeze({ 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' });

/** Куди повертатися з екранів пошуку: головний хаб клубів або підменю «Пошук нового закладу». */
function venuesSearchBackCallback(st) {
  if (st?.venueFromRegistration || st?.venueLinkCoach) return CONSTANTS.CALLBACKS.VENUES_MENU;
  return CONSTANTS.CALLBACKS.VENUES_SEARCH_NEW;
}

function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Список тренерів у тексті — лише імена; відкриття картки тільки кнопками PVCH під повідомленням. */
function coachBulletLinesHtml(coaches) {
  if (!coaches || !coaches.length) return '';
  let block = '';
  for (const c of coaches) {
    const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
    const badge = c.isPrimary ? ' ⭐' : '';
    const lab = full + badge;
    block += `• ${Helpers.escapeHtml(lab)}\n`;
  }
  return block;
}

function venueCoachesHtmlBlock(coaches) {
  if (!coaches || !coaches.length) return '';
  return '\n\n🧑‍🏫 <b>Тренери закладу</b>\n' + coachBulletLinesHtml(coaches);
}

function priceText(price, currency) {
  const n = Number(price);
  const num = Number.isFinite(n) ? n.toFixed(0) : String(price || '');
  return `${num} ${String(currency || 'UAH')}`.trim();
}

function unitTextUa(unit) {
  if (unit === 'per_visit') return 'за відвідування';
  if (unit === 'per_month') return 'за місяць';
  return 'разово';
}

function fmtTime(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return m[1].padStart(2, '0') + ':' + m[2];
}

function buildVenueHoursBlock(hours) {
  const rows = Array.isArray(hours) ? hours : [];
  if (!rows.length) return '\n\n🕒 <b>Графік роботи</b>\n—';
  const lines = rows
    .filter((h) => h && h.weekday != null)
    .sort((a, b) => Number(a.weekday) - Number(b.weekday))
    .map((h) => {
      const day = WD[h.weekday] || String(h.weekday);
      if (h.isClosed) return `• ${day}: вихідний`;
      const from = fmtTime(h.timeOpen);
      const to = fmtTime(h.timeClose);
      if (!from || !to) return `• ${day}: —`;
      return `• ${day}: ${from}-${to}`;
    });
  return '\n\n🕒 <b>Графік роботи</b>\n' + lines.join('\n');
}

function buildVenueScheduleBlock(schedule, groupMap) {
  const rows = Array.isArray(schedule) ? schedule : [];
  if (!rows.length) return '\n\n📅 <b>Розклад групових</b>\n—';
  const lines = rows.slice(0, 12).map((r) => {
    const day = WD[r.weekday] || String(r.weekday || '—');
    const from = fmtTime(r.timeStart);
    const to = fmtTime(r.timeEnd);
    const title = r.title || groupMap.get(String(r.groupClassCode || '')) || r.groupClassCode || 'Заняття';
    return `• ${day} ${from && to ? `${from}-${to}` : ''} — ${Helpers.escapeHtml(String(title))}`.trim();
  });
  const note = rows.length > 12 ? '\n<i>Показано перші 12 позицій.</i>' : '';
  return '\n\n📅 <b>Розклад групових</b>\n' + lines.join('\n') + note;
}

function buildVenuePricesBlock(gcRows, mRows, aRows, gcMap) {
  const gc = (gcRows || []).slice(0, 4).map((r) => {
    const lab = r.labelUa || gcMap.get(String(r.groupClassCode || '')) || r.groupClassCode || 'Групове';
    return `• ${Helpers.escapeHtml(String(lab))}: <b>${Helpers.escapeHtml(priceText(r.price, r.currency))}</b>`;
  });
  const gym = (mRows || []).slice(0, 3).map((r) => {
    const lim = r.isUnlimited ? 'безліміт' : `${r.trainingsPerMonth} раз/міс`;
    return `• ${Helpers.escapeHtml(String(r.labelUa || 'Абонемент'))} (${lim}): <b>${Helpers.escapeHtml(priceText(r.price, r.currency))}</b>`;
  });
  const anc = (aRows || []).slice(0, 3).map((r) => {
    return `• ${Helpers.escapeHtml(String(r.labelUa || 'Послуга'))} (${unitTextUa(r.unit)}): <b>${Helpers.escapeHtml(
      priceText(r.price, r.currency)
    )}</b>`;
  });
  if (!gc.length && !gym.length && !anc.length) return '\n\n💰 <b>Ціни</b>\n—';
  const lines = [];
  if (gc.length) lines.push(...gc);
  if (gym.length) lines.push(...gym);
  if (anc.length) lines.push(...anc);
  return '\n\n💰 <b>Ціни</b>\n' + lines.join('\n');
}

/**
 * Кнопки PVCH під карткою. Для ролі тренер — без кнопки на власну картку
 * (ім’я вже в тексті «Тренери закладу», якщо тренер у списку закладу).
 */
async function sendCoachOpenKeyboardIfNeeded(chatId, coaches) {
  if (!coaches || !coaches.length) return;
  let list = coaches;
  const user = await User.getByChatId(chatId);
  if (user && user.role === CONSTANTS.ROLES.COACH) {
    list = coaches.filter((c) => String(c.chatId) !== String(chatId));
  }
  if (!list.length) return;
  const rows = list.slice(0, 8).map((c) => {
    const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
    const badge = c.isPrimary ? ' ⭐' : '';
    const label = `👤 ${full}${badge}`;
    return [
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PVCH}:${c.chatId}`
      }
    ];
  });
  await Helpers.sendKeyboard(chatId, '👇 Відкрити тренера в боті:', rows);
}

/**
 * Після профілю учня: закріплені заклади — список тренерів у тексті та кнопки PVCH.
 */
async function sendUserVenueCoachesBlocks(chatId, venues) {
  if (!venues || !venues.length) return;
  for (const v of venues) {
    const coaches = await supabase.listVenueCoaches(v.id);
    if (!coaches.length) continue;
    const vName = Helpers.escapeHtml(v.nameUa || 'Заклад');
    const text = `🧑‍🏫 <b>Тренери — ${vName}</b>\n` + coachBulletLinesHtml(coaches);
    await Helpers.safeSend(chatId, text.trimEnd(), { parse_mode: 'HTML', disable_web_page_preview: true });
    await sendCoachOpenKeyboardIfNeeded(chatId, coaches);
  }
}

/**
 * Одна картка закладу (текст + локація + тренери + опційно «Обрати»).
 * @param {object} v — об’єкт закладу з venueFromRow / search
 * @param {{ st?: object, dirGroupMap?: Map, dirAmnMap?: Map }} options
 */
async function sendVenueCardMessage(chatId, v, options = {}) {
  const st = options.st;
  let dirGroupMap = options.dirGroupMap;
  let dirAmnMap = options.dirAmnMap;
  if (!dirGroupMap || !dirAmnMap) {
    const dirGc = await supabase.getVenueDirectoryCodes('group_class');
    dirGroupMap = new Map(dirGc.map((d) => [d.code, d.labelUa]));
    const dirAmn = await supabase.getVenueDirectoryCodes('amenity');
    dirAmnMap = new Map(dirAmn.map((d) => [d.code, d.labelUa]));
  }
  const dist = v.distanceKm != null ? `\n📏 ~${v.distanceKm.toFixed(1)} км` : '';
  const addr = v.address ? `\n📫 ${Helpers.escapeHtml(v.address)}` : '';
  const links = [];
  if (v.telegramUrl) links.push(`<a href="${Helpers.escapeHtml(v.telegramUrl)}">Telegram</a>`);
  if (v.instagramUrl) links.push(`<a href="${Helpers.escapeHtml(v.instagramUrl)}">Instagram</a>`);
  const linkLine = links.length ? '\n' + links.join(' · ') : '';
  const amnFacets = (v.facets || []).filter((f) => f.facetKind === 'amenity');
  const amnLine =
    amnFacets.length > 0
      ? '\n✨ ' +
        amnFacets
          .map((f) => Helpers.escapeHtml(dirAmnMap.get(f.code) || f.code))
          .join(', ')
      : '';
  const gcFacets = (v.facets || []).filter((f) => f.facetKind === 'group_class');
  const gcLine =
    gcFacets.length > 0
      ? '\n🏷 ' +
        gcFacets
          .map((f) => {
            const lab = f.labelUa || dirGroupMap.get(f.code) || f.code;
            return Helpers.escapeHtml(lab);
          })
          .join(', ')
      : '';
  const coaches = await supabase.listVenueCoaches(v.id);
  const coachesBlock = venueCoachesHtmlBlock(coaches);
  const [hours, schedule, gcRows, mRows, aRows] = await Promise.all([
    supabase.getVenueHours(v.id),
    supabase.listVenueSchedule(v.id, 50),
    supabase.listVenueGroupClassPrices(v.id),
    supabase.listVenueGymMembershipOffers(v.id),
    supabase.listVenueAncillaryServices(v.id)
  ]);
  const hoursBlock = buildVenueHoursBlock(hours);
  const scheduleBlock = buildVenueScheduleBlock(schedule, dirGroupMap);
  const pricesBlock = buildVenuePricesBlock(gcRows, mRows, aRows, dirGroupMap);
  const districtLine =
    v.district && String(v.district).trim() ? `\n🏘 ${Helpers.escapeHtml(String(v.district).trim())}` : '';
  const msg =
    `<b>${Helpers.escapeHtml(v.nameUa)}</b>\n` +
    `${Helpers.escapeHtml(v.city)}, ${Helpers.escapeHtml(v.oblast)}` +
    districtLine +
    addr +
    dist +
    amnLine +
    gcLine +
    linkLine +
    hoursBlock +
    scheduleBlock +
    pricesBlock +
    coachesBlock;
  await Helpers.safeSend(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
  if (v.latitude != null && v.longitude != null) {
    await telegram.sendLocation(chatId, v.latitude, v.longitude);
  }
  await sendCoachOpenKeyboardIfNeeded(chatId, coaches);
  const actionRows = [[{ text: '💰 Ціни закладу', callback_data: `${CONSTANTS.CALLBACKS.VENUES_PRICES}:${v.id}` }]];
  if (st?.venueFromRegistration || st?.venueLinkCoach) {
    actionRows.push([{ text: '✅ Обрати', callback_data: `${CONSTANTS.CALLBACKS.VENUES_PICK}:${v.id}` }]);
  }
  await Helpers.sendKeyboard(chatId, 'Дії:', actionRows);
}

async function handleMyVenueCardClick(chatId, venueId) {
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const user = await User.getByChatId(chatId);
  if (!user || (user.role !== CONSTANTS.ROLES.COACH && user.role !== CONSTANTS.ROLES.STUDENT)) {
    await Helpers.safeSend(chatId, '❌ Доступ обмежено.');
    return;
  }
  let linked = [];
  if (user.role === CONSTANTS.ROLES.COACH) linked = await supabase.getCoachVenues(chatId);
  else linked = await supabase.getUserVenues(chatId);
  if (!linked.some((x) => String(x.id) === vid)) {
    await Helpers.safeSend(chatId, '❌ Заклад не з твого списку закладів.');
    return;
  }
  const v = await supabase.getVenueById(vid);
  if (!v) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return;
  }
  const st = await State.getSafe(chatId);
  await sendVenueCardMessage(chatId, v, { st });
  await Helpers.sendKeyboard(chatId, 'Навігація:', [[{ text: '⬅️ До клубів', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]]);
}

async function handleVenueCardClick(chatId, venueId) {
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const st = await State.getSafe(chatId);
  const fromSearchFlow =
    !!st?.venueFromRegistration ||
    !!st?.venueLinkCoach ||
    st?.step === CONSTANTS.FSM_STATES.VENUE_SEARCH_HUB ||
    st?.step === CONSTANTS.FSM_STATES.VENUE_TEXT_SEARCH ||
    st?.step === CONSTANTS.FSM_STATES.VENUE_WAIT_LOCATION;
  const v = await supabase.getVenueById(vid);
  if (!v) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return;
  }
  if (fromSearchFlow || v.isActive) {
    await State.update(chatId, { venueCardViewedId: vid });
    await sendVenueCardMessage(chatId, v, { st });
    await Helpers.sendKeyboard(chatId, 'Навігація:', [[{ text: '⬅️ До клубів', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]]);
    return;
  }
  return handleMyVenueCardClick(chatId, vid);
}

async function showVenuePrices(chatId, venueId) {
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const v = await supabase.getVenueById(vid);
  if (!v) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return;
  }
  const gcRows = await supabase.listVenueGroupClassPrices(vid);
  const mRows = await supabase.listVenueGymMembershipOffers(vid);
  const aRows = await supabase.listVenueAncillaryServices(vid);
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));

  const gcLines = gcRows.length
    ? gcRows
        .slice(0, 8)
        .map((r) => {
          const lab = r.labelUa || gcMap.get(r.groupClassCode) || r.groupClassCode;
          return `• ${Helpers.escapeHtml(String(lab))} — <b>${Helpers.escapeHtml(priceText(r.price, r.currency))}</b>`;
        })
        .join('\n')
    : '—';
  const mLines = mRows.length
    ? mRows
        .slice(0, 8)
        .map((r) => {
          const lim = r.isUnlimited ? 'безліміт' : `${r.trainingsPerMonth} раз/міс`;
          return `• ${Helpers.escapeHtml(String(r.labelUa || 'Абонемент'))} (${lim}) — <b>${Helpers.escapeHtml(
            priceText(r.price, r.currency)
          )}</b>`;
        })
        .join('\n')
    : '—';
  const aLines = aRows.length
    ? aRows
        .slice(0, 8)
        .map(
          (r) =>
            `• ${Helpers.escapeHtml(String(r.labelUa || 'Послуга'))} (${unitTextUa(r.unit)}) — <b>${Helpers.escapeHtml(
              priceText(r.price, r.currency)
            )}</b>`
        )
        .join('\n')
    : '—';
  const moreNote =
    gcRows.length > 8 || mRows.length > 8 || aRows.length > 8 ? '\n\n<i>Показано перші 8 позицій у кожному розділі.</i>' : '';
  const text =
    `💰 <b>Довідник цін — ${Helpers.escapeHtml(v.nameUa || 'Заклад')}</b>\n\n` +
    `🏷 <b>Групові заняття</b>\n${gcLines}\n\n` +
    `🏋 <b>Абонементи в зал</b>\n${mLines}\n\n` +
    `🧾 <b>Інші послуги</b>\n${aLines}` +
    moreNote +
    '\n\n<i>Інформативно, без оплат у боті.</i>';
  await Helpers.safeSend(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
  await Helpers.sendKeyboard(chatId, 'Навігація:', [[{ text: '⬅️ До клубів', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]]);
}

/** Deep link /start venue_<id> — лише привʼязаний до профілю заклад (тренер або учень). */
async function openLinkedVenueCardFromDeepLink(chatId, venueId) {
  const user = await User.getByChatId(chatId);
  if (!user || (user.role !== CONSTANTS.ROLES.COACH && user.role !== CONSTANTS.ROLES.STUDENT)) return false;
  await handleMyVenueCardClick(chatId, venueId);
  return true;
}

async function showVenueSearchMenu(chatId) {
  const st = await State.getSafe(chatId);
  const studioCount = Array.isArray(st?.venueStudioCodes) ? st.venueStudioCodes.length : 0;
  const sectionCount = Array.isArray(st?.venueSectionCodes) ? st.venueSectionCodes.length : 0;
  const groupCount = Array.isArray(st?.venueGroupCodes) ? st.venueGroupCodes.length : 0;
  const keyboard = [
    [{ text: '📍 Пошук поруч (гео)', callback_data: CONSTANTS.CALLBACKS.VENUES_GEO }],
    [{ text: '🔎 За областю, містом і назвою', callback_data: CONSTANTS.CALLBACKS.VENUES_TEXT }],
    [{ text: '⚙ Тип організації', callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':pick' }],
    [{ text: `🧘‍♀️ Студії (${studioCount})`, callback_data: CONSTANTS.CALLBACKS.VENUES_STUDIO + ':pick:0' }],
    [{ text: `🥋 Секції (${sectionCount})`, callback_data: CONSTANTS.CALLBACKS.VENUES_SECTION + ':pick:0' }],
    [{ text: `👥 Групові (${groupCount})`, callback_data: CONSTANTS.CALLBACKS.VENUES_GROUP + ':pick:0' }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]
  ];
  await Helpers.sendKeyboard(chatId, '🏢 <b>Пошук закладу</b>', keyboard, { parse_mode: 'HTML' });
}

async function showHub(chatId, options = {}) {
  const prev = (await State.getSafe(chatId)) || {};
  const fromRegistration = 'fromRegistration' in options ? !!options.fromRegistration : !!prev.venueFromRegistration;
  const linkCoach = 'linkCoach' in options ? !!options.linkCoach : !!prev.venueLinkCoach;
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VENUE_SEARCH_HUB,
    venueFromRegistration: fromRegistration,
    venueLinkCoach: linkCoach,
    venueFilterOrg: '',
    venueGroupCodes: [],
    venueStudioCodes: [],
    venueSectionCodes: []
  });
  const user = await User.getByChatId(chatId);
  const myVenuesHub = user && !fromRegistration && !linkCoach;
  let myVenues = [];
  if (myVenuesHub) {
    try {
      if (user.role === CONSTANTS.ROLES.COACH) {
        myVenues = (await supabase.getCoachVenues(chatId)) || [];
      } else if (user.role === CONSTANTS.ROLES.STUDENT) {
        myVenues = (await supabase.getUserVenues(chatId)) || [];
      }
    } catch (_) {
      myVenues = [];
    }
  }

  const keyboard = [];
  if (myVenuesHub && myVenues.length) {
    for (const v of myVenues.slice(0, 10)) {
      const name = String(v.nameUa || 'Заклад').trim() || 'Заклад';
      const mark = v.isPrimary ? ' ⭐' : '';
      const btn = `📍 ${name}${mark}`;
      const short = btn.length > 64 ? btn.slice(0, 61) + '…' : btn;
      const vid = String(v.id);
      keyboard.push([{ text: short, callback_data: `${CONSTANTS.CALLBACKS.VENUES_CARD}:${vid}` }]);
    }
  }
  keyboard.push([{ text: '🔎 Пошук нового закладу', callback_data: CONSTANTS.CALLBACKS.VENUES_SEARCH_NEW }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  let msg = '🏢 <b>Клуби, студії</b>';
  if (myVenuesHub && myVenues.length) {
    msg +=
      '\n\n<b>Мої заклади</b>\n' +
      myVenues
        .map((v) => {
          const mark = v.isPrimary ? ' ⭐' : '';
          const city = String(v.city || '').trim();
          const place = city ? ` — ${Helpers.escapeHtml(city)}` : '';
          return `• ${Helpers.escapeHtml(v.nameUa || 'Заклад')}${place}${mark}`;
        })
        .join('\n');
  }

  await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'HTML' });
}

async function showOrgFilterPicker(chatId) {
  const st = await State.getSafe(chatId);
  const orgs = await supabase.getVenueDirectoryCodes('organization');
  const keyboard = [[{ text: '— Будь-який тип —', callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':clear' }]];
  for (let i = 0; i < orgs.length; i += 2) {
    const row = [];
    row.push({ text: orgs[i].labelUa.slice(0, 28), callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':' + orgs[i].code });
    if (orgs[i + 1]) row.push({ text: orgs[i + 1].labelUa.slice(0, 28), callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':' + orgs[i + 1].code });
    keyboard.push(row);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: venuesSearchBackCallback(st) }]);
  await Helpers.sendKeyboard(chatId, 'Обери тип організації:', keyboard);
}

function venueFacetFilterMeta(action) {
  if (action === CONSTANTS.CALLBACKS.VENUES_STUDIO) {
    return { kind: 'studio', stateKey: 'venueStudioCodes', title: 'Фільтр студій' };
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_SECTION) {
    return { kind: 'section', stateKey: 'venueSectionCodes', title: 'Фільтр секцій' };
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_GROUP) {
    return { kind: 'group_class', stateKey: 'venueGroupCodes', title: 'Фільтр групових занять' };
  }
  return null;
}

async function returnToVenueSearchRoot(chatId, st) {
  if (st?.venueFromRegistration || st?.venueLinkCoach) {
    return showHub(chatId, { fromRegistration: !!st?.venueFromRegistration, linkCoach: !!st?.venueLinkCoach });
  }
  return showVenueSearchMenu(chatId);
}

async function showFacetFilterPicker(chatId, action, page = 0) {
  const meta = venueFacetFilterMeta(action);
  if (!meta) return;
  const st = await State.getSafe(chatId);
  const list = await supabase.getVenueDirectoryCodes(meta.kind);
  const selected = new Set(Array.isArray(st?.[meta.stateKey]) ? st[meta.stateKey].map((x) => String(x)) : []);
  const pageSize = 8;
  const maxPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(maxPage, Number(page) || 0));
  const start = safePage * pageSize;
  const slice = list.slice(start, start + pageSize);
  const keyboard = [];
  for (const it of slice) {
    const code = String(it.code || '');
    const mark = selected.has(code) ? '✅' : '☐';
    const label = `${mark} ${it.labelUa || code}`;
    keyboard.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${action}:toggle:${code}:${safePage}` }]);
  }
  const nav = [];
  if (safePage > 0) nav.push({ text: '◀️', callback_data: `${action}:page:${safePage - 1}` });
  nav.push({ text: `${safePage + 1}/${maxPage + 1}`, callback_data: `${action}:noop` });
  if (safePage < maxPage) nav.push({ text: '▶️', callback_data: `${action}:page:${safePage + 1}` });
  keyboard.push(nav);
  keyboard.push([{ text: '🧹 Очистити вибір', callback_data: `${action}:clear` }]);
  keyboard.push([{ text: '✅ Готово', callback_data: `${action}:done` }]);
  const suffix = selected.size ? `\nОбрано: <b>${selected.size}</b>` : '\nОбрано: <b>0</b>';
  await Helpers.sendKeyboard(chatId, `⚙️ <b>${meta.title}</b>${suffix}`, keyboard, { parse_mode: 'HTML' });
}

async function startGeoFlow(chatId) {
  const st = await State.getSafe(chatId);
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VENUE_WAIT_LOCATION,
    venueFromRegistration: st?.venueFromRegistration,
    venueLinkCoach: st?.venueLinkCoach,
    venueFilterOrg: st?.venueFilterOrg || '',
    venueGroupCodes: st?.venueGroupCodes || [],
    venueStudioCodes: st?.venueStudioCodes || [],
    venueSectionCodes: st?.venueSectionCodes || []
  });
  const back = venuesSearchBackCallback(st);
  const keyboard = [[{ text: '⬅️ Скасувати', callback_data: back }]];
  await Helpers.sendKeyboard(chatId, '📍 Надішли геолокацію.', keyboard);
}

async function askRadiusThenSearch(chatId, lat, lng) {
  const prev = await State.getSafe(chatId);
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VENUE_SEARCH_HUB,
    venueGeoLat: lat,
    venueGeoLon: lng,
    venueFromRegistration: !!prev?.venueFromRegistration,
    venueLinkCoach: !!prev?.venueLinkCoach,
    venueFilterOrg: prev?.venueFilterOrg || '',
    venueGroupCodes: prev?.venueGroupCodes || [],
    venueStudioCodes: prev?.venueStudioCodes || [],
    venueSectionCodes: prev?.venueSectionCodes || []
  });
  const keyboard = [
    [
      { text: '1 км', callback_data: CONSTANTS.CALLBACKS.VENUES_RADIUS + ':1' },
      { text: '3 км', callback_data: CONSTANTS.CALLBACKS.VENUES_RADIUS + ':3' },
      { text: '5 км', callback_data: CONSTANTS.CALLBACKS.VENUES_RADIUS + ':5' }
    ],
    [{ text: '10 км', callback_data: CONSTANTS.CALLBACKS.VENUES_RADIUS + ':10' }],
    [{ text: '⬅️ Назад', callback_data: venuesSearchBackCallback(prev) }]
  ];
  await Helpers.sendKeyboard(chatId, 'Обери радіус пошуку.', keyboard);
}

async function runGeoSearch(chatId, radiusKm) {
  const st = await State.getSafe(chatId);
  const lat = st?.venueGeoLat;
  const lon = st?.venueGeoLon;
  if (lat == null || lon == null) {
    await Helpers.safeSend(chatId, '❌ Немає точки. Почни з гео-пошуку.');
    if (st?.venueFromRegistration || st?.venueLinkCoach) {
      return showHub(chatId, { fromRegistration: !!st?.venueFromRegistration, linkCoach: !!st?.venueLinkCoach });
    }
    return showVenueSearchMenu(chatId);
  }
  const list = await supabase.searchVenues({
    organizationType: st?.venueFilterOrg || '',
    studioCodes: Array.isArray(st?.venueStudioCodes) ? st.venueStudioCodes : [],
    sectionCodes: Array.isArray(st?.venueSectionCodes) ? st.venueSectionCodes : [],
    groupClassCodes: Array.isArray(st?.venueGroupCodes) ? st.venueGroupCodes : [],
    centerLat: lat,
    centerLon: lon,
    radiusKm: Number(radiusKm) || 5,
    limit: 15
  });
  await sendVenueResults(chatId, list, { centerLat: lat, centerLon: lon, st });
}

async function startTextFlow(chatId) {
  const st = await State.getSafe(chatId);
  const user = await User.getByChatId(chatId);
  const presetOblast = String(st?.regVenueOblast || '').trim();
  const presetCity = String(st?.regVenueCity || user?.city || '').trim();
  const hasPresetAddress = !!presetOblast || !!presetCity;
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VENUE_TEXT_SEARCH,
    venueTextSubstep: hasPresetAddress ? TEXT_SUB.NAME : TEXT_SUB.OBLAST,
    venueFromRegistration: st?.venueFromRegistration,
    venueLinkCoach: st?.venueLinkCoach,
    venueFilterOrg: st?.venueFilterOrg || '',
    venueGroupCodes: st?.venueGroupCodes || [],
    venueStudioCodes: st?.venueStudioCodes || [],
    venueSectionCodes: st?.venueSectionCodes || [],
    venueTmpOblast: presetOblast,
    venueTmpCity: presetCity,
    venueTmpName: ''
  });
  if (hasPresetAddress) {
    const place = [presetCity, presetOblast].filter(Boolean).join(', ');
    await Helpers.safeSend(
      chatId,
      `Використовую адресу з профілю: <b>${Helpers.escapeHtml(place)}</b>.\n` +
        'Введи частину назви закладу (або <b>-</b>, щоб шукати без назви):',
      { parse_mode: 'HTML' }
    );
    return;
  }
  await Helpers.safeSend(
    chatId,
    'У профілі ще не вказано місто/область.\n' +
      'Введи область (як у довіднику, наприклад <b>Київська</b>):',
    { parse_mode: 'HTML' }
  );
}

async function handleTextFlow(chatId, text) {
  const st = await State.getSafe(chatId);
  if (!st || st.step !== CONSTANTS.FSM_STATES.VENUE_TEXT_SEARCH) return false;
  const sub = st.venueTextSubstep || TEXT_SUB.OBLAST;
  const t = String(text || '').trim();
  if (sub === TEXT_SUB.OBLAST) {
    await State.update(chatId, { venueTmpOblast: t, venueTextSubstep: TEXT_SUB.CITY });
    await Helpers.safeSend(chatId, 'Введи місто / населений пункт:');
    return true;
  }
  if (sub === TEXT_SUB.CITY) {
    await State.update(chatId, { venueTmpCity: t, venueTextSubstep: TEXT_SUB.NAME });
    await Helpers.safeSend(chatId, 'Частина назви закладу (або <b>-</b> щоб не фільтрувати за назвою):', { parse_mode: 'HTML' });
    return true;
  }
  if (sub === TEXT_SUB.NAME) {
    const nameQuery = t === '-' ? '' : t;
    const list = await supabase.searchVenues({
      oblast: st.venueTmpOblast || '',
      city: st.venueTmpCity || '',
      nameQuery,
      organizationType: st.venueFilterOrg || '',
      studioCodes: Array.isArray(st.venueStudioCodes) ? st.venueStudioCodes : [],
      sectionCodes: Array.isArray(st.venueSectionCodes) ? st.venueSectionCodes : [],
      groupClassCodes: Array.isArray(st.venueGroupCodes) ? st.venueGroupCodes : [],
      limit: 15
    });
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.VENUE_SEARCH_HUB, venueTextSubstep: null });
    await sendVenueResults(chatId, list, { st });
    return true;
  }
  return false;
}

async function sendVenueResults(chatId, list, ctx = {}) {
  const st = ctx.st || (await State.getSafe(chatId));
  const backCb = venuesSearchBackCallback(st);
  if (!list || !list.length) {
    const keyboard = [[{ text: '🔁 Спробувати знову', callback_data: backCb }]];
    await Helpers.sendKeyboard(chatId, 'Нічого не знайдено.', keyboard);
    return;
  }
  if (st?.venueFromRegistration) {
    await State.update(chatId, { venueCardViewedId: null });
    const keyboard = [];
    for (const v of list.slice(0, 12)) {
      const label = `📍 ${v.nameUa || 'Заклад'}${v.city ? ' — ' + v.city : ''}`;
      const vid = String(v.id || '');
      if (!vid) continue;
      keyboard.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${CONSTANTS.CALLBACKS.VENUES_CARD}:${vid}` }]);
    }
    keyboard.push([{ text: '⬅️ Назад', callback_data: backCb }]);
    await Helpers.sendKeyboard(
      chatId,
      `Знайдено: ${list.length}${list.length >= 15 ? '+' : ''}\n\nНатисни заклад, щоб відкрити повну картку.\nВибір і привʼязка — у картці закладу.`,
      keyboard
    );
    return;
  }
  const dirGc = await supabase.getVenueDirectoryCodes('group_class');
  const dirGroupMap = new Map(dirGc.map((d) => [d.code, d.labelUa]));
  const dirAmn = await supabase.getVenueDirectoryCodes('amenity');
  const dirAmnMap = new Map(dirAmn.map((d) => [d.code, d.labelUa]));
  await Helpers.safeSend(chatId, `Знайдено: ${list.length}${list.length >= 15 ? '+' : ''}`);
  let n = 0;
  for (const v of list) {
    if (n >= 8) {
      await Helpers.safeSend(chatId, '… Показано перші 8. Уточни фільтри або місто.');
      break;
    }
    await sendVenueCardMessage(chatId, v, { st, dirGroupMap, dirAmnMap });
    n++;
  }
  await Helpers.sendKeyboard(chatId, '\u2060', [[{ text: '⬅️ Назад', callback_data: backCb }]]);
}

async function handleLocationMessage(chatId, location) {
  const st = await State.getSafe(chatId);
  if (!st || st.step !== CONSTANTS.FSM_STATES.VENUE_WAIT_LOCATION) return false;
  const lat = location && location.latitude;
  const lng = location && location.longitude;
  if (lat == null || lng == null) return false;
  await askRadiusThenSearch(chatId, lat, lng);
  return true;
}

async function handlePickVenue(chatId, venueId) {
  const st = await State.getSafe(chatId);
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const user = await User.getByChatId(chatId);
  if (!user) return;

  if (st?.venueFromRegistration) {
    if (String(st?.venueCardViewedId || '') !== vid) {
      await handleVenueCardClick(chatId, vid);
      return;
    }
    await supabase.setUserPrimaryVenue(chatId, vid);
    await Helpers.safeSend(chatId, '✅ Заклад збережено в профілі.');
    const st2 = await State.getSafe(chatId);
    const role = st2?.role;
    await State.update(chatId, { venueFromRegistration: false, venueCardViewedId: null, step: null });
    const Registration = require('./registration');
    if (role === CONSTANTS.ROLES.COACH) return Registration.askInstagram(chatId);
    return Registration.askRegHeight(chatId);
  }

  if (st?.venueLinkCoach && user.role === CONSTANTS.ROLES.COACH) {
    if (String(st?.venueCardViewedId || '') !== vid) {
      await handleVenueCardClick(chatId, vid);
      return;
    }
    const existing = await supabase.getCoachVenues(chatId);
    const hadVenueAlready = (existing || []).some((v) => String(v.id || '').trim() === vid);
    const primary = !existing || !existing.length;
    await supabase.linkCoachVenue(chatId, vid, primary);
    await Helpers.safeSend(chatId, '✅ Заклад додано до профілю тренера.');
    if (!hadVenueAlready) {
      const coachVenueNotify = require('./coachVenueNotify');
      coachVenueNotify.notifyUsersNewCoachAtVenue(chatId, vid).catch((e) => console.error('coachVenueNotify', e && e.message));
    }
    await State.clear(chatId);
    const Profile = require('./profile');
    return Profile.show(chatId);
  }

  await Helpers.safeSend(
    chatId,
    'ℹ️ Для привʼязки закладу відкрий його зі списку пошуку у відповідному сценарії (реєстрація або привʼязка з профілю).'
  );
  return showVenueSearchMenu(chatId);
}

/**
 * Після вибору міста в реєстрації: підказка + кнопки.
 */
async function showRegistrationVenueOffer(chatId, oblast, city) {
  const n = await supabase.countVenuesInCity(oblast, city);
  const keyboard = [
    [{ text: '🔎 Знайти заклад у цьому місті', callback_data: CONSTANTS.CALLBACKS.REG_VENUE_OPEN }],
    [{ text: '⏭️ Пізніше (меню «Клуби, студії»)', callback_data: CONSTANTS.CALLBACKS.REG_VENUE_SKIP }]
  ];
  let msg =
    '🏢 У каталозі можуть бути клуби та студії у твоєму місті.\n' +
    `Населений пункт: <b>${Helpers.escapeHtml(city)}</b> (${Helpers.escapeHtml(oblast)}).\n`;
  if (n > 0) msg += `\nЗараз у базі: <b>${n}</b> заклад(ів) у цьому місті.`;
  else msg += `\n<i>Поки немає закладів у базі для цього міста — їх додає оператор.</i>`;
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.REG_VENUE_OFFER,
    regVenueOblast: oblast,
    regVenueCity: city
  });
  await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'HTML' });
}

async function openRegistrationVenueSearch(chatId) {
  const st = await State.getSafe(chatId);
  const ob = st?.regVenueOblast || '';
  const ci = st?.regVenueCity || '';
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VENUE_SEARCH_HUB,
    venueFilterOrg: '',
    venueGroupCodes: [],
    venueStudioCodes: [],
    venueSectionCodes: [],
    venueTmpOblast: ob,
    venueTmpCity: ci,
    venueFromRegistration: true,
    venueCardViewedId: null
  });
  const list = await supabase.searchVenues({ oblast: ob, city: ci, limit: 15 });
  const st2 = await State.getSafe(chatId);
  await sendVenueResults(chatId, list, { st: st2 });
}

async function handleCallback(chatId, action, params) {
  if (action === CONSTANTS.CALLBACKS.VENUES_MENU) return showHub(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_SEARCH_NEW) return showVenueSearchMenu(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_CARD) {
    const vid = (params && params.length ? params.join(':') : '').trim();
    if (vid) await handleVenueCardClick(chatId, vid);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_PRICES) {
    const vid = (params && params.length ? params.join(':') : '').trim();
    if (vid) await showVenuePrices(chatId, vid);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_GEO) return startGeoFlow(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_TEXT) return startTextFlow(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_ORG) {
    const p = (params && params[0]) || '';
    if (p === 'pick') return showOrgFilterPicker(chatId);
    const st = await State.getSafe(chatId);
    if (p === 'clear') await State.update(chatId, { venueFilterOrg: '' });
    else await State.update(chatId, { venueFilterOrg: p });
    await Helpers.safeSend(chatId, '✅ Фільтр збережено.');
    return returnToVenueSearchRoot(chatId, st);
  }
  if (
    action === CONSTANTS.CALLBACKS.VENUES_STUDIO ||
    action === CONSTANTS.CALLBACKS.VENUES_SECTION ||
    action === CONSTANTS.CALLBACKS.VENUES_GROUP
  ) {
    const meta = venueFacetFilterMeta(action);
    if (!meta) return null;
    const cmd = (params && params[0]) || '';
    if (cmd === 'noop') return null;
    if (cmd === 'pick') {
      const page = parseInt((params && params[1]) || '0', 10) || 0;
      return showFacetFilterPicker(chatId, action, page);
    }
    if (cmd === 'page') {
      const page = parseInt((params && params[1]) || '0', 10) || 0;
      return showFacetFilterPicker(chatId, action, page);
    }
    if (cmd === 'toggle') {
      const code = String((params && params[1]) || '').trim();
      const page = parseInt((params && params[2]) || '0', 10) || 0;
      const st = await State.getSafe(chatId);
      const current = new Set(Array.isArray(st?.[meta.stateKey]) ? st[meta.stateKey].map((x) => String(x)) : []);
      if (code) {
        if (current.has(code)) current.delete(code);
        else current.add(code);
      }
      await State.update(chatId, { [meta.stateKey]: Array.from(current) });
      return showFacetFilterPicker(chatId, action, page);
    }
    if (cmd === 'clear') {
      await State.update(chatId, { [meta.stateKey]: [] });
      return showFacetFilterPicker(chatId, action, 0);
    }
    if (cmd === 'done') {
      const st = await State.getSafe(chatId);
      await Helpers.safeSend(chatId, '✅ Фільтр збережено.');
      return returnToVenueSearchRoot(chatId, st);
    }
    return null;
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_RADIUS) {
    const km = parseInt(params && params[0], 10) || 5;
    return runGeoSearch(chatId, km);
  }
  if (action === CONSTANTS.CALLBACKS.VENUES_PICK && params && params[0]) {
    return handlePickVenue(chatId, params[0]);
  }
  if (action === CONSTANTS.CALLBACKS.REG_VENUE_OPEN) return openRegistrationVenueSearch(chatId);
  if (action === CONSTANTS.CALLBACKS.REG_VENUE_SKIP) {
    const Registration = require('./registration');
    const st = await State.getSafe(chatId);
    await State.update(chatId, { step: null });
    if (st?.role === CONSTANTS.ROLES.COACH) return Registration.askInstagram(chatId);
    return Registration.askRegHeight(chatId);
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES) {
    await State.update(chatId, { venueLinkCoach: true });
    return showHub(chatId, { linkCoach: true });
  }
  return null;
}

async function handleTextMessage(chatId, text) {
  const st = await State.getSafe(chatId);
  if (st && st.step === CONSTANTS.FSM_STATES.VENUE_TEXT_SEARCH) {
    return handleTextFlow(chatId, text);
  }
  return false;
}

module.exports = {
  showHub,
  showVenueSearchMenu,
  handleCallback,
  handleTextMessage,
  handleLocationMessage,
  showRegistrationVenueOffer,
  sendVenueResults,
  sendUserVenueCoachesBlocks,
  openLinkedVenueCardFromDeepLink,
  openCoachVenueCardFromDeepLink: openLinkedVenueCardFromDeepLink
};
