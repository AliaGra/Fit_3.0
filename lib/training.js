/**
 * Training — модуль тренувань (Coach Mode: Personal / Split / Trio)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Menu = require('./menu');

// ——— ENTRY: Тренування учнів (меню) ———
async function startCoachTrainingFlow(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Menu.show(chatId);
    return;
  }
  const students = await User.getStudentsByCoach(chatId);
  const active = (students || []).filter((s) => !s.userId || String(s.userId).indexOf('INVITE_') !== 0);
  if (active.length === 0) {
    await Helpers.safeSend(chatId, '👥 У тебе немає активних учнів. Додай учня в «Мої учні».');
    await Menu.show(chatId);
    return;
  }
  const ids = active.map((s) => String(s.chatId));
  const names = active.map((s) => (s.firstName || '') + ' ' + (s.lastName || '').trim());
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_TYPE,
    mode: CONSTANTS.TRAINING_MODES.COACH,
    coachStudentIds: ids,
    coachStudentNames: names,
    coachTrainingType: '',
    requireTargetSelect: false
  });
  await askCoachTrainingType(chatId);
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
  const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
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
  await askMuscleGroup(chatId);
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
  const names = state?.coachStudentNames || [];
  const ids = state?.coachStudentIds || [];
  let text = '👥 Обери ' + required + ' учн' + (required === 1 ? 'я' : 'ів') + ':\n\n';
  for (let i = 0; i < names.length; i++) {
    text += (i + 1) + '. ' + names[i] + '\n';
  }
  text += '\nВведи номер' + (required > 1 ? 'и через кому (наприклад: 1,2)' : '') + ':';
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS, requiredStudentCount: required });
  await Helpers.safeSend(chatId, text);
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
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_GROUP });
  const topGroups = CONSTANTS.TOP_LEVEL_GROUPS || ['Низ', 'Верх'];
  const keyboard = topGroups.map((g) => [{ text: g, callback_data: CONSTANTS.CALLBACK_PREFIXES.GROUP + ':' + g }]);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  keyboard.push([{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]);
  await Helpers.sendKeyboard(chatId, "💪 Обери групу м'язів:", keyboard);
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
  await State.set(chatId, { ...state, step: 'training_exercise', selectedGroup: groupLevel2 || groupLevel1 });
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
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA });
  const exName = state?.exerciseName || 'Вправа';
  const targetName = state?.coachSelectedNames && state?.coachSelectedIds
    ? state.coachSelectedNames[state.coachSelectedIds.indexOf(state.targetUserId)] || ''
    : '';
  let text = '💪 ' + exName + '\n\n';
  if (targetName) text += 'Для: ' + targetName + '\n\n';
  text += 'Введи вагу і повтори через пробіл.\n\nПриклад: 20 12\nДля власної ваги: 0 15';
  const keyboard = [
    [{ text: '➕ Додати підхід', callback_data: CONSTANTS.CALLBACKS.TRAINING_ADD_SET }],
    [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }],
    [{ text: '🏁 Завершити тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function ensureScheduleSlot(chatId, targetUserId) {
  const state = await State.get(chatId);
  if (state?.mode !== CONSTANTS.TRAINING_MODES.COACH) return;
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
  await State.clear(chatId);
  if (wasCoach && scheduleSlotIds && typeof scheduleSlotIds === 'object') {
    for (const studentId of Object.keys(scheduleSlotIds)) {
      const slotId = scheduleSlotIds[studentId];
      if (slotId) {
        try {
          await supabase.updateScheduleSlotStatus(slotId, CONSTANTS.SCHEDULE_STATUS.COMPLETED);
        } catch (e) {
          console.error('Training.finishWorkout updateSlot', e.message);
        }
      }
    }
  }
  await Helpers.safeSend(chatId, '✅ Тренування завершено!\n\nГарна робота! 💪');
  await Menu.show(chatId);
}

async function finishExercise(chatId) {
  const state = await State.get(chatId);
  await State.update(chatId, {
    exerciseId: undefined,
    exerciseName: undefined,
    currentSet: 1
  });
  await askMuscleGroup(chatId);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const rest = String(callbackData || '').split(':').slice(1).join(':').trim();

  // Type selection
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_PERSONAL) {
    const state = await State.get(chatId);
    const ids = state?.coachStudentIds || [];
    const names = state?.coachStudentNames || [];
    if (ids.length === 1) {
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
      await askMuscleGroup(chatId);
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

  // Target student (Split/Trio)
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT) {
    await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_SELECT_STUDENT && rest) {
    const state = await State.get(chatId);
    const pending = state?.pendingAction || 'ASK_TRAINING_INPUT';
    await State.update(chatId, { targetUserId: rest, pendingAction: undefined });
    await askTrainingInputData(chatId);
    return true;
  }

  // Muscle group
  if (action === CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP) {
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
    await State.update(chatId, {
      exerciseId: String(exercise.id),
      exerciseName: exercise.name,
      currentSet: 1
    });
    const st = await State.get(chatId);
    if (st?.coachSelectedIds && st.coachSelectedIds.length > 1) {
      await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT');
    } else {
      await askTrainingInputData(chatId);
    }
    return true;
  }

  // Search
  if (action === CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME) {
    const state = await State.get(chatId);
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT });
    await Helpers.safeSend(chatId, "🔎 Введи мінімум 2 літери для пошуку вправи:\n\nПриклад: жим");
    return true;
  }

  // Training actions
  if (action === CONSTANTS.CALLBACKS.TRAINING_MODE_SINGLE) {
    await askMuscleGroup(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_ADD_SET) {
    const state = await State.get(chatId);
    if (state?.coachSelectedIds && state.coachSelectedIds.length > 1) {
      await askTargetStudentSelection(chatId, 'ASK_TRAINING_INPUT');
    } else {
      await askTrainingInputData(chatId);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE) {
    await finishExercise(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH) {
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
    const ids = state.coachStudentIds || [];
    const names = state.coachStudentNames || [];
    const required = state.requiredStudentCount || 1;
    const numbers = parseStudentNumbers(text, required, ids.length);
    if (!numbers) {
      await Helpers.safeSend(chatId, '⚠️ Невірний вибір. Введи ' + required + ' номер' + (required > 1 ? 'и через кому' : '') + ' (1–' + ids.length + ').');
      return true;
    }
    const selectedIds = numbers.map((n) => ids[n - 1]);
    const selectedNames = numbers.map((n) => names[n - 1]);
    await State.set(chatId, {
      ...state,
      coachSelectedIds: selectedIds,
      coachSelectedNames: selectedNames,
      targetUserId: selectedIds[0],
      requireTargetSelect: selectedIds.length > 1,
      step: CONSTANTS.FSM_STATES.TRAINING_GROUP,
      trainingStartedAt: new Date(),
      scheduleSlotIds: {},
      trainingMode: 'SINGLE'
    });
    await Helpers.safeSend(chatId, '✅ Обрано: ' + selectedNames.join(', '));
    await askMuscleGroup(chatId);
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
  startCoachTrainingFlow,
  startCoachTrainingForStudent,
  handleCallback,
  handleTextMessage
};
