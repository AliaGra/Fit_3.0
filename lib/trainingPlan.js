/**
 * Програма тренувань учня: список планів, авто-генерація, активація (Логіка складання плану тренувань.md, розд. 8).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const Alias = require('./alias');
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

/** Запитати термін ревізії плану: за замовчуванням (за рівнем) або вказати. */
async function askPlanRevisionWeeks(chatId) {
  const state = await State.get(chatId);
  const level = state?.planManualLevel || 'beginner';
  const defWeeks = supabase.REVISION_WEEKS_BY_LEVEL ? (supabase.REVISION_WEEKS_BY_LEVEL[level] ?? 6) : 6;
  const studentChatId = state?.planStudentChatId || '';
  const keyboard = [
    [{ text: 'За замовчуванням (' + defWeeks + ' тиж.)', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_DEFAULT + ':' + studentChatId }],
    [{ text: 'Вказати тижнів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_INPUT + ':' + studentChatId }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_BACK }]
  ];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SET_REVISION });
  await Helpers.sendKeyboard(chatId, '📅 Термін ревізії плану (після скількох тижнів пропонувати оновити план)? За замовчуванням для рівня «' + level + '»: ' + defWeeks + ' тиж.', keyboard);
}

/** Кнопки вибору кількості тижнів ревізії (4, 6, 8, 10). */
async function askPlanRevisionWeeksNumber(chatId) {
  const state = await State.get(chatId);
  const studentChatId = state?.planStudentChatId || '';
  const level = state?.planManualLevel || 'beginner';
  const keyboard = [
    [
      { text: '4', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS + ':4' },
      { text: '6', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS + ':6' },
      { text: '8', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS + ':8' },
      { text: '10', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS + ':10' }
    ],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_DEFAULT + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, 'Оберіть кількість тижнів до ревізії плану:', keyboard);
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
  if (!studentChatId) {
    await Helpers.safeSend(chatId, '❌ Не вибрано учня.');
    return;
  }
  const user = await supabase.getUserByChatId(studentChatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }
  const state = await State.get(chatId);
  const exerciseCountChoice = state && state.planAutoExerciseCount != null ? state.planAutoExerciseCount : null;

  const experienceDays = planGenerator.getExperienceDays(user);
  const level = planGenerator.getLevelFromExperienceDays(experienceDays) || 'beginner';
  const daysPerWeek = user.trainingDaysPerWeek != null ? user.trainingDaysPerWeek : planGenerator.getDefaultDaysPerWeek(level);
  const goal = String(user.goal || 'keep').toLowerCase();
  let medList = await supabase.getActiveMedicalConditions(studentChatId);
  if (!Array.isArray(medList)) medList = [];

  const goalLabel = goal === 'lose' ? 'Схуднення' : goal === 'gain' ? 'Набір маси' : 'Підтримка';
  const levelLabel = level === 'beginner' ? 'Початковий' : level === 'intermediate' ? 'Середній' : 'Просунутий';

  let text = '⚙️ Авто-підбір плану\n\n';
  text += 'Профіль учня:\n';
  text += '• Ціль: ' + goalLabel + '\n';
  text += '• Рівень: ' + levelLabel + '\n';
  text += '• Тренувань на тиждень: ' + daysPerWeek + '\n';
  if (exerciseCountChoice != null) {
    text += '• Вправ на день: ' + exerciseCountChoice + ' (обрано)\n';
  } else {
    text += '• Вправ на день: за рекомендацією (5–8 за типом дня)\n';
  }
  if (medList.length > 0) {
    text += '• Медичні стани: ' + medList.length + ' (враховано при підборі вправ)\n';
  }
  text += '\nОбери кількість вправ на день (або залиш за рекомендацією), потім натисни Генерувати.';

  const keyboard = [
    [
      { text: '5 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':5:' + studentChatId },
      { text: '6 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':6:' + studentChatId },
      { text: '7 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':7:' + studentChatId },
      { text: 'За рекомендацією', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':0:' + studentChatId }
    ],
    [{ text: '⚙️ Генерувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE + ':' + studentChatId }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + studentChatId }]
  ];
  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard);
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
        if (ex.notes && ex.notes.trim()) {
          text += '    💬 Тренер: ' + ex.notes.trim().replace(/\n/g, ' ') + '\n';
          if (process.env.DEBUG === '1') console.log('[trainingPlan] Showing comment for exercise ' + ex.exerciseId + ': ' + ex.notes.substring(0, 50));
        } else if (process.env.DEBUG === '1' && ex.exerciseId) {
          console.log('[trainingPlan] No notes for exercise ' + ex.exerciseId + ' (' + ex.exerciseName + ')');
        }
      }
      text += '\n';
    }
  }

  const keyboard = [
    [{ text: '➕ Додати вправи', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT + ':' + planId }],
    (plan.exercises && plan.exercises.length > 0)
      ? [{ text: '📖 Картки вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE + ':' + planId + ':' + (studentChatId || '') + ':list' }]
      : [],
    plan.isActive
      ? [{ text: '✅ Активний план', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
      : [{ text: '🎯 Активувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE + ':' + planId }],
    [{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE + ':' + planId }],
    [{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ].filter((row) => row.length > 0);
  await State.set(chatId, { planStudentChatId: studentChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Список вправ плану як кнопки для відкриття картки кожної вправи. */
async function showPlanExerciseCardsList(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan || !plan.exercises || plan.exercises.length === 0) {
    await showPlanDetail(chatId, planId, studentChatId);
    return;
  }
  const dedup = new Map();
  for (const ex of plan.exercises) {
    if (ex.exerciseId && !dedup.has(ex.exerciseId)) {
      dedup.set(ex.exerciseId, ex.exerciseName || 'Вправа');
    }
  }
  const keyboard = [];
  for (const [exId, name] of dedup) {
    keyboard.push([{ text: '📖 ' + (name.length > 50 ? name.slice(0, 47) + '…' : name), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE + ':' + planId + ':' + (studentChatId || '') + ':' + exId }]);
  }
  keyboard.push([{ text: '🔙 До плану', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN + ':' + planId + ':' + (studentChatId || '') }]);
  await Helpers.sendKeyboard(chatId, '📖 Відкрий картку вправи (опис, відео, протипоказання):', keyboard);
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

/** Екран вибору підгрупи 3-го рівня (group_level3) перед списком вправ. */
async function showPlanEditThirdLevelGroups(chatId, level1, level2) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const subgroups = await supabase.getSubgroups(level1, level2Arg);
  if (!subgroups || subgroups.length === 0) {
    await showPlanEditExercises(chatId, level1, level2, null);
    return;
  }
  const prefix = level1 + ':' + level2 + ':';
  const keyboard = subgroups.map((g3) => [
    { text: g3, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + prefix + g3 }
  ]);
  keyboard.push([{ text: '📋 Всі вправи тут', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + prefix + '__all__' }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1 }]);
  const header = [level1, level2Arg].filter(Boolean).join(' → ') || level1;
  await Helpers.sendKeyboard(chatId, '📂 ' + header + '\n\nОбери підкатегорію (рівень 3) або всі вправи:', keyboard);
}

async function showPlanEditExercises(chatId, level1, level2, level3) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const level3Arg = level3 === '__all__' || !level3 ? null : level3;
  const exercises = await supabase.getExercisesByGroup(level1, level2Arg, level3Arg);
  if (!exercises || exercises.length === 0) {
    await Helpers.safeSend(chatId, '❌ У цій групі немає вправ.');
    if (level2Arg) await showPlanEditSecondLevelGroups(chatId, level1);
    else await showPlanEditDaySelect(chatId, planId, state?.planStudentChatId);
    return;
  }
  const header = [level1, level2Arg, level3Arg].filter(Boolean).join(' → ') || level1;
  const backData = level3Arg
    ? (CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1 + ':' + (level2 || '__all__'))
    : level2Arg
      ? (CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1)
      : (CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum);
  const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: backData }]);
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
    const studentChatId = state.planStudentChatId || '';
    const user = studentChatId ? await supabase.getUserByChatId(studentChatId) : null;
    const level = user ? (planGenerator.getLevelFromExperienceDays(planGenerator.getExperienceDays(user)) || 'beginner') : 'beginner';
    await State.update(chatId, { planManualLevel: level });
    await askPlanRevisionWeeks(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL && param) {
    const state = await State.get(chatId);
    const step = state?.step;
    if (step !== CONSTANTS.FSM_STATES.PLAN_SET_LEVEL && step !== CONSTANTS.FSM_STATES.PLAN_SET_REVISION) return false;
    const level = param.trim();
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) return false;
    await State.update(chatId, { planManualLevel: level });
    if (step === CONSTANTS.FSM_STATES.PLAN_SET_REVISION) {
      await askPlanGoal(chatId);
    } else {
      await askPlanRevisionWeeks(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_BACK) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_REVISION) return false;
    await askPlanGoal(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_DEFAULT && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_REVISION) return false;
    await State.update(chatId, { planManualRevisionWeeks: null });
    await askPlanDays(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_INPUT && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_REVISION) return false;
    await askPlanRevisionWeeksNumber(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.PLAN_SET_REVISION) return false;
    const weeks = parseInt(String(param).trim(), 10);
    if (weeks < 1 || weeks > 52) return false;
    await State.update(chatId, { planManualRevisionWeeks: weeks });
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
    const revisionWeeks = state.planManualRevisionWeeks != null ? parseInt(state.planManualRevisionWeeks, 10) : undefined;
    const planId = await supabase.insertTrainingPlan({
      coachId: chatId,
      studentId: studentChatId,
      planName: String(state.planManualName || 'План').trim() || 'План вручну',
      goal: state.planManualGoal || 'keep',
      level: state.planManualLevel || 'beginner',
      daysPerWeek: days,
      revisionWeeks: revisionWeeks,
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
    await State.update(chatId, { step: undefined, planManualName: undefined, planManualGoal: undefined, planManualLevel: undefined, planManualRevisionWeeks: undefined });
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
    const level2 = seg.length >= 2 ? seg[1] : null;
    const level3 = seg.length >= 3 ? seg.slice(2).join(':') : null;
    if (!level1) return false;
    await State.update(chatId, { planEditLevel1: level1, planEditLevel2: level2 || null, planEditLevel3: level3 || null });
    if (!level2) {
      await showPlanEditSecondLevelGroups(chatId, level1);
    } else if (level2 === '__all__') {
      await showPlanEditExercises(chatId, level1, '__all__', null);
    } else if (!level3) {
      await showPlanEditThirdLevelGroups(chatId, level1, level2);
    } else {
      await showPlanEditExercises(chatId, level1, level2, level3);
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
    try {
      await showAutoSummary(chatId, param);
    } catch (err) {
      console.error('TrainingPlan PLAN_AUTO (showAutoSummary)', err.message, err.stack);
      await Helpers.safeSend(chatId, '❌ Виникла технічна помилка при підготовці авто-підбору. Спробуй ще раз або зв\'яжися з підтримкою.');
      const keyboard = [[{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + param }]];
      await Helpers.sendKeyboard(chatId, 'Повернутися до списку планів:', keyboard);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT && param) {
    const countParts = String(param).split(':').map((s) => s.trim()).filter(Boolean);
    const countParam = countParts[0];
    const studentChatId = countParts[1] || (await State.get(chatId))?.planStudentChatId;
    const num = countParam === '0' ? undefined : parseInt(countParam, 10);
    await State.update(chatId, { planAutoExerciseCount: num != null && num >= 5 && num <= 7 ? num : undefined });
    if (studentChatId) await showAutoSummary(chatId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE && param) {
    const studentChatId = param;
    const state = await State.get(chatId);
    const exerciseCountPerDay = state && state.planAutoExerciseCount != null && state.planAutoExerciseCount >= 4 && state.planAutoExerciseCount <= 10 ? state.planAutoExerciseCount : undefined;
    try {
      await Helpers.safeSend(chatId, '⏳ Генерую план...');
      const result = await planGenerator.generateTrainingPlan(studentChatId, {
        coachId: chatId,
        isActive: false,
        exerciseCountPerDay
      });
      if (!result) {
        await Helpers.safeSend(chatId, '❌ Не вдалося згенерувати план. Перевір профіль учня (ціль, рівень досвіду, тренувальних днів).');
        await showPlanList(chatId, studentChatId);
        return true;
      }
      await Helpers.safeSend(chatId, '✅ План створено: **' + result.planName + '**\n' + result.daysPerWeek + ' дн./тиж, рівень ' + result.level + '.');
      await showPlanDetail(chatId, result.planId, studentChatId);
    } catch (err) {
      console.error('TrainingPlan PLAN_GENERATE (generateTrainingPlan)', err.message, err.stack);
      await Helpers.safeSend(chatId, '❌ Виникла технічна помилка при генерації плану. Спробуй ще раз або зв\'яжися з підтримкою.');
      await showPlanList(chatId, studentChatId);
    }
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

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE && param) {
    const parts = param.split(':').map((s) => s.trim()).filter(Boolean);
    const planId = parts[0];
    const studentChatId = parts.length >= 2 ? parts[1] : '';
    const last = parts.length >= 3 ? parts.slice(2).join(':') : '';
    if (!planId) return false;
    if (last === 'list') {
      await showPlanExerciseCardsList(chatId, planId, studentChatId);
      return true;
    }
    const exerciseId = last;
    if (!exerciseId) return false;
    const Library = require('./library');
    await Library.showExerciseDetail(chatId, exerciseId, { returnToPlan: { planId, studentChatId } });
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN && param) {
    const parts = param.split(':').map((s) => s.trim()).filter(Boolean);
    const planId = parts[0];
    const studentChatId = parts.length >= 2 ? parts[1] : '';
    if (!planId) return false;
    await showPlanDetail(chatId, planId, studentChatId);
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
    if (query.length < 3) {
      await Helpers.safeSend(chatId, '⚠️ Введи мінімум 3 літери (в т.ч. за своєю назвою).');
      return true;
    }
    const studentChatId = state.planStudentChatId || (state.planEditPlanId ? (await supabase.getPlanWithExercises(state.planEditPlanId))?.studentId : null);
    const chatIdForSearch = studentChatId || chatId;
    const user = await User.getByChatId(chatIdForSearch);
    const coachId = user && user.coach_id ? user.coach_id : null;
    const exercises = await Alias.searchExercisesWithAliases(query, chatIdForSearch, coachId);
    if (!exercises || exercises.length === 0) {
      await Helpers.safeSend(chatId, '❌ Нічого не знайдено за запитом «' + query + '». Спробуй інший.');
      return true;
    }
    const planId = state.planEditPlanId;
    const dayNum = state.planEditDayNumber;
    const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => {
      const label = ex.fromAlias ? '🏷 ' + (ex.aliasText || ex.name) + ' — ' + ex.name : (ex.name || 'Вправа');
      return [{ text: label.slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + ex.id }];
    });
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
