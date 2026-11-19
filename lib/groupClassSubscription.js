/**
 * Груповий абонемент клієнта — тренер фіксує вручну в картці (крок 2).
 * Формат/тариф → Груповий абонемент → список / додати / видалити.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function moneyLabel(amount, currency) {
  const cur = String(currency || 'UAH').toUpperCase() === 'UAH' ? 'грн' : String(currency || 'UAH');
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)) + ' ' + cur;
}

function formatYmdUa(ymd) {
  if (!ymd || String(ymd).length < 10) return '—';
  const s = String(ymd).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d + '.' + m + '.' + y;
}

function parseDateDDMMYYYY(str) {
  const m = String(str || '')
    .trim()
    .match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYYYYMMDD(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function todayExample() {
  const n = new Date();
  return (
    String(n.getDate()).padStart(2, '0') +
    '.' +
    String(n.getMonth() + 1).padStart(2, '0') +
    '.' +
    n.getFullYear()
  );
}

async function ensureCoachOwnsStudent(coachChatId, studentChatId) {
  const student = await User.getByChatId(studentChatId);
  if (!student || String(student.coachId) !== String(coachChatId)) return null;
  return student;
}

async function classTitle(cls) {
  if (!cls) return 'Групове';
  let venueName = '';
  try {
    const v = await supabase.getVenueById(cls.venueId);
    if (v) venueName = v.nameUa || v.name || '';
  } catch (_) {}
  const name = cls.labelUa || cls.groupClassCode || 'Групове';
  return venueName ? name + ' · ' + venueName : name;
}

async function showList(chatId, studentChatId) {
  const student = await ensureCoachOwnsStudent(chatId, studentChatId);
  if (!student) {
    await Helpers.safeSend(chatId, '❌ Клієнта не знайдено.');
    return;
  }
  const name = ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || studentChatId;
  const list = await supabase.listGroupClassSubscriptionsByStudent(chatId, studentChatId);
  let text =
    '🎟 Групові абонементи\n\n' +
    'Клієнт: ' +
    name +
    '\n\n' +
    'Фіксуй оплату вручну: сума потрапляє в місяць початку дії абонемента (для % залу).\n\n';
  const keyboard = [];
  if (!list.length) {
    text += 'Поки немає записаних абонементів.';
  } else {
    for (const sub of list) {
      const cls = await supabase.getCoachGroupClassById(sub.groupClassId);
      const title = await classTitle(cls);
      const line =
        moneyLabel(sub.amountPaid, sub.currency) +
        ' · ' +
        formatYmdUa(sub.startDate) +
        (sub.endDate ? '–' + formatYmdUa(sub.endDate) : '') +
        ' · ' +
        title;
      const label = line.length > 64 ? line.slice(0, 61) + '…' : line;
      keyboard.push([
        {
          text: label,
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_VIEW + ':' + sub.id
        }
      ]);
    }
  }
  keyboard.push([
    {
      text: '➕ Додати абонемент',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_ADD + ':' + studentChatId
    }
  ]);
  keyboard.push([
    {
      text: '⬅️ Формат/тариф',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_STUDENT_FORMAT_MENU + ':' + studentChatId
    }
  ]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showView(chatId, subscriptionId) {
  const sub = await supabase.getGroupClassSubscriptionById(subscriptionId);
  if (!sub || String(sub.coachChatId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Абонемент не знайдено.');
    return;
  }
  const student = await ensureCoachOwnsStudent(chatId, sub.studentChatId);
  if (!student) {
    await Helpers.safeSend(chatId, '❌ Клієнта не знайдено.');
    return;
  }
  const cls = await supabase.getCoachGroupClassById(sub.groupClassId);
  const title = await classTitle(cls);
  const name = ((student.firstName || '') + ' ' + (student.lastName || '')).trim();
  const text =
    '🎟 Груповий абонемент\n\n' +
    'Клієнт: ' +
    name +
    '\n' +
    'Заняття: ' +
    title +
    '\n' +
    'Оплата: ' +
    moneyLabel(sub.amountPaid, sub.currency) +
    '\n' +
    'Початок дії: ' +
    formatYmdUa(sub.startDate) +
    '\n' +
    'Кінець дії: ' +
    (sub.endDate ? formatYmdUa(sub.endDate) : 'не вказано') +
    '\n\n' +
    'Облік для % залу — у місяці початку дії.';
  const keyboard = [
    [
      {
        text: '🗑 Видалити',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_DELETE + ':' + sub.id
      }
    ],
    [
      {
        text: '⬅️ До списку',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + sub.studentChatId
      }
    ]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function startAdd(chatId, studentChatId) {
  const student = await ensureCoachOwnsStudent(chatId, studentChatId);
  if (!student) {
    await Helpers.safeSend(chatId, '❌ Клієнта не знайдено.');
    return;
  }
  const classes = (await supabase.listCoachGroupClasses(chatId, null, { activeOnly: true })) || [];
  if (!classes.length) {
    await Helpers.sendKeyboard(
      chatId,
      '⚠️ Немає активних групових занять.\n\nСтвори групове в профілі: Тип тренувань → Створити своє.',
      [
        [
          {
            text: '⬅️ Назад',
            callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + studentChatId
          }
        ]
      ]
    );
    return;
  }
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.GCS_PICK_CLASS,
    gcsStudentId: String(studentChatId),
    gcsClassId: null,
    gcsAmount: null,
    gcsStartDate: null
  });
  const keyboard = [];
  for (const cls of classes) {
    const title = await classTitle(cls);
    const label = title.length > 64 ? title.slice(0, 61) + '…' : title;
    keyboard.push([
      {
        text: label,
        callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_PICK_CLASS + ':' + cls.id
      }
    ]);
  }
  keyboard.push([
    {
      text: '❌ Скасувати',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + studentChatId
    }
  ]);
  await Helpers.sendKeyboard(chatId, 'Обери групове заняття для абонемента:', keyboard);
}

async function afterPickClass(chatId, groupClassId) {
  const state = (await State.get(chatId)) || {};
  const studentChatId = String(state.gcsStudentId || '');
  if (!studentChatId) {
    await Helpers.safeSend(chatId, '⚠️ Почни з картки клієнта.');
    return;
  }
  const cls = await supabase.getCoachGroupClassById(groupClassId);
  if (!cls || String(cls.coachChatId) !== String(chatId) || cls.isArchived) {
    await Helpers.safeSend(chatId, '❌ Заняття не знайдено або в архіві.');
    return startAdd(chatId, studentChatId);
  }
  const title = await classTitle(cls);
  const cardPrice =
    cls.priceAmount != null && !Number.isNaN(Number(cls.priceAmount)) ? Number(cls.priceAmount) : null;

  // Групові: індивідуального тарифу немає — сума з картки заняття.
  if (cardPrice != null && cardPrice >= 0) {
    const ok = await State.update(chatId, {
      step: CONSTANTS.FSM_STATES.GCS_START_INPUT,
      gcsStudentId: studentChatId,
      gcsClassId: String(cls.id),
      gcsVenueId: String(cls.venueId),
      gcsAmount: cardPrice,
      gcsCurrency: cls.priceCurrency || 'UAH',
      gcsStartDate: null
    });
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося зберегти крок. Спробуй ще раз: Додати абонемент.');
      return;
    }
    await Helpers.sendKeyboard(
      chatId,
      buildStartDatePrompt([
        'Заняття: ' + title,
        'Оплата абонемента: ' + moneyLabel(cardPrice, cls.priceCurrency) + ' (з картки заняття)'
      ]),
      [
        [
          {
            text: '❌ Скасувати',
            callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + studentChatId
          }
        ]
      ]
    );
    return;
  }

  const okAmt = await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.GCS_AMOUNT_INPUT,
    gcsStudentId: studentChatId,
    gcsClassId: String(cls.id),
    gcsVenueId: String(cls.venueId),
    gcsAmount: null,
    gcsStartDate: null
  });
  if (!okAmt) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти крок. Спробуй ще раз: Додати абонемент.');
    return;
  }
  await Helpers.sendKeyboard(
    chatId,
    'Заняття: ' +
      title +
      '\n\nНа картці заняття ще немає ціни. Введи суму оплати абонемента в грн, наприклад: 1200\n' +
      '(або спочатку задай ціну в картці групового заняття).',
    [
      [
        {
          text: '❌ Скасувати',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + studentChatId
        }
      ]
    ]
  );
}

function buildStartDatePrompt(prefixLines) {
  const head = Array.isArray(prefixLines) ? prefixLines.filter(Boolean).join('\n') : '';
  const body =
    'Важливо: оплата абонемента враховується в тому місяці, у якому починається його дія (для розрахунку % залу).\n\n' +
    'Введи дату ПОЧАТКУ абонемента (ДД.ММ.РРРР) — після цього абонемент одразу збережеться (без дати кінця).\n' +
    'Приклад: ' +
    todayExample();
  return (head ? head + '\n\n' : '') + body;
}

async function askStartDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.GCS_START_INPUT });
  const state = (await State.get(chatId)) || {};
  const amountLine =
    state.gcsAmount != null
      ? 'Оплата абонемента: ' + moneyLabel(state.gcsAmount, state.gcsCurrency || 'UAH')
      : '';
  await Helpers.sendKeyboard(chatId, buildStartDatePrompt([amountLine].filter(Boolean)), [
    [
      {
        text: '❌ Скасувати',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + String(state.gcsStudentId || '')
      }
    ]
  ]);
}

async function askEndDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.GCS_END_INPUT });
  const state = (await State.get(chatId)) || {};
  await Helpers.sendKeyboard(
    chatId,
    '📅 За потреби введи дату КІНЦЯ абонемента (ДД.ММ.РРРР).\n' +
      'Або натисни «Без дати кінця».',
    [
      [
        {
          text: '✅ Без дати кінця',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_SAVE_NO_END
        }
      ],
      [
        {
          text: '❌ Скасувати',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + String(state.gcsStudentId || '')
        }
      ]
    ]
  );
}

/** Після дати початку — підтвердження і вибір кінця кнопками (щоб не «зависати» на тексті). */
async function afterStartDateChosen(chatId, startYmd) {
  const ok = await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.GCS_AFTER_START,
    gcsStartDate: startYmd
  });
  if (!ok) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти дату початку. Введи ще раз ДД.ММ.РРРР.');
    return;
  }
  const state = (await State.get(chatId)) || {};
  const studentChatId = String(state.gcsStudentId || '');
  const amountLine =
    state.gcsAmount != null
      ? 'Оплата: ' + moneyLabel(state.gcsAmount, state.gcsCurrency || 'UAH') + '\n'
      : '';
  const sent = await Helpers.sendKeyboard(
    chatId,
    'Початок абонемента: ' +
      formatYmdUa(startYmd) +
      '\n' +
      amountLine +
      '\nОбери далі:',
    [
      [
        {
          text: '✅ Зберегти без дати кінця',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_SAVE_NO_END
        }
      ],
      [
        {
          text: '📅 Вказати дату кінця',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_ASK_END
        }
      ],
      [
        {
          text: '❌ Скасувати',
          callback_data: CONSTANTS.CALLBACK_PREFIXES.GCS_LIST + ':' + studentChatId
        }
      ]
    ]
  );
  if (!sent) {
    await Helpers.safeSend(
      chatId,
      'Початок: ' +
        formatYmdUa(startYmd) +
        '. Натисни «Зберегти без дати кінця» нижче або введи дату кінця ДД.ММ.РРРР / 0.'
    );
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.GCS_END_INPUT });
  }
}

async function saveAndReturn(chatId, endYmdOrNull) {
  try {
    const state = (await State.get(chatId)) || {};
    const studentChatId = String(state.gcsStudentId || '');
    const classId = String(state.gcsClassId || '');
    const venueId = String(state.gcsVenueId || '');
    const amount = Number(state.gcsAmount);
    const startDate = String(state.gcsStartDate || '');
    if (!studentChatId || !classId || !venueId || !startDate || Number.isNaN(amount)) {
      await State.update(chatId, { step: null });
      await Helpers.safeSend(chatId, '❌ Не вистачає даних. Почни знову з «Додати абонемент».');
      if (studentChatId) await showList(chatId, studentChatId);
      return;
    }
    const currency = String(state.gcsCurrency || 'UAH');
    const id = await supabase.insertGroupClassSubscription({
      coachChatId: chatId,
      studentChatId,
      venueId,
      groupClassId: classId,
      amountPaid: amount,
      currency,
      startDate,
      endDate: endYmdOrNull
    });
    await State.update(chatId, {
      step: null,
      gcsStudentId: null,
      gcsClassId: null,
      gcsVenueId: null,
      gcsAmount: null,
      gcsCurrency: null,
      gcsStartDate: null
    });
    if (!id) {
      await Helpers.safeSend(
        chatId,
        '❌ Не вдалося зберегти. Перевір міграцію coach_group_class_subscriptions у Supabase.'
      );
    } else {
      await Helpers.safeSend(chatId, '✅ Груповий абонемент збережено.');
    }
    await showList(chatId, studentChatId);
  } catch (e) {
    console.error('GroupClassSubscription.saveAndReturn', e.message);
    await Helpers.safeSend(chatId, '❌ Помилка збереження: ' + (e.message || 'невідома'));
  }
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();
  const P = CONSTANTS.CALLBACK_PREFIXES;

  if (action === P.GCS_LIST && param) {
    await showList(chatId, param);
    return true;
  }
  if (action === P.GCS_ADD && param) {
    await startAdd(chatId, param);
    return true;
  }
  if (action === P.GCS_PICK_CLASS && param) {
    await afterPickClass(chatId, param);
    return true;
  }
  if (action === P.GCS_VIEW && param) {
    await showView(chatId, param);
    return true;
  }
  if (action === P.GCS_DELETE && param) {
    const sub = await supabase.getGroupClassSubscriptionById(param);
    if (!sub || String(sub.coachChatId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Абонемент не знайдено.');
      return true;
    }
    await Helpers.sendKeyboard(chatId, '⚠️ Видалити цей груповий абонемент?', [
      [
        {
          text: '✅ Так, видалити',
          callback_data: P.GCS_DELETE_OK + ':' + param
        }
      ],
      [{ text: '❌ Ні', callback_data: P.GCS_VIEW + ':' + param }]
    ]);
    return true;
  }
  if (action === P.GCS_DELETE_OK && param) {
    const sub = await supabase.getGroupClassSubscriptionById(param);
    if (!sub || String(sub.coachChatId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Абонемент не знайдено.');
      return true;
    }
    const sid = sub.studentChatId;
    const ok = await supabase.deleteGroupClassSubscription(param, chatId);
    await Helpers.safeSend(chatId, ok ? '✅ Видалено.' : '❌ Не вдалося видалити.');
    await showList(chatId, sid);
    return true;
  }
  if (action === P.GCS_SAVE_NO_END) {
    await saveAndReturn(chatId, null);
    return true;
  }
  if (action === P.GCS_ASK_END) {
    await askEndDate(chatId);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  try {
    const state = (await State.get(chatId)) || {};
    let step = state.step;
    // Якщо FSM step злетів, але чернетка абонемента лишилась — відновлюємо крок.
    if (
      !step &&
      state.gcsStudentId &&
      state.gcsClassId &&
      state.gcsAmount != null
    ) {
      step = state.gcsStartDate
        ? CONSTANTS.FSM_STATES.GCS_END_INPUT
        : CONSTANTS.FSM_STATES.GCS_START_INPUT;
      await State.update(chatId, { step });
    }
    if (step === CONSTANTS.FSM_STATES.GCS_PICK_CLASS) {
      await Helpers.safeSend(chatId, 'Обери групове заняття кнопкою вище або натисни «Скасувати».');
      return true;
    }
    if (step === CONSTANTS.FSM_STATES.GCS_AFTER_START) {
      // Текст замість кнопок: 0 = без кінця, дата = кінець.
      step = CONSTANTS.FSM_STATES.GCS_END_INPUT;
      await State.update(chatId, { step });
    }
    if (
      step !== CONSTANTS.FSM_STATES.GCS_AMOUNT_INPUT &&
      step !== CONSTANTS.FSM_STATES.GCS_START_INPUT &&
      step !== CONSTANTS.FSM_STATES.GCS_END_INPUT
    ) {
      return false;
    }
    const studentChatId = String(state.gcsStudentId || '');
    if (!studentChatId) {
      await State.update(chatId, { step: null });
      await Helpers.safeSend(chatId, '❌ Немає клієнта в сесії. Відкрий картку → Груповий абонемент знову.');
      return true;
    }
    // Не блокуємо збереження чернетки, якщо перевірка ownership тимчасово впала.
    let owned = null;
    try {
      owned = await ensureCoachOwnsStudent(chatId, studentChatId);
    } catch (ownErr) {
      console.error('GCS ensureCoachOwnsStudent', ownErr.message);
    }
    if (!owned) {
      console.error('GCS ownership miss', { chatId: String(chatId), studentChatId, step });
      // Якщо всі поля чернетки є — все одно даємо зберегти (тренер уже обрав заняття в UI).
      if (!state.gcsClassId || state.gcsAmount == null) {
        await State.update(chatId, {
          step: null,
          gcsStudentId: null,
          gcsClassId: null,
          gcsVenueId: null,
          gcsAmount: null,
          gcsCurrency: null,
          gcsStartDate: null
        });
        await Helpers.safeSend(chatId, '❌ Клієнта не знайдено. Відкрий картку клієнта знову.');
        return true;
      }
    }

    if (step === CONSTANTS.FSM_STATES.GCS_AMOUNT_INPUT) {
      const cleaned = String(text || '')
        .replace(/\s/g, '')
        .replace(/грн|uah|₴/gi, '')
        .replace(',', '.')
        .trim();
      const num = parseFloat(cleaned);
      if (Number.isNaN(num) || num < 0) {
        await Helpers.safeSend(chatId, '❌ Введи суму ≥ 0, наприклад: 1200');
        return true;
      }
      const okAmt = await State.update(chatId, { gcsAmount: Math.round(num * 100) / 100 });
      if (!okAmt) {
        await Helpers.safeSend(chatId, '❌ Не вдалося зберегти суму. Спробуй ще раз.');
        return true;
      }
      await askStartDate(chatId);
      return true;
    }

    if (step === CONSTANTS.FSM_STATES.GCS_START_INPUT) {
      const d = parseDateDDMMYYYY(text);
      if (!d) {
        await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР, наприклад ' + todayExample());
        return true;
      }
      // Одразу ACK — щоб не виглядало як «зависання», далі зберігаємо без обов’язкової дати кінця.
      await Helpers.safeSend(chatId, '⏳ Зберігаю абонемент…');
      const startYmd = toYYYYMMDD(d);
      const okStart = await State.update(chatId, {
        step: CONSTANTS.FSM_STATES.GCS_AFTER_START,
        gcsStartDate: startYmd
      });
      if (!okStart) {
        await Helpers.safeSend(
          chatId,
          '❌ Не вдалося зберегти дату в сесії. Натисни /start і додай абонемент знову.'
        );
        return true;
      }
      await saveAndReturn(chatId, null);
      return true;
    }

    if (step === CONSTANTS.FSM_STATES.GCS_END_INPUT) {
      const raw = String(text || '').trim();
      if (raw === '0' || raw === '-' || raw.toLowerCase() === 'ні' || raw.toLowerCase() === 'нет') {
        await saveAndReturn(chatId, null);
        return true;
      }
      const d = parseDateDDMMYYYY(text);
      if (!d) {
        await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР або кнопка «Без дати кінця».');
        return true;
      }
      const endYmd = toYYYYMMDD(d);
      const startYmd = String(state.gcsStartDate || '');
      if (startYmd && endYmd < startYmd) {
        await Helpers.safeSend(chatId, '⚠️ Дата кінця не може бути раніше початку.');
        return true;
      }
      await saveAndReturn(chatId, endYmd);
      return true;
    }
    return false;
  } catch (e) {
    console.error('GroupClassSubscription.handleTextMessage', e.message);
    await Helpers.safeSend(chatId, '❌ Помилка: ' + (e.message || 'невідома') + '\nСпробуй ще раз або /start.');
    return true;
  }
}

module.exports = {
  showList,
  handleCallback,
  handleTextMessage
};
