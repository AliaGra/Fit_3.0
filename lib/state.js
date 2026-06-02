/**
 * FSM State (Supabase bot_state замість PropertiesService)
 */
const supabase = require('./supabase');

/** Ключі в bot_state для чеклістів підсказок тренера. */
const COACH_FIRST_STEPS_STATE_KEY = 'coachFirstStepsDone';
const COACH_PUBLIC_STEPS_STATE_KEY = 'coachPublicStepsDone';
const COACH_PLAN_HINTS_STATE_KEY = 'coachPlanHintsDone';

/** Ключі чеклістів підказок власника закладу (зберігаються при State.clear). */
const VENUE_OWNER_HINT_STATE_KEYS = Object.freeze([
  'venueOwnerFirstStepsDone',
  'venueOwnerProfileHintsDone',
  'venueOwnerContentHintsDone',
  'venueOwnerCoachesHintsDone',
  'venueOwnerLimitsHintsDone'
]);

const MAX_STATE_SIZE = 9000;

function get(chatId) {
  return supabase.getStateRow(chatId).then((row) => {
    if (!row || !row.data || typeof row.data !== 'object') return null;
    const state = row.data;
    delete state._updatedAt;
    delete state._version;
    return state;
  }).catch((err) => {
    console.error('State.get', chatId, err.message);
    return null;
  });
}

function set(chatId, stateData) {
  if (!stateData || typeof stateData !== 'object') {
    console.error('State.set: data must be object');
    return Promise.resolve(false);
  }
  const withMeta = { ...stateData, _updatedAt: new Date().toISOString(), _version: 1 };
  const json = JSON.stringify(withMeta);
  if (json.length > MAX_STATE_SIZE) {
    console.error('State.set: too large');
    return Promise.resolve(false);
  }
  return supabase.setStateRow(chatId, withMeta)
    .then(() => true)
    .catch((err) => {
      console.error('State.set', chatId, err.message);
      return false;
    });
}

function update(chatId, partialData) {
  return get(chatId).then((current) => {
    const merged = current ? { ...current, ...partialData } : partialData;
    return set(chatId, merged);
  });
}

function clear(chatId) {
  return get(chatId)
    .then((current) => {
      const preserved = {};
      if (current && typeof current === 'object') {
        if (
          current[COACH_FIRST_STEPS_STATE_KEY] &&
          typeof current[COACH_FIRST_STEPS_STATE_KEY] === 'object'
        ) {
          preserved[COACH_FIRST_STEPS_STATE_KEY] = current[COACH_FIRST_STEPS_STATE_KEY];
        }
        if (
          current[COACH_PUBLIC_STEPS_STATE_KEY] &&
          typeof current[COACH_PUBLIC_STEPS_STATE_KEY] === 'object'
        ) {
          preserved[COACH_PUBLIC_STEPS_STATE_KEY] = current[COACH_PUBLIC_STEPS_STATE_KEY];
        }
        if (
          current[COACH_PLAN_HINTS_STATE_KEY] &&
          typeof current[COACH_PLAN_HINTS_STATE_KEY] === 'object'
        ) {
          preserved[COACH_PLAN_HINTS_STATE_KEY] = current[COACH_PLAN_HINTS_STATE_KEY];
        }
        for (const key of VENUE_OWNER_HINT_STATE_KEYS) {
          if (current[key] && typeof current[key] === 'object') {
            preserved[key] = current[key];
          }
        }
      }
      const hasPreserved = Object.keys(preserved).length > 0;
      return supabase.deleteStateRow(chatId).then(() => (hasPreserved ? preserved : null));
    })
    .then((preserved) => {
      if (preserved && Object.keys(preserved).length > 0) return set(chatId, preserved);
      return true;
    })
    .catch((err) => {
      console.error('State.clear', chatId, err.message);
      return false;
    });
}

function getSafe(chatId) {
  return get(chatId);
}

module.exports = { get, set, update, clear, getSafe };
