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

/** Публічна картка клієнта: імʼя + ініціал прізвища (Марія К.). */
function publicStudentDisplayName(user) {
  if (!user) return 'Користувач';
  const first = String(user.firstName || '').trim();
  const last = String(user.lastName || '').trim();
  if (!first && !last) return 'Користувач';
  if (!last) return first;
  const initial = last.charAt(0).toLocaleUpperCase('uk-UA');
  return (first + ' ' + initial + '.').trim();
}

function formatPublicClientServiceModes(modes) {
  const M = CONSTANTS.CLIENT_SERVICE_MODES;
  const list = Array.isArray(modes) ? modes.map((x) => String(x)) : [];
  const hasOff = list.includes(M.OFFLINE);
  const hasOn = list.includes(M.ONLINE);
  if (hasOff && hasOn) return 'Офлайн і онлайн';
  if (hasOff) return 'Офлайн';
  if (hasOn) return 'Онлайн';
  return '';
}

function formatPublicGenderLabel(gender) {
  const g = String(gender || '').toLowerCase();
  if (g === CONSTANTS.GENDERS.MALE) return 'Чоловік';
  if (g === CONSTANTS.GENDERS.FEMALE) return 'Жінка';
  return '';
}

function resolvePublicAge(student) {
  if (!student) return null;
  if (student.age != null && !isNaN(Number(student.age))) {
    const n = Math.round(Number(student.age));
    if (n >= 1 && n <= 120) return n;
  }
  if (student.birthDate) {
    const n = User.calculateAge(student.birthDate);
    if (n != null && n >= 1 && n <= 120) return n;
  }
  return null;
}

async function resolvePublicStudentClub(studentChatId) {
  const venues = (await supabase.getUserVenues(studentChatId)) || [];
  if (!venues.length) return null;
  return venues.find((v) => v && v.isPrimary) || venues[0] || null;
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

function formatReviewDate(rev) {
  const raw =
    rev && rev.status === 'published' && rev.moderatedAt
      ? rev.moderatedAt
      : rev && (rev.createdAt || rev.updatedAt);
  if (!raw) return '—';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function reviewStatusLabel(status) {
  const s = String(status || '');
  if (s === 'published') return 'Опубліковано';
  if (s === 'rejected') return 'Відхилено';
  return 'На модерації';
}

function isInviteUser(userOrId) {
  if (userOrId == null) return false;
  if (typeof userOrId === 'string' || typeof userOrId === 'number') {
    return String(userOrId).indexOf('INVITE_') === 0;
  }
  const chatId = userOrId.chatId != null ? String(userOrId.chatId) : '';
  const userId = userOrId.userId != null ? String(userOrId.userId) : '';
  return chatId.indexOf('INVITE_') === 0 || userId.indexOf('INVITE_') === 0;
}

async function sendInviteNotActivatedNotice(chatId, studentChatId, kind) {
  const sid = String(studentChatId || '').trim();
  const about =
    kind === 'public'
      ? 'Публічна картка зʼявиться після того, як клієнт відкриє інвайт і завершить реєстрацію в боті.'
      : 'Залишити відгук можна після того, як клієнт відкриє інвайт і завершить реєстрацію в боті.';
  await Helpers.sendKeyboard(
    chatId,
    '⏳ Інвайт ще не активовано.\n\n' + about,
    [
      [{ text: '🔙 До картки клієнта', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + sid }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
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
  const targetEarly = await User.getByChatId(targetId);
  if (isInviteUser(targetId) || isInviteUser(targetEarly)) {
    await sendInviteNotActivatedNotice(chatId, targetId, 'review');
    return;
  }
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
    await Helpers.sendKeyboard(chatId, msg, [
      [{ text: '⭐ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]);
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
  await Helpers.sendKeyboard(
    chatId,
    '✅ Відгук надіслано на модерацію.\n\nПісля схвалення адміном він зʼявиться на публічній картці, а отримувач отримає сповіщення.',
    [
      [{ text: '⭐ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ]
  );
  return true;
}

async function showReviewsHub(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const stats = await supabase.getPublishedReviewStats(chatId);
  const role = String(me.role || '').toLowerCase();
  const writeLabel =
    role === CONSTANTS.ROLES.COACH ? '✍️ Залишити відгук про клієнта' : '✍️ Залишити відгук про тренера';
  const keyboard = [
    [{ text: '⭐ Відгуки про мене', callback_data: CONSTANTS.CALLBACKS.REV_ABOUT }],
    [{ text: '📝 Мої відгуки', callback_data: CONSTANTS.CALLBACKS.REV_AUTHORED }],
    [{ text: writeLabel, callback_data: CONSTANTS.CALLBACKS.REV_WRITE_MENU }],
    [{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '⭐ Відгуки\n\n' + formatStatsLine(stats) + '\n\nОбери розділ:',
    keyboard
  );
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
  const isSelf = String(viewerChatId) === String(targetId);
  let text =
    (isSelf ? '⭐ Відгуки про мене' : '⭐ Відгуки: ' + Helpers.escapeHtml(displayName(target))) +
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
        Helpers.escapeHtml(formatReviewDate(rev)) +
        '\n' +
        Helpers.escapeHtml(displayName(author)) +
        '\n' +
        stars(rev.rating) +
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
  if (isSelf) {
    keyboard.push([{ text: '⬅️ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }]);
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

async function showMyAuthoredReviews(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const list = await supabase.getReviewsByAuthor(chatId, 40);
  let text = '📝 Мої відгуки\n\nТут відгуки, які ти написав(ла) — усі статуси.\n';
  if (!list.length) {
    text += '\nТи ще не залишав(ла) відгуків.';
  } else {
    for (const rev of list) {
      const target = await User.getByChatId(rev.targetChatId);
      text +=
        '\n———\n' +
        formatReviewDate(rev) +
        '\nПро: ' +
        displayName(target) +
        '\nСтатус: ' +
        reviewStatusLabel(rev.status) +
        '\n' +
        stars(rev.rating) +
        '\n' +
        String(rev.body || '').slice(0, 400) +
        '\n';
    }
  }
  await Helpers.sendKeyboard(chatId, text, [
    [{ text: '⬅️ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
    [{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ]);
}

async function showWriteReviewMenu(chatId) {
  const me = await User.getByChatId(chatId);
  if (!me) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const role = String(me.role || '').toLowerCase();
  const backKb = [
    [{ text: '⬅️ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  if (role === CONSTANTS.ROLES.COACH) {
    const students = await User.getStudentsByCoach(chatId);
    if (!students || !students.length) {
      await Helpers.sendKeyboard(
        chatId,
        '✍️ Залишити відгук про клієнта\n\nНемає активних клієнтів у списку.',
        backKb
      );
      return;
    }
    const keyboard = [];
    for (const s of students.slice(0, 40)) {
      let label = displayName(s);
      if (isInviteUser(s)) label += ' (інвайт)';
      if (label.length > 60) label = label.slice(0, 57) + '…';
      keyboard.push([
        { text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_WRITE + ':' + s.chatId }
      ]);
    }
    keyboard.push([{ text: '⬅️ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    await Helpers.sendKeyboard(
      chatId,
      '✍️ Залишити відгук про клієнта\n\nОбери клієнта (потрібно ≥ ' + MIN_SESSIONS + ' спільних завершених тренувань):',
      keyboard
    );
    return;
  }
  if (role === CONSTANTS.ROLES.STUDENT) {
    const coachId = me.coachId != null ? String(me.coachId).trim() : '';
    if (!coachId) {
      await Helpers.sendKeyboard(
        chatId,
        '✍️ Залишити відгук про тренера\n\nУ тебе немає поточного тренера на платформі.',
        backKb
      );
      return;
    }
    const coach = await User.getByChatId(coachId);
    await Helpers.sendKeyboard(
      chatId,
      '✍️ Залишити відгук про тренера\n\n' +
        displayName(coach) +
        '\n\nПотрібно ≥ ' +
        MIN_SESSIONS +
        ' спільних завершених тренувань.',
      [
        [{ text: '⭐ Написати відгук', callback_data: CONSTANTS.CALLBACK_PREFIXES.REV_WRITE + ':' + coachId }],
        [{ text: '⬅️ До відгуків', callback_data: CONSTANTS.CALLBACKS.REV_MY }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return;
  }
  await Helpers.sendKeyboard(chatId, '❌ Відгуки доступні тренеру та клієнту.', backKb);
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
  if (isInviteUser(sid) || isInviteUser(student)) {
    await sendInviteNotActivatedNotice(viewerChatId, sid, 'public');
    return;
  }
  const name = publicStudentDisplayName(student);
  const coach = student.coachId ? await User.getByChatId(student.coachId) : null;
  const experienceLabel = Helpers.getExperienceStatusLabel(student);
  const genderLabel = formatPublicGenderLabel(student.gender);
  const age = resolvePublicAge(student);
  const modesLabel = formatPublicClientServiceModes(student.clientServiceModes);
  const club = await resolvePublicStudentClub(sid);

  let text = '👤 <b>' + Helpers.escapeHtml(name) + '</b>\n\n';
  if (genderLabel) {
    text += '⚧ Стать: ' + Helpers.escapeHtml(genderLabel) + '\n';
  }
  if (age != null) {
    text += '🎂 Вік: ' + age + ' років\n';
  }
  text +=
    '🏙 Місто: ' +
    Helpers.escapeHtml(student.city || 'не вказано') +
    '\n' +
    '📅 Досвід: ' +
    Helpers.escapeHtml(experienceLabel) +
    '\n';
  if (modesLabel) {
    text += '🏋️ Формат: ' + Helpers.escapeHtml(modesLabel) + '\n';
  }
  if (club) {
    const clubName = String(club.nameUa || club.city || 'Заклад').trim();
    text += '🏢 Клуб: ' + Helpers.escapeHtml(clubName) + '\n';
  }
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
    if (club && club.id) {
      let clubBtn = '🏢 ' + String(club.nameUa || club.city || 'Клуб').trim();
      if (clubBtn.length > 64) clubBtn = clubBtn.slice(0, 61) + '…';
      keyboard.push([{ text: clubBtn, callback_data: CONSTANTS.CALLBACKS.VENUES_CARD + ':' + club.id }]);
    }
    const studentTgBtn = Helpers.telegramContactButton('💬 Написати в Telegram', student);
    if (studentTgBtn && String(viewerChatId) !== sid) keyboard.push([studentTgBtn]);
  } else {
    keyboard.push([{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  try {
    const CardImages = require('./cardImages');
    await CardImages.sendUserCardImage(viewerChatId, student);
  } catch (_) {}
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
    await showReviewsHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REV_ABOUT) {
    await showMyReceivedReviews(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REV_AUTHORED) {
    await showMyAuthoredReviews(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.REV_WRITE_MENU) {
    await showWriteReviewMenu(chatId);
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
      await showReviewsHub(chatId);
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
  showReviewsHub,
  showMyReceivedReviews,
  showMyAuthoredReviews,
  showWriteReviewMenu,
  sendStudentPublicProfileCard,
  showMyPublicStudentCard,
  handleCallback,
  handleTextMessage
};
