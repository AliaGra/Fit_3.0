/**
 * Profile — перегляд профілю, оновлення замірів, редагування даних (ім'я, прізвище, місто, зріст, дата народження, зони акценту та уникнення)
 */
const { CONSTANTS, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const {
  formatActivityButtonText,
  formatActivityHubText,
  formatActivityLineForCard,
  formatActivitySavedMessage,
  JOB_LABELS_UA,
  TRANSPORT_LABELS_UA,
  STEPS_LABELS_UA,
  EXTRA_LABELS_UA
} = require('./activityProfile');
const { BODY_WHY_BUTTON_TEXT, showBodyWhyHelp } = require('./bodyWhyHelp');
const Venues = require('./venues');
const ProfileBodyGoals = require('./profileBodyGoals');
const menstrualCycle = require('./menstrualCycle');

function fmtCoachTrainingTypes(types) {
  const arr = Array.isArray(types) ? types : [];
  const labels = [];
  if (arr.includes('individual')) labels.push('Індивідуальні (персональні, спліт, тріо)');
  if (arr.includes('group')) labels.push('Групові заняття');
  return labels.length ? labels.join(', ') : 'не вказано';
}

const COACH_TRAINING_HINT =
  '💡 Якщо обираєш «Групові заняття», далі потрібно налаштувати їх по кожному закладу: які саме групові ти проводиш, де і коли.\n\n';

function newLocalGroupCode() {
  return 'local_' + Date.now().toString(36).slice(-6) + '_' + Math.random().toString(36).slice(2, 6);
}

function btnLabel(selected, labelUa, code) {
  const mark = selected ? '✅ ' : '☑️ ';
  const text = String(labelUa || code || '—');
  const out = mark + text;
  return out.length > 64 ? out.slice(0, 61) + '…' : out;
}

const WD = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' };

function fmtTime(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return m[1].padStart(2, '0') + ':' + m[2];
}

function parseTimeRange(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h1 = Number(m[1]);
  const mi1 = Number(m[2]);
  const h2 = Number(m[3]);
  const mi2 = Number(m[4]);
  if (h1 > 23 || h2 > 23 || mi1 > 59 || mi2 > 59) return null;
  const a = h1 * 60 + mi1;
  const b = h2 * 60 + mi2;
  if (b <= a) return null;
  return {
    timeStart: `${String(h1).padStart(2, '0')}:${String(mi1).padStart(2, '0')}:00`,
    timeEnd: `${String(h2).padStart(2, '0')}:${String(mi2).padStart(2, '0')}:00`
  };
}

function fmtVenueScheduleRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) return '—';
  return arr
    .map((x) => `${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)}`)
    .join('\n');
}

function fmtScheduleInline(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) return '—';
  return arr
    .map((x) => `${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)}`)
    .join(', ');
}

async function buildCoachGroupSchedulePreview(chatId) {
  const venues = await supabase.getCoachVenuesWhereTeach(chatId);
  if (!venues.length) return '';
  const blocks = [];
  for (const v of venues) {
    const classes = (await supabase.listCoachGroupClasses(chatId, v.id)).filter((c) => !c.isArchived);
    if (!classes.length) continue;
    const coachSchedule = await supabase.listCoachGroupSchedule(chatId, v.id);
    const venueSchedule = await supabase.listVenueSchedule(v.id, 300);
    const lines = [];
    for (const gc of classes) {
      const code = String(gc.groupClassCode || '');
      const label = Helpers.escapeHtml(gc.labelUa || code);
      const own = coachSchedule.filter((x) => String(x.groupClassCode || '') === code);
      const fromVenue = venueSchedule.filter((x) => String(x.groupClassCode || '') === code);
      if (own.length) {
        lines.push(`• ${label}: ${Helpers.escapeHtml(fmtScheduleInline(own))}`);
      } else if (fromVenue.length) {
        lines.push(`• ${label}: ${Helpers.escapeHtml(fmtScheduleInline(fromVenue))} <i>(з розкладу закладу)</i>`);
      } else {
        lines.push(`• ${label}: —`);
      }
    }
    if (lines.length) {
      blocks.push(`🏢 <b>${Helpers.escapeHtml(v.nameUa || 'Заклад')}</b>\n${lines.join('\n')}`);
    }
  }
  if (!blocks.length) return '';
  return `📌 <b>Обрані групові та розклад</b>\n\n${blocks.join('\n\n')}\n\n`;
}

function getTrainingGoalLabelUa(goal) {
  if (!goal || String(goal).trim() === '') return 'не вказано';
  const g = String(goal).toLowerCase();
  if (g === CONSTANTS.GOALS.LOSE) return 'Схуднути';
  if (g === CONSTANTS.GOALS.GAIN) return 'Набрати масу';
  if (g === CONSTANTS.GOALS.KEEP) return 'Підтримувати форму';
  return String(goal);
}

function formatProfileMessage(user) {
  let msg = '👤 Профіль\n\n';
  msg += "Ім'я: " + (user.firstName || '') + ' ' + (user.lastName || '') + '\n';
  {
    const c = user.city || '';
    const o = user.oblast || '';
    const d = user.district || '';
    const loc = [c, o, d].filter(Boolean);
    msg += 'Локація: ' + (loc.length ? loc.join(', ') : 'не вказано') + '\n';
  }
  msg += 'Зріст: ' + (user.height != null ? user.height + ' см' : 'не вказано') + '\n';
  msg += 'Вага: ' + (user.weight != null ? user.weight + ' кг' : 'не вказано') + '\n';
  msg += 'Вік: ' + (user.age != null ? user.age + ' років' : 'не вказано') + '\n';
  if (String(user.role || '').toLowerCase() === CONSTANTS.ROLES.STUDENT) {
    msg += 'Мета тренувань: ' + getTrainingGoalLabelUa(user.goal) + '\n';
  }
  if (user.waist != null || user.hip != null || user.glutes != null || user.arm != null || user.armFlex != null || user.shoulders != null || user.chest != null || user.bodyFatPct != null) {
    msg += '\nЗаміри: ';
    const parts = [];
    if (user.waist != null) parts.push('талія ' + user.waist + ' см');
    if (user.hip != null) parts.push('стегно ' + user.hip + ' см');
    if (user.glutes != null) parts.push('ягодиці ' + user.glutes + ' см');
    if (user.arm != null) parts.push('біцепс (розслаблено) ' + user.arm + ' см');
    if (user.armFlex != null) parts.push('біцепс (напруга) ' + user.armFlex + ' см');
    if (user.shoulders != null) parts.push('плечі ' + user.shoulders + ' см');
    if (user.chest != null) parts.push('груди ' + user.chest + ' см');
    if (user.bodyFatPct != null) parts.push('жир ' + user.bodyFatPct + '%');
    msg += parts.length ? parts.join(', ') + '\n' : '—\n';
  }
  const az = user.accentZones;
  const av = user.avoidZones;
  if (Array.isArray(az) && az.length > 0) {
    const labels = az.map((z) => (ACCENT_LABELS && ACCENT_LABELS[z]) || z);
    msg += '\nАкцент: ' + (az.includes('full') ? 'все рівномірно' : labels.join(', ')) + '\n';
  }
  if (Array.isArray(av) && av.length > 0) {
    const labels = av.map((z) => (ACCENT_LABELS && ACCENT_LABELS[z]) || z);
    msg += 'Не розвиваємо: ' + labels.join(', ') + '\n';
  }
  if (user.activityLevel != null || user.neatCoefficient != null || user.jobType || user.stepsCategory) {
    msg += '\n' + formatActivityLineForCard(user).replace(/^🏃\s*/, '') + '\n';
  }
  if (user.role === CONSTANTS.ROLES.COACH) {
    msg += '\nТип тренувань, які проводжу: ' + fmtCoachTrainingTypes(user.coachTrainingTypes) + '\n';
  }
  msg += '\nНовини у місті: ' + (user.adsOptIn === false ? 'ні' : 'так') + '\n';
  return msg;
}

async function showAdsSettings(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const current = user.adsOptIn === false ? 'Ні' : 'Так';
  const isCoach = String(user.role || '').toLowerCase() === CONSTANTS.ROLES.COACH;
  const backCb = isCoach ? CONSTANTS.CALLBACKS.PROFILE_BROADCAST_NEWS : CONSTANTS.CALLBACKS.BACK_TO_PROFILE;
  await Helpers.sendKeyboard(
    chatId,
    '📣 Отримувати новини та пропозиції від тренерів і закладів у моєму місті?\n\n' +
      'Зараз: ' +
      current +
      '\n\n«Ні» вимикає лише рекламу (потенційні розсилки). Повідомлення свого тренера/закладу та нагадування про тренування залишаються.',
    [
      [{ text: 'Так', callback_data: CONSTANTS.CALLBACKS.PROFILE_ADS_YES }],
      [{ text: 'Ні', callback_data: CONSTANTS.CALLBACKS.PROFILE_ADS_NO }],
      [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: backCb }]
    ]
  );
}

/** Хаб тренера: Новини у місті + Розсилка. */
async function showBroadcastNewsHub(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || String(user.role || '').toLowerCase() !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Розділ доступний лише тренеру.');
    await show(chatId);
    return;
  }
  await Helpers.sendKeyboard(chatId, '📣 Розсилка/новини\n\nОбери розділ:', [
    [{ text: '📣 Новини у місті', callback_data: CONSTANTS.CALLBACKS.PROFILE_ADS }],
    [{ text: '📣 Розсилка', callback_data: CONSTANTS.CALLBACKS.MENU_BROADCAST }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ]);
}

async function show(chatId) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) {
      await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
      return;
    }
    if (User.isVenueOwner(user)) {
      const ads = user.adsOptIn === false ? 'ні' : 'так';
      const loc = [user.city, user.oblast, user.district].filter(Boolean).join(', ') || 'не вказано';
      const keyboard = [
        [{ text: '📣 Новини у місті', callback_data: CONSTANTS.CALLBACKS.PROFILE_ADS }],
        [{ text: "✏️ Ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }],
        [{ text: '✏️ Прізвище', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME }],
        [{ text: '🏙️ Місто', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ];
      await Helpers.sendKeyboard(
        chatId,
        '👤 Профіль\n\nІм\'я: ' +
          (user.firstName || '') +
          ' ' +
          (user.lastName || '') +
          '\nЛокація: ' +
          loc +
          '\nНовини у місті: ' +
          ads,
        keyboard
      );
      return;
    }
    // Тренер: картка «хто я» — у «Публічні дані» / «Моя публічна картка»; тут лише меню розділів.
    if (user.role === CONSTANTS.ROLES.COACH) {
      const keyboard = [
        [{ text: '📏 Мої показники тіла', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_METRICS }],
        [{ text: '📣 Розсилка/новини', callback_data: CONSTANTS.CALLBACKS.PROFILE_BROADCAST_NEWS }],
        [{ text: '📢 Публічні дані', callback_data: CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA }],
        [{ text: '⭐ Відгуки', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
        [{ text: '📊 Звіти', callback_data: CONSTANTS.CALLBACKS.REPORTS_MENU }],
        [
          {
            text: '💪 Тип тренувань, які проводжу',
            callback_data: CONSTANTS.CALLBACKS.PROFILE_COACH_TRAINING_MENU
          }
        ],
        [{ text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_PRICING }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ];
      await Helpers.sendKeyboard(chatId, '👤 Мій профіль\n\nОбери розділ:', keyboard);
      return;
    }

    let message = formatProfileMessage(user);
    if (String(user.gender || '').toLowerCase() === CONSTANTS.GENDERS.FEMALE) {
      try {
        const settings = await supabase.getUserCycleSettings(chatId);
        if (settings) {
          const logs = await supabase.listCycleEventLogs(chatId, 8);
          const ctx = menstrualCycle.resolveTrainingContext(settings, logs, new Date());
          message += '\n🌸 Цикл: ' + cycleStatusLabel(settings.reproductiveStatus);
          message += '\nФаза: ' + (ctx.phaseLabelUa || '—') + (ctx.dayInCycle != null ? ` (день ~${ctx.dayInCycle})` : '');
          if (settings.lastPeriodStart) message += '\nОстанній старт: ' + settings.lastPeriodStart;
          message += '\n';
        }
      } catch (_) {}
    }
    let studentVenues = null;
    try {
      studentVenues = await supabase.getUserVenues(chatId);
      if (studentVenues && studentVenues.length) {
        message += '\n🏢 Заклад: ' + studentVenues.map((v) => v.nameUa).join(', ') + '\n';
      }
    } catch (_) {}
    const keyboard = [
      [{ text: '📏 Мої показники тіла', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_METRICS }],
      [{ text: '✏️ Редагувати дані', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA }],
      [{ text: '📣 Новини у місті', callback_data: CONSTANTS.CALLBACKS.PROFILE_ADS }],
      [{ text: '🖼 Фото для картки', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_HUB }],
      [{ text: '👁 Моя публічна картка', callback_data: CONSTANTS.CALLBACKS.REV_MY_PUBLIC }],
      [{ text: '⭐ Відгуки', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
      [{ text: '🔍 Пошук клієнта', callback_data: CONSTANTS.CALLBACKS.REV_SEARCH }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(chatId, message, keyboard);
    if (studentVenues && studentVenues.length) {
      try {
        await Venues.sendUserVenueCoachesBlocks(chatId, studentVenues);
      } catch (_) {}
    }
  } catch (err) {
    console.error('Profile.show', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження профілю.');
  }
}

async function showMyMetricsHub(chatId) {
  const user = await User.getByChatId(chatId);
  const role = user ? String(user.role || '').toLowerCase() : '';
  if (!user || (role !== CONSTANTS.ROLES.COACH && role !== CONSTANTS.ROLES.STUDENT)) {
    await Helpers.safeSend(chatId, '❌ Розділ недоступний.');
    await show(chatId);
    return;
  }
  // Однаковий хаб для тренера і учня (роль student / «клієнт»)
  const keyboard = [
    [{ text: '📊 Оновити заміри', callback_data: CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS }],
    [{ text: '🎯 Бажані параметри', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS }],
    [{ text: '🎯 Зони акценту та уникнення', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_ACCENT }],
    [{ text: formatActivityButtonText(user), callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_ACTIVITY }],
    [{ text: BODY_WHY_BUTTON_TEXT, callback_data: CONSTANTS.CALLBACKS.PROFILE_BODY_WHY + ':metrics' }]
  ];
  if (String(user.gender || '').toLowerCase() === CONSTANTS.GENDERS.FEMALE) {
    keyboard.push([{ text: '🌸 Цикл і менопауза', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE }]);
  }
  keyboard.push([{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '📏 Мої показники тіла', keyboard);
}

async function showMyPublicCard(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Перегляд доступний лише тренеру.');
    await show(chatId);
    return;
  }
  const Coach = require('./coach');
  await Coach.sendCoachPublicProfileCard(chatId, chatId, {
    preview: true,
    previewBack: 'public_data'
  });
}

async function showPublicDataHub(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Розділ доступний лише тренеру.');
    await show(chatId);
    return;
  }
  await Helpers.sendKeyboard(
    chatId,
    '📢 Публічні дані\n\nТе, що бачать користувачі на твоїй публічній картці. Переглянь картку або зміни поля:',
    [
      [{ text: '👁 Моя публічна картка', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_PUBLIC_CARD }],
      [{ text: '📄 Мої документи', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS }],
      [{ text: '🖼 Фото/логотип профілю', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_HUB }],
      [{ text: '📅 Дата народження', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE }],
      [
        { text: '📸 Instagram', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_INSTAGRAM },
        { text: '🏙️ Місто', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }
      ],
      [
        { text: '✏️ Прізвище', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME },
        { text: "✏️ Ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }
      ],
      [{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
}

/** Після зон / активності / циклу: тренер і учень → «Мої показники тіла». */
async function returnAfterPersonalMetricsEdit(chatId, _studentFallback) {
  const user = await User.getByChatId(chatId);
  const role = user ? String(user.role || '').toLowerCase() : '';
  if (role === CONSTANTS.ROLES.COACH || role === CONSTANTS.ROLES.STUDENT) {
    await showMyMetricsHub(chatId);
    return;
  }
  await show(chatId);
}

/** Після редагування публічних полів тренера — назад у хаб «Публічні дані». */
async function returnAfterCoachPublicFieldEdit(chatId) {
  const user = await User.getByChatId(chatId);
  if (user && String(user.role || '').toLowerCase() === CONSTANTS.ROLES.COACH) {
    await showPublicDataHub(chatId);
    return;
  }
  await show(chatId);
}

async function showMyDocuments(chatId) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return;
    }
    // If we are in upload mode, just show upload instructions
    const st = await State.get(chatId);
    if (st && st.step === CONSTANTS.FSM_STATES.PROFILE_COACH_DOCS_UPLOAD) {
      const kb = [
        [{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_DONE }],
        [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS }]
      ];
      await Helpers.sendKeyboard(
        chatId,
        '📄 Мої документи — додавання\n\nНадішли фото або файл документа. Можна надіслати кілька.\n\nКоли завершиш — натисни «✅ Готово».',
        kb
      );
      return;
    }
    const docs = await supabase.getCoachDocuments(String(chatId), 20);
    if (!docs.length) {
      await Helpers.sendKeyboard(
        chatId,
        '📄 Мої документи\n\nПоки що документів немає. Щоб додати — пройди крок “Документи тренера” під час реєстрації (або ми додамо завантаження з профілю пізніше).',
        [
          [{ text: '➕ Додати документ', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_ADD }],
          [{ text: '⬅️ До публічних даних', callback_data: CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA }]
        ]
      );
      return;
    }
    await Helpers.safeSend(chatId, '📄 Мої документи (' + docs.length + '):');
    const CardImages = require('./cardImages');
    for (const d of docs) {
      if (!d || !d.fileId) continue;
      await CardImages.sendCoachDocumentForView(chatId, d);
    }
    await Helpers.sendKeyboard(
      chatId,
      'Керування документами 👇',
      (() => {
        const kb = [];
        let idx = 1;
        for (const d of docs) {
          const labelBase = d.fileName ? String(d.fileName) : ('Документ ' + idx);
          const label = '🗑 Видалити: ' + (labelBase.length > 32 ? labelBase.slice(0, 29) + '…' : labelBase);
          kb.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_DOC_DEL + ':' + d.id }]);
          idx++;
        }
        kb.push([{ text: '➕ Додати документ', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_ADD }]);
        kb.push([{ text: '⬅️ До публічних даних', callback_data: CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA }]);
        return kb;
      })()
    );
  } catch (e) {
    console.error('Profile.showMyDocuments', e.message);
    await Helpers.safeSend(chatId, '❌ Помилка при відкритті документів.');
    await show(chatId);
  }
}

async function buildEditKeyboard(chatId) {
  const user = await User.getByChatId(chatId);
  const isStudent = user && String(user.role || '').toLowerCase() === CONSTANTS.ROLES.STUDENT;
  const rows = [];
  // Учень: ПІБ/місто/ДН/мета. Зони, активність, цикл, зріст/заміри — у «Мої показники тіла».
  if (isStudent) {
    rows.push(
      [{ text: "✏️ Ім'я", callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME }],
      [{ text: '✏️ Прізвище', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME }],
      [{ text: '🏙️ Місто', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY }],
      [{ text: '📅 Дата народження', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE }],
      [{ text: '🎯 Мета тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_GOAL }]
    );
  }
  rows.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  return rows;
}

async function showProfileTrainingGoalPicker(chatId) {
  const user = await User.getByChatId(chatId);
  const isStudent = user && String(user.role || '').toLowerCase() === CONSTANTS.ROLES.STUDENT;
  if (!isStudent) {
    await Helpers.safeSend(chatId, '❌ Мета тренувань налаштовується лише в профілі учня.');
    await showEditMenu(chatId);
    return;
  }
  const keyboard = [
    [{ text: 'Схуднути', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_GOAL + ':' + CONSTANTS.GOALS.LOSE }],
    [{ text: 'Набрати масу', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_GOAL + ':' + CONSTANTS.GOALS.GAIN }],
    [{ text: 'Підтримувати форму', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_GOAL + ':' + CONSTANTS.GOALS.KEEP }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '🎯 **Мета тренувань**\n\nОбери ціль — вона потрібна для **авто-плану** та підказок по навантаженню.\n\nЗараз: ' +
      getTrainingGoalLabelUa(user.goal) +
      '.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showEditMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (user && String(user.role || '').toLowerCase() === CONSTANTS.ROLES.COACH) {
    await showMyMetricsHub(chatId);
    return;
  }
  await Helpers.sendKeyboard(chatId, '✏️ Що хочеш змінити?', await buildEditKeyboard(chatId));
}

async function showCoachGroupVenueMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
    await show(chatId);
    return;
  }
  if (!Array.isArray(user.coachTrainingTypes) || !user.coachTrainingTypes.includes('group')) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку обери тип «Групові заняття».');
    await showProfileCoachTrainingTypesEditor(chatId);
    return;
  }
  const venues = await supabase.getCoachVenuesWhereTeach(chatId);
  if (!venues.length) {
    await Helpers.sendKeyboard(
      chatId,
      '⚠️ У тебе поки немає закладів у «Де треную».\n\nДодай їх: Головне меню → Клуби, студії.',
      [[{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES }]]
    );
    return;
  }
  const keyboard = venues.map((v) => [
    {
      text: `🏢 ${String(v.nameUa || 'Заклад')}`.slice(0, 64),
      callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${v.id}`
    }
  ]);
  keyboard.push([{ text: '⬅️ До типів тренувань', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES }]);
  await Helpers.sendKeyboard(
    chatId,
    '👥 Групові заняття\n\nОбери заклад, для якого налаштовуємо групові:',
    keyboard
  );
}

function fmtGroupClassPrice(cls) {
  if (!cls || cls.priceAmount == null) return 'не вказано';
  const cur = cls.priceCurrency || 'UAH';
  const n = Number(cls.priceAmount);
  if (Number.isNaN(n)) return 'не вказано';
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + ' ' + cur;
}

async function showCoachGroupClassPicker(chatId, venueId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
    await show(chatId);
    return;
  }
  const venue = await supabase.getVenueById(String(venueId || '').trim());
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    await showCoachGroupVenueMenu(chatId);
    return;
  }
  const existing = await supabase.listCoachGroupClasses(chatId, venue.id);
  const active = existing.filter((x) => !x.isArchived);
  const archivedCount = existing.filter((x) => x.isArchived).length;
  const selectedSet = new Set(active.map((x) => x.groupClassCode));
  const localActive = active.filter((x) => String(x.groupClassCode || '').startsWith('local_'));
  const catalogSelected = active.filter((x) => !String(x.groupClassCode || '').startsWith('local_'));

  // Лише групові з картки цього клубу (venue_facets), без глобального довідника.
  const venueGroups = (venue.facets || []).filter((f) => f && f.facetKind === 'group_class' && f.code);

  const keyboard = [];

  if (localActive.length) {
    for (const g of localActive) {
      const title = String(g.labelUa || g.groupClassCode || 'Групове').slice(0, 48);
      keyboard.push([
        {
          text: '📝 ' + title,
          callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${g.groupClassCode}`
        }
      ]);
    }
  }

  if (venueGroups.length) {
    for (const g of venueGroups) {
      keyboard.push([
        {
          text: btnLabel(selectedSet.has(g.code), g.labelUa || g.code, g.code),
          callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_TOGGLE}:${g.code}`
        }
      ]);
    }
  }

  keyboard.push([
    { text: '➕ Додати свою групову', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_ADD_LOCAL }
  ]);
  if (archivedCount > 0) {
    keyboard.push([
      {
        text: '📦 Архів (' + archivedCount + ')',
        callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ARCHIVE_LIST
      }
    ]);
  }
  keyboard.push([{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_DONE }]);
  keyboard.push([
    { text: '🗓 Налаштувати розклад по групових', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_OPEN }
  ]);
  keyboard.push([{ text: '⬅️ До закладів', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_OPEN }]);

  await State.update(chatId, { profileGroupVenueId: String(venue.id), profileGroupClassCode: null });

  const text =
    `👥 Групові заняття — ${venue.nameUa}\n\n` +
    (venueGroups.length
      ? 'З картки клубу — познач ті, які проводиш. Свої заняття — кнопка з назвою (картка).\n\n'
      : 'У картці цього клубу ще немає групових. Додай свою групову або дочекайся, поки їх додасть заклад.\n\n') +
    `Своїх активних: ${localActive.length}\n` +
    `З картки клубу обрано: ${catalogSelected.length}`;
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Картка свого (локального) групового заняття — етап A. */
async function showCoachGroupClassCard(chatId, venueId, groupClassCode) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
    await show(chatId);
    return;
  }
  const vid = String(venueId || '').trim();
  const code = String(groupClassCode || '').trim();
  const venue = await supabase.getVenueById(vid);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    await showCoachGroupVenueMenu(chatId);
    return;
  }
  const cls = await supabase.getCoachGroupClass(chatId, vid, code);
  if (!cls) {
    await Helpers.safeSend(chatId, '❌ Заняття не знайдено.');
    await showCoachGroupClassPicker(chatId, vid);
    return;
  }
  await State.update(chatId, {
    profileGroupVenueId: vid,
    profileGroupClassCode: code,
    step: null
  });

  const coachSchedule = await supabase.listCoachGroupSchedule(chatId, vid, code);
  const venueSchedule = (await supabase.listVenueSchedule(vid, 300)).filter(
    (x) => String(x.groupClassCode || '') === code
  );
  const scheduleLocked = venueSchedule.length > 0;
  let scheduleBlock = 'Розклад: не задано';
  if (scheduleLocked) {
    scheduleBlock =
      'Розклад (з закладу, лише перегляд):\n' + fmtVenueScheduleRows(venueSchedule);
  } else if (coachSchedule.length) {
    scheduleBlock = 'Розклад:\n' + fmtVenueScheduleRows(coachSchedule);
  }

  const name = cls.labelUa || cls.groupClassCode;
  const desc = cls.description || 'не вказано';
  const price = fmtGroupClassPrice(cls);
  const arch = cls.isArchived ? '📦 В архіві' : '✅ Активне';
  const mod = cls.moderationStatus || 'draft';
  let modLabel = 'чернетка (не на картці клубу)';
  if (mod === 'pending') modLabel = '⏳ на модерації (очікує підтвердження власника)';
  else if (mod === 'published') modLabel = '✅ на картці клубу';
  else if (mod === 'rejected') {
    modLabel = '❌ відхилено' + (cls.moderationNote ? ': ' + cls.moderationNote : '');
  }
  const text =
    '📝 Групове заняття\n\n' +
    '🏢 ' +
    (venue.nameUa || 'Заклад') +
    '\n' +
    'Назва: ' +
    name +
    '\n' +
    'Опис: ' +
    desc +
    '\n' +
    'Вартість: ' +
    price +
    '\n' +
    'Статус: ' +
    arch +
    '\n' +
    'Картка клубу: ' +
    modLabel +
    '\n\n' +
    scheduleBlock;

  const keyboard = [
    [{ text: '✏️ Змінити назву', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_NAME }],
    [{ text: '📄 Змінити опис', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_DESC }],
    [{ text: '💰 Змінити вартість', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_PRICE }]
  ];
  if (cls.priceAmount != null) {
    keyboard.push([
      { text: '🗑 Очистити вартість', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CLEAR_PRICE }
    ]);
  }
  keyboard.push([
    {
      text: scheduleLocked ? '🗓 Розклад (перегляд)' : '🗓 Налаштувати розклад',
      callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_CLASS}:${code}`
    }
  ]);
  if (!cls.isArchived) {
    keyboard.push([
      { text: '📣 Оголошення', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ANNOUNCE }
    ]);
    if (mod === 'draft' || mod === 'rejected') {
      keyboard.push([
        {
          text: '📤 На модерацію (картка клубу)',
          callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_SUBMIT_MOD
        }
      ]);
    }
  }
  if (cls.isArchived) {
    keyboard.push([
      {
        text: '📤 Дістати з архіву',
        callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_UNARCHIVE}:${code}`
      }
    ]);
  } else {
    keyboard.push([{ text: '📦 В архів', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ARCHIVE }]);
  }
  keyboard.push([
    { text: '⬅️ До групових закладу', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${vid}` }
  ]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showCoachGroupClassArchiveList(chatId, venueId) {
  const vid = String(venueId || '').trim();
  const venue = await supabase.getVenueById(vid);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    await showCoachGroupVenueMenu(chatId);
    return;
  }
  const archived = await supabase.listCoachGroupClasses(chatId, vid, { archivedOnly: true });
  const keyboard = [];
  for (const g of archived) {
    const title = String(g.labelUa || g.groupClassCode || 'Групове').slice(0, 48);
    keyboard.push([
      {
        text: '📦 ' + title,
        callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${g.groupClassCode}`
      }
    ]);
  }
  if (!keyboard.length) {
    await Helpers.safeSend(chatId, 'Архів порожній.');
    await showCoachGroupClassPicker(chatId, vid);
    return;
  }
  keyboard.push([
    { text: '⬅️ До групових закладу', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${vid}` }
  ]);
  await State.update(chatId, { profileGroupVenueId: vid });
  await Helpers.sendKeyboard(chatId, `📦 Архів групових — ${venue.nameUa}`, keyboard);
}

async function showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode) {
  const venue = await supabase.getVenueById(String(venueId || '').trim());
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    await showCoachGroupVenueMenu(chatId);
    return;
  }
  const classes = await supabase.listCoachGroupClasses(chatId, venue.id);
  const curClass = classes.find((x) => x.groupClassCode === String(groupClassCode || '').trim());
  if (!curClass) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку обери це групове в закладі.');
    await showCoachGroupClassPicker(chatId, venue.id);
    return;
  }
  const schedule = await supabase.listCoachGroupSchedule(chatId, venue.id, curClass.groupClassCode);
  const venueSchedule = (await supabase.listVenueSchedule(venue.id, 300)).filter(
    (x) => String(x.groupClassCode || '') === String(curClass.groupClassCode || '')
  );
  const venueScheduleLocked = venueSchedule.length > 0;
  await State.update(chatId, { profileGroupVenueId: String(venue.id), profileGroupClassCode: curClass.groupClassCode });

  const lines = [];
  for (const x of schedule.slice(0, 30)) {
    lines.push(`• ${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)}`);
  }
  const text = venueScheduleLocked
    ? `🗓 Розклад групового — ${curClass.labelUa || curClass.groupClassCode}\n` +
      `🏢 ${venue.nameUa}\n\n` +
      '⚠️ Для цього групового вже задано розклад закладу.\n' +
      'Редагування тренером заблоковано.\n\n' +
      'Розклад закладу:\n' +
      fmtVenueScheduleRows(venueSchedule)
    : `🗓 Розклад групового — ${curClass.labelUa || curClass.groupClassCode}\n` +
      `🏢 ${venue.nameUa}\n\n` +
      (lines.length ? lines.join('\n') : 'Поки немає слотів.');

  const keyboard = [];
  if (!venueScheduleLocked) {
    keyboard.push(
      [
        { text: 'Пн', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:1` },
        { text: 'Вт', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:2` },
        { text: 'Ср', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:3` }
      ],
      [
        { text: 'Чт', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:4` },
        { text: 'Пт', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:5` },
        { text: 'Сб', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:6` }
      ],
      [{ text: 'Нд', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY}:7` }]
    );
  }

  if (!venueScheduleLocked) {
    for (const x of schedule.slice(0, 20)) {
      const label = `🗑 ${WD[x.weekday] || x.weekday} ${fmtTime(x.timeStart)}-${fmtTime(x.timeEnd)}`;
      keyboard.push([{ text: label.slice(0, 64), callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_DELETE}:${x.id}` }]);
    }
  } else {
    keyboard.push([{ text: '✅ Підтвердити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_CONFIRM }]);
    keyboard.push([{ text: '💬 Написати розробнику', url: CONSTANTS.URLS.DEV_HELP_BOT }]);
  }
  const codeStr = String(curClass.groupClassCode || '');
  if (codeStr.startsWith('local_')) {
    keyboard.push([
      {
        text: '⬅️ До картки заняття',
        callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD}:${codeStr}`
      }
    ]);
  }
  keyboard.push([
    { text: '⬅️ До групових закладу', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${venue.id}` }
  ]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showCoachGroupScheduleClassList(chatId, venueId) {
  const venue = await supabase.getVenueById(String(venueId || '').trim());
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    await showCoachGroupVenueMenu(chatId);
    return;
  }
  const classes = (await supabase.listCoachGroupClasses(chatId, venue.id)).filter((c) => !c.isArchived);
  if (!classes.length) {
    await Helpers.sendKeyboard(
      chatId,
      '⚠️ Спочатку обери групові заняття для цього закладу.',
      [[{ text: '⬅️ До вибору групових', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${venue.id}` }]]
    );
    return;
  }
  const keyboard = classes.map((x) => [
    {
      text: `🗓 ${String(x.labelUa || x.groupClassCode)}`.slice(0, 64),
      callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_CLASS}:${x.groupClassCode}`
    }
  ]);
  keyboard.push([{ text: '⬅️ До групових закладу', callback_data: `${CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE}:${venue.id}` }]);
  await State.update(chatId, { profileGroupVenueId: String(venue.id) });
  await Helpers.sendKeyboard(chatId, `🗓 Розклад групових\n🏢 ${venue.nameUa}\n\nОбери групове заняття:`, keyboard);
}

async function showProfileCoachTrainingTypesEditor(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
    await show(chatId);
    return;
  }
  const selected = Array.isArray(user.coachTrainingTypes) ? user.coachTrainingTypes : [];
  const hasIndividual = selected.includes('individual');
  const hasGroup = selected.includes('group');
  const keyboard = [
    [
      {
        text: `${hasIndividual ? '✅' : '☐'} Індивідуальні (персональні, спліт, тріо)`,
        callback_data: `${CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES_TOGGLE}:individual`
      }
    ],
    [
      {
        text: `${hasGroup ? '✅' : '☐'} Групові заняття`,
        callback_data: `${CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES_TOGGLE}:group`
      }
    ]
  ];
  if (hasGroup) {
    keyboard.push([
      {
        text: '👥 Налаштувати групові по закладах',
        callback_data: CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_OPEN
      }
    ]);
  }
  keyboard.push([{ text: '💾 Зберегти', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES_SAVE }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  const preview = hasGroup ? await buildCoachGroupSchedulePreview(chatId) : '';
  const body =
    '💪 <b>Тип тренувань, які проводжу</b>\n\n' +
    preview +
    COACH_TRAINING_HINT +
    '☐ <b>Групові заняття</b> — лише позначка, що ти проводиш групи.\n' +
    '👥 <b>Налаштувати групові по закладах</b> — вибір клубу, заняття з картки клубу, свої групові та розклад.';
  await Helpers.sendKeyboard(chatId, body, keyboard, { parse_mode: 'HTML' });
}

async function showProfileAccentZones(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT });
  const state = await State.get(chatId);
  const accentZones = state?.profileAccentZones || [];
  const keyboard = [];
  const row = [];
  for (const zone of ACCENT_ZONES_ORDER) {
    const label = (ACCENT_LABELS[zone] || zone) + (accentZones.includes(zone) ? ' ✓' : '');
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_TGL + ':' + zone });
    if (row.length >= 3) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_BCK }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_NXT }]);
  await Helpers.sendKeyboard(chatId, '🎯 На що робимо акцент? Обери 1–2 зони (або «Все рівномірно»).', keyboard);
}

async function showProfileAvoidZones(chatId) {
  const state = await State.get(chatId);
  const avoidZones = state?.profileAvoidZones || [];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT });
  // Та сама сітка/порядок, що в «На що робимо акцент» (без «Все рівномірно»)
  const keyboard = [];
  const row = [];
  for (const zone of AVOID_ZONES_ORDER) {
    const label = (ACCENT_LABELS[zone] || zone) + (avoidZones.includes(zone) ? ' ✓' : '');
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_TGL + ':' + zone });
    if (row.length >= 3) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_SKP }, { text: '→ Зберегти', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_NXT }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_BCK }]);
  await Helpers.sendKeyboard(chatId, 'Є зони, які НЕ розвиваємо або мінімізуємо? (необов\'язково)', keyboard);
}

const ACTIVITY_JOB_LABELS = JOB_LABELS_UA;
const ACTIVITY_TRANSPORT_LABELS = TRANSPORT_LABELS_UA;
const ACTIVITY_STEPS_LABELS = STEPS_LABELS_UA;
const ACTIVITY_EXTRA_LABELS = EXTRA_LABELS_UA;

async function showProfileActivityHub(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const role = String(user.role || '').toLowerCase();
  const backCb =
    role === CONSTANTS.ROLES.COACH || role === CONSTANTS.ROLES.STUDENT
      ? CONSTANTS.CALLBACKS.PROFILE_MY_METRICS
      : CONSTANTS.CALLBACKS.BACK_TO_PROFILE;
  const keyboard = [
    [{ text: '✏️ Оновити відповіді', callback_data: CONSTANTS.CALLBACKS.PROFILE_ACTIVITY_UPDATE }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: backCb }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, formatActivityHubText(user), keyboard);
}

async function startProfileActivityWizard(chatId) {
  const user = await User.getByChatId(chatId);
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB,
    profileActivityJob: user && user.jobType ? user.jobType : null,
    profileActivityTransport: user && user.transportType ? user.transportType : null,
    profileActivitySteps: user && user.stepsCategory ? user.stepsCategory : null,
    profileActivityExtra: user && user.extraActivity ? user.extraActivity : null
  });
  await showProfileActivityJob(chatId);
}

async function showProfileActivityJob(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB });
  const keyboard = [
    [{ text: ACTIVITY_JOB_LABELS.office_sitting, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':office_sitting' }],
    [{ text: ACTIVITY_JOB_LABELS.office_mixed, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':office_mixed' }],
    [{ text: ACTIVITY_JOB_LABELS.standing, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':standing' }],
    [{ text: ACTIVITY_JOB_LABELS.physical, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB + ':physical' }]
  ];
  await Helpers.sendKeyboard(chatId, '🏃 Активність (шкала 1–5)\n\nЯка у вас робота?', keyboard);
}

async function showProfileActivityTransport(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT });
  const keyboard = [
    [{ text: ACTIVITY_TRANSPORT_LABELS.car_transit, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':car_transit' }],
    [{ text: ACTIVITY_TRANSPORT_LABELS.walk_bike, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':walk_bike' }],
    [{ text: ACTIVITY_TRANSPORT_LABELS.combined, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT + ':combined' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Як добираєтесь до роботи?', keyboard);
}

async function showProfileActivitySteps(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS });
  const keyboard = [
    [{ text: ACTIVITY_STEPS_LABELS.under_5k, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':under_5k' }],
    [{ text: ACTIVITY_STEPS_LABELS['5k_10k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':5k_10k' }],
    [{ text: ACTIVITY_STEPS_LABELS['10k_15k'], callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':10k_15k' }],
    [{ text: ACTIVITY_STEPS_LABELS.over_15k, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS + ':over_15k' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Скільки кроків приблизно на день?', keyboard);
}

async function showProfileActivityExtra(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA });
  const keyboard = [
    [{ text: ACTIVITY_EXTRA_LABELS.none, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':none' }],
    [{ text: ACTIVITY_EXTRA_LABELS.light, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':light' }],
    [{ text: ACTIVITY_EXTRA_LABELS.moderate, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':moderate' }],
    [{ text: ACTIVITY_EXTRA_LABELS.intense, callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA + ':intense' }]
  ];
  await Helpers.sendKeyboard(chatId, 'Чи є інша активність поза залом?', keyboard);
}

// ─── Оновлення замірів (FSM) ─────────────────────────────────────────────────

async function startMeasurementsUpdate(chatId) {
  await showMeasurementsPicker(chatId);
}

function formatMeasButtonLabel(base, value, unit) {
  if (value == null || value === '') return base;
  return String(base + ': ' + value + (unit ? ' ' + unit : '')).slice(0, 64);
}

const MEASUREMENT_FIELD_LABELS = {
  height: '📏 Зріст',
  weight: '⚖️ Вага',
  waist: '⭕ Талія',
  hip: '⭕ Стегно',
  glutes: '⭕ Ягодиці',
  arm: '💪 Біцепс (розслаблено)',
  armFlex: '💪 Біцепс (напруга)',
  neck: '🧣 Шия',
  wrist: '⌚ Запʼястя',
  shoulders: '📐 Плечі',
  chest: '📐 Груди',
  bodyFatPct: '📊 Жир (%)'
};

async function buildMeasurementsPickerKeyboard(prefix, chatId) {
  const p = prefix;
  const user = (await User.getByChatId(chatId)) || {};
  const role = String(user.role || '').toLowerCase();
  const backCb =
    role === CONSTANTS.ROLES.COACH || role === CONSTANTS.ROLES.STUDENT
      ? CONSTANTS.CALLBACKS.PROFILE_MY_METRICS
      : CONSTANTS.CALLBACKS.BACK_TO_PROFILE;
  // Ергономічна сітка 2 колонки: ліворуч обхвати, праворуч зріст/вага/%жиру/шия/плечі
  return [
    [
      { text: formatMeasButtonLabel('⭕ Талія', user.waist, 'см'), callback_data: p + ':waist' },
      { text: formatMeasButtonLabel('📏 Зріст', user.height, 'см'), callback_data: p + ':height' }
    ],
    [
      { text: formatMeasButtonLabel('📐 Груди', user.chest, 'см'), callback_data: p + ':chest' },
      { text: formatMeasButtonLabel('⚖️ Вага', user.weight, 'кг'), callback_data: p + ':weight' }
    ],
    [
      { text: formatMeasButtonLabel('⭕ Стегно', user.hip, 'см'), callback_data: p + ':hip' },
      { text: formatMeasButtonLabel('📊 Жир (%)', user.bodyFatPct, '%'), callback_data: p + ':bodyFatPct' }
    ],
    [
      { text: formatMeasButtonLabel('⭕ Ягодиці', user.glutes, 'см'), callback_data: p + ':glutes' },
      { text: formatMeasButtonLabel('🧣 Шия', user.neck, 'см'), callback_data: p + ':neck' }
    ],
    [
      { text: formatMeasButtonLabel('⌚ Запʼястя', user.wrist, 'см'), callback_data: p + ':wrist' },
      { text: formatMeasButtonLabel('📐 Плечі', user.shoulders, 'см'), callback_data: p + ':shoulders' }
    ],
    [{ text: formatMeasButtonLabel('💪 Біцепс (розсл.)', user.arm, 'см'), callback_data: p + ':arm' }],
    [{ text: formatMeasButtonLabel('💪 Біцепс (напруга)', user.armFlex, 'см'), callback_data: p + ':armFlex' }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: backCb }]
  ];
}

async function showMeasurementsPicker(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE });
  const keyboard = await buildMeasurementsPickerKeyboard(CONSTANTS.CALLBACK_PREFIXES.PROFILE_MEAS_PICK, chatId);
  await Helpers.sendKeyboard(
    chatId,
    '📊 Оновлення замірів\n\n' +
      '💡 Поруч із назвою — поточне значення (якщо вже є).\n\n' +
      'Обери, який обмір хочеш змінити:',
    keyboard
  );
}

function getMeasurementAskText(field) {
  switch (field) {
    case 'height': return '📏 Введи зріст (см):\n\nПриклад: 175';
    case 'weight': return '⚖️ Введи вагу (кг):\n\nПідказка: стань на ваги вранці, після туалету, але до прийому їжі або води.\n\nПриклад: 72';
    case 'waist': return '⭕ Введи обхват талії (см):\n\nПідказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\nПриклад: 72';
    case 'hip': return '⭕ Введи обхват стегна (см):\n\nВимірюй найширшу частину.\nПриклад: 95';
    case 'glutes': return '⭕ Введи обхват ягодиць (см):\n\nПідказка: роби замір натщесерце — вранці, після туалету, до їжі/води.\n\nПриклад: 98';
    case 'arm': return '💪 Введи обхват біцепса (найширша частина руки у верхній частині) у розслабленому стані (см):\n\nПідказка: замір вранці, до тренування. Завжди міряй одну й ту саму руку (зазвичай домінантну).\nРука вздовж тіла, мʼяз повністю розслаблений. Стрічка перпендикулярно руці — у найширшій точці.\n\nПриклад: 32';
    case 'armFlex': return '💪 Введи обхват біцепса у напруженому стані (см):\n\nПідказка: завжди міряй одну й ту саму руку (зазвичай домінантну).\nУ напруженому стані (пік біцепса): рука зігнута приблизно під 90°, біцепс максимально напружений.\nСтрічка — у точці найбільшого випʼячування мʼяза.\n\nПриклад: 34';
    case 'neck': return '🧣 Введи обхват шиї (см):\n\nПідказка: голова прямо, погляд уперед, плечі опущені. Якщо ти хлопець: стрічка під кадиком.\nСтрічка строго горизонтально. Щільно, але без стиснення (має проходити 1 палець). Мʼязи розслаблені.\nВранці до їжі — шия трохи менша. Обхват шиї впливає на розрахунок % жиру.\n\nПриклад: 36';
    case 'wrist': return '⌚ Введи обхват запʼястя (см):\n\nПідказка: стрічка одразу під кісточкою (найвужче місце), горизонтально. Щільно, без зазору, але не перетискай.\nЗапʼястя обовʼязкове для розрахунку типу фігури (маркер кістяка) і впливає на оптимальну вагу.\n\nПриклад: 16';
    case 'shoulders': return '📐 Введи обхват плечей (см):\n\nПідказка: стій прямо, руки вздовж тіла. Стрічка по спині через лопатки і по грудях. Плечі нейтральні. Замір на видиху.\nВранці, до тренування.\n\nПриклад: 98';
    case 'chest': return '📐 Введіть обхват грудей (см)\nПриклад: 86';
    case 'bodyFatPct': return '📊 Введіть відсоток жиру (%):\n\nПриклад: 22.5';
    default: return 'Введи значення:';
  }
}

function parseAndValidateMeasurement(field, text, v) {
  const raw = parseFloat(String(text).trim().replace(',', '.'));
  if (isNaN(raw)) return { ok: false, error: '⚠️ Введіть числове значення.' };
  const val = Math.round(raw * 10) / 10;
  const ranges = {
    height: [v.HEIGHT_MIN ?? 100, v.HEIGHT_MAX ?? 250],
    weight: [v.WEIGHT_MIN ?? 30, v.WEIGHT_MAX ?? 300],
    waist: [v.WAIST_MIN ?? 40, v.WAIST_MAX ?? 200],
    hip: [v.HIP_MIN ?? 40, v.HIP_MAX ?? 200],
    glutes: [v.GLUTES_MIN ?? 40, v.GLUTES_MAX ?? 200],
    arm: [v.ARM_MIN ?? 15, v.ARM_MAX ?? 80],
    armFlex: [v.ARM_MIN ?? 15, v.ARM_MAX ?? 80],
    neck: [v.NECK_MIN ?? 20, v.NECK_MAX ?? 80],
    wrist: [v.WRIST_MIN ?? 10, v.WRIST_MAX ?? 35],
    shoulders: [v.SHOULDERS_MIN ?? 40, v.SHOULDERS_MAX ?? 200],
    chest: [v.CHEST_MIN ?? 40, v.CHEST_MAX ?? 200],
    bodyFatPct: [v.BODY_FAT_MIN ?? 3, v.BODY_FAT_MAX ?? 60]
  };
  const r = ranges[field];
  if (r) {
    const [min, max] = r;
    if (val < min || val > max) return { ok: false, error: '⚠️ Введіть число від ' + min + ' до ' + max + '.' };
  }
  return { ok: true, value: val };
}
async function askWaist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WAIST });
  await Helpers.safeSend(chatId, '⭕ Введи обхват талії (в см):\n\nПриклад: 72');
}

async function askHip(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_HIP });
  await Helpers.safeSend(chatId, '⭕ Введи обхват стегна (в см):\n\nВимірюй найширшу частину.\nПриклад: 95');
}

async function askGlutes(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GLUTES });
  await Helpers.safeSend(chatId, '⭕ Введи обхват ягодиць (в см):\n\nПриклад: 98');
}

async function askArm(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ARM });
  await Helpers.safeSend(chatId, '💪 Введи обхват біцепса (розслаблено, см):\n\nПриклад: 32');
}

async function askNeck(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_NECK });
  await Helpers.safeSend(chatId, '🧣 Введи обхват шиї (в см):\n\nПриклад: 36');
}

async function askWrist(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_WRIST });
  await Helpers.safeSend(chatId, '⌚ Введи обхват запʼястя (в см):\n\nПриклад: 16');
}

async function askShoulders(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_SHOULDERS });
  await Helpers.safeSend(chatId, "📐 Введіть обхват плечей (см)\nВимірювати по найширшій точці дельтоподібних м'язів, горизонтально.\nПриклад: 98");
}

async function askChest(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_CHEST });
  await Helpers.safeSend(chatId, '📐 Введіть обхват грудей (см)\nВимірювати по найширшій точці грудної клітки.\nПриклад: 86');
}

async function askBodyFat(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_FAT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_BODY_FAT_SKIP }]];
  await Helpers.sendKeyboard(chatId, 'Введіть відсоток жиру якщо вимірювали каліпером.\nПриклад: 22.5\nАбо натисніть «Пропустити»', keyboard);
}

async function saveMeasurements(chatId) {
  try {
    const stateData = await State.get(chatId);
    const measurements = {
      weight: stateData.weight,
      waist: stateData.waist,
      hip: stateData.hip,
      glutes: stateData.glutes,
      arm: stateData.arm,
      neck: stateData.neck,
      wrist: stateData.wrist,
      shoulders: stateData.shoulders,
      chest: stateData.chest,
      bodyFatPct: stateData.bodyFatPct
    };
    await User.updateMeasurements(chatId, measurements);
    await State.clear(chatId);
    let msg = '✅ Заміри оновлено!\n\n⚖️ Вага: ' + measurements.weight + ' кг\n⭕ Талія: ' + measurements.waist + ' см\n⭕ Стегно: ' + measurements.hip + ' см\n⭕ Ягодиці: ' + measurements.glutes + ' см\n💪 Біцепс (розслаблено): ' + measurements.arm + ' см';
    if (measurements.neck != null) msg += '\n🧣 Шия: ' + measurements.neck + ' см';
    if (measurements.wrist != null) msg += '\n⌚ Запʼястя: ' + measurements.wrist + ' см';
    if (measurements.shoulders != null) msg += '\n📐 Плечі: ' + measurements.shoulders + ' см';
    if (measurements.chest != null) msg += '\n📐 Груди: ' + measurements.chest + ' см';
    if (measurements.bodyFatPct != null) msg += '\n📊 Жир: ' + measurements.bodyFatPct + '%';
    await Helpers.safeSend(chatId, msg);
    await show(chatId);
  } catch (err) {
    console.error('Profile.saveMeasurements', err.message);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Помилка збереження замірів. Спробуй ще раз.');
  }
}

// ─── Редагування полів (FSM) ─────────────────────────────────────────────────

async function askProfileFirstName(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME });
  await Helpers.safeSend(chatId, "✏️ Введи нове ім'я:");
}

async function askProfileLastName(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME });
  await Helpers.safeSend(chatId, '✏️ Введи нове прізвище:');
}

function formatUserLocationLabel(user) {
  if (!user) return 'не вказано';
  const loc = [user.city, user.oblast, user.district].filter(Boolean).join(', ');
  return loc || 'не вказано';
}

function formatBirthDateLabel(user) {
  if (!user || !user.birthDate) return 'не вказано';
  const d = user.birthDate instanceof Date ? user.birthDate : new Date(user.birthDate);
  if (isNaN(d.getTime())) return 'не вказано';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '.' + mm + '.' + yyyy;
}

async function askProfileFieldConfirm(chatId, options) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  await State.clear(chatId);
  const current = String(options.getCurrent(user) || '').trim() || 'не вказано';
  await Helpers.sendKeyboard(
    chatId,
    options.emoji + ' Зараз у профілі: ' + current + '\n\n' + options.question,
    [
      [
        { text: 'Ні', callback_data: options.noCallback },
        { text: 'Так', callback_data: options.yesCallback }
      ]
    ]
  );
}

/** Показ поточного імені і підтвердження перед зміною. */
async function askProfileFirstNameConfirm(chatId) {
  await askProfileFieldConfirm(chatId, {
    emoji: '✏️',
    getCurrent: (u) => u.firstName,
    question: "Точно хочеш змінити ім'я?",
    noCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME_NO,
    yesCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME_YES
  });
}

/** Показ поточного прізвища і підтвердження перед зміною. */
async function askProfileLastNameConfirm(chatId) {
  await askProfileFieldConfirm(chatId, {
    emoji: '✏️',
    getCurrent: (u) => u.lastName,
    question: 'Точно хочеш змінити прізвище?',
    noCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME_NO,
    yesCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME_YES
  });
}

/** Показ поточного НП і підтвердження перед зміною (область → місто). */
async function askProfileCityConfirm(chatId) {
  await askProfileFieldConfirm(chatId, {
    emoji: '🏙️',
    getCurrent: formatUserLocationLabel,
    question: 'Точно хочеш змінити населений пункт?',
    noCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY_NO,
    yesCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY_YES
  });
}

/** Показ поточної ДН і підтвердження перед зміною. */
async function askProfileBirthDateConfirm(chatId) {
  await askProfileFieldConfirm(chatId, {
    emoji: '📅',
    getCurrent: formatBirthDateLabel,
    question: 'Точно хочеш змінити дату народження?',
    noCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE_NO,
    yesCallback: CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE_YES
  });
}

async function askProfileCity(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_OBLAST_INPUT, profileOblast: null });
  await Helpers.safeSend(
    chatId,
    '🗺️ Введи область: напиши перші 2–3 літери назви та вибери варіант із списку, який з’явиться:'
  );
}

async function askHeight(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT });
  await Helpers.safeSend(chatId, '📏 Введи новий зріст (в см):\n\nПриклад: 175');
}

async function askProfileBirthDate(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE });
  await Helpers.safeSend(chatId, '📅 Введи нову дату народження:\n\nФормат: ДД.ММ.РРРР\nПриклад: 15.05.1995');
}

async function askProfileInstagram(chatId, options = {}) {
  const fromHintsPublic = !!options.fromHintsPublic;
  const user = await User.getByChatId(chatId);
  const cur =
    user && user.instagram
      ? '\n\nЗараз: ' + Helpers.escapeHtml(String(user.instagram))
      : '\n\nЗараз: не вказано';
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.PROFILE_EDIT_INSTAGRAM,
    returnToHintsPublic: fromHintsPublic
  });
  const keyboard = [
    [{ text: '⏭️ Пропустити / очистити', callback_data: CONSTANTS.CALLBACKS.PROFILE_INSTAGRAM_SKIP }]
  ];
  if (fromHintsPublic) {
    keyboard.push([{ text: '⬅️ До публічної картки', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_STEPS }]);
    keyboard.push([{ text: '⬅️ Навігатор', callback_data: CONSTANTS.CALLBACKS.MENU_HINTS }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  } else {
    keyboard.push([{ text: '⬅️ До публічних даних', callback_data: CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA }]);
  }
  await Helpers.sendKeyboard(
    chatId,
    '📸 Введи посилання на Instagram:' +
      cur +
      '\n\nПриклад: https://www.instagram.com/your_name',
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function returnAfterProfileInstagram(chatId) {
  const state = await State.get(chatId);
  const returnToHints = !!(state && state.returnToHintsPublic);
  await State.clear(chatId);
  if (returnToHints) {
    const CoachHints = require('./coachHints');
    await CoachHints.showPublicStepsChecklist(chatId);
    return;
  }
  await returnAfterCoachPublicFieldEdit(chatId);
}

async function askProfileCycleLastStart(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_CYCLE_LAST_START });
  await Helpers.safeSend(
    chatId,
    '🌸 Введіть дату початку останніх місячних\n\nФормат: ДД.ММ.РРРР\nПриклад: 24.04.2026'
  );
}

async function askProfileCycleLength(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_CYCLE_LEN });
  const keyboard = [[{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE }]];
  await Helpers.sendKeyboard(
    chatId,
    '📅 **Середня довжина циклу** (від початку місячних до очікування наступного початку):\n\n' +
      'Введи число днів (**' +
      menstrualCycle.cycleLengthRangeHintUa() +
      '**).\n' +
      'Наприклад: 28',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function askProfileCycleBleeding(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_CYCLE_BLEED });
  const k = CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_BLD;
  const keyboard = [
    [
      { text: '3 дн.', callback_data: `${k}:3` },
      { text: '4 дн.', callback_data: `${k}:4` },
      { text: '5 дн.', callback_data: `${k}:5` }
    ],
    [
      { text: '6 дн.', callback_data: `${k}:6` },
      { text: '7 дн.', callback_data: `${k}:7` }
    ],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE }]
  ];
  await Helpers.sendKeyboard(chatId, '🩸 Середня тривалість місячних (кровотечі):', keyboard);
}

function cycleStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'regular') return 'Регулярний цикл';
  if (s === 'perimenopause') return 'Перименопауза (нерегулярно)';
  if (s === 'menopause') return 'Менопауза / постменопауза';
  if (s === 'menopause_confirmed') return 'Менопауза (підтверджено 12 міс)';
  if (s === 'postmenopause') return 'Постменопауза';
  return 'Не вказано';
}

const CYCLE_SYMPTOM_QUESTIONS = Object.freeze([
  { key: 'hotFlashes', title: 'Приливи / пітливість' },
  { key: 'sleepQuality', title: 'Порушення сну' },
  { key: 'fatigue', title: 'Втома / нестача енергії' },
  { key: 'jointPain', title: 'Суглоби / мʼязовий дискомфорт' },
  { key: 'moodStress', title: 'Настрій / стрес' },
  { key: 'recoveryScore', title: 'Відчуття відновлення' }
]);

function symptomScoreLabel(score) {
  const n = Number(score || 0);
  if (n <= 0) return '0 — немає';
  if (n === 1) return '1 — легке';
  if (n === 2) return '2 — помірне';
  return '3 — виражене';
}

async function showCycleSymptomQuestion(chatId) {
  const st = await State.get(chatId);
  const idx = st && st.profileCycleSymptomIdx != null ? Number(st.profileCycleSymptomIdx) : 0;
  const q = CYCLE_SYMPTOM_QUESTIONS[idx];
  if (!q) return false;
  const progress = `Питання ${idx + 1}/${CYCLE_SYMPTOM_QUESTIONS.length}`;
  const p = CONSTANTS.CALLBACK_PREFIXES.PROFILE_CSYM_SCORE;
  const keyboard = [
    [
      { text: '0', callback_data: `${p}:0` },
      { text: '1', callback_data: `${p}:1` },
      { text: '2', callback_data: `${p}:2` },
      { text: '3', callback_data: `${p}:3` }
    ],
    [{ text: '⬅️ Скасувати', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    `🌡️ Симптом-чек 0–3\n\n${progress}\n${q.title}\n\n0 — немає, 3 — виражене`,
    keyboard
  );
  return true;
}

async function startCycleSymptomCheck(chatId) {
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.PROFILE_CYCLE_SYMPTOM,
    profileCycleSymptomIdx: 0,
    profileCycleSymptomAnswers: {}
  });
  await showCycleSymptomQuestion(chatId);
}

async function finalizeCycleSymptomCheck(chatId) {
  const st = await State.get(chatId);
  const a = (st && st.profileCycleSymptomAnswers) || {};
  const payload = {
    hotFlashes: a.hotFlashes != null ? a.hotFlashes : 0,
    sleepQuality: a.sleepQuality != null ? a.sleepQuality : 0,
    fatigue: a.fatigue != null ? a.fatigue : 0,
    jointPain: a.jointPain != null ? a.jointPain : 0,
    moodStress: a.moodStress != null ? a.moodStress : 0,
    recoveryScore: a.recoveryScore != null ? a.recoveryScore : 0,
    source: 'profile_symptom_check'
  };
  await supabase.insertCycleSymptomLog(chatId, payload);
  const load = menstrualCycle.calcSymptomLoad(payload);
  const preview = menstrualCycle.applySymptomOverlay({ setsMultiplier: 1.0, excludeInversion: false, excludeHighImpact: false }, load);
  await Helpers.safeSend(
    chatId,
    '✅ Симптом-чек збережено.\n\n' +
      `Score: ${load.score} (${load.level})\n` +
      `Модифікатор підходів для авто-плану: x${Number(preview.setsMultiplier || 1).toFixed(2)}\n` +
      `High-impact: ${preview.excludeHighImpact ? 'обмежити' : 'без обмежень'}\n` +
      `Інверсії: ${preview.excludeInversion ? 'обмежити' : 'без обмежень'}`
  );
  await State.update(chatId, { step: null, profileCycleSymptomIdx: null, profileCycleSymptomAnswers: null });
  await showProfileCycleMenu(chatId);
}

async function showProfileCycleMenu(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || String(user.gender || '').toLowerCase() !== CONSTANTS.GENDERS.FEMALE) {
    await Helpers.safeSend(chatId, '🌸 Налаштування циклу доступне для профілю зі статтю «Жінка».');
    await returnAfterPersonalMetricsEdit(chatId, 'edit');
    return;
  }
  const settings = await supabase.getUserCycleSettings(chatId);
  const logs = await supabase.listCycleEventLogs(chatId, 8);
  const symptom = await supabase.getLatestCycleSymptomLog(chatId);
  const ctx = menstrualCycle.resolveTrainingContext(settings, logs, new Date());
  const load = menstrualCycle.calcSymptomLoad(symptom);
  const statusRaw = settings && settings.reproductiveStatus ? String(settings.reproductiveStatus).toLowerCase() : '';
  const showCycleDays = !statusRaw || ['regular', 'perimenopause'].includes(statusRaw);
  const lines = [
    '🌸 **Цикл і менопауза**',
    '',
    `Статус: ${cycleStatusLabel(settings && settings.reproductiveStatus)}`,
    `Поточна фаза: ${ctx.phaseLabelUa || '—'}${ctx.dayInCycle != null ? ` (день ~${ctx.dayInCycle})` : ''}`,
    showCycleDays
      ? `Довжина циклу: ${settings && settings.avgCycleLengthDays != null ? settings.avgCycleLengthDays + ' дн.' : 'не вказано'}`
      : null,
    showCycleDays
      ? `Тривалість місячних: ${settings && settings.avgBleedingDays != null ? settings.avgBleedingDays + ' дн.' : 'не вказано'}`
      : null,
    `Останній початок: ${settings && settings.lastPeriodStart ? settings.lastPeriodStart : 'не вказано'}`,
    `Останній symptom-check: ${symptom && symptom.logDate ? `${symptom.logDate} (score ${load.score})` : 'немає'}`,
    '',
    'Тут можна вказати **менопаузу / перименопаузу**, довжину циклу та дату початку місячних — для адаптації авто-плану.',
    '',
    'Статуси: регулярний цикл · перименопауза · менопауза (12+ міс без місячних) · постменопауза.'
  ].filter(Boolean);
  const keyboard = [
    [{ text: '🧬 Статус (цикл / менопауза)', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_STATUS }]
  ];
  if (showCycleDays) {
    keyboard.push(
      [{ text: '📅 Довжина циклу', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_EDIT_LEN }],
      [{ text: '🩸 Тривалість місячних', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_EDIT_BLEED }],
      [{ text: '✅ Початок сьогодні', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_CONFIRM_START }],
      [{ text: '📝 Дата початку місячних', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_ENTER_DATE }]
    );
  }
  const cycleRole = String(user.role || '').toLowerCase();
  const cycleBack =
    cycleRole === CONSTANTS.ROLES.COACH || cycleRole === CONSTANTS.ROLES.STUDENT
      ? CONSTANTS.CALLBACKS.PROFILE_MY_METRICS
      : CONSTANTS.CALLBACKS.BACK_TO_PROFILE;
  keyboard.push(
    [{ text: '🌡️ Symptom-check (0–3)', callback_data: CONSTANTS.CALLBACKS.PROFILE_CYCLE_SYMPTOMS }],
    [{ text: '⬅️ Назад', callback_data: cycleBack }]
  );
  await Helpers.sendKeyboard(chatId, lines.join('\n'), keyboard, { parse_mode: 'Markdown' });
}

async function showProfileCycleStatusPicker(chatId) {
  const keyboard = [
    [{ text: '🔁 Регулярний цикл', callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_STATUS}:regular` }],
    [{ text: '〰️ Перименопауза (клімакс)', callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_STATUS}:perimenopause` }],
    [{ text: '🕛 Менопауза (факт 12 міс)', callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_STATUS}:menopause_confirmed` }],
    [{ text: '📌 Постменопауза', callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_STATUS}:postmenopause` }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE }]
  ];
  await Helpers.sendKeyboard(chatId, '🧬 Оберіть репродуктивний статус для коректної логіки навантаження:', keyboard);
}

// ─── Handle callback ─────────────────────────────────────────────────────────

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();

  if (await ProfileBodyGoals.handleCallback(chatId, callbackData)) return true;

  if (action === CONSTANTS.CALLBACKS.PROFILE_VIEW) {
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA) {
    await showPublicDataHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_MY_PUBLIC_CARD) {
    await showMyPublicCard(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_MY_METRICS) {
    await showMyMetricsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS) {
    await startMeasurementsUpdate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_BODY_WHY) {
    const where = (param || 'profile').trim();
    let back = CONSTANTS.CALLBACKS.PROFILE_VIEW;
    if (where === 'metrics') back = CONSTANTS.CALLBACKS.PROFILE_MY_METRICS;
    else if (where === 'goals') back = CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS;
    else if (where === 'meas') back = CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS;
    await showBodyWhyHelp(chatId, back);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_MY_DOCS) {
    await showMyDocuments(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_ADD) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_COACH_DOCS_UPLOAD });
    await showMyDocuments(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_DONE) {
    const st = await State.get(chatId);
    if (st && st.step === CONSTANTS.FSM_STATES.PROFILE_COACH_DOCS_UPLOAD) {
      await State.update(chatId, { step: null });
    }
    await showMyDocuments(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_MEAS_PICK && param) {
    const field = param.trim();
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE, measEditField: field });
    const user = await User.getByChatId(chatId);
    const current = user && user[field] != null ? user[field] : null;
    const unit = field === 'weight' ? 'кг' : field === 'bodyFatPct' ? '%' : 'см';
    const currentLine =
      current != null ? '\n\nПоточне значення: ' + current + ' ' + unit : '\n\nПоточне значення: ще не вказано';
    await Helpers.safeSend(chatId, getMeasurementAskText(field) + currentLine);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_DOC_DEL && param) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    const docId = param.trim();
    await Helpers.sendKeyboard(
      chatId,
      '⚠️ Видалити документ назавжди?\n\nЦе прибере документ з платформи (з нашої бази даних).',
      [
        [{ text: '🗑 Так, видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PROFILE_DOC_DEL_OK + ':' + docId }],
        [{ text: '⬅️ Скасувати', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS }]
      ]
    );
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_DOC_DEL_OK && param) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    const docId = param.trim();
    const ok = await supabase.deleteCoachDocument(String(chatId), docId);
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося видалити документ.');
    } else {
      await Helpers.safeSend(chatId, '✅ Документ видалено.');
    }
    await showMyDocuments(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA) {
    const editUser = await User.getByChatId(chatId);
    if (editUser && String(editUser.role || '').toLowerCase() === CONSTANTS.ROLES.COACH) {
      await showMyMetricsHub(chatId);
      return true;
    }
    await showEditMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME) {
    await askProfileFirstNameConfirm(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME_NO) {
    await returnAfterCoachPublicFieldEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_FIRSTNAME_YES) {
    await askProfileFirstName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME) {
    await askProfileLastNameConfirm(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME_NO) {
    await returnAfterCoachPublicFieldEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_LASTNAME_YES) {
    await askProfileLastName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY) {
    await askProfileCityConfirm(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY_NO) {
    await returnAfterCoachPublicFieldEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CITY_YES) {
    await askProfileCity(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST) {
    if (param === '__BACK__') {
      await askProfileCity(chatId);
      return true;
    }
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_OBLAST_INPUT) return false;
    await State.update(chatId, { profileOblast: param || '', step: CONSTANTS.FSM_STATES.PROFILE_CITY_IN_OBLAST_INPUT });
    await Helpers.safeSend(
      chatId,
      '🏙️ Введи назву населеного пункту: напиши перші 2–3 літери та вибери варіант із списку, який з’явиться:'
    );
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.CITY_PICK) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_CITY_IN_OBLAST_INPUT) return false;
    const city = param || '';
    await State.update(chatId, {
      profileCityPick: city,
      step: CONSTANTS.FSM_STATES.PROFILE_DISTRICT_INPUT
    });
    await Helpers.sendKeyboard(
      chatId,
      'Район у межах населеного пункту (необовʼязково) — для сповіщень про нові заклади.\n\nНапиши назву району або натисни «Без району».',
      [[{ text: '⏭️ Без району', callback_data: CONSTANTS.CALLBACKS.PROFILE_DISTRICT_SKIP }]]
    );
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_DISTRICT_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_DISTRICT_INPUT) return false;
    const pci = state.profileCityPick ? String(state.profileCityPick).trim() : '';
    const pob = state.profileOblast ? String(state.profileOblast).trim() : '';
    try {
      await supabase.updateUser(chatId, { city: pci, oblast: pob || null, district: null });
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Місто та локація оновлені!');
      await returnAfterCoachPublicFieldEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_HEIGHT) {
    await askHeight(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE) {
    await askProfileBirthDateConfirm(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE_NO) {
    await returnAfterCoachPublicFieldEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_BIRTHDATE_YES) {
    await askProfileBirthDate(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_INSTAGRAM) {
    const user = await User.getByChatId(chatId);
    if (!user || String(user.role || '').toLowerCase() !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Instagram налаштовується лише в профілі тренера.');
      await show(chatId);
      return true;
    }
    await askProfileInstagram(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_INSTAGRAM_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_EDIT_INSTAGRAM) return false;
    try {
      await User.updateField(chatId, 'INSTAGRAM', '');
      await Helpers.safeSend(chatId, '✅ Instagram очищено.');
      await returnAfterProfileInstagram(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_GOAL) {
    const g = String(param || '').trim().toLowerCase();
    if (g === CONSTANTS.GOALS.LOSE || g === CONSTANTS.GOALS.GAIN || g === CONSTANTS.GOALS.KEEP) {
      try {
        await User.updateField(chatId, 'GOAL', g);
        await Helpers.safeSend(chatId, '✅ Мета тренувань збережена: ' + getTrainingGoalLabelUa(g) + '.');
      } catch (err) {
        console.error('Profile PROFILE_EDIT_TRAINING_GOAL', err.message);
        await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
      }
      await showEditMenu(chatId);
      return true;
    }
    await showProfileTrainingGoalPicker(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_CYCLE) {
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_EDIT_LEN) {
    await askProfileCycleLength(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_EDIT_BLEED) {
    await askProfileCycleBleeding(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_BLD && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_CYCLE_BLEED) return false;
    const n = parseInt(String(param).trim(), 10);
    if (!isFinite(n) || n < 3 || n > 7) {
      await Helpers.safeSend(chatId, '⚠️ Обери тривалість кнопками.');
      return true;
    }
    const current = await supabase.getUserCycleSettings(chatId);
    await supabase.upsertUserCycleSettings(chatId, {
      reproductiveStatus: (current && current.reproductiveStatus) || 'regular',
      avgCycleLengthDays: current && current.avgCycleLengthDays != null ? current.avgCycleLengthDays : 28,
      avgBleedingDays: n,
      lastPeriodStart: current && current.lastPeriodStart ? current.lastPeriodStart : null,
      lastPeriodUserEntered: current && current.lastPeriodUserEntered === true
    });
    await Helpers.safeSend(chatId, '✅ Тривалість місячних збережено: ' + n + ' дн.');
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_STATUS) {
    await showProfileCycleStatusPicker(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_CYCLE_STATUS && param) {
    const status = String(param).trim().toLowerCase();
    if (!['regular', 'perimenopause', 'menopause_confirmed', 'postmenopause'].includes(status)) return true;
    const current = await supabase.getUserCycleSettings(chatId);
    await supabase.upsertUserCycleSettings(chatId, {
      reproductiveStatus: status,
      avgCycleLengthDays: current && current.avgCycleLengthDays != null ? current.avgCycleLengthDays : 28,
      avgBleedingDays: current && current.avgBleedingDays != null ? current.avgBleedingDays : 5,
      lastPeriodStart: current && current.lastPeriodStart ? current.lastPeriodStart : null,
      lastPeriodUserEntered: current && current.lastPeriodUserEntered === true
    });
    await Helpers.safeSend(chatId, `✅ Статус циклу оновлено: ${cycleStatusLabel(status)}.`);
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_ENTER_DATE) {
    await askProfileCycleLastStart(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_SYMPTOMS) {
    await startCycleSymptomCheck(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_CSYM_SCORE && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_CYCLE_SYMPTOM) return false;
    const idx = st.profileCycleSymptomIdx != null ? Number(st.profileCycleSymptomIdx) : 0;
    const q = CYCLE_SYMPTOM_QUESTIONS[idx];
    const score = Number(param);
    if (!q || !Number.isFinite(score) || score < 0 || score > 3) return true;
    const ans = { ...(st.profileCycleSymptomAnswers || {}) };
    ans[q.key] = score;
    const nextIdx = idx + 1;
    if (nextIdx >= CYCLE_SYMPTOM_QUESTIONS.length) {
      await State.update(chatId, { profileCycleSymptomAnswers: ans, profileCycleSymptomIdx: nextIdx });
      await finalizeCycleSymptomCheck(chatId);
      return true;
    }
    await State.update(chatId, { profileCycleSymptomAnswers: ans, profileCycleSymptomIdx: nextIdx });
    await showCycleSymptomQuestion(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_CYCLE_CONFIRM_START) {
    const user = await User.getByChatId(chatId);
    if (!user || String(user.gender || '').toLowerCase() !== CONSTANTS.GENDERS.FEMALE) {
      await Helpers.safeSend(chatId, '🌸 Налаштування циклу доступне для профілю зі статтю «Жінка».');
      await returnAfterPersonalMetricsEdit(chatId, 'edit');
      return true;
    }
    const today = new Date().toISOString().slice(0, 10);
    const current = await supabase.getUserCycleSettings(chatId);
    const status = current && current.reproductiveStatus ? current.reproductiveStatus : 'regular';
    await supabase.upsertUserCycleSettings(chatId, {
      reproductiveStatus: status,
      avgCycleLengthDays: current && current.avgCycleLengthDays != null ? current.avgCycleLengthDays : 28,
      avgBleedingDays: current && current.avgBleedingDays != null ? current.avgBleedingDays : 5,
      lastPeriodStart: today,
      lastPeriodUserEntered: true
    });
    await supabase.insertCycleEventLog(chatId, { eventType: 'period_start', eventDate: today, source: 'profile_manual_confirm' });
    await Helpers.safeSend(chatId, '✅ Початок циклу зафіксовано на сьогодні.');
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_ACCENT) {
    const user = await User.getByChatId(chatId);
    const accentZones = user && Array.isArray(user.accentZones) ? user.accentZones : [];
    const avoidZones = user && Array.isArray(user.avoidZones) ? user.avoidZones : [];
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT, profileAccentZones: accentZones, profileAvoidZones: avoidZones });
    await showProfileAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_ACTIVITY) {
    await showProfileActivityHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_ACTIVITY_UPDATE) {
    await startProfileActivityWizard(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_COACH_TRAINING_MENU || action === CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES) {
    await showProfileCoachTrainingTypesEditor(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_OPEN) {
    await showCoachGroupVenueMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_VENUE && param) {
    await showCoachGroupClassPicker(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_OPEN) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await showCoachGroupScheduleClassList(chatId, venueId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_CLASS && param) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await showCoachGroupScheduleClassMenu(chatId, venueId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_WEEKDAY && param) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const groupClassCode = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    const wd = Number(param || 0);
    if (!venueId || !groupClassCode || !wd || wd < 1 || wd > 7) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери групове заняття.');
      if (venueId) await showCoachGroupScheduleClassList(chatId, venueId);
      else await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const venueSchedule = (await supabase.listVenueSchedule(venueId, 300)).filter(
      (x) => String(x.groupClassCode || '') === String(groupClassCode || '')
    );
    if (venueSchedule.length) {
      await Helpers.safeSend(chatId, '⚠️ Для цього групового розклад задається на рівні закладу. Можна лише підтвердити або звернутися до розробника.');
      await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GROUP_SCHEDULE_TIME_INPUT, profileGroupWeekday: wd });
    await Helpers.safeSend(chatId, `Введи час для ${WD[wd]} у форматі HH:MM-HH:MM\nПриклад: 18:00-19:00`);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_DELETE && param) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const groupClassCode = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    const venueSchedule = venueId
      ? (await supabase.listVenueSchedule(venueId, 300)).filter((x) => String(x.groupClassCode || '') === String(groupClassCode || ''))
      : [];
    if (venueSchedule.length) {
      await Helpers.safeSend(chatId, '⚠️ Видалення недоступне: розклад цього групового керується закладом.');
      if (venueId && groupClassCode) await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
      else if (venueId) await showCoachGroupScheduleClassList(chatId, venueId);
      else await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await supabase.deleteCoachGroupScheduleItem(chatId, param);
    if (venueId && groupClassCode) await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
    else if (venueId) await showCoachGroupScheduleClassList(chatId, venueId);
    else await showCoachGroupVenueMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_SCHEDULE_CONFIRM) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const groupClassCode = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    await Helpers.safeSend(chatId, '✅ Підтверджено.');
    if (venueId && groupClassCode) await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
    else if (venueId) await showCoachGroupScheduleClassList(chatId, venueId);
    else await showCoachGroupVenueMenu(chatId);
    return true;
  }
  {
    const GroupClassAnnounce = require('./groupClassAnnounce');
    if (await GroupClassAnnounce.handleCallback(chatId, callbackData)) return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_ADD_LOCAL) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_CUSTOM_INPUT });
    await Helpers.safeSend(chatId, '✍️ Введи назву нової групової (3-80 символів):');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CARD && param) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await showCoachGroupClassCard(chatId, venueId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ARCHIVE_LIST) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await showCoachGroupClassArchiveList(chatId, venueId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_NAME) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку заняття.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_NAME_INPUT });
    await Helpers.safeSend(chatId, '✏️ Введи нову назву (3-80 символів):');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_DESC) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку заняття.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_DESC_INPUT });
    await Helpers.safeSend(
      chatId,
      '📄 Введи короткий опис (до 300 символів).\nНадішли «-» щоб очистити опис.'
    );
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_EDIT_PRICE) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку заняття.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_PRICE_INPUT });
    await Helpers.safeSend(
      chatId,
      '💰 Введи вартість числом (наприклад: 400 або 400.50).\nВалюта: UAH.'
    );
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_CLEAR_PRICE) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, { priceAmount: null });
    await Helpers.safeSend(chatId, ok ? '✅ Вартість очищено.' : '❌ Не вдалося оновити.');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_SUBMIT_MOD) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code || !String(code).startsWith('local_')) {
      await Helpers.safeSend(chatId, '⚠️ На модерацію можна лише своє (локальне) групове.');
      if (venueId) await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }
    const cls = await supabase.getCoachGroupClass(chatId, venueId, code);
    if (!cls || cls.isArchived) {
      await Helpers.safeSend(chatId, '❌ Заняття не знайдено або в архіві.');
      await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }
    if (cls.moderationStatus === 'pending') {
      await Helpers.safeSend(chatId, '⏳ Заявку вже надіслано. Очікуй рішення адміна.');
      await showCoachGroupClassCard(chatId, venueId, code);
      return true;
    }
    if (cls.moderationStatus === 'published') {
      await Helpers.safeSend(chatId, '✅ Це заняття вже на картці клубу.');
      await showCoachGroupClassCard(chatId, venueId, code);
      return true;
    }
    if (!(cls.labelUa && String(cls.labelUa).trim().length >= 3)) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку вкажи назву заняття (мін. 3 символи).');
      await showCoachGroupClassCard(chatId, venueId, code);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, {
      moderationStatus: 'pending'
    });
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося надіслати на модерацію.');
      await showCoachGroupClassCard(chatId, venueId, code);
      return true;
    }
    const adminId = process.env.ADMIN_CHAT_ID != null ? String(process.env.ADMIN_CHAT_ID).trim() : '';
    const venue = await supabase.getVenueById(venueId);
    const coach = await User.getByChatId(chatId);
    const cName = [coach && coach.firstName, coach && coach.lastName].filter(Boolean).join(' ') || chatId;
    if (adminId) {
      try {
        await Helpers.safeSend(
          adminId,
          '⏳ Нова заявка: групове на картку клубу\n\n' +
            'Тренер: ' +
            cName +
            ' (' +
            chatId +
            ')\n' +
            'Заклад: ' +
            ((venue && venue.nameUa) || venueId) +
            '\n' +
            'Заняття: ' +
            (cls.labelUa || code) +
            '\n\nВідкрий адмін-бот → «Групові (модерація)».'
        );
      } catch (_) {}
    }
    await Helpers.safeSend(
      chatId,
      '✅ Заявку надіслано.\nАдмін звʼяжеться з власником закладу; після підтвердження заняття зʼявиться на картці клубу.'
    );
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_ARCHIVE) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    if (!String(code).startsWith('local_')) {
      await Helpers.safeSend(chatId, '⚠️ В архів можна лише свої (локальні) групові.');
      await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, { isArchived: true });
    await Helpers.safeSend(chatId, ok ? '📦 Заняття в архіві.' : '❌ Не вдалося архівувати.');
    await showCoachGroupClassPicker(chatId, venueId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_CLASS_UNARCHIVE && param) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = String(param || '').trim();
    if (!venueId || !code) {
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, { isArchived: false });
    await Helpers.safeSend(chatId, ok ? '✅ Заняття повернуто з архіву.' : '❌ Не вдалося відновити.');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_TOGGLE && param) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const code = String(param || '').trim();
    if (!code) {
      await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }
    if (code.startsWith('local_')) {
      await showCoachGroupClassCard(chatId, venueId, code);
      return true;
    }
    const cur = await supabase.listCoachGroupClasses(chatId, venueId);
    const active = cur.filter((x) => !x.isArchived);
    const archived = cur.filter((x) => x.isArchived);
    const set = new Set(active.map((x) => x.groupClassCode));
    if (set.has(code)) {
      const nextActive = active.filter((x) => x.groupClassCode !== code);
      await supabase.replaceCoachGroupClasses(chatId, venueId, [...nextActive, ...archived]);
      await supabase.clearCoachGroupSchedule(chatId, venueId, code);
      await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }

    const venue = await supabase.getVenueById(venueId);
    if (!venue) {
      await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const fromVenue = (venue.facets || []).find((f) => f && f.facetKind === 'group_class' && f.code === code);
    let labelUa = fromVenue && fromVenue.labelUa ? fromVenue.labelUa : null;
    if (!labelUa) {
      const dir = await supabase.getVenueDirectoryCodes('group_class');
      const d = dir.find((x) => x.code === code);
      if (d && d.labelUa) labelUa = d.labelUa;
    }
    const nextActive = [
      ...active,
      {
        groupClassCode: code,
        labelUa: labelUa || null,
        description: null,
        priceAmount: null,
        priceCurrency: 'UAH',
        isArchived: false
      }
    ];
    await supabase.replaceCoachGroupClasses(chatId, venueId, [...nextActive, ...archived]);
    await showCoachGroupClassPicker(chatId, venueId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_DONE) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    await Helpers.safeSend(chatId, '✅ Групові заняття для закладу збережено.');
    await showCoachGroupVenueMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_START_TEXT || action === CONSTANTS.CALLBACKS.PROFILE_GROUP_TRAINING_SKIP) {
    await Helpers.safeSend(chatId, 'ℹ️ Використай меню вибору групових по закладах.');
    await showCoachGroupVenueMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES_TOGGLE && param) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    const key = String(param || '').trim();
    if (key !== 'individual' && key !== 'group') {
      await Helpers.safeSend(chatId, '⚠️ Невідомий тип тренувань.');
      await showProfileCoachTrainingTypesEditor(chatId);
      return true;
    }
    const cur = new Set(Array.isArray(user.coachTrainingTypes) ? user.coachTrainingTypes : []);
    const hadGroup = cur.has('group');
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    const next = Array.from(cur);
    const updates = { coachTrainingTypes: next };
    const ok = await supabase.updateUser(chatId, updates);
    if (!ok) await Helpers.safeSend(chatId, '❌ Не вдалося оновити типи тренувань.');
    const addedGroup = key === 'group' && !hadGroup && next.includes('group');
    if (key === 'group' && hadGroup && !next.includes('group')) {
      const venues = await supabase.getCoachVenuesWhereTeach(chatId);
      for (const v of venues) {
        await supabase.replaceCoachGroupClasses(chatId, v.id, []);
        await supabase.clearCoachGroupSchedule(chatId, v.id);
      }
    }
    if (addedGroup) await showCoachGroupVenueMenu(chatId);
    else await showProfileCoachTrainingTypesEditor(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_TRAINING_TYPES_SAVE) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await show(chatId);
      return true;
    }
    const selected = Array.isArray(user.coachTrainingTypes) ? user.coachTrainingTypes : [];
    if (!selected.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б один тип тренувань.');
      await showProfileCoachTrainingTypesEditor(chatId);
      return true;
    }
    await Helpers.safeSend(chatId, '✅ Тип тренувань збережено.');
    await show(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_JOB && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_JOB) return false;
    await State.update(chatId, { profileActivityJob: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT });
    await showProfileActivityTransport(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_TRANSPORT && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_TRANSPORT) return false;
    await State.update(chatId, { profileActivityTransport: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS });
    await showProfileActivitySteps(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_STEPS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_STEPS) return false;
    await State.update(chatId, { profileActivitySteps: param, step: CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA });
    await showProfileActivityExtra(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACTIVITY_EXTRA && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACTIVITY_EXTRA) return false;
    await User.updateActivityProfile(chatId, {
      jobType: state.profileActivityJob || null,
      transportType: state.profileActivityTransport || null,
      stepsCategory: state.profileActivitySteps || null,
      extraActivity: param || null
    });
    await State.clear(chatId);
    const updated = await User.getByChatId(chatId);
    await Helpers.safeSend(chatId, formatActivitySavedMessage(updated));
    await returnAfterPersonalMetricsEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT) return false;
    const zone = (param || '').trim();
    let accentZones = [...(state.profileAccentZones || [])];
    if (zone === 'full') {
      accentZones = ['full'];
    } else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) accentZones = accentZones.filter((z) => z !== zone);
      else if (accentZones.length < 2) accentZones.push(zone);
    }
    await State.update(chatId, { profileAccentZones: accentZones });
    // Автоматично переходимо до "Зони, які не розвиваємо" при: "full" або 2 вибраних зони
    if (accentZones[0] === 'full' || accentZones.length === 2) {
      await showProfileAvoidZones(chatId);
    } else {
      await showProfileAccentZones(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT) return false;
    const accentZones = state.profileAccentZones || [];
    if (!accentZones.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б одну зону або «Все рівномірно».');
      await showProfileAccentZones(chatId);
      return true;
    }
    await showProfileAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_ACC_BCK) {
    await State.clear(chatId);
    await returnAfterPersonalMetricsEdit(chatId, 'edit');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_TGL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT) return false;
    const zone = (param || '').trim();
    let avoidZones = [...(state.profileAvoidZones || [])];
    if (avoidZones.includes(zone)) avoidZones = avoidZones.filter((z) => z !== zone);
    else avoidZones.push(zone);
    await State.update(chatId, { profileAvoidZones: avoidZones });
    await showProfileAvoidZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_SKP || action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_NXT) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_AVOID_SELECT) return false;
    const accentZones = state.profileAccentZones || [];
    const avoidZones = state.profileAvoidZones || [];
    const toSaveAccent = accentZones.length > 0 ? accentZones : ['full'];
    await supabase.updateUser(chatId, { accentZones: toSaveAccent, avoidZones: Array.isArray(avoidZones) ? avoidZones : [] });
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '✅ Зони акценту та уникнення збережено.');
    await returnAfterPersonalMetricsEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_AVD_BCK) {
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_ACCENT_SELECT });
    await showProfileAccentZones(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_BODY_FAT_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_FAT) return false;
    await State.update(chatId, { bodyFatPct: undefined });
    await saveMeasurements(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_BROADCAST_NEWS) {
    await showBroadcastNewsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_ADS) {
    await showAdsSettings(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_ADS_YES || action === CONSTANTS.CALLBACKS.PROFILE_ADS_NO) {
    const adsOptIn = action === CONSTANTS.CALLBACKS.PROFILE_ADS_YES;
    const ok = await supabase.updateUser(chatId, { adsOptIn });
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося зберегти налаштування.');
      return true;
    }
    await Helpers.safeSend(chatId, adsOptIn ? '✅ Новини у місті увімкнено.' : '✅ Новини у місті вимкнено.');
    const u = await User.getByChatId(chatId);
    if (u && String(u.role || '').toLowerCase() === CONSTANTS.ROLES.COACH) {
      await showBroadcastNewsHub(chatId);
    } else {
      await show(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.BACK_TO_PROFILE) {
    await State.clear(chatId);
    await show(chatId);
    return true;
  }
  return false;
}

// ─── Handle text (profile FSM steps) ──────────────────────────────────────────

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  if (await ProfileBodyGoals.handleTextMessage(chatId, text)) return true;
  const step = state.step;
  const v = CONSTANTS.VALIDATION || {};
  if (step === CONSTANTS.FSM_STATES.PROFILE_COACH_DOCS_UPLOAD) {
    await Helpers.safeSend(chatId, '⚠️ Надішли фото або файл документа. Для виходу натисни «✅ Готово» або «⬅️ Назад».');
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_CUSTOM_INPUT) {
    const name = String(text || '').trim();
    if (name.length < 3 || name.length > 80) {
      await Helpers.safeSend(chatId, '⚠️ Назва має бути від 3 до 80 символів.');
      return true;
    }
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    if (!venueId) {
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '⚠️ Спочатку обери заклад.');
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const cur = await supabase.listCoachGroupClasses(chatId, venueId);
    const code = newLocalGroupCode();
    const next = [
      ...cur,
      {
        groupClassCode: code,
        labelUa: name,
        description: null,
        priceAmount: null,
        priceCurrency: 'UAH',
        isArchived: false
      }
    ];
    const ok = await supabase.replaceCoachGroupClasses(chatId, venueId, next);
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати групове заняття.');
      await State.update(chatId, { step: null });
      await showCoachGroupClassPicker(chatId, venueId);
      return true;
    }
    await State.update(chatId, { step: null, profileGroupClassCode: code });
    await Helpers.safeSend(chatId, '✅ Групове додано. Заповни картку:');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_NAME_INPUT) {
    const name = String(text || '').trim();
    if (name.length < 3 || name.length > 80) {
      await Helpers.safeSend(chatId, '⚠️ Назва має бути від 3 до 80 символів.');
      return true;
    }
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await State.update(chatId, { step: null });
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, { labelUa: name });
    await State.update(chatId, { step: null });
    await Helpers.safeSend(chatId, ok ? '✅ Назву оновлено.' : '❌ Не вдалося оновити назву.');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_DESC_INPUT) {
    const raw = String(text || '').trim();
    const desc = raw === '-' || raw === '—' ? null : raw;
    if (desc != null && (desc.length < 1 || desc.length > 300)) {
      await Helpers.safeSend(chatId, '⚠️ Опис: 1–300 символів, або «-» щоб очистити.');
      return true;
    }
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await State.update(chatId, { step: null });
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, { description: desc });
    await State.update(chatId, { step: null });
    await Helpers.safeSend(chatId, ok ? '✅ Опис оновлено.' : '❌ Не вдалося оновити опис.');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GROUP_CLASS_PRICE_INPUT) {
    const raw = String(text || '').trim().replace(',', '.');
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0 || n > 1000000) {
      await Helpers.safeSend(chatId, '⚠️ Введи коректну суму (0–1000000), наприклад: 400');
      return true;
    }
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const code = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    if (!venueId || !code) {
      await State.update(chatId, { step: null });
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const ok = await supabase.updateCoachGroupClass(chatId, venueId, code, {
      priceAmount: n,
      priceCurrency: 'UAH'
    });
    await State.update(chatId, { step: null });
    await Helpers.safeSend(chatId, ok ? '✅ Вартість оновлено.' : '❌ Не вдалося оновити вартість.');
    await showCoachGroupClassCard(chatId, venueId, code);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GROUP_SCHEDULE_TIME_INPUT) {
    const st = await State.get(chatId);
    const venueId = st && st.profileGroupVenueId ? String(st.profileGroupVenueId) : '';
    const groupClassCode = st && st.profileGroupClassCode ? String(st.profileGroupClassCode) : '';
    const wd = st && st.profileGroupWeekday ? Number(st.profileGroupWeekday) : 0;
    if (!venueId || !groupClassCode || !wd || wd < 1 || wd > 7) {
      await Helpers.safeSend(chatId, '⚠️ Контекст втрачено. Відкрий меню розкладу ще раз.');
      await State.update(chatId, { step: null });
      await showCoachGroupVenueMenu(chatId);
      return true;
    }
    const venueSchedule = (await supabase.listVenueSchedule(venueId, 300)).filter(
      (x) => String(x.groupClassCode || '') === String(groupClassCode || '')
    );
    if (venueSchedule.length) {
      await State.update(chatId, { step: null, profileGroupWeekday: null });
      await Helpers.safeSend(chatId, '⚠️ Для цього групового розклад задається закладом. Редагування недоступне.');
      await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
      return true;
    }
    const tr = parseTimeRange(text);
    if (!tr) {
      await Helpers.safeSend(chatId, '⚠️ Формат: HH:MM-HH:MM (приклад 18:00-19:00). Спробуй ще раз:');
      return true;
    }
    const ok = await supabase.addCoachGroupScheduleItem({
      coachChatId: chatId,
      venueId,
      groupClassCode,
      weekday: wd,
      timeStart: tr.timeStart,
      timeEnd: tr.timeEnd
    });
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося зберегти слот. Можливо, є обмеження БД або дубль.');
      return true;
    }
    await State.update(chatId, { step: null, profileGroupWeekday: null });
    await Helpers.safeSend(chatId, '✅ Слот розкладу додано.');
    await showCoachGroupScheduleClassMenu(chatId, venueId, groupClassCode);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_MEAS_EDIT_VALUE && state.measEditField) {
    const field = String(state.measEditField);
    const parsed = parseAndValidateMeasurement(field, text, v);
    if (!parsed.ok) {
      await Helpers.safeSend(chatId, parsed.error);
      return true;
    }
    await User.updateMeasurements(chatId, { [field]: parsed.value });
    await State.clear(chatId);
    const fieldLabel = MEASUREMENT_FIELD_LABELS[field] || field;
    const unit = field === 'weight' ? ' кг' : field === 'bodyFatPct' ? '%' : ' см';
    await Helpers.safeSend(chatId, '✅ Заміри оновлено: ' + fieldLabel + ' — ' + parsed.value + unit);
    await showMeasurementsPicker(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.PROFILE_WEIGHT) {
    const weight = parseFloat(String(text).trim());
    const min = v.WEIGHT_MIN != null ? v.WEIGHT_MIN : 30;
    const max = v.WEIGHT_MAX != null ? v.WEIGHT_MAX : 300;
    if (isNaN(weight) || weight < min || weight > max) {
      await Helpers.safeSend(chatId, '⚠️ Вага має бути від ' + min + ' до ' + max + ' кг.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { weight });
    await askWaist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_WAIST) {
    const waist = parseFloat(String(text).trim());
    const min = v.WAIST_MIN != null ? v.WAIST_MIN : 40;
    const max = v.WAIST_MAX != null ? v.WAIST_MAX : 200;
    if (isNaN(waist) || waist < min || waist > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват талії має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { waist });
    await askHip(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_HIP) {
    const hip = parseFloat(String(text).trim());
    const min = v.HIP_MIN != null ? v.HIP_MIN : 40;
    const max = v.HIP_MAX != null ? v.HIP_MAX : 200;
    if (isNaN(hip) || hip < min || hip > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват стегна має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { hip });
    await askGlutes(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_GLUTES) {
    const glutes = parseFloat(String(text).trim());
    const min = v.GLUTES_MIN != null ? v.GLUTES_MIN : 40;
    const max = v.GLUTES_MAX != null ? v.GLUTES_MAX : 200;
    if (isNaN(glutes) || glutes < min || glutes > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват ягодиць має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { glutes });
    await askArm(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_ARM) {
    const arm = parseFloat(String(text).trim());
    const min = v.ARM_MIN != null ? v.ARM_MIN : 15;
    const max = v.ARM_MAX != null ? v.ARM_MAX : 80;
    if (isNaN(arm) || arm < min || arm > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват руки має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { arm });
    await askNeck(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_NECK) {
    const neck = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.NECK_MIN != null ? v.NECK_MIN : 20;
    const max = v.NECK_MAX != null ? v.NECK_MAX : 80;
    if (isNaN(neck) || neck < min || neck > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват шиї має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { neck: Math.round(neck * 10) / 10 });
    await askWrist(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_WRIST) {
    const wrist = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.WRIST_MIN != null ? v.WRIST_MIN : 10;
    const max = v.WRIST_MAX != null ? v.WRIST_MAX : 35;
    if (isNaN(wrist) || wrist < min || wrist > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват запʼястя має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { wrist: Math.round(wrist * 10) / 10 });
    await askShoulders(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_SHOULDERS) {
    const shoulders = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.SHOULDERS_MIN != null ? v.SHOULDERS_MIN : 40;
    const max = v.SHOULDERS_MAX != null ? v.SHOULDERS_MAX : 200;
    if (isNaN(shoulders) || shoulders < min || shoulders > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват плечей має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { shoulders: Math.round(shoulders * 10) / 10 });
    await askChest(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CHEST) {
    const chest = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.CHEST_MIN != null ? v.CHEST_MIN : 40;
    const max = v.CHEST_MAX != null ? v.CHEST_MAX : 200;
    if (isNaN(chest) || chest < min || chest > max) {
      await Helpers.safeSend(chatId, '⚠️ Обхват грудей має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    await State.update(chatId, { chest: Math.round(chest * 10) / 10 });
    await askBodyFat(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_FAT) {
    const bodyFatPct = parseFloat(String(text).trim().replace(',', '.'));
    const min = v.BODY_FAT_MIN != null ? v.BODY_FAT_MIN : 3;
    const max = v.BODY_FAT_MAX != null ? v.BODY_FAT_MAX : 60;
    if (isNaN(bodyFatPct) || bodyFatPct < min || bodyFatPct > max) {
      await Helpers.safeSend(chatId, '⚠️ Відсоток жиру має бути від ' + min + ' до ' + max + '.\n\nСпробуй ще раз або натисни «Пропустити»:');
      return true;
    }
    await State.update(chatId, { bodyFatPct: Math.round(bodyFatPct * 10) / 10 });
    await saveMeasurements(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_FIRSTNAME) {
    const firstName = String(text).trim();
    const minLen = v.NAME_MIN_LENGTH != null ? v.NAME_MIN_LENGTH : 2;
    const maxLen = v.NAME_MAX_LENGTH != null ? v.NAME_MAX_LENGTH : 30;
    if (firstName.length < minLen || firstName.length > maxLen) {
      await Helpers.safeSend(chatId, "⚠️ Ім'я має бути від " + minLen + ' до ' + maxLen + " символів.\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.updateField(chatId, 'FIRST_NAME', firstName);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, "✅ Ім'я оновлено!");
      await returnAfterCoachPublicFieldEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_LASTNAME) {
    const lastName = String(text).trim();
    const minLen = v.LASTNAME_MIN_LENGTH != null ? v.LASTNAME_MIN_LENGTH : 2;
    const maxLen = v.LASTNAME_MAX_LENGTH != null ? v.LASTNAME_MAX_LENGTH : 50;
    if (lastName.length < minLen || lastName.length > maxLen) {
      await Helpers.safeSend(chatId, "⚠️ Прізвище має бути від " + minLen + ' до ' + maxLen + " символів.\n\nСпробуй ще раз:");
      return true;
    }
    try {
      await User.updateField(chatId, 'LAST_NAME', lastName);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Прізвище оновлено!');
      await returnAfterCoachPublicFieldEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_DISTRICT_INPUT) {
    const raw = String(text || '').trim();
    if (raw.length > 200) {
      await Helpers.safeSend(chatId, '⚠️ Занадто довго. До 200 символів:');
      return true;
    }
    const st = await State.get(chatId);
    const pci = st?.profileCityPick ? String(st.profileCityPick).trim() : '';
    const pob = st?.profileOblast ? String(st.profileOblast).trim() : '';
    try {
      await supabase.updateUser(chatId, { city: pci, oblast: pob || null, district: raw || null });
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Місто та локація оновлені!');
      await returnAfterCoachPublicFieldEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_OBLAST_INPUT) {
    const q = String(text).trim();
    if (q.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи щонайменше 2 літери області:');
      return true;
    }
    const oblasts = await supabase.searchOblasts(q, 12);
    if (!oblasts.length) {
      await Helpers.safeSend(chatId, '❌ Не знайдено область. Спробуй інше написання (мін. 2 літери):');
      return true;
    }
    const keyboard = oblasts.map((o) => [{ text: o, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST + ':' + o }]);
    await Helpers.sendKeyboard(chatId, 'Обери область зі списку:', keyboard);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CITY_IN_OBLAST_INPUT) {
    const st = await State.get(chatId);
    const oblast = st?.profileOblast ? String(st.profileOblast) : '';
    const q = String(text).trim();
    if (!oblast) {
      await askProfileCity(chatId);
      return true;
    }
    if (q.length < 3) {
      await Helpers.safeSend(chatId, '⚠️ Введи щонайменше 3 літери назви населеного пункту:');
      return true;
    }
    const cities = await supabase.searchCitiesInOblast(oblast, q, 12);
    if (!cities.length) {
      await Helpers.safeSend(chatId, '❌ Не знайдено. Спробуй інші 3+ літери:');
      return true;
    }
    const keyboard = cities.map((c) => [{ text: c, callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_PICK + ':' + c }]);
    keyboard.push([{ text: '⬅️ Змінити область', callback_data: CONSTANTS.CALLBACK_PREFIXES.CITY_OBLAST + ':__BACK__' }]);
    await Helpers.sendKeyboard(chatId, `Обери населений пункт (область: ${oblast}):`, keyboard);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_HEIGHT) {
    const height = parseFloat(String(text).trim());
    const min = v.HEIGHT_MIN != null ? v.HEIGHT_MIN : 100;
    const max = v.HEIGHT_MAX != null ? v.HEIGHT_MAX : 250;
    if (isNaN(height) || height < min || height > max) {
      await Helpers.safeSend(chatId, '⚠️ Зріст має бути від ' + min + ' до ' + max + ' см.\n\nСпробуй ще раз:');
      return true;
    }
    try {
      await User.updateField(chatId, 'HEIGHT', height);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Зріст оновлено!');
      await returnAfterPersonalMetricsEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_INSTAGRAM) {
    const instagram = String(text).trim();
    const instagramPattern =
      CONSTANTS.REG_PATTERNS && CONSTANTS.REG_PATTERNS.INSTAGRAM_URL
        ? CONSTANTS.REG_PATTERNS.INSTAGRAM_URL
        : /^https?:\/\/(www\.)?instagram\.com\/[^\s/]+\/?(\?.*)?$/i;
    if (!instagram) {
      await Helpers.safeSend(chatId, '⚠️ Надішли посилання або натисни «Пропустити / очистити».');
      return true;
    }
    if (!instagramPattern.test(instagram)) {
      await Helpers.safeSend(
        chatId,
        '⚠️ Невірний формат.\n\nПриклад: https://www.instagram.com/your_name\n\nСпробуй ще раз або натисни «Пропустити / очистити».'
      );
      return true;
    }
    try {
      await User.updateField(chatId, 'INSTAGRAM', instagram);
      await Helpers.safeSend(chatId, '✅ Instagram оновлено!');
      await returnAfterProfileInstagram(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_EDIT_BIRTHDATE) {
    const dateText = String(text).trim();
    const datePattern = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.INPUT_PATTERN) ? CONSTANTS.DATE_FORMATS.INPUT_PATTERN : /^\d{2}\.\d{2}\.\d{4}$/;
    if (!datePattern.test(dateText)) {
      const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) ? CONSTANTS.DATE_FORMATS.EXAMPLE : '15.05.1995';
      await Helpers.safeSend(chatId, '⚠️ Невірний формат дати.\n\nОчікується: ДД.ММ.РРРР\nПриклад: ' + ex + '\n\nСпробуй ще раз:');
      return true;
    }
    const birthDate = User.parseBirthDate(dateText);
    if (!birthDate) {
      await Helpers.safeSend(chatId, '⚠️ Некоректна дата.\n\nСпробуй ще раз:');
      return true;
    }
    const age = User.calculateAge(birthDate);
    const ageMin = v.AGE_MIN != null ? v.AGE_MIN : 12;
    const ageMax = v.AGE_MAX != null ? v.AGE_MAX : 100;
    if (age < ageMin || age > ageMax) {
      await Helpers.safeSend(chatId, '⚠️ Вік має бути від ' + ageMin + ' до ' + ageMax + ' років.\n\nСпробуй ще раз:');
      return true;
    }
    try {
      await User.updateField(chatId, 'BIRTH_DATE', birthDate);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Дату народження оновлено!');
      await returnAfterCoachPublicFieldEdit(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ Помилка оновлення.');
    }
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CYCLE_LEN) {
    const parsed = menstrualCycle.parseCycleLengthDays(text);
    if (!parsed.ok) {
      await Helpers.safeSend(
        chatId,
        '⚠️ Введи ціле число від ' +
          menstrualCycle.CYCLE_LENGTH_MIN +
          ' до ' +
          menstrualCycle.CYCLE_LENGTH_MAX +
          ' (наприклад 28):'
      );
      return true;
    }
    const current = await supabase.getUserCycleSettings(chatId);
    await supabase.upsertUserCycleSettings(chatId, {
      reproductiveStatus: (current && current.reproductiveStatus) || 'regular',
      avgCycleLengthDays: parsed.value,
      avgBleedingDays: current && current.avgBleedingDays != null ? current.avgBleedingDays : 5,
      lastPeriodStart: current && current.lastPeriodStart ? current.lastPeriodStart : null,
      lastPeriodUserEntered: current && current.lastPeriodUserEntered === true
    });
    await Helpers.safeSend(chatId, '✅ Довжину циклу збережено: ' + parsed.value + ' дн.');
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CYCLE_BLEED) {
    await Helpers.safeSend(chatId, '⚠️ Обери тривалість місячних кнопками вище.');
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CYCLE_LAST_START) {
    const dt = menstrualCycle.parseUaDateString(String(text).trim());
    if (!dt) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Введіть дату як ДД.ММ.РРРР');
      return true;
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dt > today) {
      await Helpers.safeSend(chatId, '⚠️ Дата не може бути в майбутньому.');
      return true;
    }
    const iso = dt.toISOString().slice(0, 10);
    const current = await supabase.getUserCycleSettings(chatId);
    const status = current && current.reproductiveStatus ? current.reproductiveStatus : 'regular';
    await supabase.upsertUserCycleSettings(chatId, {
      reproductiveStatus: status,
      avgCycleLengthDays: current && current.avgCycleLengthDays != null ? current.avgCycleLengthDays : 28,
      avgBleedingDays: current && current.avgBleedingDays != null ? current.avgBleedingDays : 5,
      lastPeriodStart: iso,
      lastPeriodUserEntered: true
    });
    await supabase.insertCycleEventLog(chatId, { eventType: 'period_start', eventDate: iso, source: 'profile_manual_date' });
    await Helpers.safeSend(chatId, `✅ Дату початку циклу збережено: ${iso}`);
    await showProfileCycleMenu(chatId);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_CYCLE_SYMPTOM) {
    await Helpers.safeSend(chatId, 'Оціни симптом кнопками 0–3 під останнім питанням.');
    return true;
  }
  return false;
}

async function handleFileMessage(chatId, file) {
  try {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PROFILE_COACH_DOCS_UPLOAD) return false;
    if (!file || !file.fileId) return true;
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для тренера.');
      await State.update(chatId, { step: null });
      await show(chatId);
      return true;
    }
    const id = await supabase.insertCoachDocument({
      coachChatId: chatId,
      fileId: file.fileId,
      fileUniqueId: file.fileUniqueId || null,
      fileType: file.kind === 'photo' ? 'photo' : 'document',
      mimeType: file.mimeType || null,
      fileName: file.fileName || null
    });
    if (!id) {
      await Helpers.safeSend(chatId, '⚠️ Не вдалося зберегти документ. Спробуй ще раз або натисни «✅ Готово».');
      return true;
    }
    const cnt = await supabase.countCoachDocuments(String(chatId));
    await Helpers.sendKeyboard(
      chatId,
      '✅ Додано. Документів збережено: ' + cnt + '\n\nМожеш надіслати ще один файл або натиснути «✅ Готово».',
      [[{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACKS.PROFILE_MY_DOCS_DONE }]]
    );
    return true;
  } catch (e) {
    console.error('Profile.handleFileMessage', e.message);
    await Helpers.safeSend(chatId, '❌ Помилка при збереженні документа.');
    return true;
  }
}

module.exports = {
  show,
  showEditMenu,
  showPublicDataHub,
  showMyMetricsHub,
  showBroadcastNewsHub,
  showMyPublicCard,
  handleCallback,
  handleTextMessage,
  handleFileMessage,
  formatProfileMessage,
  askProfileInstagram
};
