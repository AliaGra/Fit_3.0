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
    [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }],
    [{ text: '💡 Підказки', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }],
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
  const keyboard = [
    [{ text: '👁 Як бачать учні', callback_data: CONSTANTS.CALLBACKS.VO_PREVIEW }],
    [{ text: '✏️ Контакти та адреса', callback_data: CONSTANTS.CALLBACKS.VO_CONTACTS }],
    [{ text: '🏷 Групові заняття', callback_data: CONSTANTS.CALLBACKS.VO_GROUPS }],
    [{ text: '💰 Ціни', callback_data: CONSTANTS.CALLBACKS.VO_PRICES }],
    [{ text: '📅 Розклад групових (перегляд)', callback_data: CONSTANTS.CALLBACKS.VO_SCHEDULE }],
    [{ text: '🧑‍🏫 Тренери закладу', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }],
    [{ text: '🔙 Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '🏢 **' +
      (v.nameUa || 'Заклад') +
      '**\n\n' +
      v.city +
      ', ' +
      v.oblast +
      '\n\nОберіть розділ. Створення закладу та зміна координат — через адміністратора платформи.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showVenuePreview(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const Venues = require('./venues');
  await Venues.sendVenueCardMessage(chatId, ctx.venue, { st: {} });
  const keyboard = [[{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]];
  await Helpers.sendKeyboard(chatId, '👆 Так картку бачать користувачі в «Клуби, студії».', keyboard);
}

function formatContactField(label, value, asLink) {
  if (!value) return label + ' —';
  const esc = Helpers.escapeHtml(String(value));
  if (asLink && /^https?:\/\//i.test(String(value))) {
    return label + ' <a href="' + esc + '">' + esc + '</a>';
  }
  return label + ' ' + esc;
}

async function showContactsMenu(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const v = ctx.venue;
  const keyboard = [
    [{ text: '📞 Телефон', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_PHONE }],
    [{ text: '🔗 Telegram', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_TG }],
    [{ text: '📸 Instagram', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_IG }],
    [{ text: '📫 Адреса', callback_data: CONSTANTS.CALLBACKS.VO_EDIT_ADDRESS }],
    [{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]
  ];
  const text =
    '<b>✏️ Контакти та адреса</b>\n\n' +
    formatContactField('📞', v.phone, false) +
    '\n' +
    formatContactField('🔗', v.telegramUrl, true) +
    '\n' +
    formatContactField('📸', v.instagramUrl, true) +
    '\n' +
    formatContactField('📫', v.address, false);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
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

async function showGroupsPicker(chatId, page) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const pg = Math.max(0, parseInt(String(page), 10) || 0);
  const dir = await supabase.getVenueDirectoryCodes('group_class');
  const selected = getSelectedGroupCodes(ctx.venue);
  const start = pg * GROUPS_PER_PAGE;
  const slice = dir.slice(start, start + GROUPS_PER_PAGE);
  const keyboard = slice.map((d) => {
    const on = selected.has(d.code);
    return [{ text: (on ? '✅ ' : '☐ ') + d.labelUa.slice(0, 48), callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':' + d.code }];
  });
  const nav = [];
  if (start > 0) nav.push({ text: '◀️', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':page:' + (pg - 1) });
  if (start + GROUPS_PER_PAGE < dir.length) nav.push({ text: '▶️', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE + ':page:' + (pg + 1) });
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]);
  await Helpers.sendKeyboard(
    chatId,
    '🏷 **Групові заняття**\n\nОбери коди з довідника (натисни, щоб увімкнути/вимкнути). Зміни зберігаються одразу.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function toggleGroupClass(chatId, code) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const selected = getSelectedGroupCodes(ctx.venue);
  if (selected.has(code)) selected.delete(code);
  else selected.add(code);
  const facets = [];
  for (const f of ctx.venue.facets || []) {
    if (f.facetKind !== 'group_class') facets.push({ facetKind: f.facetKind, code: f.code, labelUa: f.labelUa });
  }
  for (const c of selected) facets.push({ facetKind: 'group_class', code: c });
  await supabase.replaceVenueFacetsByManager(chatId, ctx.venueId, facets);
}

async function showScheduleReadOnly(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const sched = await supabase.listVenueSchedule(ctx.venueId, 40);
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));
  let text = '📅 **Розклад групових** (перегляд)\n\n';
  if (!sched.length) {
    text += 'Поки немає записів.\n\nРедагування розкладу — через адміністратора платформи (фаза 0).';
  } else {
    text += sched
      .map((x) => {
        const gc = x.groupClassCode ? gcMap.get(x.groupClassCode) || x.groupClassCode : '';
        return (WD[x.weekday] || x.weekday) + ' ' + (x.timeStart || '—') + '–' + (x.timeEnd || '—') + ' · ' + (x.title || gc || '—');
      })
      .join('\n');
    text += '\n\n_Змінити розклад — зверніться до підтримки._';
  }
  const keyboard = [[{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showCoachesList(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const coaches = await supabase.listVenueCoachesForManager(ctx.venueId);
  let text = '🧑‍🏫 **Тренери закладу**\n\n';
  if (!coaches.length) {
    text += 'Поки немає тренерів з відміткою «де треную».\n\nТренери додають заклад у своєму профілі.';
  } else {
    for (const c of coaches) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.chatId;
      const vis = c.listingVisible ? '✅ на картці' : '⏸ приховано';
      text += '• ' + name + ' — ' + vis + '\n';
    }
  }
  const keyboard = [];
  for (const c of coaches.slice(0, 12)) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
    const label = (name.length > 40 ? name.slice(0, 37) + '…' : name);
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_VIEW + ':' + c.chatId }]);
  }
  keyboard.push([{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showCoachDetail(chatId, coachChatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const coaches = await supabase.listVenueCoachesForManager(ctx.venueId);
  const c = coaches.find((x) => String(x.chatId) === String(coachChatId));
  if (!c) {
    await showCoachesList(chatId);
    return;
  }
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
  const keyboard = [];
  if (!c.listingVisible) {
    keyboard.push([{ text: '✅ Показати на картці', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_APPROVE + ':' + c.chatId }]);
  } else {
    keyboard.push([{ text: '⏸ Приховати з картки', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_HIDE + ':' + c.chatId }]);
  }
  keyboard.push([{ text: '🚫 Відв’язати від закладу', callback_data: CONSTANTS.CALLBACK_PREFIXES.VO_COACH_REMOVE + ':' + c.chatId }]);
  keyboard.push([{ text: '🔙 До списку тренерів', callback_data: CONSTANTS.CALLBACKS.VO_COACHES }]);
  await Helpers.sendKeyboard(
    chatId,
    '**' +
      name +
      '**\n\n' +
      (c.listingVisible ? 'Відображається на публічній картці закладу.' : 'Прихований на картці (прив’язка залишається).') +
      (c.instagram ? '\n📸 ' + c.instagram : ''),
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showVenuePricesForOwner(chatId) {
  const ctx = await requireManagedVenue(chatId);
  if (!ctx) return;
  const Venues = require('./venues');
  await Venues.showVenuePrices(chatId, ctx.venueId);
  const keyboard = [[{ text: '🔙 Мій заклад', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]];
  await Helpers.sendKeyboard(
    chatId,
    '💰 Ціни — перегляд.\n\nРедагування повного довідника цін — через адміністратора (фаза 0). Напишіть у підтримку, якщо потрібно оновити тарифи.',
    keyboard
  );
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.VO_HUB) {
    await showVenueHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_PREVIEW) {
    await showVenuePreview(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_CONTACTS) {
    await showContactsMenu(chatId);
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
    await showGroupsPicker(chatId, 0);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VO_GROUP_TOGGLE) {
    if (param.startsWith('page:')) {
      await showGroupsPicker(chatId, param.slice(5));
      return true;
    }
    await toggleGroupClass(chatId, param);
    const pg = 0;
    const dir = await supabase.getVenueDirectoryCodes('group_class');
    const idx = dir.findIndex((d) => d.code === param);
    const page = idx >= 0 ? Math.floor(idx / GROUPS_PER_PAGE) : 0;
    await showGroupsPicker(chatId, page);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_PRICES) {
    await showVenuePricesForOwner(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_SCHEDULE) {
    await showScheduleReadOnly(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VO_COACHES) {
    await showCoachesList(chatId);
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
      await showCoachesList(chatId);
    }
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
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
  const raw = String(text || '').trim();
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
  await showContactsMenu(chatId);
  return true;
}

module.exports = {
  showVenueOwnerMenu,
  showVenueHub,
  handleCallback,
  handleTextMessage,
  requireManagedVenue
};
