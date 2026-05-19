/**
 * Персональна бібліотека вправ: додавання та перегляд (меню «Тренування»).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const Menu = require('./menu');
const User = require('./user');

const MAX_BUTTONS = 20;
const MAX_BTN_LEN = 50;

function parsePath(param) {
  return String(param || '')
    .split(':')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pathLabel(parts) {
  return (parts || []).filter(Boolean).join(' → ') || '';
}

async function showMyExercisesMenu(chatId) {
  const keyboard = [
    [{ text: '➕ Додати мою вправу', callback_data: CONSTANTS.CALLBACKS.MY_EX_ADD }],
    [{ text: '📂 Мої вправи', callback_data: CONSTANTS.CALLBACKS.MY_EX_LIST }],
    [{ text: '🔙 До «Тренування»', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(
    chatId,
    '⭐ **Мої вправи**\n\nТут можна додати власні вправи та переглядати їх за групами.',
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

async function showAddTopGroups(chatId) {
  await State.update(chatId, { myExMode: 'add', myExPath: [], step: null });
  const keyboard = (CONSTANTS.MY_EX_TOP_GROUPS || []).map((g) => [
    { text: g, callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':' + g }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.MY_EX_MENU }]);
  await Helpers.sendKeyboard(chatId, '➕ **Додати мою вправу**\n\nОбери групу м\'язів:', keyboard, {
    parse_mode: 'Markdown'
  });
}

async function showAddSecondLevel(chatId, level1) {
  const list = (CONSTANTS.GROUPS_BY_TOP && CONSTANTS.GROUPS_BY_TOP[level1]) ? CONSTANTS.GROUPS_BY_TOP[level1] : [];
  const keyboard = [];
  for (const g2 of list) {
    keyboard.push([
      { text: g2, callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':' + level1 + ':' + g2 }
    ]);
  }
  keyboard.push([
    {
      text: '➕ Додати без категорії',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_SKIP_CAT + ':' + level1
    }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.MY_EX_ADD }]);
  await Helpers.sendKeyboard(chatId, '📂 **' + level1 + '**\n\nОбери підкатегорію:', keyboard, {
    parse_mode: 'Markdown'
  });
}

async function showAddThirdLevel(chatId, pathParts) {
  const level1 = pathParts[0] || '';
  const level2 = pathParts[1] || '';
  const subgroups = await supabase.getSubgroups(level1, level2);
  if (!subgroups || !subgroups.length) {
    await promptExerciseName(chatId, pathParts);
    return;
  }
  const prefix = pathParts.join(':');
  const keyboard = subgroups.map((g3) => [
    { text: g3, callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':' + prefix + ':' + g3 }
  ]);
  keyboard.push([
    {
      text: '➕ Додати без категорії',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_SKIP_CAT + ':' + prefix
    }
  ]);
  keyboard.push([
    {
      text: '🔙 Назад',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':' + level1
    }
  ]);
  await Helpers.sendKeyboard(
    chatId,
    '📂 ' + pathLabel(pathParts) + '\n\nОбери підкатегорію (рівень 3):',
    keyboard
  );
}

async function promptExerciseName(chatId, pathParts) {
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.MY_EX_NAME_INPUT,
    myExMode: 'add',
    myExPath: pathParts || []
  });
  const hint = pathLabel(pathParts);
  await Helpers.safeSend(
    chatId,
    '✏️ Введи **назву вправи** (мін. 2 символи)' + (hint ? '\n\nКатегорія: ' + hint : '') + ':',
    { parse_mode: 'Markdown' }
  );
}

async function showAfterSaveKeyboard(chatId) {
  const keyboard = [
    [{ text: '💪 До «Тренування»', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, 'Що далі?', keyboard);
}

async function saveCustomExercise(chatId, name) {
  const state = await State.get(chatId);
  const path = state?.myExPath || [];
  const user = await User.getByChatId(chatId);
  const row = {
    ownerChatId: chatId,
    nameUa: name,
    groupLevel1: path[0] || null,
    groupLevel2: path[1] || null,
    groupLevel3: path[2] || null,
    coachMedicalNote:
      user && user.role === CONSTANTS.ROLES.COACH && state?.myExCoachNote
        ? String(state.myExCoachNote).trim()
        : null
  };
  const id = await supabase.insertUserCustomExercise(row);
  await State.update(chatId, { myExPath: [], myExCoachNote: null, step: null });
  if (!id) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти вправу. Спробуй ще раз.');
    return false;
  }
  await Helpers.safeSend(chatId, '✅ Вправу «' + name + '» збережено в **Мої вправи**.', {
    parse_mode: 'Markdown'
  });
  await showAfterSaveKeyboard(chatId);
  return true;
}

// ——— Перегляд (як бібліотека) ———

async function showBrowseTopGroups(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.MY_EX_BROWSE, myExMode: 'browse', myExPath: [] });
  const all = await supabase.listAllUserCustomExercises(chatId, 500);
  if (!all.length) {
    await Helpers.safeSend(chatId, '📂 У «Мої вправи» поки нічого немає. Натисни «Додати мою вправу».');
    await showMyExercisesMenu(chatId);
    return;
  }
  const seen = {};
  const tops = [];
  for (const ex of all) {
    const g = String(ex.groupLevel1 || '').trim() || 'Без категорії';
    if (!seen[g]) {
      seen[g] = true;
      tops.push(g);
    }
  }
  tops.sort((a, b) => (a === 'Без категорії' ? 1 : b === 'Без категорії' ? -1 : a.localeCompare(b, 'uk')));
  const keyboard = tops.map((g) => [
    {
      text: g,
      callback_data:
        g === 'Без категорії'
          ? CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:__none__'
          : CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + g
    }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.MY_EX_MENU }]);
  await Helpers.sendKeyboard(chatId, '📂 **Мої вправи**\n\nОбери групу:', keyboard, { parse_mode: 'Markdown' });
}

async function showBrowseSecondLevel(chatId, level1) {
  const all = await supabase.listUserCustomExercisesByGroup(
    chatId,
    level1 === '__none__' ? null : level1,
    null,
    null
  );
  if (level1 === '__none__') {
    await showBrowseExerciseList(chatId, all, []);
    return;
  }
  const seen = {};
  const subs = [];
  for (const ex of all) {
    const g2 = String(ex.groupLevel2 || '').trim() || 'Без підкатегорії';
    if (!seen[g2]) {
      seen[g2] = true;
      subs.push(g2);
    }
  }
  if (!subs.length) {
    await showBrowseExerciseList(chatId, all, [level1]);
    return;
  }
  subs.sort();
  const keyboard = subs.map((g2) => [
    {
      text: g2,
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + level1 + ':' + g2
    }
  ]);
  keyboard.push([
    {
      text: '📋 Усі вправи тут',
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + level1 + ':__all__'
    }
  ]);
  keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACKS.MY_EX_LIST }]);
  await Helpers.sendKeyboard(chatId, '📂 ' + level1 + '\n\nОбери підкатегорію:', keyboard);
}

async function showBrowseThirdLevel(chatId, level1, level2) {
  const level2Arg = level2 === '__all__' ? null : level2 === 'Без підкатегорії' ? '' : level2;
  const exercises = await supabase.listUserCustomExercisesByGroup(chatId, level1, level2Arg, null);
  const subgroups = await supabase.getUserCustomExerciseSubgroups(chatId, level1, level2Arg || level2);
  if (subgroups && subgroups.length && level2 !== '__all__') {
    const keyboard = subgroups.map((g3) => [
      {
        text: g3,
        callback_data:
          CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + level1 + ':' + level2 + ':' + g3
      }
    ]);
    keyboard.push([
      {
        text: '📋 Усі вправи тут',
        callback_data:
          CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + level1 + ':' + level2 + ':__all__'
      }
    ]);
    keyboard.push([
      {
        text: '🔙 Назад',
        callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP + ':browse:' + level1
      }
    ]);
    await Helpers.sendKeyboard(
      chatId,
      '📂 ' + [level1, level2].filter(Boolean).join(' → ') + '\n\nОбери підкатегорію:',
      keyboard
    );
    return;
  }
  await showBrowseExerciseList(chatId, exercises, [level1, level2].filter((x) => x && x !== '__all__'));
}

async function showBrowseExerciseList(chatId, exercises, pathParts) {
  if (!exercises || !exercises.length) {
    await Helpers.safeSend(chatId, '❌ У цій категорії немає вправ.');
    await showBrowseTopGroups(chatId);
    return;
  }
  const header = pathLabel(pathParts) || 'Мої вправи';
  const keyboard = exercises.slice(0, MAX_BUTTONS).map((ex) => [
    {
      text: (ex.name || 'Вправа').slice(0, MAX_BTN_LEN),
      callback_data: CONSTANTS.CALLBACK_PREFIXES.MY_EX_ITEM + ':' + ex.id
    }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.MY_EX_BACK }]);
  await Helpers.sendKeyboard(chatId, '📂 ' + header + '\n\nОбери вправу:', keyboard);
}

async function showCustomExerciseDetail(chatId, exerciseId) {
  const ex = await supabase.getUserCustomExerciseById(chatId, exerciseId);
  if (!ex) {
    await Helpers.safeSend(chatId, '❌ Вправу не знайдено.');
    await showBrowseTopGroups(chatId);
    return;
  }
  const lines = ['⭐ **' + ex.name + '**'];
  const gp = [ex.groupLevel1, ex.groupLevel2, ex.groupLevel3].filter(Boolean).join(' → ');
  if (gp) lines.push('📂 ' + gp);
  if (ex.videoUrl) {
    const v = ex.videoUrl;
    if (v.startsWith('http://') || v.startsWith('https://')) {
      lines.push('🔗 [Відео](' + v + ')');
    } else {
      lines.push('🔗 Відео: ' + v);
    }
  }
  if (ex.coachMedicalNote) lines.push('📝 Примітка тренера: ' + ex.coachMedicalNote);
  lines.push('\nℹ️ У планах для учня така вправа враховується як **нейтральна** щодо медфільтрів.');
  const keyboard = [
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACKS.MY_EX_BACK }],
    [{ text: '📂 До груп', callback_data: CONSTANTS.CALLBACKS.MY_EX_LIST }],
    [{ text: '🔙 До «Тренування»', callback_data: CONSTANTS.CALLBACKS.MENU_TRAINING }]
  ];
  await Helpers.sendKeyboard(chatId, lines.join('\n\n'), keyboard, { parse_mode: 'Markdown' });
}

async function handleBrowseBack(chatId) {
  const state = await State.get(chatId);
  const path = state?.myExBrowsePath || state?.myExPath || [];
  if (!path.length) {
    await showBrowseTopGroups(chatId);
    return;
  }
  const prev = path.slice(0, -1);
  await State.update(chatId, { myExBrowsePath: prev });
  if (!prev.length) {
    await showBrowseTopGroups(chatId);
    return;
  }
  if (prev.length === 1) await showBrowseSecondLevel(chatId, prev[0]);
  else await showBrowseThirdLevel(chatId, prev[0], prev[1]);
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const param = String(callbackData || '').split(':').slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.MY_EX_MENU) {
    await showMyExercisesMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MY_EX_ADD) {
    await showAddTopGroups(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MY_EX_LIST) {
    await showBrowseTopGroups(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MY_EX_BACK) {
    await handleBrowseBack(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MY_EX_TOP) {
    await showBrowseTopGroups(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MY_EX_SKIP_CAT) {
    const pathParts = parsePath(param);
    await promptExerciseName(chatId, pathParts);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MY_EX_GROUP) {
    const seg = parsePath(param);
    if (!seg.length) return false;
    if (seg[0] === 'browse') {
      const rest = seg.slice(1);
      await State.update(chatId, { myExMode: 'browse', myExBrowsePath: rest });
      if (!rest.length) {
        await showBrowseTopGroups(chatId);
        return true;
      }
      if (rest.length === 1) {
        if (rest[0] === '__none__') {
          const list = await supabase.listUserCustomExercisesByGroup(chatId, null, null, null);
          const noCat = list.filter((x) => !x.groupLevel1);
          await showBrowseExerciseList(chatId, noCat, []);
          return true;
        }
        await showBrowseSecondLevel(chatId, rest[0]);
        return true;
      }
      if (rest.length === 2) {
        await showBrowseThirdLevel(chatId, rest[0], rest[1]);
        return true;
      }
      const level3 = rest[2] === '__all__' ? '__all__' : rest[2];
      const exs = await supabase.listUserCustomExercisesByGroup(chatId, rest[0], rest[1], level3 === '__all__' ? null : level3);
      await showBrowseExerciseList(chatId, exs, rest.filter((x) => x !== '__all__'));
      return true;
    }
    const level1 = seg[0];
    if (seg.length === 1) {
      await State.update(chatId, { myExPath: [level1] });
      await showAddSecondLevel(chatId, level1);
      return true;
    }
    if (seg.length === 2) {
      await State.update(chatId, { myExPath: [level1, seg[1]] });
      await showAddThirdLevel(chatId, [level1, seg[1]]);
      return true;
    }
    const pathParts = seg;
    await State.update(chatId, { myExPath: pathParts });
    await promptExerciseName(chatId, pathParts);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MY_EX_ITEM && param) {
    await showCustomExerciseDetail(chatId, param.trim());
    return true;
  }

  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.MY_EX_NAME_INPUT) return false;
  if (state.myExMode !== 'add') return false;
  const name = String(text || '').trim();
  if (name.length < 2) {
    await Helpers.safeSend(chatId, '⚠️ Назва занадто коротка. Введи мінімум 2 символи.');
    return true;
  }
  if (name.length > 120) {
    await Helpers.safeSend(chatId, '⚠️ Назва занадто довга (макс. 120 символів).');
    return true;
  }
  await saveCustomExercise(chatId, name);
  return true;
}

module.exports = {
  showMyExercisesMenu,
  handleCallback,
  handleTextMessage
};
