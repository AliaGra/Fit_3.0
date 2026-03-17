/**
 * Бажані параметри тіла — валідація, дельта, збереження, тексти для учня/тренера.
 */
const supabase = require('./supabase');
const User = require('./user');

const CHANGE_RATE = Object.freeze({
  WAIST_CM_PER_MONTH: 1.5,
  HIPS_CM_PER_MONTH: 0.8,
  SHOULDERS_CM_PER_MONTH: 0.5,
  CHEST_CM_PER_MONTH: 0.5,
  WEIGHT_KG_PER_MONTH: 2.0
});

function validateGoalField(field, value, heightCm) {
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { valid: false, error: 'Введіть числове значення. Наприклад: 65.0' };
  }
  if (heightCm == null || heightCm <= 0) {
    return { valid: true, value: num };
  }
  const limits = {
    goal_weight: { min: Math.round(heightCm * 0.22), max: Math.round(heightCm * 0.55) },
    goal_waist: { min: Math.round(heightCm * 0.35), max: Math.round(heightCm * 0.65) },
    goal_hips: { min: Math.round(heightCm * 0.45), max: Math.round(heightCm * 0.80) },
    goal_shoulders: { min: Math.round(heightCm * 0.5), max: Math.round(heightCm * 0.85) },
    goal_chest: { min: Math.round(heightCm * 0.45), max: Math.round(heightCm * 0.75) }
  };
  const limit = limits[field];
  if (!limit) return { valid: true, value: num };
  if (num < limit.min || num > limit.max) {
    return {
      valid: false,
      error: 'Значення ' + num + ' виходить за межі для цього зросту. Допустимо: від ' + limit.min + ' до ' + limit.max
    };
  }
  return { valid: true, value: num };
}

const FIELDS_FOR_DELTA = [
  { key: 'weight', goalKey: 'goal_weight', label: 'Вага', unit: 'кг', rate: CHANGE_RATE.WEIGHT_KG_PER_MONTH },
  { key: 'waist', goalKey: 'goal_waist', label: 'Талія', unit: 'см', rate: CHANGE_RATE.WAIST_CM_PER_MONTH },
  { key: 'glutes', goalKey: 'goal_hips', label: 'Ягодиці', unit: 'см', rate: CHANGE_RATE.HIPS_CM_PER_MONTH },
  { key: 'shoulders', goalKey: 'goal_shoulders', label: 'Плечі', unit: 'см', rate: CHANGE_RATE.SHOULDERS_CM_PER_MONTH },
  { key: 'chest', goalKey: 'goal_chest', label: 'Груди', unit: 'см', rate: CHANGE_RATE.CHEST_CM_PER_MONTH }
];

function calcDeltaAndTimeline(current, goals) {
  const result = [];
  for (const f of FIELDS_FOR_DELTA) {
    const currentVal = current[f.key];
    const goalVal = goals[f.goalKey];
    if (currentVal == null || goalVal == null) continue;
    const delta = Math.abs(Math.round((goalVal - currentVal) * 10) / 10);
    const months = Math.ceil(delta / f.rate);
    const reached = delta < 0.5;
    const direction = f.key === 'weight'
      ? (goals.goal_weight < currentVal ? 'знизити' : 'набрати')
      : (goalVal > currentVal ? 'збільшити' : 'зменшити');
    result.push({
      label: f.label,
      current: currentVal,
      goal: goalVal,
      delta,
      direction,
      months,
      reached,
      unit: f.unit
    });
  }
  return result;
}

function formatGoalsSummaryForStudent(deltaItems) {
  if (!deltaItems || deltaItems.length === 0) {
    return 'Бажані параметри ще не встановлені тренером.';
  }
  const lines = ['Твої цілі:'];
  for (const item of deltaItems) {
    if (item.reached) {
      lines.push(item.label + ': ' + item.current + ' ' + item.unit + ' — ціль досягнута');
      continue;
    }
    lines.push(
      item.label + ': зараз ' + item.current + ' ' + item.unit + ' → ціль ' + item.goal + ' ' + item.unit +
      ' (' + item.direction + ' на ' + item.delta + ' ' + item.unit + ' — орієнтовно ' + item.months + ' міс.)'
    );
  }
  return lines.join('\n');
}

function formatGoalsSummaryForCoach(deltaItems, studentName) {
  if (!deltaItems || deltaItems.length === 0) {
    return 'Бажані параметри для ' + (studentName || 'учня') + ' не встановлені.';
  }
  const lines = ['Цілі учня ' + (studentName || '') + ':'];
  for (const item of deltaItems) {
    if (item.reached) {
      lines.push(item.label + ': ' + item.current + ' ' + item.unit + ' — ДОСЯГНУТО');
      continue;
    }
    const pct = Math.round((item.delta / item.current) * 100);
    lines.push(
      item.label + ': ' + item.current + ' → ' + item.goal + ' ' + item.unit +
      ' (' + item.direction + ' на ' + item.delta + ' ' + item.unit + ', ' + pct + '%, ~' + item.months + ' міс.)'
    );
  }
  return lines.join('\n');
}

async function saveBodyGoals(coachId, studentChatId, goals) {
  const student = await User.getByChatId(studentChatId);
  if (!student) {
    return { saved: false, error: 'Учня не знайдено.' };
  }
  if (!student.height) {
    return { saved: false, error: 'Спочатку вкажіть зріст учня.' };
  }
  for (const [field, value] of Object.entries(goals)) {
    if (value == null || value === '') continue;
    const check = validateGoalField(field, value, student.height);
    if (!check.valid) {
      return { saved: false, error: check.error };
    }
  }
  const ok = await supabase.upsertBodyGoals(coachId, studentChatId, goals);
  if (!ok) return { saved: false, error: 'Не вдалося зберегти.' };
  const current = await supabase.getLatestMeasurementsForGoals(studentChatId);
  const deltaItems = current ? calcDeltaAndTimeline(current, goals) : [];
  const coachSummary = formatGoalsSummaryForCoach(deltaItems, student.firstName);
  return { saved: true, coachSummary, deltaItems };
}

async function showGoalsToStudent(chatId) {
  const goals = await supabase.getBodyGoals(chatId);
  const current = await supabase.getLatestMeasurementsForGoals(chatId);
  if (!goals) return 'Тренер ще не встановив твої цілі.';
  if (!current) return 'Спочатку потрібно внести поточні заміри.';
  const deltaItems = calcDeltaAndTimeline(current, goals);
  return formatGoalsSummaryForStudent(deltaItems);
}

module.exports = {
  validateGoalField,
  calcDeltaAndTimeline,
  formatGoalsSummaryForStudent,
  formatGoalsSummaryForCoach,
  saveBodyGoals,
  showGoalsToStudent,
  CHANGE_RATE,
  FIELDS_FOR_DELTA
};
