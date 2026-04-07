/**
 * Адмін-бот: додавання закладів (координати обовʼязково з Telegram location).
 * Групові заняття — лише вибір з довідника (кнопки), без ручного вводу кодів.
 */
const supabase = require('./supabase');
const AdminTelegram = require('./adminTelegram');

const CB = Object.freeze({
  MENU: 'ADM_VMENU',
  ADD: 'ADM_VADD',
  LIST: 'ADM_VLIST',
  ORG: 'ADM_VORG',
  SKIP_ADDR: 'ADM_VSKA',
  SKIP_FAC: 'ADM_VSKF',
  SKIP_TG: 'ADM_VSKTG',
  SKIP_IG: 'ADM_VSKIG',
  SAVE: 'ADM_VSAVE',
  CANCEL: 'ADM_VCAN',
  /** Тогл коду групового заняття: ADM_VGT:<code> */
  GTOG: 'ADM_VGT',
  /** Сторінка списку: ADM_VGP:<n> */
  GPAGE: 'ADM_VGP',
  /** Підтвердити вибір групових */
  GDONE: 'ADM_VGOK',
  /** Скинути вибрані групові */
  GCLR: 'ADM_VGCL'
});

const GROUPS_PER_PAGE = 8;

/** @type {Map<string, object>} */
const drafts = new Map();

const STEPS = Object.freeze({
  NAME: 'name',
  OBLAST: 'oblast',
  CITY: 'city',
  ADDRESS: 'address',
  LOCATION: 'location',
  ORG: 'org',
  FACETS: 'facets',
  TG: 'tg',
  IG: 'ig'
});

function getDraft(chatId) {
  return drafts.get(String(chatId)) || null;
}

function setDraft(chatId, d) {
  drafts.set(String(chatId), d);
}

function clearDraft(chatId) {
  drafts.delete(String(chatId));
}

function btnLabel(selected, labelUa, code) {
  const base = (selected ? '✓ ' : '☐ ') + String(labelUa || code).trim();
  return base.length > 36 ? base.slice(0, 33) + '…' : base;
}

/**
 * Клавіатура вибору групових занять з довідника (пагінація + мультивибір).
 */
async function showGroupClassPicker(chatId, draft, messageId) {
  const all = await supabase.getVenueDirectoryCodes('group_class');
  const total = all.length;
  if (total === 0) {
    const head =
      '⚠️ <b>Довідник групових занять порожній</b> у таблиці <code>venue_directory_codes</code>.\n\n' +
      'Виконай у Supabase SQL з репозиторію: <code>supabase_migration_venues_seed_directory.sql</code> (після базової міграції venues).\n\n' +
      'Поки можна зберегти заклад <b>без групових</b> або скасувати.';
    const keyboard = [
      [{ text: '⏭️ Без групових', callback_data: CB.SKIP_FAC }],
      [{ text: '❌ Скасувати', callback_data: CB.CANCEL }]
    ];
    if (messageId) {
      await AdminTelegram.editMessageText(chatId, messageId, head, keyboard, { parse_mode: 'HTML' });
    } else {
      const r = await AdminTelegram.sendKeyboard(chatId, head, keyboard, { parse_mode: 'HTML' });
      if (r && r.message_id) draft.groupClassMessageId = r.message_id;
    }
    return;
  }
  const totalPages = Math.max(1, Math.ceil(total / GROUPS_PER_PAGE));
  let page = draft.groupClassPage != null ? Number(draft.groupClassPage) : 0;
  if (page < 0) page = 0;
  if (page > totalPages - 1) page = totalPages - 1;
  draft.groupClassPage = page;

  const selected = new Set(draft.groupClassSelected || []);
  const slice = all.slice(page * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE + GROUPS_PER_PAGE);

  const keyboard = [];
  for (let i = 0; i < slice.length; i += 2) {
    const row = [];
    row.push({
      text: btnLabel(selected.has(slice[i].code), slice[i].labelUa, slice[i].code),
      callback_data: `${CB.GTOG}:${slice[i].code}`
    });
    if (slice[i + 1]) {
      row.push({
        text: btnLabel(selected.has(slice[i + 1].code), slice[i + 1].labelUa, slice[i + 1].code),
        callback_data: `${CB.GTOG}:${slice[i + 1].code}`
      });
    }
    keyboard.push(row);
  }

  const nav = [];
  if (page > 0) nav.push({ text: '◀️', callback_data: `${CB.GPAGE}:${page - 1}` });
  nav.push({
    text: `${page + 1}/${totalPages}`,
    callback_data: `${CB.GPAGE}:${page}`
  });
  if (page < totalPages - 1) nav.push({ text: '▶️', callback_data: `${CB.GPAGE}:${page + 1}` });
  keyboard.push(nav);

  keyboard.push([
    { text: '✅ Готово', callback_data: CB.GDONE },
    { text: '⏭️ Без групових', callback_data: CB.SKIP_FAC }
  ]);
  keyboard.push([{ text: '🔄 Скинути вибір', callback_data: CB.GCLR }]);

  const head =
    '🏷️ <b>Групові заняття</b> (лише з довідника)\n' +
    `Обрано: <b>${selected.size}</b>\n\n` +
    'Натисни на рядок, щоб додати або прибрати тип. Потім — «Готово» або «Без групових».';

  if (messageId) {
    await AdminTelegram.editMessageText(chatId, messageId, head, keyboard, { parse_mode: 'HTML' });
  } else {
    const r = await AdminTelegram.sendKeyboard(chatId, head, keyboard, { parse_mode: 'HTML' });
    if (r && r.message_id) draft.groupClassMessageId = r.message_id;
  }
}

async function showVenueMenu(chatId) {
  clearDraft(chatId);
  const keyboard = [
    [{ text: '➕ Додати заклад', callback_data: CB.ADD }],
    [{ text: '📋 Список закладів', callback_data: CB.LIST }],
    [{ text: '⬅️ Головне адмін-меню', callback_data: 'ADM_MENU' }]
  ];
  await AdminTelegram.sendKeyboard(
    chatId,
    '📍 Заклади (клуби, студії)\n\nОператор додає координати через «надіслати геолокацію» в Telegram.',
    keyboard
  );
}

async function startAddDraft(chatId) {
  setDraft(chatId, { step: STEPS.NAME });
  await AdminTelegram.sendMessage(chatId, 'Введи назву закладу українською:');
}

async function listVenues(chatId) {
  const rows = await supabase.listVenuesForAdmin(30);
  if (!rows.length) {
    await AdminTelegram.sendKeyboard(chatId, 'Поки порожньо.', [[{ text: '⬅️ Назад', callback_data: CB.MENU }]]);
    return;
  }
  let text = '📋 Заклади:\n\n';
  for (const v of rows.slice(0, 20)) {
    text += `• ${v.nameUa} — ${v.city}, ${v.oblast}\n  id: <code>${v.id}</code>\n`;
  }
  await AdminTelegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
  await AdminTelegram.sendKeyboard(chatId, 'Дії:', [[{ text: '⬅️ Назад', callback_data: CB.MENU }]]);
}

async function showOrgKeyboard(chatId) {
  const orgs = await supabase.getVenueDirectoryCodes('organization');
  const keyboard = [];
  for (let i = 0; i < orgs.length; i += 2) {
    const row = [];
    row.push({ text: orgs[i].labelUa.slice(0, 30), callback_data: `${CB.ORG}:${orgs[i].code}` });
    if (orgs[i + 1]) row.push({ text: orgs[i + 1].labelUa.slice(0, 30), callback_data: `${CB.ORG}:${orgs[i + 1].code}` });
    keyboard.push(row);
  }
  keyboard.push([{ text: '❌ Скасувати', callback_data: CB.CANCEL }]);
  await AdminTelegram.sendKeyboard(chatId, 'Обери тип організації:', keyboard);
}

async function saveDraftToDb(chatId, d) {
  const facets = d.parsedFacets || [];
  const id = await supabase.insertVenue({
    nameUa: d.nameUa,
    oblast: d.oblast,
    city: d.city,
    address: d.address || null,
    latitude: d.latitude,
    longitude: d.longitude,
    telegramUrl: d.telegramUrl || null,
    instagramUrl: d.instagramUrl || null,
    organizationType: d.organizationType,
    createdByOperatorChatId: chatId,
    facets
  });
  return id;
}

function goToTelegramStep(chatId, d) {
  d.step = STEPS.TG;
  return AdminTelegram.sendKeyboard(
    chatId,
    'Посилання на Telegram закладу (t.me/…):',
    [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_TG }]]
  );
}

async function handleCallback(chatId, data) {
  const raw = String(data.callbackData || '');
  const parts = raw.split(':');
  const action = parts[0];
  const param = parts.slice(1).join(':');
  const messageId = data.messageId;

  if (action === CB.MENU) {
    await showVenueMenu(chatId);
    return true;
  }
  if (action === CB.ADD) {
    await startAddDraft(chatId);
    return true;
  }
  if (action === CB.LIST) {
    await listVenues(chatId);
    return true;
  }
  if (action === CB.CANCEL) {
    clearDraft(chatId);
    await showVenueMenu(chatId);
    return true;
  }
  if (action === CB.SKIP_ADDR) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.ADDRESS) return true;
    d.address = '';
    d.step = STEPS.LOCATION;
    await AdminTelegram.sendMessage(chatId, '📍 Надішли геолокацію закладу (кнопка «Локація» в Telegram). Без точки на карті зберегти неможливо.');
    return true;
  }
  if (action === CB.SKIP_FAC) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    d.parsedFacets = [];
    d.groupClassSelected = [];
    await goToTelegramStep(chatId, d);
    return true;
  }
  if (action === CB.SKIP_TG || action === CB.SKIP_IG) {
    const d = getDraft(chatId);
    if (!d) return true;
    if (action === CB.SKIP_TG && d.step === STEPS.TG) {
      d.telegramUrl = '';
      d.step = STEPS.IG;
      await AdminTelegram.sendKeyboard(chatId, 'Instagram:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
      return true;
    }
    if (action === CB.SKIP_IG && d.step === STEPS.IG) {
      d.instagramUrl = '';
      const id = await saveDraftToDb(chatId, d);
      clearDraft(chatId);
      await AdminTelegram.sendMessage(chatId, id ? `✅ Заклад збережено. id: ${id}` : '❌ Помилка збереження.');
      await showVenueMenu(chatId);
      return true;
    }
    return true;
  }

  if (action === CB.GTOG) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    const code = param || '';
    if (!code) return true;
    if (!d.groupClassSelected) d.groupClassSelected = [];
    const set = new Set(d.groupClassSelected);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    d.groupClassSelected = Array.from(set);
    const mid = messageId || d.groupClassMessageId;
    if (mid) await showGroupClassPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.GPAGE) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    const p = parseInt(param, 10);
    if (!Number.isNaN(p)) d.groupClassPage = p;
    const mid = messageId || d.groupClassMessageId;
    if (mid) await showGroupClassPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.GDONE) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    const codes = d.groupClassSelected || [];
    d.parsedFacets = codes.map((c) => ({ facetKind: 'group_class', code: c }));
    await goToTelegramStep(chatId, d);
    return true;
  }

  if (action === CB.GCLR) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    d.groupClassSelected = [];
    const mid = messageId || d.groupClassMessageId;
    if (mid) await showGroupClassPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.ORG) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.ORG) return true;
    d.organizationType = param || '';
    d.step = STEPS.FACETS;
    d.groupClassPage = 0;
    d.groupClassSelected = [];
    d.groupClassMessageId = null;
    await showGroupClassPicker(chatId, d, null);
    return true;
  }

  return false;
}

async function handleText(chatId, text) {
  const raw = String(text || '').trim();
  const d = getDraft(chatId);
  if (!d) return false;

  if (raw.toLowerCase() === '/cancel') {
    clearDraft(chatId);
    await showVenueMenu(chatId);
    return true;
  }

  if (d.step === STEPS.NAME) {
    d.nameUa = raw;
    d.step = STEPS.OBLAST;
    await AdminTelegram.sendMessage(chatId, 'Область (як у довіднику, наприклад Київська):');
    return true;
  }
  if (d.step === STEPS.OBLAST) {
    d.oblast = raw;
    d.step = STEPS.CITY;
    await AdminTelegram.sendMessage(chatId, 'Місто / населений пункт:');
    return true;
  }
  if (d.step === STEPS.CITY) {
    d.city = raw;
    d.step = STEPS.ADDRESS;
    await AdminTelegram.sendKeyboard(chatId, 'Текстовий адрес (опційно):', [[{ text: '⏭️ Без адреси', callback_data: CB.SKIP_ADDR }]]);
    return true;
  }
  if (d.step === STEPS.ADDRESS) {
    d.address = raw;
    d.step = STEPS.LOCATION;
    await AdminTelegram.sendMessage(chatId, '📍 Надішли геолокацію закладу.');
    return true;
  }
  if (d.step === STEPS.TG) {
    if (raw.toLowerCase() === '/skip') {
      d.telegramUrl = '';
    } else {
      d.telegramUrl = raw;
    }
    d.step = STEPS.IG;
    await AdminTelegram.sendKeyboard(chatId, 'Instagram:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
    return true;
  }
  if (d.step === STEPS.IG) {
    if (raw.toLowerCase() === '/skip') d.instagramUrl = '';
    else d.instagramUrl = raw;
    const id = await saveDraftToDb(chatId, d);
    clearDraft(chatId);
    await AdminTelegram.sendMessage(chatId, id ? `✅ Заклад збережено. id: ${id}` : '❌ Помилка збереження.');
    await showVenueMenu(chatId);
    return true;
  }

  if (d.step === STEPS.FACETS) {
    await AdminTelegram.sendMessage(
      chatId,
      'ℹ️ Групові заняття обираються <b>лише кнопками</b> під повідомленням зі списком (✓/☐), потім «Готово» або «Без групових». Ручний ввід назв не використовується.\n' +
        'Якщо кнопок немає — перевір, що в Supabase виконано seed <code>venue_directory_codes</code>.',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  return false;
}

async function handleLocation(chatId, latitude, longitude) {
  const d = getDraft(chatId);
  if (!d || d.step !== STEPS.LOCATION) {
    await AdminTelegram.sendMessage(chatId, 'Зараз неочікувана геолокація. Скористайся «Додати заклад» з меню закладів.');
    return true;
  }
  d.latitude = Number(latitude);
  d.longitude = Number(longitude);
  d.step = STEPS.ORG;
  await showOrgKeyboard(chatId);
  return true;
}

/**
 * @returns {Promise<boolean>} true якщо подія оброблена
 */
async function route(update, data) {
  if (!data || !data.chatId) return false;
  const chatId = data.chatId;

  if (data.type === 'callback') {
    const handled = await handleCallback(chatId, data);
    return handled;
  }

  if (data.type === 'location') {
    return handleLocation(chatId, data.latitude, data.longitude);
  }

  if (data.type === 'text') {
    const handled = await handleText(chatId, data.text);
    if (handled) return true;
  }

  return false;
}

module.exports = {
  CB,
  showVenueMenu,
  route,
  getDraft
};
