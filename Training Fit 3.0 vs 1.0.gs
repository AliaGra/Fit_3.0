/**
 * Training.gs - FSM Handler тренувань
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Логування тренувань (одинарна + круговий)
 * - Історія тренувань з фільтрами
 * - Бібліотека вправ
 * - 3 режими (Student/Coach/SELF)
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку користувачів (це User.gs)
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Почати тренування
 *
 * @param {string|number} chatId - Хто запустив (може бути coach або student)
 * @param {string|number} targetUserId - ДЛЯ КОГО записувати (може відрізнятися від chatId)
 *
 * @example
 * // Student тренується сам:
 * Training.startWorkout(studentChatId, studentChatId);
 *
 * // Coach веде за учня:
 * Training.startWorkout(coachChatId, studentChatId);
 *
 * // Coach тренується сам (SELF):
 * Training.startWorkout(coachChatId, coachChatId);
 */
function trainingStartWorkout_(chatId, targetUserId) {
  targetUserId = targetUserId || chatId;

  var mode;
  if (String(chatId) === String(targetUserId)) {
    var user = User.getByChatId(chatId);
    mode = (user && user.role === CONSTANTS.ROLES.COACH) ? CONSTANTS.TRAINING_MODES.SELF : CONSTANTS.TRAINING_MODES.STUDENT;
  } else {
    mode = CONSTANTS.TRAINING_MODES.COACH;
  }

  var statePayload = {
    step: 'training_mode',
    mode: mode,
    targetUserId: String(targetUserId)
  };
  if (mode === CONSTANTS.TRAINING_MODES.COACH) {
    statePayload.trainingStartedAt = new Date();
    statePayload.scheduleSlotIds = {};
  }
  State.set(chatId, statePayload);

  askTrainingMode_(chatId, targetUserId);
}

/**
 * Обробка callback
 *
 * @param {string|number} chatId
 * @param {string} action
 * @param {Array} params
 */
function trainingHandleCallback_(chatId, action, params) {
  params = params || [];
  try {
    if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
      Helpers.logToSheets(CONSTANTS.LOG_LEVELS.INFO, 'Training.handleCallback', 'enter action=' + action + ' chatId=' + chatId);
    }
  } catch (elog) {}

  try {
    if (action === CONSTANTS.CALLBACKS.TRAINING_START) {
      trainingStartWorkout_(chatId, chatId);
      return;
    }

  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_START) {
    startCoachTrainingFlow_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_PERSONAL ||
      action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_SPLIT ||
      action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_TRIO) {
    handleCoachTrainingType_(chatId, action);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT) {
    askTargetStudentSelection_(chatId, 'ASK_TRAINING_INPUT');
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_MODE_SINGLE) {
    State.update(chatId, { trainingMode: 'SINGLE' });
    askMuscleGroup_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_MODE_CIRCUIT) {
    State.update(chatId, { trainingMode: 'CIRCUIT' });
    askMuscleGroup_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME) {
    State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT });
    askExerciseSearch_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP) {
    askMuscleGroup_(chatId);
    return;
  }

  if (action.indexOf(CONSTANTS.CALLBACK_PREFIXES.GROUP + ':') === 0 || (action === CONSTANTS.CALLBACK_PREFIXES.GROUP && params[0])) {
    var groupName = action.split(':').slice(1).join(':') || (params[0] || '');
    State.update(chatId, { selectedGroup: groupName });
    showExercises_(chatId, groupName);
    return;
  }

  if (action.indexOf(CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':') === 0 || (action === CONSTANTS.CALLBACK_PREFIXES.EXERCISE && params[0])) {
    var exerciseId = action.split(':').slice(1).join(':') || (params[0] || '');
    var exercise = Sheets.getExerciseById(exerciseId);
    if (!exercise) {
      Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
      return;
    }
    State.update(chatId, {
      exerciseId: String(exercise.id),
      exerciseName: exercise.exerciseName
    });
    var stateData = State.get(chatId);
    if (stateData.trainingMode === 'CIRCUIT') {
      addExerciseToCircuit_(chatId, String(exercise.id), exercise.exerciseName);
    } else {
      State.update(chatId, { currentSet: 1, step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA });
      if (stateData.coachStudentIds && stateData.coachStudentIds.length > 1) {
        State.update(chatId, { requireTargetSelect: true });
      }
      askTrainingInputData_(chatId);
    }
    return;
  }

  if (action === CONSTANTS.CALLBACKS.CIRCUIT_START) {
    startCircuitWorkout_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH) {
    finishWorkout_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_ADD_SET) {
    var stAdd = State.get(chatId) || {};
    if (stAdd.coachStudentIds && stAdd.coachStudentIds.length > 1) {
      State.update(chatId, { requireTargetSelect: true });
    }
    askTrainingInputData_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE) {
    finishExercise_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_CIRCUIT_NEXT_ROUND) {
    var s = State.get(chatId);
    var nextRound = (s && s.circuitRound) ? (s.circuitRound + 1) : 2;
    State.update(chatId, { circuitRound: nextRound, circuitCurrentIndex: 0 });
    if (s && s.coachStudentIds && s.coachStudentIds.length > 1) {
      State.update(chatId, { requireTargetSelect: true });
    }
    askCircuitInputData_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.TRAINING_CIRCUIT_CHANGE_EXERCISE) {
    State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_CIRCUIT_CHANGE_INPUT });
    Helpers.safeSend(chatId, '🔁 Введи номер вправи зі списку (1, 2, 3...), щоб змінити активну:');
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_MENU) {
    showHistoryMenu_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_CURRENT) {
    showCurrentTraining_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_PREVIOUS) {
    showPreviousTraining_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_ALL) {
    showAllHistory_(chatId, 20);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_BY_GROUP) {
    askHistoryGroup_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_BY_EXERCISE) {
    askHistoryExercise_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_LAST_N) {
    askHistoryN_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_PROGRESS) {
    State.update(chatId, { historyMode: CONSTANTS.HISTORY_MODES.PROGRESS });
    askHistoryExercise_(chatId);
    return;
  }

  if (action.indexOf(CONSTANTS.CALLBACK_PREFIXES.HISTORY_GROUP + ':') === 0) {
    var histGroupName = action.split(':').slice(1).join(':') || (params[0] || '');
    showHistoryByGroup_(chatId, histGroupName);
    return;
  }

  if (action.indexOf(CONSTANTS.CALLBACK_PREFIXES.HISTORY_EXERCISE + ':') === 0) {
    var histExId = action.split(':').slice(1).join(':') || (params[0] || '');
    var stHist = State.get(chatId) || {};
    if (stHist.historyMode === CONSTANTS.HISTORY_MODES.PROGRESS) {
      showHistoryProgressByExercise_(chatId, histExId);
    } else {
      showHistoryByExercise_(chatId, histExId);
    }
    return;
  }

  if (action === CONSTANTS.CALLBACKS.HISTORY_ITEM || action === CONSTANTS.CALLBACK_PREFIXES.HISTORY_ITEM) {
    var histId = params[0] || '';
    showHistoryItem_(chatId, histId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REPORTS_MENU) {
    showReportsMenu_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REPORTS_TRAININGS) {
    askReportsDays_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.REPORTS_INCOME) {
    showReportsIncomeStub_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACKS.LIBRARY_VIEW) {
    showLibrary_(chatId);
    return;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.LIBRARY_GROUP ||
      action.indexOf(CONSTANTS.CALLBACK_PREFIXES.LIBRARY_GROUP + ':') === 0) {
    var libGroupName = params[0] || action.split(':').slice(1).join(':');
    showLibraryExercises_(chatId, libGroupName);
    return;
  }

    Logger.log('Training: Unknown callback: ' + action);
  } catch (err) {
    try {
      if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
        Helpers.logToSheets(CONSTANTS.LOG_LEVELS.ERROR, 'Training.handleCallback', 'error=' + (err && err.message ? err.message : err));
      }
    } catch (elog2) {}
    throw err;
  }
}

/**
 * Обробка текстового введення
 *
 * @param {string|number} chatId
 * @param {string} text
 */
function trainingHandleTextMessage_(chatId, text) {
  var state = State.get(chatId);
  if (!state || !state.step) {
    Logger.log('Training: No state found');
    return;
  }

  var step = state.step;
  var stateData = state;

  if (step === CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA) {
    var parts = String(text).trim().split(/\s+/);
    if (parts.length < 2) {
      Helpers.safeSend(chatId, '⚠️ Введи вагу і повтори через пробіл.\n\nПриклад: 20 12');
      return;
    }
    var weightValue = parseFloat(parts[0]);
    var repsValue = parseInt(parts[1], 10);
    if (isNaN(weightValue) || weightValue < 0 || weightValue > 500) {
      Helpers.safeSend(chatId, '⚠️ Вага має бути від 0 до 500 кг.\n\nСпробуй ще раз:');
      return;
    }
    if (isNaN(repsValue) || repsValue < 1 || repsValue > 100) {
      Helpers.safeSend(chatId, '⚠️ Кількість повторів має бути від 1 до 100.\n\nСпробуй ще раз:');
      return;
    }
    var targetUserId = stateData.targetUserId || chatId;
    if (stateData.mode === CONSTANTS.TRAINING_MODES.COACH && (!stateData.targetUserId || String(stateData.targetUserId) === String(chatId))) {
      if (stateData.coachSelectedIds && stateData.coachSelectedIds.length === 1) {
        targetUserId = stateData.coachSelectedIds[0];
        State.update(chatId, { targetUserId: targetUserId });
      } else {
        try {
          if (typeof Helpers !== 'undefined' && typeof Helpers.logToSheets === 'function') {
            Helpers.logToSheets(CONSTANTS.LOG_LEVELS.WARN, 'Training.handleTextMessage', 'coach mode without targetUserId chatId=' + chatId);
          }
        } catch (elog) {}
        Helpers.safeSend(chatId, '⚠️ Не обрано учня. Повернись до вибору учня та спробуй ще раз.');
        Menu.show(chatId);
        return;
      }
    }
    var exerciseIdValue = stateData.exerciseId;
    var exerciseNameValue = stateData.exerciseName || '';

    if (stateData.mode === CONSTANTS.TRAINING_MODES.COACH) {
      ensureScheduleSlotForCoachSession_(chatId, targetUserId);
    }

    if (stateData.trainingMode === 'CIRCUIT') {
      var roundNumber = stateData.circuitRound || 1;
      var idx = stateData.circuitCurrentIndex || 0;
      Sheets.insertTraining({
        idRecords: Utilities.getUuid(),
        date: new Date(),
        exerciseId: exerciseIdValue,
        exercise: exerciseNameValue,
        weight: weightValue,
        reps: repsValue,
        set: roundNumber,
        chatId: String(targetUserId)
      });
      var nextIndex = idx + 1;
      var total = (stateData.circuitExercises || []).length;
      if (nextIndex < total) {
        State.update(chatId, { circuitCurrentIndex: nextIndex, requireTargetSelect: (stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1) });
        askCircuitInputData_(chatId);
      } else {
        State.update(chatId, { circuitCurrentIndex: 0, requireTargetSelect: (stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1) });
        var kbdRound = [
          [{ text: '🔄 Наступне коло', callback_data: CONSTANTS.CALLBACKS.TRAINING_CIRCUIT_NEXT_ROUND }],
          [{ text: '🏁 Фініш', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH }]
        ];
        Helpers.sendKeyboard(chatId,
          '🎊 Коло ' + roundNumber + ' завершено.\n\nПродовжуємо?',
          kbdRound
        );
      }
    } else {
      var setNumber = stateData.currentSet || 1;
      Sheets.insertTraining({
        idRecords: Utilities.getUuid(),
        date: new Date(),
        exerciseId: exerciseIdValue,
        exercise: exerciseNameValue,
        weight: weightValue,
        reps: repsValue,
        set: setNumber,
        chatId: String(targetUserId)
      });
      State.update(chatId, { currentSet: setNumber + 1 });
      var keyboard = [
        [{ text: '➕ Додати підхід', callback_data: CONSTANTS.CALLBACKS.TRAINING_ADD_SET }],
        [{ text: '✅ Завершити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_FINISH_EXERCISE }]
      ];
      Helpers.sendKeyboard(chatId,
        '✅ Підхід №' + setNumber + ' записано.\n\nПродовжуємо?',
        keyboard
      );
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS) {
    handleCoachSelectStudentsInput_(chatId, text);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_TARGET) {
    handleCoachSelectTargetInput_(chatId, text);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_CIRCUIT_CHANGE_INPUT) {
    var idxText = String(text).trim();
    var idxNum = parseInt(idxText, 10);
    var exList = stateData.circuitExercises || [];
    if (isNaN(idxNum) || idxNum < 1 || idxNum > exList.length) {
      Helpers.safeSend(chatId, '⚠️ Введи номер від 1 до ' + exList.length + '.');
      return;
    }
    State.update(chatId, { circuitCurrentIndex: idxNum - 1 });
    askCircuitInputData_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT) {
    var query = String(text || '').trim();
    if (query.length < 3) {
      Helpers.safeSend(chatId, '⚠️ Введи мінімум 3 літери для пошуку.\n\nПриклад: жим');
      return;
    }
    showExerciseSearchResults_(chatId, query);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_WEIGHT) {
    var weight = parseFloat(String(text).trim());
    if (isNaN(weight) || weight < 0 || weight > 500) {
      Helpers.safeSend(chatId, '⚠️ Вага має бути від 0 до 500 кг.\n\nСпробуй ще раз:');
      return;
    }
    if (stateData.trainingMode === 'CIRCUIT' && stateData.circuitCurrentIndex !== undefined) {
      State.update(chatId, { tempWeight: weight });
      State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_REPS });
      Helpers.safeSend(chatId, '🔢 Введи кількість повторів:');
    } else {
      State.update(chatId, { weight: weight });
      askReps_(chatId);
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_REPS) {
    var reps = parseInt(String(text).trim(), 10);
    if (isNaN(reps) || reps < 1 || reps > 100) {
      Helpers.safeSend(chatId, '⚠️ Кількість повторів має бути від 1 до 100.\n\nСпробуй ще раз:');
      return;
    }
    if (stateData.trainingMode === 'CIRCUIT' && stateData.circuitCurrentIndex !== undefined) {
      var index = stateData.circuitCurrentIndex;
      var exercises = stateData.circuitExercises || [];
      exercises[index] = exercises[index] || {};
      exercises[index].weight = stateData.tempWeight;
      exercises[index].reps = reps;
      State.update(chatId, { circuitExercises: exercises });
      if (index + 1 < exercises.length) {
        collectCircuitExerciseData_(chatId, index + 1);
      } else {
        State.update(chatId, { step: 'training_circuit_count' });
        Helpers.safeSend(chatId, '🔄 **Всі вправи готові!**\n\nСкільки кіл виконано?\n\nВведи число від 1 до 10:', { parse_mode: 'Markdown' });
      }
    } else {
      State.update(chatId, { reps: reps });
      askSets_(chatId);
    }
    return;
  }

  if (step === CONSTANTS.FSM_STATES.TRAINING_SET) {
    var sets = parseInt(String(text).trim(), 10);
    if (isNaN(sets) || sets < 1 || sets > 20) {
      Helpers.safeSend(chatId, '⚠️ Кількість сетів має бути від 1 до 20.\n\nСпробуй ще раз:');
      return;
    }
    State.update(chatId, { sets: sets });
    saveSingleExercise_(chatId);
    return;
  }

  if (step === 'training_circuit_count') {
    var circuitCount = parseInt(String(text).trim(), 10);
    if (isNaN(circuitCount) || circuitCount < 1 || circuitCount > 10) {
      Helpers.safeSend(chatId, '⚠️ Кількість кіл має бути від 1 до 10.\n\nСпробуй ще раз:');
      return;
    }
    State.update(chatId, { circuitCount: circuitCount });
    saveCircuitWorkout_(chatId);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.HISTORY_INPUT_N) {
    var n = parseInt(String(text).trim(), 10);
    if (isNaN(n) || n < 1 || n > 50) {
      Helpers.safeSend(chatId, '⚠️ Кількість тренувань має бути від 1 до 50.\n\nСпробуй ще раз:');
      return;
    }
    showLastNWorkouts_(chatId, n);
    return;
  }

  if (step === CONSTANTS.FSM_STATES.REPORTS_TRAININGS_INPUT_DAYS) {
    var days = parseInt(String(text).trim(), 10);
    if (isNaN(days) || days < 1 || days > 365) {
      Helpers.safeSend(chatId, '⚠️ Введи число від 1 до 365.');
      return;
    }
    showReportsTrainings_(chatId, days);
    return;
  }

  Logger.log('Training: Unknown state: ' + step);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ОДИНАРНА ВПРАВА
// ═══════════════════════════════════════════════════════════

function startCoachTrainingFlow_(chatId) {
  var students = (typeof User !== 'undefined' && typeof User.getStudentsByCoach === 'function') ? User.getStudentsByCoach(chatId) : [];
  if (!students || students.length === 0) {
    Helpers.safeSend(chatId, 'ℹ️ У тебе ще немає учнів.');
    return;
  }
  var ids = [];
  var names = [];
  for (var i = 0; i < students.length; i++) {
    ids.push(String(students[i].chatId));
    names.push((students[i].firstName || '') + (students[i].lastName ? ' ' + students[i].lastName : ''));
  }
  State.set(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_TYPE,
    mode: CONSTANTS.TRAINING_MODES.COACH,
    coachStudentIds: ids,
    coachStudentNames: names,
    coachTrainingType: '',
    requireTargetSelect: false
  });
  askCoachTrainingType_(chatId);
}

function askCoachTrainingType_(chatId) {
  var keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_TRIO }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  Helpers.sendKeyboard(chatId, '💪 Обери тип тренування:', keyboard);
}

function handleCoachTrainingType_(chatId, action) {
  var required = 1;
  var type = CONSTANTS.TRAINING_TYPES.PERSONAL;
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_SPLIT) {
    required = 2;
    type = CONSTANTS.TRAINING_TYPES.SPLIT;
  } else if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_TYPE_TRIO) {
    required = 3;
    type = CONSTANTS.TRAINING_TYPES.TRIO;
  }
  State.update(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS,
    coachTrainingType: type,
    requiredStudentCount: required
  });
  askCoachSelectStudents_(chatId, required);
}

function askCoachSelectStudents_(chatId, required) {
  var state = State.get(chatId) || {};
  var names = state.coachStudentNames || [];
  var message = '👥 Обери ' + required + ' учн' + (required === 1 ? 'я' : 'ів') + ':\n\n';
  for (var i = 0; i < names.length; i++) {
    message += (i + 1) + '. ' + names[i] + '\n';
  }
  message += '\nВведи номер' + (required > 1 ? 'и через кому' : '') + '.';
  Helpers.safeSend(chatId, message);
}

function handleCoachSelectStudentsInput_(chatId, text) {
  var state = State.get(chatId) || {};
  var ids = state.coachStudentIds || [];
  var names = state.coachStudentNames || [];
  var required = state.requiredStudentCount || 1;
  var numbers = parseStudentNumbers_(text, required, ids.length);
  if (!numbers) {
    Helpers.safeSend(chatId, '⚠️ Невірний вибір. Введи ' + required + ' номер' + (required > 1 ? 'и через кому' : '') + '.');
    return;
  }
  var selectedIds = [];
  var selectedNames = [];
  for (var i = 0; i < numbers.length; i++) {
    var idx = numbers[i] - 1;
    selectedIds.push(ids[idx]);
    selectedNames.push(names[idx]);
  }
  State.update(chatId, {
    coachSelectedIds: selectedIds,
    coachSelectedNames: selectedNames,
    targetUserId: selectedIds[0],
    requireTargetSelect: selectedIds.length > 1,
    step: 'training_mode',
    trainingStartedAt: new Date(),
    scheduleSlotIds: {}
  });
  Helpers.safeSend(chatId, '✅ Обрано: ' + selectedNames.join(', ') + '.');
  askTrainingMode_(chatId, selectedIds[0]);
}

function askTargetStudentSelection_(chatId, pendingAction) {
  var state = State.get(chatId) || {};
  var names = state.coachSelectedNames || state.coachStudentNames || [];
  if (!names.length) {
    Helpers.safeSend(chatId, '⚠️ Список учнів порожній.');
    return;
  }
  State.update(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_TARGET,
    pendingAction: pendingAction || 'ASK_TRAINING_INPUT'
  });
  var message = '👤 Обери учня для запису:\n\n';
  for (var i = 0; i < names.length; i++) {
    message += (i + 1) + '. ' + names[i] + '\n';
  }
  message += '\nВведи номер:';
  Helpers.safeSend(chatId, message);
}

function handleCoachSelectTargetInput_(chatId, text) {
  var state = State.get(chatId) || {};
  var ids = state.coachSelectedIds || [];
  var names = state.coachSelectedNames || [];
  if (!ids.length) {
    Helpers.safeSend(chatId, '⚠️ Список учнів порожній.');
    return;
  }
  var numbers = parseStudentNumbers_(text, 1, ids.length);
  if (!numbers) {
    Helpers.safeSend(chatId, '⚠️ Введи номер учня зі списку.');
    return;
  }
  var idx = numbers[0] - 1;
  State.update(chatId, {
    targetUserId: ids[idx],
    requireTargetSelect: false
  });
  resumePendingTargetAction_(chatId);
}

function resumePendingTargetAction_(chatId) {
  var state = State.get(chatId) || {};
  var action = state.pendingAction || 'ASK_TRAINING_INPUT';
  State.update(chatId, { pendingAction: '' });
  if (action === 'ASK_CIRCUIT_INPUT') {
    askCircuitInputData_(chatId, true);
    return;
  }
  if (action === 'ASK_TRAINING_MODE') {
    askTrainingMode_(chatId, state.targetUserId || chatId);
    return;
  }
  askTrainingInputData_(chatId, true);
}

function parseStudentNumbers_(text, required, max) {
  var nums = String(text || '').match(/\d+/g);
  if (!nums) return null;
  var result = [];
  var seen = {};
  for (var i = 0; i < nums.length; i++) {
    var n = parseInt(nums[i], 10);
    if (isNaN(n) || n < 1 || n > max) {
      return null;
    }
    if (!seen[n]) {
      result.push(n);
      seen[n] = true;
    }
  }
  if (result.length !== required) return null;
  return result;
}

/**
 * Для Coach Mode: переконатися, що в WorkoutSchedule є слот на час старту тренування для учня.
 * Якщо слот вже є — зберігаємо його id в State. Якщо немає — створюємо новий (BOOKED).
 * Один слот на одного учня, одна дата/час для спліт/тріо.
 */
function ensureScheduleSlotForCoachSession_(chatId, targetUserId) {
  var stateData = State.get(chatId) || {};
  if (stateData.mode !== CONSTANTS.TRAINING_MODES.COACH) {
    return;
  }
  var slotIds = stateData.scheduleSlotIds || {};
  if (slotIds[targetUserId]) {
    return;
  }
  var startedAt = stateData.trainingStartedAt;
  if (!startedAt || !(startedAt instanceof Date)) {
    startedAt = new Date();
  }
  var existing = typeof Sheets.findSlotByCoachStudentAndDateTime === 'function'
    ? Sheets.findSlotByCoachStudentAndDateTime(chatId, targetUserId, startedAt)
    : null;
  if (existing && existing.id) {
    slotIds[targetUserId] = existing.id;
    State.update(chatId, { scheduleSlotIds: slotIds });
    return;
  }
  var timeStr = (startedAt.getHours() < 10 ? '0' : '') + startedAt.getHours() + ':' +
    (startedAt.getMinutes() < 10 ? '0' : '') + startedAt.getMinutes();
  var newId = typeof Sheets.insertScheduleSlot === 'function'
    ? Sheets.insertScheduleSlot({
        coachId: String(chatId),
        studentId: String(targetUserId),
        date: startedAt,
        time: timeStr,
        status: CONSTANTS.SCHEDULE_STATUS.BOOKED,
        updatedAt: new Date(),
        calEventId: ''
      })
    : null;
  if (newId) {
    slotIds[targetUserId] = newId;
    State.update(chatId, { scheduleSlotIds: slotIds });
  }
}

function askTrainingMode_(chatId, targetUserId) {
  var keyboard = buildTrainingModeKeyboard();
  var message = '💪 **Тренування**\n\n';
  if (String(chatId) !== String(targetUserId)) {
    var targetUser = User.getByChatId(targetUserId);
    if (targetUser) {
      message += 'Тренування для: ' + (targetUser.firstName || '') + '\n\n';
    }
  }
  message += 'Обери режим тренування:';
  Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
}

function askMuscleGroup_(chatId) {
  State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_GROUP });
  var groups = CONSTANTS.MUSCLE_GROUPS;
  var keyboard = buildMuscleGroupKeyboard(groups);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  Helpers.sendKeyboard(chatId, '💪 Обери групу м\'язів:', keyboard);
}

function showExercises_(chatId, groupName) {
  State.update(chatId, { step: 'training_exercise' });
  var exercises = Sheets.getExercisesByGroup(groupName);
  if (exercises.length === 0) {
    Helpers.safeSend(chatId, '❌ У групі "' + groupName + '" немає вправ.');
    askMuscleGroup_(chatId);
    return;
  }
  var keyboard = buildExerciseKeyboard(exercises, groupName);
  keyboard.push([{ text: '🔎 Ввести назву', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  Helpers.sendKeyboard(chatId, '📋 **' + groupName + '**\n\nОбери вправу:', keyboard, { parse_mode: 'Markdown' });
}

function askWeight_(chatId) {
  State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_WEIGHT });
  var stateData = State.get(chatId);
  Helpers.safeSend(chatId,
    '💪 **' + (stateData.exerciseName || '') + '**\n\n' +
    'Введи вагу (в кг):\n\nПриклад: 20\nДля вправ з власною вагою введи: 0',
    { parse_mode: 'Markdown' }
  );
}

function askReps_(chatId) {
  State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_REPS });
  Helpers.safeSend(chatId, '🔢 Введи кількість повторів:\n\nПриклад: 12');
}

function askSets_(chatId) {
  State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_SET });
  Helpers.safeSend(chatId, '📊 Скільки сетів?\n\nПриклад: 3');
}

function askTrainingInputData_(chatId, skipTargetCheck) {
  var stateData = State.get(chatId);
  if (!skipTargetCheck && stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1 && stateData.requireTargetSelect) {
    askTargetStudentSelection_(chatId, 'ASK_TRAINING_INPUT');
    return;
  }
  var setNumber = (stateData && stateData.currentSet) ? stateData.currentSet : 1;
  State.update(chatId, { step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA });
  var message = '✍️ Введи вагу та повтори для підходу №' + setNumber + '\n\nФормат: вага пробіл повтори\nПриклад: 20 12';
  if (stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1) {
    var kb = [[{ text: '👤 Обрати учня', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT }]];
    Helpers.sendKeyboard(chatId, message, kb);
  } else {
    Helpers.safeSend(chatId, message);
  }
}

function askExerciseSearch_(chatId) {
  Helpers.safeSend(chatId, '🔎 Введи назву вправи (мінімум 3 літери).\n\nПошук працює за першими 3 літерами та входженням у назву.\nПриклад: жим');
}

function showExerciseSearchResults_(chatId, query) {
  var q = String(query || '').toLowerCase();
  var prefix = q.substring(0, 3);
  var exercises = Sheets.getAllExercises();
  var starts = [];
  var contains = [];
  var i;
  for (i = 0; i < exercises.length; i++) {
    var ex = exercises[i];
    var name = String(ex.exerciseName || '').toLowerCase();
    if (!name) continue;
    if (prefix && name.indexOf(prefix) === 0) {
      starts.push(ex);
    } else if (name.indexOf(q) !== -1) {
      contains.push(ex);
    }
  }
  var merged = [];
  var seen = {};
  for (i = 0; i < starts.length; i++) {
    var id1 = String(starts[i].id);
    if (!seen[id1]) {
      merged.push(starts[i]);
      seen[id1] = true;
    }
  }
  for (i = 0; i < contains.length; i++) {
    var id2 = String(contains[i].id);
    if (!seen[id2]) {
      merged.push(contains[i]);
      seen[id2] = true;
    }
  }

  if (merged.length === 0) {
    Helpers.safeSend(chatId, '❌ Нічого не знайдено. Спробуй інше слово або уточни назву.');
    return;
  }

  var limit = 20;
  var keyboard = [];
  for (i = 0; i < merged.length && i < limit; i++) {
    keyboard.push([{ text: merged[i].exerciseName, callback_data: CONSTANTS.CALLBACK_PREFIXES.EXERCISE + ':' + merged[i].id }]);
  }
  keyboard.push([{ text: '🔎 Новий пошук', callback_data: CONSTANTS.CALLBACKS.TRAINING_SEARCH_NAME }]);
  keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACKS.TRAINING_BACK_TO_GROUP }]);
  Helpers.sendKeyboard(chatId, 'Знайдено: ' + merged.length + '\nОбери вправу:', keyboard);
}

function saveSingleExercise_(chatId) {
  try {
    var stateData = State.get(chatId);
    var targetUserId = stateData.targetUserId || chatId;
    if (stateData.mode === CONSTANTS.TRAINING_MODES.COACH && (!stateData.targetUserId || String(stateData.targetUserId) === String(chatId))) {
      if (stateData.coachSelectedIds && stateData.coachSelectedIds.length === 1) {
        targetUserId = stateData.coachSelectedIds[0];
        State.update(chatId, { targetUserId: targetUserId });
      } else {
        Helpers.safeSend(chatId, '⚠️ Не обрано учня. Повернись до вибору учня та спробуй ще раз.');
        Menu.show(chatId);
        return;
      }
    }
    var exerciseId = stateData.exerciseId;
    var exerciseName = stateData.exerciseName || '';
    var weight = stateData.weight;
    var reps = stateData.reps;
    var sets = stateData.sets;
    var now = new Date();

    if (stateData.mode === CONSTANTS.TRAINING_MODES.COACH) {
      ensureScheduleSlotForCoachSession_(chatId, targetUserId);
    }

    for (var setNum = 1; setNum <= sets; setNum++) {
      Sheets.insertTraining({
        idRecords: Utilities.getUuid(),
        date: now,
        exerciseId: exerciseId,
        exercise: exerciseName,
        weight: weight,
        reps: reps,
        set: setNum,
        chatId: String(targetUserId)
      });
    }

    State.clear(chatId);
    Helpers.safeSend(chatId,
      '✅ **Вправу збережено!**\n\n' +
      '💪 ' + exerciseName + '\n' +
      '⚖️ Вага: ' + weight + ' кг\n' +
      '🔢 Повторів: ' + reps + '\n' +
      '📊 Сетів: ' + sets,
      { parse_mode: 'Markdown' }
    );
    var keyboard = buildFinishTrainingKeyboard();
    Helpers.sendKeyboard(chatId, 'Що далі?', keyboard);
  } catch (error) {
    Logger.log('saveSingleExercise error: ' + error.message);
    State.clear(chatId);
    Helpers.safeSend(chatId, '❌ Помилка збереження тренування.\nСпробуй ще раз.');
  }
}

function finishExercise_(chatId) {
  State.clear(chatId);
  if (resumeRegistrationIfPending_(chatId)) {
    return;
  }
  var keyboard = buildFinishTrainingKeyboard();
  Helpers.sendKeyboard(chatId, 'Що далі?', keyboard);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - КРУГОВИЙ СЕТ
// ═══════════════════════════════════════════════════════════

function addExerciseToCircuit_(chatId, exerciseId, exerciseName) {
  var stateData = State.get(chatId);
  var circuitExercises = stateData.circuitExercises || [];
  circuitExercises.push({ exerciseId: exerciseId, exerciseName: exerciseName });
  State.update(chatId, { circuitExercises: circuitExercises });

  var message = '🔄 **Круговий сет**\n\nВправи:\n';
  for (var i = 0; i < circuitExercises.length; i++) {
    message += (i + 1) + '. ' + circuitExercises[i].exerciseName + '\n';
  }
  message += '\nДодай ще вправи або почни тренування.';
  var keyboard = [
    [{ text: '➕ Додати вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_MODE_CIRCUIT }],
    [{ text: '▶️ Почати тренування', callback_data: CONSTANTS.CALLBACKS.CIRCUIT_START }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
}

function startCircuitWorkout_(chatId) {
  var stateData = State.get(chatId);
  var circuitExercises = stateData.circuitExercises || [];
  if (circuitExercises.length === 0) {
    Helpers.safeSend(chatId, '⚠️ Додай хоча б одну вправу.');
    return;
  }
  State.update(chatId, { circuitCurrentIndex: 0, circuitRound: 1 });
  askCircuitInputData_(chatId);
}

function collectCircuitExerciseData_(chatId, exerciseIndex) {
  var stateData = State.get(chatId);
  if (stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1 && stateData.requireTargetSelect) {
    askTargetStudentSelection_(chatId, 'ASK_CIRCUIT_INPUT');
    return;
  }
  var exercise = stateData.circuitExercises[exerciseIndex];
  State.update(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA,
    circuitCurrentIndex: exerciseIndex,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName
  });
  var roundNumber = stateData.circuitRound || 1;
  var kbd = [
    [{ text: '🔁 Змінити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_CIRCUIT_CHANGE_EXERCISE }]
  ];
  if (stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1) {
    kbd.push([{ text: '👤 Обрати учня', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT }]);
  }
  Helpers.sendKeyboard(chatId,
    '💪 **' + exercise.exerciseName + '**\n\n' +
    'Коло ' + roundNumber + ', вправа ' + (exerciseIndex + 1) + ' з ' + stateData.circuitExercises.length + '\n\n' +
    'Введи вагу та повтори (формат: 20 12):',
    kbd,
    { parse_mode: 'Markdown' }
  );
}

function askCircuitInputData_(chatId, skipTargetCheck) {
  var stateData = State.get(chatId);
  if (!skipTargetCheck && stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1 && stateData.requireTargetSelect) {
    askTargetStudentSelection_(chatId, 'ASK_CIRCUIT_INPUT');
    return;
  }
  var idx = stateData.circuitCurrentIndex || 0;
  var exercise = (stateData.circuitExercises || [])[idx];
  if (!exercise) {
    Helpers.safeSend(chatId, '⚠️ Не знайдено вправу для кола. Спробуй ще раз.');
    return;
  }
  State.update(chatId, {
    step: CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName
  });
  var roundNumber = stateData.circuitRound || 1;
  var kbd = [
    [{ text: '🔁 Змінити вправу', callback_data: CONSTANTS.CALLBACKS.TRAINING_CIRCUIT_CHANGE_EXERCISE }]
  ];
  if (stateData && stateData.coachSelectedIds && stateData.coachSelectedIds.length > 1) {
    kbd.push([{ text: '👤 Обрати учня', callback_data: CONSTANTS.CALLBACKS.TRAINING_COACH_CHOOSE_STUDENT }]);
  }
  Helpers.sendKeyboard(chatId,
    '💪 **' + exercise.exerciseName + '**\n\n' +
    'Коло ' + roundNumber + ', вправа ' + (idx + 1) + ' з ' + stateData.circuitExercises.length + '\n\n' +
    'Введи вагу та повтори (формат: 20 12):',
    kbd,
    { parse_mode: 'Markdown' }
  );
}

function saveCircuitWorkout_(chatId) {
  try {
    var stateData = State.get(chatId);
    var circuitExercises = stateData.circuitExercises || [];
    var circuitCount = stateData.circuitCount;
    var targetUserId = stateData.targetUserId || chatId;

    if (circuitExercises.length === 0 || !circuitCount) {
      throw new Error('Invalid circuit data');
    }

    var now = new Date();
    for (var circle = 1; circle <= circuitCount; circle++) {
      for (var e = 0; e < circuitExercises.length; e++) {
        var ex = circuitExercises[e];
        Sheets.insertTraining({
          idRecords: Utilities.getUuid(),
          date: now,
          exerciseId: ex.exerciseId,
          exercise: ex.exerciseName || '',
          weight: ex.weight,
          reps: ex.reps,
          set: circle,
          chatId: String(targetUserId)
        });
      }
    }

    State.clear(chatId);
    var totalSets = circuitExercises.length * circuitCount;
    Helpers.safeSend(chatId,
      '✅ **Круговий сет завершено!**\n\n' +
      '📋 Вправ: ' + circuitExercises.length + '\n' +
      '🔄 Кіл: ' + circuitCount + '\n' +
      '📊 Всього підходів: ' + totalSets,
      { parse_mode: 'Markdown' }
    );
    var keyboard = buildFinishTrainingKeyboard();
    Helpers.sendKeyboard(chatId, 'Що далі?', keyboard);
  } catch (error) {
    Logger.log('saveCircuitWorkout error: ' + error.message);
    State.clear(chatId);
    Helpers.safeSend(chatId, '❌ Помилка збереження кругового сету.\nСпробуй ще раз.');
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ІСТОРІЯ ТРЕНУВАНЬ
// ═══════════════════════════════════════════════════════════

function getHistoryTargetUserId_(chatId) {
  var state = State.get(chatId) || {};
  return state.targetUserId || chatId;
}

function showHistoryMenu_(chatId) {
  State.update(chatId, { historyMode: '' });
  var keyboard = buildHistoryFiltersKeyboard();
  Helpers.sendKeyboard(chatId, '📊 **Історія тренувань**\n\nОбери фільтр:', keyboard, { parse_mode: 'Markdown' });
}

function showCurrentTraining_(chatId) {
  var targetUserId = getHistoryTargetUserId_(chatId);
  if (String(targetUserId) !== String(chatId)) {
    Helpers.safeSend(chatId, 'ℹ️ Поточне тренування доступне лише для власного профілю.');
    return;
  }
  var st = State.get(chatId) || {};
  if (!st || !st.step || String(st.step).indexOf('training_') !== 0) {
    Helpers.safeSend(chatId, 'ℹ️ Активного тренування немає.');
    return;
  }
  var msg = '📝 **Поточне тренування**\n\n';
  if (st.exerciseName) {
    msg += 'Вправа: ' + st.exerciseName + '\n';
  }
  if (st.trainingMode) {
    msg += 'Режим: ' + st.trainingMode + '\n';
  }
  if (st.circuitRound) {
    msg += 'Коло: ' + st.circuitRound + '\n';
  }
  Helpers.safeSend(chatId, msg, { parse_mode: 'Markdown' });
}

function showPreviousTraining_(chatId) {
  var targetUserId = getHistoryTargetUserId_(chatId);
  var last = Sheets.getLastTraining(targetUserId);
  if (!last) {
    Helpers.safeSend(chatId, 'ℹ️ Історія порожня.');
    return;
  }
  var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
  var msg = '⏮️ **Попереднє тренування**\n\n';
  msg += 'Дата: ' + formatDateFn(last.date) + '\n';
  msg += 'Вправа: ' + (last.exercise || '-') + '\n';
  msg += 'Вага: ' + (last.weight != null ? last.weight : '-') + ' кг\n';
  msg += 'Повтори: ' + (last.reps != null ? last.reps : '-') + '\n';
  Helpers.safeSend(chatId, msg, { parse_mode: 'Markdown' });
}

function showHistoryItem_(chatId, idRecords) {
  var targetUserId = getHistoryTargetUserId_(chatId);
  var history = Sheets.getTrainingHistory(targetUserId, {});
  var item = null;
  for (var i = 0; i < history.length; i++) {
    if (String(history[i].idRecords) === String(idRecords)) {
      item = history[i];
      break;
    }
  }
  if (!item) {
    Helpers.safeSend(chatId, '❌ Запис не знайдено.');
    return;
  }
  var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
  var msg = '📌 **Деталі тренування**\n\n';
  msg += 'Дата: ' + formatDateFn(item.date) + '\n';
  msg += 'Вправа: ' + (item.exercise || '-') + '\n';
  msg += 'Вага: ' + (item.weight != null ? item.weight : '-') + ' кг\n';
  msg += 'Повтори: ' + (item.reps != null ? item.reps : '-') + '\n';
  msg += 'Сет: ' + (item.set != null ? item.set : '-') + '\n';
  var kbd = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]];
  Helpers.sendKeyboard(chatId, msg, kbd, { parse_mode: 'Markdown' });
}

function showHistoryProgressByExercise_(chatId, exerciseId) {
  try {
    var targetUserId = getHistoryTargetUserId_(chatId);
    var history = Sheets.getTrainingHistory(targetUserId, {});
    history = history.filter(function (entry) {
      return String(entry.exerciseId) === String(exerciseId);
    });
    if (history.length === 0) {
      Helpers.safeSend(chatId, 'ℹ️ Для цієї вправи немає записів.');
      return;
    }
    history.sort(function (a, b) {
      var da = a.date instanceof Date ? a.date : new Date(a.date);
      var db = b.date instanceof Date ? b.date : new Date(b.date);
      return da - db;
    });
    var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
    var ex = Sheets.getExerciseById(exerciseId);
    var msg = '📈 **Прогрес: ' + (ex ? ex.exerciseName : 'Вправа') + '**\n\n';
    var maxWeight = 0;
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var w = h.weight != null ? h.weight : 0;
      if (w > maxWeight) maxWeight = w;
      msg += formatDateFn(h.date) + ' — ' + (h.weight != null ? h.weight : '-') + ' кг × ' + (h.reps != null ? h.reps : '-') + '\n';
    }
    msg += '\n🏆 Макс. вага: ' + maxWeight + ' кг';
    var kbd = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]];
    Helpers.sendKeyboard(chatId, msg, kbd, { parse_mode: 'Markdown' });
    State.update(chatId, { historyMode: '' });
  } catch (error) {
    Logger.log('showHistoryProgress error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження прогресу.');
  }
}

function showAllHistory_(chatId, limit) {
  limit = limit || 20;
  try {
    var targetUserId = getHistoryTargetUserId_(chatId);
    var history = Sheets.getTrainingHistory(targetUserId, {});
    if (history.length === 0) {
      Helpers.safeSend(chatId, '📊 Історія тренувань порожня.');
      return;
    }
    history.sort(function (a, b) {
      var da = a.date instanceof Date ? a.date : new Date(a.date);
      var db = b.date instanceof Date ? b.date : new Date(b.date);
      return db - da;
    });
    history = history.slice(0, limit);

    var message = '📊 **Останні ' + history.length + ' тренувань:**\n\n';
    var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
    for (var i = 0; i < history.length; i++) {
      var entry = history[i];
      var dateStr = formatDateFn(entry.date);
      message += '**' + (i + 1) + '. ' + dateStr + '**\n';
      message += '   ' + (entry.exercise || '') + '\n';
      message += '   ' + (entry.weight != null ? entry.weight : '-') + ' кг × ' + (entry.reps != null ? entry.reps : '-') + ' повт. (сет ' + (entry.set != null ? entry.set : '-') + ')\n\n';
    }
    var keyboard = [];
    for (var b = 0; b < history.length; b++) {
      var entryBtn = history[b];
      keyboard.push([{ text: 'Деталі #' + (b + 1), callback_data: CONSTANTS.CALLBACK_PREFIXES.HISTORY_ITEM + ':' + entryBtn.idRecords }]);
    }
    keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]);
    Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showAllHistory error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження історії.');
  }
}

function askHistoryGroup_(chatId) {
  var groups = CONSTANTS.MUSCLE_GROUPS;
  var keyboard = [];
  for (var g = 0; g < groups.length; g++) {
    keyboard.push([{ text: groups[g], callback_data: CONSTANTS.CALLBACK_PREFIXES.HISTORY_GROUP + ':' + groups[g] }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]);
  Helpers.sendKeyboard(chatId, '📊 Обери групу м\'язів:', keyboard);
}

function showHistoryByGroup_(chatId, groupName) {
  try {
    var targetUserId = getHistoryTargetUserId_(chatId);
    var history = Sheets.getTrainingHistory(targetUserId, {});
    var exercisesInGroup = Sheets.getExercisesByGroup(groupName);
    var idsInGroup = {};
    for (var i = 0; i < exercisesInGroup.length; i++) {
      idsInGroup[String(exercisesInGroup[i].id)] = true;
    }
    history = history.filter(function (entry) {
      return idsInGroup[String(entry.exerciseId)];
    });
    history.sort(function (a, b) {
      var da = a.date instanceof Date ? a.date : new Date(a.date);
      var db = b.date instanceof Date ? b.date : new Date(b.date);
      return db - da;
    });
    history = history.slice(0, 30);
    var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
    var message = '📊 **Історія: ' + groupName + '**\n\n';
    if (history.length === 0) {
      message += 'Немає записів.';
    } else {
      for (var j = 0; j < history.length; j++) {
        var ent = history[j];
        message += '**' + formatDateFn(ent.date) + '** — ' + (ent.exercise || '') + '\n';
        message += '   ' + (ent.weight != null ? ent.weight : '-') + ' кг × ' + (ent.reps != null ? ent.reps : '-') + ' повт.\n\n';
      }
    }
    var kbd = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]];
    Helpers.sendKeyboard(chatId, message, kbd, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showHistoryByGroup error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження історії.');
  }
}

function askHistoryExercise_(chatId) {
  var exercises = Sheets.getAllExercises();
  var keyboard = [];
  for (var i = 0; i < exercises.length; i++) {
    var ex = exercises[i];
    keyboard.push([{ text: ex.exerciseName, callback_data: CONSTANTS.CALLBACK_PREFIXES.HISTORY_EXERCISE + ':' + ex.id }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]);
  Helpers.sendKeyboard(chatId, '📊 Обери вправу:', keyboard);
}

function showHistoryByExercise_(chatId, exerciseId) {
  try {
    var targetUserId = getHistoryTargetUserId_(chatId);
    var history = Sheets.getTrainingHistory(targetUserId, {});
    history = history.filter(function (entry) {
      return String(entry.exerciseId) === String(exerciseId);
    });
    history.sort(function (a, b) {
      var da = a.date instanceof Date ? a.date : new Date(a.date);
      var db = b.date instanceof Date ? b.date : new Date(b.date);
      return db - da;
    });
    history = history.slice(0, 30);
    var ex = Sheets.getExerciseById(exerciseId);
    var exName = ex ? ex.exerciseName : exerciseId;
    var formatDateFn = (typeof Helpers.formatDate === 'function') ? Helpers.formatDate : (typeof Menu.formatDate === 'function' ? Menu.formatDate : function (d) { return d ? (d instanceof Date ? d.toLocaleDateString('uk-UA') : String(d)) : ''; });
    var message = '📊 **Історія: ' + exName + '**\n\n';
    if (history.length === 0) {
      message += 'Немає записів.';
    } else {
      for (var k = 0; k < history.length; k++) {
        var e = history[k];
        message += formatDateFn(e.date) + ' — ' + (e.weight != null ? e.weight : '-') + ' кг × ' + (e.reps != null ? e.reps : '-') + ' повт. (сет ' + (e.set != null ? e.set : '-') + ')\n';
      }
    }
    var kbd = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }]];
    Helpers.sendKeyboard(chatId, message, kbd, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showHistoryByExercise error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка завантаження історії.');
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - ЗВІТИ ТРЕНЕРА
// ═══════════════════════════════════════════════════════════

function showReportsMenu_(chatId) {
  var keyboard = [
    [{ text: '📊 Тренування за період', callback_data: CONSTANTS.CALLBACKS.REPORTS_TRAININGS }],
    [{ text: '💰 Доходи', callback_data: CONSTANTS.CALLBACKS.REPORTS_INCOME }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  Helpers.sendKeyboard(chatId, '📈 **Звіти тренера**\n\nОбери тип звіту:', keyboard, { parse_mode: 'Markdown' });
}

function askReportsDays_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.REPORTS_TRAININGS_INPUT_DAYS });
  Helpers.safeSend(chatId, '🔢 За скільки днів показати звіт?\n\nВведи число від 1 до 365:');
}

function showReportsTrainings_(chatId, days) {
  try {
    State.clear(chatId);
    var user = User.getByChatId(chatId);
    if (!user) {
      Helpers.safeSend(chatId, '❌ Користувача не знайдено.');
      return;
    }
    if (user.role !== CONSTANTS.ROLES.COACH) {
      Helpers.safeSend(chatId, 'ℹ️ Звіти доступні лише тренеру.');
      return;
    }

    var from = new Date();
    from.setDate(from.getDate() - days);

    var slots = Sheets.getSlotsByCoachAndStatus(chatId, CONSTANTS.SCHEDULE_STATUS.COMPLETED) || [];
    var filtered = [];
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (!slot.studentId) continue;
      var slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
      if (slotDate >= from) {
        filtered.push(slot);
      }
    }

    if (filtered.length === 0) {
      Helpers.safeSend(chatId, 'ℹ️ У вас ще немає проведених тренувань.');
      return;
    }

    var byStudent = {};
    var totalRevenue = 0;
    var firstCurrency = '';
    for (var j = 0; j < filtered.length; j++) {
      var slot = filtered[j];
      var stId = String(slot.studentId);
      byStudent[stId] = byStudent[stId] || { count: 0, revenue: 0 };
      byStudent[stId].count = (byStudent[stId].count || 0) + 1;
      var p = slot.priceCharged;
      if (p != null && !isNaN(p)) {
        byStudent[stId].revenue = (byStudent[stId].revenue || 0) + p;
        totalRevenue += p;
        if (!firstCurrency && slot.currency) firstCurrency = slot.currency;
      }
    }
    var currency = (firstCurrency || 'UAH').toString().trim();

    var msg = '📊 **Звіт за ' + days + ' днів**\n\n';
    var total = 0;
    for (var stKey in byStudent) {
      if (!byStudent.hasOwnProperty(stKey)) continue;
      var stUser = User.getByChatId(stKey);
      var stName = stUser ? (stUser.firstName || stKey) : stKey;
      var rec = byStudent[stKey];
      var cnt = rec.count || rec;
      if (typeof cnt !== 'number') cnt = rec.count;
      total += cnt;
      msg += '• ' + stName + ': ' + cnt + ' тренувань';
      if (rec.revenue != null && rec.revenue > 0) msg += ', ' + rec.revenue + ' ' + currency;
      msg += '\n';
    }
    msg += '\nВсього: ' + total + ' тренувань';
    if (totalRevenue > 0) msg += '\n💰 Сума: ' + totalRevenue + ' ' + currency;

    var kb = [[{ text: '🔙 До меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
    Helpers.sendKeyboard(chatId, msg, kb, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.log('showReportsTrainings error: ' + error.message);
    Helpers.safeSend(chatId, '❌ Помилка формування звіту.');
  }
}

function showReportsIncomeStub_(chatId) {
  State.clear(chatId);
  Helpers.safeSend(chatId, '💰 Розділ "Доходи" буде доступний в наступному оновленні.');
  Menu.show(chatId);
}

function showHistoryForStudent_(chatId, studentChatId) {
  State.update(chatId, { targetUserId: studentChatId });
  showHistoryMenu_(chatId);
}

function askHistoryN_(chatId) {
  State.set(chatId, { step: CONSTANTS.FSM_STATES.HISTORY_INPUT_N });
  Helpers.safeSend(chatId, '🔢 Скільки останніх тренувань показати?\n\nВведи число від 1 до 50:');
}

function showLastNWorkouts_(chatId, n) {
  State.clear(chatId);
  showAllHistory_(chatId, n);
}

function resumeRegistrationIfPending_(chatId) {
  try {
    if (typeof regResumePending_ === 'function') {
      return regResumePending_(chatId) === true;
    }
  } catch (e) {}
  return false;
}

function finishWorkout_(chatId) {
  var stateBeforeClear = State.get(chatId) || {};
  var scheduleSlotIds = stateBeforeClear.scheduleSlotIds || {};
  var wasCoachMode = stateBeforeClear.mode === CONSTANTS.TRAINING_MODES.COACH;

  State.clear(chatId);

  // Coach mode: кожен слот → COMPLETED, запис PriceCharged (з одного учня) у WorkoutSchedule I, J
  if (wasCoachMode && typeof Sheets.updateScheduleSlotStatus === 'function') {
    var trainingType = stateBeforeClear.coachTrainingType || CONSTANTS.TRAINING_TYPES.PERSONAL;
    var divisor = 1;
    if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) divisor = 2;
    else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) divisor = 3;
    var defaultCurrency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) ? CONSTANTS.PRICING.DEFAULT_CURRENCY : 'UAH';
    for (var studentId in scheduleSlotIds) {
      if (!scheduleSlotIds.hasOwnProperty(studentId) || !scheduleSlotIds[studentId]) continue;
      try {
        Sheets.updateScheduleSlotStatus(scheduleSlotIds[studentId], CONSTANTS.SCHEDULE_STATUS.COMPLETED);
        if (typeof Sheets.getCurrentPrice === 'function' && typeof Sheets.updateScheduleSlotPrice === 'function') {
          var pc = Sheets.getCurrentPrice(chatId, studentId, trainingType);
          if (pc && pc.price != null) {
            var perStudent = divisor > 0 ? pc.price / divisor : pc.price;
            Sheets.updateScheduleSlotPrice(scheduleSlotIds[studentId], perStudent, (pc.currency || defaultCurrency).toString().trim());
          }
        }
        if (typeof Sheets.updateScheduleSlotTrainingType === 'function') {
          Sheets.updateScheduleSlotTrainingType(scheduleSlotIds[studentId], trainingType);
        }
      } catch (e) {
        Logger.log('finishWorkout slot: ' + (e && e.message));
      }
    }
  }

  if (resumeRegistrationIfPending_(chatId)) {
    return;
  }
  Helpers.safeSend(chatId, '✅ Тренування завершено!\n\nГарна робота! 💪');
  Menu.show(chatId);
}

// ═══════════════════════════════════════════════════════════
// PRIVATE - БІБЛІОТЕКА ВПРАВ
// ═══════════════════════════════════════════════════════════

function showLibrary_(chatId) {
  var groups = CONSTANTS.MUSCLE_GROUPS;
  var keyboard = [];
  for (var g = 0; g < groups.length; g++) {
    keyboard.push([{ text: groups[g], callback_data: CONSTANTS.CALLBACK_PREFIXES.LIBRARY_GROUP + ':' + groups[g] }]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  Helpers.sendKeyboard(chatId, '📖 **Бібліотека вправ**\n\nОбери групу:', keyboard, { parse_mode: 'Markdown' });
}

function showLibraryExercises_(chatId, groupName) {
  var exercises = Sheets.getExercisesByGroup(groupName);
  if (exercises.length === 0) {
    Helpers.safeSend(chatId, '❌ У групі "' + groupName + '" немає вправ.');
    return;
  }
  var message = '📖 **' + groupName + '**\n\n';
  for (var i = 0; i < exercises.length; i++) {
    var ex = exercises[i];
    message += (i + 1) + '. **' + ex.exerciseName + '**\n';
    if (ex.comment) {
      message += '   _' + ex.comment + '_\n';
    }
    message += '\n';
  }
  var keyboard = [[{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACKS.LIBRARY_VIEW }]];
  Helpers.sendKeyboard(chatId, message, keyboard, { parse_mode: 'Markdown' });
}

// Експорт для Router (GAS один глобальний namespace)
var Training = {
  startWorkout: trainingStartWorkout_,
  handleCallback: trainingHandleCallback_,
  handleTextMessage: trainingHandleTextMessage_,
  showHistoryForStudent: showHistoryForStudent_
};
