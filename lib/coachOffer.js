/**
 * Типи тренувань і види послуг тренера (профіль / реєстрація).
 * coach_training_types: personal | split | trio | group (+ legacy individual)
 * coach_service_modes: offline | online | programs
 */
const { CONSTANTS } = require('./constants');

const TRAINING_KEYS = Object.freeze({
  PERSONAL: 'personal',
  SPLIT: 'split',
  TRIO: 'trio',
  GROUP: 'group',
  /** Legacy: означає personal+split+trio */
  INDIVIDUAL: 'individual'
});

const TRAINING_LABELS = Object.freeze({
  personal: 'Індивідуальні',
  split: 'Спліт',
  trio: 'Тріо',
  group: 'Групові'
});

const SERVICE_LABELS = Object.freeze({
  offline: 'Офлайн',
  online: 'Онлайн',
  programs: 'Програми тренувань'
});

/** Порядок кнопок у «Змінити». */
const TRAINING_EDIT_ORDER = Object.freeze([
  TRAINING_KEYS.PERSONAL,
  TRAINING_KEYS.SPLIT,
  TRAINING_KEYS.TRIO,
  TRAINING_KEYS.GROUP
]);

const SERVICE_EDIT_ORDER = Object.freeze([
  CONSTANTS.COACH_SERVICE_MODES.ONLINE,
  CONSTANTS.COACH_SERVICE_MODES.OFFLINE,
  CONSTANTS.COACH_SERVICE_MODES.PROGRAMS
]);

/**
 * Нормалізація: individual → personal+split+trio; прибирає дублікати.
 * @param {string[]} raw
 * @returns {string[]}
 */
function normalizeTrainingTypes(raw) {
  const set = new Set();
  const arr = Array.isArray(raw) ? raw : [];
  for (const x of arr) {
    const k = String(x || '').trim();
    if (!k) continue;
    if (k === TRAINING_KEYS.INDIVIDUAL) {
      set.add(TRAINING_KEYS.PERSONAL);
      set.add(TRAINING_KEYS.SPLIT);
      set.add(TRAINING_KEYS.TRIO);
      continue;
    }
    if (
      k === TRAINING_KEYS.PERSONAL ||
      k === TRAINING_KEYS.SPLIT ||
      k === TRAINING_KEYS.TRIO ||
      k === TRAINING_KEYS.GROUP
    ) {
      set.add(k);
    }
  }
  return Array.from(set);
}

function normalizeServiceModes(raw) {
  const M = CONSTANTS.COACH_SERVICE_MODES;
  const set = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const k = String(x || '').trim();
    if (k === M.OFFLINE || k === M.ONLINE || k === M.PROGRAMS) set.add(k);
  }
  return Array.from(set);
}

function hasTrainingType(userOrTypes, key) {
  const arr = Array.isArray(userOrTypes)
    ? userOrTypes
    : userOrTypes && userOrTypes.coachTrainingTypes
      ? userOrTypes.coachTrainingTypes
      : [];
  return normalizeTrainingTypes(arr).includes(String(key));
}

function hasServiceMode(userOrModes, key) {
  const arr = Array.isArray(userOrModes)
    ? userOrModes
    : userOrModes && userOrModes.coachServiceModes
      ? userOrModes.coachServiceModes
      : [];
  return normalizeServiceModes(arr).includes(String(key));
}

/** Чи може тренер вести сесію PERSONAL / SPLIT / TRIO (TRAINING_TYPES). */
function canCoachSessionType(user, trainingTypeConst) {
  const t = String(trainingTypeConst || '').toUpperCase();
  if (t === 'PERSONAL') return hasTrainingType(user, TRAINING_KEYS.PERSONAL);
  if (t === 'SPLIT') return hasTrainingType(user, TRAINING_KEYS.SPLIT);
  if (t === 'TRIO') return hasTrainingType(user, TRAINING_KEYS.TRIO);
  return false;
}

function formatTrainingTypesLine(types) {
  const n = normalizeTrainingTypes(types);
  if (!n.length) return 'не вказано';
  return n.map((k) => TRAINING_LABELS[k] || k).join(', ');
}

function formatServiceModesLine(modes) {
  const n = normalizeServiceModes(modes);
  if (!n.length) return 'не вказано';
  return n.map((k) => SERVICE_LABELS[k] || k).join(', ');
}

function buildHubSummaryText(user) {
  const types = formatTrainingTypesLine(user && user.coachTrainingTypes);
  const modes = formatServiceModesLine(user && user.coachServiceModes);
  return (
    '💪 Тип тренувань, які проводжу\n\n' +
    'Формати тренувань: ' +
    types +
    '\n' +
    'Послуги: ' +
    modes +
    '\n\n' +
    '➕ Створити своє групове заняття — якщо потрібного заняття немає на сторінці обраного клубу. ' +
    'Після створення: спочатку модерація адміном (підтвердження власника), потім розміщення на картці клубу.\n\n' +
    'Обери дію:'
  );
}

module.exports = {
  TRAINING_KEYS,
  TRAINING_LABELS,
  SERVICE_LABELS,
  TRAINING_EDIT_ORDER,
  SERVICE_EDIT_ORDER,
  normalizeTrainingTypes,
  normalizeServiceModes,
  hasTrainingType,
  hasServiceMode,
  canCoachSessionType,
  formatTrainingTypesLine,
  formatServiceModesLine,
  buildHubSummaryText
};
