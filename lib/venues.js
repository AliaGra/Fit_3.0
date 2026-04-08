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

function yandexMapsLink(lat, lng) {
  return `https://yandex.com/maps/?pt=${lng},${lat}&z=16&l=map`;
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
  const keyboard = [
    [{ text: '📍 Пошук поруч (гео)', callback_data: CONSTANTS.CALLBACKS.VENUES_GEO }],
    [{ text: '🔎 За областю, містом і назвою', callback_data: CONSTANTS.CALLBACKS.VENUES_TEXT }],
    [{ text: '⚙ Тип організації', callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':pick' }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  let msg =
    '🏢 <b>Клуби, студії</b>\n\n' +
    'Обери спосіб пошуку. Фільтр за типом організації можна задати кнопкою «Тип організації».';
  if (fromRegistration) msg += '\n\n<i>Після вибору закладу реєстрація продовжиться.</i>';
  await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'HTML' });
}

async function showOrgFilterPicker(chatId) {
  const orgs = await supabase.getVenueDirectoryCodes('organization');
  const keyboard = [[{ text: '— Будь-який тип —', callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':clear' }]];
  for (let i = 0; i < orgs.length; i += 2) {
    const row = [];
    row.push({ text: orgs[i].labelUa.slice(0, 28), callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':' + orgs[i].code });
    if (orgs[i + 1]) row.push({ text: orgs[i + 1].labelUa.slice(0, 28), callback_data: CONSTANTS.CALLBACKS.VENUES_ORG + ':' + orgs[i + 1].code });
    keyboard.push(row);
  }
  keyboard.push([{ text: '⬅️ Назад до пошуку', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]);
  await Helpers.sendKeyboard(chatId, 'Обери тип організації (фільтр для обох режимів пошуку):', keyboard);
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
  const keyboard = [[{ text: '⬅️ Скасувати', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]];
  await Helpers.sendKeyboard(
    chatId,
    '📍 Надішли свою геолокацію (кнопка «Локація»). Потім обереш радіус пошуку.',
    keyboard
  );
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
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]
  ];
  await Helpers.sendKeyboard(chatId, 'Обери радіус пошуку навколо твоєї точки:', keyboard);
}

async function runGeoSearch(chatId, radiusKm) {
  const st = await State.getSafe(chatId);
  const lat = st?.venueGeoLat;
  const lon = st?.venueGeoLon;
  if (lat == null || lon == null) {
    await Helpers.safeSend(chatId, '❌ Немає точки. Почни з гео-пошуку.');
    return showHub(chatId, { fromRegistration: !!st?.venueFromRegistration, linkCoach: !!st?.venueLinkCoach });
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
  if (!list || !list.length) {
    const keyboard = [[{ text: '🔁 Спробувати знову', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]];
    await Helpers.sendKeyboard(chatId, 'Нічого не знайдено. Спробуй змінити фільтри або місто.', keyboard);
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
    const dist =
      v.distanceKm != null
        ? `\n📏 ~${v.distanceKm.toFixed(1)} км`
        : '';
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
    const msg =
      `<b>${Helpers.escapeHtml(v.nameUa)}</b>\n` +
      `${Helpers.escapeHtml(v.city)}, ${Helpers.escapeHtml(v.oblast)}` +
      addr +
      dist +
      amnLine +
      gcLine +
      linkLine;
    await Helpers.safeSend(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    await telegram.sendLocation(chatId, v.latitude, v.longitude);
    if (st?.venueFromRegistration || st?.venueLinkCoach) {
      await Helpers.sendKeyboard(chatId, 'Обрати цей заклад?', [
        [{ text: '✅ Обрати', callback_data: `${CONSTANTS.CALLBACKS.VENUES_PICK}:${v.id}` }]
      ]);
    }
    n++;
  }
  await Helpers.sendKeyboard(chatId, 'Навігація:', [[{ text: '⬅️ До меню пошуку', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]]);
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
  if (action === CONSTANTS.CALLBACKS.VENUES_GEO) return startGeoFlow(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_TEXT) return startTextFlow(chatId);
  if (action === CONSTANTS.CALLBACKS.VENUES_ORG) {
    const p = (params && params[0]) || '';
    if (p === 'pick') return showOrgFilterPicker(chatId);
    const st = await State.getSafe(chatId);
    if (p === 'clear') await State.update(chatId, { venueFilterOrg: '' });
    else await State.update(chatId, { venueFilterOrg: p });
    await Helpers.safeSend(chatId, '✅ Фільтр збережено. Запусти пошук (гео або текст).');
    return showHub(chatId, { fromRegistration: !!st?.venueFromRegistration, linkCoach: !!st?.venueLinkCoach });
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
  handleCallback,
  handleTextMessage,
  handleLocationMessage,
  showRegistrationVenueOffer,
  sendVenueResults
};
