/**
 * Відгуки тренер ↔ клієнт (дзеркально): зірки 1–5 + текст.
 * Поріг: ≥ 3 COMPLETED-сесій у workout_schedule між парою.
 * Публікація після модерації адміном. Публічна картка клієнта (PVST / pvst_).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

const MIN_SESSIONS = 3;
const BODY_MIN = 10;
const BODY_MAX = 800;

function stars(n) {
  const r = Math.max(1, Math.min(5, parseInt(n, 10) || 0));
  return '⭐'.repeat(r);
}

function displayName(user) {
  if (!user) return 'Користувач';
  return ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || 'Користувач';
}

function coachStudentPair(author, target) {
  if (!author || !target) return null;
  const aRole = String(author.role || '').toLowerCase();
  const tRole = String(target.role || '').toLowerCase();
  if (aRole === CONSTANTS.ROLES.STUDENT && tRole === CONSTANTS.ROLES.COACH) {
    return { coachId: String(target.chatId), studentId: String(author.chatId) };
  }
  if (aRole === CONSTANTS.ROLES.COACH && tRole === CONSTANTS.ROLES.STUDENT) {
    return { coachId: String(author.chatId), studentId: String(target.chatId) };
  }
  return null;
}

/** Чи автор зараз може писати/редагувати відгук про ціль (поточний звʼязок + ≥3 тренування). */
async function canWriteReview(authorChatId, targetChatId) {
  const author = await User.getByChatId(authorChatId);
  const target = await User.getByChatId(targetChatId);
  if (!author || !target) {
    return { ok: false, reason: 'not_found', sessions: 0 };
  }
  if (String(author.chatId) === String(target.chatId)) {
    return { ok: false, reason: 'self', sessions: 0 };
  }
  const pair = coachStudentPair(author, target);
  if (!pair) {
    return { ok: false, reason: 'roles', sessions: 0 };
  }
  const student = String(author.role).toLowerCase() === CONSTANTS.ROLES.STUDENT ? author : target;
  if (String(student.coachId || '') !== pair.coachId) {
    return { ok: false, reason: 'not_linked', sessions: 0 };
  }
  const sessions = await supabase.countCompletedSessionsBetween(pair.coachId, pair.studentId);
  if (sessions < MIN_SESSIONS) {
    return { ok: false, reason: 'sessions', sessions };
  }
  return { ok: true, reason: null, sessions };
}

function formatStatsLine(stats) {
  if (!stats || !stats.count) return '⭐ Відгуків ще немає';
  return '⭐ ' + stats.avg + ' / 5 · ' + stats.count + ' відгук' + (stats.count === 1 ? '' : stats.count < 5 ? 'и' : 'ів');
}

async function appendReviewsSummaryHtml(targetChatId) {
  const stats = await supabase.getPublishedReviewStats(targetChatId);
  return '\n' + formatStatsLine(stats) + '\n';
}

async function notifyAdminNewReview(review) {
  const adminId = process.env.ADMIN_CHAT_ID != null ? String(process.env.ADMIN_CHAT_ID).trim() : '';
  if (!adminId || !review) return;
  try {
    const AdminTelegram = require('./adminTelegram');
    const author = await User.getByChatId(review.authorChatId);
    const target = await User.getByChatId(review.targetChatId);
    const text =
      '⭐ Новий відгук на модерації\n\n' +
      'Від: ' +
      displayName(author) +
      ' (' +
      review.authorChatId +
      ')\n' +
      'Про: ' +
      displayName(target) +
      ' (' +
      review.targetChatId +
      ')\n' +
      stars(review.rating) +
      ' (' +
      review.rating +
      ')\n\n' +
      String(review.body || '').slice(0, 400);
    await AdminTelegram.sendKeyboard(adminId, text, [
      [{ text: '✅ Схвалити', callback_data: 'ADM_REV_OK:' + review.id }],
      [{ text: '❌ Відхилити', callback_data: 'ADM_REV_NO:' + review.id }],
      [{ text: '📋 Черга відгуків', callback_data: 'ADM_REV' }]
    ]);
  } catch (e) {
    console.error('Reviews.notifyAdminNewReview', e.message);
  }
}

async function startWriteReview(chatId, targetChatId) {
  const targetId = String(targetChatId || '').trim();
  if (!targetId) return;
  const check = await canWriteReview(chatId, targetId);
  if (!check.ok) {
    let msg = '❌ Залишити відгук зараз не можна.';
    if (check.reason === 'sessions') {
      msg =
        '⏳ Відгук доступний після щонайменше ' +
        MIN_SESSIONS +
        ' спільних тренувань на MAYAG Fit.\n\nЗараз: ' +
        check.sessions +
        ' з ' +
        MIN_SESSIONS +
        '.';
    } else if (check.reason === 'not_linked') {
      msg = '❌ Відгук можна залишити лише про свого поточного тренера / свого клієнта.';
    } else if (check.reason === 'roles') {
      msg = '❌ Відгуки лише між тренером і його клієнтом.';
    }
    await Helpers.safeSend(chatId, msg);
    return;
  }
  const target = await User.getByChatId(targetId);
  const existing = await supabase.getReviewByAuthorAndTarget(chatId, targetId);
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.REVIEW_RATING,
    reviewTargetId: targetId
  });
  let text =
    '⭐ Відгук про: ' +
    displayName(target) +
    '\n\nОбери оцінку від 1 до 5:';
  if (existing) {
    text +=
      '\n\nУ тебе вже є відгук (' +
      stars(existing.rating) +
      ', статус: ' +
      (existing.status === 'published' ? 'опубліковано' : existing.status === 'pending' ? 'на модерації' : 'відхилено') +
      '). Нова версія знову піде на модерацію.';
  }
  const keyboard = [
    [
      { text: '1⭐', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_RATE + ':1' },
      { text: '2⭐', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_RATE + ':2' },
      { text: '3⭐', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_RATE + ':3' },
      { text: '4⭐', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_RATE + ':4' },
      { text: '5⭐', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_RATE + ':5' }
    ],
    [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askReviewText(chatId, rating) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.REVIEW_RATING || !state.reviewTargetId) {
    await Helpers.safeSend(chatId, '⚠️ Сесія відгуку закінчилась. Відкрий картку ще раз.');
    return;
  }
  const r = parseInt(rating, 10);
  if (!(r >= 1 && r <= 5)) {
    await Helpers.safeSend(chatId, 'Обери оцінку кнопкою 1–5.');
    return;
  }
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.REVIEW_TEXT,
    reviewTargetId: state.reviewTargetId,
    reviewRating: r
  });
  await Helpers.sendKeyboard(
    chatId,
    stars(r) +
      '\n\nНапиши текст відгуку (від ' +
      BODY_MIN +
      ' до ' +
      BODY_MAX +
      ' символів):',
    [[{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]]
  );
}

async function submitReviewText(chatId, text) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.REVIEW_TEXT || !state.reviewTargetId) {
    return false;
  }
  const body = String(text || '').trim();
  if (body.length < BODY_MIN) {
    await Helpers.safeSend(chatId, 'Текст закороткий. Мінімум ' + BODY_MIN + ' символів.');
    return true;
  }
  if (body.length > BODY_MAX) {
    await Helpers.safeSend(chatId, 'Текст задовгий. Максимум ' + BODY_MAX + ' символів.');
    return true;
  }
  const check = await canWriteReview(chatId, state.reviewTargetId);
  if (!check.ok) {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Умови для відгуку більше не виконуються.');
    return true;
  }
  const rating = state.reviewRating;
  const review = await supabase.upsertUserReview(chatId, state.reviewTargetId, rating, body);
  await State.clear(chatId);
  if (!review) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти відгук. Спробуй пізніше.');
    return true;
  }
  await notifyAdminNewReview(review);
  await Helpers.safeSend(
    chatId,
    '✅ Відгук надіслано на модерацію.\n\nПісля схвалення адміном він зʼявиться на публічній картці.'
  );
  return true;
}

async function showReviewsList(viewerChatId, targetChatId) {
  const targetId = String(targetChatId || '').trim();
  const target = await User.getByChatId(targetId);
  if (!target) {
    await Helpers.safeSend(viewerChatId, '❌ Користувача не знайдено.');
    return;
  }
  const stats = await supabase.getPublishedReviewStats(targetId);
  const list = await supabase.getPublishedReviewsForTarget(targetId, 20);
  let text =
    '⭐ Відгуки: ' +
    Helpers.escapeHtml(displayName(target)) +
    '\n\n' +
    formatStatsLine(stats) +
    '\n';
  if (!list.length) {
    text += '\nПоки немає опублікованих відгуків.';
  } else {
    for (const rev of list) {
      const author = await User.getByChatId(rev.authorChatId);
      text +=
        '\n———\n' +
        stars(rev.rating) +
        ' · ' +
        Helpers.escapeHtml(displayName(author)) +
        '\n' +
        Helpers.escapeHtml(String(rev.body || '').slice(0, 400)) +
        '\n';
    }
  }
  const keyboard = [];
  const check = await canWriteReview(viewerChatId, targetId);
  if (check.ok) {
    keyboard.push([
      { text: '✍️ Залишити / оновити відгук', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_WRITE + ':' + targetId }
    ]);
  }
  const tRole = String(target.role || '').toLowerCase();
  const isSelf = String(viewerChatId) === String(targetId);
  if (isSelf) {
    if (tRole === CONSTANTS.ROLES.STUDENT) {
      keyboard.push([{ text: '👁 Моя публічна картка', callback_data: CONSTANTS.CALLBACKS.REV_MY_PUBLIC }]);
    } else if (tRole === CONSTANTS.ROLES.COACH) {
      keyboard.push([{ text: '👁 Моя публічна картка', callback_data: CONSTANTS.CALLBACKS.HINTS_PUBLIC_PREVIEW }]);
    }
    keyboard.push([{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  } else if (tRole === CONSTANTS.ROLES.COACH) {
    keyboard.push([{ text: '👤 До картки тренера', callback_data: CONSTANTS.CALLBACK_PREFIXES.PVCH + ':' + targetId }]);
  } else if (tRole === CONSTANTS.ROLES.STUDENT) {
    keyboard.push([{ text: '👤 До публічної картки', callback_data: CONSTANTS.CALLBACK_PREFIXES.PVST + ':' + targetId }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(viewerChatId, text, keyboard, { parse_mode: 'HTML' });
}

async function showMyReceivedReviews(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  await showReviewsList(chatId, chatId);
}

/**
 * Публічна картка клієнта (безпечні поля + відгуки).
 * @param {{ preview?: boolean }} options
 */
async function sendStudentPublicProfileCard(viewerChatId, studentChatId, options = {}) {
  const preview = options.preview === true;
  const sid = String(studentChatId || '').trim();
  const student = await User.getByChatId(sid);
  if (!student || String(student.role || '').toLowerCase() !== CONSTANTS.ROLES.STUDENT) {
    await Helpers.safeSend(viewerChatId, '❌ Клієнта не знайдено.');
    return;
  }
  if (String(sid).indexOf('INVITE_') === 0) {
    await Helpers.safeSend(viewerChatId, '❌ Публічна картка ще недоступна.');
    return;
  }
  const name = displayName(student);
  const coach = student.coachId ? await User.getByChatId(student.coachId) : null;
  const experienceLabel = Helpers.getExperienceStatusLabel(student);
  let text =
    '👤 <b>' +
    Helpers.escapeHtml(name) +
    '</b>\n\n' +
    '🏙 Місто: ' +
    Helpers.escapeHtml(student.city || 'не вказано') +
    '\n' +
    '📅 Досвід: ' +
    Helpers.escapeHtml(experienceLabel) +
    '\n';
  if (coach) {
    text += '👨‍🏫 Тренер: ' + Helpers.escapeHtml(displayName(coach)) + '\n';
  }
  text += await appendReviewsSummaryHtml(sid);

  if (preview) {
    text =
      '👁 <b>Попередній перегляд публічної картки</b>\n\n' +
      '<i>Так бачать інші користувачі платформи:</i>\n\n' +
      text;
    const link = Helpers.publicStudentPageLink(sid);
    if (link) {
      text += '\n🔗 Посилання:\n' + Helpers.escapeHtml(link) + '\n';
    }
  }

  const keyboard = [];
  if (!preview) {
    keyboard.push([
      { text: '⭐ Відгуки', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_LIST + ':' + sid }
    ]);
    const check = await canWriteReview(viewerChatId, sid);
    if (check.ok) {
      keyboard.push([
        { text: '✍️ Залишити відгук', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_WRITE + ':' + sid }
      ]);
    }
    if (coach) {
      keyboard.push([
        { text: '👨‍🏫 Картка тренера', callback_data: CONSTANTS.CALLBACK_PREFIXES.PVCH + ':' + String(coach.chatId) }
      ]);
    }
    const studentTgBtn = Helpers.telegramContactButton('💬 Написати в Telegram', student);
    if (studentTgBtn && String(viewerChatId) !== sid) keyboard.push([studentTgBtn]);
  } else {
    keyboard.push([{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(viewerChatId, text, keyboard, { parse_mode: 'HTML' });
}

async function showMyPublicStudentCard(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me || String(me.role || '').toLowerCase() !== CONSTANTS.ROLES.STUDENT) {
    await Helpers.safeSend(chatId, '👁 Публічна картка клієнта доступна в ролі користувача.');
    return;
  }
  await sendStudentPublicProfileCard(chatId, chatId, { preview: true });
}

async function askUserSearch(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.REVIEW_USER_SEARCH });
  await Helpers.sendKeyboard(
    chatId,
    '🔍 Пошук публічної картки клієнта\n\nВведи імʼя або прізвище (мін. 2 літери):',
    [[{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]]
  );
}

async function handleUserSearchText(chatId, text) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.REVIEW_USER_SEARCH) return false;
  const q = String(text || '').trim();
  if (q.length < 2) {
    await Helpers.safeSend(chatId, 'Введи щонайменше 2 символи.');
    return true;
  }
  const rows = await supabase.searchStudentsByName(q, 12);
  await State.clear(chatId);
  if (!rows.length) {
    await Helpers.sendKeyboard(
      chatId,
      'Нікого не знайдено за «' + q + '».',
      [
        [{ text: '🔍 Шукати ще', callback_data: CONSTANTS.CALLBACKS.REV_SEARCH }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return true;
  }
  const keyboard = rows.map((u) => {
    let label = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.chatId;
    if (u.city) label += ' · ' + u.city;
    if (label.length > 64) label = label.slice(0, 61) + '…';
    return [{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PVST + ':' + u.chatId }];
  });
  keyboard.push([{ text: '🔍 Шукати ще', callback_data: CONSTANTS.CALLBACKS.REV_SEARCH }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, 'Знайдено ' + rows.length + ':', keyboard);
  return true;
}

/** Кнопки відгуків для публічної картки тренера. */
async function reviewButtonsForTarget(viewerChatId, targetChatId, opts = {}) {
  const tid = String(targetChatId || '').trim();
  const rows = [];
  rows.push([{ text: '⭐ Відгуки', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_LIST + ':' + tid }]);
  if (!opts.preview) {
    const check = await canWriteReview(viewerChatId, tid);
    if (check.ok) {
      rows.push([
        { text: '✍️ Залишити відгук', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_WRITE + ':' + tid }
      ]);
    }
  }
  return rows;
}

async function handleCallback(chatId, callbackData) {
  const parts = String(callbackData || '').split(':');
  const action = parts[0];
  const param = parts.slice(1).join(':');

  if (action === CONSTANTS.CALLBACKS.REV_MY) {
    await showMyReceivedReviews(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REV_MY_PUBLIC) {
    await showMyPublicStudentCard(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REV_SEARCH) {
    await askUserSearch(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PVST && param) {
    await sendStudentPublicProfileCard(chatId, param.trim(), { preview: false });
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REV_WRITE && param) {
    await startWriteReview(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REV_RATE && param) {
    await askReviewText(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.REV_LIST && param) {
    await showReviewsList(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.CANCEL_ACTION) {
    const st = await State.get(chatId);
    if (
      st &&
      (st.step === CONSTANTS.FSM_STATES.REVIEW_RATING ||
        st.step === CONSTANTS.FSM_STATES.REVIEW_TEXT ||
        st.step === CONSTANTS.FSM_STATES.REVIEW_USER_SEARCH)
    ) {
      await State.clear(chatId);
      const Menu = require('./menu');
      await Menu.show(chatId);
      return true;
    }
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  if (state.step === CONSTANTS.FSM_STATES.REVIEW_TEXT) {
    return submitReviewText(chatId, text);
  }
  if (state.step === CONSTANTS.FSM_STATES.REVIEW_USER_SEARCH) {
    return handleUserSearchText(chatId, text);
  }
  return false;
}

module.exports = {
  MIN_SESSIONS,
  canWriteReview,
  appendReviewsSummaryHtml,
  reviewButtonsForTarget,
  startWriteReview,
  showReviewsList,
  showMyReceivedReviews,
  sendStudentPublicProfileCard,
  showMyPublicStudentCard,
  handleCallback,
  handleTextMessage
};
