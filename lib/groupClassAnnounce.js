/**
 * Оголошення про групове заняття тренера (етап C).
 * Аудиторії: свої клієнти / клієнти залу / користувачі НП.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

const SEND_DELAY_MS = 70;
const AUDIENCE = Object.freeze({
  OWN: 'gca_own',
  VENUE: 'gca_venue',
  CITY: 'gca_city'
});

const WD = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kyivYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(date);
}

function isSendableChatId(id) {
  const s = String(id || '').trim();
  return /^-?\d+$/.test(s) && !s.toUpperCase().startsWith('INVITE_');
}

function fmtTime(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return s;
}

function fmtScheduleLines(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) return 'за розкладом — уточнюйте';
  return arr
    .map((x) => (WD[x.weekday] || x.weekday) + ' ' + fmtTime(x.timeStart) + '-' + fmtTime(x.timeEnd))
    .join(', ');
}

function fmtPrice(cls) {
  if (!cls || cls.priceAmount == null) return null;
  const n = Number(cls.priceAmount);
  if (Number.isNaN(n)) return null;
  const cur = cls.priceCurrency || 'UAH';
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + ' ' + cur;
}

function audienceTitle(type) {
  if (type === AUDIENCE.OWN) return 'своїм клієнтам';
  if (type === AUDIENCE.VENUE) return 'клієнтам залу (у т.ч. з іншим тренером)';
  if (type === AUDIENCE.CITY) return 'користувачам платформи в населеному пункті';
  return '—';
}

function buildAnnounceText(coach, venue, cls, scheduleRows) {
  const coachName =
    [coach && coach.firstName, coach && coach.lastName].filter(Boolean).join(' ').trim() || 'Тренер';
  const title = (cls && (cls.labelUa || cls.groupClassCode)) || 'Групове заняття';
  const venueName = (venue && venue.nameUa) || 'заклад';
  const cityLine = [venue && venue.city, venue && venue.oblast].filter(Boolean).join(', ');
  const desc = cls && cls.description ? String(cls.description).trim() : '';
  const price = fmtPrice(cls);
  const schedule = fmtScheduleLines(scheduleRows);
  let text = '📣 Нове групове заняття\n\n';
  text += title + '\n';
  text += 'Тренер: ' + coachName + '\n';
  text += 'Де: ' + venueName + (cityLine ? ' (' + cityLine + ')' : '') + '\n';
  text += 'Коли: ' + schedule + '\n';
  if (price) text += 'Вартість: ' + price + '\n';
  if (desc) text += '\n' + desc + '\n';
  text += '\nЯкщо цікаво — напишіть тренеру в боті або на занятті.';
  return text;
}

async function loadCardContext(chatId) {
  const st = await State.get(chatId);
  const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
  const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
  if (!venueId || !code) return null;
  const user = await User.getByChatId(chatId);
  if (!user || String(user.role || '').toLowerCase() !== CONSTANTS.ROLES.COACH) return null;
  const venue = await supabase.getVenueById(venueId);
  const cls = await supabase.getCoachGroupClass(chatId, venueId, code);
  if (!venue || !cls || cls.isArchived) return null;
  const coachSchedule = await supabase.listCoachGroupSchedule(chatId, venueId, code);
  const venueSchedule = (await supabase.listVenueSchedule(venueId, 300)).filter(
    (x) => String(x.groupClassCode || '') === code
  );
  const scheduleRows = venueSchedule.length ? venueSchedule : coachSchedule;
  return { user, venue, cls, venueId, code, scheduleRows, text: buildAnnounceText(user, venue, cls, scheduleRows) };
}

async function hasAnnounceToday(coachChatId, venueId, audienceType, classCode) {
  const since = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
  const rows = await supabase.listBroadcastLogSince(coachChatId, since, venueId || null);
  const today = kyivYmd();
  const marker = '|' + String(classCode || '') + '|';
  return rows.some(
    (r) =>
      r.audienceType === audienceType &&
      r.createdAt &&
      kyivYmd(r.createdAt) === today &&
      String(r.city || '').includes(marker)
  );
}

async function resolveRecipients(chatId, audience, venueId, venue) {
  let skipped = 0;
  const sendIds = [];
  const seen = new Set();

  if (audience === AUDIENCE.OWN) {
    const students = await supabase.getStudentsByCoachId(chatId);
    for (const s of students || []) {
      const id = String(s.chatId || '').trim();
      if (!isSendableChatId(id)) {
        skipped += 1;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      sendIds.push(id);
    }
    return { sendIds, skipped };
  }

  if (audience === AUDIENCE.VENUE) {
    const ids = await supabase.listUserChatIdsLinkedToVenue(venueId, chatId);
    for (const id of ids) {
      if (!isSendableChatId(id)) {
        skipped += 1;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      sendIds.push(id);
    }
    return { sendIds, skipped };
  }

  if (audience === AUDIENCE.CITY) {
    const city = venue && venue.city ? String(venue.city).trim() : '';
    if (!city) return { sendIds: [], skipped: 0, error: 'У закладу не вказано населений пункт.' };
    const ids = await supabase.listGroupClassAnnounceCityChatIds({
      city,
      excludeChatId: chatId,
      excludeCoachId: chatId,
      adsOnly: true
    });
    for (const id of ids) {
      if (!isSendableChatId(id)) {
        skipped += 1;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      sendIds.push(id);
    }
    return { sendIds, skipped };
  }

  return { sendIds: [], skipped: 0 };
}

async function showAnnounceMenu(chatId) {
  const ctx = await loadCardContext(chatId);
  if (!ctx) {
    await Helpers.safeSend(chatId, '⚠️ Відкрий активну картку свого групового заняття.');
    return;
  }
  const { venue, cls, venueId, code } = ctx;
  await State.update(chatId, {
    profileGroupVenueId: venueId,
    profileGroupClassCode: code,
    gcaAudience: null,
    gcaPreviewIds: null
  });
  const city = [venue.city, venue.oblast].filter(Boolean).join(', ') || 'не вказано';
  await Helpers.sendKeyboard(
    chatId,
    '📣 Оголошення: ' +
      (cls.labelUa || code) +
      '\n🏢 ' +
      (venue.nameUa || '') +
      '\n📍 ' +
      city +
      '\n\nКому надіслати?\n' +
      '• свої клієнти — без обмеження ads\n' +
      '• клієнти залу — усі з привʼязкою до клубу (і з іншим тренером)\n' +
      '• НП платформи — з увімкненими новинами в цьому населеному пункті\n\n' +
      'Ліміт: 1 розсилка на аудиторію для цього заняття на добу (Київ).',
    [
      [{ text: '👥 Свої клієнти', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_OWN }],
      [{ text: '🏢 Клієнти залу', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_VENUE }],
      [{ text: '📍 Користувачі НП', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_CITY }],
      [
        {
          text: '⬅️ До картки',
          callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${code}`
        }
      ]
    ]
  );
}

async function showAnnouncePreview(chatId, audience) {
  const ctx = await loadCardContext(chatId);
  if (!ctx) {
    await Helpers.safeSend(chatId, '⚠️ Контекст заняття втрачено.');
    return;
  }
  const { venue, venueId, code, text } = ctx;
  if (await hasAnnounceToday(chatId, venueId, audience, code)) {
    await Helpers.safeSend(
      chatId,
      '⏳ Сьогодні для цієї аудиторії оголошення вже надсилалось.\nСпробуй завтра або обери іншу аудиторію.'
    );
    await showAnnounceMenu(chatId);
    return;
  }
  const resolved = await resolveRecipients(chatId, audience, venueId, venue);
  if (resolved.error) {
    await Helpers.safeSend(chatId, '⚠️ ' + resolved.error);
    await showAnnounceMenu(chatId);
    return;
  }
  await State.update(chatId, {
    gcaAudience: audience,
    gcaPreviewIds: resolved.sendIds
  });
  const snippet = text.length > 400 ? text.slice(0, 397) + '…' : text;
  const n = resolved.sendIds.length;
  await Helpers.sendKeyboard(
    chatId,
    '📣 Превʼю оголошення\n\nКому: ' +
      audienceTitle(audience) +
      '\nОтримувачів: ' +
      n +
      (resolved.skipped ? ' (пропущено ' + resolved.skipped + ')' : '') +
      '\n\n———\n' +
      snippet +
      '\n———\n\nНадіслати?',
    [
      [{ text: '✅ Надіслати', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_SEND }],
      [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_CANCEL }],
      [
        {
          text: '⬅️ До картки',
          callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${code}`
        }
      ]
    ]
  );
}

async function sendAnnounce(chatId) {
  const ctx = await loadCardContext(chatId);
  if (!ctx) {
    await Helpers.safeSend(chatId, '⚠️ Контекст заняття втрачено.');
    return;
  }
  const st = await State.get(chatId);
  const audience = st && st.gcaAudience ? String(st.gcaAudience) : '';
  const ids = Array.isArray(st && st.gcaPreviewIds) ? st.gcaPreviewIds.map(String) : [];
  if (!audience || !Object.values(AUDIENCE).includes(audience)) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку обери аудиторію.');
    await showAnnounceMenu(chatId);
    return;
  }
  if (await hasAnnounceToday(chatId, ctx.venueId, audience, ctx.code)) {
    await Helpers.safeSend(chatId, '⏳ Ліміт на цю аудиторію сьогодні вже використано.');
    await showAnnounceMenu(chatId);
    return;
  }
  if (!ids.length) {
    await Helpers.safeSend(chatId, 'ℹ️ Немає отримувачів для цієї аудиторії.');
    await showAnnounceMenu(chatId);
    return;
  }

  let sent = 0;
  let failed = 0;
  await Helpers.safeSend(chatId, '⏳ Надсилаю оголошення (' + ids.length + ')…');
  for (const to of ids) {
    const ok = await Helpers.safeSend(to, ctx.text);
    if (ok) sent += 1;
    else failed += 1;
    await sleep(SEND_DELAY_MS);
  }

  await supabase.insertBroadcastLog({
    senderChatId: String(chatId),
    senderRole: CONSTANTS.ROLES.COACH,
    venueId: ctx.venueId,
    audienceType: audience,
    city: '|' + ctx.code + '|' + (ctx.venue.city || ''),
    oblast: ctx.venue.oblast || null,
    body: ctx.text,
    sentCount: sent,
    skippedCount: 0,
    failedCount: failed
  });

  await State.update(chatId, { gcaAudience: null, gcaPreviewIds: null });
  await Helpers.sendKeyboard(
    chatId,
    '✅ Оголошення надіслано.\nДоставлено: ' + sent + (failed ? '\nНе вдалось: ' + failed : ''),
    [
      [
        {
          text: '⬅️ До картки заняття',
          callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${ctx.code}`
        }
      ],
      [{ text: '📣 Ще аудиторія', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANNOUNCE }]
    ]
  );
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = (parts[0] || '').trim();

  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANNOUNCE) {
    await showAnnounceMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_OWN) {
    await showAnnouncePreview(chatId, AUDIENCE.OWN);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_VENUE) {
    await showAnnouncePreview(chatId, AUDIENCE.VENUE);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_CITY) {
    await showAnnouncePreview(chatId, AUDIENCE.CITY);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_SEND) {
    await sendAnnounce(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANN_CANCEL) {
    await showAnnounceMenu(chatId);
    return true;
  }
  return false;
}

module.exports = {
  AUDIENCE,
  showAnnounceMenu,
  handleCallback,
  buildAnnounceText
};
