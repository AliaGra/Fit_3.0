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

/** Схема та конфіг днів за таблицею 4.2. Для female — акцент на Низ (5.3). Повертає { splitScheme, dayConfigs }. */
function getSplitSchemeAndDays(level, daysPerWeek, gender) {
  const d = daysPerWeek || getDefaultDaysPerWeek(level);
  const isFemale = (gender || '').toLowerCase() === 'female';
  const dayConfigs = [];

  if (level === LEVELS.BEGINNER) {
    if (d === 2 || d === 3) {
      const muscleGroups = isFemale
        ? ['Ноги', 'Сідниці', 'Спина', 'Груди', 'Прес', 'Плечі']
        : ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'];
      const exerciseCount = d === 2 ? 5 : 6;
      for (let i = 1; i <= d; i++) {
        dayConfigs.push({
          dayNumber: i,
          dayType: 'full_body',
          dayLabelUA: 'Повне тіло',
          muscleGroups,
          exerciseCount
        });
      }
      return { splitScheme: 'full_body', dayConfigs };
    }
  }

  if (level === LEVELS.INTERMEDIATE) {
    if (d === 3) {
      const upperGroups = isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'];
      const lowerGroups = isFemale ? ['Ноги', 'Сідниці', 'Прес'] : ['Ноги', 'Сідниці', 'Прес'];
      const lowerCount = isFemale ? 6 : 5;
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх тіла', muscleGroups: upperGroups, exerciseCount: 5 },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ тіла', muscleGroups: lowerGroups, exerciseCount: lowerCount },
        { dayNumber: 3, dayType: 'full_body', dayLabelUA: 'Повне тіло', muscleGroups: isFemale ? ['Ноги', 'Сідниці', 'Спина', 'Груди', 'Прес'] : ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'], exerciseCount: 6 }
      );
      return { splitScheme: 'upper_lower_full', dayConfigs };
    }
    if (d === 4) {
      const upperGroups = isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'];
      const lowerGroups = ['Ноги', 'Сідниці', 'Прес'];
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: upperGroups, exerciseCount: 5 },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: lowerGroups, exerciseCount: isFemale ? 6 : 5 },
        { dayNumber: 3, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: upperGroups, exerciseCount: 5 },
        { dayNumber: 4, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: lowerGroups, exerciseCount: isFemale ? 6 : 5 }
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
        { dayNumber: 4, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: 6 }
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

/** Зважений вибір без повернення: вага = 1/(usageCount+1). Повертає до count елементів. */
function weightedSample(arr, count, getWeight) {
  if (!arr.length || count <= 0) return [];
  const result = [];
  let pool = arr.map((x) => ({ x, weight: getWeight(x) }));
  for (let n = 0; n < count && pool.length > 0; n++) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      if (r < pool[i].weight) {
        result.push(pool[i].x);
        pool = pool.slice(0, i).concat(pool.slice(i + 1));
        break;
      }
      r -= pool[i].weight;
    }
  }
  return result;
}

/**
 * Відібрати вправи для одного дня: BLOCKED виключено, SAFE вперед, Anti-Repeat A/B, зважений рандом В.
 * @param {Object} options — excludeExerciseIdsByGroup: { [groupLevel2]: Set<exerciseId> }, previousPlanIsolationIds: Set|Array, usageCountByExerciseId: { [id]: number }
 */
async function pickExercisesForDay(dayConfig, userMedConditions, goal, level, gender, options = {}) {
  const excludeByGroup = options.excludeExerciseIdsByGroup || {};
  const prevIsolationIds = options.previousPlanIsolationIds instanceof Set
    ? options.previousPlanIsolationIds
    : new Set(Array.isArray(options.previousPlanIsolationIds) ? options.previousPlanIsolationIds : []);
  const usageCount = options.usageCountByExerciseId || {};

  const exercises = await supabase.getExercisesForPlanByGroupLevel2(dayConfig.muscleGroups);
  const allowed = [];
  for (const ex of exercises) {
    const result = filterExerciseForUser(ex, userMedConditions);
    if (result.status === 'BLOCKED') continue;
    const difficulty = (ex.difficulty || '').toLowerCase();
    if (level === LEVELS.BEGINNER && (difficulty === 'висока' || difficulty === 'высокая')) continue;
    if (level === LEVELS.ADVANCED && (difficulty === 'низька' || difficulty === 'низкая')) continue;
    const vid = (ex.vid || '').toLowerCase();
    const isIsolation = /ізол|изол|изоляц|ізоляц/.test(vid) && vid.indexOf('базов') < 0;
    if (excludeByGroup[ex.groupLevel2] && excludeByGroup[ex.groupLevel2].has(ex.id)) continue;
    if (isIsolation && prevIsolationIds.has(ex.id)) continue;
    if (goal === GOALS.GAIN && isIsolation) {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: 1, _isIsolation: isIsolation });
    } else if (goal === GOALS.LOSE && vid.indexOf('базов') >= 0 && !isIsolation) {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: 1, _isIsolation: isIsolation });
    } else {
      allowed.push({ ...ex, _filterStatus: result.status, _sortOrder: result.status === 'SAFE' ? 0 : 2, _isIsolation: isIsolation });
    }
  }
  allowed.sort((a, b) => a._sortOrder - b._sortOrder);
  const count = Math.min(dayConfig.exerciseCount, allowed.length);
  const weighted = weightedSample(
    allowed,
    count,
    (ex) => (ex._isIsolation ? 1 / ((usageCount[ex.id] || 0) + 1) : 1)
  );
  const fallback = weighted.length < count ? shuffle(allowed).slice(0, count) : weighted;
  const selected = (fallback.length ? fallback : allowed.slice(0, count)).map((ex, idx) => ({
    exerciseId: ex.id,
    exerciseName: ex.name,
    groupLevel2: ex.groupLevel2 || '',
    orderInDay: idx + 1,
    medicalStatus: ex._filterStatus === 'SAFE' ? 'SAFE' : ex._filterStatus === 'ALLOWED_WITH_MOD' ? 'ALLOWED_WITH_MOD' : 'NEUTRAL',
    modificationNotes: ex._filterStatus === 'ALLOWED_WITH_MOD' ? (ex.modifications || '') : null
  }));
  return selected;
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

  const { splitScheme, dayConfigs } = getSplitSchemeAndDays(level, daysPerWeek, gender);
  if (!dayConfigs.length) return null;

  const userMedConditions = await supabase.getActiveMedicalConditions(studentChatId);
  const { sets, reps, restSec } = getSetsRepsRest(goal, level);
  const previousPlanIsolationIds = await supabase.getPreviousPlanIsolationExerciseIds(studentChatId);
  const usageCountByExerciseId = await supabase.getExerciseUsageCountForStudent(studentChatId);
  const alreadyPickedByGroup = {};

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
    generationType: 'auto',
    revisionWeeks: options.revisionWeeks,
    parentPlanId: options.parentPlanId || null
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
    const excludeExerciseIdsByGroup = {};
    for (const g of dayConfig.muscleGroups) {
      excludeExerciseIdsByGroup[g] = alreadyPickedByGroup[g] || new Set();
    }
    const dayExercises = await pickExercisesForDay(dayConfig, userMedConditions, goal, level, gender, {
      excludeExerciseIdsByGroup,
      previousPlanIsolationIds,
      usageCountByExerciseId
    });
    for (const ex of dayExercises) {
      const g = ex.groupLevel2 || '';
      if (!g) continue;
      if (!alreadyPickedByGroup[g]) alreadyPickedByGroup[g] = new Set();
      alreadyPickedByGroup[g].add(ex.exerciseId);
    }
    let notesByExercise = null;
    if (dayExercises.length > 0) {
      const entityId = planId + '_d' + dayConfig.dayNumber;
      if (process.env.DEBUG === '1') {
        console.log('[planGenerator] Calling AI for day ' + dayConfig.dayNumber + ', entityId=' + entityId + ', exercises=' + dayExercises.length);
      }
      notesByExercise = await planCommentsAI.generatePlanComments(
        profileForAI,
        dayExercises.map((ex) => ({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, medicalStatus: ex.medicalStatus, sets, reps })),
        dayConfig.dayType,
        entityId
      );
      if (process.env.DEBUG === '1') {
        if (notesByExercise) {
          const commentCount = Object.keys(notesByExercise).filter(k => k !== 'day_summary').length;
          console.log('[planGenerator] AI returned comments for day ' + dayConfig.dayNumber + ': ' + commentCount + ' exercises');
        } else {
          console.log('[planGenerator] AI plan comments: null for day ' + dayConfig.dayNumber + ' (AI disabled or API error)');
        }
      }
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
      if (process.env.DEBUG === '1' && notes) {
        console.log('[planGenerator] Saving notes for exercise ' + ex.exerciseId + ' (' + ex.exerciseName + '): ' + notes.substring(0, 50) + '...');
      }
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
