/**
 * Програма тренувань учня: список планів, авто-генерація, активація (Логіка складання плану тренувань.md, розд. 8).
 */
const { CONSTANTS, ACCENT_MAP, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER, SET_PRESETS } = require('./constants');
const { REVISION_WEEKS_BY_LEVEL } = require('./supabase');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const Alias = require('./alias');
const planGenerator = require('./planGenerator');
const progressivePlanAI = require('./ai/progressivePlanAI');

const MAX_BUTTONS_PER_PAGE = 20;
const MAX_EXERCISE_BUTTON_LENGTH = 50;

function planExercisePickKey(ex) {
  if (ex && ex.isCustom) return 'c_' + String(ex.id);
  return String(ex.id);
}

function parsePlanExercisePick(param) {
  const p = String(param || '').trim();
  if (p.startsWith('c_')) return { isCustom: true, id: p.slice(2), pickKey: p };
  return { isCustom: false, id: p, pickKey: p };
}

async function loadExercisesForPlanPicker(chatId, level1, level2, level3) {
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const level3Arg = level3 === '__all__' || !level3 ? null : level3;
  const catalog = await supabase.getExercisesByGroup(level1, level2Arg, level3Arg);
  const custom = await supabase.listUserCustomExercisesByGroup(chatId, level1, level2Arg, level3Arg);
  const merged = [
    ...custom.map((c) => ({ id: c.id, name: '⭐ ' + (c.name || 'Вправа'), isCustom: true })),
    ...(catalog || []).map((c) => ({ id: c.id, name: c.name || 'Вправа', isCustom: false }))
  ];
  return merged;
}

async function resolvePlanAccess(chatId, studentChatId) {
  const actor = await User.getByChatId(chatId);
  const student = await User.getByChatId(studentChatId);
  if (!actor || !student) return { ok: false, actor: null, student: null, mode: null };
  if (actor.role === CONSTANTS.ROLES.COACH) {
    return {
      ok: String(student.coachId || '') === String(chatId),
      actor,
      student,
      mode: 'coach'
    };
  }
  if (actor.role === CONSTANTS.ROLES.STUDENT) {
    const isSelf = String(chatId) === String(studentChatId);
    const hasCoach = String(student.coachId || '').trim() !== '';
    return { ok: isSelf && !hasCoach, actor, student, mode: 'self' };
  }
  return { ok: false, actor, student, mode: null };
}

/** Показати списки планів учня та кнопку «Новий план». */
async function showPlanList(chatId, studentChatId) {
  const access = await resolvePlanAccess(chatId, studentChatId);
  if (!access.ok) {
    await Helpers.safeSend(chatId, '⛔ Доступ до створення планів недоступний для цього акаунта.');
    return;
  }
  const student = access.student;
  const isSelfMode = access.mode === 'self';

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
  if (isSelfMode) keyboard.push([{ text: '🔙 До «План тренувань»', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING_PLANS }]);
  else keyboard.push([{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]);

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

/** Перевірка повноти профілю учня для авто-плану (мета, дата народження, зони акценту). */
function getProfileCompletenessMissing(user) {
  const missing = [];
  if (!user.goal || String(user.goal).trim() === '') missing.push('мета');
  if (!user.birthDate) missing.push('дата народження');
  const az = user.accentZones;
  if (!az || !Array.isArray(az) || az.length === 0) missing.push('зони акценту та уникнення');
  return missing;
}

/** Текст і клавіатура, коли профіль неповний для авто-плану (тренер vs solo-учень). */
function getAutoPlanIncompleteProfilePrompt(studentChatId, missing, isSelfMode) {
  const missingStr = missing.join(', ');
  let msg;
  let profileRow;
  if (isSelfMode) {
    msg =
      '⚠️ Для автоплану потрібно заповнити в профілі: ' +
      missingStr +
      '.\n\nВідкрий **Мій профіль** → **Редагувати дані**: там є **Мета тренувань**, дата народження та зони акценту. Або створи план вручну.';
    profileRow = [{ text: '👤 Мій профіль', callback_data: CONSTANTS.CALLBACKS.PROFILE_VIEW }];
  } else {
    msg =
      '⚠️ Для автоплану потрібно заповнити в профілі учня: ' +
      missingStr +
      '.\n\nЗаповніть у картці учня або створіть план вручну.';
    profileRow = [{ text: '👤 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }];
  }
  const keyboard = [
    profileRow,
    [{ text: '✏️ План вручну', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_MANUAL + ':' + studentChatId }],
    [{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ];
  return { msg, keyboard };
}

/** Підсумок профілю та кнопка «Генерувати». */
async function showAutoSummary(chatId, studentChatId) {
  if (!studentChatId) {
    await Helpers.safeSend(chatId, '❌ Не вибрано учня.');
    return;
  }
  const access = await resolvePlanAccess(chatId, studentChatId);
  if (!access.ok) {
    await Helpers.safeSend(chatId, '⛔ Доступ до авто-плану недоступний для цього акаунта.');
    return;
  }
  const isSelfMode = access.mode === 'self';
  const user = await supabase.getUserByChatId(studentChatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }
  const missing = getProfileCompletenessMissing(user);
  if (missing.length > 0) {
    const { msg, keyboard } = getAutoPlanIncompleteProfilePrompt(studentChatId, missing, isSelfMode);
    await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'Markdown' });
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
  const revisionWeeks = REVISION_WEEKS_BY_LEVEL[level] ?? 6;
  text += '\n• Тривалість плану: ' + revisionWeeks + ' тижнів';
  text += '\n\nНатисни «Далі», щоб обрати тривалість фази та зони акценту.';

  const keyboard = [
    [
      { text: '5 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':5:' + studentChatId },
      { text: '6 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':6:' + studentChatId },
      { text: '7 вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':7:' + studentChatId },
      { text: 'За рекомендацією', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT + ':0:' + studentChatId }
    ],
    [{ text: '→ Далі (тривалість фази та зони акценту)', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_PHASE_DUR }],
    [{ text: '⚙️ Генерувати за профілем учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE + ':' + studentChatId }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW + ':' + studentChatId }]
  ];
  await State.set(chatId, { planStudentChatId: studentChatId, planOrigin: 'auto', planRevisionWeeks: revisionWeeks, planLevel: level, planGoal: goal });
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Вибір тривалості однієї фази (прогресивний план). Якщо revision_weeks < 2 — не входимо в флоу. */
async function askPhaseDuration(chatId) {
  const state = await State.get(chatId);
  const studentChatId = state?.planStudentChatId;
  if (!studentChatId) {
    await Helpers.safeSend(chatId, '❌ Не вибрано учня.');
    return;
  }
  const revisionWeeks = state?.planRevisionWeeks != null ? state.planRevisionWeeks : 10;
  if (revisionWeeks < 2) {
    await Helpers.safeSend(chatId, 'Прогресивний план доступний від 2 тижнів. Обраний термін плану занадто короткий.');
    await showPlanTypeSelect(chatId, studentChatId);
    return;
  }
  const durationOptions = [2, 3, 4].filter((n) => n <= revisionWeeks);
  const keyboard = [
    durationOptions.map((n) => ({ text: n + ' тижні', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_PHASE_DUR + ':' + n })),
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO + ':' + studentChatId }]
  ];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_PHASE_DUR });
  await Helpers.sendKeyboard(
    chatId,
    'Прогресивний план для учня\n\nЦіль: ' + (state.planGoal && CONSTANTS.GOAL_LABELS && CONSTANTS.GOAL_LABELS[state.planGoal] ? CONSTANTS.GOAL_LABELS[state.planGoal] : (state.planGoal || '—')) + ' | Рівень: ' + (state.planLevel || '—') + ' | ' + revisionWeeks + ' тижнів\n\nСкільки тижнів триватиме одна фаза?\n(Після кожної фази частина вправ оновлюється для прогресії)',
    keyboard
  );
}

function buildFallbackPhaseResult(candidatesByDay) {
  const days = (candidatesByDay || []).map((day) => {
    const exercises = [];
    (day.slots || []).forEach((slot, slotIndex) => {
      const first = (slot.candidates || [])[0];
      if (first) {
        exercises.push({
          slot_index: slotIndex,
          chosen_exercise_id: first.id,
          order_in_day: slotIndex + 1,
          ai_reason: 'Обрано за профілем',
          exercise_name: first.name_ua
        });
      }
    });
    return { day_number: day.day_number, day_label: day.day_label || ('День ' + day.day_number), exercises };
  });
  return { days, phase_summary: 'Підбір без AI' };
}

/** Кандидати вправ для фази (прогресивний план). Назад: з A — до прев'ю спліту, з B/C — до кандидатів попередньої фази. */
async function showPhaseCandidates(chatId, phase) {
  const state = await State.get(chatId);
  const studentChatId = state?.planStudentChatId;
  const splitConfig = state?.planSplitConfig || [];
  const planPhaseDuration = state?.planPhaseDuration || 2;
  const planTotalWeeks = state?.planTotalWeeks || state?.planRevisionWeeks || 10;
  if (!studentChatId || !splitConfig.length) {
    await Helpers.safeSend(chatId, '❌ Немає даних для генерації. Поверніться до списку планів.');
    return;
  }
  const user = await supabase.getUserByChatId(studentChatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
    return;
  }
  const userMedConditions = await supabase.getActiveMedicalConditions(studentChatId);
  const dayConfigs = splitConfig.map((d) => ({
    day_number: d.day_number,
    day_label: d.day_label,
    muscle_groups: d.muscle_groups || [],
    exercise_count: d.exercise_count != null ? d.exercise_count : 5
  }));
  let usedByGroup = new Map();
  if (phase === 'B' && state.planPhaseResults?.A) {
    const candA = state.planCandidates?.A;
    if (Array.isArray(candA)) {
      for (const day of (state.planPhaseResults.A.days || [])) {
        for (const ex of (day.exercises || [])) {
          const dayCand = candA.find((c) => c.day_number === day.day_number);
          if (dayCand && dayCand.slots) {
            for (const slot of dayCand.slots) {
              const c = (slot.candidates || []).find((x) => x.id === ex.chosen_exercise_id);
              if (c && c.group_level2) {
                if (!usedByGroup.has(c.group_level2)) usedByGroup.set(c.group_level2, new Set());
                usedByGroup.get(c.group_level2).add(ex.chosen_exercise_id);
              }
            }
          }
        }
      }
    }
  } else if (phase === 'C' && state.planPhaseResults?.B) {
    const candB = state.planCandidates?.B;
    if (Array.isArray(candB)) {
      for (const day of (state.planPhaseResults.B.days || [])) {
        for (const ex of (day.exercises || [])) {
          const dayCand = candB.find((c) => c.day_number === day.day_number);
          if (dayCand && dayCand.slots) {
            for (const slot of dayCand.slots) {
              const c = (slot.candidates || []).find((x) => x.id === ex.chosen_exercise_id);
              if (c && c.group_level2) {
                if (!usedByGroup.has(c.group_level2)) usedByGroup.set(c.group_level2, new Set());
                usedByGroup.get(c.group_level2).add(ex.chosen_exercise_id);
              }
            }
          }
        }
      }
    }
  }
  const userProfile = {
    goal: state?.planGoal || user.goal || 'keep',
    level: state?.planLevel || planGenerator.getLevelFromExperienceDays(planGenerator.getExperienceDays(user)),
    gender: (user.gender || '').toLowerCase(),
    userMedConditions: userMedConditions || [],
    accentZones: state?.planAccentZones || [],
    avoidZones: state?.planAvoidZones || []
  };
  let candidatesByDay;
  try {
    candidatesByDay = await planGenerator.pickCandidatesForPhase(dayConfigs, phase, usedByGroup, userProfile);
  } catch (err) {
    console.error('TrainingPlan showPhaseCandidates pickCandidatesForPhase', err.message);
    await Helpers.safeSend(chatId, '❌ Не вдалося підібрати кандидатів. Спробуйте інші налаштування.');
    await showSplitPreview(chatId);
    return;
  }
  if (!candidatesByDay || !candidatesByDay.length) {
    await Helpers.safeSend(chatId, '❌ Немає підходящих вправ для цієї фази.');
    await showSplitPreview(chatId);
    return;
  }
  const planCandidates = { ...(state.planCandidates || {}), [phase]: candidatesByDay };
  await State.update(chatId, { planCandidates, planCurrentPhase: phase, step: CONSTANTS.FSM_STATES.PLAN_PHASE_CANDIDATES });

  let text = 'Фаза ' + phase + ' — кандидати вправ по днях\n\n';
  for (const day of candidatesByDay) {
    text += (day.day_label || 'День ' + day.day_number) + ':\n';
    for (let i = 0; i < (day.slots || []).length; i++) {
      const slot = day.slots[i];
      const first = (slot.candidates || [])[0];
      text += '  ' + (i + 1) + '. ' + (first ? first.name_ua : '—') + '\n';
    }
    text += '\n';
  }
  text += 'Натисни «Підтвердити», щоб запустити AI-підбір вправ для цієї фази.';

  const backData = phase === 'A'
    ? CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_BACK
    : CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_REPLACE + ':' + (phase === 'B' ? 'A' : 'B');
  const keyboard = [
    [{ text: '🔙 Назад', callback_data: backData }, { text: 'Підтвердити і запустити AI', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_CONFIRM + ':' + phase }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Вибір акцент-зон (1–2 зони або «Все рівномірно»). */
async function askAccentZones(chatId) {
  const state = await State.get(chatId);
  const accentZones = state?.planAccentZones || [];
  const studentChatId = state?.planStudentChatId || '';
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_ACCENT_SELECT });

  const keyboard = [];
  const row = [];
  for (const zone of ACCENT_ZONES_ORDER) {
    const label = (ACCENT_LABELS[zone] || zone) + (accentZones.includes(zone) ? ' ✓' : '');
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_TOGGLE + ':' + zone });
    if (row.length >= 3) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_BACK }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_NEXT }]);

  await Helpers.sendKeyboard(chatId, 'На що робимо акцент у плані?\nОбери 1–2 зони (або «Все рівномірно»).', keyboard);
}

/** Вибір зон уникнення. */
async function askAvoidZones(chatId) {
  const state = await State.get(chatId);
  const accentZones = state?.planAccentZones || [];
  const avoidZones = state?.planAvoidZones || [];

  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_AVOID_SELECT });

  const keyboard = [];
  for (const zone of AVOID_ZONES_ORDER) {
    if (accentZones.includes(zone)) continue;
    const label = (ACCENT_LABELS[zone] || zone) + (avoidZones.includes(zone) ? ' ✓' : '');
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_TOGGLE + ':' + zone }]);
  }
  keyboard.push([{ text: 'Пропустити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_SKIP }, { text: '→ Далі', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_NEXT }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_BACK }]);

  await Helpers.sendKeyboard(chatId, 'Є зони, які НЕ розвиваємо? (необов\'язково)\nНаприклад: плечі і так широкі — не навантажуємо.', keyboard);
}

/** Preview розподілу груп м\'язів по днях. */
async function showSplitPreview(chatId) {
  const state = await State.get(chatId);
  const studentChatId = state?.planStudentChatId || '';
  const accentZones = state?.planAccentZones || [];
  const avoidZones = state?.planAvoidZones || [];
  const planOrigin = state?.planOrigin || 'auto';

  const user = planOrigin === 'auto' ? await supabase.getUserByChatId(studentChatId) : null;
  const level = planOrigin === 'auto' && user
    ? planGenerator.getLevelFromExperienceDays(planGenerator.getExperienceDays(user))
    : (state?.planManualLevel || 'beginner');
  const daysPerWeek = planOrigin === 'auto' && user
    ? (user.trainingDaysPerWeek != null ? user.trainingDaysPerWeek : planGenerator.getDefaultDaysPerWeek(level))
    : (state?.planManualDays || 3);
  const gender = (user?.gender || '').toLowerCase();

  const splitConfig = planGenerator.generateSplitWithAccent(daysPerWeek, accentZones, avoidZones, gender, level);
  await State.update(chatId, { planSplitConfig: splitConfig, planManualDays: daysPerWeek, step: CONSTANTS.FSM_STATES.PLAN_SPLIT_PREVIEW });

  let text = 'Розподіл тренувань:\n\n';
  for (const day of splitConfig) {
    text += 'День ' + day.day_number + ' — ' + (day.muscle_groups || []).join(', ') + (day.is_accent_day ? ' ★' : '') + '\n';
  }
  text += '\n★ — акцентний день';
  if (accentZones.length && !accentZones.includes('full')) {
    text += '\nАкцент: ' + accentZones.map((z) => ACCENT_LABELS[z] || z).join(', ') + ' (' + splitConfig.filter((d) => d.is_accent_day).length + ' з ' + splitConfig.length + ' днів)';
  }
  if (avoidZones.length) {
    text += '\nУникаємо: ' + avoidZones.map((z) => ACCENT_LABELS[z] || z).join(', ');
  }

  const keyboard = [
    [{ text: '✓ Підтвердити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_CONFIRM }],
    [{ text: '← Змінити акцент', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_BACK }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Пресети сетів при додаванні вправи (goal/level з плану). */
async function showSetsPreset(chatId, exerciseId, exerciseName) {
  const state = await State.get(chatId);
  const pending = state?.planPendingExercise;
  const plan = pending ? await supabase.getPlanWithExercises(pending.planId) : null;
  const goal = (plan?.goal || 'keep').toLowerCase();
  const level = (plan?.level || 'beginner').toLowerCase();
  const presets = (SET_PRESETS[goal] && SET_PRESETS[goal][level]) ? SET_PRESETS[goal][level] : SET_PRESETS.keep.beginner;

  const goalLabel = goal === 'lose' ? 'Схуднення' : goal === 'gain' ? 'Набір маси' : 'Підтримка';
  const levelLabel = level === 'beginner' ? 'Початковий' : level === 'intermediate' ? 'Середній' : 'Просунутий';

  const keyboard = [];

  for (let i = 0; i < presets.length; i++) {
    keyboard.push([{ text: presets[i].label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_PRESET + ':' + i }]);
  }
  keyboard.push([{ text: 'Ввести вручну', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_CUSTOM }]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_BACK }]);

  await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_SETS_PRESET });
  await Helpers.sendKeyboard(chatId, 'Вправа: ' + (exerciseName || 'Вправа') + '\n\nОберіть схему підходів:\n(ціль: ' + goalLabel + ', рівень: ' + levelLabel + ')', keyboard);
}

/** Перегляд плану (дні та вправи). */
async function showPlanDetail(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan) {
    await Helpers.safeSend(chatId, '❌ План не знайдено.');
    await showPlanList(chatId, studentChatId);
    return;
  }

  let text = '📋 ' + (plan.planName || 'План') + '\n';
  text += 'Рівень: ' + (plan.level || '') + ' · ' + (plan.daysPerWeek || '') + ' дн./тиж\n\n';

  const byDay = {};
  for (const ex of plan.exercises || []) {
    const d = ex.dayNumber;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ex);
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  if (days.length === 0) {
    text += 'Поки що в плані немає вправ.\n\nНатисни «➕ Додати вправи», щоб заповнити дні.\n\n';
  } else {
    for (const d of days) {
      const first = byDay[d][0];
      text += 'День ' + d + ' — ' + (first.dayLabel || '') + '\n';
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
      ? [
          { text: '📖 Картки вправ', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE + ':list' },
          { text: '🗑 Видалити вправу', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE_EXERCISE + ':list' }
        ]
      : [],
    plan.isActive
      ? [{ text: '✅ Активний план', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
      : [{ text: '🎯 Активувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE + ':' + planId }],
    [{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE + ':' + planId }],
    [{ text: '🔙 До списку планів', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }]
  ].filter((row) => row.length > 0);
  await State.set(chatId, { planStudentChatId: studentChatId, planViewPlanId: planId });
  try {
    await Helpers.sendKeyboard(chatId, text.slice(0, 4000), keyboard);
  } catch (e) {
    console.error('TrainingPlan showPlanDetail sendKeyboard', e.message);
    await Helpers.safeSend(chatId, 'План: ' + (plan.planName || 'План') + '. Відкрий зі списку планів.');
    await showPlanList(chatId, studentChatId);
  }
}

/** Список вправ для видалення (кожна — кнопка з planExerciseId). callback_data < 64 байт. */
async function showPlanDeleteExerciseList(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan || !plan.exercises || plan.exercises.length === 0) {
    await showPlanDetail(chatId, planId, studentChatId);
    return;
  }
  await State.set(chatId, { planStudentChatId: studentChatId, planViewPlanId: planId });
  const keyboard = [];
  for (const ex of plan.exercises) {
    const peId = ex.id || ex.planExerciseId;
    if (!peId) continue;
    const label = (ex.exerciseName || 'Вправа').slice(0, 35) + (ex.dayNumber ? ' (День ' + ex.dayNumber + ')' : '');
    keyboard.push([{ text: '🗑 ' + label, callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE_EXERCISE + ':' + peId }]);
  }
  keyboard.push([{ text: '🔙 До плану', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN }]);
  await Helpers.sendKeyboard(chatId, 'Оберіть вправу для видалення з плану:', keyboard);
}

/** Список вправ плану як кнопки для відкриття картки кожної вправи. callback_data < 64 байт. */
async function showPlanExerciseCardsList(chatId, planId, studentChatId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan || !plan.exercises || plan.exercises.length === 0) {
    await showPlanDetail(chatId, planId, studentChatId);
    return;
  }
  await State.set(chatId, { planStudentChatId: studentChatId, planViewPlanId: planId });
  const dedup = new Map();
  for (const ex of plan.exercises) {
    if (ex.exerciseId && !dedup.has(ex.exerciseId)) {
      dedup.set(ex.exerciseId, ex.exerciseName || 'Вправа');
    }
  }
  const keyboard = [];
  for (const [exId, name] of dedup) {
    keyboard.push([{ text: '📖 ' + (name.length > 50 ? name.slice(0, 47) + '…' : name), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE + ':' + exId }]);
  }
  keyboard.push([{ text: '🔙 До плану', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN }]);
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
  const splitConfig = plan.splitConfig && plan.splitConfig.length > 0 ? plan.splitConfig : null;
  const dayConfigs = splitConfig
    ? splitConfig.map((sc) => ({ dayNumber: sc.day_number, day_label: sc.day_label, dayLabelUA: sc.day_label }))
    : (planGenerator.getSplitSchemeAndDays(plan.level || 'beginner', daysPerWeek).dayConfigs || []);
  const keyboard = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    const cfg = dayConfigs.find((x) => x.dayNumber === d);
    const label = cfg?.dayLabelUA || cfg?.day_label || ('День ' + d);
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
  keyboard.push([{ text: '⭐ Мої вправи (усі)', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':__myex__' }]);
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

async function showPlanEditMyExercisesAll(chatId) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const exercises = await supabase.listAllUserCustomExercises(chatId);
  if (!exercises.length) {
    await Helpers.safeSend(chatId, '❌ У «Мої вправи» поки нічого немає. Додай вправи в меню «Тренування» → «Мої вправи».');
    await showPlanEditTopGroups(chatId);
    return;
  }
  const merged = exercises.map((c) => ({ id: c.id, name: '⭐ ' + (c.name || 'Вправа'), isCustom: true }));
  const keyboard = merged.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
    {
      text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH),
      callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + planExercisePickKey(ex)
    }
  ]);
  keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum }]);
  await Helpers.sendKeyboard(chatId, '⭐ **Мої вправи**\n\nОбери вправу для додавання в план:', keyboard, {
    parse_mode: 'Markdown'
  });
}

async function showPlanEditExercises(chatId, level1, level2, level3) {
  const state = await State.get(chatId);
  const planId = state?.planEditPlanId;
  const dayNum = state?.planEditDayNumber;
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const level3Arg = level3 === '__all__' || !level3 ? null : level3;
  const exercises = await loadExercisesForPlanPicker(chatId, level1, level2Arg, level3Arg);
  if (!exercises || exercises.length === 0) {
    await Helpers.safeSend(chatId, '❌ У цій групі немає вправ (каталог і «Мої вправи»).');
    if (level2Arg) await showPlanEditSecondLevelGroups(chatId, level1);
    else await showPlanEditDaySelect(chatId, planId, state?.planStudentChatId);
    return;
  }
  const header = [level1, level2Arg, level3Arg].filter(Boolean).join(' → ') || level1;
  const backData = level3Arg
    ? CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1 + ':' + (level2 || '__all__')
    : level2Arg
      ? CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP + ':' + level1
      : CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY + ':' + planId + ':' + dayNum;
  const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
    {
      text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH),
      callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + planExercisePickKey(ex)
    }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: backData }]);
  await Helpers.sendKeyboard(
    chatId,
    '🏋️ ' + header + '\n\nОбери вправу (⭐ — з «Мої вправи»):',
    keyboard
  );
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();
  const parts = String(callbackData || '').split(':');

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST && param) {
    const access = await resolvePlanAccess(chatId, param);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для цього плану.');
      return true;
    }
    await showPlanList(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW && param) {
    const access = await resolvePlanAccess(chatId, param);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для створення плану.');
      return true;
    }
    await showPlanTypeSelect(chatId, param);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_MANUAL && param) {
    const access = await resolvePlanAccess(chatId, param);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для створення плану.');
      return true;
    }
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
    await State.update(chatId, { planManualDays: days, planOrigin: 'manual' });
    await askAccentZones(chatId);
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
    if (level1 === '__myex__') {
      await showPlanEditMyExercisesAll(chatId);
      return true;
    }
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
    const pick = parsePlanExercisePick(param);
    if (!planId || !dayNum || !pick.id) return false;
    const plan = await supabase.getPlanWithExercises(planId);
    if (!plan) {
      await Helpers.safeSend(chatId, '❌ План не знайдено.');
      return true;
    }
    let exerciseName = 'Вправа';
    let exerciseId = null;
    let customExerciseId = null;
    if (pick.isCustom) {
      const custom = await supabase.getUserCustomExerciseById(chatId, pick.id);
      if (!custom) {
        await Helpers.safeSend(chatId, '❌ Вправу з «Мої вправи» не знайдено.');
        return true;
      }
      exerciseName = custom.name;
      customExerciseId = custom.id;
    } else {
      const ex = await supabase.getExerciseById(pick.id);
      if (!ex) {
        await Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
        return true;
      }
      exerciseId = ex.id;
      exerciseName = ex.name || 'Вправа';
    }
    await State.update(chatId, {
      planPendingExercise: {
        planId,
        dayNum,
        pickKey: pick.pickKey,
        exerciseId,
        customExerciseId,
        exerciseName,
        studentChatId
      }
    });
    await showSetsPreset(chatId, pick.pickKey, exerciseName);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD && parts[1] && parts[2]) {
    const state = await State.get(chatId);
    const pending = state?.planPendingExercise;
    const pickKey = parts[1].trim();
    const type = String(parts[2] || '').toUpperCase();
    if (!pending || String(pending.pickKey || pending.exerciseId) !== String(pickKey)) {
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
      customExerciseId: pending.customExerciseId || null,
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
    const access = await resolvePlanAccess(chatId, param);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для створення плану.');
      return true;
    }
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

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_PHASE_DUR) {
    const state = await State.get(chatId);
    const studentChatId = state?.planStudentChatId;
    if (!studentChatId) {
      await Helpers.safeSend(chatId, '❌ Обери учня знову.');
      return true;
    }
    const n = param ? parseInt(String(param).trim(), 10) : null;
    if (n === 2 || n === 3 || n === 4) {
      await State.update(chatId, { planPhaseDuration: n, planTotalWeeks: state?.planRevisionWeeks ?? 10 });
      await askAccentZones(chatId);
      return true;
    }
    await askPhaseDuration(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_START) {
    const state = await State.get(chatId);
    const studentChatId = state?.planStudentChatId;
    if (!studentChatId) {
      await Helpers.safeSend(chatId, '❌ Обери учня знову.');
      return true;
    }
    await State.update(chatId, { planAccentZones: [], planAvoidZones: [] });
    await askAccentZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_TOGGLE && param) {
    const state = await State.get(chatId);
    const zone = (param || '').trim();
    if (!zone) return false;
    let accentZones = [...(state?.planAccentZones || [])];
    if (zone === 'full') {
      accentZones = ['full'];
    } else {
      accentZones = accentZones.filter((z) => z !== 'full');
      if (accentZones.includes(zone)) {
        accentZones = accentZones.filter((z) => z !== zone);
      } else if (accentZones.length < 2) {
        accentZones.push(zone);
      }
    }
    await State.update(chatId, { planAccentZones: accentZones });
    await askAccentZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_NEXT) {
    const state = await State.get(chatId);
    const accentZones = state?.planAccentZones || [];
    if (!accentZones.length) {
      await Helpers.safeSend(chatId, '⚠️ Обери хоча б одну зону або «Все рівномірно».');
      await askAccentZones(chatId);
      return true;
    }
    await askAvoidZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_BACK) {
    const state = await State.get(chatId);
    const planOrigin = state?.planOrigin;
    const studentChatId = state?.planStudentChatId || '';
    if (planOrigin === 'auto' && state?.planPhaseDuration) {
      await askPhaseDuration(chatId);
    } else if (planOrigin === 'auto') {
      await showAutoSummary(chatId, studentChatId);
    } else {
      await askPlanDays(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_TOGGLE && param) {
    const state = await State.get(chatId);
    const zone = (param || '').trim();
    if (!zone || (state?.planAccentZones || []).includes(zone)) return false;
    let avoidZones = [...(state?.planAvoidZones || [])];
    if (avoidZones.includes(zone)) {
      avoidZones = avoidZones.filter((z) => z !== zone);
    } else {
      avoidZones.push(zone);
    }
    await State.update(chatId, { planAvoidZones: avoidZones });
    await askAvoidZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_SKIP || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_NEXT) {
    if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_SKIP) {
      await State.update(chatId, { planAvoidZones: [] });
    }
    await showSplitPreview(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_BACK) {
    await askAccentZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_CONFIRM) {
    const state = await State.get(chatId);
    const planOrigin = state?.planOrigin;
    const studentChatId = state?.planStudentChatId || '';
    const access = await resolvePlanAccess(chatId, studentChatId);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для створення плану.');
      return true;
    }
    const isSelfMode = access.mode === 'self';
    const splitConfig = state?.planSplitConfig || [];
    const accentZones = state?.planAccentZones || [];
    const avoidZones = state?.planAvoidZones || [];

    if (planOrigin === 'auto' && state?.planPhaseDuration) {
      await showPhaseCandidates(chatId, 'A');
      return true;
    }
    if (planOrigin === 'auto') {
      try {
        await Helpers.safeSend(chatId, '⏳ Генерую план...');
        const exerciseCountPerDay = state?.planAutoExerciseCount != null && state.planAutoExerciseCount >= 4 && state.planAutoExerciseCount <= 10 ? state.planAutoExerciseCount : undefined;
        const result = await planGenerator.generateTrainingPlan(studentChatId, {
          coachId: isSelfMode ? null : chatId,
          isActive: false,
          exerciseCountPerDay,
          splitConfig,
          accentZones,
          avoidZones
        });
        if (!result) {
          await Helpers.safeSend(chatId, '❌ Не вдалося згенерувати план.');
          await showPlanList(chatId, studentChatId);
          return true;
        }
        await Helpers.safeSend(chatId, '✅ План створено: ' + result.planName + '\n' + result.daysPerWeek + ' дн./тиж, рівень ' + result.level + '.');
        await showPlanDetail(chatId, result.planId, studentChatId);
      } catch (err) {
        console.error('TrainingPlan PLAN_SPLIT_CONFIRM auto', err.message);
        await Helpers.safeSend(chatId, '❌ Помилка генерації.');
        await showPlanList(chatId, studentChatId);
      }
    } else {
      const revisionWeeks = state?.planManualRevisionWeeks != null ? parseInt(state.planManualRevisionWeeks, 10) : undefined;
      const daysPerWeek = state?.planManualDays || 3;
      const level = state?.planManualLevel || 'beginner';
      const base = planGenerator.getSplitSchemeAndDays(level, daysPerWeek, '');
      const planId = await supabase.insertTrainingPlan({
        coachId: isSelfMode ? null : chatId,
        studentId: studentChatId,
        planName: String(state?.planManualName || 'План').trim() || 'План вручну',
        goal: state?.planManualGoal || 'keep',
        level,
        splitScheme: base.splitScheme,
        daysPerWeek,
        revisionWeeks,
        description: 'Складено тренером вручну',
        isActive: false,
        isTemplate: false,
        generationType: 'manual',
        accentZones,
        avoidZones,
        splitConfig
      });
      if (!planId) {
        await Helpers.safeSend(chatId, '❌ Не вдалося зберегти план.');
        await showPlanList(chatId, studentChatId);
        return true;
      }
      await State.update(chatId, { planEditPlanId: planId, step: CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY });
      await showPlanEditDaySelect(chatId, planId, studentChatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_BACK) {
    const state = await State.get(chatId);
    if (state?.step === CONSTANTS.FSM_STATES.PLAN_PHASE_CANDIDATES && state?.planCurrentPhase === 'A') {
      await showSplitPreview(chatId);
      return true;
    }
    await askAvoidZones(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_REPLACE && param) {
    const prevPhase = (param || '').trim();
    if (prevPhase === 'A' || prevPhase === 'B') await showPhaseCandidates(chatId, prevPhase);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_CONFIRM && param) {
    const phase = (param || '').trim();
    if (phase !== 'A' && phase !== 'B' && phase !== 'C') return false;
    const state = await State.get(chatId);
    const candidatesByDay = state?.planCandidates?.[phase];
    const studentChatId = state?.planStudentChatId;
    if (!candidatesByDay || !studentChatId) {
      await Helpers.safeSend(chatId, '❌ Немає даних. Поверніться до списку планів.');
      return true;
    }
    const user = await supabase.getUserByChatId(studentChatId);
    const userProfile = {
      goal: state?.planGoal || user?.goal || 'keep',
      level: state?.planLevel || (user ? planGenerator.getLevelFromExperienceDays(planGenerator.getExperienceDays(user)) : 'beginner'),
      gender: (user?.gender || '').toLowerCase(),
      medicalSummary: (await supabase.getActiveMedicalConditions(studentChatId)).map((m) => m.mc_code + ' ' + (m.severity || '')).join('; ') || 'немає',
      accentZones: state?.planAccentZones || [],
      avoidZones: state?.planAvoidZones || [],
      role: user?.role || 'student',
      coach_id: user?.coachId || null
    };
    await Helpers.safeSend(chatId, '⏳ AI підбирає вправи для фази ' + phase + '...');
    let aiResult = await progressivePlanAI.callProgressivePlanAI(phase, candidatesByDay, userProfile);
    if (!aiResult) {
      await Helpers.safeSend(chatId, 'План згенеровано без AI-пояснень.');
      aiResult = buildFallbackPhaseResult(candidatesByDay);
    }
    const planPhaseResults = { ...(state.planPhaseResults || {}), [phase]: aiResult };
    const planTotalWeeks = state?.planTotalWeeks || state?.planRevisionWeeks || 10;
    const planPhaseDuration = state?.planPhaseDuration || 2;
    const phasesCount = Math.min(3, Math.ceil(planTotalWeeks / planPhaseDuration));
    const nextPhase = phase === 'A' ? 'B' : phase === 'B' ? 'C' : null;
    await State.update(chatId, { planPhaseResults });
    if (nextPhase && phasesCount >= (nextPhase === 'B' ? 2 : 3)) {
      await showPhaseCandidates(chatId, nextPhase);
      return true;
    }
    try {
      const goal = state?.planGoal || user?.goal || 'keep';
      const planName = 'План ' + (CONSTANTS.GOAL_LABELS && CONSTANTS.GOAL_LABELS[goal] ? CONSTANTS.GOAL_LABELS[goal] : goal) + ' ' + planTotalWeeks + ' тижнів';
      let aiPlanSummary = null;
      if (progressivePlanAI.generatePlanSummary) {
        aiPlanSummary = await progressivePlanAI.generatePlanSummary(userProfile, planPhaseResults);
      }
      const planId = await supabase.insertTrainingPlan({
        coachId: isSelfMode ? null : chatId,
        studentId: studentChatId,
        planName,
        goal,
        level: state?.planLevel || (user ? planGenerator.getLevelFromExperienceDays(planGenerator.getExperienceDays(user)) : 'beginner'),
        daysPerWeek: state?.planManualDays || (user?.trainingDaysPerWeek ?? 3),
        revisionWeeks: planTotalWeeks,
        isActive: false,
        generationMode: 'progressive',
        phaseDuration: planPhaseDuration,
        totalWeeks: planTotalWeeks,
        aiPlanSummary,
        createdByRole: isSelfMode ? 'student' : 'coach',
        accentZones: state?.planAccentZones || [],
        avoidZones: state?.planAvoidZones || [],
        splitConfig: state?.planSplitConfig || []
      });
      if (!planId) {
        await Helpers.safeSend(chatId, '❌ Не вдалося зберегти план.');
        await showPlanList(chatId, studentChatId);
        return true;
      }
      const rows = planGenerator.expandPhasesToWeeks(planPhaseResults, planTotalWeeks, planPhaseDuration, planId, {
        goal,
        level: state?.planLevel || 'beginner',
        candidatesByPhase: state?.planCandidates
      });
      await supabase.insertTrainingPlanWeeks(rows);
      await Helpers.safeSend(chatId, '✅ Прогресивний план створено: ' + planName);
      await showPlanDetail(chatId, planId, studentChatId);
    } catch (err) {
      console.error('TrainingPlan PLAN_CAND_CONFIRM save', err.message);
      await Helpers.safeSend(chatId, '❌ Помилка збереження плану.');
      await showPlanList(chatId, studentChatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_PRESET && param !== undefined && param !== '') {
    const state = await State.get(chatId);
    const pending = state?.planPendingExercise;
    if (!pending) {
      await Helpers.safeSend(chatId, '❌ Сесію втрачено. Обери вправу знову.');
      return true;
    }
    const plan = await supabase.getPlanWithExercises(pending.planId);
    const goal = (plan?.goal || 'keep').toLowerCase();
    const level = (plan?.level || 'beginner').toLowerCase();
    const presets = (SET_PRESETS[goal] && SET_PRESETS[goal][level]) ? SET_PRESETS[goal][level] : SET_PRESETS.keep.beginner;
    const idx = parseInt(String(param).trim(), 10);
    const preset = presets[idx];
    if (!preset) {
      await Helpers.safeSend(chatId, '❌ Невірний вибір.');
      return true;
    }
    const existingForDay = (plan?.exercises || []).filter((e) => e.dayNumber === pending.dayNum);
    const orderInDay = existingForDay.length + 1;
    const daysPerWeek = plan?.daysPerWeek != null ? plan.daysPerWeek : 3;
    const splitCfg = plan?.splitConfig;
    const dayConfigs = splitCfg?.length ? splitCfg : planGenerator.getSplitSchemeAndDays(plan?.level || 'beginner', daysPerWeek).dayConfigs || [];
    const dayCfg = dayConfigs.find((x) => (x.dayNumber || x.day_number) === pending.dayNum);
    const dayLabel = dayCfg?.day_label || dayCfg?.dayLabelUA || null;

    const ok = await supabase.insertTrainingPlanExercise({
      planId: pending.planId,
      exerciseId: pending.exerciseId,
      customExerciseId: pending.customExerciseId || null,
      exerciseName: pending.exerciseName,
      dayNumber: pending.dayNum,
      dayLabel,
      orderInDay,
      sets: preset.sets,
      reps: String(preset.reps),
      restSec: preset.rest_sec,
      medicalStatus: 'NEUTRAL',
      progressionType: 'weight'
    });
    await State.update(chatId, { planPendingExercise: undefined });
    if (ok) {
      await Helpers.safeSend(chatId, '✅ Вправу додано: ' + pending.exerciseName + ', ' + preset.label);
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати вправу.');
    }
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY });
    await showPlanEditDaySelect(chatId, pending.planId, pending.studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_CUSTOM) {
    const state = await State.get(chatId);
    const pending = state?.planPendingExercise;
    if (!pending) return false;
    const pickKey = pending.pickKey || String(pending.exerciseId || '');
    const keyboard = [
      [{ text: '🔄 Кілька підходів (сети)', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD + ':' + pickKey + ':SET' }],
      [{ text: '1️⃣ Одиночне виконання', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD + ':' + pickKey + ':SINGLE' }]
    ];
    await Helpers.sendKeyboard(chatId, '📋 ' + (pending.exerciseName || 'Вправа') + '\n\nОберіть тип виконання:', keyboard);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_BACK) {
    const state = await State.get(chatId);
    const planId = state?.planEditPlanId;
    const level1 = state?.planEditLevel1;
    const level2 = state?.planEditLevel2;
    const level3 = state?.planEditLevel3;
    if (!planId) {
      await Helpers.safeSend(chatId, '❌ Контекст втрачено.');
      return true;
    }
    await State.update(chatId, { planPendingExercise: undefined, step: CONSTANTS.FSM_STATES.PLAN_ADD_EXERCISE_DAY });
    if (level1 && level2) {
      await showPlanEditExercises(chatId, level1, level2 === '__all__' ? '__all__' : level2, level3);
    } else {
      await showPlanEditTopGroups(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE && param) {
    const studentChatId = param;
    const access = await resolvePlanAccess(chatId, studentChatId);
    if (!access.ok) {
      await Helpers.safeSend(chatId, '⛔ Недостатньо прав для генерації плану.');
      return true;
    }
    const isSelfMode = access.mode === 'self';
    const state = await State.get(chatId);
    const user = await supabase.getUserByChatId(studentChatId);
    if (user) {
      const missing = getProfileCompletenessMissing(user);
      if (missing.length > 0) {
        const { msg, keyboard } = getAutoPlanIncompleteProfilePrompt(studentChatId, missing, isSelfMode);
        await Helpers.sendKeyboard(chatId, msg, keyboard, { parse_mode: 'Markdown' });
        return true;
      }
    }
    const exerciseCountPerDay = state && state.planAutoExerciseCount != null && state.planAutoExerciseCount >= 4 && state.planAutoExerciseCount <= 10 ? state.planAutoExerciseCount : undefined;
    const accentZones = (user && user.accentZones && Array.isArray(user.accentZones) && user.accentZones.length > 0) ? user.accentZones : ['full'];
    const avoidZones = (user && user.avoidZones && Array.isArray(user.avoidZones)) ? user.avoidZones : [];
    try {
      await Helpers.safeSend(chatId, '⏳ Генерую план...');
      const result = await planGenerator.generateTrainingPlan(studentChatId, {
        coachId: isSelfMode ? null : chatId,
        isActive: false,
        exerciseCountPerDay,
        accentZones,
        avoidZones
      });
      if (!result) {
        await Helpers.safeSend(chatId, '❌ Не вдалося згенерувати план. Перевір профіль учня (ціль, рівень досвіду, тренувальних днів).');
        await showPlanList(chatId, studentChatId);
        return true;
      }
      await Helpers.safeSend(chatId, '✅ План створено: ' + result.planName + '\n' + result.daysPerWeek + ' дн./тиж, рівень ' + result.level + '.');
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

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE) {
    const state = await State.get(chatId);
    const planId = state?.planViewPlanId;
    const studentChatId = state?.planStudentChatId || '';
    if (!planId) {
      await Helpers.safeSend(chatId, '❌ Контекст плану втрачено. Відкрий план зі списку.');
      return true;
    }
    if (param === 'list') {
      await showPlanExerciseCardsList(chatId, planId, studentChatId);
      return true;
    }
    const exerciseId = (param || '').trim();
    if (!exerciseId) return false;
    const Library = require('./library');
    await Library.showExerciseDetail(chatId, exerciseId, { returnToPlan: { planId, studentChatId } });
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN) {
    const state = await State.get(chatId);
    const planId = state?.planViewPlanId;
    const studentChatId = state?.planStudentChatId || '';
    if (!planId) {
      await Helpers.safeSend(chatId, '❌ Контекст плану втрачено. Відкрий план зі списку.');
      return true;
    }
    await showPlanDetail(chatId, planId, studentChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE_EXERCISE) {
    const state = await State.get(chatId);
    const planId = state?.planViewPlanId;
    const studentChatId = state?.planStudentChatId || '';
    if (!planId) {
      await Helpers.safeSend(chatId, '❌ Контекст плану втрачено. Відкрий план зі списку.');
      return true;
    }
    if (param === 'list') {
      await showPlanDeleteExerciseList(chatId, planId, studentChatId);
      return true;
    }
    const planExerciseId = (param || '').trim();
    if (!planExerciseId) return false;
    const ok = await supabase.deleteTrainingPlanExercise(planExerciseId);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ Вправу видалено з плану.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося видалити вправу.');
    }
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
    const customFound = await supabase.searchUserCustomExercises(chatId, query);
    if ((!exercises || !exercises.length) && (!customFound || !customFound.length)) {
      await Helpers.safeSend(chatId, '❌ Нічого не знайдено за запитом «' + query + '». Спробуй інший.');
      return true;
    }
    const planId = state.planEditPlanId;
    const dayNum = state.planEditDayNumber;
    const keyboard = [];
    for (const c of (customFound || []).slice(0, 8)) {
      keyboard.push([
        {
          text: ('⭐ ' + (c.name || 'Вправа')).slice(0, MAX_EXERCISE_BUTTON_LENGTH),
          callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':c_' + c.id
        }
      ]);
    }
    for (const ex of (exercises || []).slice(0, MAX_BUTTONS_PER_PAGE - keyboard.length)) {
      const label = ex.fromAlias ? '🏷 ' + (ex.aliasText || ex.name) + ' — ' + ex.name : ex.name || 'Вправа';
      keyboard.push([
        { text: label.slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE + ':' + ex.id }
      ]);
    }
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
