/**
 * Абонемент залу — особистий облік з привʼязкою до закладу.
 * Типи: безліміт / на N; офери залу або ручне введення; один активний на (user, venue).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function parseDateDDMMYYYY(str) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(str).trim());
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function toYYYYMMDD(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function formatDateUA(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-');
  if (!d) return ymd;
  const months = [
    'січня',
    'лютого',
    'березня',
    'квітня',
    'травня',
    'червня',
    'липня',
    'серпня',
    'вересня',
    'жовтня',
    'листопада',
    'грудня'
  ];
  const mi = parseInt(m, 10) - 1;
  return d + ' ' + (months[mi] || m) + ' ' + y;
}

function venueLabel(v) {
  if (!v) return 'Заклад';
  const name = (v.nameUa || v.name || v.title || '').toString().trim();
  const city = (v.city || '').toString().trim();
  const base = name || 'Заклад';
  return city ? base + ' (' + city + ')' : base;
}

function clearSubDraft(extra = {}) {
  return {
    subAmount: undefined,
    subType: undefined,
    subCount: undefined,
    subStartDate: undefined,
    subEndDate: undefined,
    subOfferId: undefined,
    ...extra
  };
}

async function showMenu(chatId) {
  const endedLegacy = await supabase.getEndedGymSubscriptionsWithoutVenue(chatId);
  if (endedLegacy && endedLegacy.length) {
    await showLegacyBind(chatId, endedLegacy[0]);
    return;
  }

  const venues = await supabase.getUserVenues(chatId);
  if (!venues || venues.length === 0) {
    await State.update(chatId, { step: 'sub_menu', subVenueId: undefined });
    const keyboard = [
      [{ text: '🏢 Додати / знайти заклад', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(
      chatId,
      '🎫 **Абонемент залу**\n\n' +
        'Абонемент привʼязується до конкретного закладу.\n\n' +
        'Спочатку додай заклад у профіль (Клуби, студії), потім повернись сюди.',
      keyboard,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (venues.length === 1) {
    await showVenueMenu(chatId, venues[0].id);
    return;
  }

  await State.update(chatId, { step: 'sub_menu', subVenueId: undefined, ...clearSubDraft() });
  const keyboard = venues.map((v) => [
    {
      text: venueLabel(v).slice(0, 64),
      callback_data: CONSTANTS.CALLBACK_PREFIXES.SUB_VENUE + ':' + v.id
    }
  ]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(
    chatId,
    '🎫 **Абонемент залу**\n\nОбери заклад — абонементи різних залів обліковуються окремо.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showLegacyBind(chatId, sub) {
  const venues = await supabase.getUserVenues(chatId);
  let text =
    '🎫 **Старий абонемент без закладу**\n\n' +
    'Період: ' +
    formatDateUA(sub.startDate) +
    ' — ' +
    formatDateUA(sub.endDate) +
    '\n' +
    'Термін уже закінчився. Обери заклад, до якого він відносився.\n';
  const keyboard = [];
  if (!venues || !venues.length) {
    text += '\nСпочатку додай заклад у «Клуби, студії».';
    keyboard.push([{ text: '🏢 Додати / знайти заклад', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]);
  } else {
    for (const v of venues) {
      keyboard.push([
        {
          text: venueLabel(v).slice(0, 64),
          callback_data:
            CONSTANTS.CALLBACK_PREFIXES.SUB_LEGACY_VENUE + ':' + sub.id + ':' + v.id
        }
      ]);
    }
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showVenueMenu(chatId, venueId) {
  const vid = String(venueId);
  await State.update(chatId, { step: 'sub_menu', subVenueId: vid, ...clearSubDraft() });
  const venue = await supabase.getVenueById(vid);
  const active = await supabase.getActiveGymSubscription(chatId, vid);
  let text = '🎫 **Абонемент залу**\n\n🏢 ' + venueLabel(venue) + '\n\n';
  if (active) {
    text += 'Поточний абонемент:\n';
    if (active.amount != null) text += '• Сума: ' + active.amount + ' грн\n';
    text += active.isUnlimited
      ? '• Безлімітне відвідування\n'
      : '• Тренувань: ' + (active.trainingsCount || 0) + '\n';
    text += '• Період: ' + formatDateUA(active.startDate) + ' — ' + formatDateUA(active.endDate) + '\n';
    if (!active.isUnlimited) {
      const used = await supabase.getWorkoutDaysCountInRange(
        chatId,
        active.startDate,
        active.endDate,
        vid
      );
      text += '• Використано: ' + used + ' з ' + active.trainingsCount + ' (лише тренування в цьому залі)\n';
    }
    text += '\nПоки є активний абонемент у цьому залі, новий додати не можна.\n';
  } else {
    text += 'Немає активного абонемента для цього закладу.\n';
  }
  text +=
    '\nНагадування: за 3 і 2 дні до кінця терміну' +
    (active && !active.isUnlimited ? '; також коли залишиться 2 або 1 тренування.' : '.');

  const keyboard = [];
  if (!active) {
    keyboard.push([{ text: '➕ Додати оплату', callback_data: CONSTANTS.CALLBACKS.SUB_ADD }]);
  }
  keyboard.push([{ text: '📋 Історія абонементів', callback_data: CONSTANTS.CALLBACKS.SUB_HISTORY }]);
  const allVenues = await supabase.getUserVenues(chatId);
  if (allVenues && allVenues.length > 1) {
    keyboard.push([{ text: '⬅️ Інший заклад', callback_data: CONSTANTS.CALLBACKS.SUB_VENUES }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showHistory(chatId) {
  const state = await State.get(chatId);
  const venueId = state && state.subVenueId ? String(state.subVenueId) : null;
  const list = venueId
    ? await supabase.getGymSubscriptionsByChatIdAndVenue(chatId, venueId)
    : await supabase.getGymSubscriptionsByChatId(chatId);
  let text = '📋 **Історія абонементів**\n\n';
  if (!list || list.length === 0) {
    text += 'Історія порожня.';
  } else {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      let venueName = '';
      if (s.venueId) {
        const v = await supabase.getVenueById(s.venueId);
        venueName = v ? ' · ' + venueLabel(v) : '';
      } else {
        venueName = ' · без залу';
      }
      text +=
        i +
        1 +
        '. ' +
        formatDateUA(s.startDate) +
        ' — ' +
        formatDateUA(s.endDate) +
        venueName;
      if (s.amount != null) text += ', ' + s.amount + ' грн';
      if (s.isUnlimited) text += ', безліміт';
      else text += ', ' + (s.trainingsCount || 0) + ' тренувань';
      if (!s.isUnlimited) {
        const used = await supabase.getWorkoutDaysCountInRange(
          chatId,
          s.startDate,
          s.endDate,
          s.venueId || undefined
        );
        text += ' (використано: ' + used + ')';
      }
      text += '\n';
    }
  }
  const keyboard = [
    [
      {
        text: '◀ Назад',
        callback_data: venueId
          ? CONSTANTS.CALLBACK_PREFIXES.SUB_VENUE + ':' + venueId
          : CONSTANTS.CALLBACKS.SUB_VENUES
      }
    ]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function startAddFlow(chatId) {
  const state = await State.get(chatId);
  const venueId = state && state.subVenueId ? String(state.subVenueId) : null;
  if (!venueId) {
    await Helpers.safeSend(chatId, 'Спочатку обери заклад.');
    await showMenu(chatId);
    return;
  }
  const active = await supabase.getActiveGymSubscription(chatId, venueId);
  if (active) {
    await Helpers.safeSend(
      chatId,
      'У цьому залі вже є активний абонемент. Новий можна додати після закінчення поточного.'
    );
    await showVenueMenu(chatId, venueId);
    return;
  }

  const offers = await supabase.listVenueGymMembershipOffers(venueId);
  await State.update(chatId, clearSubDraft({ subVenueId: venueId }));
  const keyboard = [];
  for (const o of offers || []) {
    let label = (o.labelUa || 'Офер').toString();
    if (o.isUnlimited) label += ' · безліміт';
    else if (o.trainingsPerMonth) label += ' · ' + o.trainingsPerMonth + ' тр.';
    if (o.price != null) label += ' · ' + o.price + ' ' + (o.currency || 'UAH');
    keyboard.push([
      {
        text: label.slice(0, 64),
        callback_data: CONSTANTS.CALLBACK_PREFIXES.SUB_OFFER + ':' + o.id
      }
    ]);
  }
  keyboard.push([{ text: '✍️ Ввести вручну', callback_data: CONSTANTS.CALLBACKS.SUB_MANUAL }]);
  keyboard.push([
    { text: '◀ Скасувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.SUB_VENUE + ':' + venueId }
  ]);
  const header =
    offers && offers.length
      ? 'Обери абонемент із прайсу залу або введи дані вручну:'
      : 'У залу немає оферів у довіднику. Введи дані вручну:';
  await Helpers.sendKeyboard(chatId, header, keyboard);
}

async function applyOfferAndContinue(chatId, offerId) {
  const state = await State.get(chatId);
  const venueId = state && state.subVenueId;
  if (!venueId) {
    await showMenu(chatId);
    return;
  }
  const offers = await supabase.listVenueGymMembershipOffers(venueId);
  const offer = (offers || []).find((o) => String(o.id) === String(offerId));
  if (!offer) {
    await Helpers.safeSend(chatId, 'Офер не знайдено. Спробуй знову.');
    await startAddFlow(chatId);
    return;
  }
  await State.update(
    chatId,
    clearSubDraft({
      subVenueId: venueId,
      subOfferId: offer.id,
      subAmount: offer.price != null ? offer.price : null,
      subType: offer.isUnlimited ? 'unlimited' : 'fixed',
      subCount: offer.isUnlimited ? null : offer.trainingsPerMonth || null
    })
  );
  if (offer.isUnlimited) {
    await askStartDate(chatId);
  } else if (offer.trainingsPerMonth) {
    await askStartDate(chatId);
  } else {
    await askCount(chatId);
  }
}

async function startAddAmount(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_AMOUNT });
  await Helpers.safeSend(
    chatId,
    '💰 Введіть суму оплати абонемента (грн), або цифру 0 щоб пропустити:\n\nПриклад: 1200'
  );
}

async function askType(chatId) {
  await State.update(chatId, { step: 'sub_add_type' });
  const keyboard = [
    [{ text: 'Безлімітне відвідування', callback_data: CONSTANTS.CALLBACKS.SUB_TYPE_UNLIMITED }],
    [{ text: 'Фіксована кількість тренувань', callback_data: CONSTANTS.CALLBACKS.SUB_TYPE_FIXED }],
    [{ text: '◀ Скасувати', callback_data: CONSTANTS.CALLBACKS.SUB_VENUES }]
  ];
  await Helpers.sendKeyboard(chatId, 'Оберіть тип абонемента:', keyboard);
}

async function askCount(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_COUNT });
  await Helpers.safeSend(chatId, '🔢 Введіть кількість тренувань у абонементі:\n\nПриклад: 12');
}

async function askStartDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_START });
  const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '01.03.2026';
  await Helpers.safeSend(
    chatId,
    '📅 Введіть дату початку дії абонемента (ДД.ММ.РРРР):\n\nПриклад: ' + ex
  );
}

async function askEndDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.SUB_ADD_END });
  const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '15.03.2026';
  await Helpers.safeSend(
    chatId,
    '📅 Введіть дату закінчення абонемента (ДД.ММ.РРРР):\n\nПриклад: ' + ex
  );
}

async function saveSubscriptionAndReturn(chatId, state) {
  const venueId = state.subVenueId ? String(state.subVenueId) : null;
  if (!venueId) {
    await Helpers.safeSend(chatId, '❌ Не обрано заклад. Почни з меню «Абонемент».');
    await showMenu(chatId);
    return;
  }
  const existing = await supabase.getActiveGymSubscription(chatId, venueId);
  if (existing) {
    await Helpers.safeSend(
      chatId,
      'У цьому залі вже є активний абонемент. Новий не збережено.'
    );
    await showVenueMenu(chatId, venueId);
    return;
  }
  const amount = state.subAmount != null ? parseFloat(state.subAmount) : null;
  const isUnlimited = state.subType === 'unlimited';
  const trainingsCount = isUnlimited
    ? null
    : state.subCount != null
      ? parseInt(state.subCount, 10)
      : null;
  const startDate = toYYYYMMDD(state.subStartDate);
  const endDate = toYYYYMMDD(state.subEndDate);
  if (!startDate || !endDate) {
    await Helpers.safeSend(chatId, '❌ Невірні дати. Спробуй знову з меню «Абонемент».');
    await showVenueMenu(chatId, venueId);
    return;
  }
  if (!isUnlimited && (!trainingsCount || trainingsCount < 1)) {
    await Helpers.safeSend(chatId, '❌ Вкажи кількість тренувань.');
    await askCount(chatId);
    return;
  }
  const id = await supabase.insertGymSubscription({
    chatId,
    venueId,
    amount: amount && amount > 0 ? amount : null,
    isUnlimited,
    trainingsCount,
    startDate,
    endDate
  });
  if (id) {
    await Helpers.safeSend(
      chatId,
      '✅ Абонемент збережено для обраного закладу. Нагадування прийдуть за 3 і 2 дні до кінця' +
        (isUnlimited ? '.' : ' та коли залишиться 2 або 1 тренування.')
    );
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  await State.update(chatId, clearSubDraft({ subVenueId: venueId, step: 'sub_menu' }));
  await showVenueMenu(chatId, venueId);
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === 'SUB_BACK' || action === CONSTANTS.CALLBACKS.SUB_VENUES) {
    await State.update(chatId, clearSubDraft({ subVenueId: undefined, step: undefined }));
    await showMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.SUB_VENUE && param) {
    await showVenueMenu(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.SUB_LEGACY_VENUE && param) {
    const [subId, venueId] = param.split(':');
    if (!subId || !venueId) return true;
    const ok = await supabase.updateGymSubscriptionVenue(subId, venueId);
    if (ok) await Helpers.safeSend(chatId, '✅ Абонемент привʼязано до закладу.');
    else await Helpers.safeSend(chatId, '❌ Не вдалося зберегти.');
    await showMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_ADD) {
    await startAddFlow(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_MANUAL) {
    const state = await State.get(chatId);
    if (!state || !state.subVenueId) {
      await showMenu(chatId);
      return true;
    }
    await State.update(chatId, clearSubDraft({ subVenueId: state.subVenueId }));
    await startAddAmount(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.SUB_OFFER && param) {
    await applyOfferAndContinue(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_HISTORY) {
    await showHistory(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_TYPE_UNLIMITED) {
    await State.update(chatId, { subType: 'unlimited', subCount: null });
    await askStartDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_TYPE_FIXED) {
    await State.update(chatId, { subType: 'fixed' });
    await askCount(chatId);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_AMOUNT) {
    const v = String(text).trim();
    const num = v === '0' || v === '' ? 0 : parseFloat(v);
    if (isNaN(num) || num < 0) {
      await Helpers.safeSend(chatId, '⚠️ Введіть число (0 щоб пропустити).');
      return true;
    }
    await State.update(chatId, { subAmount: num === 0 ? null : num });
    await askType(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_COUNT) {
    const n = parseInt(String(text).trim(), 10);
    if (isNaN(n) || n < 1 || n > 999) {
      await Helpers.safeSend(chatId, '⚠️ Введіть кількість тренувань від 1 до 999.');
      return true;
    }
    await State.update(chatId, { subCount: n });
    await askStartDate(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_START) {
    const d = parseDateDDMMYYYY(text);
    if (!d) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР');
      return true;
    }
    await State.update(chatId, { subStartDate: d });
    await askEndDate(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.SUB_ADD_END) {
    const d = parseDateDDMMYYYY(text);
    if (!d) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР');
      return true;
    }
    const start = state.subStartDate;
    if (start && d < start) {
      await Helpers.safeSend(chatId, '⚠️ Дата закінчення має бути не раніше дати початку.');
      return true;
    }
    await State.update(chatId, { subEndDate: d });
    await saveSubscriptionAndReturn(chatId, { ...state, subEndDate: d });
    return true;
  }

  return false;
}

/** Після тренування: якщо вичерпано N у абонементі цього залу — повідомити. */
async function notifyIfLastTrainingInSubscription(chatId, venueId) {
  try {
    const active = venueId
      ? await supabase.getActiveGymSubscription(chatId, venueId)
      : null;
    // Якщо venue не передано — перевірити всі активні з залом
    const list = active
      ? [active]
      : (await supabase.getActiveGymSubscriptions(chatId)).filter((s) => s.venueId && !s.isUnlimited);
    for (const sub of list) {
      if (!sub || sub.isUnlimited) continue;
      const used = await supabase.getWorkoutDaysCountInRange(
        chatId,
        sub.startDate,
        sub.endDate,
        sub.venueId
      );
      if (used >= (sub.trainingsCount || 0)) {
        let place = '';
        if (sub.venueId) {
          const v = await supabase.getVenueById(sub.venueId);
          if (v) place = ' (' + venueLabel(v) + ')';
        }
        await Helpers.safeSend(
          chatId,
          '🏁 Тренування в рамках абонемента' +
            place +
            ' закінчились. Потрібно оплатити новий абонемент.\n\nМожна додати новий у меню «Абонемент».'
        );
      }
    }
  } catch (e) {
    console.error('Subscription.notifyIfLastTrainingInSubscription', e.message);
  }
}

module.exports = {
  showMenu,
  showHistory,
  showVenueMenu,
  handleCallback,
  handleTextMessage,
  notifyIfLastTrainingInSubscription
};
