/**
 * Admin bot: menus for managing users/invites/audit log.
 * Security: responds only to ADMIN_CHAT_ID.
 */
const AdminTelegram = require('./adminTelegram');
const AdminHelpers = require('./adminHelpers');
const adminVenues = require('./adminVenues');
const supabase = require('./supabase');
const Helpers = require('./helpers');
const { CONSTANTS } = require('./constants');

const CALLBACKS = Object.freeze({
  MENU: 'ADM_MENU',
  STATS: 'ADM_STATS',
  USERS: 'ADM_USERS',
  USERS_PAGE: 'ADM_USERS_PAGE',
  USER: 'ADM_USER',
  USER_COACH_TYPES: 'ADM_USER_COACH_TYPES',
  USER_COACH_TYPES_TOGGLE: 'ADM_USER_COACH_TYPES_TOGGLE',
  USER_COACH_TYPES_SAVE: 'ADM_USER_COACH_TYPES_SAVE',
  USER_BLOCK: 'ADM_USER_BLOCK',
  USER_UNBLOCK: 'ADM_USER_UNBLOCK',
  USER_DELETE: 'ADM_USER_DELETE',
  USER_DELETE_CONFIRM: 'ADM_USER_DELETE_CONFIRM',
  INVITES: 'ADM_INVITES',
  INVITES_PAGE: 'ADM_INVITES_PAGE',
  INVITE_DELETE: 'ADM_INVITE_DELETE',
  INVITE_DELETE_CONFIRM: 'ADM_INVITE_DELETE_CONFIRM',
  INVITES_DELETE_ALL: 'ADM_INVITES_DELETE_ALL',
  INVITES_DELETE_ALL_CONFIRM: 'ADM_INVITES_DELETE_ALL_CONFIRM',
  LOG: 'ADM_LOG',
  EX_CYCLE_MENU: 'ADM_EXC_MENU',
  EX_CYCLE_LIST: 'ADM_EXC_LIST',
  EX_CYCLE_REVIEW: 'ADM_EXC_RVW',
  USERS_SEARCH: 'ADM_USERS_SEARCH',
  USER_FIX_LIST: 'ADM_USER_FIX_LIST',
  /** Зняти власника закладу з картки користувача: ADM_UVOWN:<chatId> */
  USER_VOWN_UNLINK: 'ADM_UVOWN',
  USER_VOWN_UNLINK_OK: 'ADM_UVOWN_OK',
  /** Черга модерації відгуків */
  REVIEWS: 'ADM_REV',
  /** Схвалити: ADM_REV_OK:<id> */
  REVIEW_OK: 'ADM_REV_OK',
  /** Відхилити: ADM_REV_NO:<id> */
  REVIEW_NO: 'ADM_REV_NO',
  /** Заявки тренера на роль власника закладу */
  OWNER_REQ: 'ADM_OWNREQ',
  OWNER_REQ_OK: 'ADM_OWNREQ_OK',
  OWNER_REQ_NO: 'ADM_OWNREQ_NO',
  /** Групові заняття тренера → картка клубу */
  GCA: 'ADM_GCA',
  GCA_VIEW: 'ADM_GCA_V',
  GCA_OK: 'ADM_GCA_OK',
  GCA_NO: 'ADM_GCA_NO'
});

const ADMIN_STATE_STEP_SEARCH = 'adm_users_search';
const ADMIN_STATE_STEP_GCA_REJECT = 'adm_gca_reject';

function fmtName(u) {
  const name = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
  return name || '(без імені)';
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'coach') return 'тренер';
  if (r === 'student') return 'учень';
  if (r === 'venue_owner') return 'власник закладу';
  return role || '—';
}

function fmtCoachTrainingTypes(types) {
  const arr = Array.isArray(types) ? types : [];
  const labels = [];
  if (arr.includes('individual')) labels.push('Індивідуальні (персональні, спліт, тріо)');
  if (arr.includes('group')) labels.push('Групові заняття');
  return labels.length ? labels.join(', ') : '—';
}

async function showMenu(chatId) {
  const keyboard = [
    [{ text: '📊 Статистика', callback_data: CALLBACKS.STATS }],
    [{ text: '👥 Користувачі', callback_data: CALLBACKS.USERS }],
    [{ text: '⭐ Відгуки (модерація)', callback_data: CALLBACKS.REVIEWS }],
    [{ text: '👥 Групові (модерація)', callback_data: CALLBACKS.GCA }],
    [{ text: '🏢 Заявки власника (тренер)', callback_data: CALLBACKS.OWNER_REQ }],
    [{ text: '🔑 Інвайти', callback_data: CALLBACKS.INVITES }],
    [{ text: '🧪 Аудит вправ (цикл)', callback_data: CALLBACKS.EX_CYCLE_MENU }],
    [{ text: '📍 Заклади (клуби)', callback_data: adminVenues.CB.MENU }],
    [{ text: '📋 Лог дій', callback_data: CALLBACKS.LOG }]
  ];
  await AdminTelegram.sendKeyboard(chatId, 'АДМІН-БОТ FITHad\n\nОбери розділ:', keyboard);
}

function fmtReviewStars(n) {
  const r = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
  return '⭐'.repeat(r || 0) || '—';
}

function gcaKindLabel(status) {
  if (status === 'archive_pending') return '📦 архів';
  if (status === 'restore_pending') return '♻️ відновлення';
  return '➕ на картку';
}

async function showGroupClassModerationQueue(chatId) {
  const list = await supabase.listPendingCoachGroupClasses(20);
  let text = '👥 Групові (модерація)\n\n';
  if (!list.length) {
    text += 'Черга порожня.';
    await AdminTelegram.sendKeyboard(chatId, text, [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]]);
    return;
  }
  const keyboard = [];
  for (const cls of list) {
    const coach = await supabase.adminGetUserByChatId(cls.coachChatId);
    const venue = await supabase.getVenueById(cls.venueId);
    const cName = coach ? fmtName(coach) : cls.coachChatId;
    const vName = venue ? venue.nameUa : cls.venueId;
    const title = cls.labelUa || cls.groupClassCode;
    const kind = gcaKindLabel(cls.moderationStatus);
    text += '• [' + kind + '] ' + title + '\n  тренер: ' + cName + '\n  заклад: ' + vName + '\n\n';
    keyboard.push([
      {
        text: ('📋 ' + kind + ' ' + title).slice(0, 64),
        callback_data: CALLBACKS.GCA_VIEW + ':' + cls.id
      }
    ]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function showGroupClassModerationCard(adminChatId, rowId) {
  const cls = await supabase.getCoachGroupClassById(rowId);
  const st = cls && cls.moderationStatus;
  if (!cls || !['pending', 'archive_pending', 'restore_pending'].includes(st)) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Заявку не знайдено або вже оброблено.');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  const coach = await supabase.adminGetUserByChatId(cls.coachChatId);
  const venue = await supabase.getVenueById(cls.venueId);
  const managers = await supabase.listVenueManagers(cls.venueId, 'owner');
  const ownerId = managers[0] && managers[0].managerChatId ? managers[0].managerChatId : '';
  const owner = ownerId ? await supabase.adminGetUserByChatId(ownerId) : null;
  const schedule = await supabase.listCoachGroupSchedule(cls.coachChatId, cls.venueId, cls.groupClassCode);
  const schedLines = (schedule || [])
    .map((x) => {
      const wd = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' };
      return (wd[x.weekday] || x.weekday) + ' ' + String(x.timeStart || '').slice(0, 5) + '-' + String(x.timeEnd || '').slice(0, 5);
    })
    .join('\n');
  const price =
    cls.priceAmount != null
      ? String(cls.priceAmount) + ' ' + (cls.priceCurrency || 'UAH')
      : 'не вказано';
  let headline = '👥 Заявка: групове → картка клубу';
  let okLabel = '✅ На картку клубу (підтв. власника)';
  let hint = '\n\nПісля звʼязку з власником і його підтвердження — натисни «На картку клубу».';
  if (st === 'archive_pending') {
    headline = '📦 Заявка: архівувати групове (зняти з картки клубу)';
    okLabel = '✅ Архівувати (підтв. власника)';
    hint =
      '\n\nДо підтвердження заняття ще видно в меню клубу/тренера зі статусом «на модерації». Після підтвердження — в архіві.';
  } else if (st === 'restore_pending') {
    headline = '♻️ Заявка: відновити групове з архіву на картку клубу';
    okLabel = '✅ Відновити на картку (підтв. власника)';
    hint = '\n\nПісля підтвердження власника заняття знову на картці клубу.';
  }
  let text =
    headline +
    '\n\n' +
    'Назва: ' +
    (cls.labelUa || cls.groupClassCode) +
    '\nКод: ' +
    cls.groupClassCode +
    '\nОпис: ' +
    (cls.description || '—') +
    '\nВартість: ' +
    price +
    '\n\nТренер: ' +
    (coach ? fmtName(coach) : cls.coachChatId) +
    ' (' +
    cls.coachChatId +
    ')\nЗаклад: ' +
    ((venue && venue.nameUa) || cls.venueId) +
    '\nВласник: ' +
    (owner ? fmtName(owner) + ' (' + ownerId + ')' : ownerId || 'не призначено') +
    '\n\nРозклад тренера:\n' +
    (schedLines || '—') +
    hint;

  const keyboard = [
    [{ text: okLabel, callback_data: CALLBACKS.GCA_OK + ':' + cls.id }],
    [{ text: '❌ Відхилити', callback_data: CALLBACKS.GCA_NO + ':' + cls.id }]
  ];
  const coachBtn = Helpers.telegramContactButton(
    '💬 Тренер',
    coach || { chatId: cls.coachChatId, userId: cls.coachChatId }
  );
  if (coachBtn) keyboard.push([coachBtn]);
  if (owner) {
    const ownBtn = Helpers.telegramContactButton('💬 Власник закладу', owner);
    if (ownBtn) keyboard.push([ownBtn]);
  }
  if (venue && venue.id) {
    keyboard.push([{ text: '🏢 Картка закладу', callback_data: `ADM_VVW:${venue.id}` }]);
  }
  keyboard.push([{ text: '⬅️ До черги', callback_data: CALLBACKS.GCA }]);
  await AdminTelegram.sendKeyboard(adminChatId, text, keyboard);
}

async function approveGroupClassModeration(adminChatId, rowId) {
  const cls = await supabase.getCoachGroupClassById(rowId);
  if (!cls) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Заявку не знайдено.');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  if (cls.moderationStatus === 'archive_pending') {
    const archived = await supabase.approveArchiveCoachGroupClass(rowId, adminChatId);
    if (!archived) {
      await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося архівувати.');
      await showGroupClassModerationQueue(adminChatId);
      return;
    }
    await supabase.adminInsertLog({
      adminChatId,
      action: 'group_class_archive',
      targetUserChatId: archived.coachChatId,
      payloadJson: { id: archived.id, venueId: archived.venueId, code: archived.groupClassCode }
    });
    await AdminTelegram.sendMessage(adminChatId, '✅ Заняття в архіві (знято з картки клубу).');
    try {
      await Helpers.safeSend(
        archived.coachChatId,
        '📦 Групове «' +
          (archived.labelUa || archived.groupClassCode) +
          '» підтверджено власником і переміщено в архів.'
      );
    } catch (_) {}
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  if (cls.moderationStatus === 'restore_pending') {
    const restored = await supabase.approveRestoreCoachGroupClass(rowId, adminChatId);
    if (!restored) {
      await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося відновити.');
      await showGroupClassModerationQueue(adminChatId);
      return;
    }
    await supabase.adminInsertLog({
      adminChatId,
      action: 'group_class_restore',
      targetUserChatId: restored.coachChatId,
      payloadJson: { id: restored.id, venueId: restored.venueId, code: restored.groupClassCode }
    });
    await AdminTelegram.sendMessage(adminChatId, '✅ Заняття відновлено на картці клубу.');
    try {
      await Helpers.safeSend(
        restored.coachChatId,
        '✅ Групове «' +
          (restored.labelUa || restored.groupClassCode) +
          '» підтверджено власником і знову на картці клубу.'
      );
    } catch (_) {}
    await showGroupClassModerationQueue(adminChatId);
    return;
  }

  const published = await supabase.publishCoachGroupClassToVenue(rowId, adminChatId);
  if (!published) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося опублікувати (можливо вже оброблено).');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  await supabase.adminInsertLog({
    adminChatId,
    action: 'group_class_publish',
    targetUserChatId: published.coachChatId,
    payloadJson: {
      id: published.id,
      venueId: published.venueId,
      code: published.groupClassCode
    }
  });
  await AdminTelegram.sendMessage(adminChatId, '✅ Заняття додано на картку клубу.');
  try {
    const GroupClassAnnounce = require('./groupClassAnnounce');
    await GroupClassAnnounce.sendCreatedInvitePrompt(
      published.coachChatId,
      published.venueId,
      published.groupClassCode,
      published.labelUa || published.groupClassCode
    );
  } catch (_) {}
  await showGroupClassModerationQueue(adminChatId);
}

async function startRejectGroupClassModeration(adminChatId, rowId) {
  const cls = await supabase.getCoachGroupClassById(rowId);
  if (!cls || !['pending', 'archive_pending', 'restore_pending'].includes(cls.moderationStatus)) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Заявку не знайдено або вже оброблено.');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  await supabase.setStateRow(String(adminChatId), {
    step: ADMIN_STATE_STEP_GCA_REJECT,
    gcaRejectId: String(rowId)
  });
  await AdminTelegram.sendMessage(
    adminChatId,
    '✍️ Введи коротку причину відхилення (до 300 символів) або надішли «-» без причини:'
  );
}

async function finishRejectGroupClassModeration(adminChatId, noteText) {
  const stRow = await supabase.getStateRow(String(adminChatId));
  const st = stRow && stRow.data ? stRow.data : null;
  const rowId = st && st.gcaRejectId ? String(st.gcaRejectId) : '';
  await supabase.setStateRow(String(adminChatId), { step: null, gcaRejectId: null });
  if (!rowId) {
    await AdminTelegram.sendMessage(adminChatId, '⚠️ Контекст втрачено.');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  const raw = String(noteText || '').trim();
  const note = raw === '-' || raw === '—' ? null : raw.slice(0, 300);
  const rejected = await supabase.rejectCoachGroupClassModeration(rowId, adminChatId, note);
  if (!rejected) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося відхилити.');
    await showGroupClassModerationQueue(adminChatId);
    return;
  }
  await supabase.adminInsertLog({
    adminChatId,
    action: 'group_class_reject',
    targetUserChatId: rejected.coachChatId,
    payloadJson: { id: rejected.id, note: note || null }
  });
  await AdminTelegram.sendMessage(adminChatId, '✅ Заявку відхилено.');
  try {
    await Helpers.safeSend(
      rejected.coachChatId,
      '❌ Заявку на розміщення групового «' +
        (rejected.labelUa || rejected.groupClassCode) +
        '» на картці клубу відхилено.' +
        (note ? '\nПричина: ' + note : '')
    );
  } catch (_) {}
  await showGroupClassModerationQueue(adminChatId);
}

async function showReviewsQueue(chatId) {
  const list = await supabase.listPendingReviews(15);
  let text = '⭐ Відгуки на модерації\n\n';
  if (!list.length) {
    text += 'Черга порожня.';
    await AdminTelegram.sendKeyboard(chatId, text, [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]]);
    return;
  }
  const keyboard = [];
  for (const rev of list) {
    const author = await supabase.adminGetUserByChatId(rev.authorChatId);
    const target = await supabase.adminGetUserByChatId(rev.targetChatId);
    const aName = author ? fmtName(author) : rev.authorChatId;
    const tName = target ? fmtName(target) : rev.targetChatId;
    text +=
      '• ' +
      fmtReviewStars(rev.rating) +
      ' від ' +
      aName +
      ' → ' +
      tName +
      '\n' +
      String(rev.body || '').slice(0, 120) +
      (String(rev.body || '').length > 120 ? '…' : '') +
      '\n\n';
    keyboard.push([
      { text: '✅ ' + aName.slice(0, 18), callback_data: CALLBACKS.REVIEW_OK + ':' + rev.id },
      { text: '❌', callback_data: CALLBACKS.REVIEW_NO + ':' + rev.id }
    ]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function moderateReview(adminChatId, reviewId, status) {
  const rev = await supabase.setReviewModerationStatus(reviewId, status, adminChatId);
  if (!rev) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося оновити відгук.');
    await showReviewsQueue(adminChatId);
    return;
  }
  await supabase.adminInsertLog({
    adminChatId,
    action: status === 'published' ? 'review_publish' : 'review_reject',
    targetUserChatId: rev.targetChatId,
    payloadJson: { reviewId: rev.id, authorChatId: rev.authorChatId }
  });
  const label = status === 'published' ? 'схвалено' : 'відхилено';
  await AdminTelegram.sendMessage(adminChatId, '✅ Відгук ' + label + '.');
  try {
    const authorMsg =
      status === 'published'
        ? '✅ Твій відгук опубліковано на публічній картці.'
        : '❌ Твій відгук відхилено модератором.';
    await Helpers.safeSend(rev.authorChatId, authorMsg);
  } catch (_) {}
  if (status === 'published' && rev.targetChatId) {
    try {
      const author = await supabase.adminGetUserByChatId(rev.authorChatId);
      const aName = author ? fmtName(author) : rev.authorChatId;
      const snippet = String(rev.body || '').slice(0, 200);
      await Helpers.sendKeyboard(
        rev.targetChatId,
        '⭐ Новий відгук про тебе\n\n' +
          'Від: ' +
          aName +
          '\n' +
          fmtReviewStars(rev.rating) +
          '\n' +
          snippet +
          (String(rev.body || '').length > 200 ? '…' : ''),
        [
          [{ text: '⭐ Відгуки про мене', callback_data: CONSTANTS.CALLBACKS.REV_ABOUT }],
          [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
        ]
      );
    } catch (e) {
      console.error('AdminBot.notifyReviewTarget', e.message);
    }
  }
  await showReviewsQueue(adminChatId);
}

async function showOwnerRequestsQueue(chatId) {
  const list = await supabase.listPendingVenueOwnerRequests(15);
  let text = '🏢 Заявки тренерів на роль власника\n\n';
  if (!list.length) {
    text += 'Черга порожня.';
    await AdminTelegram.sendKeyboard(chatId, text, [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]]);
    return;
  }
  const keyboard = [];
  for (const req of list) {
    const coach = await supabase.adminGetUserByChatId(req.coachChatId);
    const venue = req.venueId ? await supabase.getVenueById(req.venueId) : null;
    const cName = coach ? fmtName(coach) : req.coachChatId;
    const vName = venue ? venue.nameUa || venue.city || req.venueId : req.venueId || '—';
    const coachForLink = coach && coach.chatId ? coach : Object.assign({}, coach || {}, { chatId: req.coachChatId });
    const tgUsername = Helpers.normalizeTelegramUsername(coachForLink.telegramUsername);
    const tgUrl = Helpers.telegramDirectMessageUrl(coachForLink);
    let tgHint = '';
    if (tgUsername) tgHint = '  @' + tgUsername + '\n';
    else if (tgUrl) tgHint = '  ' + tgUrl + '\n';
    text += '• ' + cName + ' (' + req.coachChatId + ')\n' + tgHint + '  заклад: ' + vName + '\n\n';
    keyboard.push([
      { text: '✅ ' + cName.slice(0, 18), callback_data: CALLBACKS.OWNER_REQ_OK + ':' + req.id },
      { text: '❌', callback_data: CALLBACKS.OWNER_REQ_NO + ':' + req.id }
    ]);
    const tgBtn = Helpers.telegramContactButton('💬 ' + cName.slice(0, 20), coachForLink);
    if (tgBtn) keyboard.push([tgBtn]);
  }
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function moderateOwnerRequest(adminChatId, requestId, approve) {
  const req = await supabase.getVenueOwnerRequestById(requestId);
  if (!req || req.status !== 'pending') {
    await AdminTelegram.sendMessage(adminChatId, '❌ Заявку не знайдено або вже оброблено.');
    await showOwnerRequestsQueue(adminChatId);
    return;
  }
  if (approve) {
    if (!req.venueId) {
      await AdminTelegram.sendMessage(adminChatId, '❌ У заявці немає venue_id.');
      await showOwnerRequestsQueue(adminChatId);
      return;
    }
    const okAssign = await supabase.assignVenueManager(req.coachChatId, req.venueId, 'owner');
    if (!okAssign) {
      await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося додати venue_managers.');
      await showOwnerRequestsQueue(adminChatId);
      return;
    }
    await supabase.updateUser(req.coachChatId, { activeMenuMode: 'venue_owner' });
    const updated = await supabase.setVenueOwnerRequestStatus(requestId, 'approved', adminChatId);
    if (!updated) {
      await AdminTelegram.sendMessage(adminChatId, '❌ Призначено менеджера, але статус заявки не оновлено.');
      await showOwnerRequestsQueue(adminChatId);
      return;
    }
    await supabase.adminInsertLog({
      adminChatId,
      action: 'coach_venue_owner_approve',
      targetUserChatId: req.coachChatId,
      payloadJson: { requestId: req.id, venueId: req.venueId }
    });
    await AdminTelegram.sendMessage(adminChatId, '✅ Заявку схвалено. role лишається coach; додано venue_managers.');
    try {
      await Helpers.sendKeyboard(
        req.coachChatId,
        '✅ Заявку на роль власника схвалено.\n\nУ головному меню тренера зʼявиться «Меню власника». Роль тренера збережено.',
        [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
      );
    } catch (_) {}
  } else {
    const updated = await supabase.setVenueOwnerRequestStatus(requestId, 'rejected', adminChatId);
    if (!updated) {
      await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося відхилити заявку.');
      await showOwnerRequestsQueue(adminChatId);
      return;
    }
    await supabase.adminInsertLog({
      adminChatId,
      action: 'coach_venue_owner_reject',
      targetUserChatId: req.coachChatId,
      payloadJson: { requestId: req.id, venueId: req.venueId }
    });
    await AdminTelegram.sendMessage(adminChatId, '✅ Заявку відхилено.');
    try {
      await Helpers.sendKeyboard(
        req.coachChatId,
        '❌ Заявку на роль власника закладу відхилено модератором.\n\nЯкщо це помилка — напиши в підтримку.',
        [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
      );
    } catch (_) {}
  }
  await showOwnerRequestsQueue(adminChatId);
}

function exCycleStatusText(row) {
  if (row.isInversion || row.isHighImpact) return 'blocked_menstrual';
  return 'allowed_menstrual';
}

async function showExerciseCycleAuditMenu(chatId) {
  const s = await supabase.adminGetExerciseCycleFlagSummary();
  const text =
    '🧪 Аудит exercise_library по контролю циклу\n\n' +
    `Всього вправ: ${s.total}\n` +
    `is_inversion=true: ${s.inversion}\n` +
    `is_high_impact=true: ${s.highImpact}\n` +
    `Blocked у menstrual (будь-який флаг): ${s.flaggedAny}\n` +
    `Reviewed: ${s.reviewed}\n` +
    `Needs review: ${s.unflagged}\n\n` +
    'Оберіть список для перегляду:';
  const keyboard = [
    [{ text: '🟥 Menstrual blocked (all)', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:menstrual_blocked:0` }],
    [{ text: '🔻 Inversion only', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:inversion:0` }],
    [{ text: '⚡ High impact only', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:high_impact:0` }],
    [{ text: '🟨 Needs review (unflagged)', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:unflagged:0` }],
    [{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]
  ];
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

function listTitleByKind(kind) {
  if (kind === 'inversion') return '🔻 Список inversion';
  if (kind === 'high_impact') return '⚡ Список high impact';
  if (kind === 'unflagged') return '🟨 Список needs_review (без флагів)';
  return '🟥 Список blocked у menstrual';
}

async function showExerciseCycleFlagList(chatId, kind, pageRaw) {
  const page = Math.max(0, parseInt(pageRaw, 10) || 0);
  const pageSize = 15;
  const rows = await supabase.adminGetExerciseCycleFlagList(kind, page * pageSize, pageSize);
  const lines = [];
  for (const r of rows) {
    const name = (r.nameUa || r.nameRu || '—').trim();
    const flags = `${r.isInversion ? 'INV' : '-'}|${r.isHighImpact ? 'HI' : '-'}`;
    const status = exCycleStatusText(r);
    lines.push(
      `#${r.id} [${flags}] ${name}\n` +
      `${r.groupLevel2 || '—'} · ${status} · ${r.cycleFlagsReviewed ? 'reviewed' : 'needs_review'}`
    );
  }
  const text =
    `${listTitleByKind(kind)}\n` +
    `Сторінка ${page + 1}\n\n` +
    (lines.length ? lines.join('\n\n') : 'Порожньо.');
  const keyboard = [];
  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:${kind}:${page - 1}` });
  nav.push({ text: `Сторінка ${page + 1}`, callback_data: `${CALLBACKS.EX_CYCLE_LIST}:${kind}:${page}` });
  if (rows.length === pageSize) nav.push({ text: '➡️', callback_data: `${CALLBACKS.EX_CYCLE_LIST}:${kind}:${page + 1}` });
  keyboard.push(nav);
  if (kind === 'unflagged' && rows.length) {
    for (const r of rows.slice(0, 15)) {
      keyboard.push([{ text: `✅ Mark reviewed #${r.id}`, callback_data: `${CALLBACKS.EX_CYCLE_REVIEW}:${r.id}:${kind}:${page}` }]);
    }
  }
  keyboard.push([{ text: '⬅️ До аудиту', callback_data: CALLBACKS.EX_CYCLE_MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function markExerciseCycleReviewed(chatId, exerciseId, kind, page) {
  const ok = await supabase.adminSetExerciseCycleFlags(exerciseId, { cycleFlagsReviewed: true });
  await AdminTelegram.sendMessage(chatId, ok ? `✅ Exercise #${exerciseId} marked reviewed.` : `❌ Failed to mark #${exerciseId}.`);
  await showExerciseCycleFlagList(chatId, kind || 'unflagged', page || '0');
}

async function showStats(chatId) {
  const [total, coaches, students, venueOwners, solo, blocked] = await Promise.all([
    supabase.adminCountUsers(),
    supabase.adminCountUsersByRole('coach'),
    supabase.adminCountUsersByRole('student'),
    supabase.adminCountUsersByRole('venue_owner'),
    supabase.adminCountSoloStudents(),
    supabase.adminCountBlockedUsers()
  ]);
  const invCounts = await supabase.adminGetInviteInventoryCounts();
  const text =
    '📊 Статистика\n\n' +
    `Всього користувачів: ${total}\n` +
    `Тренерів: ${coaches}\n` +
    `Учнів: ${students}\n` +
    `Власників закладів: ${venueOwners}\n` +
    `Самостійних (student без coachId): ${solo}\n` +
    `Заблокованих: ${blocked}\n` +
    `Невикористаних інвайтів (INVITE_* = chat_id): ${invCounts.activeUnused}\n` +
    (invCounts.usedStubs > 0 ? `Технічних USED-заготовок (після активації): ${invCounts.usedStubs}\n` : '') +
    (invCounts.other > 0 ? `⚠️ Рядків INVITE_* з неконсистентним chat_id: ${invCounts.other} (див. Supabase / «Користувачі»)\n` : '');
  const keyboard = [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]];
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function showUsers(chatId, page = 0) {
  const p = Math.max(0, parseInt(page, 10) || 0);
  const pageSize = 10;
  const rows = await supabase.adminGetUsersPage(p * pageSize, pageSize);
  let text = '👥 Користувачі\n\n';
  if (!rows.length) {
    const total = await supabase.adminCountUsers();
    text +=
      total > 0
        ? 'На цій сторінці порожньо — спробуй ➡️ або 🔍 Пошук.'
        : 'Порожньо. Якщо в Supabase є рядки — додай на Railway змінну SUPABASE_SERVICE_ROLE_KEY і передеплой.';
  }
  const keyboard = [];
  for (const u of rows) {
    const regMark = u.registrationInProgress ? ' · 📝 реєстрація' : '';
    const label = `${fmtName(u)} · ${fmtRole(u.role)}${regMark}${u.isBlocked ? ' · ⛔ blocked' : ''}`;
    keyboard.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${CALLBACKS.USER}:${u.chatId}` }]);
  }
  const nav = [];
  if (p > 0) nav.push({ text: '⬅️', callback_data: `${CALLBACKS.USERS_PAGE}:${p - 1}` });
  nav.push({ text: `Сторінка ${p + 1}`, callback_data: CALLBACKS.USERS });
  if (rows.length === pageSize) nav.push({ text: '➡️', callback_data: `${CALLBACKS.USERS_PAGE}:${p + 1}` });
  keyboard.push(nav);
  keyboard.push([{ text: '🔍 Пошук (імʼя / INVITE_…)', callback_data: CALLBACKS.USERS_SEARCH }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function promptUserSearch(adminChatId) {
  await supabase.setStateRow(String(adminChatId), {
    step: ADMIN_STATE_STEP_SEARCH,
    updated_at: new Date().toISOString()
  });
  await AdminTelegram.sendKeyboard(
    adminChatId,
    '🔍 Пошук користувача\n\nВведи:\n• імʼя та прізвище (Ярослав Грачов або Грачов Ярослав)\n• код інвайту (82CD, INVITE_82CD)\n• Telegram chat_id (напр. 8525662901)',
    [[{ text: '⬅️ Скасувати', callback_data: CALLBACKS.USERS }]]
  );
}

function parseUserSearchQuery(text) {
  const raw = String(text || '').trim();
  if (!raw) return { inviteCode: '', nameQuery: '' };
  const code = supabase.normalizeInviteCode(raw);
  if (code) return { inviteCode: code, nameQuery: '' };
  if (/^INVITE_[A-Z0-9]+$/i.test(raw)) return { inviteCode: raw.toUpperCase(), nameQuery: '' };
  return { inviteCode: '', nameQuery: raw };
}

async function showUserSearchResults(adminChatId, queryText) {
  const { inviteCode, nameQuery } = parseUserSearchQuery(queryText);
  const found = await supabase.adminLookupUsers({ inviteCode, nameQuery });
  let text = '🔍 Результати пошуку\n';
  if (queryText) text += `\nЗапит: ${queryText}\n`;
  if (!found.length) {
    text += '\nНічого не знайдено.\n\nПеревір «🔑 Інвайти» (якщо код не активовано) або Supabase users вручну.';
    await AdminTelegram.sendKeyboard(adminChatId, text, [[{ text: '⬅️ До користувачів', callback_data: CALLBACKS.USERS }]]);
    return;
  }
  const keyboard = [];
  for (const u of found) {
    const kind = u._adminKind || '';
    const mark =
      kind === 'real_user'
        ? u._inAdminUsersList
          ? '✅'
          : '⚠️'
        : kind === 'active_invite'
          ? '🎟️'
          : '📦';
    const label = `${mark} ${fmtName(u)} · ${u.role || '—'}`.trim();
    const note = u._adminNote ? `\n   ${u._adminNote}` : '';
    text += `\n${mark} ${fmtName(u)} (${u.chatId})\n   user_id: ${u.userId || '—'}${note}`;
    if (kind === 'real_user' && supabase.isRealTelegramChatId(u.chatId)) {
      keyboard.push([
        {
          text: (label.length > 64 ? label.slice(0, 61) + '…' : label),
          callback_data: `${CALLBACKS.USER}:${u.chatId}`
        }
      ]);
      if (!u._inAdminUsersList) {
        keyboard.push([
          {
            text: '🔧 Показати в списку (sync user_id)',
            callback_data: `${CALLBACKS.USER_FIX_LIST}:${u.chatId}`
          }
        ]);
      }
    }
  }
  keyboard.push([{ text: '⬅️ До користувачів', callback_data: CALLBACKS.USERS }]);
  await AdminTelegram.sendKeyboard(adminChatId, text, keyboard);
}

async function fixUserListVisibility(adminChatId, targetChatId) {
  const res = await supabase.adminEnsureUserVisibleInList(targetChatId);
  if (!res.ok) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося виправити: ' + (res.reason || 'unknown'));
    return showUsers(adminChatId, 0);
  }
  await AdminTelegram.sendMessage(adminChatId, '✅ Користувача піднято в списку «Користувачі». Відкрий меню ще раз.');
  return showUserCard(adminChatId, targetChatId);
}

async function showUserCard(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendKeyboard(chatId, '❌ Користувача не знайдено.', [[{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]]);
    return;
  }
  const registrationInProgress = await supabase.adminUserRegistrationInProgress(targetChatId);
  let venueOwnerBlock = '';
  let linkedVenueId = null;
  if (u.role === 'venue_owner') {
    linkedVenueId = await supabase.getVenueIdForManager(u.chatId);
    if (linkedVenueId) {
      const v = await supabase.getVenueById(linkedVenueId);
      venueOwnerBlock =
        `Заклад: ${v ? (v.nameUa || '—') + ' — ' + (v.city || '') : linkedVenueId}\n` +
        `venue_id: ${linkedVenueId}\n`;
    } else {
      venueOwnerBlock = 'Заклад: не привʼязано (очікує призначення адміном)\n';
    }
  }
  const text =
    '👤 Картка користувача\n\n' +
    `Імʼя: ${fmtName(u)}\n` +
    `chat_id: ${u.chatId}\n` +
    `Роль: ${fmtRole(u.role)}\n` +
    venueOwnerBlock +
    `coachId: ${u.coachId || '—'}\n` +
    `Статус: ${registrationInProgress ? '📝 реєстрація не завершена (можна видалити)' : 'зареєстрований'}\n` +
    `Типи тренувань тренера: ${u.role === 'coach' ? fmtCoachTrainingTypes(u.coachTrainingTypes) : '—'}\n` +
    `Створено: ${fmtDate(u.createdAt)}\n` +
    `is_blocked: ${u.isBlocked ? 'true' : 'false'}\n`;
  const keyboard = [];
  if (u.role === 'coach') {
    keyboard.push([{ text: '✏️ Типи тренувань', callback_data: `${CALLBACKS.USER_COACH_TYPES}:${u.chatId}` }]);
  }
  if (u.role === 'venue_owner' && linkedVenueId) {
    keyboard.push([{ text: '🏢 Картка закладу', callback_data: `ADM_VVW:${linkedVenueId}` }]);
    keyboard.push([{ text: '👑 Зняти з закладу', callback_data: `${CALLBACKS.USER_VOWN_UNLINK}:${u.chatId}` }]);
  }
  if (u.isBlocked) keyboard.push([{ text: '✅ Розблокувати', callback_data: `${CALLBACKS.USER_UNBLOCK}:${u.chatId}` }]);
  else keyboard.push([{ text: '⛔ Заблокувати', callback_data: `${CALLBACKS.USER_BLOCK}:${u.chatId}` }]);
  keyboard.push([{ text: '🗑 Видалити акаунт', callback_data: `${CALLBACKS.USER_DELETE}:${u.chatId}` }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function showCoachTrainingTypesEditor(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendKeyboard(chatId, '❌ Користувача не знайдено.', [[{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]]);
    return;
  }
  if (u.role !== 'coach') {
    await AdminTelegram.sendKeyboard(chatId, '⚠️ Ця опція доступна лише для ролі "тренер".', [[{ text: '⬅️ Назад', callback_data: `${CALLBACKS.USER}:${u.chatId}` }]]);
    return;
  }
  const selected = Array.isArray(u.coachTrainingTypes) ? u.coachTrainingTypes : [];
  const hasIndividual = selected.includes('individual');
  const hasGroup = selected.includes('group');
  const keyboard = [
    [
      {
        text: `${hasIndividual ? '✅' : '☐'} Індивідуальні (персональні, спліт, тріо)`,
        callback_data: `${CALLBACKS.USER_COACH_TYPES_TOGGLE}:${u.chatId}:individual`
      }
    ],
    [
      {
        text: `${hasGroup ? '✅' : '☐'} Групові заняття`,
        callback_data: `${CALLBACKS.USER_COACH_TYPES_TOGGLE}:${u.chatId}:group`
      }
    ],
    [{ text: '💾 Зберегти', callback_data: `${CALLBACKS.USER_COACH_TYPES_SAVE}:${u.chatId}` }],
    [{ text: '⬅️ Назад', callback_data: `${CALLBACKS.USER}:${u.chatId}` }]
  ];
  const text =
    '✏️ Типи тренувань тренера\n\n' +
    `Тренер: ${fmtName(u)}\n` +
    'Обери один або кілька типів, потім натисни "Зберегти".';
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function toggleCoachTrainingType(chatId, targetChatId, typeKey) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u || u.role !== 'coach') {
    await AdminTelegram.sendMessage(chatId, '❌ Тренера не знайдено.');
    return;
  }
  const cur = new Set(Array.isArray(u.coachTrainingTypes) ? u.coachTrainingTypes : []);
  const key = String(typeKey || '').trim();
  if (key !== 'individual' && key !== 'group') {
    await AdminTelegram.sendMessage(chatId, '⚠️ Невідомий тип тренувань.');
    return showCoachTrainingTypesEditor(chatId, targetChatId);
  }
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  const next = Array.from(cur);
  const ok = await supabase.updateUser(String(targetChatId), { coachTrainingTypes: next });
  if (!ok) await AdminTelegram.sendMessage(chatId, '❌ Не вдалося оновити типи тренувань.');
  return showCoachTrainingTypesEditor(chatId, targetChatId);
}

async function saveCoachTrainingTypes(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u || u.role !== 'coach') {
    await AdminTelegram.sendMessage(chatId, '❌ Тренера не знайдено.');
    return;
  }
  const arr = Array.isArray(u.coachTrainingTypes) ? u.coachTrainingTypes : [];
  if (!arr.length) {
    await AdminTelegram.sendMessage(chatId, '⚠️ Обери хоча б один тип тренувань.');
    return showCoachTrainingTypesEditor(chatId, targetChatId);
  }
  await AdminTelegram.sendMessage(chatId, '✅ Типи тренувань оновлено.');
  return showUserCard(chatId, targetChatId);
}

async function setBlocked(chatId, targetChatId, blocked) {
  const ok = await supabase.updateUser(targetChatId, { isBlocked: blocked === true });
  await supabase.adminInsertLog({
    adminChatId: chatId,
    action: blocked ? 'user_block' : 'user_unblock',
    targetUserChatId: String(targetChatId),
    payloadJson: { blocked: blocked === true }
  });
  await AdminTelegram.sendMessage(chatId, ok ? '✅ Готово.' : '❌ Не вдалося оновити користувача.');
  await showUserCard(chatId, targetChatId);
}

async function askDeleteUserConfirm(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendKeyboard(chatId, '❌ Користувача не знайдено.', [[{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]]);
    return;
  }
  const keyboard = [
    [{ text: '✅ Так, видалити', callback_data: `${CALLBACKS.USER_DELETE_CONFIRM}:${u.chatId}` }],
    [{ text: '❌ Скасувати', callback_data: `${CALLBACKS.USER}:${u.chatId}` }]
  ];
  await AdminTelegram.sendKeyboard(chatId, `⚠️ Видалити акаунт назавжди?\n\n${fmtName(u)}\nchat_id: ${u.chatId}`, keyboard);
}

async function askUnlinkVenueOwnerConfirm(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u || u.role !== 'venue_owner') {
    await AdminTelegram.sendMessage(chatId, '❌ Користувача-власника не знайдено.');
    return showUserCard(chatId, targetChatId);
  }
  const vid = await supabase.getVenueIdForManager(u.chatId);
  if (!vid) {
    await AdminTelegram.sendMessage(chatId, '⚠️ У користувача немає привʼязаного закладу.');
    return showUserCard(chatId, targetChatId);
  }
  const v = await supabase.getVenueById(vid);
  const keyboard = [
    [{ text: '✅ Так, зняти', callback_data: `${CALLBACKS.USER_VOWN_UNLINK_OK}:${u.chatId}` }],
    [{ text: '❌ Скасувати', callback_data: `${CALLBACKS.USER}:${u.chatId}` }]
  ];
  await AdminTelegram.sendKeyboard(
    chatId,
    `⚠️ Зняти <b>${fmtName(u)}</b> з закладу <b>${v ? v.nameUa || '—' : vid}</b>?\n\n<i>Заклад не буде видалено.</i>`,
    keyboard,
    { parse_mode: 'HTML' }
  );
}

async function execUnlinkVenueOwner(adminChatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u || u.role !== 'venue_owner') {
    await AdminTelegram.sendMessage(adminChatId, '❌ Користувача-власника не знайдено.');
    return showUsers(adminChatId, 0);
  }
  const vid = await supabase.getVenueIdForManager(u.chatId);
  if (!vid) {
    await AdminTelegram.sendMessage(adminChatId, '⚠️ Немає привʼязаного закладу.');
    return showUserCard(adminChatId, targetChatId);
  }
  const res = await supabase.adminUnassignVenueOwner(u.chatId, vid);
  if (!res.ok) {
    await AdminTelegram.sendMessage(adminChatId, '❌ Не вдалося зняти власника.');
    return showUserCard(adminChatId, targetChatId);
  }
  await supabase.adminInsertLog({
    adminChatId: String(adminChatId),
    action: 'venue_owner_remove',
    targetUserChatId: String(u.chatId),
    payloadJson: { venueId: vid, fromUserCard: true, roleDemoted: !!res.roleDemoted }
  });
  await AdminTelegram.sendMessage(
    adminChatId,
    res.roleDemoted
      ? '✅ Власника знято. Заклад збережено. Роль змінено на учень.'
      : '✅ Власника знято. Заклад збережено.'
  );
  return showUserCard(adminChatId, targetChatId);
}

async function deleteUserCascade(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendMessage(chatId, '❌ Користувача не знайдено.');
    return;
  }
  const role = (u.role || '').toLowerCase();
  let ok = false;
  let cascade = 'student';
  if (role === 'coach') {
    ok = await supabase.adminDeleteCoachCascade(String(u.chatId));
    cascade = 'coach';
  } else if (role === 'venue_owner') {
    const vid = await supabase.getVenueIdForManager(u.chatId);
    if (vid) await supabase.adminUnassignVenueOwner(u.chatId, vid);
    ok = await supabase.adminDeleteStudentCascade(String(u.chatId));
    cascade = 'venue_owner';
  } else {
    ok = await supabase.adminDeleteStudentCascade(String(u.chatId));
  }
  await supabase.adminInsertLog({
    adminChatId: chatId,
    action: 'user_delete',
    targetUserChatId: String(u.chatId),
    payloadJson: { role: u.role || null, cascade }
  });
  await AdminTelegram.sendMessage(chatId, ok ? '✅ Видалено.' : '❌ Не вдалося видалити.');
  await showUsers(chatId, 0);
}

async function showInvites(chatId, page = 0) {
  const p = Math.max(0, parseInt(page, 10) || 0);
  const pageSize = 10;
  const invites = await supabase.adminGetActiveInvites(p * pageSize, pageSize);
  let text =
    '🔑 Інвайти\n\n' +
    'Невикористані: chat_id = user_id = INVITE_…\n' +
    'Технічні після активації: chat_id = USED_… (видаляй, якщо реальний акаунт уже в «Користувачі»).\n\n';
  if (!invites.length) text += 'Порожньо.';
  const keyboard = [];
  for (const inv of invites) {
    const dateStr = fmtDate(inv.createdAt);
    const label = inv.usedStub
      ? `⚪ ${inv.chatId} · ${dateStr}`
      : `🟢 ${inv.chatId} · ${dateStr}`;
    keyboard.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${CALLBACKS.INVITE_DELETE}:${inv.chatId}` }]);
  }
  const nav = [];
  if (p > 0) nav.push({ text: '⬅️', callback_data: `${CALLBACKS.INVITES_PAGE}:${p - 1}` });
  nav.push({ text: `Сторінка ${p + 1}`, callback_data: CALLBACKS.INVITES });
  if (invites.length === pageSize) nav.push({ text: '➡️', callback_data: `${CALLBACKS.INVITES_PAGE}:${p + 1}` });
  keyboard.push(nav);
  keyboard.push([{ text: '🗑 Видалити ВСІ', callback_data: CALLBACKS.INVITES_DELETE_ALL }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function askDeleteInviteConfirm(chatId, inviteCode) {
  const keyboard = [
    [{ text: '✅ Так, видалити', callback_data: `${CALLBACKS.INVITE_DELETE_CONFIRM}:${inviteCode}` }],
    [{ text: '❌ Скасувати', callback_data: CALLBACKS.INVITES }]
  ];
  await AdminTelegram.sendKeyboard(chatId, `⚠️ Видалити інвайт?\n\n${inviteCode}`, keyboard);
}

async function deleteInvite(chatId, inviteCode) {
  const ok = await supabase.deleteInviteUserAndAllRelatedData(String(inviteCode));
  await supabase.adminInsertLog({
    adminChatId: chatId,
    action: 'invite_delete',
    targetInviteCode: String(inviteCode),
    payloadJson: {}
  });
  await AdminTelegram.sendMessage(chatId, ok ? '✅ Інвайт видалено.' : '❌ Не вдалося видалити інвайт.');
  await showInvites(chatId, 0);
}

async function askDeleteAllInvitesConfirm(chatId) {
  const invites = await supabase.adminGetActiveInvites(0, 500);
  const n = invites.length;
  const keyboard = [
    [{ text: `✅ Так, видалити ${n}`, callback_data: CALLBACKS.INVITES_DELETE_ALL_CONFIRM }],
    [{ text: '❌ Скасувати', callback_data: CALLBACKS.INVITES }]
  ];
  await AdminTelegram.sendKeyboard(
    chatId,
    `⚠️ Буде видалено ${n} рядків зі списку (невикористані INVITE_* та технічні USED_*). Продовжити?`,
    keyboard
  );
}

async function deleteAllInvites(chatId) {
  const invites = await supabase.adminGetActiveInvites(0, 2000);
  let okCount = 0;
  for (const inv of invites) {
    const ok = await supabase.deleteInviteUserAndAllRelatedData(String(inv.chatId));
    if (ok) okCount++;
  }
  await supabase.adminInsertLog({
    adminChatId: chatId,
    action: 'invites_delete_all',
    payloadJson: { deleted: okCount, total: invites.length }
  });
  await AdminTelegram.sendMessage(chatId, `✅ Видалено ${okCount} з ${invites.length}.`);
  await showInvites(chatId, 0);
}

async function showLog(chatId) {
  const rows = await supabase.adminGetLastLogs(20);
  let text = '📋 Лог дій (останні 20)\n\n';
  if (!rows.length) text += 'Порожньо.';
  for (const r of rows) {
    const when = fmtDate(r.created_at);
    const action = r.action || '';
    const tgt = r.target_user_chat_id || r.target_invite_code || '';
    text += `• ${when} — ${action}${tgt ? ' — ' + tgt : ''}\n`;
  }
  await AdminTelegram.sendKeyboard(chatId, text, [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]]);
}

async function route(update) {
  const data = AdminHelpers.extractMessage(update);
  if (!data || !data.chatId) return;
  const isAdmin = AdminHelpers.isAdminChat(data.chatId);
  console.log('AdminBot update', { chatId: data.chatId, type: data.type, isAdmin });
  if (!isAdmin) return;

  if (data.type === 'callback') {
    if (data.callbackQueryId) AdminTelegram.answerCallbackQuery(data.callbackQueryId).catch(() => {});
    const parts = String(data.callbackData || '').split(':');
    const action = parts[0];
    const param = parts.slice(1).join(':');
    if (action.indexOf('ADM_V') === 0) {
      const done = await adminVenues.route(update, data);
      if (done) return;
    }
    if (action === CALLBACKS.MENU) return showMenu(data.chatId);
    if (action === CALLBACKS.STATS) return showStats(data.chatId);
    if (action === CALLBACKS.USERS) return showUsers(data.chatId, 0);
    if (action === CALLBACKS.USERS_PAGE) return showUsers(data.chatId, param);
    if (action === CALLBACKS.USERS_SEARCH) return promptUserSearch(data.chatId);
    if (action === CALLBACKS.USER_FIX_LIST) return fixUserListVisibility(data.chatId, param);
    if (action === CALLBACKS.USER) return showUserCard(data.chatId, param);
    if (action === CALLBACKS.USER_COACH_TYPES) return showCoachTrainingTypesEditor(data.chatId, param);
    if (action === CALLBACKS.USER_COACH_TYPES_TOGGLE) return toggleCoachTrainingType(data.chatId, parts[1], parts[2]);
    if (action === CALLBACKS.USER_COACH_TYPES_SAVE) return saveCoachTrainingTypes(data.chatId, param);
    if (action === CALLBACKS.USER_BLOCK) return setBlocked(data.chatId, param, true);
    if (action === CALLBACKS.USER_UNBLOCK) return setBlocked(data.chatId, param, false);
    if (action === CALLBACKS.USER_DELETE) return askDeleteUserConfirm(data.chatId, param);
    if (action === CALLBACKS.USER_DELETE_CONFIRM) return deleteUserCascade(data.chatId, param);
    if (action === CALLBACKS.USER_VOWN_UNLINK) return askUnlinkVenueOwnerConfirm(data.chatId, param);
    if (action === CALLBACKS.USER_VOWN_UNLINK_OK) return execUnlinkVenueOwner(data.chatId, param);
    if (action === CALLBACKS.INVITES) return showInvites(data.chatId, 0);
    if (action === CALLBACKS.INVITES_PAGE) return showInvites(data.chatId, param);
    if (action === CALLBACKS.INVITE_DELETE) return askDeleteInviteConfirm(data.chatId, param);
    if (action === CALLBACKS.INVITE_DELETE_CONFIRM) return deleteInvite(data.chatId, param);
    if (action === CALLBACKS.INVITES_DELETE_ALL) return askDeleteAllInvitesConfirm(data.chatId);
    if (action === CALLBACKS.INVITES_DELETE_ALL_CONFIRM) return deleteAllInvites(data.chatId);
    if (action === CALLBACKS.EX_CYCLE_MENU) return showExerciseCycleAuditMenu(data.chatId);
    if (action === CALLBACKS.EX_CYCLE_LIST) return showExerciseCycleFlagList(data.chatId, parts[1] || 'menstrual_blocked', parts[2] || '0');
    if (action === CALLBACKS.EX_CYCLE_REVIEW) return markExerciseCycleReviewed(data.chatId, parts[1], parts[2], parts[3]);
    if (action === CALLBACKS.LOG) return showLog(data.chatId);
    if (action === CALLBACKS.REVIEWS) return showReviewsQueue(data.chatId);
    if (action === CALLBACKS.REVIEW_OK) return moderateReview(data.chatId, param, 'published');
    if (action === CALLBACKS.REVIEW_NO) return moderateReview(data.chatId, param, 'rejected');
    if (action === CALLBACKS.GCA) return showGroupClassModerationQueue(data.chatId);
    if (action === CALLBACKS.GCA_VIEW) return showGroupClassModerationCard(data.chatId, param);
    if (action === CALLBACKS.GCA_OK) return approveGroupClassModeration(data.chatId, param);
    if (action === CALLBACKS.GCA_NO) return startRejectGroupClassModeration(data.chatId, param);
    if (action === CALLBACKS.OWNER_REQ) return showOwnerRequestsQueue(data.chatId);
    if (action === CALLBACKS.OWNER_REQ_OK) return moderateOwnerRequest(data.chatId, param, true);
    if (action === CALLBACKS.OWNER_REQ_NO) return moderateOwnerRequest(data.chatId, param, false);
    return showMenu(data.chatId);
  }

  if (data.type === 'text') {
    const done = await adminVenues.route(update, data);
    if (done) return;
    try {
      const stRow = await supabase.getStateRow(String(data.chatId));
      const st = stRow && stRow.data ? stRow.data : null;
      if (st && st.step === ADMIN_STATE_STEP_GCA_REJECT) {
        await finishRejectGroupClassModeration(data.chatId, data.text);
        return;
      }
      if (st && st.step === ADMIN_STATE_STEP_SEARCH) {
        await showUserSearchResults(data.chatId, data.text);
        return;
      }
    } catch (_) {}
    return showMenu(data.chatId);
  }
  if (data.type === 'location') {
    const done = await adminVenues.route(update, data);
    if (done) return;
    return showMenu(data.chatId);
  }

  return showMenu(data.chatId);
}

module.exports = { route, CALLBACKS };

