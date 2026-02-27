/**
 * Система псевдонімів вправ (ТЗ_Псевдоніми_вправ.md).
 * Моя назва — власна назва вправи для пошуку.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');

const MIN_ALIAS_LEN = 2;
const MAX_ALIAS_LEN = 40;
const MAX_ALIASES_PER_EXERCISE = 10;
const MAX_ALIASES_PER_USER = 200;

async function addAlias(userId, exerciseId, aliasText, scope) {
  const normalized = String(aliasText || '').trim().toLowerCase();
  if (normalized.length < MIN_ALIAS_LEN || normalized.length > MAX_ALIAS_LEN) {
    return { success: false, error: 'LENGTH' };
  }
  const list = await supabase.getAliasesByUserAndExercise(userId, exerciseId);
  if (list.length >= MAX_ALIASES_PER_EXERCISE) {
    return { success: false, error: 'LIMIT_EXERCISE' };
  }
  const all = await supabase.getAllAliasesByUser(userId);
  if (all.length >= MAX_ALIASES_PER_USER) {
    return { success: false, error: 'LIMIT_USER' };
  }
  try {
    const aliasId = await supabase.insertAlias({
      user_id: userId,
      exercise_id: exerciseId,
      alias: normalized,
      scope: scope === 'coach_shared' ? 'coach_shared' : 'personal'
    });
    return aliasId ? { success: true, alias_id: aliasId } : { success: false, error: 'INSERT' };
  } catch (e) {
    if (e.message === 'DUPLICATE') return { success: false, error: 'DUPLICATE' };
    return { success: false, error: 'INSERT' };
  }
}

async function deleteAlias(aliasId, userId) {
  const ok = await supabase.deleteAliasByIdAndUser(aliasId, userId);
  return { success: !!ok };
}

async function getAliasesForExercise(userId, exerciseId) {
  return supabase.getAliasesByUserAndExercise(userId, exerciseId);
}

/** Пошук по псевдонімах. Повертає масив { exercise_id, id (alias id), alias, name, fromAlias: true }. */
async function searchByAlias(query, userId, coachId) {
  const norm = String(query || '').trim().toLowerCase();
  if (norm.length < 2) return [];
  const rows = await supabase.findAliasesForSearch(userId, coachId || null, norm);
  return rows.map((r) => ({
    exercise_id: r.exercise_id,
    id: r.exercise_id,
    aliasId: r.id,
    alias: r.alias,
    name: r.name || (r.name_ua || r.name_ru || '').toString(),
    fromAlias: true
  }));
}

/** Об'єднаний пошук: спочатку псевдоніми, потім по назвах. Мінімум 3 символи. Повертає [{ id, name, fromAlias?, aliasText? }, ...]. */
async function searchExercisesWithAliases(query, chatId, coachId) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const norm = q.toLowerCase();
  const aliasResults = await searchByAlias(norm, chatId, coachId);
  const nameResults = await supabase.searchExercises(q);
  const aliasIds = new Set(aliasResults.map((r) => r.id));
  const combined = [
    ...aliasResults.map((r) => ({
      id: r.id,
      name: r.name,
      fromAlias: true,
      aliasText: r.alias
    })),
    ...(nameResults || []).filter((r) => !aliasIds.has(r.id)).map((r) => ({
      id: r.id,
      name: r.name || '',
      fromAlias: false
    }))
  ];
  return combined;
}

async function handleCallback(chatId, callbackData) {
  const str = String(callbackData || '');
  const action = str.split(':')[0].trim();
  const param = str.split(':').slice(1).join(':').trim();
  const params = str.split(':').map((s) => s.trim()).filter(Boolean);

  if (action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_ADD && action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_SCOPE
    && action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_LIST && action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL
    && action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL_CONFIRM && action !== CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK) {
    return false;
  }

  const user = await User.getByChatId(chatId);
  const isCoach = user && user.role === CONSTANTS.ROLES.COACH;
  const Library = require('./library');

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_ADD && param) {
    const exerciseId = param.split(':')[0];
    if (!exerciseId) return true;
    if (isCoach) {
      const detail = await supabase.getExerciseDetailById(exerciseId);
      const name = (detail && (detail.name_ua || detail.name_ru)) || 'Вправа';
      const keyboard = [
        [{ text: '👤 Тільки для мене', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_SCOPE + ':' + exerciseId + ':personal' }],
        [{ text: '👥 Для мене та моїх учнів', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_SCOPE + ':' + exerciseId + ':shared' }],
        [{ text: '🔙 Скасувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK + ':' + exerciseId }]
      ];
      await State.update(chatId, { step: CONSTANTS.FSM_STATES.ALIAS_SELECT_SCOPE, aliasExerciseId: exerciseId });
      await Helpers.sendKeyboard(chatId, '🏷 Додати свою назву для вправи:\n«' + name + '»\n\nДля кого буде ця назва?', keyboard);
    } else {
      await State.update(chatId, { step: CONSTANTS.FSM_STATES.ALIAS_INPUT_TEXT, aliasExerciseId: exerciseId, aliasScope: 'personal' });
      const detail = await supabase.getExerciseDetailById(exerciseId);
      const name = (detail && (detail.name_ua || detail.name_ru)) || 'Вправа';
      await Helpers.safeSend(chatId, '🏷 Введіть вашу назву для вправи:\n«' + name + '»\n\nНаприклад: блок зверху, lat pulldown\n\n(від 2 до 40 символів)');
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_SCOPE && params.length >= 3) {
    const exerciseId = params[1];
    const scope = params[2] === 'shared' ? 'coach_shared' : 'personal';
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.ALIAS_INPUT_TEXT, aliasExerciseId: exerciseId, aliasScope: scope });
    const detail = await supabase.getExerciseDetailById(exerciseId);
    const name = (detail && (detail.name_ua || detail.name_ru)) || 'Вправа';
    await Helpers.safeSend(chatId, '🏷 Введіть вашу назву для вправи:\n«' + name + '»\n\n(від 2 до 40 символів)');
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_LIST && param) {
    const exerciseId = param.split(':')[0];
    const list = await getAliasesForExercise(chatId, exerciseId);
    const detail = await supabase.getExerciseDetailById(exerciseId);
    const name = (detail && (detail.name_ua || detail.name_ru)) || 'Вправа';
    let text = '🏷 Ваші назви для вправи:\n«' + name + '»\n\n';
    const keyboard = [];
    for (const a of list) {
      keyboard.push([{ text: '🗑 ' + a.alias, callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL + ':' + a.id }]);
    }
    keyboard.push([{ text: '➕ Ввести своє найменування', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_ADD + ':' + exerciseId }]);
    keyboard.push([{ text: '🔙 Назад до вправи', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK + ':' + exerciseId }]);
    await Helpers.sendKeyboard(chatId, text, keyboard);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL && param) {
    const aliasId = param.split(':')[0];
    const aliases = await supabase.getAllAliasesByUser(chatId);
    const aliasRow = aliases.find((a) => a.id === aliasId);
    const aliasText = aliasRow ? aliasRow.alias : 'назву';
    const exerciseId = aliasRow ? aliasRow.exercise_id : null;
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.ALIAS_CONFIRM_DELETE, aliasDelId: aliasId, aliasBackExerciseId: exerciseId });
    const keyboard = [
      [{ text: '✅ Так, видалити', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL_CONFIRM + ':' + aliasId }],
      [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_LIST + ':' + (exerciseId || '') }]
    ];
    await Helpers.sendKeyboard(chatId, 'Видалити назву «' + aliasText + '»?', keyboard);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL_CONFIRM && param) {
    const aliasId = param.split(':')[0];
    const state = await State.get(chatId);
    const exerciseId = state && state.aliasBackExerciseId;
    const ok = await deleteAlias(aliasId, chatId);
    await State.update(chatId, { step: undefined, aliasDelId: undefined, aliasBackExerciseId: undefined });
    if (ok.success) await Helpers.safeSend(chatId, '✅ Назву видалено.');
    if (exerciseId) {
      const list = await getAliasesForExercise(chatId, exerciseId);
      const detail = await supabase.getExerciseDetailById(exerciseId);
      const name = (detail && (detail.name_ua || detail.name_ru)) || 'Вправа';
      let text = '🏷 Ваші назви для вправи:\n«' + name + '»\n\n';
      const keyboard = [];
      for (const a of list) {
        keyboard.push([{ text: '🗑 ' + a.alias, callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL + ':' + a.id }]);
      }
      keyboard.push([{ text: '➕ Ввести своє найменування', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_ADD + ':' + exerciseId }]);
      keyboard.push([{ text: '🔙 Назад до вправи', callback_data: CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK + ':' + exerciseId }]);
      await Helpers.sendKeyboard(chatId, text, keyboard);
    } else {
      await Helpers.safeSend(chatId, 'Готово.');
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK && param) {
    const exerciseId = param.split(':')[0];
    await State.update(chatId, { step: undefined, aliasExerciseId: undefined, aliasScope: undefined });
    await Library.showExerciseDetail(chatId, exerciseId);
    return true;
  }

  return true;
}

async function handleTextInput(chatId, text) {
  const state = await State.get(chatId);
  if (state?.step !== CONSTANTS.FSM_STATES.ALIAS_INPUT_TEXT) return false;
  const exerciseId = state.aliasExerciseId;
  const scope = state.aliasScope || 'personal';
  if (!exerciseId) {
    await State.update(chatId, { step: undefined, aliasExerciseId: undefined, aliasScope: undefined });
    return true;
  }
  const input = String(text || '').trim();
  if (!input) {
    await Helpers.safeSend(chatId, '⚠️ Введіть текст назви (від 2 до 40 символів).');
    return true;
  }
  if (input.length < MIN_ALIAS_LEN || input.length > MAX_ALIAS_LEN) {
    await Helpers.safeSend(chatId, '⚠️ Назва має бути від 2 до 40 символів.');
    return true;
  }
  const result = await addAlias(chatId, exerciseId, input, scope);
  await State.update(chatId, { step: undefined, aliasExerciseId: undefined, aliasScope: undefined });
  const Library = require('./library');
  if (result.success) {
    await Helpers.safeSend(chatId, '✅ Назву «' + input.trim().toLowerCase() + '» збережено!');
    await Library.showExerciseDetail(chatId, exerciseId);
  } else if (result.error === 'DUPLICATE') {
    await Helpers.safeSend(chatId, '⚠️ Така назва у вас вже є для іншої вправи. Обери іншу.');
    await Library.showExerciseDetail(chatId, exerciseId);
  } else if (result.error === 'LIMIT_EXERCISE') {
    await Helpers.safeSend(chatId, '⚠️ До цієї вправи вже додано максимум назв (10). Видаліть зайву в «Моя назва».');
    await Library.showExerciseDetail(chatId, exerciseId);
  } else if (result.error === 'LIMIT_USER') {
    await Helpers.safeSend(chatId, '⚠️ Досягнуто ліміт власних назв (200). Видаліть непотрібні.');
    await Library.showExerciseDetail(chatId, exerciseId);
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
    await Library.showExerciseDetail(chatId, exerciseId);
  }
  return true;
}

module.exports = {
  addAlias,
  deleteAlias,
  getAliasesForExercise,
  searchByAlias,
  searchExercisesWithAliases,
  handleCallback,
  handleTextInput
};
