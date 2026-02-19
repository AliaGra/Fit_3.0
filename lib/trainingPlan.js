/**
 * Програма тренувань учня: список планів, авто-генерація, активація (Логіка складання плану тренувань.md, розд. 8).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const planGenerator = require('./planGenerator');

const MAX_BUTTONS_PER_PAGE = 20;
const MAX_EXERCISE_BUTTON_LENGTH = 50;

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
  if (days.length === 0) {
    text += '_Поки що в плані немає вправ._\n\nНатисни **➕ Додати вправи**, щоб заповнити дні.\n\n';
  } else {
    for (const d of days) {
      const first = byDay[d][0];
      text += '**День ' + d + '** — ' + (first.dayLabel || '') + '\n';
      for (const ex of byDay[d]) {
        text += '  • ' + (ex.exerciseName || '') + ' — ' + (ex.sets || '') + '×' + (ex.reps || '') + (ex.restSec ? ', відпочинок ' + ex.restSec + ' с' : '') + '\n';
        if (ex.notes && ex.notes.trim()) text += '    💬 Тренер: ' + ex.notes.trim().replace(/\n/g, ' ') + '\n';
      }
      text += '\n';
    }
  }

  const keyboard = [
    [{ text: '➕ Додати вправи', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT + ':' + planId }],
    plan.isActive
      ? [{ text: '✅ Активний план', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
      : [{ text: '🎯 Активувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE + ':' + planId }],
    [{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE + ':' + planId }],
    [{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ];
  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function showPlanEditDaySelect(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan) {
    await Helpers.safeSend(chatId, '❌ План не знайдено.');
    if (studentChatId) await showPlanList(chatId, studentChatId);
    return;
  }
  const daysPerWeek = plan.daysPerWeek != null ? plan.daysPerWeek : Math.max(3, ...(plan.exercises || []).map((e) => e.dayNumber || 0));
  const dayConfigs = planGenerator.getSplitSchemeAndDays(plan.level || 'beginner', daysPerWeek).dayConfigs || [];
  const keyboard = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    const label = (dayConfigs.find((x) => x.dayNumber === d)?.dayLabelUA) || ('День ' + d);
    keyboard.push([{ text: 'День ' + d + ': ' + label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + d }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW + ':' + planId }]);

  await State.update(chatId, { planStudentChatId: studentChatId, planEditPlanId: planId });
  await Helpers.sendKeyboard(chatId, '➕ **Додавання вправ**\n\nОбери день, у який додати вправи:', keyboard, { parse_mode: 'Markdown' });
}

async function showPlanEditTopGroups(chatId) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  if (!planId || !dayNum) {
    await Helpers.safeSend(chatId, '❌ Не вдалося визначити план/день. Відкрий план ще раз.');
    return;
  }
  const keyboard = (CONSTANTS.TOP_LEVEL_GROUPS || []).map((g) => [
    { text: g, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + g }
  ]);
  keyboard.push([{ text: '🔎 Пошук за назвою', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SEARCH }]);
  keyboard.push([{ text: '🔙 До вибору дня', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT + ':' + planId }]);
  await Helpers.sendKeyboard(chatId, '📂 **День ' + dayNum + '**\n\nОбери групу вправ або пошук за назвою:', keyboard, { parse_mode: 'Markdown' });
}

async function showPlanEditSecondLevelGroups(chatId, level1) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const list = (CONSTANTS.GROUPS_BY_TOP && CONSTANTS.GROUPS_BY_TOP[level1]) ? CONSTANTS.GROUPS_BY_TOP[level1] : [];
  const keyboard = [];
  if (list && list.length) {
    for (const g2 of list) {
      keyboard.push([{ text: g2, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1 + ':' + g2 }]);
    }
  }
  keyboard.push([{ text: '📋 Всі вправи тут', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1 + ':__all__' }]);
  keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum }]);
  await Helpers.sendKeyboard(chatId, '📂 ' + level1 + '\n\nОбери підгрупу або переглянь всі вправи:', keyboard);
}

async function showPlanEditExercises(chatId, level1, level2) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const exercises = await supabase.getExercisesByGroup(level1, level2Arg, null);
  if (!exercises || exercises.length === 0) {
    await Helpers.safeSend(chatId, '❌ У цій групі немає вправ.');
    await showPlanEditSecondLevelGroups(chatId, level1);
    return;
  }
  const header = [level1, level2Arg].filter(Boolean).join(' → ') || level1;
  const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: level2Arg ? (CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1) : (CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum) }]);
  await Helpers.sendKeyboard(chatId, '🏋️ ' + header + '\n\nОбери вправу для додавання в план:', keyboard);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();
  const parts = String(callbackData || '').split(':');

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

  // ——— Ручне наповнення плану вправами ———
  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT && param) {
    const planId = param.trim();
    const state = await State.get(chatId);
    const studentChatId = state?.planStudentChatId || '';
    await showPlanEditDaySelect(chatId, planId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY && parts.length >= 3) {
    const planId = parts[1].trim();
    const dayNum = parseInt(parts[2].trim(), 10);
    if (!planId || isNaN(dayNum) || dayNum < 1 || dayNum > 7) return false;
    await State.update(chatId, {
      step: CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY,
      planEditPlanId: planId,
      planEditDayNumber: dayNum,
      planEditLevel1: undefined,
      planEditLevel2: undefined
    });
    await showPlanEditTopGroups(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SEARCH) {
    const state = await State.get(chatId);
    if (!state || (state.step !== CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY && state.step !== CONSTANTS.FSM_STATES.PLAN_SEARCH_INPUT)) return false;
    if (!state.planEditPlanId || !state.planEditDayNumber) return false;
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SEARCH_INPUT });
    await Helpers.safeSend(chatId, '🔎 Введи мінімум 2 літери для пошуку вправи за назвою.\n\nПриклад: жим, присідання');
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY) return false;
    const seg = param.split(':').map((s) => s.trim()).filter(Boolean);
    const level1 = seg[0];
    const level2 = seg.length >= 2 ? seg.slice(1).join(':') : null;
    if (!level1) return false;
    await State.update(chatId, { planEditLevel1: level1, planEditLevel2: level2 || null });
    if (!level2) {
      await showPlanEditSecondLevelGroups(chatId, level1);
    } else {
      await showPlanEditExercises(chatId, level1, level2);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE && param) {
    const state = await State.get(chatId);
    if (!state || (state.step !== CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY && state.step !== CONSTANTS.FSM_STATES.PLAN_SEARCH_INPUT)) return false;
    const planId = state.planEditPlanId;
    const dayNum = state.planEditDayNumber;
    const studentChatId = state.planStudentChatId || '';
    const exId = param.trim();
    if (!planId || !dayNum || !exId) return false;
    const plan = await supabase.getPlanWithExercises(planId);
    if (!plan) {
      await Helpers.safeSend(chatId, '❌ План не знайдено.');
      return true;
    }
    const ex = await supabase.getExerciseById(exId);
    if (!ex) {
      await Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
      return true;
    }
    await State.update(chatId, {
      planPendingExercise: {
        planId,
        dayNum,
        exerciseId: ex.id,
        exerciseName: ex.name || 'Вправа',
        studentChatId
      }
    });
    const keyboard = [
      [{ text: '🔄 Кілька підходів (сети)', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD + ':' + exId + ':SET' }],
      [{ text: '1️⃣ Одиночне виконання', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD + ':' + exId + ':SINGLE' }]
    ];
    await Helpers.sendKeyboard(chatId, '📋 **' + (ex.name || 'Вправа') + '**\n\nОберіть тип виконання:', keyboard, { parse_mode: 'Markdown' });
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD && parts[1] && parts[2]) {
    const state = await State.get(chatId);
    const pending = state?.planPendingExercise;
    const exId = parts[1].trim();
    const type = String(parts[2] || '').toUpperCase();
    if (!pending || String(pending.exerciseId) !== String(exId)) {
      await Helpers.safeSend(chatId, '❌ Сесію вибору вправи втрачено. Обери вправу знову з дня плану.');
      if (state?.planEditPlanId && state?.planStudentChatId) await showPlanDetail(chatId, state.planEditPlanId, state.planStudentChatId);
      return true;
    }
    const plan = await supabase.getPlanWithExercises(pending.planId);
    if (!plan) {
      await Helpers.safeSend(chatId, '❌ План не знайдено.');
      return true;
    }
    const existingForDay = (plan.exercises || []).filter((e) => e.dayNumber === pending.dayNum);
    const orderInDay = existingForDay.length + 1;
    const daysPerWeek = plan.daysPerWeek != null ? plan.daysPerWeek : Math.max(3, ...(plan.exercises || []).map((e) => e.dayNumber || 0), pending.dayNum);
    const dayConfigs = planGenerator.getSplitSchemeAndDays(plan.level || 'beginner', daysPerWeek).dayConfigs || [];
    const dayLabel = dayConfigs.find((x) => x.dayNumber === pending.dayNum)?.dayLabelUA || null;
    const sr = planGenerator.getSetsRepsRest(plan.goal || 'keep', plan.level || 'beginner');
    const sets = type === 'SINGLE' ? 1 : (sr.sets != null ? sr.sets : 3);
    const reps = type === 'SINGLE' ? '1' : (sr.reps || '10–12');
    const ok = await supabase.insertTrainingPlanExercise({
      planId: pending.planId,
      exerciseId: pending.exerciseId,
      exerciseName: pending.exerciseName,
      dayNumber: pending.dayNum,
      dayLabel,
      orderInDay,
      sets,
      reps,
      restSec: type === 'SINGLE' ? 0 : sr.restSec,
      medicalStatus: 'NEUTRAL',
      progressionType: 'weight'
    });
    await State.update(chatId, { planPendingExercise: undefined });
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати вправу в план.');
      return true;
    }
    await Helpers.safeSend(chatId, '✅ Додано в **День ' + pending.dayNum + '**: ' + pending.exerciseName + (type === 'SINGLE' ? ' (одиночне)' : ' (сети)'), { parse_mode: 'Markdown' });
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY });
    await showPlanDetail(chatId, pending.planId, pending.studentChatId);
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

/** Обробка тексту: назва плану (ручне створення) або пошук вправи за назвою (додавання в план). */
async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state) return false;

  if (state.step === CONSTANTS.FSM_STATES.PLAN_SET_NAME) {
    const name = String(text || '').trim();
    if (name.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введіть назву плану (мінімум 2 символи).');
      return true;
    }
    await State.update(chatId, { planManualName: name });
    await askPlanGoal(chatId);
    return true;
  }

  if (state.step === CONSTANTS.FSM_STATES.PLAN_SEARCH_INPUT) {
    const query = String(text || '').trim();
    if (query.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи мінімум 2 літери для пошуку.');
      return true;
    }
    const exercises = await supabase.searchExercises(query);
    if (!exercises || exercises.length === 0) {
      await Helpers.safeSend(chatId, '❌ Нічого не знайдено за запитом «' + query + '». Спробуй інший.');
      return true;
    }
    const planId = state.planEditPlanId;
    const dayNum = state.planEditDayNumber;
    const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
      { text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + ex.id }
    ]);
    keyboard.push([{ text: '🔎 Ще пошук', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SEARCH }]);
    keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum }]);
    await Helpers.sendKeyboard(chatId, '🔎 Результати пошуку «' + query + '»:\n\nОбери вправу для додавання в план:', keyboard);
    return true;
  }

  return false;
}

module.exports = {
  showPlanList,
  handleCallback,
  handleTextMessage
};
