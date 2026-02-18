/**
 * Програма тренувань учня: список планів, авто-генерація, активація (Логіка складання плану тренувань.md, розд. 8).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const planGenerator = require('./planGenerator');

/** Показати списки планів учня та кнопку «Новий план». */
async function showPlanList(chatId, studentChatId) {
  const coach = await User.getByChatId(chatId);
  if (!coach || coach.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '⛔ Доступ тільки для тренера.');
    return;
  }
  const student = await User.getByChatId(studentChatId);
  if (!student || String(student.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }

  const plans = await supabase.getPlansByStudent(studentChatId);
  const studentName = (student.firstName || '') + ' ' + (student.lastName || '').trim() || 'Учень';

  let text = '📋 **Програма тренувань: ' + studentName + '**\n\n';
  if (plans.length === 0) {
    text += 'Планів ще немає. Натисни «➕ Новий план» і обери «Авто-підбір», щоб згенерувати план за профілем учня.';
  } else {
    for (const p of plans) {
      text += (p.isActive ? '✅ ' : '📄 ') + (p.planName || 'План') + ' — ' + (p.daysPerWeek || '?') + ' дн./тиж';
      if (p.isActive) text += ' _(активний)_';
      text += '\n';
    }
  }

  const keyboard = [];
  for (const p of plans) {
    const label = (p.planName || 'План').slice(0, 28) + (p.isActive ? ' ✓' : '');
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW + ':' + p.planId }]);
  }
  keyboard.push([{ text: '➕ Новий план', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + studentChatId }]);
  keyboard.push([{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]);

  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Вибір типу створення: Вручну / Авто-підбір. */
async function showPlanTypeSelect(chatId, studentChatId) {
  await State.set(chatId, { planStudentChatId: studentChatId });
  const keyboard = [
    [{ text: '✏️ Вручну', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_MANUAL + ':' + studentChatId }, { text: '⚙️ Авто-підбір', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO + ':' + studentChatId }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '📋 Новий план\n\nОбери спосіб створення:\n• **Вручну** — назва, ціль, рівень, дні/тиж, потім можна додати вправи.\n• **Авто-підбір** — план згенерується за профілем учня.', keyboard, { parse_mode: 'Markdown' });
}

/** ——— Ручне створення плану: назва → ціль → рівень → дні → збереження ——— */
async function askPlanName(chatId, studentChatId) {
  await State.set(chatId, { planStudentChatId: studentChatId, step: CONSTANTS.FSM_STATES.PLAN_SET_NAME });
  await Helpers.safeSend(chatId, '✏️ **Вручну: новий план**\n\nВведіть назву плану (наприклад: Силовий 3 дні):');
}

async function askPlanGoal(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SET_GOAL });
  const keyboard = [
    [{ text: 'Схуднути', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GOAL + ':lose' }, { text: 'Набрати масу', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GOAL + ':gain' }],
    [{ text: 'Підтримувати форму', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GOAL + ':keep' }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + (await State.get(chatId))?.planStudentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Оберіть ціль плану:', keyboard);
}

async function askPlanLevel(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SET_LEVEL });
  const keyboard = [
    [{ text: 'Початковий', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL + ':beginner' }, { text: 'Середній', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL + ':intermediate' }],
    [{ text: 'Просунутий', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL + ':advanced' }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + (await State.get(chatId))?.planStudentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '📊 Оберіть рівень складності:', keyboard);
}

async function askPlanDays(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SET_DAYS });
  const state = await State.get(chatId);
  const studentChatId = state?.planStudentChatId || '';
  const keyboard = [
    [{ text: '2 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS + ':2' }, { text: '3 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS + ':3' }],
    [{ text: '4 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS + ':4' }, { text: '5 днів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS + ':5' }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '📆 Скільки тренувальних днів на тиждень?', keyboard);
}

/** Підсумок профілю та кнопка «Генерувати». */
async function showAutoSummary(chatId, studentChatId) {
  const user = await supabase.getUserByChatId(studentChatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }
  const experienceDays = planGenerator.getExperienceDays(user);
  const level = planGenerator.getLevelFromExperienceDays(experienceDays);
  const daysPerWeek = user.trainingDaysPerWeek != null ? user.trainingDaysPerWeek : planGenerator.getDefaultDaysPerWeek(level);
  const goal = user.goal || 'keep';
  const medList = await supabase.getActiveMedicalConditions(studentChatId);

  const goalLabel = goal === 'lose' ? 'Схуднення' : goal === 'gain' ? 'Набір маси' : 'Підтримка';
  const levelLabel = level === 'beginner' ? 'Початковий' : level === 'intermediate' ? 'Середній' : 'Просунутий';

  let text = '⚙️ **Авто-підбір плану**\n\n';
  text += 'Профіль учня:\n';
  text += '• Ціль: ' + goalLabel + '\n';
  text += '• Рівень: ' + levelLabel + '\n';
  text += '• Тренувань на тиждень: ' + daysPerWeek + '\n';
  if (medList.length > 0) {
    text += '• Медичні стани: ' + medList.length + ' (враховано при підборі вправ)\n';
  }
  text += '\nНатисни **Генерувати**, щоб створити план.';

  const keyboard = [
    [{ text: '⚙️ Генерувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE + ':' + studentChatId }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + studentChatId }]
  ];
  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Перегляд плану (дні та вправи). */
async function showPlanDetail(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan) {
    await Helpers.safeSend(chatId, '❌ План не знайдено.');
    await showPlanList(chatId, studentChatId);
    return;
  }

  let text = '📋 **' + (plan.planName || 'План') + '**\n';
  text += 'Рівень: ' + (plan.level || '') + ' · ' + (plan.daysPerWeek || '') + ' дн./тиж\n\n';

  const byDay = {};
  for (const ex of plan.exercises || []) {
    const d = ex.dayNumber;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ex);
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  for (const d of days) {
    const first = byDay[d][0];
    text += '**День ' + d + '** — ' + (first.dayLabel || '') + '\n';
    for (const ex of byDay[d]) {
      text += '  • ' + (ex.exerciseName || '') + ' — ' + (ex.sets || '') + '×' + (ex.reps || '') + (ex.restSec ? ', відпочинок ' + ex.restSec + ' с' : '') + '\n';
    }
    text += '\n';
  }

  const keyboard = [
    plan.isActive
      ? [{ text: '✅ Активний план', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
      : [{ text: '🎯 Активувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE + ':' + planId }],
    [{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE + ':' + planId }],
    [{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ];
  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST && param) {
    await showPlanList(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW && param) {
    await showPlanTypeSelect(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_MANUAL && param) {
    await askPlanName(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GOAL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_GOAL) return false;
    const goal = param.trim();
    if (!['lose', 'gain', 'keep'].includes(goal)) return false;
    await State.update(chatId, { planManualGoal: goal });
    await askPlanLevel(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_LEVEL) return false;
    const level = param.trim();
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) return false;
    await State.update(chatId, { planManualLevel: level });
    await askPlanDays(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_DAYS) return false;
    const days = parseInt(String(param).trim(), 10);
    if (days < 2 || days > 5) return false;
    const studentChatId = state.planStudentChatId;
    if (!studentChatId) {
      await Helpers.safeSend(chatId, '❌ Обери учня знову.');
      await showPlanList(chatId, studentChatId);
      return true;
    }
    await Helpers.safeSend(chatId, '⏳ Зберігаю план...');
    const planId = await supabase.insertTrainingPlan({
      coachId: chatId,
      studentId: studentChatId,
      planName: String(state.planManualName || 'План').trim() || 'План вручну',
      goal: state.planManualGoal || 'keep',
      level: state.planManualLevel || 'beginner',
      daysPerWeek: days,
      description: 'Складено тренером вручну',
      isActive: false,
      isTemplate: false,
      generationType: 'manual'
    });
    if (!planId) {
      await Helpers.safeSend(chatId, '❌ Не вдалося зберегти план.');
      await showPlanList(chatId, studentChatId);
      return true;
    }
    await State.update(chatId, { step: undefined, planManualName: undefined, planManualGoal: undefined, planManualLevel: undefined });
    await Helpers.safeSend(chatId, '✅ План **' + (state.planManualName || 'План').trim() + '** створено.\n\nМожна активувати для учня або додати вправи пізніше (редагування плану в розробці).');
    const plan = await supabase.getPlanWithExercises(planId);
    if (plan) await showPlanDetail(chatId, planId, studentChatId);
    else await showPlanList(chatId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO && param) {
    await showAutoSummary(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE && param) {
    const studentChatId = param;
    await Helpers.safeSend(chatId, '⏳ Генерую план...');
    const state = await State.get(chatId);
    const result = await planGenerator.generateTrainingPlan(studentChatId, {
      coachId: chatId,
      isActive: false
    });
    if (!result) {
      await Helpers.safeSend(chatId, '❌ Не вдалося згенерувати план. Перевір профіль учня (ціль, рівень досвіду, тренувальних днів).');
      await showPlanList(chatId, studentChatId);
      return true;
    }
    await Helpers.safeSend(chatId, '✅ План створено: **' + result.planName + '**\n' + result.daysPerWeek + ' дн./тиж, рівень ' + result.level + '.');
    await showPlanDetail(chatId, result.planId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE && param) {
    const planId = param;
    const state = await State.get(chatId);
    const studentChatId = state && state.planStudentChatId ? state.planStudentChatId : null;
    if (!studentChatId) {
      await Helpers.safeSend(chatId, '❌ Обери учня знову зі списку.');
      return true;
    }
    const ok = await supabase.setPlanActiveForStudent(planId, studentChatId);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ План активовано для учня.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося активувати.');
    }
    await showPlanList(chatId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE && param) {
    const planId = param;
    const state = await State.get(chatId);
    const studentChatId = state && state.planStudentChatId ? state.planStudentChatId : null;
    const ok = await supabase.deleteTrainingPlan(planId);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ План видалено.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося видалити.');
    }
    if (studentChatId) await showPlanList(chatId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW && param) {
    const planId = param;
    const state = await State.get(chatId);
    let studentChatId = state && state.planStudentChatId ? state.planStudentChatId : null;
    if (!studentChatId) {
      const plan = await supabase.getPlanWithExercises(planId);
      studentChatId = plan && plan.studentId ? plan.studentId : null;
    }
    await showPlanDetail(chatId, planId, studentChatId || '');
    return true;
  }

  return false;
}

/** Обробка тексту при ручному створенні плану (назва). */
async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_NAME) return false;
  const name = String(text || '').trim();
  if (name.length < 2) {
    await Helpers.safeSend(chatId, '⚠️ Введіть назву плану (мінімум 2 символи).');
    return true;
  }
  await State.update(chatId, { planManualName: name });
  await askPlanGoal(chatId);
  return true;
}

module.exports = {
  showPlanList,
  handleCallback,
  handleTextMessage
};
