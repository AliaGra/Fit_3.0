/**
 * Генерація плану тренувань (Логіка складання плану тренувань.md, розд. 4, 5, 7).
 * generateTrainingPlan(studentChatId, options) → planId або null.
 * Частина 3 AI: персоналізовані коментарі тренера в notes (AI_Integration_FIT3_Implementation_Plan.md).
 */
const supabase = require('./supabase');
const { filterExerciseForUser } = require('./medicalFilter');
const planCommentsAI = require('./ai/planComments');

const GOALS = Object.freeze({ LOSE: 'lose', GAIN: 'gain', KEEP: 'keep' });
const LEVELS = Object.freeze({ BEGINNER: 'beginner', INTERMEDIATE: 'intermediate', ADVANCED: 'advanced' });

/** Орієнтовний вік від birthDate (для AI-профілю). */
function _ageFromBirthDate(birthDate) {
  const d = birthDate instanceof Date ? birthDate : (birthDate ? new Date(birthDate) : null);
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

/** Дні досвіду від experience_start_date. */
function getExperienceDays(user) {
  const expStart = user.experienceStartDate instanceof Date ? user.experienceStartDate : (user.experienceStartDate ? new Date(user.experienceStartDate) : null);
  if (!expStart || isNaN(expStart.getTime())) return 0;
  return Math.floor((Date.now() - expStart.getTime()) / (24 * 60 * 60 * 1000));
}

function getLevelFromExperienceDays(days) {
  if (days <= 90) return LEVELS.BEGINNER;
  if (days <= 365) return LEVELS.INTERMEDIATE;
  return LEVELS.ADVANCED;
}

function getDefaultDaysPerWeek(level) {
  if (level === LEVELS.BEGINNER) return 3;
  if (level === LEVELS.INTERMEDIATE) return 4;
  return 4;
}

/** Схема та конфіг днів за таблицею 4.2. Повертає { splitScheme, dayConfigs }. */
function getSplitSchemeAndDays(level, daysPerWeek) {
  const d = daysPerWeek || getDefaultDaysPerWeek(level);
  const dayConfigs = [];

  if (level === LEVELS.BEGINNER) {
    if (d === 2 || d === 3) {
      for (let i = 1; i <= d; i++) {
        dayConfigs.push({
          dayNumber: i,
          dayType: 'full_body',
          dayLabelUA: 'Повне тіло',
          muscleGroups: ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'],
          exerciseCount: d === 2 ? 5 : 6
        });
      }
      return { splitScheme: 'full_body', dayConfigs };
    }
  }

  if (level === LEVELS.INTERMEDIATE) {
    if (d === 3) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх тіла', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 5 },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ тіла', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 5 },
        { dayNumber: 3, dayType: 'full_body', dayLabelUA: 'Повне тіло', muscleGroups: ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'], exerciseCount: 6 }
      );
      return { splitScheme: 'upper_lower_full', dayConfigs };
    }
    if (d === 4) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 5 },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 5 },
        { dayNumber: 3, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 5 },
        { dayNumber: 4, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 5 }
      );
      return { splitScheme: 'upper_lower', dayConfigs };
    }
  }

  if (level === LEVELS.ADVANCED) {
    if (d === 4) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'push', dayLabelUA: 'Push', muscleGroups: ['Груди', 'Плечі', 'Руки'], exerciseCount: 6 },
        { dayNumber: 2, dayType: 'pull', dayLabelUA: 'Pull', muscleGroups: ['Спина', 'Руки'], exerciseCount: 6 },
        { dayNumber: 3, dayType: 'legs', dayLabelUA: 'Legs', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 6 },
        { dayNumber: 4, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 6 }
      );
      return { splitScheme: 'ppl_upper', dayConfigs };
    }
    if (d === 5) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'push', dayLabelUA: 'Push', muscleGroups: ['Груди', 'Плечі', 'Руки'], exerciseCount: 6 },
        { dayNumber: 2, dayType: 'pull', dayLabelUA: 'Pull', muscleGroups: ['Спина', 'Руки'], exerciseCount: 6 },
        { dayNumber: 3, dayType: 'legs', dayLabelUA: 'Legs', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 6 },
        { dayNumber: 4, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 6 },
        { dayNumber: 5, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: 6 }
      );
      return { splitScheme: 'ppl_upper_lower', dayConfigs };
    }
  }

  return { splitScheme: 'full_body', dayConfigs: [{ dayNumber: 1, dayType: 'full_body', dayLabelUA: 'Повне тіло', muscleGroups: ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'], exerciseCount: 6 }] };
}

/** sets, reps, rest_sec за ціллю та рівнем (таблиці 4.3, 4.4). */
function getSetsRepsRest(goal, level) {
  const g = goal || GOALS.KEEP;
  if (g === GOALS.LOSE) {
    return { sets: 3, reps: '15–20', restSec: level === LEVELS.BEGINNER ? 90 : 60 };
  }
  if (g === GOALS.GAIN) {
    return { sets: level === LEVELS.BEGINNER ? 3 : 4, reps: level === LEVELS.BEGINNER ? '12–15' : '6–10', restSec: level === LEVELS.ADVANCED ? 60 : 90 };
  }
  return { sets: 3, reps: '10–15', restSec: 75 };
}

/** Перемішати масив (Fisher–Yates). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Відібрати вправи для одного дня: без BLOCKED, SAFE вперед, за difficulty і vid, вибірка. */
async function pickExercisesForDay(dayConfig, userMedConditions, goal, level, gender) {
  const exercises = await supabase.getExercisesForPlanByGroupLevel2(dayConfig.muscleGroups);
  const allowed = [];
  for (const ex of exercises) {
    const result = filterExerciseForUser(ex, userMedConditions);
    if (result.status === 'BLOCKED') continue;
    const difficulty = (ex.difficulty || '').toLowerCase();
    if (level === LEVELS.BEGINNER && (difficulty === 'висока' || difficulty === 'высокая')) continue;
    if (level === LEVELS.ADVANCED && (difficulty === 'низька' || difficulty === 'низкая')) continue;
    const vid = (ex.vid || '').toLowerCase();
    if (goal === GOALS.GAIN && vid.indexOf('изоляц') >= 0 && vid.indexOf('базов') < 0) {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: 1 });
    } else if (goal === GOALS.LOSE && vid.indexOf('базов') >= 0 && vid.indexOf('изоляц') < 0) {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: 1 });
    } else {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: result.status === 'SAFE' ? 0 : 2 });
    }
  }
  allowed.sort((a, b) => a._sortOrder - b._sortOrder);
  const shuffled = shuffle(allowed);
  return shuffled.slice(0, dayConfig.exerciseCount).map((ex, idx) => ({
    exerciseId: ex.id,
    exerciseName: ex.name,
    orderInDay: idx + 1,
    medicalStatus: ex._filterStatus === 'SAFE' ? 'SAFE' : ex._filterStatus === 'ALLOWED_WITH_MOD' ? 'ALLOWED_WITH_MOD' : 'NEUTRAL',
    modificationNotes: ex._filterStatus === 'ALLOWED_WITH_MOD' ? (ex.modifications || '') : null
  }));
}

/**
 * Згенерувати план для учня. Повертає { planId } або null при помилці.
 * @param {string} studentChatId
 * @param {{ daysPerWeek?: number, planName?: string, coachId?: string, isActive?: boolean }} options
 */
async function generateTrainingPlan(studentChatId, options = {}) {
  const user = await supabase.getUserByChatId(studentChatId);
  if (!user) return null;

  const experienceDays = getExperienceDays(user);
  const level = getLevelFromExperienceDays(experienceDays);
  const daysPerWeek = options.daysPerWeek != null ? options.daysPerWeek : (user.trainingDaysPerWeek != null ? user.trainingDaysPerWeek : getDefaultDaysPerWeek(level));
  const goal = (user.goal || GOALS.KEEP).toLowerCase();
  const gender = (user.gender || '').toLowerCase();

  const { splitScheme, dayConfigs } = getSplitSchemeAndDays(level, daysPerWeek);
  if (!dayConfigs.length) return null;

  const userMedConditions = await supabase.getActiveMedicalConditions(studentChatId);
  const { sets, reps, restSec } = getSetsRepsRest(goal, level);

  const planName = options.planName || 'План ' + (goal === GOALS.LOSE ? 'схуднення' : goal === GOALS.GAIN ? 'набору маси' : 'підтримки') + ', ' + daysPerWeek + ' дн./тиж';

  const planId = await supabase.insertTrainingPlan({
    coachId: options.coachId || null,
    studentId: studentChatId,
    planName,
    goal,
    level,
    splitScheme,
    daysPerWeek,
    description: 'Авто-згенеровано за профілем',
    isActive: false,
    isTemplate: false,
    generationType: 'auto'
  });
  if (!planId) return null;

  const profileForAI = {
    firstName: user.firstName || user.first_name || 'Учень',
    age: user.age != null ? user.age : (user.birthDate ? _ageFromBirthDate(user.birthDate) : null),
    goal,
    level,
    medicalConditions: (userMedConditions && userMedConditions.length)
      ? userMedConditions.map((m) => (m.mc_code || '') + (m.severity ? ' (' + m.severity + ')' : '')).join(', ')
      : 'немає'
  };

  for (const dayConfig of dayConfigs) {
    const dayExercises = await pickExercisesForDay(dayConfig, userMedConditions, goal, level, gender);
    let notesByExercise = null;
    if (dayExercises.length > 0) {
      const entityId = planId + '_d' + dayConfig.dayNumber;
      notesByExercise = await planCommentsAI.generatePlanComments(
        profileForAI,
        dayExercises.map((ex) => ({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, medicalStatus: ex.medicalStatus, sets, reps })),
        dayConfig.dayType,
        entityId
      );
    }
    const daySummary = notesByExercise && typeof notesByExercise.day_summary === 'string' ? notesByExercise.day_summary.trim() : null;
    for (let i = 0; i < dayExercises.length; i++) {
      const ex = dayExercises[i];
      const aiNote = notesByExercise
        ? (notesByExercise[String(ex.exerciseId)] || notesByExercise[ex.exerciseId] || '').trim()
        : null;
      let notes = aiNote || ex.modificationNotes || null;
      if (daySummary && i === 0 && notes) notes = daySummary + '\n\n' + notes;
      else if (daySummary && i === 0) notes = daySummary;
      await supabase.insertTrainingPlanExercise({
        planId,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        dayNumber: dayConfig.dayNumber,
        dayLabel: dayConfig.dayLabelUA,
        orderInDay: ex.orderInDay,
        sets,
        reps,
        restSec,
        notes: notes || null,
        medicalStatus: ex.medicalStatus,
        progressionType: 'weight'
      });
    }
  }

  if (options.isActive) {
    await supabase.setPlanActiveForStudent(planId, studentChatId);
  }

  return { planId, planName, daysPerWeek, level, goal };
}

module.exports = {
  generateTrainingPlan,
  getExperienceDays,
  getLevelFromExperienceDays,
  getSplitSchemeAndDays,
  getSetsRepsRest
};
