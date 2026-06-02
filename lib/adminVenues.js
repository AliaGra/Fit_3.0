/**
 * Адмін-бот: додавання закладів (координати обовʼязково з Telegram location).
 * Групові заняття: довідник (кнопки) + опційно локальні назви лише для цього закладу (код local_* + label_ua).
 */
const crypto = require('crypto');
const supabase = require('./supabase');
const AdminTelegram = require('./adminTelegram');
const Helpers = require('./helpers');

const MAX_LOCAL_GROUP_CLASSES = 20;

function newLocalGroupCode() {
  return 'local_' + crypto.randomBytes(12).toString('hex');
}

const CB = Object.freeze({
  MENU: 'ADM_VMENU',
  ADD: 'ADM_VADD',
  LIST: 'ADM_VLIST',
  /** Відкрити картку закладу зі списку: ADM_VVW:<venueId> */
  VIEW: 'ADM_VVW',
  /** Призначити власника закладу за chat_id: ADM_VOWN:<venueId> */
  OWNER_ASSIGN: 'ADM_VOWN',
  /** Назад у список закладів */
  BACK_LIST: 'ADM_VBL',
  ORG: 'ADM_VORG',
  /** Редагування поля в превʼю: ADM_VE:<field> */
  EDIT: 'ADM_VE',
  /** Заклад: графік роботи */
  HOURS: 'ADM_VHRS',
  /** Вибір дня тижня для редагування: ADM_VHD:<1..7> */
  HOURS_DAY: 'ADM_VHD',
  /** Заклад: розклад групових */
  SCHED: 'ADM_VSCH',
  /** Додати елемент розкладу: ADM_VSA */
  SCHED_ADD: 'ADM_VSA',
  /** Додати елемент для конкретного group_class: ADM_VSAF:<code> */
  SCHED_ADD_FOR: 'ADM_VSAF',
  /** Вибір weekday для додавання елемента: ADM_VSW:<1..7> */
  SCHED_WEEKDAY: 'ADM_VSW',
  /** Вибір group_class коду (з уже вибраних у закладі): ADM_VSG:<code> */
  SCHED_GROUP: 'ADM_VSG',
  /** Видалити елемент розкладу: ADM_VSD:<scheduleId> */
  SCHED_DEL: 'ADM_VSD',
  /** Тогл amenity коду: ADM_VAT:<code> */
  ATOG: 'ADM_VAT',
  /** Підтвердити вибір amenities */
  ADONE: 'ADM_VAOK',
  /** Скинути amenities */
  ACLR: 'ADM_VACL',
  /** Пропустити amenities */
  SKIP_AMN: 'ADM_VSKA2',
  SKIP_ADDR: 'ADM_VSKA',
  SKIP_DISTRICT: 'ADM_VSKD',
  SKIP_FAC: 'ADM_VSKF',
  SKIP_TG: 'ADM_VSKTG',
  SKIP_IG: 'ADM_VSKIG',
  SKIP_PHONE: 'ADM_VSKPH',
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
  DELETE_OK: 'ADM_VDOK',
  /** Довідник цін закладу */
  PRICES_MENU: 'ADM_VPR',
  PRICE_G: 'ADM_VPG',
  PRICE_GC_ADD: 'ADM_VGC',
  /** Обрано код групового для ціни: ADM_VGCC:<code> */
  PRICE_GC_PICK: 'ADM_VGCC',
  /** Видалити ціну групового: ADM_VGCD:<rowId> */
  PRICE_GC_DEL: 'ADM_VGCD',
  PRICE_M: 'ADM_VPM',
  PRICE_M_ADD: 'ADM_VPMA',
  PRICE_M_DEL: 'ADM_VPMD',
  PRICE_A: 'ADM_VPA',
  /** Готовий код послуги: ADM_VPAP:towel_rental | membership_freeze */
  PRICE_A_PRE: 'ADM_VPAP',
  PRICE_A_ADD: 'ADM_VPAA',
  PRICE_A_DEL: 'ADM_VPAD'
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
  DISTRICT: 'district',
  LOCATION: 'location',
  ORG: 'org',
  AMENITIES: 'amenities',
  FACETS: 'facets',
  /** Введення тексту локальної назви групового */
  GROUP_CUSTOM_INPUT: 'group_custom_input',
  TG: 'tg',
  IG: 'ig',
  PHONE: 'phone',
  /** Перегляд чернетки перед збереженням у БД */
  PREVIEW: 'preview'
});

const STEPS_EXTRA = Object.freeze({
  VENUE_VIEW: 'venue_view',
  OWNER_ASSIGN_INPUT: 'owner_assign_input',
  HOURS_INPUT: 'hours_input',
  SCHED_TIME_INPUT: 'sched_time_input',
  VPRICE_GC_AMOUNT: 'vprice_gc_amount',
  VPRICE_MEM_LINE: 'vprice_mem_line',
  VPRICE_ANC_PRE: 'vprice_anc_pre',
  VPRICE_ANC_CUSTOM: 'vprice_anc_custom'
});

const ANC_PRESETS = Object.freeze({
  towel_rental: { labelUa: 'Оренда рушника', unit: 'per_visit' },
  membership_freeze: { labelUa: 'Заморозка абонемента', unit: 'one_time' }
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

/** Зберігає `viewVenueId` у чернетці (потрібно для колбеків після рестарту бота). */
function ensureVenueDraft(chatId, venueId) {
  const vid = String(venueId || '').trim();
  if (!vid) return null;
  const d = getDraft(chatId) || {};
  d.viewVenueId = vid;
  d.step = STEPS_EXTRA.VENUE_VIEW;
  setDraft(chatId, d);
  return d;
}

function venueIdFromParamOrDraft(param, chatId) {
  let vid = String(param || '').trim();
  if (!vid) {
    const ex = getDraft(chatId);
    vid = ex && ex.viewVenueId ? String(ex.viewVenueId) : '';
  }
  return vid;
}

function btnLabel(selected, labelUa, code) {
  const base = (selected ? '✓ ' : '☐ ') + String(labelUa || code).trim();
  return base.length > 36 ? base.slice(0, 33) + '…' : base;
}

function consumeReturnToPreview(d) {
  if (!d) return false;
  const had = d.returnToPreview === true;
  d.returnToPreview = false;
  return had;
}

function consumeReturnToVenueView(d) {
  if (!d) return false;
  const had = d.returnToVenueView === true;
  d.returnToVenueView = false;
  return had;
}

function hydrateAmenitySelectedFromFacets(d) {
  const facets = Array.isArray(d?.parsedFacets) ? d.parsedFacets : [];
  const codes = facets.filter((f) => f && f.facetKind === 'amenity').map((f) => f.code);
  d.amenitySelected = Array.from(new Set(codes.filter(Boolean)));
}

function hydrateGroupClassSelectedFromFacets(d) {
  const facets = Array.isArray(d?.parsedFacets) ? d.parsedFacets : [];
  const selected = [];
  const custom = [];
  for (const f of facets) {
    if (!f || f.facetKind !== 'group_class' || !f.code) continue;
    selected.push(f.code);
    if (String(f.code).startsWith('local_') && f.labelUa) custom.push({ code: f.code, labelUa: f.labelUa });
  }
  d.groupClassSelected = Array.from(new Set(selected));
  d.groupClassCustom = custom;
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

const WD = Object.freeze({
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Нд'
});

function parseTimeRange(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (t === '-' || t.toLowerCase() === 'off' || t.toLowerCase() === 'closed') {
    return { isClosed: true, timeOpen: null, timeClose: null };
  }
  const m = t.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh1 = Number(m[1]);
  const mm1 = Number(m[2]);
  const hh2 = Number(m[3]);
  const mm2 = Number(m[4]);
  const ok = (hh) => Number.isInteger(hh) && hh >= 0 && hh <= 23;
  const okm = (mm) => Number.isInteger(mm) && mm >= 0 && mm <= 59;
  if (!ok(hh1) || !ok(hh2) || !okm(mm1) || !okm(mm2)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { isClosed: false, timeOpen: `${pad(hh1)}:${pad(mm1)}`, timeClose: `${pad(hh2)}:${pad(mm2)}` };
}

function fmtTime(v) {
  const s = String(v || '').trim();
  if (!s) return '—';
  const m = s.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : s;
}

function normalizeSocialUrl(raw, kind) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (kind === 'telegram') {
    const handle = s.replace(/^@+/, '').replace(/^t\.me\//i, '');
    return `https://t.me/${handle}`;
  }
  if (kind === 'instagram') {
    const handle = s.replace(/^@+/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
    return `https://instagram.com/${handle}`;
  }
  return s;
}

function fmtHours(hoursRows) {
  const map = new Map((hoursRows || []).map((h) => [Number(h.weekday), h]));
  const lines = [];
  for (let wd = 1; wd <= 7; wd++) {
    const h = map.get(wd);
    if (!h) lines.push(`${WD[wd]}: —`);
    else if (h.isClosed) lines.push(`${WD[wd]}: вихідний`);
    else lines.push(`${WD[wd]}: ${h.timeOpen}–${h.timeClose}`);
  }
  return lines.join('\n');
}

function parseGcPriceLine(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const parts = t.split('|').map((s) => s.trim());
  const price = parseFloat(parts[0].replace(',', '.'));
  if (Number.isNaN(price) || price < 0) return null;
  return { price, currency: 'UAH', labelUa: parts[1] || null };
}

function parseMembershipTriple(raw) {
  const parts = String(raw || '')
    .trim()
    .split('|')
    .map((s) => s.trim());
  if (parts.length < 3) return null;
  const labelUa = parts[0];
  const mid = parts[1].toLowerCase();
  const price = parseFloat(parts[2].replace(',', '.'));
  let isUnlimited = false;
  let tpm = null;
  if (mid === 'безліміт' || mid === 'unlimited' || mid === '∞' || mid === 'inf') isUnlimited = true;
  else {
    tpm = parseInt(mid, 10);
    if (!tpm || tpm < 1) return null;
  }
  if (!labelUa || Number.isNaN(price) || price < 0) return null;
  return { labelUa, isUnlimited, trainingsPerMonth: tpm, price, currency: 'UAH' };
}

function parseAncillaryCustom(raw) {
  const parts = String(raw || '')
    .trim()
    .split('|')
    .map((s) => s.trim());
  if (parts.length < 4) return null;
  const serviceCode = parts[0].toLowerCase().replace(/\s+/g, '_');
  const labelUa = parts[1];
  const price = parseFloat(parts[2].replace(',', '.'));
  const unit = parts[3].toLowerCase();
  if (!serviceCode || !labelUa || Number.isNaN(price) || price < 0) return null;
  if (!['one_time', 'per_visit', 'per_month'].includes(unit)) return null;
  return { serviceCode, labelUa, price, unit, currency: 'UAH' };
}

async function showVenuePricesMenu(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  d.step = STEPS_EXTRA.VENUE_VIEW;
  setDraft(chatId, d);
  const keyboard = [
    [{ text: '🏷 Групові заняття', callback_data: `${CB.PRICE_G}:${vid}` }],
    [{ text: '🏋 Абонементи в зал', callback_data: `${CB.PRICE_M}:${vid}` }],
    [{ text: '🧾 Інші послуги', callback_data: `${CB.PRICE_A}:${vid}` }],
    [{ text: '⬅️ До картки закладу', callback_data: `${CB.VIEW}:${vid}` }]
  ];
  await AdminTelegram.sendKeyboard(
    chatId,
    '💰 <b>Довідник цін закладу</b>\n\n' + 'Інформативно (без оплат у боті). Обери розділ:',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function showGroupClassPricesEditor(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  const rows = await supabase.listVenueGroupClassPrices(vid);
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));
  const lines = rows.length
    ? rows
        .map((r) => {
          const lab = r.labelUa || gcMap.get(r.groupClassCode) || r.groupClassCode;
          return `• ${escHtml(String(lab))} — <b>${r.price}</b> ${escHtml(r.currency)}`;
        })
        .join('\n')
    : '—';
  const keyboard = [];
  keyboard.push([{ text: '➕ Додати / оновити ціну', callback_data: `${CB.PRICE_GC_ADD}:${vid}` }]);
  for (const r of rows.slice(0, 20)) {
    const lab = r.labelUa || gcMap.get(r.groupClassCode) || r.groupClassCode;
    const short = (`🗑 ${lab}`).length > 60 ? (`🗑 ${lab}`).slice(0, 57) + '…' : `🗑 ${lab}`;
    keyboard.push([{ text: short, callback_data: `${CB.PRICE_GC_DEL}:${r.id}` }]);
  }
  keyboard.push([{ text: '⬅️ До цін закладу', callback_data: `${CB.PRICES_MENU}:${vid}` }]);
  setDraft(chatId, d);
  await AdminTelegram.sendKeyboard(
    chatId,
    '🏷 <b>Групові заняття — ціни</b>\n\n' + lines,
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function showMembershipPricesEditor(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  const rows = await supabase.listVenueGymMembershipOffers(vid);
  const lines = rows.length
    ? rows
        .map((r) => {
          const lim = r.isUnlimited ? 'безліміт' : `${r.trainingsPerMonth} раз/міс`;
          return `• ${escHtml(r.labelUa)} (${lim}) — <b>${r.price}</b> ${escHtml(r.currency)}`;
        })
        .join('\n')
    : '—';
  const keyboard = [[{ text: '➕ Додати абонемент', callback_data: `${CB.PRICE_M_ADD}:${vid}` }]];
  for (const r of rows.slice(0, 20)) {
    const short = (`🗑 ${r.labelUa}`).length > 60 ? (`🗑 ${r.labelUa}`).slice(0, 57) + '…' : `🗑 ${r.labelUa}`;
    keyboard.push([{ text: short, callback_data: `${CB.PRICE_M_DEL}:${r.id}` }]);
  }
  keyboard.push([{ text: '⬅️ До цін закладу', callback_data: `${CB.PRICES_MENU}:${vid}` }]);
  setDraft(chatId, d);
  await AdminTelegram.sendKeyboard(
    chatId,
    '🏋 <b>Абонементи в тренажерний зал</b>\n\n' + lines + '\n\n<i>Один рядок через |:</i>\n<code>Назва | N або безліміт | ціна</code>',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function showAncillaryPricesEditor(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  const rows = await supabase.listVenueAncillaryServices(vid);
  const unitUa = { one_time: 'раз', per_visit: 'за відвідування', per_month: 'за місяць' };
  const lines = rows.length
    ? rows
        .map((r) => `• ${escHtml(r.labelUa)} (${unitUa[r.unit] || r.unit}) — <b>${r.price}</b> ${escHtml(r.currency)}`)
        .join('\n')
    : '—';
  const keyboard = [
    [
      { text: '🧴 Рушник', callback_data: `${CB.PRICE_A_PRE}:${vid}:towel_rental` },
      { text: '🧊 Заморозка', callback_data: `${CB.PRICE_A_PRE}:${vid}:membership_freeze` }
    ],
    [{ text: '➕ Інша послуга (свій код)', callback_data: `${CB.PRICE_A_ADD}:${vid}` }]
  ];
  for (const r of rows.slice(0, 20)) {
    const short = (`🗑 ${r.labelUa}`).length > 60 ? (`🗑 ${r.labelUa}`).slice(0, 57) + '…' : `🗑 ${r.labelUa}`;
    keyboard.push([{ text: short, callback_data: `${CB.PRICE_A_DEL}:${r.id}` }]);
  }
  keyboard.push([{ text: '⬅️ До цін закладу', callback_data: `${CB.PRICES_MENU}:${vid}` }]);
  setDraft(chatId, d);
  await AdminTelegram.sendKeyboard(
    chatId,
    '🧾 <b>Інші послуги</b>\n\n' +
      lines +
      '\n\n<i>Свій рядок:</i>\n<code>код_latin | Назва | ціна | one_time|per_visit|per_month</code>',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function showVenueDetails(chatId, venueId) {
  const vid = String(venueId || '').trim();
  if (!vid) return;
  const v = await supabase.getVenueById(vid);
  if (!v) {
    await AdminTelegram.sendMessage(chatId, '❌ Заклад не знайдено.');
    return listVenues(chatId);
  }
  const orgs = await supabase.getVenueDirectoryCodes('organization');
  const orgRow = orgs.find((o) => o.code === v.organizationType);
  const orgLabel = orgRow ? orgRow.labelUa : v.organizationType;

  const amnDir = await supabase.getVenueDirectoryCodes('amenity');
  const amnMap = new Map(amnDir.map((x) => [x.code, x.labelUa]));
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));

  const facets = v.facets || [];
  const amn = facets
    .filter((f) => f && f.facetKind === 'amenity')
    .map((f) => amnMap.get(f.code) || f.code);
  const gc = facets
    .filter((f) => f && f.facetKind === 'group_class')
    .map((f) => f.labelUa || gcMap.get(f.code) || f.code);

  const hours = await supabase.getVenueHours(vid);
  const sched = await supabase.listVenueSchedule(vid, 50);
  const coaches = await supabase.listVenueCoaches(vid);
  const coachesIndividual = coaches.filter((c) => Array.isArray(c.coachTrainingTypes) && c.coachTrainingTypes.includes('individual'));
  const coachesGroup = coaches.filter((c) => Array.isArray(c.coachTrainingTypes) && c.coachTrainingTypes.includes('group'));
  const coachesUnknown = coaches.filter(
    (c) => !Array.isArray(c.coachTrainingTypes) || (!c.coachTrainingTypes.includes('individual') && !c.coachTrainingTypes.includes('group'))
  );

  const gmaps =
    v.latitude != null && v.longitude != null ? `https://www.google.com/maps?q=${v.latitude},${v.longitude}` : '';

  const d = getDraft(chatId) || {};
  d.step = STEPS_EXTRA.VENUE_VIEW;
  d.viewVenueId = vid;
  d.district = v.district ? String(v.district).trim() : '';
  // facets for editing reuse
  d.parsedFacets = facets.map((f) => ({ facetKind: f.facetKind, code: f.code, labelUa: f.labelUa || null }));
  setDraft(chatId, d);

  const text =
    `🏢 <b>${escHtml(v.nameUa)}</b>\n` +
    `🏙 ${escHtml(v.city)}, ${escHtml(v.oblast)}\n` +
    (v.district && String(v.district).trim() ? `🏘 ${escHtml(String(v.district).trim())}\n` : '') +
    (v.address ? `📫 ${escHtml(v.address)}\n` : '') +
    (gmaps ? `📍 <a href="${gmaps}">Google карта</a>\n` : '') +
    (v.phone ? `📞 ${escHtml(v.phone)}\n` : '') +
    (v.telegramUrl ? `🔗 <a href="${escHtml(normalizeSocialUrl(v.telegramUrl, 'telegram'))}">Telegram</a>\n` : '') +
    (v.instagramUrl ? `📸 <a href="${escHtml(normalizeSocialUrl(v.instagramUrl, 'instagram'))}">Instagram</a>\n` : '') +
    `🏷 Тип: ${escHtml(orgLabel)}\n\n` +
    `✨ Наповнення: ${amn.length ? escHtml(amn.join(', ')) : '—'}\n` +
    `🏷 Групові: ${gc.length ? escHtml(gc.join(', ')) : '—'}\n\n` +
    `🧑‍🏫 <b>Тренери закладу</b>\n` +
    (coaches.length
      ? [
          '1) <b>Індивідуальні (персональні, спліт, тріо)</b>',
          coachesIndividual.length
            ? coachesIndividual
                .map((c) => {
                  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `ID ${c.chatId}`;
                  const badge = c.isPrimary ? ' ⭐' : '';
                  const url = Helpers.publicCoachPageLink(c.chatId);
                  if (url) {
                    return `• <a href="${Helpers.htmlHrefAttr(url)}">${escHtml(full + badge)}</a>`;
                  }
                  return `• ${escHtml(full)}${badge}`;
                })
                .join('\n')
            : '• —',
          '',
          '2) <b>Групові заняття</b>',
          coachesGroup.length
            ? coachesGroup
                .map((c) => {
                  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `ID ${c.chatId}`;
                  const badge = c.isPrimary ? ' ⭐' : '';
                  const url = Helpers.publicCoachPageLink(c.chatId);
                  if (url) {
                    return `• <a href="${Helpers.htmlHrefAttr(url)}">${escHtml(full + badge)}</a>`;
                  }
                  return `• ${escHtml(full)}${badge}`;
                })
                .join('\n')
            : '• —',
          coachesUnknown.length
            ? '\n<i>Без вказаного типу:</i>\n' +
              coachesUnknown
                .map((c) => {
                  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `ID ${c.chatId}`;
                  const badge = c.isPrimary ? ' ⭐' : '';
                  const url = Helpers.publicCoachPageLink(c.chatId);
                  if (url) {
                    return `• <a href="${Helpers.htmlHrefAttr(url)}">${escHtml(full + badge)}</a>`;
                  }
                  return `• ${escHtml(full)}${badge}`;
                })
                .join('\n')
            : ''
        ].join('\n') + '\n\n'
      : '—\n\n') +
    `🕒 <b>Графік роботи</b>\n${escHtml(fmtHours(hours))}\n\n` +
    `📅 <b>Розклад групових</b>\n` +
    (sched.length
      ? escHtml(
          sched
            .slice(0, 12)
            .map((x) => `${WD[x.weekday] || x.weekday}: ${x.timeStart || '—'}–${x.timeEnd || '—'} · ${x.title || x.groupClassCode || '—'}`)
            .join('\n')
        )
      : '—');

  const keyboard = [
    [{ text: '✏️ Район', callback_data: `${CB.EDIT}:district` }],
    [
      { text: '✏️ Телефон', callback_data: `${CB.EDIT}:phone` },
      { text: '✏️ Telegram', callback_data: `${CB.EDIT}:tg` }
    ],
    [
      { text: '✏️ Instagram', callback_data: `${CB.EDIT}:ig` }
    ],
    [
      { text: '✏️ Наповнення', callback_data: `${CB.EDIT}:amenities` },
      { text: '✏️ Групові', callback_data: `${CB.EDIT}:groups` }
    ],
    [
      { text: '🕒 Графік роботи', callback_data: CB.HOURS },
      { text: '📅 Розклад групових', callback_data: CB.SCHED }
    ],
    [{ text: '💰 Ціни (довідник)', callback_data: `${CB.PRICES_MENU}:${vid}` }],
    [{ text: '👑 Призначити власника', callback_data: `${CB.OWNER_ASSIGN}:${vid}` }],
    ...coaches.slice(0, 10).map((c) => {
      const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `ID ${c.chatId}`;
      const badge = c.isPrimary ? ' ⭐' : '';
      const label = `👤 ${full}${badge}`;
      const short = label.length > 64 ? label.slice(0, 61) + '…' : label;
      const mainBotUrl = Helpers.publicCoachPageLink(c.chatId);
      const row = [{ text: short, callback_data: `ADM_USER:${c.chatId}` }];
      if (mainBotUrl) {
        row.push({ text: '🔗 У основному боті', url: mainBotUrl });
      }
      return row;
    }),
    [{ text: '🗑 Видалити', callback_data: `${CB.DELETE}:${vid}` }],
    [{ text: '⬅️ До списку', callback_data: CB.BACK_LIST }]
  ];

  await AdminTelegram.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML', disable_web_page_preview: true });
}

async function showHoursEditor(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  const hours = await supabase.getVenueHours(vid);
  d.step = STEPS_EXTRA.VENUE_VIEW;
  const text =
    '🕒 <b>Графік роботи</b>\n\n' +
    escHtml(fmtHours(hours)) +
    '\n\nВибери день, потім надішли час у форматі <code>HH:MM-HH:MM</code> або <code>-</code> (вихідний).';
  const keyboard = [
    [
      { text: 'Пн', callback_data: `${CB.HOURS_DAY}:1` },
      { text: 'Вт', callback_data: `${CB.HOURS_DAY}:2` },
      { text: 'Ср', callback_data: `${CB.HOURS_DAY}:3` }
    ],
    [
      { text: 'Чт', callback_data: `${CB.HOURS_DAY}:4` },
      { text: 'Пт', callback_data: `${CB.HOURS_DAY}:5` },
      { text: 'Сб', callback_data: `${CB.HOURS_DAY}:6` }
    ],
    [{ text: 'Нд', callback_data: `${CB.HOURS_DAY}:7` }],
    [{ text: '⬅️ Назад', callback_data: `${CB.VIEW}:${vid}` }]
  ];
  await AdminTelegram.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
}

async function showScheduleEditor(chatId, d) {
  const vid = d && d.viewVenueId ? String(d.viewVenueId) : '';
  if (!vid) return;
  const sched = await supabase.listVenueSchedule(vid, 50);
  const gcDir = await supabase.getVenueDirectoryCodes('group_class');
  const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));
  const gcFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind === 'group_class');
  const gcList = gcFacets.map((f) => (f.labelUa || gcMap.get(f.code) || f.code)).filter(Boolean);
  const grouped = new Map();
  for (const x of sched) {
    const key = x.groupClassCode || x.title || 'other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(x);
  }
  const schedBlock = !sched.length
    ? '—'
    : Array.from(grouped.entries())
        .map(([key, rows]) => {
          const labelFromFacet = gcFacets.find((f) => f.code === key)?.labelUa;
          const label = labelFromFacet || gcMap.get(key) || rows[0]?.title || key;
          const lines = rows
            .slice()
            .sort((a, b) => Number(a.weekday) - Number(b.weekday) || String(a.timeStart || '').localeCompare(String(b.timeStart || '')))
            .map((r) => `  ${WD[r.weekday] || r.weekday}: ${fmtTime(r.timeStart)}–${fmtTime(r.timeEnd)}`)
            .join('\n');
          return `${label}\n${lines}`;
        })
        .join('\n\n');
  const text =
    '📅 <b>Розклад групових</b>\n\n' +
    escHtml(schedBlock) +
    '\n\n🏷 <b>Групові заняття в закладі</b>:\n' +
    (gcList.length ? escHtml(gcList.join(', ')) : '—') +
    '\n\nМожна додати новий елемент або видалити існуючий.';

  const keyboard = [];
  keyboard.push([{ text: '➕ Додати заняття (вибрати вручну)', callback_data: CB.SCHED_ADD }]);
  for (const f of gcFacets.slice(0, 20)) {
    const label = (f.labelUa || gcMap.get(f.code) || f.code || '').trim();
    keyboard.push([
      {
        text: (`➕ ${label}`).slice(0, 64),
        callback_data: `${CB.SCHED_ADD_FOR}:${f.code}`
      }
    ]);
  }
  for (const x of (sched || []).slice(0, 10)) {
    const label = `${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)} ${x.title || x.groupClassCode || ''}`.trim();
    keyboard.push([
      {
        text: ('🗑 ' + label).slice(0, 64),
        callback_data: `${CB.SCHED_DEL}:${x.id}`
      }
    ]);
  }
  if (!gcList.length) {
    keyboard.push([{ text: '✏️ Додати групові в заклад', callback_data: `${CB.EDIT}:groups` }]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: `${CB.VIEW}:${vid}` }]);

  await AdminTelegram.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
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
    const label = `🏢 ${v.nameUa} · ${v.city}`;
    keyboard.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: `${CB.VIEW}:${v.id}`
      }
    ]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CB.MENU }]);
  await AdminTelegram.sendKeyboard(
    chatId,
    '📋 <b>Заклади</b>\n\nНатисни заклад, щоб відкрити картку (наповнення, графік, розклад).',
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

  const gmaps =
    d.latitude != null && d.longitude != null
      ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
      : '';

  let text =
    '📋 <b>Перевір дані закладу</b> перед збереженням у базу:\n\n' +
    `🏷 Назва: <b>${escHtml(d.nameUa)}</b>\n` +
    `🗺 Область: ${escHtml(d.oblast)}\n` +
    `🏙 Місто: ${escHtml(d.city)}\n` +
    `🏘 Район: ${d.district ? escHtml(d.district) : '—'}\n` +
    `📫 Адреса: ${d.address ? escHtml(d.address) : '—'}\n` +
    `📍 Координати: ${escHtml(String(d.latitude))}, ${escHtml(String(d.longitude))}` +
    (gmaps ? ` · <a href="${gmaps}">карта</a>` : '') +
    `\n` +
    `🏢 Тип організації: ${escHtml(orgLabel)}\n` +
    `🏷 Є в закладі: ${amnBlock}\n` +
    `🏷 Групові заняття: ${gcBlock}\n` +
    `📞 Телефон: ${d.phone ? escHtml(d.phone) : '—'}\n` +
    `🔗 Telegram: ${d.telegramUrl ? escHtml(d.telegramUrl) : '—'}\n` +
    `📸 Instagram: ${d.instagramUrl ? escHtml(d.instagramUrl) : '—'}`;

  return text;
}

async function showVenuePreview(chatId, d) {
  d.step = STEPS.PREVIEW;
  const body = await buildVenuePreviewText(d);
  const keyboard = [
    [
      { text: '✏️ Назва', callback_data: `${CB.EDIT}:name` },
      { text: '✏️ Область/місто', callback_data: `${CB.EDIT}:city` }
    ],
    [
      { text: '✏️ Адреса', callback_data: `${CB.EDIT}:address` },
      { text: '✏️ Район', callback_data: `${CB.EDIT}:district` }
    ],
    [{ text: '✏️ Координати', callback_data: `${CB.EDIT}:geo` }],
    [
      { text: '✏️ Тип організації', callback_data: `${CB.EDIT}:org` },
      { text: '✏️ Є в закладі', callback_data: `${CB.EDIT}:amenities` }
    ],
    [{ text: '✏️ Групові заняття', callback_data: `${CB.EDIT}:groups` }],
    [
      { text: '✏️ Телефон', callback_data: `${CB.EDIT}:phone` },
      { text: '✏️ Telegram', callback_data: `${CB.EDIT}:tg` }
    ],
    [{ text: '✏️ Instagram', callback_data: `${CB.EDIT}:ig` }],
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
    district: d.district || null,
    address: d.address || null,
    latitude: d.latitude,
    longitude: d.longitude,
    telegramUrl: d.telegramUrl || null,
    instagramUrl: d.instagramUrl || null,
    phone: d.phone || null,
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
  if (action === CB.BACK_LIST) {
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
    if (id) {
      const venueNewNotify = require('./venueNewNotify');
      venueNewNotify.notifyUsersNewVenue(id).catch((e) => console.error('venueNewNotify', e && e.message));
    }
    await showVenueMenu(chatId);
    return true;
  }

  if (action === CB.VIEW) {
    const vid = String(param || '').trim();
    await showVenueDetails(chatId, vid);
    return true;
  }
  if (action === CB.OWNER_ASSIGN) {
    const vid = String(param || '').trim();
    const d = getDraft(chatId) || {};
    d.step = STEPS_EXTRA.OWNER_ASSIGN_INPUT;
    d.viewVenueId = vid;
    setDraft(chatId, d);
    await AdminTelegram.sendMessage(
      chatId,
      '👑 Надішли <b>chat_id</b> користувача, якого потрібно призначити власником цього закладу.',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  if (action === CB.PRICES_MENU) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий картку закладу й натисни «💰 Ціни» ще раз.');
      return true;
    }
    await showVenuePricesMenu(chatId, d);
    return true;
  }
  if (action === CB.PRICE_G) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий картку закладу й натисни «💰 Ціни».');
      return true;
    }
    await showGroupClassPricesEditor(chatId, d);
    return true;
  }
  if (action === CB.PRICE_GC_ADD) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Не знайдено заклад. Відкрий «Ціни» з картки закладу.');
      return true;
    }
    const v = await supabase.getVenueById(d.viewVenueId);
    const facets = (v && v.facets) || d.parsedFacets || [];
    const gcFacets = facets.filter((f) => f && f.facetKind === 'group_class');
    if (!gcFacets.length) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Спочатку додай групові заняття в картці закладу (✏️ Групові), потім повтори.',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const gcDir = await supabase.getVenueDirectoryCodes('group_class');
    const gcMap = new Map(gcDir.map((x) => [x.code, x.labelUa]));
    const keyboard = [];
    for (const f of gcFacets.slice(0, 24)) {
      const lab = (f.labelUa || gcMap.get(f.code) || f.code || '').trim();
      keyboard.push([{ text: lab.slice(0, 60), callback_data: `${CB.PRICE_GC_PICK}:${f.code}` }]);
    }
    keyboard.push([{ text: '⬅️ Назад', callback_data: `${CB.PRICE_G}:${d.viewVenueId}` }]);
    await AdminTelegram.sendKeyboard(chatId, 'Обери тип групового заняття для ціни:', keyboard);
    return true;
  }
  if (action === CB.PRICE_GC_PICK) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    const code = String(param || '').trim();
    if (!code) return true;
    d.step = STEPS_EXTRA.VPRICE_GC_AMOUNT;
    d.vpriceGroupClassCode = code;
    setDraft(chatId, d);
    await AdminTelegram.sendMessage(
      chatId,
      'Надішли ціну числом (грн). Опційно через | коментар:\n<code>150</code> або <code>150 | вечірня група</code>',
      { parse_mode: 'HTML' }
    );
    return true;
  }
  if (action === CB.PRICE_GC_DEL) {
    const id = String(param || '').trim();
    if (!id) return true;
    const vidRow = await supabase.getVenueIdForPricingRow('venue_group_class_prices', id);
    if (vidRow) ensureVenueDraft(chatId, vidRow);
    const d = getDraft(chatId) || {};
    await supabase.deleteVenueGroupClassPrice(id);
    if (d.viewVenueId) await showGroupClassPricesEditor(chatId, d);
    else await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий «Ціни» з картки закладу ще раз.');
    return true;
  }
  if (action === CB.PRICE_M) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий картку закладу й натисни «💰 Ціни».');
      return true;
    }
    await showMembershipPricesEditor(chatId, d);
    return true;
  }
  if (action === CB.PRICE_M_ADD) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Не знайдено заклад.');
      return true;
    }
    d.step = STEPS_EXTRA.VPRICE_MEM_LINE;
    setDraft(chatId, d);
    await AdminTelegram.sendMessage(
      chatId,
        'Один рядок через |:\n<code>Назва | N | ціна</code>\nN — відвідувань на місяць або <code>безліміт</code>\n\nПриклад:\n<code>8 тренувань | 8 | 1200</code>',
      { parse_mode: 'HTML' }
    );
    return true;
  }
  if (action === CB.PRICE_M_DEL) {
    const id = String(param || '').trim();
    if (!id) return true;
    const vidRow = await supabase.getVenueIdForPricingRow('venue_gym_membership_offers', id);
    if (vidRow) ensureVenueDraft(chatId, vidRow);
    const d = getDraft(chatId) || {};
    await supabase.deleteVenueGymMembershipOffer(id);
    if (d.viewVenueId) await showMembershipPricesEditor(chatId, d);
    else await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий «Ціни» з картки закладу ще раз.');
    return true;
  }
  if (action === CB.PRICE_A) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий картку закладу й натисни «💰 Ціни».');
      return true;
    }
    await showAncillaryPricesEditor(chatId, d);
    return true;
  }
  if (action === CB.PRICE_A_PRE) {
    const pm = String(param || '').trim();
    const colon = pm.indexOf(':');
    let vid = '';
    let presetCode = '';
    if (colon >= 0) {
      vid = pm.slice(0, colon).trim();
      presetCode = pm.slice(colon + 1).trim();
    } else {
      presetCode = pm;
    }
    const d = ensureVenueDraft(chatId, vid) || getDraft(chatId);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий «Ціни» з картки закладу.');
      return true;
    }
    const code = presetCode;
    const preset = ANC_PRESETS[code];
    if (!preset) return true;
    d.step = STEPS_EXTRA.VPRICE_ANC_PRE;
    d.vpricePresetCode = code;
    setDraft(chatId, d);
    await AdminTelegram.sendMessage(
      chatId,
      `Надішли ціну (грн) для «${preset.labelUa}» одним числом:`,
      { parse_mode: 'HTML' }
    );
    return true;
  }
  if (action === CB.PRICE_A_ADD) {
    const vid = venueIdFromParamOrDraft(param, chatId);
    const d = ensureVenueDraft(chatId, vid);
    if (!d || !d.viewVenueId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Не знайдено заклад.');
      return true;
    }
    d.step = STEPS_EXTRA.VPRICE_ANC_CUSTOM;
    setDraft(chatId, d);
    await AdminTelegram.sendMessage(
      chatId,
        'Формат:\n<code>код_latin | Назва | ціна | one_time</code>\n\n<code>one_time</code> · <code>per_visit</code> · <code>per_month</code>\n\nПриклад:\n<code>locker | Ключ від шафи | 20 | per_visit</code>',
      { parse_mode: 'HTML' }
    );
    return true;
  }
  if (action === CB.PRICE_A_DEL) {
    const id = String(param || '').trim();
    if (!id) return true;
    const vidRow = await supabase.getVenueIdForPricingRow('venue_ancillary_services', id);
    if (vidRow) ensureVenueDraft(chatId, vidRow);
    const d = getDraft(chatId) || {};
    await supabase.deleteVenueAncillaryService(id);
    if (d.viewVenueId) await showAncillaryPricesEditor(chatId, d);
    else await AdminTelegram.sendMessage(chatId, '⚠️ Відкрий «Ціни» з картки закладу ще раз.');
    return true;
  }

  if (action === CB.HOURS) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    await showHoursEditor(chatId, d);
    return true;
  }

  if (action === CB.HOURS_DAY) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    const wd = parseInt(param, 10);
    if (Number.isNaN(wd) || wd < 1 || wd > 7) return true;
    d.step = STEPS_EXTRA.HOURS_INPUT;
    d.tmpWeekday = wd;
    await AdminTelegram.sendMessage(
      chatId,
      `✏️ ${WD[wd]}: надішли час <code>HH:MM-HH:MM</code> або <code>-</code> (вихідний).`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  if (action === CB.SCHED) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    await showScheduleEditor(chatId, d);
    return true;
  }

  if (action === CB.SCHED_ADD) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    d.tmpSchedule = { weekday: null, groupClassCode: null };
    const keyboard = [
      [
        { text: 'Пн', callback_data: `${CB.SCHED_WEEKDAY}:1` },
        { text: 'Вт', callback_data: `${CB.SCHED_WEEKDAY}:2` },
        { text: 'Ср', callback_data: `${CB.SCHED_WEEKDAY}:3` }
      ],
      [
        { text: 'Чт', callback_data: `${CB.SCHED_WEEKDAY}:4` },
        { text: 'Пт', callback_data: `${CB.SCHED_WEEKDAY}:5` },
        { text: 'Сб', callback_data: `${CB.SCHED_WEEKDAY}:6` }
      ],
      [{ text: 'Нд', callback_data: `${CB.SCHED_WEEKDAY}:7` }],
      [{ text: '⬅️ Назад', callback_data: CB.SCHED }]
    ];
    await AdminTelegram.sendKeyboard(chatId, 'Оберіть день тижня для заняття:', keyboard);
    return true;
  }

  if (action === CB.SCHED_ADD_FOR) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    const code = String(param || '').trim();
    if (!code) return true;
    d.tmpSchedule = { weekday: null, groupClassCode: code };
    const keyboard = [
      [
        { text: 'Пн', callback_data: `${CB.SCHED_WEEKDAY}:1` },
        { text: 'Вт', callback_data: `${CB.SCHED_WEEKDAY}:2` },
        { text: 'Ср', callback_data: `${CB.SCHED_WEEKDAY}:3` }
      ],
      [
        { text: 'Чт', callback_data: `${CB.SCHED_WEEKDAY}:4` },
        { text: 'Пт', callback_data: `${CB.SCHED_WEEKDAY}:5` },
        { text: 'Сб', callback_data: `${CB.SCHED_WEEKDAY}:6` }
      ],
      [{ text: 'Нд', callback_data: `${CB.SCHED_WEEKDAY}:7` }],
      [{ text: '⬅️ Назад', callback_data: CB.SCHED }]
    ];
    await AdminTelegram.sendKeyboard(chatId, 'Оберіть день тижня для цього заняття:', keyboard);
    return true;
  }

  if (action === CB.SCHED_WEEKDAY) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    const wd = parseInt(param, 10);
    if (Number.isNaN(wd) || wd < 1 || wd > 7) return true;
    if (!d.tmpSchedule) d.tmpSchedule = { weekday: null, groupClassCode: null };
    d.tmpSchedule.weekday = wd;

    if (d.tmpSchedule.groupClassCode) {
      d.step = STEPS_EXTRA.SCHED_TIME_INPUT;
      await AdminTelegram.sendMessage(
        chatId,
        `✏️ ${WD[d.tmpSchedule.weekday]}: надішли час <code>HH:MM-HH:MM</code> (наприклад <code>18:00-19:00</code>).`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    const gcFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind === 'group_class');
    const keyboard = [];
    for (const f of gcFacets.slice(0, 24)) {
      const label = (f.labelUa || f.code || '').trim();
      keyboard.push([{ text: (label || f.code).slice(0, 60), callback_data: `${CB.SCHED_GROUP}:${f.code}` }]);
    }
    keyboard.push([{ text: '⬅️ Назад', callback_data: CB.SCHED_ADD }]);
    await AdminTelegram.sendKeyboard(
      chatId,
      `Оберіть групове заняття для ${WD[wd]} (береться зі списку “Групові заняття”):`,
      keyboard
    );
    return true;
  }

  if (action === CB.SCHED_GROUP) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    if (!d.tmpSchedule || !d.tmpSchedule.weekday) return true;
    d.tmpSchedule.groupClassCode = String(param || '').trim();
    d.step = STEPS_EXTRA.SCHED_TIME_INPUT;
    await AdminTelegram.sendMessage(
      chatId,
      `✏️ ${WD[d.tmpSchedule.weekday]}: надішли час <code>HH:MM-HH:MM</code> (наприклад <code>18:00-19:00</code>).`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  if (action === CB.SCHED_DEL) {
    const d = getDraft(chatId);
    if (!d || !d.viewVenueId) return true;
    const sid = String(param || '').trim();
    if (!sid) return true;
    await supabase.deleteVenueScheduleItem(d.viewVenueId, sid);
    await showScheduleEditor(chatId, d);
    return true;
  }

  if (action === CB.EDIT) {
    const d = getDraft(chatId);
    if (!d || (d.step !== STEPS.PREVIEW && d.step !== STEPS_EXTRA.VENUE_VIEW)) return true;
    if (d.step === STEPS.PREVIEW) d.returnToPreview = true;
    else d.returnToVenueView = true;
    const field = String(param || '').trim();

    if (field === 'name') {
      d.step = STEPS.NAME;
      await AdminTelegram.sendMessage(chatId, '✏️ Введи назву закладу українською:');
      return true;
    }
    if (field === 'city') {
      d.oblast = '';
      d.city = '';
      d.pendingOblastOptions = null;
      d.pendingCityOptions = null;
      d.step = STEPS.OBLAST_INPUT;
      await AdminTelegram.sendMessage(chatId, '🗺️ Введи область (від 2 літер):');
      return true;
    }
    if (field === 'address') {
      d.step = STEPS.ADDRESS;
      await AdminTelegram.sendKeyboard(chatId, '✏️ Текстовий адрес (опційно):', [
        [{ text: '⏭️ Без адреси', callback_data: CB.SKIP_ADDR }]
      ]);
      return true;
    }
    if (field === 'district') {
      d.step = STEPS.DISTRICT;
      await AdminTelegram.sendKeyboard(chatId, '✏️ Район у межах населеного пункту (опційно):', [
        [{ text: '⏭️ Без району', callback_data: CB.SKIP_DISTRICT }]
      ]);
      return true;
    }
    if (field === 'geo') {
      d.step = STEPS.LOCATION;
      await AdminTelegram.sendMessage(chatId, '📍 Надішли геолокацію закладу (кнопка «Локація» в Telegram).');
      return true;
    }
    if (field === 'org') {
      d.step = STEPS.ORG;
      await showOrgKeyboard(chatId);
      return true;
    }
    if (field === 'amenities') {
      d.step = STEPS.AMENITIES;
      d.amenityMessageId = null;
      hydrateAmenitySelectedFromFacets(d);
      await showAmenityPicker(chatId, d, null);
      return true;
    }
    if (field === 'groups') {
      d.step = STEPS.FACETS;
      d.groupClassPage = 0;
      d.groupClassMessageId = null;
      hydrateGroupClassSelectedFromFacets(d);
      await showGroupClassPicker(chatId, d, null);
      return true;
    }
    if (field === 'tg') {
      d.step = STEPS.TG;
      await AdminTelegram.sendKeyboard(chatId, 'Посилання на Telegram закладу (t.me/…):', [
        [{ text: '⏭️ Пропустити', callback_data: CB.SKIP_TG }]
      ]);
      return true;
    }
    if (field === 'phone') {
      d.step = STEPS.PHONE;
      await AdminTelegram.sendKeyboard(chatId, 'Телефон закладу (для копіювання):', [
        [{ text: '⏭️ Пропустити', callback_data: CB.SKIP_PHONE }]
      ]);
      return true;
    }
    if (field === 'ig') {
      d.step = STEPS.IG;
      await AdminTelegram.sendKeyboard(chatId, 'Instagram:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
      return true;
    }

    await showVenuePreview(chatId, d);
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
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.ADDRESS;
      await AdminTelegram.sendKeyboard(chatId, 'Текстовий адрес (опційно):', [
        [{ text: '⏭️ Без адреси', callback_data: CB.SKIP_ADDR }]
      ]);
    }
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
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.DISTRICT;
      await AdminTelegram.sendKeyboard(
        chatId,
        'Район у межах населеного пункту (опційно; для сповіщень користувачам):',
        [[{ text: '⏭️ Без району', callback_data: CB.SKIP_DISTRICT }]]
      );
    }
    return true;
  }
  if (action === CB.SKIP_DISTRICT) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.DISTRICT) return true;
    d.district = '';
    if (consumeReturnToVenueView(d)) {
      await supabase.updateVenue(d.viewVenueId, { district: null });
      await showVenueDetails(chatId, d.viewVenueId);
      return true;
    }
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
      return true;
    }
    d.step = STEPS.LOCATION;
    await AdminTelegram.sendMessage(
      chatId,
      '📍 Надішли геолокацію закладу (кнопка «Локація» в Telegram). Без точки на карті зберегти неможливо.'
    );
    return true;
  }
  if (action === CB.SKIP_FAC) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.FACETS) return true;
    d.parsedFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind === 'amenity');
    d.groupClassSelected = [];
    d.groupClassCustom = [];
    if (consumeReturnToVenueView(d)) {
      await supabase.replaceVenueFacets(d.viewVenueId, d.parsedFacets || []);
      await showVenueDetails(chatId, d.viewVenueId);
    } else if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
    await goToTelegramStep(chatId, d);
    }
    return true;
  }

  if (action === CB.SKIP_AMN) {
    const d = getDraft(chatId);
    if (!d || d.step !== STEPS.AMENITIES) return true;
    d.amenitySelected = [];
    d.parsedFacets = (d.parsedFacets || []).filter((f) => f && f.facetKind !== 'amenity');
    if (consumeReturnToVenueView(d)) {
      await supabase.replaceVenueFacets(d.viewVenueId, d.parsedFacets || []);
      await showVenueDetails(chatId, d.viewVenueId);
    } else if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.FACETS;
      d.groupClassPage = 0;
      d.groupClassSelected = [];
      d.groupClassCustom = [];
      d.groupClassMessageId = null;
      await showGroupClassPicker(chatId, d, null);
    }
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
  if (action === CB.SKIP_TG || action === CB.SKIP_IG || action === CB.SKIP_PHONE) {
    const d = getDraft(chatId);
    if (!d) return true;
    if (action === CB.SKIP_TG && d.step === STEPS.TG) {
      d.telegramUrl = '';
      if (consumeReturnToVenueView(d)) {
        await supabase.updateVenue(d.viewVenueId, { telegramUrl: '' });
        await showVenueDetails(chatId, d.viewVenueId);
      } else if (consumeReturnToPreview(d)) {
        await showVenuePreview(chatId, d);
      } else {
      d.step = STEPS.IG;
      await AdminTelegram.sendKeyboard(chatId, 'Instagram:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
      }
      return true;
    }
    if (action === CB.SKIP_IG && d.step === STEPS.IG) {
      d.instagramUrl = '';
      if (consumeReturnToVenueView(d)) {
        await supabase.updateVenue(d.viewVenueId, { instagramUrl: '' });
        await showVenueDetails(chatId, d.viewVenueId);
      } else if (consumeReturnToPreview(d)) {
        await showVenuePreview(chatId, d);
      } else {
        d.step = STEPS.PHONE;
        await AdminTelegram.sendKeyboard(chatId, 'Телефон закладу (для копіювання):', [
          [{ text: '⏭️ Пропустити', callback_data: CB.SKIP_PHONE }]
        ]);
      }
      return true;
    }
    if (action === CB.SKIP_PHONE && d.step === STEPS.PHONE) {
      d.phone = '';
      if (consumeReturnToVenueView(d)) {
        await supabase.updateVenue(d.viewVenueId, { phone: '' });
        await showVenueDetails(chatId, d.viewVenueId);
        return true;
      }
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
    if (consumeReturnToVenueView(d)) {
      await supabase.replaceVenueFacets(d.viewVenueId, d.parsedFacets || []);
      await showVenueDetails(chatId, d.viewVenueId);
    } else if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
    await goToTelegramStep(chatId, d);
    }
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
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.AMENITIES;
      d.amenitySelected = [];
      d.amenityMessageId = null;
      d.parsedFacets = [];
      await showAmenityPicker(chatId, d, null);
    }
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
    if (consumeReturnToVenueView(d)) {
      await supabase.replaceVenueFacets(d.viewVenueId, d.parsedFacets || []);
      await showVenueDetails(chatId, d.viewVenueId);
    } else if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
    d.step = STEPS.FACETS;
    d.groupClassPage = 0;
    d.groupClassSelected = [];
      d.groupClassCustom = [];
    d.groupClassMessageId = null;
    await showGroupClassPicker(chatId, d, null);
    }
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
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.OBLAST_INPUT;
      await AdminTelegram.sendMessage(
        chatId,
        '🗺️ Введи область (від 2 літер) — з’явиться список для вибору (як при реєстрації користувача):'
      );
    }
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
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.DISTRICT;
      await AdminTelegram.sendKeyboard(
        chatId,
        'Район у межах населеного пункту (опційно; для сповіщень користувачам):',
        [[{ text: '⏭️ Без району', callback_data: CB.SKIP_DISTRICT }]]
      );
    }
    return true;
  }
  if (d.step === STEPS.DISTRICT) {
    d.district = raw.slice(0, 120);
    if (consumeReturnToVenueView(d)) {
      await supabase.updateVenue(d.viewVenueId, { district: d.district ? String(d.district).trim() : null });
      await showVenueDetails(chatId, d.viewVenueId);
      return true;
    }
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
      return true;
    }
    d.step = STEPS.LOCATION;
    await AdminTelegram.sendMessage(chatId, '📍 Надішли геолокацію закладу.');
    return true;
  }
  if (d.step === STEPS.TG) {
    if (raw.toLowerCase() === '/skip') {
      d.telegramUrl = '';
    } else {
      d.telegramUrl = normalizeSocialUrl(raw, 'telegram');
    }
    if (consumeReturnToVenueView(d)) {
      await supabase.updateVenue(d.viewVenueId, { telegramUrl: d.telegramUrl || '' });
      await showVenueDetails(chatId, d.viewVenueId);
      return true;
    }
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
    d.step = STEPS.IG;
    await AdminTelegram.sendKeyboard(chatId, 'Instagram:', [[{ text: '⏭️ Пропустити', callback_data: CB.SKIP_IG }]]);
    }
    return true;
  }
  if (d.step === STEPS.IG) {
    if (raw.toLowerCase() === '/skip') d.instagramUrl = '';
    else d.instagramUrl = normalizeSocialUrl(raw, 'instagram');
    if (consumeReturnToVenueView(d)) {
      await supabase.updateVenue(d.viewVenueId, { instagramUrl: d.instagramUrl || '' });
      await showVenueDetails(chatId, d.viewVenueId);
      return true;
    }
    if (consumeReturnToPreview(d)) {
      await showVenuePreview(chatId, d);
    } else {
      d.step = STEPS.PHONE;
      await AdminTelegram.sendKeyboard(chatId, 'Телефон закладу (для копіювання):', [
        [{ text: '⏭️ Пропустити', callback_data: CB.SKIP_PHONE }]
      ]);
    }
    return true;
  }
  if (d.step === STEPS.PHONE) {
    if (raw.toLowerCase() === '/skip') d.phone = '';
    else d.phone = raw;
    if (consumeReturnToVenueView(d)) {
      await supabase.updateVenue(d.viewVenueId, { phone: d.phone || '' });
      await showVenueDetails(chatId, d.viewVenueId);
      return true;
    }
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

  if (d.step === STEPS_EXTRA.HOURS_INPUT) {
    const wd = Number(d.tmpWeekday);
    const tr = parseTimeRange(raw);
    if (!wd || wd < 1 || wd > 7 || !tr) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Формат: <code>HH:MM-HH:MM</code> або <code>-</code> (вихідний). Спробуй ще раз.',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const vid = String(d.viewVenueId || '').trim();
    const ok = await supabase.upsertVenueHours(vid, [
      { weekday: wd, isClosed: tr.isClosed, timeOpen: tr.timeOpen, timeClose: tr.timeClose }
    ]);
    if (!ok) await AdminTelegram.sendMessage(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
    d.step = STEPS_EXTRA.VENUE_VIEW;
    d.tmpWeekday = null;
    await showHoursEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.SCHED_TIME_INPUT) {
    if (!d.tmpSchedule || !d.tmpSchedule.weekday || !d.tmpSchedule.groupClassCode) return true;
    const tr = parseTimeRange(raw);
    if (!tr || tr.isClosed) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Формат: <code>HH:MM-HH:MM</code> (наприклад <code>18:00-19:00</code>).',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const vid = String(d.viewVenueId || '').trim();
    const code = String(d.tmpSchedule.groupClassCode);
    const label =
      (d.parsedFacets || []).find((f) => f && f.facetKind === 'group_class' && f.code === code)?.labelUa || code;
    await supabase.addVenueScheduleItem({
      venueId: vid,
      weekday: Number(d.tmpSchedule.weekday),
      timeStart: tr.timeOpen,
      timeEnd: tr.timeClose,
      groupClassCode: code,
      title: label
    });
    d.step = STEPS_EXTRA.VENUE_VIEW;
    d.tmpSchedule = null;
    await showScheduleEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.VPRICE_GC_AMOUNT) {
    const parsed = parseGcPriceLine(raw);
    if (!parsed) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Невірний формат. Надішли число або <code>150 | коментар</code>',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const code = String(d.vpriceGroupClassCode || '').trim();
    const vid = String(d.viewVenueId || '').trim();
    if (!code || !vid) return false;
    const ok = await supabase.upsertVenueGroupClassPrice(vid, {
      groupClassCode: code,
      price: parsed.price,
      currency: parsed.currency,
      labelUa: parsed.labelUa
    });
    d.step = STEPS_EXTRA.VENUE_VIEW;
    d.vpriceGroupClassCode = null;
    if (!ok) {
      await AdminTelegram.sendMessage(
        chatId,
        '❌ Не вдалося зберегти. Перевір, що в Supabase застосовано міграцію <code>venue_group_class_prices</code>.',
        { parse_mode: 'HTML' }
      );
    }
    await showGroupClassPricesEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.VPRICE_MEM_LINE) {
    const p = parseMembershipTriple(raw);
    if (!p) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Формат: <code>Назва | N | ціна</code> або <code>Назва | безліміт | ціна</code>',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const vid = String(d.viewVenueId || '').trim();
    if (!vid) return false;
    const ok = await supabase.insertVenueGymMembershipOffer(vid, p);
    d.step = STEPS_EXTRA.VENUE_VIEW;
    if (!ok) {
      await AdminTelegram.sendMessage(
        chatId,
        '❌ Не вдалося зберегти. Перевір міграцію <code>venue_gym_membership_offers</code>.',
        { parse_mode: 'HTML' }
      );
    }
    await showMembershipPricesEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.VPRICE_ANC_PRE) {
    const preset = ANC_PRESETS[d.vpricePresetCode];
    const price = parseFloat(raw.replace(',', '.'));
    const vid = String(d.viewVenueId || '').trim();
    if (!preset || !vid) return false;
    if (Number.isNaN(price) || price < 0) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Надішли коректне число (грн).');
      return true;
    }
    const ok = await supabase.upsertVenueAncillaryService(vid, {
      serviceCode: d.vpricePresetCode,
      labelUa: preset.labelUa,
      price,
      unit: preset.unit,
      currency: 'UAH'
    });
    d.step = STEPS_EXTRA.VENUE_VIEW;
    d.vpricePresetCode = null;
    if (!ok) {
      await AdminTelegram.sendMessage(
        chatId,
        '❌ Не вдалося зберегти. Перевір міграцію <code>venue_ancillary_services</code>.',
        { parse_mode: 'HTML' }
      );
    }
    await showAncillaryPricesEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.VPRICE_ANC_CUSTOM) {
    const p = parseAncillaryCustom(raw);
    if (!p) {
      await AdminTelegram.sendMessage(
        chatId,
        '⚠️ Формат: <code>код | Назва | ціна | one_time|per_visit|per_month</code>',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    const vid = String(d.viewVenueId || '').trim();
    if (!vid) return false;
    const ok = await supabase.upsertVenueAncillaryService(vid, p);
    d.step = STEPS_EXTRA.VENUE_VIEW;
    if (!ok) {
      await AdminTelegram.sendMessage(chatId, '❌ Не вдалося зберегти.', { parse_mode: 'HTML' });
    }
    await showAncillaryPricesEditor(chatId, d);
    return true;
  }

  if (d.step === STEPS_EXTRA.OWNER_ASSIGN_INPUT) {
    const vid = String(d.viewVenueId || '').trim();
    if (!vid) return false;
    const ownerChatId = String(raw || '').trim();
    if (!ownerChatId) {
      await AdminTelegram.sendMessage(chatId, '⚠️ Надішли коректний chat_id.');
      return true;
    }
    const user = await supabase.getUserByChatId(ownerChatId);
    if (!user) {
      await AdminTelegram.sendMessage(
        chatId,
        '❌ Користувача не знайдено. Спочатку він має зареєструватися в основному боті.'
      );
      return true;
    }
    const okRole = await supabase.updateUser(ownerChatId, { role: 'venue_owner' });
    const okAssign = okRole ? await supabase.assignVenueManager(ownerChatId, vid, 'owner') : false;
    d.step = STEPS_EXTRA.VENUE_VIEW;
    setDraft(chatId, d);
    if (!okRole || !okAssign) {
      await AdminTelegram.sendMessage(chatId, '❌ Не вдалося призначити власника. Перевір логи Supabase.');
      return true;
    }
    await AdminTelegram.sendMessage(
      chatId,
      `✅ Призначено власника закладу: <code>${escHtml(ownerChatId)}</code>.`,
      { parse_mode: 'HTML' }
    );
    await showVenueDetails(chatId, vid);
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
  if (consumeReturnToPreview(d)) {
    await showVenuePreview(chatId, d);
  } else {
  d.step = STEPS.ORG;
  await showOrgKeyboard(chatId);
  }
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
