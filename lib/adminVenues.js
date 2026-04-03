/**
 * Адмін-бот: додавання закладів (координати обовʼязково з Telegram location).
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
  CANCEL: 'ADM_VCAN'
});

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

function parseFacetCodes(line, allowed) {
  const set = new Set((allowed || []).map((x) => x.code));
  const parts = String(line || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (set.has(p)) out.push({ facetKind: 'group_class', code: p });
  }
  return out;
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

async function handleCallback(chatId, data) {
  const parts = String(data || '').split(':');
  const action = parts[0];
  const param = parts.slice(1).join(':');

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
    d.step = STEPS.TG;
    await AdminTelegram.sendMessage(chatId, 'Посилання на Telegram закладу (або /skip):');
    return true;
  }
  if (action === CB.SKIP_TG || action === CB.SKIP_IG) {
    const d = getDraft(chatId);
    if (!d) return true;
    if (action === CB.SKIP_TG && d.step === STEPS.TG) {
      d.telegramUrl = '';
      d.step = STEPS.IG;
      await AdminTelegram.sendMessage(chatId, 'Посилання на Instagram (або /skip):');
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
  if (action === CB.ORG) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.ORG) return true;
    d.organizationType = param || '';
    d.step = STEPS.FACETS;
    const gcs = await supabase.getVenueDirectoryCodes('group_class');
    await AdminTelegram.sendKeyboard(
      chatId,
      `Коди групових занять через кому (з довідника), наприклад: yoga,zumba\nАбо натисни «Пропустити».\n\nПриклади кодів: ${gcs
        .slice(0, 8)
        .map((x) => x.code)
        .join(', ')}…`,
      [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_FAC }]]
    );
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
  if (d.step === STEPS.FACETS) {
    const gcs = await supabase.getVenueDirectoryCodes('group_class');
    d.parsedFacets = parseFacetCodes(raw, gcs);
    d.step = STEPS.TG;
    await AdminTelegram.sendKeyboard(chatId, 'Посилання на Telegram (t.me/...) або /skip:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_TG }]]);
    return true;
  }
  if (d.step === STEPS.TG) {
    if (raw.toLowerCase() === '/skip') {
      d.telegramUrl = '';
    } else {
      d.telegramUrl = raw;
    }
    d.step = STEPS.IG;
    await AdminTelegram.sendKeyboard(chatId, 'Instagram або /skip:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
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
    const handled = await handleCallback(chatId, data.callbackData);
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
