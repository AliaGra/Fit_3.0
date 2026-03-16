/**
 * Профіль активності — розрахунок рівня та NEAT з відповідей користувача.
 * 4 питання (робота, транспорт, кроки, додаткова активність) → score → activity_level, neat_coefficient.
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

/**
 * Розрахунок activity_level та neat_coefficient з відповідей.
 * @param {Object} activityData - { jobType, transport, steps, extraActivity }
 * @returns {{ level: string, coefficient: number }}
 */
function calcNEATCoefficient(activityData) {
  let score = 0;
  score += JOB_SCORES[activityData.jobType] ?? 0;
  score += TRANSPORT_SCORES[activityData.transport] ?? 0;
  score += STEPS_SCORES[activityData.steps] ?? 0;
  score += EXTRA_SCORES[activityData.extraActivity] ?? 0;

  if (score <= 1) return { level: 'sedentary', coefficient: 1.20 };
  if (score <= 3) return { level: 'light', coefficient: 1.30 };
  if (score <= 5) return { level: 'moderate', coefficient: 1.375 };
  if (score <= 7) return { level: 'active', coefficient: 1.55 };
  return { level: 'very_active', coefficient: 1.725 };
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
 * @returns {{ level: string, coefficient: number }}
 */
function levelFromStepsOnly(steps) {
  const cat = stepsToCategory(steps);
  const scores = { under_5k: 0, '5k_10k': 1, '10k_15k': 2, over_15k: 3 };
  const score = scores[cat] ?? 0;
  if (score <= 0) return { level: 'sedentary', coefficient: 1.20 };
  if (score <= 1) return { level: 'light', coefficient: 1.30 };
  if (score <= 2) return { level: 'active', coefficient: 1.55 };
  return { level: 'very_active', coefficient: 1.725 };
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

module.exports = {
  calcNEATCoefficient,
  stepsToCategory,
  levelFromStepsOnly,
  getActivityLevelLabelUA,
  JOB_SCORES,
  TRANSPORT_SCORES,
  STEPS_SCORES,
  EXTRA_SCORES
};
