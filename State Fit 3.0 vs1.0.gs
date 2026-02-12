/**
 * State.gs - FSM State Manager
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Зберігання FSM станів користувачів
 * - Читання/запис у ScriptProperties
 * - Управління життєвим циклом станів
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - Telegram API виклики
 * - Валідацію даних (тільки структури State)
 */

// ═══════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Отримати ScriptProperties
 * @private
 */
function getProperties_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Генерація ключа для State
 * @private
 * @param {string|number} chatId
 * @returns {string} - "STATE_123456789"
 */
function getStateKey_(chatId) {
  return 'STATE_' + String(chatId);
}

/**
 * Копія об'єкта (shallow) для merge без spread
 * @private
 */
function copyObject_(obj) {
  var result = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      result[k] = obj[k];
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Отримати State користувача
 *
 * @param {string|number} chatId - Telegram ChatID
 * @returns {Object|null} - State об'єкт або null
 *
 * @example
 * var state = State.get(chatId);
 * if (state && state.step === FSM_STATES.REG_CITY) {
 *   // Обробка
 * }
 */
function get(chatId) {
  try {
    var key = getStateKey_(chatId);
    var properties = getProperties_();
    var stateJson = properties.getProperty(key);

    if (!stateJson) {
      return null;
    }

    var state = JSON.parse(stateJson);

    if (!state || typeof state !== 'object') {
      Logger.log('Invalid state structure for ' + chatId);
      return null;
    }

    return state;
  } catch (error) {
    Logger.log('State.get error for ' + chatId + ': ' + error.message);
    clear(chatId);
    return null;
  }
}

/**
 * Встановити State користувача
 *
 * @param {string|number} chatId - Telegram ChatID
 * @param {Object} stateData - Дані стану
 * @returns {boolean} - true якщо успішно
 *
 * ВАЖЛИВО: Цей метод ПЕРЕЗАПИСУЄ весь State!
 * Для часткового оновлення використовуй update()
 *
 * @example
 * State.set(chatId, {
 *   step: FSM_STATES.REG_CITY,
 *   firstName: 'Олексій',
 *   role: ROLES.STUDENT
 * });
 */
function set(chatId, stateData) {
  try {
    if (!stateData || typeof stateData !== 'object') {
      throw new Error('State data must be an object');
    }

    var stateWithMeta = copyObject_(stateData);
    stateWithMeta._updatedAt = new Date().toISOString();
    stateWithMeta._version = 1;

    var key = getStateKey_(chatId);
    var properties = getProperties_();
    var stateJson = JSON.stringify(stateWithMeta);

    if (stateJson.length > 9000) {
      throw new Error('State too large (>9KB)');
    }

    properties.setProperty(key, stateJson);

    // КРИТИЧНО: мікро-затримка для зменшення ймовірності Race Condition
    Utilities.sleep(50);

    return true;
  } catch (error) {
    Logger.log('State.set error for ' + chatId + ': ' + error.message);
    return false;
  }
}

/**
 * Часткове оновлення State (merge)
 *
 * @param {string|number} chatId
 * @param {Object} partialData - Дані для оновлення
 * @returns {boolean}
 *
 * @example
 * // Було: { step: 'reg_city', firstName: 'Олексій' }
 * State.update(chatId, { city: 'Одеса' });
 * // Стало: { step: 'reg_city', firstName: 'Олексій', city: 'Одеса' }
 */
function update(chatId, partialData) {
  var currentState = get(chatId);

  if (!currentState) {
    return set(chatId, partialData);
  }

  var mergedState = copyObject_(currentState);
  for (var k in partialData) {
    if (partialData.hasOwnProperty(k)) {
      mergedState[k] = partialData[k];
    }
  }

  return set(chatId, mergedState);
}

/**
 * Очистити State користувача
 *
 * @param {string|number} chatId
 * @returns {boolean}
 *
 * ВИКОРИСТОВУВАТИ:
 * - Після завершення реєстрації
 * - При /start (скидання flow)
 * - При помилках FSM
 * - При BACK_TO_MAIN
 */
function clear(chatId) {
  try {
    var key = getStateKey_(chatId);
    var properties = getProperties_();
    properties.deleteProperty(key);
    return true;
  } catch (error) {
    Logger.log('State.clear error for ' + chatId + ': ' + error.message);
    return false;
  }
}

/**
 * Перевірити чи існує State
 *
 * @param {string|number} chatId
 * @returns {boolean}
 */
function stateExists_(chatId) {
  return get(chatId) !== null;
}

/**
 * Отримати тільки крок (step) без всього State
 *
 * @param {string|number} chatId
 * @returns {string|null} - FSM step або null
 *
 * @example
 * var step = State.getStep(chatId);
 * if (step === FSM_STATES.REG_CITY) {
 *   // Очікуємо введення міста
 * }
 */
function getStep(chatId) {
  var state = get(chatId);
  return state ? state.step : null;
}

/**
 * Встановити тільки крок (step)
 *
 * @param {string|number} chatId
 * @param {string} step - FSM state (з FSM_STATES)
 * @returns {boolean}
 */
function setStep(chatId, step) {
  return update(chatId, { step: step });
}

/**
 * Отримати дані з State (без метаданих)
 *
 * @param {string|number} chatId
 * @returns {Object|null} - Тільки user-дані (без _updatedAt, _version)
 */
function getData(chatId) {
  var state = get(chatId);

  if (!state) {
    return null;
  }

  var userData = copyObject_(state);
  delete userData._updatedAt;
  delete userData._version;
  return userData;
}

// ═══════════════════════════════════════════════════════════
// ADVANCED METHODS (для дебагу та адміністрування)
// ═══════════════════════════════════════════════════════════

/**
 * Отримати всі активні State (ADMIN)
 *
 * ⚠️ ПОВІЛЬНА ОПЕРАЦІЯ - використовувати тільки для дебагу
 *
 * @returns {Array<Object>} - Масив { chatId, state }
 */
function getAllStates() {
  var properties = getProperties_();
  var allProps = properties.getProperties();
  var states = [];
  var key;

  for (key in allProps) {
    if (allProps.hasOwnProperty(key) && key.indexOf('STATE_') === 0) {
      var chatId = key.replace('STATE_', '');
      try {
        var state = JSON.parse(allProps[key]);
        states.push({ chatId: chatId, state: state });
      } catch (error) {
        Logger.log('Broken state for ' + chatId);
      }
    }
  }

  return states;
}

/**
 * Очистити всі застарілі State (ADMIN)
 *
 * @param {number} olderThanDays - Видалити State старіші за N днів
 * @returns {number} - Кількість видалених
 *
 * @example
 * // Очистити State старіші за 7 днів
 * var deleted = State.clearOldStates(7);
 * Logger.log('Deleted ' + deleted + ' old states');
 */
function clearOldStates(olderThanDays) {
  var allStates = getAllStates();
  var now = new Date();
  var threshold = olderThanDays * 24 * 60 * 60 * 1000;
  var deleted = 0;
  var i;
  var item;
  var updatedAt;
  var stateDate;
  var age;

  for (i = 0; i < allStates.length; i++) {
    item = allStates[i];
    updatedAt = item.state._updatedAt;

    if (updatedAt) {
      stateDate = new Date(updatedAt);
      age = now - stateDate;

      if (age > threshold) {
        clear(item.chatId);
        deleted++;
      }
    }
  }

  return deleted;
}

/**
 * Безпечне читання State з retry
 *
 * Використовувати в Router для захисту від Race Condition
 *
 * @param {string|number} chatId
 * @param {number} maxRetries - Кількість спроб (за замовчуванням 3)
 * @param {number} delayMs - Затримка між спробами (за замовчуванням 100)
 * @returns {Object|null}
 */
function getSafe(chatId, maxRetries, delayMs) {
  maxRetries = maxRetries != null ? maxRetries : 3;
  delayMs = delayMs != null ? delayMs : 100;
  var attempts = 0;
  var state;

  while (attempts < maxRetries) {
    state = get(chatId);

    if (state !== null) {
      return state;
    }

    if (attempts < maxRetries - 1) {
      Utilities.sleep(delayMs);
    }

    attempts++;
  }

  return null;
}

/**
 * Безпечний запис State з Lock
 *
 * ⚠️ EXPERIMENTAL - для критичних секцій
 *
 * @param {string|number} chatId
 * @param {Object} stateData
 * @returns {boolean}
 */
function setWithLock(chatId, stateData) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    return set(chatId, stateData);
  } catch (error) {
    Logger.log('Lock acquisition failed for ' + chatId + ': ' + error.message);
    return false;
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Lock могло вже відпуститися
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ПУБЛІЧНИЙ API (єдиний спосіб виклику з Router, Registration, Schedule, Profile, Menu)
// GAS: один глобальний namespace — всі методи експортуються через об'єкт State
// ═══════════════════════════════════════════════════════════
var State = {
  get: get,
  set: set,
  update: update,
  clear: clear,
  exists: stateExists_,
  getStep: getStep,
  setStep: setStep,
  getData: getData,
  getSafe: getSafe,
  setWithLock: setWithLock,
  getAllStates: getAllStates,
  clearOldStates: clearOldStates
};
