/**
 * Library — бібліотека вправ (перегляд груп і вправ з exercise_library)
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Menu = require('./menu');
const { decodeMedicalText } = require('./medicalDecode');

const MAX_BUTTONS_PER_PAGE = 20;
const MAX_EXERCISE_BUTTON_LENGTH = 50;

async function showLibrary(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: [] });
  await showTopGroups(chatId);
}

async function showTopGroups(chatId) {
  const groups = await supabase.getTopLevelGroups();
  if (!groups || groups.length === 0) {
    await Helpers.safeSend(chatId, '📖 Бібліотека вправ порожня. Вправи додаються в Supabase (таблиця exercise_library).');
    await State.clear(chatId);
    const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
    await Helpers.sendKeyboard(chatId, '📖 Бібліотека вправ', keyboard);
    return;
  }
  const keyboard = groups.map((g) => [
    { text: g, callback_data: CONSTANTS.CALLBACKS.LIBRARY_GROUP + ':' + g }
  ]);
  keyboard.push([{ text: '🔎 Пошук', callback_data: CONSTANTS.CALLBACKS.LIBRARY_SEARCH }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '📖 Бібліотека вправ\n\nОбери групу м\'язів:', keyboard);
}

async function showLibraryLevel(chatId, pathParts) {
  const state = await State.get(chatId);
  await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: pathParts });
  const level1 = pathParts[0] || '';
  const level2 = pathParts[1] || null;
  const level3 = pathParts[2] || null;

  const subgroups = await supabase.getSubgroups(level1, level2);
  if (subgroups && subgroups.length > 0) {
    const prefix = pathParts.join(':');
    const keyboard = subgroups.map((sub) => [
      { text: sub, callback_data: CONSTANTS.CALLBACKS.LIBRARY_GROUP + ':' + prefix + ':' + sub }
    ]);
    keyboard.push([{ text: '📋 Всі вправи тут', callback_data: CONSTANTS.CALLBACKS.LIBRARY_GROUP + ':' + prefix + ':__all__' }]);
    keyboard.push([{ text: '🔎 Пошук', callback_data: CONSTANTS.CALLBACKS.LIBRARY_SEARCH }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.LIBRARY_BACK }]);
    const header = pathParts.filter(Boolean).join(' → ') || level1;
    await Helpers.sendKeyboard(chatId, '📖 ' + header + '\n\nОбери підкатегорію:', keyboard);
    return;
  }
  await showLibraryExercises(chatId, level1, level2, level3 === '__all__' ? null : level3);
}

async function showLibraryExercises(chatId, level1, level2, level3) {
  const level2Arg = level2 === '__all__' || !level2 ? null : level2;
  const level3Arg = level3 === '__all__' || !level3 ? null : level3;
  const exercises = await supabase.getExercisesByGroup(level1, level2Arg, level3Arg);
  if (!exercises || exercises.length === 0) {
    const label = [level1, level2Arg, level3Arg].filter(Boolean).join(' → ') || level1;
    await Helpers.safeSend(chatId, '❌ У групі «' + label + '» немає вправ.');
    await showTopGroups(chatId);
    return;
  }
  const header = [level1, level2Arg, level3Arg].filter(Boolean).join(' → ') || level1;
  const keyboard = exercises.slice(0, MAX_BUTTONS_PER_PAGE).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACKS.LIBRARY_EXERCISE + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔎 Пошук', callback_data: CONSTANTS.CALLBACKS.LIBRARY_SEARCH }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.LIBRARY_BACK }]);
  await Helpers.sendKeyboard(chatId, '📖 ' + header + '\n\nОбери вправу:', keyboard);
}

function isUrl(str) {
  const s = (str || '').toString().trim();
  return s.length > 10 && (s.startsWith('http://') || s.startsWith('https://'));
}

async function showExerciseDetail(chatId, exerciseId) {
  const detail = await supabase.getExerciseDetailById(exerciseId);
  if (!detail) {
    await Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
    await showTopGroups(chatId);
    return;
  }
  const lines = [];
  lines.push('📖 **' + (detail.name || 'Вправа') + '**');
  if (detail.groupPath) lines.push('📂 ' + detail.groupPath);
  if (detail.equipment) lines.push('🏋️ Обладнання: ' + detail.equipment);
  if (detail.focusPoint) lines.push('🎯 Фокус: ' + detail.focusPoint);
  if (detail.commonMistakes) lines.push('⚠️ Типові помилки: ' + detail.commonMistakes);
  if (detail.properFeeling) lines.push('✅ Відчуття: ' + detail.properFeeling);
  if (detail.staticHolds) lines.push('⏱ Статична затримка: ' + detail.staticHolds);
  if (detail.vid) lines.push('Тип вправи: ' + detail.vid);
  if (detail.difficulty) lines.push('Складність: ' + detail.difficulty);
  if (detail.medicalContraindications) lines.push('🚫 Абсолютні заборони: ' + decodeMedicalText(detail.medicalContraindications));
  if (detail.medicalLimitations) lines.push('📋 Обмеження з примітками: ' + decodeMedicalText(detail.medicalLimitations));
  if (detail.safeFor) lines.push('✅ Безпечно при цих станах: ' + decodeMedicalText(detail.safeFor));
  if (detail.modifications) lines.push('🔄 Як модифікувати: ' + decodeMedicalText(detail.modifications));
  if (detail.alternatives) lines.push('↔️ Альтернативні вправи: ' + decodeMedicalText(detail.alternatives));
  if (detail.safetyNotes) lines.push('🛡 Загальні примітки безпеки: ' + detail.safetyNotes);
  if (detail.youtubeLink) {
    if (isUrl(detail.youtubeLink)) {
      lines.push('🔗 [Відео](' + detail.youtubeLink + ')');
    } else {
      lines.push('🔗 Відео: ' + detail.youtubeLink);
    }
  }
  if (detail.myChannelLink) {
    if (isUrl(detail.myChannelLink)) {
      lines.push('🔗 [Канал](' + detail.myChannelLink + ')');
    } else {
      lines.push('🔗 Канал: ' + detail.myChannelLink);
    }
  }
  const text = lines.join('\n\n');

  const keyboard = [
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад до списку', callback_data: CONSTANTS.CALLBACKS.LIBRARY_BACK }],
    [{ text: '📖 До груп', callback_data: CONSTANTS.CALLBACKS.LIBRARY_TOP }],
    [{ text: 'Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

async function handleLibraryBack(chatId) {
  const state = await State.get(chatId);
  const path = state?.libraryPath || [];
  if (path.length === 0) {
    await State.clear(chatId);
    await Menu.show(chatId);
    return;
  }
  const prevPath = path.slice(0, -1);
  if (prevPath.length === 0) {
    await showTopGroups(chatId);
    return;
  }
  await showLibraryLevel(chatId, prevPath);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const rest = String(callbackData || '').split(':').slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.LIBRARY_VIEW) {
    await showLibrary(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_TOP) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: [] });
    await showTopGroups(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_BACK) {
    await handleLibraryBack(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_GROUP && rest) {
    const pathParts = rest.split(':').map((s) => s.trim()).filter(Boolean);
    if (pathParts.length === 0) {
      await showTopGroups(chatId);
      return true;
    }
    if (pathParts.length === 1) {
      await showLibraryLevel(chatId, pathParts);
      return true;
    }
    const last = pathParts[pathParts.length - 1];
    if (last === '__all__') {
      const level1 = pathParts[0];
      const level2 = pathParts.length >= 3 ? pathParts[pathParts.length - 2] : null;
      const prevPath = pathParts.slice(0, -1);
      await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: prevPath });
      await showLibraryExercises(chatId, level1, level2, null);
      return true;
    }
    const level1 = pathParts[0];
    const level2 = pathParts.length >= 2 ? pathParts[1] : null;
    const level3 = pathParts.length >= 3 ? pathParts[2] : null;
    if (pathParts.length >= 3) {
      await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: pathParts });
      await showLibraryExercises(chatId, level1, level2, level3);
    } else {
      await showLibraryLevel(chatId, pathParts);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_EXERCISE && rest) {
    const exerciseId = rest.trim();
    await showExerciseDetail(chatId, exerciseId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_SEARCH) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_SEARCH_INPUT });
    await Helpers.safeSend(chatId, '🔎 Введи мінімум 2 літери для пошуку вправи:\n\nПриклад: жим, присідання');
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (state?.step !== CONSTANTS.FSM_STATES.LIBRARY_SEARCH_INPUT) return false;
  const query = String(text || '').trim();
  if (query.length < 2) {
    await Helpers.safeSend(chatId, '⚠️ Введи мінімум 2 літери.');
    return true;
  }
  const exercises = await supabase.searchExercises(query);
  if (!exercises || exercises.length === 0) {
    await Helpers.safeSend(chatId, '❌ Нічого не знайдено за запитом «' + query + '». Спробуй інший.');
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: [] });
    await showTopGroups(chatId);
    return true;
  }
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.LIBRARY_BROWSE, libraryPath: [] });
  const keyboard = exercises.slice(0, 15).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, MAX_EXERCISE_BUTTON_LENGTH), callback_data: CONSTANTS.CALLBACKS.LIBRARY_EXERCISE + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔎 Ще пошук', callback_data: CONSTANTS.CALLBACKS.LIBRARY_SEARCH }]);
  keyboard.push([{ text: '📖 До груп', callback_data: CONSTANTS.CALLBACKS.LIBRARY_TOP }]);
  keyboard.push([{ text: 'Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '🔎 Результати пошуку «' + query + '»:\n\nОбери вправу:', keyboard);
  return true;
}

module.exports = {
  showLibrary,
  handleCallback,
  handleTextMessage
};
