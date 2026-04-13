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

async function sendCoachOpenKeyboardIfNeeded(chatId, coaches) {
  if (!coaches || !coaches.length) return;
  const rows = coaches.slice(0, 8).map((c) => {
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
  const msg =
    `<b>${Helpers.escapeHtml(v.nameUa)}</b>\n` +
    `${Helpers.escapeHtml(v.city)}, ${Helpers.escapeHtml(v.oblast)}` +
    addr +
    dist +
    amnLine +
    gcLine +
    linkLine +
    coachesBlock;
  await Helpers.safeSend(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
  if (v.latitude != null && v.longitude != null) {
    await telegram.sendLocation(chatId, v.latitude, v.longitude);
  }
  await sendCoachOpenKeyboardIfNeeded(chatId, coaches);
  if (st?.venueFromRegistration || st?.venueLinkCoach) {
    await Helpers.sendKeyboard(chatId, 'Обрати цей заклад?', [
      [{ text: '✅ Обрати', callback_data: `${CONSTANTS.CALLBACKS.VENUES_PICK}:${v.id}` }]
    ]);
  }
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

/** Deep link /start venue_<id> — лише привʼязаний до профілю заклад (тренер або учень). */
async function openLinkedVenueCardFromDeepLink(chatId, venueId) {
  const user = await User.getByChatId(chatId);
  if (!user || (user.role !== CONSTANTS.ROLES.COACH && user.role !== CONSTANTS.ROLES.STUDENT)) return false;
  await handleMyVenueCardClick(chatId, venueId);
  return true;
}

async function showVenueSearchMenu(chatId) {
  const keyboard = [
    [{ text: '📍 Пошук поруч (гео)', callback_data: CONSTANTS.CALLBACKS.VENUES_GEO }],
    [{ text: '🔎 За областю, містом і назвою', callback_data: CONSTANTS.CALLBACKS.VENUES_TEXT }],
    [{ text: '⚙ Тип організації', callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':pick' }],
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
    await supabase.setUserPrimaryVenue(chatId, vid);
    await Helpers.safeSend(chatId, '✅ Заклад збережено в профілі.');
    const st2 = await State.getSafe(chatId);
    const role = st2?.role;
    await State.update(chatId, { venueFromRegistration: false, step: null });
    const Registration = require('./registration');
    if (role === CONSTANTS.ROLES.COACH) return Registration.askInstagram(chatId);
    return Registration.askRegHeight(chatId);
  }

  if (st?.venueLinkCoach && user.role === CONSTANTS.ROLES.COACH) {
    const existing = await supabase.getCoachVenues(chatId);
    const primary = !existing || !existing.length;
    await supabase.linkCoachVenue(chatId, vid, primary);
    await Helpers.safeSend(chatId, '✅ Заклад додано до профілю тренера.');
    await State.clear(chatId);
    const Profile = require('./profile');
    return Profile.show(chatId);
  }

  await supabase.setUserPrimaryVenue(chatId, vid);
  await Helpers.safeSend(chatId, '✅ Заклад збережено.');
  await State.clear(chatId);
  const Menu = require('./menu');
  return Menu.show(chatId);
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
    venueFromRegistration: true
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
    if (vid) await handleMyVenueCardClick(chatId, vid);
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
    if (st?.venueFromRegistration || st?.venueLinkCoach) {
      return showHub(chatId, { fromRegistration: !!st?.venueFromRegistration, linkCoach: !!st?.venueLinkCoach });
    }
    return showVenueSearchMenu(chatId);
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
