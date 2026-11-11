/**
 * Профіль активності — розрахунок рівня та NEAT з відповідей користувача.
 * 4 питання (робота, транспорт, кроки, додаткова активність) → score → activity_level, neat_coefficient.
 * Публічна шкала для UI: 1 (мін) … 5 (макс), пороги ті самі, що для level.
 */

const JOB_SCORES = Object.freeze({
  office_sitting: 0,
  office_mixed: 1,
  standing: 2,
  physical: 3
});

const TRANSPORT_SCORES = Object.freeze({
  car_transit: 0,
  combined: 1,
  walk_bike: 2
});

const STEPS_SCORES = Object.freeze({
  under_5k: 0,
  '5k_10k': 1,
  '10k_15k': 2,
  over_15k: 3
});

const EXTRA_SCORES = Object.freeze({
  none: 0,
  light: 1,
  moderate: 2,
  intense: 3
});

const JOB_LABELS_UA = Object.freeze({
  office_sitting: 'Сиджу за комп\'ютером весь день',
  office_mixed: 'Переважно сиджу, але є пересування',
  standing: 'Весь день на ногах',
  physical: 'Фізична праця'
});

const TRANSPORT_LABELS_UA = Object.freeze({
  car_transit: 'Машина / транспорт сидячи',
  walk_bike: 'Пішки або велосипед 20+ хв',
  combined: 'Комбіновано'
});

const STEPS_LABELS_UA = Object.freeze({
  under_5k: 'Менше 5 000',
  '5k_10k': '5 000 – 10 000',
  '10k_15k': '10 000 – 15 000',
  over_15k: 'Більше 15 000'
});

const EXTRA_LABELS_UA = Object.freeze({
  none: 'Ні',
  light: 'Легка (прогулянки, йога)',
  moderate: 'Помірна (танці, велосипед)',
  intense: 'Інтенсивна (біг, ігри)'
});

/** Бал 1–5 ↔ activity_level (пороги score без змін). */
const ACTIVITY_SCORE_BY_LEVEL = Object.freeze({
  sedentary: 1,
  light: 2,
  moderate: 3,
  active: 4,
  very_active: 5
});

const ACTIVITY_SCORE_LABELS_UA = Object.freeze({
  1: 'мінімальна',
  2: 'низька',
  3: 'помірна',
  4: 'висока',
  5: 'максимальна'
});

/**
 * Розрахунок activity_level та neat_coefficient з відповідей.
 * @param {Object} activityData - { jobType, transport, steps, extraActivity }
 * @returns {{ level: string, coefficient: number, rawScore: number, score: number }}
 */
function calcNEATCoefficient(activityData) {
  let rawScore = 0;
  rawScore += JOB_SCORES[activityData.jobType] ?? 0;
  rawScore += TRANSPORT_SCORES[activityData.transport] ?? 0;
  rawScore += STEPS_SCORES[activityData.steps] ?? 0;
  rawScore += EXTRA_SCORES[activityData.extraActivity] ?? 0;

  let level;
  let coefficient;
  if (rawScore <= 1) {
    level = 'sedentary';
    coefficient = 1.2;
  } else if (rawScore <= 3) {
    level = 'light';
    coefficient = 1.3;
  } else if (rawScore <= 5) {
    level = 'moderate';
    coefficient = 1.375;
  } else if (rawScore <= 7) {
    level = 'active';
    coefficient = 1.55;
  } else {
    level = 'very_active';
    coefficient = 1.725;
  }
  return {
    level,
    coefficient,
    rawScore,
    score: ACTIVITY_SCORE_BY_LEVEL[level]
  };
}

/**
 * Визначити steps_category за числом кроків (трекер).
 * @param {number} steps
 * @returns {string}
 */
function stepsToCategory(steps) {
  if (steps == null || isNaN(steps)) return 'under_5k';
  if (steps < 5000) return 'under_5k';
  if (steps < 10000) return '5k_10k';
  if (steps < 15000) return '10k_15k';
  return 'over_15k';
}

/**
 * Рівень тільки з кроків (варіант Б — є трекер).
 * @param {number} steps
 * @returns {{ level: string, coefficient: number, score: number }}
 */
function levelFromStepsOnly(steps) {
  const cat = stepsToCategory(steps);
  const scores = { under_5k: 0, '5k_10k': 1, '10k_15k': 2, over_15k: 3 };
  const score = scores[cat] ?? 0;
  let level;
  let coefficient;
  if (score <= 0) {
    level = 'sedentary';
    coefficient = 1.2;
  } else if (score <= 1) {
    level = 'light';
    coefficient = 1.3;
  } else if (score <= 2) {
    level = 'active';
    coefficient = 1.55;
  } else {
    level = 'very_active';
    coefficient = 1.725;
  }
  return { level, coefficient, score: ACTIVITY_SCORE_BY_LEVEL[level] };
}

const ACTIVITY_LEVEL_LABELS_UA = Object.freeze({
  sedentary: 'сидячий',
  light: 'легка',
  moderate: 'помірна',
  active: 'активна',
  very_active: 'дуже активна'
});

function getActivityLevelLabelUA(level) {
  return ACTIVITY_LEVEL_LABELS_UA[level] || level || '—';
}

function getActivityScoreFromLevel(level) {
  if (!level) return null;
  const n = ACTIVITY_SCORE_BY_LEVEL[String(level).toLowerCase()];
  return n != null ? n : null;
}

function getActivityScoreLabelUA(score) {
  return ACTIVITY_SCORE_LABELS_UA[score] || '—';
}

/**
 * Бал 1–5 з user (activityLevel або перерахунок з відповідей).
 * @returns {number|null}
 */
function getActivityScoreFromUser(user) {
  if (!user) return null;
  const fromLevel = getActivityScoreFromLevel(user.activityLevel);
  if (fromLevel != null) return fromLevel;
  if (user.jobType || user.transportType || user.stepsCategory || user.extraActivity) {
    const calc = calcNEATCoefficient({
      jobType: user.jobType,
      transport: user.transportType,
      steps: user.stepsCategory,
      extraActivity: user.extraActivity
    });
    return calc.score;
  }
  return null;
}

function formatActivityButtonText(user, baseLabel = '🏃 Активність') {
  const score = getActivityScoreFromUser(user);
  if (score == null) return baseLabel;
  return String(baseLabel + ': ' + score + '/5').slice(0, 64);
}

/**
 * Текст екрана вкладки «Активність» з поточним балом.
 */
function formatActivityHubText(user, options = {}) {
  const title = options.title || '🏃 Активність';
  const score = getActivityScoreFromUser(user);
  const lines = [title, ''];
  if (score == null) {
    lines.push('Поточний рівень: ще не вказано (шкала 1–5).');
    lines.push('');
    lines.push('Відповіси на 4 короткі питання — отримаєш бал для планів і цілей.');
  } else {
    const label = getActivityScoreLabelUA(score);
    lines.push('Поточний рівень: ' + score + ' з 5 — ' + label + '.');
    if (user && user.neatCoefficient != null) {
      lines.push('NEAT ×' + user.neatCoefficient);
    }
    lines.push('');
    lines.push('Робота: ' + (JOB_LABELS_UA[user.jobType] || '—'));
    lines.push('Транспорт: ' + (TRANSPORT_LABELS_UA[user.transportType] || '—'));
    lines.push('Кроки: ' + (STEPS_LABELS_UA[user.stepsCategory] || '—'));
    lines.push('Поза залом: ' + (EXTRA_LABELS_UA[user.extraActivity] || '—'));
  }
  return lines.join('\n');
}

function formatActivitySavedMessage(user, options = {}) {
  const prefix = options.forClient ? '✅ Активність клієнта збережено.' : '✅ Активність збережено.';
  const score = getActivityScoreFromUser(user);
  if (score == null) return prefix;
  return prefix + ' Рівень: ' + score + '/5 — ' + getActivityScoreLabelUA(score) + '.';
}

function formatActivityLineForCard(user) {
  const score = getActivityScoreFromUser(user);
  if (score == null && !(user && user.activityLevel)) {
    return '🏃 Активність: не вказано';
  }
  if (score != null) {
    let line = '🏃 Активність: ' + score + '/5 — ' + getActivityScoreLabelUA(score);
    if (user && user.neatCoefficient != null) line += ' (NEAT ×' + user.neatCoefficient + ')';
    return line;
  }
  const levelLabel = getActivityLevelLabelUA(user.activityLevel);
  return (
    '🏃 Активність: ' +
    levelLabel +
    (user.neatCoefficient != null ? ' (NEAT ×' + user.neatCoefficient + ')' : '')
  );
}

module.exports = {
  calcNEATCoefficient,
  stepsToCategory,
  levelFromStepsOnly,
  getActivityLevelLabelUA,
  getActivityScoreFromLevel,
  getActivityScoreFromUser,
  getActivityScoreLabelUA,
  formatActivityButtonText,
  formatActivityHubText,
  formatActivitySavedMessage,
  formatActivityLineForCard,
  JOB_SCORES,
  TRANSPORT_SCORES,
  STEPS_SCORES,
  EXTRA_SCORES,
  JOB_LABELS_UA,
  TRANSPORT_LABELS_UA,
  STEPS_LABELS_UA,
  EXTRA_LABELS_UA,
  ACTIVITY_SCORE_BY_LEVEL,
  ACTIVITY_SCORE_LABELS_UA,
  ACTIVITY_LEVEL_LABELS_UA
};
