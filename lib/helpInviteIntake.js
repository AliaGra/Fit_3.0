/**
 * Help-bot: покроковий збір даних для запиту інвайту (імʼя, прізвище, область/місто).
 * Дані зберігаються в support_requests.tech_json.invite_prefill для основного бота.
 */
const HelpTelegram = require('./helpTelegram');
const supabase = require('./supabase');
const { CONSTANTS } = require('./constants');

const STEPS = Object.freeze({
  FIRST: 'help_invite_first_name',
  LAST: 'help_invite_last_name',
  OBLAST: 'help_invite_oblast',
  CITY: 'help_invite_city'
});

const CALLBACKS = Object.freeze({
  LOC_OBLAST: 'HLP_INV_LOC_OBLAST',
  LOC_CITY: 'HLP_INV_LOC_CITY'
});

function nowIso() {
  return new Date().toISOString();
}

function nameLimits() {
  const v = CONSTANTS.VALIDATION || {};
  return {
    firstMin: v.NAME_MIN_LENGTH != null ? v.NAME_MIN_LENGTH : 2,
    firstMax: v.NAME_MAX_LENGTH != null ? v.NAME_MAX_LENGTH : 30,
    lastMin: v.LASTNAME_MIN_LENGTH != null ? v.LASTNAME_MIN_LENGTH : 2,
    lastMax: v.LASTNAME_MAX_LENGTH != null ? v.LASTNAME_MAX_LENGTH : 50
  };
}

function isInviteIntakeStep(step) {
  return step === STEPS.FIRST || step === STEPS.LAST || step === STEPS.OBLAST || step === STEPS.CITY;
}

function getDraft(state) {
  return state && state.help_invite_draft && typeof state.help_invite_draft === 'object' ? { ...state.help_invite_draft } : {};
}

async function persistState(chatId, patch) {
  const row = await supabase.getStateRow(String(chatId));
  const data = row && row.data && typeof row.data === 'object' ? { ...row.data, ...patch, updated_at: nowIso() } : { ...patch, updated_at: nowIso() };
  await supabase.setStateRow(String(chatId), data);
  return data;
}

async function notifyOperatorNewInviteData(chatId, requestId, summary) {
  const op = process.env.HELP_OPERATOR_CHAT_ID != null ? String(process.env.HELP_OPERATOR_CHAT_ID).trim() : '';
  if (!op) return;
  const u = await supabase.getUserByChatId(String(chatId));
  const opText =
    '📋 Дані для інвайту (з help-бота)\n\n' +
    `Імʼя: ${((u?.firstName || '') + ' ' + (u?.lastName || '')).trim() || '—'}\n` +
    `user_chat_id: ${chatId}\n` +
    `request_id: ${requestId}\n\n` +
    summary;
  const opKb = [[{ text: 'Відкрити', callback_data: `HLP_OP_OPEN:${requestId}` }]];
  await HelpTelegram.sendKeyboard(op, opText, opKb);
}

async function finishInviteIntake(chatId, draft, requestId) {
  const prefill = {
    firstName: String(draft.firstName || '').trim(),
    lastName: String(draft.lastName || '').trim(),
    city: String(draft.city || '').trim(),
    oblast: String(draft.oblast || '').trim(),
    rawText: [draft.firstName, draft.lastName, draft.oblast, draft.city].filter(Boolean).join(' ')
  };
  await supabase.supportMergeTechJson(requestId, { invite_prefill: prefill });
  const summary =
    `Імʼя: ${prefill.firstName}\n` +
    `Прізвище: ${prefill.lastName}\n` +
    `Область: ${prefill.oblast || '—'}\n` +
    `Місто: ${prefill.city}`;
  await supabase.supportAppendMessage(requestId, { from: 'user', text: summary });

  await persistState(chatId, {
    step: 'help_user_thread',
    help_request_id: String(requestId),
    help_topic: 'invite',
    help_invite_intake_done: true,
    help_invite_draft: null
  });

  await HelpTelegram.sendMessage(
    chatId,
    '✅ Дані збережено.\n\nОператор згенерує інвайт-код. Можеш написати додаткове повідомлення, якщо потрібно.'
  );
  await notifyOperatorNewInviteData(chatId, requestId, summary);
}

async function startInviteIntake(chatId, requestId) {
  await persistState(chatId, {
    step: STEPS.FIRST,
    help_request_id: String(requestId),
    help_topic: 'invite',
    help_invite_draft: {},
    help_invite_intake_done: false
  });
  await HelpTelegram.sendMessage(
    chatId,
    '🎟️ Запит інвайт-коду\n\n' +
      'Ці дані зʼявляться в основному боті після введення коду та прийняття оферти — їх можна буде підтвердити або змінити.\n\n' +
      '✏️ Введи **імʼя**:',
    { parse_mode: 'Markdown' }
  );
}

async function askOblast(chatId, draft, requestId) {
  await persistState(chatId, { step: STEPS.OBLAST, help_invite_draft: draft, help_request_id: requestId });
  await HelpTelegram.sendMessage(chatId, '🗺️ Місце проживання в Україні\n\nВведи **область** (від 2 літер):', { parse_mode: 'Markdown' });
}

async function handleInviteIntakeText(chatId, text, state) {
  const step = state.step;
  if (!isInviteIntakeStep(step)) return false;

  const draft = getDraft(state);
  const requestId = String(state.help_request_id || '');
  const lim = nameLimits();
  const t = String(text || '').trim();

  if (step === STEPS.FIRST) {
    if (t.length < lim.firstMin || t.length > lim.firstMax) {
      await HelpTelegram.sendMessage(chatId, `⚠️ Імʼя — від ${lim.firstMin} до ${lim.firstMax} символів. Спробуй ще раз:`);
      return true;
    }
    draft.firstName = t;
    await persistState(chatId, { step: STEPS.LAST, help_invite_draft: draft });
    await HelpTelegram.sendMessage(chatId, '✏️ Введи **прізвище**:', { parse_mode: 'Markdown' });
    return true;
  }

  if (step === STEPS.LAST) {
    if (t.length < lim.lastMin || t.length > lim.lastMax) {
      await HelpTelegram.sendMessage(chatId, `⚠️ Прізвище — від ${lim.lastMin} до ${lim.lastMax} символів. Спробуй ще раз:`);
      return true;
    }
    draft.lastName = t;
    await askOblast(chatId, draft, requestId);
    return true;
  }

  if (step === STEPS.OBLAST) {
    if (t.length < 2) {
      await HelpTelegram.sendMessage(chatId, '⚠️ Введи щонайменше 2 літери області:');
      return true;
    }
    const oblasts = await supabase.searchOblasts(t, 12);
    if (!oblasts.length) {
      await HelpTelegram.sendMessage(chatId, '❌ Не знайдено область. Спробуй інше написання (мін. 2 літери):');
      return true;
    }
    const keyboard = oblasts.map((o) => [{ text: o, callback_data: `${CALLBACKS.LOC_OBLAST}:${o}` }]);
    await HelpTelegram.sendKeyboard(chatId, 'Обери область зі списку:', keyboard);
    return true;
  }

  if (step === STEPS.CITY) {
    const oblast = String(draft.oblast || '').trim();
    if (!oblast) {
      await askOblast(chatId, draft, requestId);
      return true;
    }
    if (t.length < 3) {
      await HelpTelegram.sendMessage(chatId, '⚠️ Введи щонайменше 3 літери назви населеного пункту:');
      return true;
    }
    const cities = await supabase.searchCitiesInOblast(oblast, t, 12);
    if (!cities.length) {
      await HelpTelegram.sendMessage(chatId, '❌ Не знайдено. Спробуй інші 3+ літери:');
      return true;
    }
    const keyboard = cities.map((c) => [{ text: c, callback_data: `${CALLBACKS.LOC_CITY}:${c}` }]);
    keyboard.push([{ text: '⬅️ Змінити область', callback_data: `${CALLBACKS.LOC_OBLAST}:__BACK__` }]);
    await HelpTelegram.sendKeyboard(chatId, `Обери населений пункт (область: ${oblast}):`, keyboard);
    return true;
  }

  return false;
}

async function handleInviteIntakeCallback(chatId, action, param, state) {
  if (action !== CALLBACKS.LOC_OBLAST && action !== CALLBACKS.LOC_CITY) return false;

  const draft = getDraft(state);
  const requestId = String(state.help_request_id || '');

  if (action === CALLBACKS.LOC_OBLAST) {
    if (param === '__BACK__') {
      await askOblast(chatId, draft, requestId);
      return true;
    }
    draft.oblast = String(param || '').trim();
    await persistState(chatId, { step: STEPS.CITY, help_invite_draft: draft });
    await HelpTelegram.sendMessage(chatId, '🏙️ Введи назву **населеного пункту** (від 3 літер):', { parse_mode: 'Markdown' });
    return true;
  }

  if (action === CALLBACKS.LOC_CITY) {
    if (state.step !== STEPS.CITY && state.step !== STEPS.OBLAST) return false;
    draft.city = String(param || '').trim();
    if (!draft.oblast || !draft.city) {
      await HelpTelegram.sendMessage(chatId, '⚠️ Обери область і місто зі списку.');
      return true;
    }
    if (!requestId) {
      await HelpTelegram.sendMessage(chatId, '❌ Помилка звернення. Натисни /start і спробуй знову.');
      return true;
    }
    await finishInviteIntake(chatId, draft, requestId);
    return true;
  }

  return false;
}

module.exports = {
  STEPS,
  CALLBACKS,
  isInviteIntakeStep,
  startInviteIntake,
  handleInviteIntakeText,
  handleInviteIntakeCallback
};
