/**
 * Admin bot: menus for managing users/invites/audit log.
 * Security: responds only to ADMIN_CHAT_ID.
 */
const AdminTelegram = require('./adminTelegram');
const AdminHelpers = require('./adminHelpers');
const adminVenues = require('./adminVenues');
const supabase = require('./supabase');

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
  EX_CYCLE_REVIEW: 'ADM_EXC_RVW'
});

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
    [{ text: '🔑 Інвайти', callback_data: CALLBACKS.INVITES }],
    [{ text: '🧪 Аудит вправ (цикл)', callback_data: CALLBACKS.EX_CYCLE_MENU }],
    [{ text: '📍 Заклади (клуби)', callback_data: adminVenues.CB.MENU }],
    [{ text: '📋 Лог дій', callback_data: CALLBACKS.LOG }]
  ];
  await AdminTelegram.sendKeyboard(chatId, 'АДМІН-БОТ FITHad\n\nОбери розділ:', keyboard);
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
  const [total, coaches, students, solo, blocked] = await Promise.all([
    supabase.adminCountUsers(),
    supabase.adminCountUsersByRole('coach'),
    supabase.adminCountUsersByRole('student'),
    supabase.adminCountSoloStudents(),
    supabase.adminCountBlockedUsers()
  ]);
  const invites = await supabase.adminGetActiveInvites(0, 200);
  const text =
    '📊 Статистика\n\n' +
    `Всього користувачів: ${total}\n` +
    `Тренерів: ${coaches}\n` +
    `Учнів: ${students}\n` +
    `Самостійних (student без coachId): ${solo}\n` +
    `Заблокованих: ${blocked}\n` +
    `Активних інвайтів (невикористані): ${invites.length}\n`;
  const keyboard = [[{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]];
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function showUsers(chatId, page = 0) {
  const p = Math.max(0, parseInt(page, 10) || 0);
  const pageSize = 10;
  const rows = await supabase.adminGetUsersPage(p * pageSize, pageSize);
  let text = '👥 Користувачі\n\n';
  if (!rows.length) text += 'Порожньо.';
  const keyboard = [];
  for (const u of rows) {
    const label = `${fmtName(u)} · ${u.role || '—'}${u.isBlocked ? ' · ⛔ blocked' : ''}`;
    keyboard.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${CALLBACKS.USER}:${u.chatId}` }]);
  }
  const nav = [];
  if (p > 0) nav.push({ text: '⬅️', callback_data: `${CALLBACKS.USERS_PAGE}:${p - 1}` });
  nav.push({ text: `Сторінка ${p + 1}`, callback_data: CALLBACKS.USERS });
  if (rows.length === pageSize) nav.push({ text: '➡️', callback_data: `${CALLBACKS.USERS_PAGE}:${p + 1}` });
  keyboard.push(nav);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.MENU }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
}

async function showUserCard(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendKeyboard(chatId, '❌ Користувача не знайдено.', [[{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]]);
    return;
  }
  const text =
    '👤 Картка користувача\n\n' +
    `Імʼя: ${fmtName(u)}\n` +
    `chat_id: ${u.chatId}\n` +
    `Роль: ${u.role || '—'}\n` +
    `coachId: ${u.coachId || '—'}\n` +
    `Типи тренувань тренера: ${u.role === 'coach' ? fmtCoachTrainingTypes(u.coachTrainingTypes) : '—'}\n` +
    `Створено: ${fmtDate(u.createdAt)}\n` +
    `is_blocked: ${u.isBlocked ? 'true' : 'false'}\n`;
  const keyboard = [];
  if (u.role === 'coach') {
    keyboard.push([{ text: '✏️ Типи тренувань', callback_data: `${CALLBACKS.USER_COACH_TYPES}:${u.chatId}` }]);
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

async function deleteUserCascade(chatId, targetChatId) {
  const u = await supabase.adminGetUserByChatId(targetChatId);
  if (!u) {
    await AdminTelegram.sendMessage(chatId, '❌ Користувача не знайдено.');
    return;
  }
  const role = (u.role || '').toLowerCase();
  let ok = false;
  if (role === 'coach') ok = await supabase.adminDeleteCoachCascade(String(u.chatId));
  else ok = await supabase.adminDeleteStudentCascade(String(u.chatId));
  await supabase.adminInsertLog({
    adminChatId: chatId,
    action: 'user_delete',
    targetUserChatId: String(u.chatId),
    payloadJson: { role: u.role || null, cascade: role === 'coach' ? 'coach' : 'student' }
  });
  await AdminTelegram.sendMessage(chatId, ok ? '✅ Видалено.' : '❌ Не вдалося видалити.');
  await showUsers(chatId, 0);
}

async function showInvites(chatId, page = 0) {
  const p = Math.max(0, parseInt(page, 10) || 0);
  const pageSize = 10;
  const invites = await supabase.adminGetActiveInvites(p * pageSize, pageSize);
  let text = '🔑 Невикористані інвайти\n\n';
  if (!invites.length) text += 'Порожньо.';
  const keyboard = [];
  for (const inv of invites) {
    const label = `${inv.chatId} · ${fmtDate(inv.createdAt)}`;
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
  await AdminTelegram.sendKeyboard(chatId, `⚠️ Буде видалено ${n} невикористаних інвайтів. Продовжити?`, keyboard);
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
    if (action === CALLBACKS.USER) return showUserCard(data.chatId, param);
    if (action === CALLBACKS.USER_COACH_TYPES) return showCoachTrainingTypesEditor(data.chatId, param);
    if (action === CALLBACKS.USER_COACH_TYPES_TOGGLE) return toggleCoachTrainingType(data.chatId, parts[1], parts[2]);
    if (action === CALLBACKS.USER_COACH_TYPES_SAVE) return saveCoachTrainingTypes(data.chatId, param);
    if (action === CALLBACKS.USER_BLOCK) return setBlocked(data.chatId, param, true);
    if (action === CALLBACKS.USER_UNBLOCK) return setBlocked(data.chatId, param, false);
    if (action === CALLBACKS.USER_DELETE) return askDeleteUserConfirm(data.chatId, param);
    if (action === CALLBACKS.USER_DELETE_CONFIRM) return deleteUserCascade(data.chatId, param);
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
    return showMenu(data.chatId);
  }

  if (data.type === 'text') {
    const done = await adminVenues.route(update, data);
    if (done) return;
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

