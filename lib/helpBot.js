/**
 * Help bot (FitHad_helpbot): support requests, operator workflow, invite generation by operator.
 *
 * Security:
 * - Any user can create a support request.
 * - Operator actions available only for HELP_OPERATOR_CHAT_ID.
 */
const HelpTelegram = require('./helpTelegram');
const HelpHelpers = require('./helpHelpers');
const supabase = require('./supabase');

const STATE_PREFIX = 'help_';

const STEPS = Object.freeze({
  USER_THREAD: STATE_PREFIX + 'user_thread',
  OP_REPLY: STATE_PREFIX + 'op_reply'
});

const TOPICS = Object.freeze({
  INVITE: 'invite',
  CONSULT: 'consult',
  PROBLEM: 'problem',
  DELETE_DATA: 'delete_data'
});

const CALLBACKS = Object.freeze({
  MENU: 'HLP_MENU',
  TOPIC: 'HLP_TOPIC', // HLP_TOPIC:<topic>
  END_THREAD: 'HLP_END_THREAD', // HLP_END_THREAD:<requestId>
  OP_PANEL: 'HLP_OP_PANEL',
  OP_OPEN: 'HLP_OP_OPEN', // HLP_OP_OPEN:<requestId>
  OP_REPLY: 'HLP_OP_REPLY', // HLP_OP_REPLY:<requestId>
  OP_CLOSE: 'HLP_OP_CLOSE', // HLP_OP_CLOSE:<requestId>
  OP_INVITE_GEN: 'HLP_OP_INVITE_GEN', // HLP_OP_INVITE_GEN:<requestId>
  OP_DELETE_CONFIRM: 'HLP_OP_DELETE_CONFIRM', // HLP_OP_DELETE_CONFIRM:<requestId>
  OP_DELETE_EXEC: 'HLP_OP_DELETE_EXEC' // HLP_OP_DELETE_EXEC:<requestId>
});

function nowIso() {
  return new Date().toISOString();
}

function short(s, n) {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + '…';
}

async function showMenu(chatId) {
  const isOp = HelpHelpers.isHelpOperator(chatId);
  if (isOp) {
    const kb = [[{ text: '🛠 Панель оператора', callback_data: CALLBACKS.OP_PANEL }]];
    await HelpTelegram.sendKeyboard(chatId, '🛠 Режим оператора.\n\nВідкрий панель, щоб переглянути звернення.', kb);
    return;
  }

  const keyboard = [
    [{ text: '🎟️ Запросити інвайт-код', callback_data: `${CALLBACKS.TOPIC}:${TOPICS.INVITE}` }],
    [{ text: '💡 Консультація по боту', callback_data: `${CALLBACKS.TOPIC}:${TOPICS.CONSULT}` }],
    [{ text: '🧯 Проблема / баг', callback_data: `${CALLBACKS.TOPIC}:${TOPICS.PROBLEM}` }],
    [{ text: '🗑 Видалення даних з платформи', callback_data: `${CALLBACKS.TOPIC}:${TOPICS.DELETE_DATA}` }]
  ];
  const text =
    'Привіт! Це бот підтримки FIT 3.0.\n\n' +
    'Обери тему звернення. Після вибору ти зможеш написати повідомлення(я) — діалог триває, поки ти не натиснеш «Завершити діалог».';
  await HelpTelegram.sendKeyboard(chatId, text, keyboard);
}

async function buildTechJson(userChatId) {
  const tech = { chat_id: String(userChatId), at: nowIso() };
  try {
    const u = await supabase.getUserByChatId(String(userChatId));
    if (u) tech.role = u.role || null;
  } catch (_) {}
  try {
    const stateRow = await supabase.getStateRow(String(userChatId));
    if (stateRow && stateRow.step) tech.last_step = String(stateRow.step);
  } catch (_) {}
  return tech;
}

function topicTitle(topic) {
  if (topic === TOPICS.INVITE) return 'Інвайт-код';
  if (topic === TOPICS.CONSULT) return 'Консультація';
  if (topic === TOPICS.PROBLEM) return 'Проблема';
  if (topic === TOPICS.DELETE_DATA) return 'Видалення даних';
  return 'Звернення';
}

async function getBotStateData(chatId) {
  try {
    const row = await supabase.getStateRow(String(chatId));
    if (!row || !row.data || typeof row.data !== 'object') return null;
    return row.data;
  } catch (e) {
    console.error('HelpBot: getBotStateData', e.message);
    return null;
  }
}

async function startTopic(chatId, topic) {
  const t = String(topic || '').trim();
  if (!Object.values(TOPICS).includes(t)) {
    await showMenu(chatId);
    return;
  }

  const tech = await buildTechJson(chatId);
  const requestId = await supabase.supportCreateRequest({
    topic: t,
    userChatId: String(chatId),
    userRole: tech.role || null,
    techJson: tech
  });

  if (!requestId) {
    await HelpTelegram.sendMessage(chatId, '❌ Не вдалося створити звернення. Спробуй ще раз пізніше.');
    return;
  }

  // Save bot-local state in bot_state to support threads
  await supabase.setStateRow(String(chatId), {
    step: STEPS.USER_THREAD,
    help_request_id: String(requestId),
    help_topic: t,
    updated_at: nowIso()
  });

  const keyboard = [[{ text: '✅ Завершити діалог', callback_data: `${CALLBACKS.END_THREAD}:${requestId}` }]];

  let intro = '';
  if (t === TOPICS.INVITE) {
    intro = 'Вкажи своє ім’я, прізвище та з якого ти міста.';
  } else {
    intro =
      `✅ Створено звернення: ${topicTitle(t)}\n\n` +
      'Напиши повідомлення(я). Я передам оператору.\n';
    if (t === TOPICS.DELETE_DATA) {
      intro += '\nПідказка: опиши, що саме потрібно видалити. Після цього ми попросимо підтвердження «Так, видалити назавжди».';
    }
  }
  await HelpTelegram.sendKeyboard(chatId, intro, keyboard);

  // Notify operator (if configured)
  const op = process.env.HELP_OPERATOR_CHAT_ID != null ? String(process.env.HELP_OPERATOR_CHAT_ID).trim() : '';
  if (op) {
    const msg =
      '🆕 Нове звернення\n\n' +
      `Тема: ${topicTitle(t)}\n` +
      `user_chat_id: ${chatId}\n` +
      `role: ${tech.role || '—'}\n` +
      `request_id: ${requestId}\n`;
    const opKb = [[{ text: 'Відкрити', callback_data: `${CALLBACKS.OP_OPEN}:${requestId}` }]];
    await HelpTelegram.sendKeyboard(op, msg, opKb);
  }
}

async function userAppendMessage(chatId, text) {
  const state = await getBotStateData(chatId);
  const requestId = state && state.help_request_id ? String(state.help_request_id) : '';
  if (!requestId) {
    await showMenu(chatId);
    return;
  }
  const clean = String(text || '').trim();
  if (!clean) return;
  await supabase.supportAppendMessage(requestId, { from: 'user', text: clean });
  await HelpTelegram.sendKeyboard(
    chatId,
    '✅ Прийнято.\n\nМожеш написати ще повідомлення або завершити діалог кнопкою нижче.',
    [[{ text: '✅ Завершити діалог', callback_data: `${CALLBACKS.END_THREAD}:${requestId}` }]]
  );

  const op = process.env.HELP_OPERATOR_CHAT_ID != null ? String(process.env.HELP_OPERATOR_CHAT_ID).trim() : '';
  if (op) {
    const u = await supabase.getUserByChatId(String(chatId));
    const opText =
      '💬 Нове повідомлення від користувача\n\n' +
      `Імʼя: ${((u?.firstName || '') + ' ' + (u?.lastName || '')).trim() || '—'}\n` +
      `user_chat_id: ${chatId}\n` +
      `request_id: ${requestId}\n\n` +
      short(clean, 800);
    const opKb = [
      [
        { text: 'Відкрити', callback_data: `${CALLBACKS.OP_OPEN}:${requestId}` },
        { text: 'Відповісти', callback_data: `${CALLBACKS.OP_REPLY}:${requestId}` }
      ]
    ];
    await HelpTelegram.sendKeyboard(op, opText, opKb);
  }
}

async function endUserThread(chatId, requestId) {
  const rid = String(requestId || '').trim();
  if (!rid) {
    await showMenu(chatId);
    return;
  }
  await supabase.supportCloseRequest(rid, { closedBy: 'user' });
  await supabase.setStateRow(String(chatId), { step: null, help_request_id: null, help_topic: null, updated_at: nowIso() });
  await HelpTelegram.sendMessage(chatId, '✅ Діалог завершено. Дякую! Якщо потрібно — натисни /start і створи нове звернення.');
}

async function showOperatorPanel(chatId) {
  if (!HelpHelpers.isHelpOperator(chatId)) return;
  const open = await supabase.supportGetOpenRequests(0, 20);
  let text = '🛠 Панель оператора\n\nВідкриті звернення:\n';
  if (!open.length) text += '— немає';
  const kb = [];
  for (const r of open) {
    const label = `${topicTitle(r.topic)} · ${r.user_chat_id}${r.user_role ? ' · ' + r.user_role : ''}`;
    kb.push([{ text: label.length > 64 ? label.slice(0, 61) + '…' : label, callback_data: `${CALLBACKS.OP_OPEN}:${r.id}` }]);
  }
  kb.push([{ text: '🏠 Меню', callback_data: CALLBACKS.MENU }]);
  await HelpTelegram.sendKeyboard(chatId, text, kb);
}

async function showRequestCard(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const r = await supabase.supportGetRequestById(String(requestId));
  if (!r) {
    await HelpTelegram.sendKeyboard(opChatId, '❌ Звернення не знайдено.', [[{ text: '⬅️ Назад', callback_data: CALLBACKS.OP_PANEL }]]);
    return;
  }
  const thread = Array.isArray(r.thread_json) ? r.thread_json : [];
  const last = thread.slice(-6).map((m) => {
    const who = m.from === 'operator' ? 'OP' : 'USER';
    const at = m.at ? String(m.at).slice(0, 16).replace('T', ' ') : '';
    return `${who}${at ? ' ' + at : ''}: ${m.text || ''}`;
  });
  const text =
    '📌 Картка звернення\n\n' +
    `id: ${r.id}\n` +
    `topic: ${topicTitle(r.topic)}\n` +
    `status: ${r.status}\n` +
    `user_chat_id: ${r.user_chat_id}\n` +
    `role: ${r.user_role || '—'}\n\n` +
    'Останні повідомлення:\n' +
    (last.length ? last.join('\n') : '—');
  const kb = [
    [
      { text: '✍️ Відповісти', callback_data: `${CALLBACKS.OP_REPLY}:${r.id}` },
      { text: '✅ Закрити', callback_data: `${CALLBACKS.OP_CLOSE}:${r.id}` }
    ],
    [{ text: '🎟️ Згенерувати інвайт', callback_data: `${CALLBACKS.OP_INVITE_GEN}:${r.id}` }],
    [{ text: '🗑 Видалити користувача (підтв.)', callback_data: `${CALLBACKS.OP_DELETE_CONFIRM}:${r.id}` }],
    [{ text: '⬅️ Назад', callback_data: CALLBACKS.OP_PANEL }]
  ];
  await HelpTelegram.sendKeyboard(opChatId, text, kb);
}

async function operatorStartReply(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const r = await supabase.supportGetRequestById(String(requestId));
  if (!r) return showOperatorPanel(opChatId);
  await supabase.setStateRow(String(opChatId), { step: STEPS.OP_REPLY, help_op_request_id: String(r.id), updated_at: nowIso() });
  await HelpTelegram.sendKeyboard(
    opChatId,
    `✍️ Режим відповіді\n\nrequest_id: ${r.id}\nuser_chat_id: ${r.user_chat_id}\n\nНапиши текст відповіді. Для виходу натисни «Назад».`,
    [[{ text: '⬅️ Назад', callback_data: `${CALLBACKS.OP_OPEN}:${r.id}` }]]
  );
}

async function operatorSendReply(opChatId, text) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const st = await getBotStateData(opChatId);
  const rid = st && st.help_op_request_id ? String(st.help_op_request_id) : '';
  if (!rid) return showOperatorPanel(opChatId);
  const r = await supabase.supportGetRequestById(rid);
  if (!r) return showOperatorPanel(opChatId);
  const clean = String(text || '').trim();
  if (!clean) return;
  await supabase.supportAppendMessage(rid, { from: 'operator', text: clean, operatorChatId: String(opChatId) });
  await HelpTelegram.sendMessage(String(r.user_chat_id), '💬 Відповідь підтримки:\n\n' + clean);
  await HelpTelegram.sendKeyboard(opChatId, '✅ Відправлено.', [[{ text: '⬅️ Назад', callback_data: `${CALLBACKS.OP_OPEN}:${rid}` }]]);
}

async function operatorClose(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  await supabase.supportCloseRequest(String(requestId), { closedBy: 'operator', operatorChatId: String(opChatId) });
  await HelpTelegram.sendMessage(opChatId, '✅ Закрито.');
  await showOperatorPanel(opChatId);
}

async function operatorGenerateInvite(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const r = await supabase.supportGetRequestById(String(requestId));
  if (!r) return showOperatorPanel(opChatId);
  const code = await supabase.supportGenerateUniversalInvite({ operatorChatId: String(opChatId) });
  if (!code) {
    await HelpTelegram.sendMessage(opChatId, '❌ Не вдалося згенерувати інвайт.');
    return;
  }
  await supabase.supportAppendMessage(String(requestId), { from: 'operator', text: `Generated invite: ${code}`, operatorChatId: String(opChatId) });
  await HelpTelegram.sendMessage(
    String(r.user_chat_id),
    'Повернись у платформу FIT 3.0 і введи інвайт-код у меню «🎟️ У мене є інвайт код».'
  );
  await HelpTelegram.sendMessage(String(r.user_chat_id), code);
  await HelpTelegram.sendMessage(opChatId, '✅ Інвайт відправлено користувачу: ' + code);
  await showRequestCard(opChatId, requestId);
}

async function operatorAskDeleteConfirm(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const r = await supabase.supportGetRequestById(String(requestId));
  if (!r) return showOperatorPanel(opChatId);
  const kb = [
    [{ text: '⚠️ Так, видалити назавжди', callback_data: `${CALLBACKS.OP_DELETE_EXEC}:${r.id}` }],
    [{ text: '❌ Скасувати', callback_data: `${CALLBACKS.OP_OPEN}:${r.id}` }]
  ];
  await HelpTelegram.sendKeyboard(opChatId, `⚠️ Видалити дані користувача назавжди?\n\nuser_chat_id: ${r.user_chat_id}\nrequest_id: ${r.id}`, kb);
}

async function operatorDeleteUserExec(opChatId, requestId) {
  if (!HelpHelpers.isHelpOperator(opChatId)) return;
  const r = await supabase.supportGetRequestById(String(requestId));
  if (!r) return showOperatorPanel(opChatId);
  const target = String(r.user_chat_id);
  // Reuse admin delete cascade logic: decide by role
  const user = await supabase.getUserByChatId(target);
  let ok = false;
  const role = (user && user.role) ? String(user.role).toLowerCase() : '';
  if (role === 'coach') ok = await supabase.adminDeleteCoachCascade(target);
  else ok = await supabase.adminDeleteStudentCascade(target);
  await supabase.supportAppendMessage(String(requestId), { from: 'operator', text: `Delete user executed: ${ok ? 'OK' : 'FAIL'}`, operatorChatId: String(opChatId) });
  if (ok) {
    await HelpTelegram.sendMessage(opChatId, '✅ Дані видалено.');
  } else {
    await HelpTelegram.sendMessage(opChatId, '❌ Не вдалося видалити дані (перевір логи).');
  }
  await operatorClose(opChatId, requestId);
}

async function handleText(chatId, text) {
  const t = String(text || '');
  if (t.trim().toLowerCase() === '/start') {
    await showMenu(chatId);
    return;
  }

  // Operator reply mode
  if (HelpHelpers.isHelpOperator(chatId)) {
    const st = await getBotStateData(chatId);
    if (st && st.step === STEPS.OP_REPLY) {
      await operatorSendReply(chatId, t);
      return;
    }
  }

  const st = await getBotStateData(chatId);
  if (st && st.step === STEPS.USER_THREAD) {
    await userAppendMessage(chatId, t);
    return;
  }

  await showMenu(chatId);
}

async function handleCallback(chatId, callbackData, callbackQueryId) {
  if (callbackQueryId) HelpTelegram.answerCallbackQuery(callbackQueryId).catch(() => {});
  if (!callbackData) return;
  const [action, p1] = String(callbackData).split(':');
  if (action === CALLBACKS.MENU) return showMenu(chatId);
  if (action === CALLBACKS.TOPIC) return startTopic(chatId, p1);
  if (action === CALLBACKS.END_THREAD) return endUserThread(chatId, p1);

  if (action === CALLBACKS.OP_PANEL) return showOperatorPanel(chatId);
  if (action === CALLBACKS.OP_OPEN) return showRequestCard(chatId, p1);
  if (action === CALLBACKS.OP_REPLY) return operatorStartReply(chatId, p1);
  if (action === CALLBACKS.OP_CLOSE) return operatorClose(chatId, p1);
  if (action === CALLBACKS.OP_INVITE_GEN) return operatorGenerateInvite(chatId, p1);
  if (action === CALLBACKS.OP_DELETE_CONFIRM) return operatorAskDeleteConfirm(chatId, p1);
  if (action === CALLBACKS.OP_DELETE_EXEC) return operatorDeleteUserExec(chatId, p1);

  await showMenu(chatId);
}

async function route(update) {
  const data = HelpHelpers.extractMessage(update);
  if (!data || !data.chatId) return;
  if (data.type === 'text') return handleText(data.chatId, data.text);
  if (data.type === 'callback') return handleCallback(data.chatId, data.callbackData, data.callbackQueryId);
}

module.exports = { route };

