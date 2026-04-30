/**
 * Редагування бажаних параметрів тіла з профілю (учень / тренер — для себе).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const bodyGoals = require('./bodyGoals');

function buildOwnGoalsUserCtx(user) {
  if (!user) return null;
  return {
    height: user.height != null ? Number(user.height) : null,
    age: user.age != null ? Number(user.age) : null,
    gender: user.gender || 'unknown',
    wrist: user.wrist != null ? Number(user.wrist) : null,
    experienceStartDate: user.experienceStartDate || null,
    jobType: user.jobType || null,
    transportType: user.transportType || null,
    stepsCategory: user.stepsCategory || null,
    extraActivity: user.extraActivity || null
  };
}

function buildGoalPromptHint(goalField, userCtx) {
  if (!userCtx || userCtx.height == null || !userCtx.gender || userCtx.gender === 'unknown') return '';
  const model = bodyGoals.calcUnifiedIdealModel(userCtx);
  if (!model) return '';
  if (goalField === 'goal_weight' && model.weight && model.weight.medical && model.weight.aesthetic) {
    const med = model.weight.medical;
    const aest = model.weight.aesthetic;
    let block =
      `Орієнтир (medical): ${med.min}–${med.max} кг.\n` +
      `Орієнтир (aesthetic): ${aest.min}–${aest.max} кг.\n`;
    if (aest.comfort != null) block += `Комфортний орієнтир: ~${aest.comfort} кг.\n`;
    return block;
  }
  if (goalField === 'goal_waist' && model.waist) return `Орієнтирна вилка для талії: ${model.waist.min}–${model.waist.max} см.\n`;
  if (goalField === 'goal_hips' && model.hips) return `Орієнтирна вилка для ягідниць: ${model.hips.min}–${model.hips.max} см.\n`;
  if (goalField === 'goal_shoulders' && model.shoulders) return `Орієнтирна вилка для плечей: ${model.shoulders.min}–${model.shoulders.max} см.\n`;
  if (goalField === 'goal_chest' && model.chest) return `Орієнтирна вилка для грудей: ${model.chest.min}–${model.chest.max} см.\n`;
  if (goalField === 'goal_arm' && model.biceps) return `Орієнтирна вилка для біцепса: ${model.biceps.min}–${model.biceps.max} см.\n`;
  return '';
}

function buildGoalRealismText(goalField, goalValue, currentValue, userCtx) {
  const realism = bodyGoals.evaluateGoalRealism(goalField, goalValue, currentValue, userCtx);
  if (!realism) return '';
  const term =
    realism.weeks != null
      ? `Орієнтовний строк: ~${realism.weeks} тиж.`
      : realism.months != null
        ? `Орієнтовний строк: ~${realism.months} міс.`
        : '';
  return `📌 Реалістичність цілі: ${realism.verdict}${term ? '\n' + term : ''}`;
}

function pickCurrentForRealism(goalField, user, latest) {
  const L = latest || {};
  if (goalField === 'goal_weight') return L.weight != null ? L.weight : user.weight != null ? user.weight : null;
  if (goalField === 'goal_waist') return L.waist != null ? L.waist : user.waist != null ? user.waist : null;
  if (goalField === 'goal_hips') return L.glutes != null ? L.glutes : user.glutes != null ? user.glutes : null;
  if (goalField === 'goal_shoulders') return L.shoulders != null ? L.shoulders : user.shoulders != null ? user.shoulders : null;
  if (goalField === 'goal_chest') return L.chest != null ? L.chest : user.chest != null ? user.chest : null;
  if (goalField === 'goal_arm') return L.arm != null ? L.arm : user.arm != null ? user.arm : null;
  return null;
}

async function sendRealismAfterInput(chatId, goalField, goalValue, user, latest) {
  const userCtx = buildOwnGoalsUserCtx(user);
  const cur = pickCurrentForRealism(goalField, user, latest);
  const txt = buildGoalRealismText(goalField, goalValue, cur, userCtx);
  if (txt) await Helpers.safeSend(chatId, txt);
}

function emptyDraftFromBaseline(baseline) {
  const b = baseline || {};
  return {
    goal_weight: b.goal_weight != null ? b.goal_weight : null,
    goal_waist: b.goal_waist != null ? b.goal_waist : null,
    goal_hips: b.goal_hips != null ? b.goal_hips : null,
    goal_shoulders: b.goal_shoulders != null ? b.goal_shoulders : null,
    goal_chest: b.goal_chest != null ? b.goal_chest : null,
    goal_arm: b.goal_arm != null ? b.goal_arm : null
  };
}

const PROFILE_GOAL_FIELDS = [
  { key: 'goal_weight', text: '⚖️ Вага', example: '72.5', unit: 'кг' },
  { key: 'goal_waist', text: '⭕ Талія', example: '78.0', unit: 'см' },
  { key: 'goal_hips', text: '⭕ Ягодиці', example: '98.0', unit: 'см' },
  { key: 'goal_shoulders', text: '📐 Плечі', example: '118.0', unit: 'см' },
  { key: 'goal_chest', text: '📐 Груди', example: '102.0', unit: 'см' },
  { key: 'goal_arm', text: '💪 Біцепс', example: '36.0', unit: 'см' }
];

function formatGoalValue(value, unit) {
  if (value == null) return null;
  return `${value} ${unit}`.trim();
}

function buildGoalsPickerKeyboard(draft) {
  const d = draft || {};
  const keyboard = [];
  for (let i = 0; i < PROFILE_GOAL_FIELDS.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < PROFILE_GOAL_FIELDS.length; j++) {
      const f = PROFILE_GOAL_FIELDS[j];
      const v = formatGoalValue(d[f.key], f.unit);
      const label = v ? `${f.text}: ${v}` : f.text;
      row.push({
        text: label.slice(0, 64),
        callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PROFILE_GOALS_PICK}:${f.key}`
      });
    }
    keyboard.push(row);
  }
  keyboard.push([{ text: '💾 Зберегти', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SAVE }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  return keyboard;
}

async function showProfileGoalsPicker(chatId, user, notice = null) {
  const st = await State.get(chatId);
  const draft = (st && st.profileGoalsDraft) || emptyDraftFromBaseline(null);
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_EDIT_VALUE, profileGoalsEditField: null });
  const prefix = notice ? String(notice).trim() + '\n\n' : '';
  await Helpers.sendKeyboard(
    chatId,
    prefix +
      '🎯 Бажані параметри тіла\n\n' +
      '💡 Тут можна вибірково змінювати цілі, як у меню оновлення замірів.\n\n' +
      'Обери параметр, який хочеш змінити:',
    buildGoalsPickerKeyboard(draft)
  );
}

async function askProfileGoalField(chatId, user, goalField) {
  const meta = PROFILE_GOAL_FIELDS.find((x) => x.key === goalField);
  if (!meta) return;
  const hint = buildGoalPromptHint(goalField, buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    `${hint}Введи бажане значення для «${meta.text}» (${meta.unit})\nПриклад: ${meta.example}`,
    [[{ text: '🔙 До меню бажаних параметрів', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS }]]
  );
}

async function startProfileGoalsEdit(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || (user.role !== CONSTANTS.ROLES.STUDENT && user.role !== CONSTANTS.ROLES.COACH)) {
    await Helpers.safeSend(chatId, '❌ Недоступно для цієї ролі.');
    return;
  }
  if (!user.height) {
    await Helpers.safeSend(chatId, '⚠️ Спочатку вкажи зріст у профілі (✏️ Редагувати дані → Зріст).');
    return;
  }
  const baseline = await supabase.getBodyGoals(chatId);
  const draft = emptyDraftFromBaseline(baseline);
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_EDIT_VALUE,
    profileGoalsDraft: draft,
    profileGoalsEditField: null
  });
  await showProfileGoalsPicker(chatId, user);
}

async function finishProfileGoalsSave(chatId) {
  const st = await State.get(chatId);
  const draft = (st && st.profileGoalsDraft) || {};
  const goals = {
    goal_weight: draft.goal_weight != null ? draft.goal_weight : null,
    goal_waist: draft.goal_waist != null ? draft.goal_waist : null,
    goal_hips: draft.goal_hips != null ? draft.goal_hips : null,
    goal_shoulders: draft.goal_shoulders != null ? draft.goal_shoulders : null,
    goal_chest: draft.goal_chest != null ? draft.goal_chest : null,
    goal_arm: draft.goal_arm != null ? draft.goal_arm : null
  };
  const result = await bodyGoals.saveBodyGoals(null, chatId, goals);
  await State.clear(chatId);
  const Profile = require('./profile');
  if (!result.saved) {
    await Helpers.safeSend(chatId, '⚠️ ' + (result.error || 'Не вдалося зберегти.'));
    await Profile.show(chatId);
    return;
  }
  let tail = '';
  try {
    tail = await bodyGoals.showGoalsToStudent(chatId);
  } catch (_) {
    tail = result.coachSummary || '';
  }
  await Helpers.safeSend(chatId, '✅ Бажані параметри збережено.\n\n' + (tail || ''));
  await Profile.show(chatId);
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS) {
    await startProfileGoalsEdit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PROFILE_GOALS_PICK && param) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_EDIT_VALUE) return false;
    const goalField = param.trim();
    const known = PROFILE_GOAL_FIELDS.some((f) => f.key === goalField);
    if (!known) return false;
    const user = await User.getByChatId(chatId);
    if (!user) return false;
    await State.update(chatId, { profileGoalsEditField: goalField });
    await askProfileGoalField(chatId, user, goalField);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SAVE) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_EDIT_VALUE) return false;
    await finishProfileGoalsSave(chatId);
    return true;
  }

  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
  if (step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_EDIT_VALUE || !state.profileGoalsEditField) return false;

  const user = await User.getByChatId(chatId);
  if (!user) {
    await State.clear(chatId);
    return true;
  }
  const goalField = String(state.profileGoalsEditField);
  const latest = await supabase.getLatestMeasurementsForGoals(chatId);
  const draft = { ...(state.profileGoalsDraft || emptyDraftFromBaseline(null)) };
  const check = bodyGoals.validateGoalField(goalField, String(text).trim(), user.height, buildOwnGoalsUserCtx(user));
  if (!check.valid) {
    await Helpers.safeSend(chatId, '⚠️ ' + check.error);
    return true;
  }
  draft[goalField] = check.value;
  await State.update(chatId, { profileGoalsDraft: draft, profileGoalsEditField: null });
  await sendRealismAfterInput(chatId, goalField, check.value, user, latest);
  await showProfileGoalsPicker(chatId, user, '✅ Бажаний параметр оновлено.');
  return true;
}

module.exports = {
  handleCallback,
  handleTextMessage
};
