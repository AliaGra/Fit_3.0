/**
 * Звернення до тренера з публічної картки (користувач ще не клієнт).
 * Автовідповідь, відповідь тренера, cron-нагадування через 8 год.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const CoachOffer = require('./coachOffer');

const REMINDER_HOURS = 8;

const KIND = Object.freeze({
  CLUB_PERSONAL: 'club_personal',
  CLUB_SPLIT: 'club_split',
  CLUB_TRIO: 'club_trio',
  CLUB_GROUP: 'club_group',
  ONLINE: 'online',
  PROGRAMS: 'programs',
  NUTRITION: 'nutrition',
  QUESTION: 'question'
});

function displayName(user) {
  if (!user) return 'Користувач';
  const n = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return n || 'Користувач';
}

function firstNameOf(user) {
  const n = user && user.firstName ? String(user.firstName).trim() : '';
  return n || 'друже';
}

function coachGenderVerb(coach) {
  const g = String((coach && coach.gender) || '').toLowerCase();
  if (g === CONSTANTS.GENDERS.FEMALE) return { got: 'отримала', link: 'звʼяжусь' };
  if (g === CONSTANTS.GENDERS.MALE) return { got: 'отримав', link: 'звʼяжусь' };
  return { got: 'отримав(ла)', link: 'звʼяжусь' };
}

function kindLabel(kind, extraLabel) {
  if (kind === KIND.CLUB_PERSONAL) return 'тренування в клубі — індивідуальне';
  if (kind === KIND.CLUB_SPLIT) return 'тренування в клубі — спліт (2 особи)';
  if (kind === KIND.CLUB_TRIO) return 'тренування в клубі — тріо (3 особи)';
  if (kind === KIND.CLUB_GROUP) {
    return extraLabel
      ? 'тренування в клубі — групове («' + extraLabel + '»)'
      : 'тренування в клубі — групове';
  }
  if (kind === KIND.ONLINE) return 'онлайн-тренування';
  if (kind === KIND.PROGRAMS) return 'програму тренувань';
  if (kind === KIND.NUTRITION) return 'програму харчування';
  if (kind === KIND.QUESTION) return extraLabel ? 'питання: ' + extraLabel : 'питання';
  return 'звернення';
}

function isClientOfCoach(viewer, coachChatId) {
  if (!viewer || !coachChatId) return false;
  return String(viewer.coachId || '') === String(coachChatId);
}

function isOwnCard(viewerChatId, coachChatId) {
  return String(viewerChatId) === String(coachChatId);
}

async function showAskMenu(chatId, coachChatId) {
  const cid = String(coachChatId || '').trim();
  if (!cid) return;
  const viewer = await User.getByChatId(chatId);
  const coach = await User.getByChatId(cid);
  if (!coach || coach.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Тренера не знайдено.');
    return;
  }
  if (isOwnCard(chatId, cid)) {
    await Helpers.safeSend(chatId, 'Це твоя картка.');
    return;
  }
  if (isClientOfCoach(viewer, cid)) {
    await Helpers.safeSend(
      chatId,
      'Ти вже клієнт цього тренера. Питання можна ставити через меню «Мій тренер» або розклад.'
    );
    return;
  }
  const open = await supabase.getOpenCoachInquiry(chatId, cid);
  if (open) {
    await Helpers.sendKeyboard(
      chatId,
      '⏳ У тебе вже є відкрите звернення до цього тренера.\n' +
        'Нове можна надіслати після відповіді тренера.\n\nТема: ' +
        kindLabel(open.kind, open.labelUa || open.questionText),
      [
        [{ text: '⬅️ До картки тренера', callback_data: CONSTANTS.CALLBACKS.CI_BACK_CARD }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    await State.update(chatId, { inquiryCoachId: cid, step: null });
    return;
  }

  await State.update(chatId, { inquiryCoachId: cid, step: null });
  const types = CoachOffer.normalizeTrainingTypes(coach.coachTrainingTypes);
  const modes = CoachOffer.normalizeServiceModes(coach.coachServiceModes);
  const hasOffline = modes.includes(CONSTANTS.COACH_SERVICE_MODES.OFFLINE) || types.length > 0;
  const keyboard = [];
  if (hasOffline) {
    keyboard.push([{ text: '🏋️ Хочу на тренування в клуб', callback_data: CONSTANTS.CALLBACKS.CI_CLUB }]);
  }
  if (modes.includes(CONSTANTS.COACH_SERVICE_MODES.ONLINE)) {
    keyboard.push([{ text: '💻 Хочу онлайн-тренування', callback_data: CONSTANTS.CALLBACKS.CI_ON }]);
  }
  if (modes.includes(CONSTANTS.COACH_SERVICE_MODES.PROGRAMS)) {
    keyboard.push([{ text: '📋 Хочу програму тренувань', callback_data: CONSTANTS.CALLBACKS.CI_PROG }]);
  }
  if (modes.includes(CONSTANTS.COACH_SERVICE_MODES.NUTRITION)) {
    keyboard.push([{ text: '🥗 Хочу програму харчування', callback_data: CONSTANTS.CALLBACKS.CI_NUT }]);
  }
  keyboard.push([{ text: '❓ Задати питання', callback_data: CONSTANTS.CALLBACKS.CI_Q }]);
  keyboard.push([{ text: '⬅️ До картки тренера', callback_data: CONSTANTS.CALLBACKS.CI_BACK_CARD }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await Helpers.sendKeyboard(
    chatId,
    '💬 Звернення до тренера ' +
      displayName(coach) +
      '\n\nОбери тему — тренер отримає повідомлення і зможе відповісти:',
    keyboard
  );
}

async function showClubSubmenu(chatId) {
  const st = await State.get(chatId);
  const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
  if (!cid) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку тренера.');
    return;
  }
  const coach = await User.getByChatId(cid);
  const types = CoachOffer.normalizeTrainingTypes(coach && coach.coachTrainingTypes);
  const keyboard = [];
  if (types.includes(CoachOffer.TRAINING_KEYS.GROUP)) {
    keyboard.push([{ text: '👥 Групове заняття', callback_data: CONSTANTS.CALLBACKS.CI_CLUB_G }]);
  }
  if (types.includes(CoachOffer.TRAINING_KEYS.PERSONAL)) {
    keyboard.push([{ text: '👤 Індивідуальне', callback_data: CONSTANTS.CALLBACKS.CI_CLUB_P }]);
  }
  if (types.includes(CoachOffer.TRAINING_KEYS.SPLIT)) {
    keyboard.push([{ text: '👥 Спліт (2 особи)', callback_data: CONSTANTS.CALLBACKS.CI_CLUB_S }]);
  }
  if (types.includes(CoachOffer.TRAINING_KEYS.TRIO)) {
    keyboard.push([{ text: '👥 Тріо (3 особи)', callback_data: CONSTANTS.CALLBACKS.CI_CLUB_T }]);
  }
  if (!keyboard.length) {
    await Helpers.safeSend(chatId, 'У тренера поки не вказані формати офлайн-тренувань.');
    await showAskMenu(chatId, cid);
    return;
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.CI_ASK + ':' + cid }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '🏋️ Тренування в клубі\n\nОбери формат:', keyboard);
}

async function showGroupClassPick(chatId) {
  const st = await State.get(chatId);
  const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
  if (!cid) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку тренера.');
    return;
  }
  // Активні неархівовані; пріоритет опублікованих на картці клубу
  const allActive = (await supabase.listCoachGroupClasses(cid, null, { activeOnly: true })).filter(
    (g) => g && !g.isArchived
  );
  const published = allActive.filter((g) => g.moderationStatus === 'published');
  const visible = published.length ? published : allActive;
  if (!visible.length) {
    await Helpers.safeSend(chatId, 'У тренера поки немає групових занять у каталозі.');
    await showClubSubmenu(chatId);
    return;
  }
  if (visible.length === 1) {
    await submitInquiry(chatId, KIND.CLUB_GROUP, {
      labelUa: visible[0].labelUa || visible[0].groupClassCode,
      groupClassCode: visible[0].groupClassCode
    });
    return;
  }
  const keyboard = visible.slice(0, 20).map((g) => {
    const title = String(g.labelUa || g.groupClassCode || 'Групове').slice(0, 48);
    return [{ text: '👥 ' + title, callback_data: CONSTANTS.CALLBACKS.CI_GRP + ':' + g.groupClassCode }];
  });
  keyboard.push([{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.CI_CLUB }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '👥 Групові заняття\n\nОбери заняття:', keyboard);
}

function buildAutoReplyText(coach, fromUser) {
  const v = coachGenderVerb(coach);
  const fromName = firstNameOf(fromUser);
  const coachName = displayName(coach);
  return (
    'Вітаю, ' +
    fromName +
    ', я ' +
    v.got +
    ' ваш запит. У найближчий вільний час я ' +
    v.link +
    ' з вами.\nЗ повагою, ' +
    coachName
  );
}

async function submitInquiry(chatId, kind, opts = {}) {
  const st = await State.get(chatId);
  const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
  if (!cid) {
    await Helpers.safeSend(chatId, '⚠️ Контекст тренера втрачено. Відкрий картку ще раз.');
    return;
  }
  const open = await supabase.getOpenCoachInquiry(chatId, cid);
  if (open) {
    await showAskMenu(chatId, cid);
    return;
  }
  const fromUser = await User.getByChatId(chatId);
  const coach = await User.getByChatId(cid);
  if (!coach) {
    await Helpers.safeSend(chatId, '❌ Тренера не знайдено.');
    return;
  }
  const labelUa = opts.labelUa != null ? String(opts.labelUa) : null;
  const questionText = opts.questionText != null ? String(opts.questionText) : null;
  const inquiry = await supabase.insertCoachInquiry({
    coachChatId: cid,
    fromChatId: chatId,
    kind,
    labelUa,
    questionText,
    groupClassCode: opts.groupClassCode || null
  });
  if (!inquiry) {
    await Helpers.safeSend(
      chatId,
      '❌ Не вдалося надіслати звернення. Можливо, ще не застосовано міграцію coach_inquiries у Supabase.'
    );
    return;
  }
  await State.update(chatId, { step: null });

  const topic = kindLabel(kind, labelUa || questionText);
  const fromName = displayName(fromUser);
  const coachMsg =
    '📩 Нове звернення\n\n' +
    fromName +
    ' хоче: ' +
    topic +
    '\n\nchat_id: ' +
    chatId;

  await Helpers.sendKeyboard(cid, coachMsg, [
    [{ text: '✍️ Відповісти', callback_data: CONSTANTS.CALLBACKS.CI_REPLY + ':' + inquiry.id }],
    [{ text: '👤 Профіль клієнта', callback_data: CONSTANTS.CALLBACKS.CI_PROF + ':' + chatId }]
  ]);

  if (coach.coachInquiryAutoReply !== false) {
    try {
      await Helpers.safeSend(chatId, buildAutoReplyText(coach, fromUser));
    } catch (_) {}
  }

  await Helpers.sendKeyboard(
    chatId,
    '✅ Звернення надіслано тренеру.\nТема: ' + topic + '\n\nОчікуй відповіді в цьому чаті.',
    [
      [{ text: '⬅️ До картки тренера', callback_data: CONSTANTS.CALLBACKS.CI_BACK_CARD }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
}

async function startQuestionInput(chatId) {
  const st = await State.get(chatId);
  const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
  if (!cid) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку відкрий картку тренера.');
    return;
  }
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.CI_QUESTION_INPUT, inquiryCoachId: cid });
  await Helpers.sendKeyboard(
    chatId,
    '✍️ Напиши своє питання одним повідомленням (до 1000 символів):',
    [
      [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.CI_ASK + ':' + cid }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
}

async function startCoachReply(coachChatId, inquiryId) {
  const inquiry = await supabase.getCoachInquiryById(inquiryId);
  if (!inquiry || String(inquiry.coachChatId) !== String(coachChatId)) {
    await Helpers.safeSend(coachChatId, '❌ Звернення не знайдено.');
    return;
  }
  if (inquiry.status !== 'open') {
    await Helpers.safeSend(coachChatId, 'Це звернення вже закрито (відповідь надіслана).');
    return;
  }
  const fromUser = await User.getByChatId(inquiry.fromChatId);
  const topic = kindLabel(inquiry.kind, inquiry.labelUa || inquiry.questionText);
  const prefix =
    'Вітаю, ' + firstNameOf(fromUser) + ', ви запитували — ' + topic + ', ';
  await State.update(coachChatId, {
    step: CONSTANTS.FSM_STATES.CI_REPLY_INPUT,
    inquiryReplyId: inquiry.id,
    inquiryReplyPrefix: prefix
  });
  await Helpers.safeSend(
    coachChatId,
    '✍️ Відповідь почнеться так:\n\n' +
      prefix +
      '…\n\nНапиши продовження відповіді (текст після коми). Надішли повідомленням.'
  );
}

async function showInquiryUserProfile(coachChatId, fromChatId) {
  const u = await User.getByChatId(fromChatId);
  const name = displayName(u);
  const city = (u && u.city) || 'не вказано';
  const role = (u && u.role) || '—';
  const tg =
    u && u.telegramUsername
      ? '@' + String(u.telegramUsername).replace(/^@/, '')
      : 'немає';
  let text =
    '👤 Профіль звернення\n\n' +
    'Імʼя: ' +
    name +
    '\nМісто: ' +
    city +
    '\nРоль: ' +
    role +
    '\nTelegram: ' +
    tg +
    '\nchat_id: ' +
    fromChatId +
    '\n\n';
  if (!u) {
    text += 'Користувач ще без повної анкети в платформі (або дані недоступні).';
  } else if (String(u.coachId || '') === String(coachChatId)) {
    text += 'Вже твій клієнт.';
  } else {
    text += 'Ще не клієнт цього тренера.';
  }
  const keyboard = [];
  const contact = Helpers.telegramContactButton('💬 Написати в Telegram', u || { chatId: fromChatId });
  if (contact) keyboard.push([contact]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(coachChatId, text, keyboard);
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;

  if (state.step === CONSTANTS.FSM_STATES.CI_QUESTION_INPUT) {
    const q = String(text || '').trim();
    if (q.length < 3) {
      await Helpers.safeSend(chatId, '⚠️ Питання занадто коротке (мін. 3 символи).');
      return true;
    }
    if (q.length > 1000) {
      await Helpers.safeSend(chatId, '⚠️ Максимум 1000 символів.');
      return true;
    }
    await submitInquiry(chatId, KIND.QUESTION, { questionText: q, labelUa: q.slice(0, 120) });
    return true;
  }

  if (state.step === CONSTANTS.FSM_STATES.CI_REPLY_INPUT) {
    const body = String(text || '').trim();
    if (body.length < 1) {
      await Helpers.safeSend(chatId, '⚠️ Введи текст відповіді.');
      return true;
    }
    const inquiryId = state.inquiryReplyId ? String(state.inquiryReplyId) : '';
    const prefix = state.inquiryReplyPrefix ? String(state.inquiryReplyPrefix) : 'Вітаю, ';
    const inquiry = await supabase.getCoachInquiryById(inquiryId);
    if (!inquiry || String(inquiry.coachChatId) !== String(chatId)) {
      await State.update(chatId, { step: null, inquiryReplyId: null, inquiryReplyPrefix: null });
      await Helpers.safeSend(chatId, '❌ Звернення не знайдено.');
      return true;
    }
    if (inquiry.status !== 'open') {
      await State.update(chatId, { step: null, inquiryReplyId: null, inquiryReplyPrefix: null });
      await Helpers.safeSend(chatId, 'Це звернення вже закрито.');
      return true;
    }
    const full = prefix + body;
    try {
      await Helpers.safeSend(inquiry.fromChatId, full);
    } catch (e) {
      await Helpers.safeSend(
        chatId,
        '❌ Не вдалося доставити відповідь користувачу (можливо, треба /start у боті).'
      );
      return true;
    }
    await supabase.markCoachInquiryAnswered(inquiry.id);
    await State.update(chatId, { step: null, inquiryReplyId: null, inquiryReplyPrefix: null });
    await Helpers.safeSend(chatId, '✅ Відповідь надіслано. Звернення закрито.');
    return true;
  }

  return false;
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = (parts[0] || '').trim();
  const param = parts.slice(1).join(':').trim();
  const CB = CONSTANTS.CALLBACKS;

  if (action === CB.CI_ASK) {
    await showAskMenu(chatId, param || ((await State.get(chatId)) || {}).inquiryCoachId);
    return true;
  }
  if (action === CB.CI_BACK_CARD) {
    const st = await State.get(chatId);
    const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
    if (!cid) {
      await Helpers.safeSend(chatId, '⚠️ Картку не знайдено.');
      return true;
    }
    const Coach = require('./coach');
    await Coach.showPublicVenueCoachCard(chatId, cid);
    return true;
  }
  if (action === CB.CI_CLUB) {
    await showClubSubmenu(chatId);
    return true;
  }
  if (action === CB.CI_CLUB_P) {
    await submitInquiry(chatId, KIND.CLUB_PERSONAL);
    return true;
  }
  if (action === CB.CI_CLUB_S) {
    await submitInquiry(chatId, KIND.CLUB_SPLIT);
    return true;
  }
  if (action === CB.CI_CLUB_T) {
    await submitInquiry(chatId, KIND.CLUB_TRIO);
    return true;
  }
  if (action === CB.CI_CLUB_G) {
    await showGroupClassPick(chatId);
    return true;
  }
  if (action === CB.CI_GRP && param) {
    const st = await State.get(chatId);
    const cid = st && st.inquiryCoachId ? String(st.inquiryCoachId) : '';
    let label = param;
    if (cid) {
      const all = await supabase.listCoachGroupClasses(cid, null);
      const found = (all || []).find((g) => String(g.groupClassCode) === String(param));
      if (found) label = found.labelUa || found.groupClassCode;
    }
    await submitInquiry(chatId, KIND.CLUB_GROUP, { labelUa: label, groupClassCode: param });
    return true;
  }
  if (action === CB.CI_ON) {
    await submitInquiry(chatId, KIND.ONLINE);
    return true;
  }
  if (action === CB.CI_PROG) {
    await submitInquiry(chatId, KIND.PROGRAMS);
    return true;
  }
  if (action === CB.CI_NUT) {
    await submitInquiry(chatId, KIND.NUTRITION);
    return true;
  }
  if (action === CB.CI_Q) {
    await startQuestionInput(chatId);
    return true;
  }
  if (action === CB.CI_REPLY && param) {
    await startCoachReply(chatId, param);
    return true;
  }
  if (action === CB.CI_PROF && param) {
    await showInquiryUserProfile(chatId, param);
    return true;
  }
  if (action === CB.CI_AUTO_TOGGLE) {
    const user = await User.getByChatId(chatId);
    if (!user || user.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '❌ Лише для тренера.');
      return true;
    }
    const next = user.coachInquiryAutoReply === false;
    await supabase.updateUser(chatId, { coachInquiryAutoReply: next });
    await Helpers.safeSend(
      chatId,
      next
        ? '✅ Автовідповідь на звернення увімкнено.'
        : '✅ Автовідповідь на звернення вимкнено.'
    );
    const Profile = require('./profile');
    if (typeof Profile.showPublicDataHub === 'function') {
      await Profile.showPublicDataHub(chatId);
    }
    return true;
  }

  return false;
}

/** Cron: нагадування тренеру про open звернення старше 8 год. */
async function sendInquiryReminders() {
  const list = await supabase.listOpenCoachInquiriesDueForReminder(REMINDER_HOURS, 50);
  let sent = 0;
  for (const inq of list) {
    const fromUser = await User.getByChatId(inq.fromChatId);
    const topic = kindLabel(inq.kind, inq.labelUa || inq.questionText);
    const text =
      '⏰ Нагадування: є невідповідне звернення (понад ' +
      REMINDER_HOURS +
      ' год)\n\n' +
      displayName(fromUser) +
      ' — ' +
      topic;
    try {
      await Helpers.sendKeyboard(inq.coachChatId, text, [
        [{ text: '✍️ Відповісти', callback_data: CONSTANTS.CALLBACKS.CI_REPLY + ':' + inq.id }],
        [{ text: '👤 Профіль', callback_data: CONSTANTS.CALLBACKS.CI_PROF + ':' + inq.fromChatId }]
      ]);
      await supabase.markCoachInquiryReminderSent(inq.id);
      sent += 1;
    } catch (e) {
      console.error('coachInquiry reminder', inq.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return { checked: list.length, sent };
}

module.exports = {
  KIND,
  REMINDER_HOURS,
  showAskMenu,
  handleCallback,
  handleTextMessage,
  sendInquiryReminders,
  kindLabel,
  isClientOfCoach
};
