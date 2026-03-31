/**
 * Admin bot: menus for managing users/invites/audit log.
 * Security: responds only to ADMIN_CHAT_ID.
 */
const AdminTelegram = require('./adminTelegram');
const AdminHelpers = require('./adminHelpers');
const supabase = require('./supabase');

const CALLBACKS = Object.freeze({
  MENU: 'ADM_MENU',
  STATS: 'ADM_STATS',
  USERS: 'ADM_USERS',
  USERS_PAGE: 'ADM_USERS_PAGE',
  USER: 'ADM_USER',
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
  LOG: 'ADM_LOG'
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

async function showMenu(chatId) {
  const keyboard = [
    [{ text: '📊 Статистика', callback_data: CALLBACKS.STATS }],
    [{ text: '👥 Користувачі', callback_data: CALLBACKS.USERS }],
    [{ text: '🔑 Інвайти', callback_data: CALLBACKS.INVITES }],
    [{ text: '📋 Лог дій', callback_data: CALLBACKS.LOG }]
  ];
  await AdminTelegram.sendKeyboard(chatId, 'АДМІН-БОТ FITHad\n\nОбери розділ:', keyboard);
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
    `Створено: ${fmtDate(u.createdAt)}\n` +
    `is_blocked: ${u.isBlocked ? 'true' : 'false'}\n`;
  const keyboard = [];
  if (u.isBlocked) keyboard.push([{ text: '✅ Розблокувати', callback_data: `${CALLBACKS.USER_UNBLOCK}:${u.chatId}` }]);
  else keyboard.push([{ text: '⛔ Заблокувати', callback_data: `${CALLBACKS.USER_BLOCK}:${u.chatId}` }]);
  keyboard.push([{ text: '🗑 Видалити акаунт', callback_data: `${CALLBACKS.USER_DELETE}:${u.chatId}` }]);
  keyboard.push([{ text: '⬅️ Назад', callback_data: CALLBACKS.USERS }]);
  await AdminTelegram.sendKeyboard(chatId, text, keyboard);
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
    if (action === CALLBACKS.MENU) return showMenu(data.chatId);
    if (action === CALLBACKS.STATS) return showStats(data.chatId);
    if (action === CALLBACKS.USERS) return showUsers(data.chatId, 0);
    if (action === CALLBACKS.USERS_PAGE) return showUsers(data.chatId, param);
    if (action === CALLBACKS.USER) return showUserCard(data.chatId, param);
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
    if (action === CALLBACKS.LOG) return showLog(data.chatId);
    return showMenu(data.chatId);
  }

  // Any text -> show menu
  return showMenu(data.chatId);
}

module.exports = { route, CALLBACKS };

