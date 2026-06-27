/**
 * FSM State (Supabase bot_state замість PropertiesService)
 */
const supabase = require('./supabase');

/** Ключі в bot_state для чеклістів підсказок тренера. */
const COACH_FIRST_STEPS_STATE_KEY = 'coachFirstStepsDone';
const COACH_PUBLIC_STEPS_STATE_KEY = 'coachPublicStepsDone';
const COACH_PLAN_HINTS_STATE_KEY = 'coachPlanHintsDone';

/** Усі ключі чеклістів підказок — зберігаються при State.set / State.clear. */
const PRESERVED_HINT_STATE_KEYS = Object.freeze([
  COACH_FIRST_STEPS_STATE_KEY,
  COACH_PUBLIC_STEPS_STATE_KEY,
  COACH_PLAN_HINTS_STATE_KEY,
  'coachTrainingHintsDone',
  'coachBreaksHintsDone',
  'coachReportsHintsDone',
  'coachGroupHintsDone',
  'coachSubscriptionHintsDone',
  'venueOwnerFirstStepsDone',
  'venueOwnerProfileHintsDone',
  'venueOwnerContentHintsDone',
  'venueOwnerCoachesHintsDone',
  'venueOwnerLimitsHintsDone',
  'studentHintsFirstDone',
  'studentHintsScheduleDone',
  'studentHintsAiDone',
  'studentHintsProgressDone',
  'studentSoloHintsFirstDone',
  'studentSoloHintsPlanDone',
  'studentSoloHintsAiDone',
  'studentSoloHintsProgressDone'
]);

/** @deprecated використовуй PRESERVED_HINT_STATE_KEYS */
const VENUE_OWNER_HINT_STATE_KEYS = Object.freeze(
  PRESERVED_HINT_STATE_KEYS.filter((k) => k.startsWith('venueOwner'))
);

const MAX_STATE_SIZE = 9000;

function pickPreservedHintState(current) {
  const preserved = {};
  if (!current || typeof current !== 'object') return preserved;
  for (const key of PRESERVED_HINT_STATE_KEYS) {
    if (current[key] && typeof current[key] === 'object') {
      preserved[key] = current[key];
    }
  }
  return preserved;
}

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
  return get(chatId).then((current) => {
    const preserved = pickPreservedHintState(current);
    const merged = { ...preserved, ...stateData };
    const withMeta = { ...merged, _updatedAt: new Date().toISOString(), _version: 1 };
    const json = JSON.stringify(withMeta);
    if (json.length > MAX_STATE_SIZE) {
      console.error('State.set: too large');
      return false;
    }
    return supabase.setStateRow(chatId, withMeta)
      .then(() => true)
      .catch((err) => {
        console.error('State.set', chatId, err.message);
        return false;
      });
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
      const preserved = pickPreservedHintState(current);
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
