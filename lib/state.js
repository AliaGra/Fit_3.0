/**
 * FSM State (Supabase bot_state замість PropertiesService)
 */
const supabase = require('./supabase');

/** Ключ у bot_state для чекліста «В першу чергу» (див. lib/coachFirstSteps.js). */
const COACH_FIRST_STEPS_STATE_KEY = 'coachFirstStepsDone';

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
      const preserved =
        current && current[COACH_FIRST_STEPS_STATE_KEY] && typeof current[COACH_FIRST_STEPS_STATE_KEY] === 'object'
          ? { [COACH_FIRST_STEPS_STATE_KEY]: current[COACH_FIRST_STEPS_STATE_KEY] }
          : null;
      return supabase.deleteStateRow(chatId).then(() => preserved);
    })
    .then((preserved) => {
      if (preserved) return set(chatId, preserved);
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
