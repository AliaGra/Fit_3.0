/**
 * Training — модуль тренувань (Coach Mode: Personal / Split / Trio)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Menu = require('./menu');
const failureAnalysis = require('./ai/failureAnalysis');

/** Парсинг діапазону повторів: "10–12" → 10, "8" → 8. Для автопрогресії. */
function parseRepsMin(repsStr) {
  if (!repsStr || typeof repsStr !== 'string') return null;
  const s = repsStr.trim().replace(/\s+/g, ' ');
  const dash = s.match(/^(\d+)\s*[–\-]\s*(\d+)$/);
  if (dash) return parseInt(dash[1], 10);
  const single = s.match(/^(\d+)$/);
  if (single) return parseInt(single[1], 10);
  return null;
}

/** Чи сесія (масив записів) виконала мінімум: кількість підходів і повтори >= minReps. */
function sessionMetTarget(records, setsRequired, minReps) {
  if (minReps == null || !records.length) return false;
  const slice = records.slice(0, setsRequired);
  return slice.length >= setsRequired && slice.every((r) => (r.reps != null ? r.reps >= minReps : false));
}

/** Після завершення тренування за планом: перевірка виконання та оновлення target_weight (автопрогресія + деавтоматизація). */
async function applyProgressionAfterWorkout(chatId, planId, dayNumber, exercises) {
  if (!exercises || !exercises.length) return;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const sixtyDaysAgo = new Date(todayEnd);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [data, recentData] = await Promise.all([
    supabase.getTrainingDataByChatAndDate(chatId, todayStart, todayEnd),
    supabase.getTrainingDataByChatAndDate(chatId, sixtyDaysAgo, todayEnd)
  ]);

  const byEx = {};
  for (const r of data) {
    const eid = r.exerciseId != null ? String(r.exerciseId) : '';
    if (!byEx[eid]) byEx[eid] = [];
    byEx[eid].push(r);
  }

  const byExByDate = {};
  for (const r of recentData) {
    const eid = r.exerciseId != null ? String(r.exerciseId) : '';
    const dateStr = (r.date && r.date.slice) ? r.date.slice(0, 10) : '';
    if (!eid || !dateStr) continue;
    if (!byExByDate[eid]) byExByDate[eid] = {};
    if (!byExByDate[eid][dateStr]) byExByDate[eid][dateStr] = [];
    byExByDate[eid][dateStr].push(r);
  }

  const student = await User.getByChatId(chatId);
  const studentName = student ? [student.firstName, student.lastName].filter(Boolean).join(' ').trim() || chatId : String(chatId);
  const coachChatId = student?.coachId ? String(student.coachId) : null;

  for (const ex of exercises) {
    const eid = String(ex.exerciseId || '');
    const setsRequired = ex.sets != null ? ex.sets : 3;
    const minReps = parseRepsMin(ex.reps);
    const records = byEx[eid] || [];
    const allMet = minReps != null && sessionMetTarget(records, setsRequired, minReps);

    if ((ex.progressionType || 'weight') === 'none') continue;

    if (allMet) {
      const withWeight = records.filter((r) => r.weight != null && r.weight > 0);
      if (!withWeight.length) continue;
      const maxWeight = Math.max(...withWeight.map((r) => r.weight));
      const vid = await supabase.getExerciseVid(ex.exerciseId);
      const step = vid && /ізол/i.test(String(vid)) ? 1.25 : 2.5;
      const newTarget = maxWeight + step;
      if (ex.planExerciseId) await supabase.updatePlanExerciseTargetWeight(ex.planExerciseId, newTarget);
      continue;
    }

    const dates = byExByDate[eid] ? Object.keys(byExByDate[eid]).sort().reverse() : [];
    const todayStr = todayStart.toISOString().slice(0, 10);
    const prevDates = dates.filter((d) => d !== todayStr).slice(0, 1);
    const prevMet = prevDates.length > 0 && sessionMetTarget(byExByDate[eid][prevDates[0]], setsRequired, minReps);
    if (!prevMet && prevDates.length > 0) {
      const currentTarget = ex.targetWeight != null && ex.targetWeight > 0 ? ex.targetWeight : null;
      const withWeight = records.filter((r) => r.weight != null && r.weight > 0);
      const maxToday = withWeight.length ? Math.max(...withWeight.map((r) => r.weight)) : null;
      const baseForReduce = currentTarget != null ? currentTarget : maxToday;
      if (baseForReduce != null && baseForReduce > 0 && ex.planExerciseId) {
        const newTarget = Math.max(1, (baseForReduce * 0.9));
        await supabase.updatePlanExerciseTargetWeight(ex.planExerciseId, newTarget);
      }
      if (coachChatId) {
        await Helpers.safeSend(
          coachChatId,
          '⚠️ **Деавтоматизація**\n\nУчень **' + studentName + '** двічі поспіль не виконав мінімум підходів у вправі «' + (ex.exerciseName || 'вправа') + '». Рекомендовану вагу зменшено на 10%. Рекомендуй переглянути план.',
          { parse_mode: 'Markdown' }
        );
      }
    }
  }
}

// ——— ENTRY: Власне тренування тренера («Моя тренування») ———
async function startSelfTraining(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Menu.show(chatId);
    return;
  }
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_GROUP,
    mode: CONSTANTS.TRAINING_MODES.SELF,
    targetUserId: String(chatId),
    trainingStartedAt: new Date()
  });
  await askExecutionTypeThenMuscleGroup(chatId);
}

// ——— ENTRY: Тренування учнів (меню) ———
async function startCoachTrainingFlow(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Menu.show(chatId);
    return;
  }
  const students = await User.getStudentsByCoach(chatId);
  const list = (students || []).filter((s) => s && (s.chatId || s.userId));
  if (list.length === 0) {
    await Helpers.safeSend(chatId, '👥 У тебе немає учнів. Додай учня в «Мої учні».');
    await Menu.show(chatId);
    return;
  }
  const isInvite = (s) => !!(s.userId && String(s.userId).startsWith('INVITE_'));
  const ids = list.map((s) => String(s.chatId || s.userId));
  const names = list.map((s) => (s.firstName || '') + ' ' + (s.lastName || '').trim());
  const displayNames = list.map((s) => {
    const ln = (s.lastName || '').trim();
    const fn = (s.firstName || '').trim();
    if (isInvite(s)) return ln ? ln + ' (запрошення)' : (fn || 'Запрошення');
    return ln ? ln + ' ' + fn : fn + (ln ? ' ' + ln : '');
  });
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_TYPE,
    mode: CONSTANTS.TRAINING_MODES.COACH,
    coachStudentIds: ids,
    coachStudentNames: names,
    coachStudentDisplayNames: displayNames,
    coachTrainingType: '',
    requireTargetSelect: false
  });
  await askCoachTrainingType(chatId);
}

// ——— ENTRY: Учень виконує план (Почати тренування) ———
async function startStudentPlanWorkout(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.STUDENT) {
    await Menu.show(chatId);
    return;
  }
  const plan = await supabase.getActivePlanForStudent(chatId);
  if (!plan || !plan.exercises || !plan.exercises.length) {
    await Helpers.safeSend(chatId, '💪 У тебе поки немає активного плану тренувань.\n\nЗвернись до тренера, щоб він створив і активував для тебе персональний план.');
    await Menu.show(chatId);
    return;
  }
  const byDay = {};
  for (const ex of plan.exercises) {
    const d = ex.dayNumber;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ex);
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const keyboard = days.map((d) => {
    const label = byDay[d][0].dayLabel || 'День ' + d;
    return [{ text: 'День ' + d + ': ' + label, callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_PLAN_DAY + ':' + d }];
  });
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Скасувати', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_STUDENT_PLAN_DAY,
    mode: 'STUDENT_PLAN',
    studentPlanPlan: { planId: plan.planId, planName: plan.planName, exercises: plan.exercises },
    studentPlanDays: days
  });
  await Helpers.sendKeyboard(chatId, '💪 **' + (plan.planName || 'План') + '**\n\nОбери день тренування:', keyboard, { parse_mode: 'Markdown' });
}

async function showStudentPlanExercise(chatId) {
  const state = await State.get(chatId);
  const exercises = state.studentPlanExercises || [];
  const idx = state.studentPlanExerciseIndex || 0;
  if (idx >= exercises.length) {
    await finishStudentPlanWorkout(chatId);
    return;
  }
  const ex = exercises[idx];
  const sets = ex.sets != null ? ex.sets : 3;
  const reps = ex.reps || '10–12';
  const rest = ex.restSec ? ex.restSec + ' с відпочинок' : '';
  let text = '💪 **' + (ex.exerciseName || 'Вправа') + '**\n\n';
  text += 'Підходів: ' + sets + ' · Повтори: ' + reps;
  if (ex.targetWeight != null && ex.targetWeight > 0) text += '\n📌 Рекомендована вага: ' + ex.targetWeight + ' кг';
  if (rest) text += '\n' + rest;
  if (ex.notes) text += '\n⚠️ ' + ex.notes;
  text += '\n\nВведи вагу (кг) і кількість повторів через пробіл.\nПриклад: 20 12\nВласна вага: 0 15';

  const keyboard = [
    [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
    [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
  ];
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_STUDENT_PLAN_INPUT, studentPlanCurrentSet: state.studentPlanCurrentSet || 1 });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function finishStudentPlanWorkout(chatId) {
  const state = await State.get(chatId);
  const isCoachPlan = state?.coachPlanWorkout === true;
  const studentChatId = state?.targetUserId || state?.coachPlanStudentId || chatId;
  const applyChatId = isCoachPlan ? studentChatId : chatId;

  if (state?.studentPlanPlan?.planId && state.studentPlanExercises?.length) {
    await applyProgressionAfterWorkout(
      applyChatId,
      state.studentPlanPlan.planId,
      state.studentPlanDayNumber,
      state.studentPlanExercises
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayData = await supabase.getTrainingDataByChatAndDate(applyChatId, todayStart, todayEnd);
    const byEx = {};
    for (const r of todayData) {
      const eid = r.exerciseId != null ? String(r.exerciseId) : '';
      if (!byEx[eid]) byEx[eid] = [];
      byEx[eid].push(r);
    }
    const failedExercises = [];
    for (const ex of state.studentPlanExercises) {
      const plannedSets = ex.sets != null ? ex.sets : 3;
      const completedSets = (byEx[String(ex.exerciseId || '')] || []).length;
      if (plannedSets > 0 && completedSets < Math.ceil(plannedSets * failureAnalysis.FAILURE_THRESHOLD)) {
        failedExercises.push({
          name: ex.exerciseName || 'Вправа',
          completedSets,
          plannedSets,
          planned_weight: ex.targetWeight != null ? ex.targetWeight : undefined
        });
      }
    }
    if (failedExercises.length > 0) {
      try {
        const analysis = await failureAnalysis.analyzeWorkoutFailures(applyChatId, failedExercises, {});
        if (analysis && analysis.student_message) {
          await Helpers.safeSend(applyChatId, '📋 Аналіз тренування:\n\n' + analysis.student_message);
        }
        if (analysis && analysis.notify_coach && analysis.coach_message) {
          const student = await User.getByChatId(applyChatId);
          const coachChatId = student?.coachId ? String(student.coachId) : null;
          if (coachChatId) {
            const studentName = (student?.firstName || '') + ' ' + (student?.lastName || '').trim() || 'Учень';
            await Helpers.safeSend(coachChatId, '📋 **Аналіз тренування учня** — ' + studentName + '\n\n' + analysis.coach_message, { parse_mode: 'Markdown' });
          }
        }
      } catch (e) {
        console.error('Training.finishStudentPlanWorkout failureAnalysis', e.message);
      }
    }
  }

  if (isCoachPlan && state?.scheduleSlotIds?.[studentChatId]) {
    try {
      const slotId = state.scheduleSlotIds[studentChatId];
      const trainingType = CONSTANTS.TRAINING_TYPES.PERSONAL;
      const pc = await supabase.getCurrentPrice(chatId, studentChatId, trainingType);
      if (pc && pc.price != null && !isNaN(pc.price)) {
        await supabase.updateScheduleSlotPrice(slotId, pc.price, pc.currency || 'UAH');
      }
      await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
    } catch (e) {
      console.error('Training.finishStudentPlanWorkout slot', e.message);
    }
  }
  await State.clear(chatId);
  if (isCoachPlan) {
    await Helpers.safeSend(chatId, '✅ Тренування за планом для учня завершено! 💪');
  } else {
    await Helpers.safeSend(chatId, '✅ Тренування за планом завершено! Гарна робота! 💪');
  }
  await Menu.show(chatId);
}

// ——— ENTRY: З профілю учня (1 учень) ———
async function startCoachTrainingForStudent(chatId, studentChatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Menu.show(chatId);
    return;
  }
  const student = await User.getByChatId(studentChatId);
  if (!student || String(student.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }
  const plan = await supabase.getActivePlanForStudent(studentChatId);
  if (plan && plan.exercises && plan.exercises.length > 0) {
    await showCoachTrainingPlanChoice(chatId, studentChatId, plan);
    return;
  }
  await startCoachFreeTraining(chatId, studentChatId);
}

/** Показати вибір: тренування за планом (дні) або вільне тренування. */
async function showCoachTrainingPlanChoice(chatId, studentChatId, plan) {
  const student = await User.getByChatId(studentChatId);
  const name = (student?.firstName || '') + ' ' + (student?.lastName || '').trim() || 'Учень';
  const byDay = {};
  for (const ex of plan.exercises) {
    const d = ex.dayNumber;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ex);
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const keyboard = days.map((d) => {
    const label = byDay[d][0].dayLabel || 'День ' + d;
    return [{ text: 'День ' + d + ': ' + label, callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_PLAN_DAY + ':' + studentChatId + ':' + d }];
  });
  keyboard.push([{ text: '🆓 Вільне тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN_FREE + ':' + studentChatId }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]);

  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.COACH_TRAIN_PLAN_CHOICE,
    coachPlanStudentId: studentChatId,
    coachPlanPlan: { planId: plan.planId, planName: plan.planName, exercises: plan.exercises }
  });
  await Helpers.sendKeyboard(
    chatId,
    '💪 **' + name + '**\n\n📋 Активний план: **' + (plan.planName || 'План') + '**\n\nОбери день тренування за планом або вільне тренування:',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

/** Старт вільного тренування (без плану) для одного учня. */
async function startCoachFreeTraining(chatId, studentChatId) {
  const student = await User.getByChatId(studentChatId);
  const name = (student?.firstName || '') + ' ' + (student?.lastName || '').trim() || '';
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_GROUP,
    mode: CONSTANTS.TRAINING_MODES.COACH,
    coachTrainingType: CONSTANTS.TRAINING_TYPES.PERSONAL,
    coachSelectedIds: [String(studentChatId)],
    coachSelectedNames: [name],
    targetUserId: String(studentChatId),
    requireTargetSelect: false,
    trainingStartedAt: new Date(),
    scheduleSlotIds: {},
    trainingMode: 'SINGLE'
  });
  await askExecutionTypeThenMuscleGroup(chatId);
}

async function askCoachTrainingType(chatId) {
  const keyboard = [
    [{ text: 'Персональна (1)', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_TRIO }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '💪 Обери тип тренування:', keyboard);
}

async function askSelectStudents(chatId, required) {
  const state = await State.get(chatId);
  const ids = state?.coachStudentIds || [];
  const displayNames = state?.coachStudentDisplayNames || state?.coachStudentNames || [];
  await State.set(chatId, {
    ...state,
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS,
    requiredStudentCount: required,
    selectedStudentIds: [],
    selectedStudentNames: []
  });
  await showStudentPickKeyboard(chatId, required, 0);
}

async function showStudentPickKeyboard(chatId, required, alreadySelectedCount) {
  const state = await State.get(chatId);
  const ids = state?.coachStudentIds || [];
  const displayNames = state?.coachStudentDisplayNames || state?.coachStudentNames || [];
  const selectedIds = state?.selectedStudentIds || [];
  const excluded = new Set(selectedIds);
  const available = ids.map((id, i) => ({ id, label: displayNames[i] || id })).filter((x) => !excluded.has(x.id));
  const ord = alreadySelectedCount + 1;
  const which = ord === 1 ? 'першого' : ord === 2 ? 'другого' : 'третього';
  const text = required === 1
    ? '👥 Обери учня (натисни прізвище):'
    : '👥 Обери ' + which + ' учня (натисни прізвище):';
  const keyboard = available.map((x) => [
    { text: (x.label || x.id).slice(0, 50), callback_data: CONSTANTS.CALLBACKS.TRAINING_PICK_STUDENT + ':' + x.id }
  ]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

function parseStudentNumbers(text, required, max) {
  const nums = String(text || '').match(/\d+/g);
  if (!nums) return null;
  const seen = {};
  const result = [];
  for (let i = 0; i < nums.length && result.length < required; i++) {
    const n = parseInt(nums[i], 10);
    if (isNaN(n) || n < 1 || n > max || seen[n]) continue;
    seen[n] = true;
    result.push(n);
  }
  return result.length === required ? result : null;
}

async function askMuscleGroup(chatId) {
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_GROUP, setExercisesCount: 0 });
  const topGroups = CONSTANTS.TOP_LEVEL_GROUPS || ['Низ', 'Верх'];
  const keyboard = topGroups.map((g) => [{ text: g, callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP + ':' + g }]);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  keyboard.push([{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]);
  await Helpers.sendKeyboard(chatId, "💪 Обери групу м'язів:", keyboard);
}

/** Екран формування сету: список обраних вправ, кнопки «Додати ще вправу» та (якщо ≥2) «Перейти до тренування». */
async function showSetBuildScreen(chatId) {
  const state = await State.get(chatId);
  const list = state?.setExerciseList || [];
  let text = '🔄 **Сет**\n\nОбрані вправи:\n';
  list.forEach((ex, i) => { text += (i + 1) + '. ' + (ex.name || 'Вправа') + '\n'; });
  text += '\nДодай ще вправу або перейди до тренування (мін. 2 вправи).\n\nНа кожному кругу: виконується по 1 підходу кожної вправи зі списку.';
  const keyboard = [[{ text: '➕ Додати ще вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_SET_ADD_MORE }]];
  if (list.length >= 2) {
    keyboard.push([{ text: '💪 Перейти до тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_SET_GO }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До груп', callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Запит ваги/повторів для поточної вправи в круговому сеті (один підхід на вправу за круг). */
async function askTrainingInputForSetCircuit(chatId) {
  const state = await State.get(chatId);
  const list = state?.setExerciseList || [];
  const round = state?.setCurrentRound || 1;
  const idx = state?.setCurrentExerciseIndex ?? 0;
  if (idx >= list.length) return askMuscleGroup(chatId);
  const ex = list[idx];
  await State.set(chatId, {
    ...state,
    step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA,
    exerciseId: ex.id,
    exerciseName: ex.name,
    currentSet: round
  });
  const total = list.length;
  const isSelf = state?.mode === CONSTANTS.TRAINING_MODES.SELF;
  const targetName = isSelf ? '' : (state?.coachSelectedNames && state?.coachSelectedIds ? state.coachSelectedNames[state.coachSelectedIds.indexOf(state.targetUserId)] || '' : '');
  let text = '🔄 **Сет** · Вправа ' + (idx + 1) + '/' + total + ' · Круг ' + round + '\n\n';
  text += '💪 ' + (ex.name || 'Вправа') + '\n\n';
  if (targetName) text += 'Для: ' + targetName + '\n\n';
  text += 'Введи вагу і повтори через пробіл (один підхід).\nПриклад: 20 12';
  const keyboard = [[{ text: '🏁 Завершити сет', callback_data: CONSTANTS.CALLBACKS.TRAINING_SET_FINISH }]];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Екран після завершення круга: додати наступний круг або завершити сет. */
async function showRoundCompleteScreen(chatId) {
  const state = await State.get(chatId);
  const round = state?.setCurrentRound || 1;
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_SET_ROUND_DONE });
  const text = '✅ **Круг ' + round + ' завершено.**\n\nУсі вправи виконано. Додати наступний круг або завершити сет?';
  const keyboard = [
    [{ text: '➕ Додати круг ' + (round + 1), callback_data: CONSTANTS.CALLBACKS.TRAINING_SET_ADD_ROUND }],
    [{ text: '🏁 Завершити сет', callback_data: CONSTANTS.CALLBACKS.TRAINING_SET_FINISH }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Показати вибір типу (Одиночне/Сет) перед вибором групи м'язів; якщо тип вже обрано — одразу askMuscleGroup. Не використовується для тренування за планом. */
async function askExecutionTypeThenMuscleGroup(chatId) {
  const state = await State.get(chatId);
  const isPlan = state?.coachPlanWorkout === true || state?.mode === 'STUDENT_PLAN';
  if (isPlan) {
    await askMuscleGroup(chatId);
    return;
  }
  if (state?.trainingExecutionType) {
    await askMuscleGroup(chatId);
    return;
  }
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_EXERCISE_TYPE, pendingAction: 'ASK_MUSCLE_GROUP' });
  const keyboard = [
    [{ text: '1️⃣ Одиночне (1 вправа)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SINGLE }],
    [{ text: '🔄 Сет (мін. 2 вправи)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SET }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Скасувати', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, '💪 Оберіть тип тренування:\n\n• **Одиночне** — одна вправа\n• **Сет** — мінімум дві вправи', keyboard, { parse_mode: 'Markdown' });
}

async function showSecondLevelGroups(chatId, topLevel) {
  const groups = CONSTANTS.GROUPS_BY_TOP?.[topLevel] || [];
  if (groups.length === 0) {
    await showGroupOrExercises(chatId, topLevel, null);
    return;
  }
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_GROUP });
  const keyboard = groups.map((g) => [{ text: g, callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP + ':' + topLevel + ':' + g }]);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' До груп', callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
  await Helpers.sendKeyboard(chatId, '📋 ' + topLevel + '\n\nОбери групу м\'язів:', keyboard);
}

async function showGroupOrExercises(chatId, topLevel, group) {
  const level1 = topLevel || '';
  const level2 = group || null;
  const subgroups = await supabase.getSubgroups(level1, level2);
  if (subgroups && subgroups.length > 0) {
    const state = await State.get(chatId);
    await State.set(chatId, { ...state, step: 'training_exercise', selectedGroup: level2 || level1 });
    const prefix = level2 ? level1 + ':' + level2 + ':' : level1 + ':';
    const keyboard = subgroups.map((sub) => [
      { text: sub, callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP2 + ':' + prefix + sub }
    ]);
    keyboard.push([{ text: '📋 Всі вправи', callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP2 + ':' + prefix + '__all__' }]);
    keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + " До груп", callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
    const header = level2 ? level1 + ' → ' + level2 : level1;
    await Helpers.sendKeyboard(chatId, '📋 ' + header + '\n\nОбери підкатегорію або вправу:', keyboard);
    return;
  }
  await showExercises(chatId, level1, level2, null);
}

async function showExercises(chatId, groupLevel1, groupLevel2, groupLevel3) {
  const state = await State.get(chatId);
  const isPlan = state?.coachPlanWorkout === true || state?.mode === 'STUDENT_PLAN';
  if (!isPlan && !state?.trainingExecutionType) {
    await State.set(chatId, {
      ...state,
      step: CONSTANTS.FSM_STATES.TRAINING_EXERCISE_TYPE,
      pendingShowExercises: { groupLevel1, groupLevel2, groupLevel3 }
    });
    const keyboard = [
      [{ text: '1️⃣ Одиночне (1 вправа)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SINGLE }],
      [{ text: '🔄 Сет (мін. 2 вправи)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SET }],
      [{ text: CONSTANTS.EMOJI.BACK + ' До груп', callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]
    ];
    await Helpers.sendKeyboard(chatId, '💪 Оберіть тип тренування:\n\n• **Одиночне** — одна вправа\n• **Сет** — мінімум дві вправи', keyboard, { parse_mode: 'Markdown' });
    return;
  }
  await State.set(chatId, {
    ...state,
    step: 'training_exercise',
    selectedGroup: groupLevel2 || groupLevel1,
    selectedGroupLevel1: groupLevel1,
    selectedGroupLevel2: groupLevel2 === '__all__' || groupLevel2 === '' ? null : groupLevel2,
    selectedGroupLevel3: groupLevel3 === '__all__' || groupLevel3 === '' ? null : groupLevel3
  });
  const level2Arg = groupLevel2 === '__all__' || groupLevel2 === '' ? null : groupLevel2;
  const level3Arg = groupLevel3 === '__all__' || groupLevel3 === '' ? null : groupLevel3;
  const exercises = await supabase.getExercisesByGroup(groupLevel1, level2Arg, level3Arg);
  if (!exercises || exercises.length === 0) {
    const label = [groupLevel1, level2Arg, level3Arg].filter(Boolean).join(' → ') || groupLevel1;
    await Helpers.safeSend(chatId, '❌ У групі "' + label + '" немає вправ.');
    await askMuscleGroup(chatId);
    return;
  }
  const header = [groupLevel1, level2Arg, level3Arg].filter(Boolean).join(' → ') || groupLevel1;
  const keyboard = exercises.slice(0, 25).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, 60), callback_data: CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + " До груп", callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
  await Helpers.sendKeyboard(chatId, '📋 ' + header + '\n\nОбери вправу:', keyboard);
}

async function askTargetStudentSelection(chatId, pendingAction) {
  const state = await State.get(chatId);
  const names = state?.coachSelectedNames || [];
  const ids = state?.coachSelectedIds || [];
  if (!names.length) {
    await Helpers.safeSend(chatId, '⚠️ Список учнів порожній.');
    return;
  }
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_TARGET, pendingAction: pendingAction || 'ASK_TRAINING_INPUT' });
  const keyboard = ids.map((id, i) => [
    { text: (i + 1) + '. ' + (names[i] || id), callback_data: CONSTANTS.CALLBACKS.TRAINING_SELECT_STUDENT + ':' + id }
  ]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Скасувати', callback_data: CONSTANTS.CALLBACKS.CANCEL_ACTION }]);
  await Helpers.sendKeyboard(chatId, '👤 Обери учня для запису підходу:', keyboard);
}

async function askTrainingInputData(chatId) {
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA, singleExecution: false });
  const exName = state?.exerciseName || 'Вправа';
  const isSelf = state?.mode === CONSTANTS.TRAINING_MODES.SELF;
  const targetName = isSelf
    ? ''
    : (state?.coachSelectedNames && state?.coachSelectedIds
      ? state.coachSelectedNames[state.coachSelectedIds.indexOf(state.targetUserId)] || ''
      : '');
  let text = '💪 ' + exName + '\n\n';
  if (isSelf) text += 'Моє тренування\n\n';
  else if (targetName) text += 'Для: ' + targetName + '\n\n';
  text += 'Введи вагу і повтори через пробіл.\n\nПриклад: 20 12\nДля власної ваги: 0 15';
  const keyboard = [
    [{ text: '➕ Додати підхід', callback_data: CONSTANTS.CALLBACKS.TRAINING_ADD_SET }],
    [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
    [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Запит одного підходу (одиночне виконання). */
async function askTrainingInputDataSingle(chatId) {
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA, singleExecution: true });
  const exName = state?.exerciseName || 'Вправа';
  const isSelf = state?.mode === CONSTANTS.TRAINING_MODES.SELF;
  const targetName = isSelf ? '' : (state?.coachSelectedNames && state?.coachSelectedIds ? state.coachSelectedNames[state.coachSelectedIds.indexOf(state.targetUserId)] || '' : '');
  let text = '💪 ' + exName + ' (одиночне)\n\n';
  if (isSelf) text += 'Моє тренування\n\n';
  else if (targetName) text += 'Для: ' + targetName + '\n\n';
  text += 'Введи вагу і повтори через пробіл (один підхід).\nПриклад: 20 12';
  const keyboard = [
    [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
    [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function ensureScheduleSlot(chatId, targetUserId) {
  const state = await State.get(chatId);
  if (state?.mode !== CONSTANTS.TRAINING_MODES.COACH) return;
  if (String(targetUserId || '').startsWith('INVITE_')) return;
  const slotIds = state?.scheduleSlotIds || {};
  if (slotIds[targetUserId]) return;
  const startedAt = state?.trainingStartedAt ? new Date(state.trainingStartedAt) : new Date();
  const slotId = await supabase.findOrCreateSlotForCoachSession(chatId, targetUserId, startedAt);
  if (slotId) {
    slotIds[targetUserId] = slotId;
    await State.update(chatId, { scheduleSlotIds: slotIds });
  }
}

async function finishWorkout(chatId) {
  const state = await State.get(chatId);
  const scheduleSlotIds = state?.scheduleSlotIds || {};
  const wasCoach = state?.mode === CONSTANTS.TRAINING_MODES.COACH;
  const trainingType = state?.coachTrainingType || CONSTANTS.TRAINING_TYPES.PERSONAL;
  await State.clear(chatId);
  if (wasCoach && scheduleSlotIds && typeof scheduleSlotIds === 'object') {
    for (const studentId of Object.keys(scheduleSlotIds)) {
      const slotId = scheduleSlotIds[studentId];
      if (!slotId) continue;
      try {
        const pc = await supabase.getCurrentPrice(chatId, studentId, trainingType);
        if (pc && pc.price != null && !isNaN(pc.price)) {
          let perStudent = pc.price;
          if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) perStudent = pc.price / 2;
          else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) perStudent = pc.price / 3;
          await supabase.updateScheduleSlotPrice(slotId, perStudent, pc.currency || 'UAH');
        }
        await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
      } catch (e) {
        console.error('Training.finishWorkout slot', e.message);
      }
    }
  }
  await Helpers.safeSend(chatId, '✅ Тренування завершено!\n\nГарна робота! 💪');
  await Menu.show(chatId);
}

async function finishExercise(chatId) {
  const state = await State.get(chatId);
  const execType = state?.trainingExecutionType || 'SET';
  const setCount = execType === 'SET' ? (state?.setExercisesCount || 0) + 1 : 0;
  await State.update(chatId, {
    exerciseId: undefined,
    exerciseName: undefined,
    currentSet: 1,
    ...(execType === 'SET' ? { setExercisesCount: setCount } : {})
  });
  if (execType === 'SET' && setCount < 2) {
    const l1 = state?.selectedGroupLevel1;
    const l2 = state?.selectedGroupLevel2;
    const l3 = state?.selectedGroupLevel3;
    await Helpers.safeSend(chatId, '✅ Вправу завершено.\n\n🔄 Сет: потрібно ще мін. 1 вправу. Обери наступну вправу:');
    if (l1 != null) {
      await showExercises(chatId, l1, l2 || null, l3 || null);
    } else {
      await askMuscleGroup(chatId);
    }
    return;
  }
  if (execType === 'SET') {
    await State.update(chatId, { setExercisesCount: 0 });
  }
  await askMuscleGroup(chatId);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const rest = String(callbackData || '').split(':').slice(1).join(':').trim();
  const parts = String(callbackData || '').split(':');

  // Почати тренування: вибір плану (Вільне тренування / День N)
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN_FREE && parts[1]) {
    const studentChatId = parts[1].trim();
    await startCoachFreeTraining(chatId, studentChatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_PLAN_DAY && parts[1] && parts[2]) {
    const studentChatId = parts[1].trim();
    const dayNum = parseInt(parts[2].trim(), 10);
    const state = await State.get(chatId);
    const plan = state?.coachPlanPlan;
    if (!plan || !plan.exercises) {
      await Helpers.safeSend(chatId, '❌ План не знайдено. Обери учня знову.');
      return true;
    }
    const exercises = plan.exercises.filter((e) => e.dayNumber === dayNum);
    if (!exercises.length) {
      await Helpers.safeSend(chatId, '❌ Вправи для цього дня не знайдено.');
      return true;
    }
    const newState = {
      ...state,
      step: CONSTANTS.FSM_STATES.TRAINING_STUDENT_PLAN_INPUT,
      mode: CONSTANTS.TRAINING_MODES.COACH,
      coachPlanWorkout: true,
      targetUserId: studentChatId,
      coachPlanStudentId: studentChatId,
      studentPlanPlan: { planId: plan.planId, planName: plan.planName, exercises: plan.exercises },
      studentPlanDayNumber: dayNum,
      studentPlanExercises: exercises,
      studentPlanExerciseIndex: 0,
      studentPlanCurrentSet: 1,
      trainingStartedAt: new Date(),
      scheduleSlotIds: state?.scheduleSlotIds || {}
    };
    await State.set(chatId, newState);
    await ensureScheduleSlot(chatId, studentChatId);
    await showStudentPlanExercise(chatId);
    return true;
  }

  // Type selection
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_PERSONAL) {
    const state = await State.get(chatId);
    const ids = state?.coachStudentIds || [];
    const names = state?.coachStudentNames || [];
    if (ids.length === 1) {
      const studentChatId = ids[0];
      const plan = await supabase.getActivePlanForStudent(studentChatId);
      if (plan && plan.exercises && plan.exercises.length > 0) {
        await State.set(chatId, {
          ...state,
          step: CONSTANTS.FSM_STATES.TRAINING_GROUP,
          coachTrainingType: CONSTANTS.TRAINING_TYPES.PERSONAL,
          coachSelectedIds: [ids[0]],
          coachSelectedNames: [names[0] || ids[0]],
          targetUserId: ids[0],
          requireTargetSelect: false,
          trainingStartedAt: new Date(),
          scheduleSlotIds: {},
          trainingMode: 'SINGLE'
        });
        await showCoachTrainingPlanChoice(chatId, studentChatId, plan);
        return true;
      }
      await State.set(chatId, {
        ...state,
        step: CONSTANTS.FSM_STATES.TRAINING_GROUP,
        coachTrainingType: CONSTANTS.TRAINING_TYPES.PERSONAL,
        coachSelectedIds: [ids[0]],
        coachSelectedNames: [names[0] || ids[0]],
        targetUserId: ids[0],
        requireTargetSelect: false,
        trainingStartedAt: new Date(),
        scheduleSlotIds: {},
        trainingMode: 'SINGLE'
      });
      await Helpers.safeSend(chatId, '✅ ' + (names[0] || ids[0]));
      await askExecutionTypeThenMuscleGroup(chatId);
    } else {
      await State.set(chatId, {
        ...state,
        step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS,
        coachTrainingType: CONSTANTS.TRAINING_TYPES.PERSONAL,
        requiredStudentCount: 1
      });
      await askSelectStudents(chatId, 1);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_SPLIT) {
    const state = await State.get(chatId);
    await State.set(chatId, {
      ...state,
      step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS,
      coachTrainingType: CONSTANTS.TRAINING_TYPES.SPLIT,
      requiredStudentCount: 2
    });
    await askSelectStudents(chatId, 2);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_TRIO) {
    const state = await State.get(chatId);
    await State.set(chatId, {
      ...state,
      step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS,
      coachTrainingType: CONSTANTS.TRAINING_TYPES.TRIO,
      requiredStudentCount: 3
    });
    await askSelectStudents(chatId, 3);
    return true;
  }

  // Pick student by surname (initial selection for Personal/Split/Trio)
  if (action === CONSTANTS.CALLBACKS.TRAINING_PICK_STUDENT && rest) {
    const state = await State.get(chatId);
    if (state?.step !== CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS) return false;
    const studentId = rest.trim();
    const ids = state.coachStudentIds || [];
    const names = state.coachStudentNames || [];
    const selectedIds = state.selectedStudentIds || [];
    const selectedNames = state.selectedStudentNames || [];
    if (selectedIds.indexOf(studentId) >= 0) return true;
    const idx = ids.indexOf(studentId);
    const name = idx >= 0 ? (names[idx] || studentId) : studentId;
    const newSelectedIds = [...selectedIds, studentId];
    const newSelectedNames = [...selectedNames, name];
    const required = state.requiredStudentCount || 1;
    await State.update(chatId, { selectedStudentIds: newSelectedIds, selectedStudentNames: newSelectedNames });
    if (newSelectedIds.length >= required) {
      const baseState = {
        ...state,
        coachSelectedIds: newSelectedIds,
        coachSelectedNames: newSelectedNames,
        targetUserId: newSelectedIds[0],
        requireTargetSelect: newSelectedIds.length > 1,
        trainingStartedAt: new Date(),
        scheduleSlotIds: {},
        trainingMode: newSelectedIds.length > 1 ? (newSelectedIds.length === 2 ? 'SPLIT' : 'TRIO') : 'SINGLE',
        selectedStudentIds: undefined,
        selectedStudentNames: undefined
      };
      if (required === 1) {
        const studentChatId = newSelectedIds[0];
        const plan = await supabase.getActivePlanForStudent(studentChatId);
        if (plan && plan.exercises && plan.exercises.length > 0) {
          await State.set(chatId, { ...baseState, step: CONSTANTS.FSM_STATES.TRAINING_GROUP, mode: CONSTANTS.TRAINING_MODES.COACH, coachTrainingType: CONSTANTS.TRAINING_TYPES.PERSONAL });
          await Helpers.safeSend(chatId, '✅ Обрано: ' + newSelectedNames.join(', '));
          await showCoachTrainingPlanChoice(chatId, studentChatId, plan);
          return true;
        }
      }
      await State.set(chatId, { ...baseState, step: CONSTANTS.FSM_STATES.TRAINING_GROUP });
      await Helpers.safeSend(chatId, '✅ Обрано: ' + newSelectedNames.join(', '));
      await askExecutionTypeThenMuscleGroup(chatId);
    } else {
      await showStudentPickKeyboard(chatId, required, newSelectedIds.length);
    }
    return true;
  }

  // Target student (Split/Trio)
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT) {
    await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_SELECT_STUDENT && rest) {
    const state = await State.get(chatId);
    const pending = state?.pendingAction;
    await State.update(chatId, { targetUserId: rest, pendingAction: undefined });
    if (pending === 'ASK_TRAINING_INPUT_SET_CIRCUIT') {
      await askTrainingInputForSetCircuit(chatId);
      return true;
    }
    const execType = state?.trainingExecutionType || 'SET';
    if (execType === 'SINGLE') {
      await askTrainingInputDataSingle(chatId);
    } else {
      await askTrainingInputData(chatId);
    }
    return true;
  }

  // Muscle group
  if (action === CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP) {
    const state = await State.get(chatId);
    await State.set(chatId, { ...state, pendingShowExercises: undefined, pendingAction: undefined });
    await askMuscleGroup(chatId);
    return true;
  }
  if (action.startsWith(CONSTANTS.CALLBACK_PREFIXES.GROUP + ':') || (action === CONSTANTS.CALLBACK_PREFIXES.GROUP && rest)) {
    const parts = String(callbackData || '').split(':');
    const topLevels = CONSTANTS.TOP_LEVEL_GROUPS || [];
    if (parts.length >= 3) {
      const topLevel = parts[1];
      const group = parts.slice(2).join(':').trim();
      await showGroupOrExercises(chatId, topLevel, group);
    } else {
      const groupName = rest || parts.slice(1).join(':');
      if (topLevels.includes(groupName)) {
        await showSecondLevelGroups(chatId, groupName);
      } else {
        await showGroupOrExercises(chatId, groupName, null);
      }
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.GROUP2 && rest) {
    const parts = String(callbackData || '').split(':');
    const level1 = parts[1] || '';
    const level2 = parts[2] && parts[2] !== '__all__' ? parts[2] : null;
    const level3 = parts.length >= 4 ? (parts[3] === '__all__' ? null : parts.slice(3).join(':').trim()) : null;
    await showExercises(chatId, level1, level2, level3);
    return true;
  }

  // Exercise
  if (action.startsWith(CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':') || (action === CONSTANTS.CALLBACK_PREFIXES.EXERCISE && rest)) {
    const exId = rest || action.split(':').slice(1).join(':');
    const exercise = await supabase.getExerciseById(exId);
    if (!exercise) {
      await Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
      return true;
    }
    const state = await State.get(chatId);
    const execType = state?.trainingExecutionType || 'SET';
    if (execType === 'SET') {
      const list = Array.isArray(state?.setExerciseList) ? [...state.setExerciseList] : [];
      list.push({ id: String(exercise.id), name: exercise.name || 'Вправа' });
      await State.set(chatId, { ...state, setExerciseList: list, step: CONSTANTS.FSM_STATES.TRAINING_SET_BUILD });
      await showSetBuildScreen(chatId);
      return true;
    }
    await State.update(chatId, {
      exerciseId: String(exercise.id),
      exerciseName: exercise.name,
      currentSet: 1
    });
    const st = await State.get(chatId);
    if (st?.coachSelectedIds && st.coachSelectedIds.length > 1) {
      await askTargetStudentSelection(chatId, execType === 'SINGLE' ? 'ASK_TRAINING_INPUT_SINGLE' : 'ASK_TRAINING_INPUT');
    } else if (execType === 'SINGLE') {
      await askTrainingInputDataSingle(chatId);
    } else {
      await askTrainingInputData(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_SET_ADD_MORE) {
    await askMuscleGroup(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_SET_GO) {
    const state = await State.get(chatId);
    const list = state?.setExerciseList;
    if (!list || list.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Додай ще мін. одну вправу до сету.');
      await showSetBuildScreen(chatId);
      return true;
    }
    await State.update(chatId, {
      setCurrentRound: 1,
      setCurrentExerciseIndex: 0,
      setExerciseIndex: undefined
    });
    const st = await State.get(chatId);
    if (st?.coachSelectedIds && st.coachSelectedIds.length > 1) {
      await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT_SET_CIRCUIT');
    } else {
      await askTrainingInputForSetCircuit(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_SET_ADD_ROUND) {
    const state = await State.get(chatId);
    const round = (state?.setCurrentRound || 1) + 1;
    await State.update(chatId, { setCurrentRound: round, setCurrentExerciseIndex: 0 });
    await askTrainingInputForSetCircuit(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_SET_FINISH) {
    const state = await State.get(chatId);
    await State.update(chatId, {
      setExerciseList: undefined,
      setCurrentRound: undefined,
      setCurrentExerciseIndex: undefined,
      setExerciseIndex: undefined,
      exerciseId: undefined,
      exerciseName: undefined
    });
    await Helpers.safeSend(chatId, '✅ Сет завершено. Обери наступну вправу або заверши тренування.');
    await askMuscleGroup(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SINGLE) {
    const state = await State.get(chatId);
    await State.update(chatId, {
      trainingExecutionType: 'SINGLE',
      pendingShowExercises: undefined,
      pendingAction: undefined
    });
    if (state?.pendingAction === 'ASK_MUSCLE_GROUP') {
      await askMuscleGroup(chatId);
      return true;
    }
    const p = state?.pendingShowExercises;
    if (p) {
      await showExercises(chatId, p.groupLevel1, p.groupLevel2, p.groupLevel3);
      return true;
    }
    if (state?.pendingAction === 'SEARCH') {
      await State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT });
      await Helpers.safeSend(chatId, "🔎 Введи мінімум 2 літери для пошуку вправи:\n\nПриклад: жим");
      return true;
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SET) {
    const state = await State.get(chatId);
    await State.update(chatId, {
      trainingExecutionType: 'SET',
      setExercisesCount: 0,
      pendingShowExercises: undefined,
      pendingAction: undefined
    });
    if (state?.pendingAction === 'ASK_MUSCLE_GROUP') {
      await askMuscleGroup(chatId);
      return true;
    }
    const p = state?.pendingShowExercises;
    if (p) {
      await showExercises(chatId, p.groupLevel1, p.groupLevel2, p.groupLevel3);
      return true;
    }
    if (state?.pendingAction === 'SEARCH') {
      await State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT });
      await Helpers.safeSend(chatId, "🔎 Введи мінімум 2 літери для пошуку вправи:\n\nПриклад: жим");
      return true;
    }
    return true;
  }

  // Search
  if (action === CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME) {
    const state = await State.get(chatId);
    if (!state?.trainingExecutionType) {
      await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_EXERCISE_TYPE, pendingAction: 'SEARCH' });
      const keyboard = [
        [{ text: '1️⃣ Одиночне (1 вправа)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SINGLE }],
        [{ text: '🔄 Сет (мін. 2 вправи)', callback_data: CONSTANTS.CALLBACKS.TRAINING_EXEC_TYPE_SET }],
        [{ text: CONSTANTS.EMOJI.BACK + ' До груп', callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]
      ];
      await Helpers.sendKeyboard(chatId, '💪 Спочатку оберіть тип тренування:\n\n• **Одиночне** — одна вправа\n• **Сет** — мін. 2 вправи', keyboard, { parse_mode: 'Markdown' });
      return true;
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT });
    await Helpers.safeSend(chatId, "🔎 Введи мінімум 2 літери для пошуку вправи:\n\nПриклад: жим");
    return true;
  }

  // Training actions
  if (action === CONSTANTS.CALLBACKS.TRAINING_MODE_SINGLE) {
    await askMuscleGroup(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_PLAN_DAY && rest) {
    const dayNum = parseInt(rest.trim(), 10);
    const state = await State.get(chatId);
    if (state?.mode !== 'STUDENT_PLAN' || !state.studentPlanPlan) return false;
    const exercises = (state.studentPlanPlan.exercises || []).filter((e) => e.dayNumber === dayNum);
    if (!exercises.length) {
      await Helpers.safeSend(chatId, '❌ Вправи для цього дня не знайдено.');
      return true;
    }
    await State.set(chatId, {
      ...state,
      step: CONSTANTS.FSM_STATES.TRAINING_STUDENT_PLAN_INPUT,
      studentPlanDayNumber: dayNum,
      studentPlanExercises: exercises,
      studentPlanExerciseIndex: 0,
      studentPlanCurrentSet: 1
    });
    await showStudentPlanExercise(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_ADD_SET) {
    const state = await State.get(chatId);
    if (state?.mode === 'STUDENT_PLAN' || state?.coachPlanWorkout) {
      await showStudentPlanExercise(chatId);
      return true;
    }
    if (state?.mode === CONSTANTS.TRAINING_MODES.SELF) {
      await askTrainingInputData(chatId);
    } else if (state?.coachSelectedIds && state.coachSelectedIds.length > 1) {
      await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT');
    } else {
      await askTrainingInputData(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE) {
    const state = await State.get(chatId);
    if (state?.mode === 'STUDENT_PLAN' || state?.coachPlanWorkout) {
      const exercises = state.studentPlanExercises || [];
      const idx = (state.studentPlanExerciseIndex || 0) + 1;
      await State.set(chatId, { ...state, studentPlanExerciseIndex: idx, studentPlanCurrentSet: 1 });
      await showStudentPlanExercise(chatId);
      return true;
    }
    await finishExercise(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH) {
    const state = await State.get(chatId);
    if (state?.mode === 'STUDENT_PLAN' || state?.coachPlanWorkout) {
      await finishStudentPlanWorkout(chatId);
      return true;
    }
    await finishWorkout(chatId);
    return true;
  }

  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;

  const step = state.step;

  if (step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS) {
    await Helpers.safeSend(chatId, '👆 Оберіть учня кнопкою з прізвищем вище.');
    return true;
  }
  if (step === CONSTANTS.FSM_STATES.TRAINING_SET_ROUND_DONE) {
    await Helpers.safeSend(chatId, '👆 Обери кнопку: «Додати круг» або «Завершити сет».');
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_TARGET) {
    const ids = state.coachSelectedIds || [];
    const names = state.coachSelectedNames || [];
    const numbers = parseStudentNumbers(text, 1, ids.length);
    if (!numbers) {
      await Helpers.safeSend(chatId, '⚠️ Введи номер учня зі списку (1–' + ids.length + ').');
      return true;
    }
    const idx = numbers[0] - 1;
    await State.update(chatId, { targetUserId: ids[idx], pendingAction: undefined });
    await askTrainingInputData(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_STUDENT_PLAN_INPUT) {
    const parts = String(text).trim().split(/\s+/);
    if (parts.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи вагу і повтори через пробіл.\n\nПриклад: 20 12');
      return true;
    }
    const weightVal = parseFloat(parts[0]);
    const repsVal = parseInt(parts[1], 10);
    if (isNaN(weightVal) || weightVal < 0 || weightVal > 500) {
      await Helpers.safeSend(chatId, '⚠️ Вага має бути від 0 до 500 кг.');
      return true;
    }
    if (isNaN(repsVal) || repsVal < 1 || repsVal > 100) {
      await Helpers.safeSend(chatId, '⚠️ Повтори мають бути від 1 до 100.');
      return true;
    }
    const exercises = state.studentPlanExercises || [];
    const idx = state.studentPlanExerciseIndex || 0;
    const currentSet = state.studentPlanCurrentSet || 1;
    if (idx >= exercises.length) {
      await finishStudentPlanWorkout(chatId);
      return true;
    }
    const ex = exercises[idx];
    const chatIdForData = state.coachPlanWorkout && (state.targetUserId || state.coachPlanStudentId) ? String(state.targetUserId || state.coachPlanStudentId) : String(chatId);
    await supabase.insertTrainingData({
      date: new Date(),
      exerciseId: ex.exerciseId,
      exercise: ex.exerciseName || '',
      weight: weightVal,
      reps: repsVal,
      set: currentSet,
      chatId: chatIdForData
    });
    const setsTotal = ex.sets != null ? ex.sets : 3;
    const nextSet = currentSet + 1;
    if (nextSet > setsTotal) {
      await State.set(chatId, { ...state, studentPlanExerciseIndex: idx + 1, studentPlanCurrentSet: 1 });
      await Helpers.safeSend(chatId, '✅ Підхід №' + currentSet + ' записано. Вправу завершено.');
      await showStudentPlanExercise(chatId);
    } else {
      await State.set(chatId, { ...state, studentPlanCurrentSet: nextSet });
      const keyboard = [
        [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
        [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
      ];
      await Helpers.sendKeyboard(chatId, '✅ Підхід №' + currentSet + ' записано.\n\nВведи вагу і повтори для підходу №' + nextSet + ':', keyboard);
    }
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA) {
    const parts = String(text).trim().split(/\s+/);
    if (parts.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи вагу і повтори через пробіл.\n\nПриклад: 20 12');
      return true;
    }
    const weightVal = parseFloat(parts[0]);
    const repsVal = parseInt(parts[1], 10);
    if (isNaN(weightVal) || weightVal < 0 || weightVal > 500) {
      await Helpers.safeSend(chatId, '⚠️ Вага має бути від 0 до 500 кг.');
      return true;
    }
    if (isNaN(repsVal) || repsVal < 1 || repsVal > 100) {
      await Helpers.safeSend(chatId, '⚠️ Повтори мають бути від 1 до 100.');
      return true;
    }
    const targetUserId = state.targetUserId || (state.coachSelectedIds && state.coachSelectedIds[0]) || chatId;
    const exerciseId = state.exerciseId;
    const exerciseName = state.exerciseName || '';
    const setNum = state.currentSet || 1;

    await ensureScheduleSlot(chatId, targetUserId);
    await supabase.insertTrainingData({
      date: new Date(),
      exerciseId: exerciseId,
      exercise: exerciseName,
      weight: weightVal,
      reps: repsVal,
      set: setNum,
      chatId: String(targetUserId)
    });

    if (state.singleExecution) {
      await finishExercise(chatId);
      return true;
    }

    if (Array.isArray(state.setExerciseList) && state.setCurrentRound != null && state.setCurrentExerciseIndex != null) {
      const list = state.setExerciseList;
      const nextIdx = state.setCurrentExerciseIndex + 1;
      if (nextIdx < list.length) {
        await State.update(chatId, { setCurrentExerciseIndex: nextIdx });
        await Helpers.safeSend(chatId, '✅ Записано. Наступна вправа в крузі:');
        await askTrainingInputForSetCircuit(chatId);
        return true;
      }
      await showRoundCompleteScreen(chatId);
      return true;
    }

    await State.update(chatId, { currentSet: setNum + 1 });

    const keyboard = [
      [{ text: '➕ Додати підхід', callback_data: CONSTANTS.CALLBACKS.TRAINING_ADD_SET }],
      [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
      [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
    ];
    await Helpers.sendKeyboard(chatId, '✅ Підхід №' + setNum + ' записано.\n\nПродовжуємо?', keyboard);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT) {
    const query = String(text || '').trim();
    if (query.length < 2) {
      await Helpers.safeSend(chatId, '⚠️ Введи мінімум 2 літери.');
      return true;
    }
    const exercises = await supabase.searchExercises(query);
    if (!exercises || exercises.length === 0) {
      await Helpers.safeSend(chatId, '❌ Нічого не знайдено. Спробуй інший запит.');
      await askMuscleGroup(chatId);
      return true;
    }
    const state = await State.get(chatId);
    await State.update(chatId, { step: 'training_exercise' });
    const keyboard = exercises.slice(0, 15).map((ex) => [
      { text: (ex.name || 'Вправа').slice(0, 60), callback_data: CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':' + ex.id }
    ]);
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + " До груп", callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
    await Helpers.sendKeyboard(chatId, '🔎 Результати пошуку «' + query + '»:\n\nОбери вправу:', keyboard);
    return true;
  }

  return false;
}

module.exports = {
  startSelfTraining,
  startCoachTrainingFlow,
  startCoachTrainingForStudent,
  startStudentPlanWorkout,
  handleCallback,
  handleTextMessage
};
