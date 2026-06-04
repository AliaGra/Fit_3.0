/**
 * Власник закладу (фаза 0): редагування свого закладу, ціни, групові, тренери.
 * Без учнів, розкладу тренувань і планів.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const State = require('./state');
const User = require('./user');
const supabase = require('./supabase');

const GROUPS_PER_PAGE = 8;
const GROUP_SEARCH_MIN_LEN = 3;
const WD = Object.freeze({ 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' });

async function requireManagedVenue(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.VENUE_OWNER) {
    await Helpers.safeSend(chatId, '❌ Доступ лише для власника закладу.');
    return null;
  }
  const venueId = await supabase.getVenueIdForManager(chatId);
  if (!venueId) {
    await Helpers.safeSend(
      chatId,
      '⏳ Заклад ще не прив’язано до вашого акаунта.\n\n' +
        'Зверніться до підтримки FIT 3.0 — адміністратор призначить вас власником після реєстрації як **Власник закладу**.'
    );
    await showUnlinkedMenu(chatId);
    return null;
  }
  const venue = await supabase.getVenueById(venueId);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено в системі.');
    return null;
  }
  return { user, venueId, venue };
}

function sectionFooterKeyboard(editCallback) {
  const keyboard = [];
  if (editCallback) {
    keyboard.push([{ text: '✏️ Змінити', callback_data: editCallback }]);
  }
  keyboard.push([
    { text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU },
    { text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }
  ]);
  return keyboard;
}

async function showUnlinkedMenu(chatId) {
  const keyboard = [
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '🏢 **Мій заклад**\n\nОчікується прив’язка закладу адміністратором.', keyboard, {
    parse_mode: 'Markdown'
  });
}

async function showVenueOwnerMenu(chatId, user) {
  const firstName = (user && user.firstName) || 'колего';
  const venueId = await supabase.getVenueIdForManager(chatId);
  let sub = '\n\n_(заклад не прив’язано)_';
  if (venueId) {
    const v = await supabase.getVenueById(venueId);
    if (v) sub = '\n\n📍 **' + (v.nameUa || 'Заклад') + '**';
  }
  const keyboard = [
    [{ text: '🏢 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }],
    [{ text: '🧑‍🏫 Тренери закладу', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }],
    [{ text: '🏢 Клуби, студії', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }],
    [{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '👋 Привіт, ' + firstName + '!\n\n🏢 Головне меню власника закладу' + sub,
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showVenueHub(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const v = ctx.venue;
  const place = [v.city, v.oblast].filter(Boolean).join(', ') || '—';
  const keyboard = [
    [{ text: '👁 Як бачать користувачі платформи ваш клуб', callback_data: CONSTANTS.CALLBACKS.VO_PREVIEW }],
    [{ text: '📇 Контакти та адреса', callback_data: CONSTANTS.CALLBACKS.VO_CONTACTS }],
    [{ text: '🏷 Групові заняття', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS }],
    [{ text: '💰 Ціни', callback_data: CONSTANTS.CALLBACKS.VO_PRICES }],
    [{ text: '📅 Розклад групових', callback_data: CONSTANTS.CALLBACKS.VO_SCHEDULE }],
    [{ text: '🧑‍🏫 Тренери закладу', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }],
    [{ text: '🔙 Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '<b>🏢 ' +
      Helpers.escapeHtml(v.nameUa || 'Заклад') +
      '</b>\n\n' +
      Helpers.escapeHtml(place) +
      '\n\nОберіть розділ. Спочатку показується те, що вже є на платформі; де можна — кнопка <b>Змінити</b>.',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function showVenuePreview(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const Venues = require('./venues');
  await Venues.sendVenueCardMessage(chatId, ctx.venue, { st: {} });
  const keyboard = [
    [{ text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU }],
    [{ text: '🔙 Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '👆 Так сторінку вашого клубу бачать <b>користувачі платформи</b> в розділі «Клуби, студії».',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

function formatContactField(label, value, asLink) {
  if (!value) return label + ' —';
  const esc = Helpers.escapeHtml(String(value));
  if (asLink && /^https?:\/\//i.test(String(value))) {
    return label + ' <a href="' + esc + '">' + esc + '</a>';
  }
  return label + ' ' + esc;
}

function buildContactsInfoHtml(v) {
  return (
    '<b>📇 Контакти та адреса</b> (на платформі зараз)\n\n' +
    formatContactField('📞', v.phone, false) +
    '\n' +
    formatContactField('🔗', v.telegramUrl, true) +
    '\n' +
    formatContactField('📸', v.instagramUrl, true) +
    '\n' +
    formatContactField('📫', v.address, false)
  );
}

async function showContactsView(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  await Helpers.sendKeyboard(
    chatId,
    buildContactsInfoHtml(ctx.venue),
    sectionFooterKeyboard(CONSTANTS.CALLBACKS.VO_CONTACTS_EDIT),
    { parse_mode: 'HTML' }
  );
}

async function showContactsEditMenu(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const keyboard = [
    [{ text: '📞 Телефон', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_PHONE }],
    [{ text: '🔗 Telegram', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_TG }],
    [{ text: '📸 Instagram', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_IG }],
    [{ text: '📫 Адреса', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_ADDRESS }],
    [{ text: '🔙 До перегляду', callback_data: CONSTANTS.CALLBACKS.VO_CONTACTS }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    buildContactsInfoHtml(ctx.venue) + '\n\n<i>Обери поле для зміни. «-» — очистити значення.</i>',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function promptContactEdit(chatId, field) {
  const labels = {
    phone: 'телефон',
    tg: 'посилання Telegram (https://… або @username)',
    ig: 'посилання Instagram (https://…)',
    address: 'адресу (текст)'
  };
  const steps = {
    phone: CONSTANTS.FSM_STATES.VO_EDIT_PHONE,
    tg: CONSTANTS.FSM_STATES.VO_EDIT_TG,
    ig: CONSTANTS.FSM_STATES.VO_EDIT_IG,
    address: CONSTANTS.FSM_STATES.VO_EDIT_ADDRESS
  };
  await State.update(chatId, { step: steps[field], voEditField: field });
  await Helpers.safeSend(chatId, '✏️ Введи новий ' + (labels[field] || 'значення') + ':\n\n_(надішли «-» щоб очистити)_');
}

function getSelectedGroupCodes(venue) {
  const set = new Set();
  for (const f of venue.facets || []) {
    if (f.facetKind === 'group_class' && f.code) set.add(String(f.code));
  }
  return set;
}

async function buildGroupsInfoHtml(venue) {
  const dir = await supabase.getVenueDirectoryCodes('group_class');
  const map = new Map(dir.map((d) => [d.code, d.labelUa]));
  const selected = getSelectedGroupCodes(venue);
  let body = '<b>🏷 Групові заняття</b> (на картці зараз)\n\n';
  if (!selected.size) {
    body += '<i>Не обрано жодного коду з довідника.</i>';
  } else {
    for (const code of selected) {
      body += '• ' + Helpers.escapeHtml(map.get(code) || code) + '\n';
    }
  }
  return body.trim();
}

async function showGroupsView(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const text = (await buildGroupsInfoHtml(ctx.venue)) + '\n\n<i>Зміни зберігаються одразу після вибору в режимі редагування.</i>';
  await Helpers.sendKeyboard(chatId, text, sectionFooterKeyboard(CONSTANTS.CALLBACKS.VO_GROUPS_EDIT), {
    parse_mode: 'HTML'
  });
}

function filterGroupDirectory(dir, query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < GROUP_SEARCH_MIN_LEN) return dir;
  return dir.filter((d) => {
    const lab = String(d.labelUa || '').toLowerCase();
    const code = String(d.code || '').toLowerCase();
    return lab.includes(q) || code.includes(q);
  });
}

async function showGroupsPicker(chatId, page) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const st = await State.get(chatId);
  const search = st && st.voGroupSearch ? String(st.voGroupSearch) : '';
  const pg = Math.max(0, parseInt(String(page), 10) || 0);
  const dirAll = await supabase.getVenueDirectoryCodes('group_class');
  const dir = filterGroupDirectory(dirAll, search);
  const selected = getSelectedGroupCodes(ctx.venue);
  const start = pg * GROUPS_PER_PAGE;
  const slice = dir.slice(start, start + GROUPS_PER_PAGE);

  let header = (await buildGroupsInfoHtml(ctx.venue)) + '\n\n<b>Редагування</b>\n';
  if (search.length >= GROUP_SEARCH_MIN_LEN) {
    header += 'Пошук: «' + Helpers.escapeHtml(search) + '» — знайдено ' + dir.length + '\n\n';
  } else {
    header += 'Обери коди (натисни, щоб увімкнути/вимкнути).\n\n';
  }
  if (!slice.length) {
    header += '<i>Нічого не знайдено. Скинь пошук або введи іншу назву (мін. 3 літери).</i>';
  }

  const keyboard = [];
  for (const d of slice) {
    const on = selected.has(d.code);
    keyboard.push([
      {
        text: (on ? '✅ ' : '☐ ') + d.labelUa.slice(0, 48),
        callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':' + d.code
      }
    ]);
  }
  const nav = [];
  if (start > 0) nav.push({ text: '◀️', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':page:' + (pg - 1) });
  if (start + GROUPS_PER_PAGE < dir.length) {
    nav.push({ text: '▶️', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':page:' + (pg + 1) });
  }
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '🔎 Пошук за назвою', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS_SEARCH }]);
  if (search.length >= GROUP_SEARCH_MIN_LEN) {
    keyboard.push([{ text: '✖️ Скинути пошук', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS_SEARCH_CLEAR }]);
  }
  keyboard.push([{ text: '🔙 До перегляду', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS }]);
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'HTML' });
}

async function promptGroupsSearch(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.VO_GROUPS_SEARCH });
  await Helpers.safeSend(
    chatId,
    '🔎 Введи частину <b>назви</b> групового заняття (мінімум ' +
      GROUP_SEARCH_MIN_LEN +
      ' літери).\n\nНаприклад: йога, бокс, піл…',
    { parse_mode: 'HTML' }
  );
}

async function toggleGroupClass(chatId, code) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const selected = getSelectedGroupCodes(ctx.venue);
  if (selected.has(code)) selected.delete(code);
  else selected.add(code);
  const labelByCode = new Map();
  for (const f of ctx.venue.facets || []) {
    if (f.facetKind === 'group_class' && f.code && f.labelUa) {
      labelByCode.set(String(f.code), String(f.labelUa).trim());
    }
  }
  const dir = await supabase.getVenueDirectoryCodes('group_class');
  const dirMap = new Map(dir.map((d) => [d.code, d.labelUa]));
  const facets = [];
  for (const f of ctx.venue.facets || []) {
    if (f.facetKind !== 'group_class') facets.push({ facetKind: f.facetKind, code: f.code, labelUa: f.labelUa });
  }
  for (const c of selected) {
    const lab = labelByCode.get(c) || dirMap.get(c) || null;
    const row = { facetKind: 'group_class', code: c };
    if (lab) row.labelUa = lab;
    facets.push(row);
  }
  await supabase.replaceVenueFacetsByManager(chatId, ctx.venueId, facets);
}

async function buildScheduleInfoHtml(venueId) {
  const sched = await supabase.listVenueSchedule(venueId, 40);
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));
  let body = '<b>📅 Розклад групових</b> (на платформі зараз)\n\n';
  if (!sched.length) {
    body += '<i>Поки немає записів.</i>\n\nРедагування розкладу — через адміністратора (фаза 0).';
  } else {
    body += sched
      .map((x) => {
        const gc = x.groupClassCode ? gcMap.get(x.groupClassCode) || x.groupClassCode : '';
        const line =
          (WD[x.weekday] || x.weekday) +
          ' ' +
          Helpers.escapeHtml(String(x.timeStart || '—')) +
          '–' +
          Helpers.escapeHtml(String(x.timeEnd || '—')) +
          ' · ' +
          Helpers.escapeHtml(String(x.title || gc || '—'));
        return '• ' + line;
      })
      .join('\n');
    body += '\n\n<i>Змінити розклад — зверніться до підтримки.</i>';
  }
  return body;
}

async function showScheduleView(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const text = await buildScheduleInfoHtml(ctx.venueId);
  await Helpers.sendKeyboard(chatId, text, sectionFooterKeyboard(null), { parse_mode: 'HTML' });
}

async function showVenuePricesView(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const Venues = require('./venues');
  const pricesHtml = await Venues.buildVenuePricesHtml(ctx.venueId);
  const text =
    (pricesHtml || '<i>Ціни не заповнені.</i>') +
    '\n\n<i>Редагування довідника цін — через адміністратора (фаза 0).</i>';
  await Helpers.sendKeyboard(chatId, text, sectionFooterKeyboard(null), { parse_mode: 'HTML', disable_web_page_preview: true });
}

async function showCoachesView(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const coaches = await supabase.listVenueCoachesForManager(ctx.venueId);
  let text =
    '<b>🧑‍🏫 Тренери закладу</b>\n\n' +
    '<i>Обери тренера — відкриється його публічна картка, як у користувачів платформи.</i>\n\n';
  if (!coaches.length) {
    text += '<i>Поки немає тренерів з прив’язкою «де треную».</i>\n\nТренери додають заклад у своєму профілі.';
  } else {
    for (const c of coaches) {
      const name = Helpers.escapeHtml([c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер');
      text += '• ' + name + '\n';
    }
  }
  const keyboard = [];
  for (const c of coaches.slice(0, 12)) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
    const label = ('👤 ' + name).length > 64 ? ('👤 ' + name).slice(0, 61) + '…' : '👤 ' + name;
    keyboard.push([
      { text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PVCH + ':' + c.chatId }
    ]);
  }
  keyboard.push([
    { text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU },
    { text: '🔙 Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }
  ]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
}

async function showCoachDetail(chatId, coachChatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const coaches = await supabase.listVenueCoachesForManager(ctx.venueId);
  const c = coaches.find((x) => String(x.chatId) === String(coachChatId));
  if (!c) {
    await showCoachesView(chatId);
    return;
  }
  const name = Helpers.escapeHtml([c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер');
  let text = '<b>' + name + '</b>\n\n';
  text += c.listingVisible
    ? 'На публічній картці закладу.'
    : 'Прихований на картці (прив’язка залишається).';
  if (c.instagram) text += '\n📸 ' + Helpers.escapeHtml(String(c.instagram));
  const keyboard = [];
  if (!c.listingVisible) {
    keyboard.push([{ text: '✅ Показати на картці', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_APPROVE + ':' + c.chatId }]);
  } else {
    keyboard.push([{ text: '⏸ Приховати з картки', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_HIDE + ':' + c.chatId }]);
  }
  keyboard.push([{ text: '🚫 Відв’язати від закладу', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_REMOVE + ':' + c.chatId }]);
  keyboard.push([
    { text: 'Зв’язок з розробником', callback_data: CONSTANTS.CALLBACKS.DEV_CONTACT_MENU },
    { text: '🔙 До списку тренерів', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }
  ]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
}

async function groupsPickerPageForCode(dir, code) {
  const idx = dir.findIndex((d) => d.code === code);
  return idx >= 0 ? Math.floor(idx / GROUPS_PER_PAGE) : 0;
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.VO_HUB || action === CONSTANTS.CALLBACKS.VO_PREVIEW) {
    await showVenuePreview(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_CONTACTS) {
    await showContactsView(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_CONTACTS_EDIT) {
    await showContactsEditMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_EDIT_PHONE) {
    await promptContactEdit(chatId, 'phone');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_EDIT_TG) {
    await promptContactEdit(chatId, 'tg');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_EDIT_IG) {
    await promptContactEdit(chatId, 'ig');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_EDIT_ADDRESS) {
    await promptContactEdit(chatId, 'address');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_GROUPS) {
    await showGroupsView(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_GROUPS_EDIT) {
    await State.update(chatId, { step: null, voGroupSearch: '' });
    await showGroupsPicker(chatId, 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_GROUPS_SEARCH) {
    await promptGroupsSearch(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_GROUPS_SEARCH_CLEAR) {
    await State.update(chatId, { step: null, voGroupSearch: '' });
    await showGroupsPicker(chatId, 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE) {
    if (param.startsWith('page:')) {
      await showGroupsPicker(chatId, param.slice(5));
      return true;
    }
    const st = await State.get(chatId);
    const search = st && st.voGroupSearch ? String(st.voGroupSearch) : '';
    const dirAll = await supabase.getVenueDirectoryCodes('group_class');
    const dir = filterGroupDirectory(dirAll, search);
    await toggleGroupClass(chatId, param);
    const page = await groupsPickerPageForCode(dir, param);
    await showGroupsPicker(chatId, page);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_PRICES) {
    await showVenuePricesView(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_SCHEDULE) {
    await showScheduleView(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_COACHES) {
    await showCoachesView(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_COACH_VIEW && param) {
    await showCoachDetail(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_COACH_APPROVE && param) {
    const ctx = await requireManagedVenue(chatId);
    if (ctx) {
      await supabase.setCoachVenueListingVisible(param, ctx.venueId, true);
      await Helpers.safeSend(chatId, '✅ Тренера показано на картці закладу.');
      await showCoachDetail(chatId, param);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_COACH_HIDE && param) {
    const ctx = await requireManagedVenue(chatId);
    if (ctx) {
      await supabase.setCoachVenueListingVisible(param, ctx.venueId, false);
      await Helpers.safeSend(chatId, '⏸ Тренера приховано на картці.');
      await showCoachDetail(chatId, param);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_COACH_REMOVE && param) {
    const ctx = await requireManagedVenue(chatId);
    if (ctx) {
      await supabase.unlinkCoachVenue(param, ctx.venueId, { teachesHere: true });
      await Helpers.safeSend(chatId, '🚫 Тренера відв’язано від закладу (не показується в «де треную»).');
      await showCoachesView(chatId);
    }
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
  const raw = String(text || '').trim();

  if (step === CONSTANTS.FSM_STATES.VO_GROUPS_SEARCH) {
    if (raw.length < GROUP_SEARCH_MIN_LEN) {
      await Helpers.safeSend(
        chatId,
        '⚠️ Для пошуку потрібно щонайменше ' + GROUP_SEARCH_MIN_LEN + ' літери. Спробуй ще раз:'
      );
      return true;
    }
    await State.update(chatId, { step: null, voGroupSearch: raw });
    await showGroupsPicker(chatId, 0);
    return true;
  }

  if (
    step !== CONSTANTS.FSM_STATES.VO_EDIT_PHONE &&
    step !== CONSTANTS.FSM_STATES.VO_EDIT_TG &&
    step !== CONSTANTS.FSM_STATES.VO_EDIT_IG &&
    step !== CONSTANTS.FSM_STATES.VO_EDIT_ADDRESS
  ) {
    return false;
  }
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return true;
  const clear = raw === '-' || raw === '—';
  const patch = {};
  if (step === CONSTANTS.FSM_STATES.VO_EDIT_PHONE) patch.phone = clear ? null : raw;
  if (step === CONSTANTS.FSM_STATES.VO_EDIT_TG) patch.telegramUrl = clear ? null : raw;
  if (step === CONSTANTS.FSM_STATES.VO_EDIT_IG) patch.instagramUrl = clear ? null : raw;
  if (step === CONSTANTS.FSM_STATES.VO_EDIT_ADDRESS) patch.address = clear ? null : raw;
  const ok = await supabase.updateVenueByManager(chatId, ctx.venueId, patch);
  await State.update(chatId, { step: null, voEditField: null });
  if (!ok) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
    return true;
  }
  await Helpers.safeSend(chatId, '✅ Збережено.');
  await showContactsEditMenu(chatId);
  return true;
}

module.exports = {
  showVenueOwnerMenu,
  showVenueHub,
  handleCallback,
  handleTextMessage,
  requireManagedVenue
};
