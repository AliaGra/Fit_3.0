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
    step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WEIGHT,
    profileGoalsDraft: draft
  });
  await askProfileGoalsWeight(chatId, user);
}

async function askProfileGoalsWeight(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WEIGHT });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_WEIGHT }]];
  const userCtx = buildOwnGoalsUserCtx(user);
  const hint = buildGoalPromptHint('goal_weight', userCtx);
  await Helpers.sendKeyboard(
    chatId,
    '🎯 **Бажані параметри тіла**\n\n' + hint + 'Введи бажану вагу (кг)\nПриклад: 72.5\nАбо натисни «Пропустити», щоб залишити попереднє значення.',
    keyboard
  );
}

async function askProfileGoalsWaist(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WAIST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_WAIST }]];
  const hint = buildGoalPromptHint('goal_waist', buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    hint + 'Введи бажану талію (см)\nПриклад: 78.0\nАбо «Пропустити».',
    keyboard
  );
}

async function askProfileGoalsHips(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_HIPS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_HIPS }]];
  const hint = buildGoalPromptHint('goal_hips', buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    hint + 'Введи бажаний обхват ягідниць (см)\nПриклад: 98.0\nАбо «Пропустити».',
    keyboard
  );
}

async function askProfileGoalsShoulders(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_SHOULDERS });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_SHOULDERS }]];
  const hint = buildGoalPromptHint('goal_shoulders', buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    hint + 'Введи бажаний обхват плечей (см)\nПриклад: 118.0\nАбо «Пропустити».',
    keyboard
  );
}

async function askProfileGoalsChest(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_CHEST });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_CHEST }]];
  const hint = buildGoalPromptHint('goal_chest', buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    hint + 'Введи бажаний обхват грудей (см)\nПриклад: 102.0\nАбо «Пропустити».',
    keyboard
  );
}

async function askProfileGoalsArm(chatId, user) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_ARM });
  const keyboard = [[{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_ARM }]];
  const hint = buildGoalPromptHint('goal_arm', buildOwnGoalsUserCtx(user));
  await Helpers.sendKeyboard(
    chatId,
    hint + 'Введи бажаний обхват біцепса (см)\nПриклад: 36.0\nАбо «Пропустити».',
    keyboard
  );
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

  if (action === CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS) {
    await startProfileGoalsEdit(chatId);
    return true;
  }

  const user = await User.getByChatId(chatId);
  if (!user) return false;

  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_WEIGHT) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WEIGHT) return false;
    await askProfileGoalsWaist(chatId, user);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_WAIST) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WAIST) return false;
    await askProfileGoalsHips(chatId, user);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_HIPS) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_HIPS) return false;
    await askProfileGoalsShoulders(chatId, user);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_SHOULDERS) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_SHOULDERS) return false;
    await askProfileGoalsChest(chatId, user);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_CHEST) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_CHEST) return false;
    await askProfileGoalsArm(chatId, user);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PROFILE_GOALS_SKIP_ARM) {
    const st = await State.get(chatId);
    if (!st || st.step !== CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_ARM) return false;
    await finishProfileGoalsSave(chatId);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  const step = state.step;
  const profileSteps = [
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WEIGHT,
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WAIST,
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_HIPS,
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_SHOULDERS,
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_CHEST,
    CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_ARM
  ];
  if (!profileSteps.includes(step)) return false;

  const user = await User.getByChatId(chatId);
  if (!user) {
    await State.clear(chatId);
    return true;
  }
  const latest = await supabase.getLatestMeasurementsForGoals(chatId);
  const draft = { ...(state.profileGoalsDraft || emptyDraftFromBaseline(null)) };

  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WEIGHT) {
    const check = bodyGoals.validateGoalField('goal_weight', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_weight = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_weight', check.value, user, latest);
    await askProfileGoalsWaist(chatId, user);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_WAIST) {
    const check = bodyGoals.validateGoalField('goal_waist', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_waist = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_waist', check.value, user, latest);
    await askProfileGoalsHips(chatId, user);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_HIPS) {
    const check = bodyGoals.validateGoalField('goal_hips', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_hips = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_hips', check.value, user, latest);
    await askProfileGoalsShoulders(chatId, user);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_SHOULDERS) {
    const check = bodyGoals.validateGoalField('goal_shoulders', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_shoulders = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_shoulders', check.value, user, latest);
    await askProfileGoalsChest(chatId, user);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_CHEST) {
    const check = bodyGoals.validateGoalField('goal_chest', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_chest = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_chest', check.value, user, latest);
    await askProfileGoalsArm(chatId, user);
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.PROFILE_BODY_GOALS_ARM) {
    const check = bodyGoals.validateGoalField('goal_arm', String(text).trim(), user.height);
    if (!check.valid) {
      await Helpers.safeSend(chatId, '⚠️ ' + check.error);
      return true;
    }
    draft.goal_arm = check.value;
    await State.update(chatId, { profileGoalsDraft: draft });
    await sendRealismAfterInput(chatId, 'goal_arm', check.value, user, latest);
    await finishProfileGoalsSave(chatId);
    return true;
  }
  return false;
}

module.exports = {
  handleCallback,
  handleTextMessage
};
