/**
 * Розсилка тренера / власника закладу (v1).
 * Свої клієнти / потенційні в обраному місті. Ліміт: 1/добу (Київ) на акаунт тренера або на заклад.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

const TEXT_MAX = 400;
const SEND_DELAY_MS = 70;
const AUDIENCE = Object.freeze({
  OWN_ALL: 'own_all',
  OWN_ACTIVE: 'own_active',
  OWN_SLEEPING: 'own_sleeping',
  POTENTIAL: 'potential'
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kyivYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function charCount(text) {
  return Array.from(String(text || '')).length;
}

function isInviteChatId(id) {
  return String(id || '').toUpperCase().startsWith('INVITE_');
}

function isSendableChatId(id) {
  const s = String(id || '').trim();
  return /^-?\d+$/.test(s) && !isInviteChatId(s);
}

function senderLabel(user, venue) {
  if (venue && venue.nameUa) return 'закладу ' + String(venue.nameUa).trim();
  const name = [user && user.firstName, user && user.lastName].filter(Boolean).join(' ').trim() || 'тренера';
  return 'тренера ' + name;
}

function audienceTitle(type) {
  if (type === AUDIENCE.OWN_ALL) return 'своїм клієнтам (усім)';
  if (type === AUDIENCE.OWN_ACTIVE) return 'своїм клієнтам (активним)';
  if (type === AUDIENCE.OWN_SLEEPING) return 'своїм клієнтам (сплячим)';
  if (type === AUDIENCE.POTENTIAL) return 'потенційним клієнтам';
  return type || '—';
}

async function requireSender(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Користувача не знайдено. Натисни /start.');
    return null;
  }
  if (User.isCoach(user)) return { user, role: CONSTANTS.ROLES.COACH };
  if (User.isVenueOwner(user)) return { user, role: CONSTANTS.ROLES.VENUE_OWNER };
  await Helpers.safeSend(chatId, '❌ Розсилка доступна тренеру та власнику закладу.');
  return null;
}

async function hasBroadcastToday(senderChatId, venueId = null) {
  const since = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
  const rows = await supabase.listBroadcastLogSince(senderChatId, since, venueId || null);
  const today = kyivYmd();
  return rows.some((r) => r.createdAt && kyivYmd(r.createdAt) === today);
}

async function assertDailyLimit(chatId, role, venueId) {
  const used = await hasBroadcastToday(chatId, role === CONSTANTS.ROLES.VENUE_OWNER ? venueId : null);
  if (!used) return true;
  await Helpers.safeSend(
    chatId,
    '⏳ Ліміт розсилки на сьогодні вичерпано (календарна доба, Київ).\nНаступна розсилка — завтра.'
  );
  return false;
}

async function showBroadcastMenu(chatId) {
  const ctx = await requireSender(chatId);
  if (!ctx) return;
  if (ctx.role === CONSTANTS.ROLES.VENUE_OWNER) {
    const venues = await supabase.listVenuesForManager(chatId);
    if (!venues.length) {
      await Helpers.sendKeyboard(
        chatId,
        '📣 Розсилка\n\nСпочатку адміністратор має прив’язати заклад до вашого акаунта.',
        [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
      );
      return;
    }
    if (venues.length === 1) {
      await State.update(chatId, {
        step: null,
        bcRole: ctx.role,
        bcVenueId: String(venues[0].id),
        bcVenueName: venues[0].nameUa || 'Заклад',
        bcCity: '',
        bcAudience: null,
        bcText: ''
      });
      await showAudienceChoice(chatId, venues[0]);
      return;
    }
    await State.update(chatId, {
      step: null,
      bcRole: ctx.role,
      bcPendingVenues: venues.map((v) => ({
        id: String(v.id),
        name: v.nameUa || 'Заклад',
        city: String(v.city || '').trim()
      })),
      bcVenueId: '',
      bcAudience: null,
      bcText: ''
    });
    const keyboard = venues.map((v, i) => [
      {
        text: ('🏢 ' + (v.nameUa || 'Заклад') + (v.city ? ' · ' + v.city : '')).slice(0, 64),
        callback_data: CONSTANTS.CALLBACK_PREFIXES.BC_VEN + ':' + i
      }
    ]);
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    await Helpers.sendKeyboard(chatId, '📣 Розсилка\n\nОберіть заклад:', keyboard);
    return;
  }
  await State.update(chatId, {
    step: null,
    bcRole: ctx.role,
    bcVenueId: '',
    bcVenueName: '',
    bcCity: '',
    bcAudience: null,
    bcText: ''
  });
  await showAudienceChoice(chatId, null);
}

async function showAudienceChoice(chatId, venue) {
  const title = venue ? '📣 Розсилка · ' + (venue.nameUa || 'Заклад') : '📣 Розсилка';
  const keyboard = [
    [{ text: '👥 Своїм клієнтам', callback_data: CONSTANTS.CALLBACKS.BC_OWN }],
    [{ text: '📍 Потенційним клієнтам', callback_data: CONSTANTS.CALLBACKS.BC_POT }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    title +
      '\n\nСвої клієнти отримують повідомлення завжди.\nПотенційні — лише користувачі з увімкненими новинами у місті.',
    keyboard
  );
}

async function showCoachOwnSubtype(chatId) {
  const keyboard = [
    [{ text: 'Усім своїм', callback_data: CONSTANTS.CALLBACKS.BC_OWN_ALL }],
    [{ text: 'Лише активним', callback_data: CONSTANTS.CALLBACKS.BC_OWN_ACT }],
    [{ text: 'Лише сплячим', callback_data: CONSTANTS.CALLBACKS.BC_OWN_SLP }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '👥 Свої клієнти\n\nАктивний: майбутній запис, тренування за 30 днів або активний план.\nСплячий: свій клієнт без цих ознак.\nАрхів і інвайти не входять.',
    keyboard
  );
}

function collectCoachCityOptions(user, venues) {
  const options = [];
  const seen = new Set();
  const profileCity = String(user && user.city ? user.city : '').trim();
  if (profileCity) {
    seen.add(profileCity.toLowerCase());
    options.push({ city: profileCity, label: 'Місто профілю: ' + profileCity, venueId: '' });
  }
  for (const v of venues || []) {
    const city = String(v.city || '').trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      city,
      label: (v.nameUa || 'Клуб') + ': ' + city,
      venueId: String(v.id || '')
    });
  }
  return options;
}

async function startPotentialCoach(chatId, user) {
  const venues = await supabase.getCoachVenues(chatId);
  const options = collectCoachCityOptions(user, venues);
  if (!options.length) {
    await Helpers.sendKeyboard(
      chatId,
      '📍 Спочатку вкажи місто в профілі або додай заклад із містом.\n\nМій профіль → Редагувати дані → Місто.',
      [
        [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
        [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return;
  }
  if (options.length === 1) {
    await State.update(chatId, {
      bcAudience: AUDIENCE.POTENTIAL,
      bcCity: options[0].city,
      bcCityLabel: options[0].label,
      bcText: ''
    });
    await askBroadcastText(chatId);
    return;
  }
  await State.update(chatId, { bcPendingCities: options, bcAudience: AUDIENCE.POTENTIAL, bcText: '' });
  const keyboard = options.map((o, i) => [
    { text: String(o.label).slice(0, 64), callback_data: CONSTANTS.CALLBACK_PREFIXES.BC_CITY + ':' + i }
  ]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }]);
  await Helpers.sendKeyboard(chatId, '📍 Оберіть місто для потенційної розсилки (одне на сьогодні):', keyboard);
}

async function startPotentialVenue(chatId, venue) {
  const city = String(venue && venue.city ? venue.city : '').trim();
  if (!city) {
    await Helpers.sendKeyboard(
      chatId,
      '📍 Спочатку вкажіть місто закладу. Зверніться до адміністратора платформи.',
      [
        [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return;
  }
  await State.update(chatId, {
    bcAudience: AUDIENCE.POTENTIAL,
    bcCity: city,
    bcCityLabel: city,
    bcText: ''
  });
  await askBroadcastText(chatId);
}

async function askBroadcastText(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.BROADCAST_TEXT, bcText: '' });
  const st = await State.get(chatId);
  const who = audienceTitle(st && st.bcAudience);
  const cityLine = st && st.bcCity ? '\nМісто: ' + st.bcCity : '';
  await Helpers.sendKeyboard(
    chatId,
    '✍️ Напишіть текст розсилки (до ' +
      TEXT_MAX +
      ' символів).\n\nКому: ' +
      who +
      cityLine +
      '\n\nСлужбовий рядок «Повідомлення від …» і кнопка профілю додаються автоматично.',
    [
      [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.BC_CANCEL }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
}

async function resolveOwnCoachRecipients(coachChatId, subtype) {
  const students = await supabase.getStudentsByCoachId(coachChatId);
  let skipped = 0;
  const candidates = [];
  for (const s of students || []) {
    const id = String(s.chatId || '').trim();
    if (!id || isInviteChatId(id) || !isSendableChatId(id)) {
      skipped += 1;
      continue;
    }
    candidates.push(s);
  }
  if (subtype === AUDIENCE.OWN_ALL) {
    return { sendIds: candidates.map((s) => String(s.chatId)), skipped };
  }
  const ids = candidates.map((s) => String(s.chatId));
  const upcoming = new Set(await supabase.listStudentIdsWithUpcomingBookings(ids));
  const recent = new Set(await supabase.listStudentIdsWithRecentWorkouts(ids, 30));
  const sendIds = [];
  for (const s of candidates) {
    const id = String(s.chatId);
    const active = !!s.activePlanId || upcoming.has(id) || recent.has(id);
    if (subtype === AUDIENCE.OWN_ACTIVE && active) sendIds.push(id);
    if (subtype === AUDIENCE.OWN_SLEEPING && !active) sendIds.push(id);
  }
  return { sendIds, skipped };
}

async function resolveOwnVenueRecipients(venueId, excludeChatId) {
  const ids = await supabase.listUserChatIdsLinkedToVenue(venueId, excludeChatId);
  let skipped = 0;
  const sendIds = [];
  for (const id of ids) {
    if (!isSendableChatId(id)) {
      skipped += 1;
      continue;
    }
    sendIds.push(id);
  }
  return { sendIds, skipped };
}

async function resolvePotentialRecipients(st, senderChatId) {
  const city = String(st.bcCity || '').trim();
  if (!city) return { sendIds: [], skipped: 0 };
  const isCoach = st.bcRole === CONSTANTS.ROLES.COACH;
  const sendIds = await supabase.listBroadcastPotentialChatIds({
    city,
    excludeChatId: senderChatId,
    excludeCoachId: isCoach ? senderChatId : '',
    requireNoActiveCoach: isCoach,
    excludeVenueId: !isCoach && st.bcVenueId ? String(st.bcVenueId) : '',
    adsOnly: true
  });
  return { sendIds: sendIds.filter(isSendableChatId), skipped: 0 };
}

async function showPreview(chatId) {
  const ctx = await requireSender(chatId);
  if (!ctx) return;
  const st = await State.get(chatId);
  if (!st || !st.bcAudience || !st.bcText) {
    await Helpers.safeSend(chatId, '⚠️ Немає тексту розсилки. Почніть знову.');
    await showBroadcastMenu(chatId);
    return;
  }
  const venueId = st.bcVenueId ? String(st.bcVenueId) : '';
  if (!(await assertDailyLimit(chatId, ctx.role, venueId || null))) return;

  let resolved;
  if (st.bcAudience === AUDIENCE.POTENTIAL) {
    resolved = await resolvePotentialRecipients(st, String(chatId));
  } else if (ctx.role === CONSTANTS.ROLES.COACH) {
    resolved = await resolveOwnCoachRecipients(String(chatId), st.bcAudience);
  } else {
    resolved = await resolveOwnVenueRecipients(venueId, String(chatId));
  }
  await State.update(chatId, {
    step: null,
    bcPreviewIds: resolved.sendIds,
    bcPreviewSkipped: resolved.skipped
  });
  const snippet = String(st.bcText).length > 180 ? String(st.bcText).slice(0, 177) + '…' : st.bcText;
  const n = resolved.sendIds.length;
  const lines = [
    '👁 Перегляд розсилки',
    '',
    'Кому: ' + audienceTitle(st.bcAudience),
    st.bcVenueName ? 'Заклад: ' + st.bcVenueName : '',
    st.bcCity ? 'Місто: ' + st.bcCity : '',
    'Буде надіслано: ' + n,
    resolved.skipped ? 'Пропущено (інвайти / без Telegram): ' + resolved.skipped : '',
    '',
    'Текст:',
    snippet
  ].filter(Boolean);
  if (n === 0) {
    await Helpers.sendKeyboard(
      chatId,
      lines.join('\n') + '\n\n❌ Немає отримувачів — відправку заблоковано.',
      [
        [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return;
  }
  await Helpers.sendKeyboard(chatId, lines.join('\n'), [
    [{ text: '✅ Надіслати', callback_data: CONSTANTS.CALLBACKS.BC_OK }],
    [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.BC_CANCEL }]
  ]);
}

async function executeSend(chatId) {
  const ctx = await requireSender(chatId);
  if (!ctx) return;
  const st = await State.get(chatId);
  if (!st || !st.bcAudience || !st.bcText) {
    await Helpers.safeSend(chatId, '⚠️ Розсилку скасовано. Почніть знову.');
    return;
  }
  const venueId = st.bcVenueId ? String(st.bcVenueId) : '';
  if (!(await assertDailyLimit(chatId, ctx.role, venueId || null))) return;

  let sendIds = Array.isArray(st.bcPreviewIds) ? st.bcPreviewIds.map(String) : [];
  let skipped = Number(st.bcPreviewSkipped) || 0;
  if (!sendIds.length) {
    await Helpers.safeSend(chatId, '❌ Немає отримувачів — відправку заблоковано.');
    return;
  }

  let venue = null;
  if (venueId) venue = await supabase.getVenueById(venueId);
  const header = 'Повідомлення від ' + senderLabel(ctx.user, ctx.role === CONSTANTS.ROLES.VENUE_OWNER ? venue : null);
  const body = header + '\n\n' + String(st.bcText);
  const keyboard = [];
  if (ctx.role === CONSTANTS.ROLES.VENUE_OWNER && venueId) {
    keyboard.push([{ text: '📋 Відкрити профіль закладу', callback_data: CONSTANTS.CALLBACKS.VENUES_CARD + ':' + venueId }]);
  } else {
    keyboard.push([
      { text: '📋 Відкрити профіль тренера', callback_data: CONSTANTS.CALLBACK_PREFIXES.PVCH + ':' + String(chatId) }
    ]);
  }

  await State.clear(chatId);
  await Helpers.safeSend(chatId, '⏳ Надсилаю ' + sendIds.length + ' повідомлень…');

  let sent = 0;
  let failed = 0;
  for (const toId of sendIds) {
    const res = await Helpers.sendKeyboard(toId, body, keyboard);
    if (res) sent += 1;
    else failed += 1;
    await sleep(SEND_DELAY_MS);
  }
  await supabase.insertBroadcastLog({
    senderChatId: String(chatId),
    senderRole: ctx.role,
    venueId: venueId || null,
    audienceType: st.bcAudience,
    city: st.bcCity || '',
    body: String(st.bcText),
    sentCount: sent,
    skippedCount: skipped,
    failedCount: failed
  });
  await Helpers.sendKeyboard(
    chatId,
    '✅ Розсилку завершено.\n\nНадіслано: ' + sent + '\nНе доставлено: ' + failed + (skipped ? '\nПропущено: ' + skipped : ''),
    [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
  );
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.MENU_BROADCAST) {
    await showBroadcastMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.BC_VEN && param !== '') {
    const ctx = await requireSender(chatId);
    if (!ctx || ctx.role !== CONSTANTS.ROLES.VENUE_OWNER) return true;
    const st = await State.get(chatId);
    const list = (st && st.bcPendingVenues) || [];
    const idx = parseInt(param, 10);
    const item = list[idx];
    if (!item) {
      await Helpers.safeSend(chatId, '❌ Заклад не знайдено. Оберіть знову.');
      await showBroadcastMenu(chatId);
      return true;
    }
    if (!(await assertDailyLimit(chatId, ctx.role, item.id))) return true;
    await State.update(chatId, {
      bcVenueId: item.id,
      bcVenueName: item.name,
      bcPendingVenues: null
    });
    const venue = await supabase.getVenueById(item.id);
    await showAudienceChoice(chatId, venue || { nameUa: item.name, city: item.city, id: item.id });
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BC_OWN) {
    const ctx = await requireSender(chatId);
    if (!ctx) return true;
    const st = await State.get(chatId);
    if (ctx.role === CONSTANTS.ROLES.VENUE_OWNER) {
      const venueId = st && st.bcVenueId ? String(st.bcVenueId) : '';
      if (!venueId) {
        await showBroadcastMenu(chatId);
        return true;
      }
      if (!(await assertDailyLimit(chatId, ctx.role, venueId))) return true;
      await State.update(chatId, { bcAudience: AUDIENCE.OWN_ALL, bcCity: '', bcText: '' });
      await askBroadcastText(chatId);
      return true;
    }
    if (!(await assertDailyLimit(chatId, ctx.role, null))) return true;
    await showCoachOwnSubtype(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BC_OWN_ALL || action === CONSTANTS.CALLBACKS.BC_OWN_ACT || action === CONSTANTS.CALLBACKS.BC_OWN_SLP) {
    const ctx = await requireSender(chatId);
    if (!ctx || ctx.role !== CONSTANTS.ROLES.COACH) return true;
    if (!(await assertDailyLimit(chatId, ctx.role, null))) return true;
    const map = {
      [CONSTANTS.CALLBACKS.BC_OWN_ALL]: AUDIENCE.OWN_ALL,
      [CONSTANTS.CALLBACKS.BC_OWN_ACT]: AUDIENCE.OWN_ACTIVE,
      [CONSTANTS.CALLBACKS.BC_OWN_SLP]: AUDIENCE.OWN_SLEEPING
    };
    await State.update(chatId, { bcAudience: map[action], bcCity: '', bcText: '' });
    await askBroadcastText(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BC_POT) {
    const ctx = await requireSender(chatId);
    if (!ctx) return true;
    const st = await State.get(chatId);
    if (ctx.role === CONSTANTS.ROLES.VENUE_OWNER) {
      const venueId = st && st.bcVenueId ? String(st.bcVenueId) : '';
      if (!venueId) {
        await showBroadcastMenu(chatId);
        return true;
      }
      if (!(await assertDailyLimit(chatId, ctx.role, venueId))) return true;
      const venue = await supabase.getVenueById(venueId);
      await startPotentialVenue(chatId, venue);
      return true;
    }
    if (!(await assertDailyLimit(chatId, ctx.role, null))) return true;
    await startPotentialCoach(chatId, ctx.user);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.BC_CITY && param !== '') {
    const ctx = await requireSender(chatId);
    if (!ctx) return true;
    const st = await State.get(chatId);
    const list = (st && st.bcPendingCities) || [];
    const idx = parseInt(param, 10);
    const item = list[idx];
    if (!item) {
      await Helpers.safeSend(chatId, '❌ Місто не знайдено. Оберіть знову.');
      await startPotentialCoach(chatId, ctx.user);
      return true;
    }
    await State.update(chatId, {
      bcAudience: AUDIENCE.POTENTIAL,
      bcCity: item.city,
      bcCityLabel: item.label,
      bcPendingCities: null,
      bcText: ''
    });
    await askBroadcastText(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BC_CANCEL) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Розсилку скасовано.');
    const Menu = require('./menu');
    await Menu.show(chatId, { force: true });
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BC_OK) {
    executeSend(chatId).catch((e) => console.error('broadcast.executeSend', e && e.message));
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const st = await State.get(chatId);
  if (!st || st.step !== CONSTANTS.FSM_STATES.BROADCAST_TEXT) return false;
  const ctx = await requireSender(chatId);
  if (!ctx) return true;
  const raw = String(text || '').trim();
  if (!raw) {
    await Helpers.safeSend(chatId, '⚠️ Надішліть текст повідомлення.');
    return true;
  }
  if (charCount(raw) > TEXT_MAX) {
    await Helpers.safeSend(
      chatId,
      '⚠️ Занадто довго: ' + charCount(raw) + ' з ' + TEXT_MAX + ' символів. Скоротіть текст і надішліть знову.'
    );
    return true;
  }
  await State.update(chatId, { bcText: raw, step: null });
  await showPreview(chatId);
  return true;
}

module.exports = {
  showBroadcastMenu,
  handleCallback,
  handleTextMessage,
  TEXT_MAX
};
