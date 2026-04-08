/**
 * Адмін-бот: додавання закладів (координати обовʼязково з Telegram location).
 * Групові заняття: довідник (кнопки) + опційно локальні назви лише для цього закладу (код local_* + label_ua).
 */
const crypto = require('crypto');
const supabase = require('./supabase');
const AdminTelegram = require('./adminTelegram');

const MAX_LOCAL_GROUP_CLASSES = 20;

function newLocalGroupCode() {
  return 'local_' + crypto.randomBytes(12).toString('hex');
}

const CB = Object.freeze({
  MENU: 'ADM_VMENU',
  ADD: 'ADM_VADD',
  LIST: 'ADM_VLIST',
  ORG: 'ADM_VORG',
  /** Тогл amenity коду: ADM_VAT:<code> */
  ATOG: 'ADM_VAT',
  /** Підтвердити вибір amenities */
  ADONE: 'ADM_VAOK',
  /** Скинути amenities */
  ACLR: 'ADM_VACL',
  /** Пропустити amenities */
  SKIP_AMN: 'ADM_VSKA2',
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
  GCLR: 'ADM_VGCL',
  /** Область з city_list: ADM_VOB:<індекс 0..11> (рядки в draft.pendingOblastOptions) */
  VOBLAST_PICK: 'ADM_VOB',
  /** Місто з city_list: ADM_VCT:<індекс 0..11> (draft.pendingCityOptions) */
  VCITY_PICK: 'ADM_VCT',
  /** Назад до пошуку області (з кроку міста) */
  VLOC_BACK: 'ADM_VLBK',
  /** Додати локальну назву групового (лише цей заклад) */
  GCUST: 'ADM_VGCUST',
  /** Підтвердження збереження після перегляду чернетки */
  CONFIRM_SAVE: 'ADM_VCFM',
  /** Запит на видалення закладу: ADM_VDEL:<venueId> */
  DELETE: 'ADM_VDEL',
  /** Підтвердити видалення: ADM_VDOK:<venueId> */
  DELETE_OK: 'ADM_VDOK'
});

const GROUPS_PER_PAGE = 8;

/** @type {Map<string, object>} */
const drafts = new Map();

const STEPS = Object.freeze({
  NAME: 'name',
  /** Як у реєстрації: літери → searchOblasts → кнопка області */
  OBLAST_INPUT: 'oblast_input',
  /** Літери → searchCitiesInOblast → кнопка міста */
  CITY_INPUT: 'city_input',
  ADDRESS: 'address',
  LOCATION: 'location',
  ORG: 'org',
  AMENITIES: 'amenities',
  FACETS: 'facets',
  /** Введення тексту локальної назви групового */
  GROUP_CUSTOM_INPUT: 'group_custom_input',
  TG: 'tg',
  IG: 'ig',
  /** Перегляд чернетки перед збереженням у БД */
  PREVIEW: 'preview'
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

async function showAmenityPicker(chatId, draft, messageId) {
  if (!draft.amenitySelected) draft.amenitySelected = [];
  const selected = new Set(draft.amenitySelected);
  const amn = await supabase.getVenueDirectoryCodes('amenity');

  const keyboard = [];
  for (let i = 0; i < amn.length; i += 2) {
    const row = [];
    row.push({
      text: btnLabel(selected.has(amn[i].code), amn[i].labelUa, amn[i].code),
      callback_data: `${CB.ATOG}:${amn[i].code}`
    });
    if (amn[i + 1]) {
      row.push({
        text: btnLabel(selected.has(amn[i + 1].code), amn[i + 1].labelUa, amn[i + 1].code),
        callback_data: `${CB.ATOG}:${amn[i + 1].code}`
      });
    }
    keyboard.push(row);
  }

  keyboard.push([
    { text: '✅ Готово', callback_data: CB.ADONE },
    { text: '⏭️ Без цього блоку', callback_data: CB.SKIP_AMN }
  ]);
  keyboard.push([{ text: '🔄 Скинути вибір', callback_data: CB.ACLR }]);

  let head =
    '🏷️ <b>Що є в закладі</b>\n\n' +
    'Відміть кнопками: басейн, баня/сауна, хамам, масаж, парковка тощо.\n' +
    `Обрано: <b>${selected.size}</b>\n\n` +
    'Потім «✅ Готово» або «Без цього блоку».';

  if (!amn.length) {
    head =
      '🏷️ <b>Що є в закладі</b>\n\n' +
      '⚠️ Довідник <code>venue_directory_codes</code> (amenity) порожній — виконай міграцію/seed.\n\n' +
      'Натисни «Без цього блоку», або додай коди і повернись.';
  }

  if (messageId) {
    const edited = await AdminTelegram.editMessageText(chatId, messageId, head, keyboard, { parse_mode: 'HTML' });
    if (!edited) {
      const r = await AdminTelegram.sendKeyboard(chatId, head, keyboard, { parse_mode: 'HTML' });
      if (r && r.message_id) draft.amenityMessageId = r.message_id;
    }
  } else {
    const r = await AdminTelegram.sendKeyboard(chatId, head, keyboard, { parse_mode: 'HTML' });
    if (r && r.message_id) draft.amenityMessageId = r.message_id;
  }
}

/**
 * Клавіатура: довідник group_class + локальні назви (лише цей заклад, code local_*).
 */
async function showGroupClassPicker(chatId, draft, messageId) {
  if (!draft.groupClassCustom) draft.groupClassCustom = [];
  if (!draft.groupClassSelected) draft.groupClassSelected = [];

  const allDir = await supabase.getVenueDirectoryCodes('group_class');
  const totalDir = allDir.length;
  const totalPages = totalDir > 0 ? Math.max(1, Math.ceil(totalDir / GROUPS_PER_PAGE)) : 1;
  let page = draft.groupClassPage != null ? Number(draft.groupClassPage) : 0;
  if (page < 0) page = 0;
  if (page > totalPages - 1) page = totalPages - 1;
  draft.groupClassPage = page;

  const selected = new Set(draft.groupClassSelected);
  const customList = draft.groupClassCustom;

  const keyboard = [];

  for (let i = 0; i < customList.length; i += 2) {
    const row = [];
    const a = customList[i];
    row.push({
      text: btnLabel(selected.has(a.code), a.labelUa, a.code),
      callback_data: `${CB.GTOG}:${a.code}`
    });
    if (customList[i + 1]) {
      const b = customList[i + 1];
      row.push({
        text: btnLabel(selected.has(b.code), b.labelUa, b.code),
        callback_data: `${CB.GTOG}:${b.code}`
      });
    }
    keyboard.push(row);
  }

  const slice = totalDir ? allDir.slice(page * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE + GROUPS_PER_PAGE) : [];
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

  if (totalDir > 0) {
    const nav = [];
    if (page > 0) nav.push({ text: '◀️', callback_data: `${CB.GPAGE}:${page - 1}` });
    nav.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: `${CB.GPAGE}:${page}`
    });
    if (page < totalPages - 1) nav.push({ text: '▶️', callback_data: `${CB.GPAGE}:${page + 1}` });
    keyboard.push(nav);
  }

  if (customList.length < MAX_LOCAL_GROUP_CLASSES) {
    keyboard.push([{ text: '➕ Локальна назва (лише цей заклад)', callback_data: CB.GCUST }]);
  }

  keyboard.push([
    { text: '✅ Готово', callback_data: CB.GDONE },
    { text: '⏭️ Без групових', callback_data: CB.SKIP_FAC }
  ]);
  keyboard.push([{ text: '🔄 Скинути вибір', callback_data: CB.GCLR }]);

  let head = '🏷️ <b>Групові заняття</b>\n';
  if (totalDir === 0) {
    head +=
      '⚠️ Довідник <code>venue_directory_codes</code> (group_class) порожній — виконай seed SQL або додавай лише <b>локальні назви</b>.\n\n';
  } else {
    head += 'Типи з довідника + за потреби свої назви для цього закладу.\n\n';
  }
  head +=
    '<i>Локальні назви не додаються в загальний довідник і не потрапляють у фільтри каталогу за кодом.</i>\n' +
    `Обрано: <b>${selected.size}</b>\n\n` +
    'Натисни рядок (✓/☐), потім «Готово» або «Без групових».';

  if (messageId) {
    const edited = await AdminTelegram.editMessageText(chatId, messageId, head, keyboard, { parse_mode: 'HTML' });
    if (!edited) {
      const r = await AdminTelegram.sendKeyboard(chatId, head, keyboard, { parse_mode: 'HTML' });
      if (r && r.message_id) draft.groupClassMessageId = r.message_id;
    }
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
  const keyboard = [];
  for (const v of rows.slice(0, 20)) {
    const label = `🗑 ${v.nameUa} · ${v.city}`;
    keyboard.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: `${CB.DELETE}:${v.id}`
      }
    ]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CB.MENU }]);
  await AdminTelegram.sendKeyboard(
    chatId,
    '📋 <b>Заклади</b>\n\nНатисни заклад, щоб видалити (тестовий режим, з підтвердженням).',
    keyboard,
    { parse_mode: 'HTML' }
  );
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

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function buildVenuePreviewText(d) {
  const orgs = await supabase.getVenueDirectoryCodes('organization');
  const orgRow = orgs.find((o) => o.code === d.organizationType);
  const orgLabel = orgRow ? orgRow.labelUa : d.organizationType;

  const amnDir = await supabase.getVenueDirectoryCodes('amenity');
  const amnMap = new Map(amnDir.map((x) => [x.code, x.labelUa]));

  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));

  const facets = d.parsedFacets || [];
  const gcLines = facets
    .filter((f) => f && f.facetKind === 'group_class')
    .map((f) => {
      if (f.labelUa) return f.labelUa;
      return gcMap.get(f.code) || f.code;
    });
  const gcBlock = gcLines.length ? gcLines.map((x) => escHtml(x)).join(', ') : '—';

  const amnLines = facets
    .filter((f) => f && f.facetKind === 'amenity')
    .map((f) => amnMap.get(f.code) || f.code);
  const amnBlock = amnLines.length ? amnLines.map((x) => escHtml(x)).join(', ') : '—';

  const yandex =
    d.latitude != null && d.longitude != null
      ? `https://yandex.com/maps/?pt=${d.longitude},${d.latitude}&z=16&l=map`
      : '';

  let text =
    '📋 <b>Перевір дані закладу</b> перед збереженням у базу:\n\n' +
    `🏷 Назва: <b>${escHtml(d.nameUa)}</b>\n` +
    `🗺 Область: ${escHtml(d.oblast)}\n` +
    `🏙 Місто: ${escHtml(d.city)}\n` +
    `📫 Адреса: ${d.address ? escHtml(d.address) : '—'}\n` +
    `📍 Координати: ${escHtml(String(d.latitude))}, ${escHtml(String(d.longitude))}` +
    (yandex ? ` · <a href="${yandex}">карта</a>` : '') +
    `\n` +
    `🏢 Тип організації: ${escHtml(orgLabel)}\n` +
    `🏷 Є в закладі: ${amnBlock}\n` +
    `🏷 Групові заняття: ${gcBlock}\n` +
    `🔗 Telegram: ${d.telegramUrl ? escHtml(d.telegramUrl) : '—'}\n` +
    `📸 Instagram: ${d.instagramUrl ? escHtml(d.instagramUrl) : '—'}`;

  return text;
}

async function showVenuePreview(chatId, d) {
  d.step = STEPS.PREVIEW;
  const body = await buildVenuePreviewText(d);
  const keyboard = [
    [{ text: '✅ Зберегти в базу', callback_data: CB.CONFIRM_SAVE }],
    [{ text: '❌ Скасувати без збереження', callback_data: CB.CANCEL }]
  ];
  await AdminTelegram.sendKeyboard(chatId, body, keyboard, { parse_mode: 'HTML', disable_web_page_preview: true });
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

  if (action === CB.CONFIRM_SAVE) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.PREVIEW) return true;
    const id = await saveDraftToDb(chatId, d);
    clearDraft(chatId);
    await AdminTelegram.sendMessage(chatId, id ? `✅ Заклад збережено. id: ${id}` : '❌ Помилка збереження.');
    await showVenueMenu(chatId);
    return true;
  }

  if (action === CB.DELETE) {
    const vid = String(param || '').trim();
    if (!vid) return true;
    const v = await supabase.getVenueById(vid);
    if (!v) {
      await AdminTelegram.sendMessage(chatId, '❌ Заклад не знайдено.');
      return listVenues(chatId);
    }
    const text =
      '⚠️ <b>Видалити заклад назавжди?</b>\n\n' +
      `🏷 <b>${escHtml(v.nameUa)}</b>\n` +
      `🏙 ${escHtml(v.city)}, ${escHtml(v.oblast)}\n` +
      `id: <code>${escHtml(v.id)}</code>\n\n` +
      '<i>Будуть видалені також пов’язані записи (facets, schedule тощо) через каскад.</i>';
    const keyboard = [
      [{ text: '✅ Так, видалити', callback_data: `${CB.DELETE_OK}:${v.id}` }],
      [{ text: '❌ Ні, назад', callback_data: CB.LIST }]
    ];
    await AdminTelegram.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
    return true;
  }

  if (action === CB.DELETE_OK) {
    const vid = String(param || '').trim();
    if (!vid) return true;
    const ok = await supabase.deleteVenueCascade(vid);
    await AdminTelegram.sendMessage(chatId, ok ? '✅ Видалено.' : '❌ Не вдалося видалити.');
    return listVenues(chatId);
  }

  if (action === CB.VOBLAST_PICK) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.OBLAST_INPUT) return true;
    const idx = parseInt(param, 10);
    const list = Array.isArray(d.pendingOblastOptions) ? d.pendingOblastOptions : [];
    const name = list[idx];
    if (!name) return true;
    d.oblast = String(name).trim();
    d.pendingOblastOptions = null;
    d.step = STEPS.CITY_INPUT;
    await AdminTelegram.sendMessage(
      chatId,
      '🏙️ Введи назву населеного пункту (від 3 літер) — з’явиться список для вибору:'
    );
    return true;
  }

  if (action === CB.VCITY_PICK) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.CITY_INPUT) return true;
    const idx = parseInt(param, 10);
    const list = Array.isArray(d.pendingCityOptions) ? d.pendingCityOptions : [];
    const name = list[idx];
    if (!name) return true;
    d.city = String(name).trim();
    d.pendingCityOptions = null;
    d.step = STEPS.ADDRESS;
    await AdminTelegram.sendKeyboard(chatId, 'Текстовий адрес (опційно):', [
      [{ text: '⏭️ Без адреси', callback_data: CB.SKIP_ADDR }]
    ]);
    return true;
  }

  if (action === CB.VLOC_BACK) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.CITY_INPUT) return true;
    d.oblast = '';
    d.pendingCityOptions = null;
    d.step = STEPS.OBLAST_INPUT;
    await AdminTelegram.sendMessage(chatId, '🗺️ Введи область (від 2 літер):');
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
    d.parsedFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind === 'amenity');
    d.groupClassSelected = [];
    d.groupClassCustom = [];
    await goToTelegramStep(chatId, d);
    return true;
  }

  if (action === CB.SKIP_AMN) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.AMENITIES) return true;
    d.amenitySelected = [];
    d.parsedFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind !== 'amenity');
    d.step = STEPS.FACETS;
    d.groupClassPage = 0;
    d.groupClassSelected = [];
    d.groupClassCustom = [];
    d.groupClassMessageId = null;
    await showGroupClassPicker(chatId, d, null);
    return true;
  }

  if (action === CB.GCUST) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    if ((d.groupClassCustom || []).length >= MAX_LOCAL_GROUP_CLASSES) return true;
    d.step = STEPS.GROUP_CUSTOM_INPUT;
    await AdminTelegram.sendMessage(
      chatId,
      '✏️ Введи <b>назву групового заняття</b> для <u>цього закладу</u> (3–80 символів). Глобальний довідник не змінюється.\n\n' +
        'Щоб скасувати весь сценарій додавання закладу — /cancel',
      { parse_mode: 'HTML' }
    );
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
      await showVenuePreview(chatId, d);
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
    if (set.has(code)) {
      set.delete(code);
      if (String(code).startsWith('local_')) {
        d.groupClassCustom = (d.groupClassCustom || []).filter((x) => x.code !== code);
      }
    } else {
      set.add(code);
    }
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
    const other = (d.parsedFacets || []).filter((f) => f && f.facetKind !== 'group_class');
    const groupRows = codes.map((c) => {
      const row = { facetKind: 'group_class', code: c };
      if (String(c).startsWith('local_')) {
        const cu = (d.groupClassCustom || []).find((x) => x.code === c);
        if (cu && cu.labelUa) row.labelUa = cu.labelUa;
      }
      return row;
    });
    d.parsedFacets = other.concat(groupRows);
    await goToTelegramStep(chatId, d);
    return true;
  }

  if (action === CB.GCLR) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    d.groupClassSelected = [];
    d.groupClassCustom = [];
    const mid = messageId || d.groupClassMessageId;
    if (mid) await showGroupClassPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.ORG) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.ORG) return true;
    d.organizationType = param || '';
    d.step = STEPS.AMENITIES;
    d.amenitySelected = [];
    d.amenityMessageId = null;
    d.parsedFacets = [];
    await showAmenityPicker(chatId, d, null);
    return true;
  }

  if (action === CB.ATOG) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.AMENITIES) return true;
    const code = param || '';
    if (!code) return true;
    if (!d.amenitySelected) d.amenitySelected = [];
    const set = new Set(d.amenitySelected);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    d.amenitySelected = Array.from(set);
    const mid = messageId || d.amenityMessageId;
    if (mid) await showAmenityPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.ACLR) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.AMENITIES) return true;
    d.amenitySelected = [];
    const mid = messageId || d.amenityMessageId;
    if (mid) await showAmenityPicker(chatId, d, mid);
    return true;
  }

  if (action === CB.ADONE) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.AMENITIES) return true;
    const codes = d.amenitySelected || [];
    const other = (d.parsedFacets || []).filter((f) => f && f.facetKind !== 'amenity');
    const amnRows = codes.map((c) => ({ facetKind: 'amenity', code: c }));
    d.parsedFacets = other.concat(amnRows);
    d.step = STEPS.FACETS;
    d.groupClassPage = 0;
    d.groupClassSelected = [];
    d.groupClassCustom = [];
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
    d.step = STEPS.OBLAST_INPUT;
    await AdminTelegram.sendMessage(
      chatId,
      '🗺️ Введи область (від 2 літер) — з’явиться список для вибору (як при реєстрації користувача):'
    );
    return true;
  }
  if (d.step === STEPS.OBLAST_INPUT) {
    const q = raw;
    if (q.length < 2) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Введи щонайменше 2 літери області:');
      return true;
    }
    const oblasts = await supabase.searchOblasts(q, 12);
    if (!oblasts.length) {
      await AdminTelegram.sendMessage(chatId, '❌ Не знайдено область. Спробуй інше написання (мін. 2 літери):');
      return true;
    }
    d.pendingOblastOptions = oblasts;
    const keyboard = oblasts.map((o, i) => {
      let label = String(o);
      if (label.length > 62) label = label.slice(0, 59) + '…';
      return [{ text: label, callback_data: `${CB.VOBLAST_PICK}:${i}` }];
    });
    await AdminTelegram.sendKeyboard(chatId, 'Обери область зі списку:', keyboard);
    return true;
  }
  if (d.step === STEPS.CITY_INPUT) {
    const oblast = d.oblast ? String(d.oblast).trim() : '';
    if (!oblast) {
      d.step = STEPS.OBLAST_INPUT;
      await AdminTelegram.sendMessage(chatId, '🗺️ Спочатку обери область. Введи область (від 2 літер):');
      return true;
    }
    const q = raw;
    if (q.length < 3) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Введи щонайменше 3 літери назви населеного пункту:');
      return true;
    }
    const cities = await supabase.searchCitiesInOblast(oblast, q, 12);
    if (!cities.length) {
      await AdminTelegram.sendMessage(chatId, '❌ Не знайдено. Спробуй інші 3+ літери:');
      return true;
    }
    d.pendingCityOptions = cities;
    const keyboard = cities.map((c, i) => {
      let label = String(c);
      if (label.length > 62) label = label.slice(0, 59) + '…';
      return [{ text: label, callback_data: `${CB.VCITY_PICK}:${i}` }];
    });
    keyboard.push([{ text: '⬅️ Змінити область', callback_data: CB.VLOC_BACK }]);
    await AdminTelegram.sendKeyboard(chatId, `Обери населений пункт (область: ${oblast}):`, keyboard);
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
    await showVenuePreview(chatId, d);
    return true;
  }

  if (d.step === STEPS.PREVIEW) {
    await AdminTelegram.sendMessage(
      chatId,
      'ℹ️ Перевір дані в повідомленні вище. Натисни <b>«Зберегти в базу»</b> або <b>«Скасувати без збереження»</b> кнопками.',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  if (d.step === STEPS.GROUP_CUSTOM_INPUT) {
    const name = raw.trim();
    if (name.length < 3 || name.length > 80) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Від 3 до 80 символів. Спробуй ще раз.');
      return true;
    }
    const code = newLocalGroupCode();
    if (!d.groupClassCustom) d.groupClassCustom = [];
    if (!d.groupClassSelected) d.groupClassSelected = [];
    d.groupClassCustom.push({ code, labelUa: name });
    d.groupClassSelected.push(code);
    d.step = STEPS.FACETS;
    const mid = d.groupClassMessageId;
    if (mid) await showGroupClassPicker(chatId, d, mid);
    else await showGroupClassPicker(chatId, d, null);
    await AdminTelegram.sendMessage(
      chatId,
      '✅ Назву додано до цього закладу.\n\n' +
        'Щоб додати ще одну локальну назву — відкрий повідомлення з клавіатурою «Групові заняття» (вище або внизу чату) і натисни «➕ Локальна назва (лише цей заклад)». ' +
        'Коли закінчиш — «✅ Готово».'
    );
    return true;
  }

  if (d.step === STEPS.FACETS) {
    await AdminTelegram.sendMessage(
      chatId,
      'ℹ️ Обери типи <b>кнопками</b> під повідомленням або «Локальна назва». Текст сюди не надсилай — лише після «Локальна назва».',
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
