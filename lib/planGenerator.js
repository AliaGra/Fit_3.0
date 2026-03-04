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
      for (let i = 1; i <= d; i++) {
        dayConfigs.push({
          dayNumber: i,
          dayType: 'full_body',
          dayLabelUA: 'Повне тіло',
          muscleGroups,
          exerciseCount: getExerciseCountForDay('full_body', level)
        });
      }
      return { splitScheme: 'full_body', dayConfigs };
    }
  }

  if (level === LEVELS.INTERMEDIATE) {
    if (d === 3) {
      const upperGroups = isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'];
      const lowerGroups = isFemale ? ['Ноги', 'Сідниці', 'Прес'] : ['Ноги', 'Сідниці', 'Прес'];
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх тіла', muscleGroups: upperGroups, exerciseCount: getExerciseCountForDay('upper', level) },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ тіла', muscleGroups: lowerGroups, exerciseCount: getExerciseCountForDay('lower', level) },
        { dayNumber: 3, dayType: 'full_body', dayLabelUA: 'Повне тіло', muscleGroups: isFemale ? ['Ноги', 'Сідниці', 'Спина', 'Груди', 'Прес'] : ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'], exerciseCount: getExerciseCountForDay('full_body', level) }
      );
      return { splitScheme: 'upper_lower_full', dayConfigs };
    }
    if (d === 4) {
      const upperGroups = isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'];
      const lowerGroups = ['Ноги', 'Сідниці', 'Прес'];
      dayConfigs.push(
        { dayNumber: 1, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: upperGroups, exerciseCount: getExerciseCountForDay('upper', level) },
        { dayNumber: 2, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: lowerGroups, exerciseCount: getExerciseCountForDay('lower', level) },
        { dayNumber: 3, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: upperGroups, exerciseCount: getExerciseCountForDay('upper', level) },
        { dayNumber: 4, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: lowerGroups, exerciseCount: getExerciseCountForDay('lower', level) }
      );
      return { splitScheme: 'upper_lower', dayConfigs };
    }
  }

  if (level === LEVELS.ADVANCED) {
    if (d === 4) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'push', dayLabelUA: 'Push', muscleGroups: ['Груди', 'Плечі', 'Руки'], exerciseCount: getExerciseCountForDay('push', level) },
        { dayNumber: 2, dayType: 'pull', dayLabelUA: 'Pull', muscleGroups: ['Спина', 'Руки'], exerciseCount: getExerciseCountForDay('pull', level) },
        { dayNumber: 3, dayType: 'legs', dayLabelUA: 'Legs', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: getExerciseCountForDay('legs', level) },
        { dayNumber: 4, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: isFemale ? ['Спина', 'Плечі', 'Груди', 'Руки'] : ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: getExerciseCountForDay('upper', level) }
      );
      return { splitScheme: 'ppl_upper', dayConfigs };
    }
    if (d === 5) {
      dayConfigs.push(
        { dayNumber: 1, dayType: 'push', dayLabelUA: 'Push', muscleGroups: ['Груди', 'Плечі', 'Руки'], exerciseCount: getExerciseCountForDay('push', level) },
        { dayNumber: 2, dayType: 'pull', dayLabelUA: 'Pull', muscleGroups: ['Спина', 'Руки'], exerciseCount: getExerciseCountForDay('pull', level) },
        { dayNumber: 3, dayType: 'legs', dayLabelUA: 'Legs', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: getExerciseCountForDay('legs', level) },
        { dayNumber: 4, dayType: 'upper', dayLabelUA: 'Верх', muscleGroups: ['Спина', 'Груди', 'Плечі', 'Руки'], exerciseCount: getExerciseCountForDay('upper', level) },
        { dayNumber: 5, dayType: 'lower', dayLabelUA: 'Низ', muscleGroups: ['Ноги', 'Сідниці', 'Прес'], exerciseCount: getExerciseCountForDay('lower', level) }
      );
      return { splitScheme: 'ppl_upper_lower', dayConfigs };
    }
  }

  return { splitScheme: 'full_body', dayConfigs: [{ dayNumber: 1, dayType: 'full_body', dayLabelUA: 'Повне тіло', muscleGroups: ['Спина', 'Груди', 'Ноги', 'Прес', 'Плечі', 'Сідниці'], exerciseCount: 6 }] };
}

/** Діапазон кількості вправ на день за типом дня та рівнем (таблиця 4.4 Логіки). */
const EXERCISE_COUNT_RANGE = Object.freeze({
  full_body: { beginner: [5, 6], intermediate: [6, 7], advanced: [7, 8] },
  upper_lower: { beginner: [4, 5], intermediate: [5, 6], advanced: [6, 7] },
  ppl: { intermediate: [5, 6], advanced: [6, 8] }
});

function getExerciseCountForDay(dayType, level) {
  const typeKey = dayType === 'full_body' ? 'full_body' : (dayType === 'push' || dayType === 'pull' || dayType === 'legs' ? 'ppl' : 'upper_lower');
  const range = EXERCISE_COUNT_RANGE[typeKey] && EXERCISE_COUNT_RANGE[typeKey][level];
  if (range) {
    const [min, max] = range;
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  return 6;
}

/** sets, reps, rest_sec за ціллю та рівнем (таблиці 4.3, 4.4). При mcStatus === 'ALLOWED_WITH_MOD' — sets зменшуємо на 1 (мін. 1). */
function getSetsRepsRest(goal, level, vid, mcStatus) {
  const g = goal || GOALS.KEEP;
  let sets = 3;
  let reps = '10–15';
  let restSec = 75;

  if (g === GOALS.LOSE) {
    sets = 3;
    reps = '15–20';
    restSec = level === LEVELS.BEGINNER ? 90 : 60;
  } else if (g === GOALS.GAIN) {
    sets = level === LEVELS.BEGINNER ? 3 : 4;
    reps = level === LEVELS.BEGINNER ? '12–15' : '6–10';
    restSec = level === LEVELS.ADVANCED ? 60 : 90;
  }

  if ((mcStatus || '').toUpperCase() === 'ALLOWED_WITH_MOD') {
    sets = Math.max(1, sets - 1);
  }
  return { sets, reps, restSec };
}

/** Клас ожиріння MC018 за severity у медпрофілі (1, 2, 3 або null). */
function getMc018Class(userMedConditions) {
  if (!Array.isArray(userMedConditions)) return null;
  const mc = userMedConditions.find((m) => (m.mc_code || '').toUpperCase() === 'MC018');
  if (!mc) return null;
  const s = (mc.severity || '').toLowerCase();
  if (s.indexOf('class1') >= 0 || s === 'class1') return 1;
  if (s.indexOf('class2') >= 0 || s === 'class2') return 2;
  if (s.indexOf('class3') >= 0 || s === 'class3') return 3;
  return 1;
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
 * options: excludeExerciseIdsByGroup, previousPlanIsolationIds, usageCountByExerciseId, mc018Class.
 */
async function pickExercisesForDay(dayConfig, userMedConditions, goal, level, gender, options = {}) {
  const excludeByGroup = options.excludeExerciseIdsByGroup || {};
  let effectivePrevIds = options.previousPlanIsolationIds instanceof Set
    ? options.previousPlanIsolationIds
    : new Set(Array.isArray(options.previousPlanIsolationIds) ? options.previousPlanIsolationIds : []);
  const usageCount = options.usageCountByExerciseId || {};
  const mc018Class = options.mc018Class;
  const g = (gender || '').toLowerCase();
  const isFemale = g === 'female' || g === 'ж' || g === 'жінка';

  const exercises = await supabase.getExercisesForPlanByGroupLevel2(dayConfig.muscleGroups);

  function buildAllowed(prevIsolationIds) {
    const list = [];
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
      if (mc018Class != null) {
        const name = ((ex.name || '') + ' ' + (ex.name_ua || '') + ' ' + (ex.name_ru || '')).toLowerCase();
        const equip = (ex.equipment || '').toLowerCase();
        if (mc018Class >= 2 && (equip.indexOf('штанга') >= 0 || name.indexOf('штанга') >= 0) && (name.indexOf('стоя') >= 0 || name.indexOf('присідання') >= 0)) continue;
        if (mc018Class >= 3) {
          if (/стриб|прыжок|стрибок/.test(name)) continue;
          const sittingOrLying = /лежачи|сидячи|в тренажері|тренажер|на тренажері/.test(name);
          if (!sittingOrLying) continue;
        }
      }
      if (isFemale && goal !== GOALS.GAIN && (ex.groupLevel2 || '') === 'Груди') {
        const equip = (ex.equipment || '').toString().toLowerCase();
        const name = (ex.name || '').toLowerCase();
        const isHeavyChest = vid.indexOf('базов') >= 0 || equip.indexOf('штанга') >= 0 || name.indexOf('штанга') >= 0
          || name.indexOf('жим лежачи') >= 0 || name.indexOf('жим штанги') >= 0 || name.indexOf('жим лежа') >= 0 || name.indexOf('жим лёжа') >= 0;
        if (isHeavyChest) continue;
      }
      if (goal === GOALS.GAIN && isIsolation) {
        list.push({ ...ex, _filterStatus: result.status, _sortOrder: 1, _isIsolation: isIsolation });
      } else if (goal === GOALS.LOSE && vid.indexOf('базов') >= 0 && !isIsolation) {
        list.push({ ...ex, _filterStatus: result.status, _sortOrder: 1, _isIsolation: isIsolation });
      } else {
        list.push({ ...ex, _filterStatus: result.status, _sortOrder: result.status === 'SAFE' ? 0 : 2, _isIsolation: isIsolation });
      }
    }
    list.sort((a, b) => a._sortOrder - b._sortOrder);
    return list;
  }

  let allowed = buildAllowed(effectivePrevIds);
  const targetCount = dayConfig.exerciseCount;
  if (allowed.length < targetCount && effectivePrevIds.size > 0) {
    effectivePrevIds = new Set();
    allowed = buildAllowed(effectivePrevIds);
    if (process.env.DEBUG === '1') {
      console.log('[planGenerator] Fallback: rule B relaxed for day', dayConfig.dayNumber);
    }
  }

  const count = Math.min(targetCount, allowed.length);
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
 * Побудувати splitConfig з урахуванням акценту та уникнення (ТЗ_Акцент_зони).
 * Повертає масив { day_number, day_label, muscle_groups, is_accent_day }.
 */
function generateSplitWithAccent(daysPerWeek, accentZones, avoidZones, gender, level) {
  const { ACCENT_MAP, ACCENT_DAYS_COUNT } = require('./constants');
  const levelForCount = level || LEVELS.BEGINNER;
  const base = getSplitSchemeAndDays(levelForCount, daysPerWeek, gender);
  const accentDays = (accentZones || []).includes('full') ? 0 : (ACCENT_DAYS_COUNT[daysPerWeek] || 1);
  const accentGroups = (accentZones || [])
    .filter((z) => z !== 'full')
    .flatMap((z) => ACCENT_MAP[z] || []);
  const avoidGroups = (avoidZones || []).flatMap((z) => ACCENT_MAP[z] || []);

  return (base.dayConfigs || []).map((day, index) => {
    const isAccentDay = index < accentDays;
    let groups = [...(day.muscleGroups || [])];

    if (isAccentDay && accentGroups.length > 0) {
      accentGroups.forEach((g) => {
        if (!groups.includes(g)) groups.unshift(g);
      });
      groups = groups.slice(0, 4);
    }

    groups = groups.filter((g) => !avoidGroups.includes(g));

    if (groups.length === 0) {
      groups = ['Прес'];
    }

    return {
      day_number: day.dayNumber,
      day_label: day.dayLabelUA || ('День ' + day.dayNumber),
      muscle_groups: groups,
      is_accent_day: isAccentDay,
      exercise_count: day.exerciseCount != null ? day.exerciseCount : getExerciseCountForDay(day.dayType || 'full_body', levelForCount)
    };
  });
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

  let splitScheme;
  let dayConfigs;
  if (options.splitConfig && Array.isArray(options.splitConfig) && options.splitConfig.length > 0) {
    const base = getSplitSchemeAndDays(level, daysPerWeek, gender);
    splitScheme = base.splitScheme;
    const baseByDay = (base.dayConfigs || []).reduce((acc, d) => { acc[d.dayNumber] = d; return acc; }, {});
    dayConfigs = options.splitConfig.map((sc) => {
      const baseDay = baseByDay[sc.day_number];
      return {
        dayNumber: sc.day_number,
        dayType: baseDay?.dayType || 'full_body',
        dayLabelUA: sc.day_label,
        muscleGroups: sc.muscle_groups || [],
        exerciseCount: baseDay?.exerciseCount || getExerciseCountForDay('full_body', level)
      };
    });
  } else {
    const base = getSplitSchemeAndDays(level, daysPerWeek, gender);
    splitScheme = base.splitScheme;
    dayConfigs = base.dayConfigs;
  }
  if (!dayConfigs.length) return null;

  const countOverride = options.exerciseCountPerDay != null && options.exerciseCountPerDay >= 4 && options.exerciseCountPerDay <= 10
    ? options.exerciseCountPerDay
    : null;
  if (countOverride != null) {
    dayConfigs.forEach((d) => { d.exerciseCount = countOverride; });
  }

  const userMedConditions = await supabase.getActiveMedicalConditions(studentChatId);
  const defaultSr = getSetsRepsRest(goal, level);
  const previousPlanIsolationIds = await supabase.getPreviousPlanIsolationExerciseIds(studentChatId);
  const usageCountByExerciseId = await supabase.getExerciseUsageCountForStudent(studentChatId);
  const mc018Class = getMc018Class(userMedConditions);
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
    parentPlanId: options.parentPlanId || null,
    accentZones: options.accentZones || [],
    avoidZones: options.avoidZones || [],
    splitConfig: options.splitConfig || []
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
      usageCountByExerciseId,
      mc018Class
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
        dayExercises.map((ex) => {
          const sr = getSetsRepsRest(goal, level, null, ex.medicalStatus);
          return { exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, medicalStatus: ex.medicalStatus, sets: sr.sets, reps: sr.reps };
        }),
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
      const sr = getSetsRepsRest(goal, level, null, ex.medicalStatus);
      await supabase.insertTrainingPlanExercise({
        planId,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        dayNumber: dayConfig.dayNumber,
        dayLabel: dayConfig.dayLabelUA,
        orderInDay: ex.orderInDay,
        sets: sr.sets,
        reps: sr.reps,
        restSec: sr.restSec,
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

/**
 * Авто-ревізія плану (Логіка 9.4.4, ТЗ 9.4): ротація 30–50% ізоляційних вправ, базові не міняються.
 * Повертає { newPlanId, studentId, revisionWeeks } або null при помилці.
 */
async function generatePlanRevision(planId) {
  const plan = await supabase.getPlanWithExercises(planId);
  if (!plan || !plan.exercises || !plan.exercises.length) return null;

  const studentChatId = plan.studentId;
  if (!studentChatId) return null;

  const withVid = await supabase.getPlanExerciseIdsWithVid(planId);
  const vidByExId = {};
  for (const x of withVid) {
    if (x.exerciseId != null) vidByExId[x.exerciseId] = { groupLevel2: x.groupLevel2 || '', vid: (x.vid || '').toLowerCase() };
  }

  const isIsolation = (exId) => {
    const v = vidByExId[exId];
    if (!v) return false;
    return /ізол|изол|изоляц|ізоляц/.test(v.vid) && v.vid.indexOf('базов') < 0;
  };

  const userMedConditions = await supabase.getActiveMedicalConditions(studentChatId);
  const goal = (plan.goal || GOALS.KEEP).toLowerCase();
  const level = (plan.level || 'beginner').toLowerCase();

  const exercisesByDay = {};
  for (const ex of plan.exercises) {
    const d = ex.dayNumber != null ? ex.dayNumber : 1;
    if (!exercisesByDay[d]) exercisesByDay[d] = [];
    exercisesByDay[d].push({ ...ex, _isIsolation: isIsolation(ex.exerciseId) });
  }

  const replacementMap = {};
  const dayConfigs = getSplitSchemeAndDays(level, plan.daysPerWeek || 3, '').dayConfigs || [];
  const usedInNewPlanByGroup = {};

  for (const dayNum of Object.keys(exercisesByDay).map(Number).sort((a, b) => a - b)) {
    const dayExs = exercisesByDay[dayNum];
    const isolationIndices = dayExs
      .map((ex, idx) => (ex._isIsolation ? idx : -1))
      .filter((i) => i >= 0);
    const replaceCount = Math.max(0, Math.min(isolationIndices.length, Math.ceil(isolationIndices.length * 0.4) || (isolationIndices.length >= 1 ? 1 : 0)));
    const toReplace = shuffle([...isolationIndices]).slice(0, replaceCount);

    for (const idx of toReplace) {
      const ex = dayExs[idx];
      const info = vidByExId[ex.exerciseId];
      const groupLevel2 = info ? info.groupLevel2 : '';
      if (!groupLevel2) continue;

      const excludeIds = new Set([ex.exerciseId]);
      if (usedInNewPlanByGroup[groupLevel2]) usedInNewPlanByGroup[groupLevel2].forEach((id) => excludeIds.add(id));

      const candidates = await supabase.getExercisesForPlanByGroupLevel2([groupLevel2]);
      const allowed = [];
      for (const c of candidates || []) {
        if (excludeIds.has(c.id)) continue;
        const res = filterExerciseForUser(c, userMedConditions);
        if (res.status === 'BLOCKED') continue;
        allowed.push(c);
      }
      if (allowed.length > 0) {
        const replacement = shuffle(allowed)[0];
        replacementMap[dayNum + '_' + idx] = {
          exerciseId: replacement.id,
          exerciseName: replacement.name || replacement.name_ua || 'Вправа',
          medicalStatus: filterExerciseForUser(replacement, userMedConditions).status === 'SAFE' ? 'SAFE' : 'ALLOWED_WITH_MOD'
        };
        if (!usedInNewPlanByGroup[groupLevel2]) usedInNewPlanByGroup[groupLevel2] = new Set();
        usedInNewPlanByGroup[groupLevel2].add(replacement.id);
      }
    }
  }

  const revisionWeeks = plan.revisionWeeks != null ? plan.revisionWeeks : (supabase.REVISION_WEEKS_BY_LEVEL && supabase.REVISION_WEEKS_BY_LEVEL[level]) || 6;
  const newPlanId = await supabase.insertTrainingPlan({
    coachId: plan.coachId || null,
    studentId: studentChatId,
    planName: (plan.planName || 'План') + ' (оновлено)',
    goal: plan.goal || 'keep',
    level: plan.level || 'beginner',
    splitScheme: plan.splitScheme || null,
    daysPerWeek: plan.daysPerWeek,
    description: 'Авто-ревізія плану',
    isActive: false,
    isTemplate: false,
    generationType: 'auto_revision',
    revisionWeeks,
    parentPlanId: planId
  });
  if (!newPlanId) return null;

  let replacedCount = 0;
  for (const dayNum of Object.keys(exercisesByDay).map(Number).sort((a, b) => a - b)) {
    const dayExs = exercisesByDay[dayNum];
    const dayLabel = (dayConfigs.find((d) => d.dayNumber === dayNum) || {}).dayLabelUA || ('День ' + dayNum);
    for (let idx = 0; idx < dayExs.length; idx++) {
      const ex = dayExs[idx];
      const key = dayNum + '_' + idx;
      const repl = replacementMap[key];
      if (repl) {
        await supabase.insertTrainingPlanExercise({
          planId: newPlanId,
          exerciseId: repl.exerciseId,
          exerciseName: repl.exerciseName,
          dayNumber: dayNum,
          dayLabel,
          orderInDay: idx + 1,
          sets: ex.sets,
          reps: ex.reps,
          restSec: ex.restSec,
          notes: null,
          medicalStatus: repl.medicalStatus,
          progressionType: 'weight',
          targetWeight: null
        });
        replacedCount++;
      } else {
        await supabase.insertTrainingPlanExercise({
          planId: newPlanId,
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          dayNumber: dayNum,
          dayLabel: ex.dayLabel || dayLabel,
          orderInDay: idx + 1,
          sets: ex.sets,
          reps: ex.reps,
          restSec: ex.restSec,
          notes: ex.notes,
          medicalStatus: ex.medicalStatus || 'NEUTRAL',
          progressionType: ex.progressionType || 'weight',
          targetWeight: ex.targetWeight
        });
      }
    }
  }

  const ok = await supabase.setPlanActiveForStudent(newPlanId, studentChatId);
  if (!ok) {
    console.error('planGenerator generatePlanRevision: setPlanActiveForStudent failed', newPlanId);
  }
  await supabase.insertPlanAdjustment({
    planId,
    newPlanId,
    adjustmentType: 'auto_revision',
    details: { replacedCount }
  });
  await supabase.markPlanRevisionReminderSent(planId);

  return { newPlanId, studentId: studentChatId, revisionWeeks };
}

const DIFFICULTY_BY_LEVEL = Object.freeze({
  beginner: ['низька', 'початківець', 'низкая', 'начальный'],
  intermediate: ['низька', 'середня', 'низкая', 'средняя'],
  advanced: ['середня', 'висока', 'складна', 'средняя', 'высокая', 'сложная']
});

/**
 * Підбір кандидатів для однієї фази прогресивного плану (ТЗ 4.1).
 * @param {Array<{ day_number: number, day_label: string, muscle_groups: string[], exercise_count: number }>} dayConfigs
 * @param {string} phase — 'A' | 'B' | 'C'
 * @param {Map<string, Set<number>>} usedByGroup — для B/C: group_level2 → Set(exercise_id) ізоляційних з попередніх фаз
 * @param {{ goal: string, level: string, gender: string, userMedConditions: Array }} userProfile
 * @returns {Promise<Array<{ day_number: number, day_label: string, slots: Array<{ candidates: Array<{ id: number, name_ua: string, vid?: string, difficulty?: string, group_level2: string, medical_status?: string }> }> }>>}
 */
async function pickCandidatesForPhase(dayConfigs, phase, usedByGroup, userProfile) {
  const level = (userProfile.level || LEVELS.BEGINNER).toLowerCase();
  const goal = (userProfile.goal || GOALS.KEEP).toLowerCase();
  const allowedDiff = DIFFICULTY_BY_LEVEL[level] || DIFFICULTY_BY_LEVEL.beginner;
  const userMedConditions = userProfile.userMedConditions || [];
  const isPhaseBOrC = phase === 'B' || phase === 'C';

  const result = [];
  for (const day of dayConfigs || []) {
    const muscleGroups = day.muscle_groups || day.muscleGroups || [];
    const exerciseCount = day.exercise_count != null ? day.exercise_count : (day.exerciseCount != null ? day.exerciseCount : 5);
    if (!muscleGroups.length) {
      result.push({ day_number: day.day_number, day_label: day.day_label || ('День ' + day.day_number), slots: [] });
      continue;
    }

    let exercises = await supabase.getExercisesForPlanByGroupLevel2(muscleGroups);
    const list = [];
    for (const ex of exercises) {
      const filtered = filterExerciseForUser(ex, userMedConditions);
      if (filtered.status === 'BLOCKED') continue;
      const difficulty = (ex.difficulty || '').toLowerCase();
      const diffOk = allowedDiff.some((d) => difficulty.includes(d));
      if (!diffOk) continue;
      const vid = (ex.vid || '').toLowerCase();
      const isIsolation = /ізол|изол|изоляц|ізоляц/.test(vid) && vid.indexOf('базов') < 0;
      if (isPhaseBOrC && usedByGroup && isIsolation && ex.groupLevel2) {
        const used = usedByGroup.get(ex.groupLevel2);
        if (used && used.has(ex.id)) continue;
      }
      list.push({
        ...ex,
        _filterStatus: filtered.status,
        _sortOrder: filtered.status === 'SAFE' ? 0 : (filtered.status === 'ALLOWED_WITH_MOD' ? 2 : 1),
        _isIsolation: isIsolation
      });
    }
    list.sort((a, b) => a._sortOrder - b._sortOrder);

    const slots = [];
    const slotCount = Math.min(exerciseCount, Math.ceil(list.length / 3) || 1);
    let idx = 0;
    for (let s = 0; s < slotCount; s++) {
      const candidates = [];
      const usedInSlot = new Set();
      for (let c = 0; c < 3 && idx < list.length; c++) {
        const ex = list[idx++];
        if (ex && !usedInSlot.has(ex.id)) {
          usedInSlot.add(ex.id);
          candidates.push({
            id: ex.id,
            name_ua: (ex.name || ex.name_ua || '').toString().slice(0, 100),
            vid: (ex.vid || '').toString().slice(0, 50),
            difficulty: (ex.difficulty || '').toString().slice(0, 30),
            group_level2: (ex.groupLevel2 || '').toString(),
            medical_status: ex._filterStatus === 'SAFE' ? 'SAFE' : (ex._filterStatus === 'ALLOWED_WITH_MOD' ? 'ALLOWED_WITH_MOD' : 'NEUTRAL')
          });
        }
      }
      if (candidates.length) slots.push({ candidates });
    }
    while (slots.length < exerciseCount && list.length > 0) {
      const ex = list[slots.length % list.length];
      slots.push({ candidates: [{ id: ex.id, name_ua: (ex.name || '').toString(), vid: (ex.vid || '').toString(), difficulty: (ex.difficulty || '').toString(), group_level2: (ex.groupLevel2 || '').toString(), medical_status: ex._filterStatus || 'NEUTRAL' }] });
    }
    result.push({
      day_number: day.day_number,
      day_label: day.day_label || ('День ' + day.day_number),
      slots
    });
  }
  return result;
}

function _exerciseNameFromCandidates(phase, dayNumber, exerciseId, candidatesByPhase) {
  const cand = candidatesByPhase && candidatesByPhase[phase];
  if (!Array.isArray(cand)) return 'Вправа';
  const day = cand.find((d) => d.day_number === dayNumber);
  if (!day || !Array.isArray(day.slots)) return 'Вправа';
  for (const slot of day.slots) {
    const list = slot.candidates || [];
    const c = list.find((x) => x.id === exerciseId);
    if (c) return (c.name_ua || c.name || 'Вправа').toString().slice(0, 200);
  }
  return 'Вправа';
}

/**
 * Розгортання результатів фаз по тижнях для INSERT у training_plan_weeks (ТЗ 6).
 * @param {Object} phaseResults — { A: { days: [...] }, B: {...}, C: {...} }
 * @param {number} revisionWeeks
 * @param {number} phaseDuration — тижнів на одну фазу (2|3|4)
 * @param {string} planId — uuid плану
 * @param {{ goal: string, level: string, candidatesByPhase?: Object }} options — getSetsRepsRest + кандидати для імен вправ
 * @returns {Array<Object>} рядки для insertTrainingPlanWeeks
 */
function expandPhasesToWeeks(phaseResults, revisionWeeks, phaseDuration, planId, options = {}) {
  const goal = options.goal || GOALS.KEEP;
  const level = options.level || LEVELS.BEGINNER;
  const defaultSr = getSetsRepsRest(goal, level);
  const candidatesByPhase = options.candidatesByPhase || {};
  const phases = ['A', 'B', 'C'];
  const rows = [];

  for (let week = 1; week <= revisionWeeks; week++) {
    let phaseIndex = Math.floor((week - 1) / phaseDuration);
    phaseIndex = Math.min(phaseIndex, phases.length - 1);
    const phase = phases[phaseIndex];
    const phaseData = phaseResults && phaseResults[phase];
    if (!phaseData || !Array.isArray(phaseData.days)) continue;

    for (const day of phaseData.days) {
      const dayNumber = day.day_number;
      const dayLabel = day.day_label || ('День ' + dayNumber);
      const exercises = day.exercises || [];
      exercises.sort((a, b) => (a.order_in_day || 0) - (b.order_in_day || 0));
      let orderInDay = 1;
      for (const ex of exercises) {
        const exerciseId = ex.chosen_exercise_id;
        const exerciseName = ex.exercise_name || _exerciseNameFromCandidates(phase, dayNumber, exerciseId, candidatesByPhase);
        const sets = defaultSr.sets;
        const reps = defaultSr.reps;
        const restSec = defaultSr.restSec;
        rows.push({
          plan_id: planId,
          week_number: week,
          day_number: dayNumber,
          day_label: dayLabel,
          phase,
          exercise_id: exerciseId,
          exercise_name: exerciseName,
          sets,
          reps: String(reps),
          rest_sec: restSec,
          order_in_day: orderInDay++,
          notes: null,
          ai_reason: (ex.ai_reason || '').slice(0, 300),
          medical_status: 'NEUTRAL',
          target_weight: null
        });
      }
    }
  }
  return rows;
}

module.exports = {
  generateTrainingPlan,
  generatePlanRevision,
  generateSplitWithAccent,
  pickCandidatesForPhase,
  expandPhasesToWeeks,
  getExperienceDays,
  getLevelFromExperienceDays,
  getDefaultDaysPerWeek,
  getSplitSchemeAndDays,
  getSetsRepsRest
};
