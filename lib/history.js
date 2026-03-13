/**
 * Історія тренувань (ТЗ_Історія_тренувань_v1_1_FIT3.md)
 * Три точки входу: учень (своя), тренер (своя), тренер (за учня).
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const historyAnalysis = require('./ai/historyAnalysis');
const planGenerator = require('./planGenerator');

// Групи для фільтра (group_level2), порядок та підписи з емодзі
const HIST_GROUP_ORDER = ['Груди', 'Спина', 'Ноги', 'Сідниці', 'Плечі', 'Руки', 'Прес'];
const HIST_GROUP_LABELS = {
  Груди: '💪 Груди',
  Спина: '🔥 Спина',
  Ноги: '🦵 Ноги',
  Сідниці: '🍑 Сідниці',
  Плечі: '🤸 Плечі',
  Руки: '💪 Руки',
  Прес: '🏋️ Прес'
};

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatDateWithTime(dateStr) {
  const d = new Date(dateStr);
  const date = formatDateShort(dateStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

function getEmojiNumber(n) {
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  return n <= 9 ? emojis[n - 1] : `${n}.`;
}

function groupRowsByExercise(rows) {
  const groups = {};
  const exerciseMap = new Map();
  for (const row of rows) {
    const exId = row.exercise_id;
    const gl2 = (row.exercise_library && row.exercise_library.group_level2) ? row.exercise_library.group_level2 : 'Інше';
    if (!exerciseMap.has(exId)) {
      exerciseMap.set(exId, { id: exId, name: row.exercise_name || 'Вправа', groupLevel2: gl2, sets: [] });
    }
    exerciseMap.get(exId).sets.push({
      weight: row.weight,
      reps: row.reps,
      setNum: row.set
    });
  }
  for (const [, ex] of exerciseMap) {
    if (!groups[ex.groupLevel2]) groups[ex.groupLevel2] = [];
    groups[ex.groupLevel2].push(ex);
  }
  return groups;
}

/** Найкращий підхід за добутком weight × reps (модуль «Прогресія в історії»). */
function getBestSet(sets) {
  if (!sets || sets.length === 0) return null;
  return sets.reduce((best, set) => {
    const volume = (set.weight != null ? set.weight : 0) * (set.reps != null ? set.reps : 0);
    const bestVolume = (best.weight != null ? best.weight : 0) * (best.reps != null ? best.reps : 0);
    return volume > bestVolume ? set : best;
  });
}

/**
 * Дельта та маркер порівняння поточного і попереднього найкращого підходу.
 * @returns {{ marker: string|null, weightDelta: number|null, repsDelta: number|null }}
 */
function calcDelta(current, previous) {
  if (!previous) return { marker: null, weightDelta: null, repsDelta: null };
  const wCurr = current && current.weight != null ? current.weight : 0;
  const wPrev = previous.weight != null ? previous.weight : 0;
  const rCurr = current && current.reps != null ? current.reps : 0;
  const rPrev = previous.reps != null ? previous.reps : 0;
  const weightDelta = wCurr - wPrev;
  const repsDelta = rCurr - rPrev;
  let marker;
  if (wCurr === 0 && wPrev === 0) {
    if (repsDelta > 0) marker = '📈';
    else if (repsDelta < 0) marker = '📉';
    else marker = '➡️';
    return { marker, weightDelta: null, repsDelta };
  }
  if (weightDelta > 0 && repsDelta >= 0) marker = '📈';
  else if (weightDelta === 0 && repsDelta > 0) marker = '📈';
  else if (weightDelta < 0 || (weightDelta === 0 && repsDelta < 0)) marker = '📉';
  else if (weightDelta > 0 && repsDelta < 0) marker = '➡️';
  else marker = '➡️';
  return { marker, weightDelta, repsDelta };
}

/** Рядок дельти для найкращого підходу (+X кг / -X повт. тощо). */
function getDeltaSuffix(delta) {
  if (!delta || delta.marker === null) return '';
  const { weightDelta, repsDelta } = delta;
  if (delta.marker === '➡️') return '';
  if (weightDelta != null && weightDelta !== 0) {
    const sign = weightDelta > 0 ? '+' : '';
    return ` (${sign}${weightDelta} кг)`;
  }
  if (repsDelta != null && repsDelta !== 0) {
    const sign = repsDelta > 0 ? '+' : '';
    return ` (${sign}${repsDelta} повт.)`;
  }
  return '';
}

async function formatDetailText(dateStr, rows, groups, targetChatId) {
  const firstDate = rows.length && rows[0].date ? rows[0].date : dateStr;
  const datetime = formatDateWithTime(firstDate);
  const beforeDate = dateStr.length >= 10 ? `${dateStr.slice(0, 10)}T00:00:00` : `${dateStr}T00:00:00`;
  let text = `📅 Тренування: ${datetime}\n\n`;
  let exerciseNum = 1;
  let totalSets = 0;
  let totalExercises = 0;
  for (const [, exercises] of Object.entries(groups)) {
    for (const ex of exercises) {
      const lastPerf = await supabase.getLastExercisePerformance(targetChatId, ex.id, beforeDate);
      const bestSet = getBestSet(ex.sets);
      const delta = calcDelta(bestSet, lastPerf);
      const deltaSuffix = getDeltaSuffix(delta);
      text += `${getEmojiNumber(exerciseNum)} ${ex.name}${delta.marker ? ' ' + delta.marker : ''}\n`;
      if (lastPerf) {
        text += `   ⏮ Попередній макс: ${lastPerf.weight}кг × ${lastPerf.reps} повт.\n`;
      }
      for (const s of ex.sets) {
        const isBest = bestSet === s;
        const suffix = isBest ? deltaSuffix : '';
        text += `   Підхід ${s.setNum}: ${s.weight != null ? s.weight : '—'}кг × ${s.reps != null ? s.reps : '—'} повторів${suffix}\n`;
        totalSets++;
      }
      text += '\n';
      exerciseNum++;
      totalExercises++;
    }
  }
  text += `📊 Всього вправ: ${totalExercises}\n`;
  text += `💪 Всього підходів: ${totalSets}`;
  return text;
}

function formatWorkoutListItem(dateStr, rows) {
  const date = formatDateShort(dateStr);
  const groups = [...new Set(rows.map((r) => r.exercise_library && r.exercise_library.group_level2).filter(Boolean))];
  const exerciseCount = new Set(rows.map((r) => r.exercise_id)).size;
  const setCount = rows.length;
  const groupStr = groups.length ? groups.join('+') : '—';
  return `📅 ${date} — ${groupStr} (${exerciseCount} вправ, ${setCount} підходів)`;
}

function validateHistCount(input) {
  const n = parseInt(String(input).trim(), 10);
  if (Number.isNaN(n) || n < 1 || n > 100) return { valid: false };
  return { valid: true, value: n };
}

/** Відкрити меню фільтрів історії. */
async function showHistoryMenu(chatId, targetChatId, origin) {
  await State.update(chatId, {
    histTargetChatId: targetChatId,
    histOrigin: origin,
    histFilter: null,
    histFilterGroup: null,
    histFilterExerciseId: null,
    histDates: [],
    histCurrentIndex: 0,
    step: CONSTANTS.FSM_STATES.HIST_MENU
  });
  let title = '📊 Моя історія тренувань';
  let keyboard = [
    [{ text: '📋 Всі тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_FILTER + ':all' }],
    [{ text: '💪 За групою м\'язів', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_FILTER + ':group' }],
    [{ text: '🎯 За вправою', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_FILTER + ':exercise' }]
  ];
  if (origin === 'coach_student') {
    const user = await User.getByChatId(targetChatId);
    const name = user ? [(user.firstName || user.first_name || '').trim(), (user.lastName || user.last_name || '').trim()].filter(Boolean).join(' ') : 'Учень';
    title = `📊 Історія тренувань — ${name}`;
    keyboard.push(
      [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_STUDENT }],
      [{ text: (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME ? CONSTANTS.EMOJI.HOME : '🏠') + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    );
  } else {
    keyboard.push(
      [{ text: (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME ? CONSTANTS.EMOJI.HOME : '🏠') + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    );
  }
  await Helpers.sendKeyboard(chatId, title + '\n\nОберіть фільтр:', keyboard);
}

/** Підфільтри: Попереднє тренування / Останні N. */
async function showSubfilterMenu(chatId) {
  const state = await State.get(chatId);
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.HIST_SUBFILTER });
  const keyboard = [
    [{ text: '⏮ Попереднє тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_SUB + ':prev' }],
    [{ text: '📋 Останні N тренувань', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_SUB + ':last_n' }],
    [{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_MENU }]
  ];
  await Helpers.sendKeyboard(chatId, 'Який період показати?', keyboard);
}

/** Вибір групи м\'язів (для фільтрів group / exercise). */
async function showGroupFilter(chatId) {
  const state = await State.get(chatId);
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.HIST_GROUP_SELECT });
  const keyboard = [];
  const row = [];
  for (const g of HIST_GROUP_ORDER) {
    const label = HIST_GROUP_LABELS[g] || g;
    row.push({ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_GROUP + ':' + g });
    if (row.length >= 2) {
      keyboard.push([...row]);
      row.length = 0;
    }
  }
  if (row.length) keyboard.push(row);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_MENU }]);
  await Helpers.sendKeyboard(chatId, 'Оберіть групу м\'язів:', keyboard);
}

/** Список вправ учня по вибраній групі (для фільтру «За вправою»). */
async function showExerciseFilter(chatId) {
  const state = await State.get(chatId);
  const targetChatId = state.histTargetChatId || chatId;
  const groupLevel2 = state.histFilterGroup;
  const exercises = await supabase.getExercisesTrainedByStudent(targetChatId, groupLevel2);
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.HIST_EX_SELECT });
  if (!exercises || !exercises.length) {
    await Helpers.sendKeyboard(
      chatId,
      'Вправ з цієї групи ще немає.',
      [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_GROUP }]]
    );
    return;
  }
  const keyboard = exercises.slice(0, 30).map((ex) => [
    { text: (ex.name || 'Вправа').slice(0, 40), callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_EX + ':' + ex.id }
  ]);
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_GROUP }]);
  await Helpers.sendKeyboard(chatId, 'Оберіть вправу:', keyboard);
}

/** Запит кількості тренувань N (1–100). */
async function askHistoryCount(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.HIST_COUNT_INPUT });
  const keyboard = [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_SUBFILTER }]];
  await Helpers.sendKeyboard(chatId, 'Скільки тренувань показати?\nВведіть число від 1 до 100:', keyboard);
}

/** Список дат тренувань кнопками. */
async function showHistoryList(chatId) {
  const state = await State.get(chatId);
  const targetChatId = state.histTargetChatId || chatId;
  const dates = state.histDates || [];
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.HIST_LIST });
  if (!dates.length) {
    await Helpers.sendKeyboard(
      chatId,
      'За цим фільтром тренувань ще немає.',
      [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_SUBFILTER }]]
    );
    return;
  }
  const keyboard = [];
  for (const dateStr of dates) {
    const rows = await supabase.getWorkoutByDate(targetChatId, dateStr);
    const label = formatWorkoutListItem(dateStr, rows);
    keyboard.push([{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_VIEW + ':' + dateStr }]);
  }
  if (process.env.AI_ENABLED === 'true' && state.histFilter === 'exercise' && dates.length >= 2 && state.histFilterExerciseId != null) {
    keyboard.push([
      {
        text: '🤖 Аналіз прогресу',
        callback_data: 'HIST_AI_PROGRESS:' + state.histFilterExerciseId
      }
    ]);
  }
  keyboard.push([{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_SUBFILTER }]);
  await Helpers.sendKeyboard(chatId, `📋 Тренування (всього: ${dates.length}):`, keyboard);
}

/** Деталі одного тренування з навігацією Попереднє/Наступне. */
async function showHistoryDetail(chatId) {
  const state = await State.get(chatId);
  const targetChatId = state.histTargetChatId || chatId;
  const dates = state.histDates || [];
  const idx = state.histCurrentIndex != null ? state.histCurrentIndex : 0;
  const dateStr = dates[idx];
  if (!dateStr) {
    await Helpers.safeSend(chatId, 'Тренувань ще немає.');
    return;
  }
  const rows = await supabase.getWorkoutByDate(targetChatId, dateStr);
  if (!rows || !rows.length) {
    await Helpers.safeSend(chatId, 'Немає записів за цю дату.');
    return;
  }
  const groups = groupRowsByExercise(rows);
  const text = await formatDetailText(dateStr, rows, groups, targetChatId);
  const keyboard = [];
  const nav = [];
  if (idx < dates.length - 1) {
    nav.push({ text: '◀️ Попереднє', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_PREV });
  }
  if (idx > 0) {
    nav.push({ text: '▶️ Наступне', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_NEXT });
  }
  if (nav.length) keyboard.push(nav);
  if (process.env.AI_ENABLED === 'true') {
    keyboard.push([
      {
        text: '🤖 Аналіз тренування',
        callback_data: 'HIST_AI_ANALYZE:' + dateStr
      }
    ]);
  }
  const backCb = state.histDetailOrigin === 'list' ? CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_LIST : CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_SUBFILTER;
  keyboard.push([{ text: '🔙 Назад', callback_data: backCb }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

/** Завантажити дати за поточним фільтром (для subfilter prev та count input). */
async function loadDatesForCurrentFilter(state, limit) {
  const targetChatId = state.histTargetChatId;
  const filter = state.histFilter;
  if (filter === 'all') {
    return await supabase.getWorkoutDates(targetChatId, limit);
  }
  if (filter === 'group' && state.histFilterGroup) {
    return await supabase.getWorkoutDatesByMuscleGroup(targetChatId, state.histFilterGroup, limit);
  }
  if (filter === 'exercise' && state.histFilterExerciseId != null) {
    return await supabase.getWorkoutDatesByExercise(targetChatId, state.histFilterExerciseId, limit);
  }
  return [];
}

/** Обробка callback (викликається з router для HIST_*). Повертає true якщо оброблено. */
async function handleCallback(chatId, callbackData) {
  const full = String(callbackData);
  const action = full.split(':')[0];
  const param = full.split(':').slice(1).join(':').trim();
  let state = await State.get(chatId);
  const targetChatId = state?.histTargetChatId || chatId;
  const origin = state?.histOrigin || 'self';

  if (action === 'HIST_AI_ANALYZE') {
    const dateStr = param;
    const rows = await supabase.getWorkoutByDate(targetChatId, dateStr);
    if (!rows || !rows.length) {
      await Helpers.safeSend(chatId, 'Немає даних за це тренування для аналізу.');
      return true;
    }
    const userProfileRow = await supabase.getUserByChatId(targetChatId);
    const expDays = planGenerator.getExperienceDays(userProfileRow || {});
    const level = planGenerator.getLevelFromExperienceDays(expDays);
    const userProfile = {
      firstName: userProfileRow?.firstName || userProfileRow?.first_name || '',
      goal: userProfileRow?.goal || 'keep',
      level,
      gender: userProfileRow?.gender || ''
    };
    const role = String(chatId) === String(targetChatId) && userProfileRow?.role === CONSTANTS.ROLES.COACH ? 'coach' : 'student';
    const analysis = await historyAnalysis.getWorkoutAnalysisCached(targetChatId, dateStr, rows, userProfile, role);
    if (!analysis) {
      await Helpers.safeSend(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
      return true;
    }
    const loadingMsg = await Helpers.safeSend(chatId, '🤖 Аналізую дані...');
    const text = '🤖 AI-аналіз:\n\n' + analysis;
    await Helpers.sendKeyboard(chatId, text, [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_VIEW + ':' + dateStr }]]);
    return true;
  }

  if (action === 'HIST_AI_PROGRESS') {
    const exerciseId = parseInt(param, 10);
    if (!Number.isNaN(exerciseId)) {
      const dates = await supabase.getWorkoutDatesByExercise(targetChatId, exerciseId, 999);
      if (!dates || dates.length < 2) {
        await Helpers.sendKeyboard(
          chatId,
          'Потрібно щонайменше 2 тренування з цією вправою для аналізу прогресу.',
          [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_LIST }]]
        );
        return true;
      }
      const exerciseRows = [];
      for (const d of dates) {
        const dayRows = await supabase.getWorkoutByDate(targetChatId, d);
        exerciseRows.push(...dayRows.filter((r) => r.exercise_id === exerciseId));
      }
      const exerciseName = exerciseRows[0]?.exercise_name || 'Вправа';
      const profileRow = await supabase.getUserByChatId(targetChatId);
      const expDays = planGenerator.getExperienceDays(profileRow || {});
      const level = planGenerator.getLevelFromExperienceDays(expDays);
      const userProfile = {
        firstName: profileRow?.firstName || profileRow?.first_name || '',
        goal: profileRow?.goal || 'keep',
        level
      };
      const role = String(chatId) === String(targetChatId) && profileRow?.role === CONSTANTS.ROLES.COACH ? 'coach' : 'student';
      const loadingMsg = await Helpers.safeSend(chatId, '🤖 Аналізую дані...');
      const analysis = await historyAnalysis.getExerciseProgressCached(
        targetChatId,
        exerciseId,
        exerciseRows,
        exerciseName,
        userProfile,
        role
      );
      if (!analysis) {
        await Helpers.safeSend(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
        return true;
      }
      const text = '🤖 AI-аналіз:\n\n' + analysis;
      await Helpers.sendKeyboard(chatId, text, [[{ text: '🔙 Назад', callback_data: CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_LIST }]]);
      return true;
    }
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_STUDENT) {
    const Coach = require('./coach');
    await Coach.showStudentProfile(chatId, targetChatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_MENU) {
    await showHistoryMenu(chatId, targetChatId, origin);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_GROUP) {
    await showGroupFilter(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_SUBFILTER) {
    await showSubfilterMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_BACK_LIST) {
    await showHistoryList(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_FILTER && param) {
    await State.update(chatId, { histFilter: param, histFilterGroup: null, histFilterExerciseId: null });
    if (param === 'all') {
      await showSubfilterMenu(chatId);
    } else {
      await showGroupFilter(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_GROUP && param) {
    await State.update(chatId, { histFilterGroup: param });
    state = await State.get(chatId);
    if (state.histFilter === 'group') {
      await showSubfilterMenu(chatId);
    } else {
      await showExerciseFilter(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_EX && param) {
    const exerciseId = parseInt(param, 10);
    if (!Number.isNaN(exerciseId)) {
      await State.update(chatId, { histFilterExerciseId: exerciseId });
      await showSubfilterMenu(chatId);
    }
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_SUB && param === 'prev') {
    state = await State.get(chatId);
    const dates = await loadDatesForCurrentFilter(state, 1);
    if (!dates.length) {
      await Helpers.safeSend(chatId, 'Тренувань ще немає.');
      await showSubfilterMenu(chatId);
      return true;
    }
    await State.update(chatId, { histDates: dates, histCurrentIndex: 0, histDetailOrigin: 'prev' });
    await showHistoryDetail(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_SUB && param === 'last_n') {
    await askHistoryCount(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_VIEW && param) {
    state = await State.get(chatId);
    const dates = state.histDates || [];
    const idx = dates.indexOf(param);
    await State.update(chatId, { histCurrentIndex: idx >= 0 ? idx : 0, histDetailOrigin: 'list' });
    await showHistoryDetail(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_PREV) {
    state = await State.get(chatId);
    const dates = state.histDates || [];
    let idx = state.histCurrentIndex != null ? state.histCurrentIndex : 0;
    if (idx < dates.length - 1) idx++;
    await State.update(chatId, { histCurrentIndex: idx });
    await showHistoryDetail(chatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.HIST_NEXT) {
    state = await State.get(chatId);
    let idx = state.histCurrentIndex != null ? state.histCurrentIndex : 0;
    if (idx > 0) idx--;
    await State.update(chatId, { histCurrentIndex: idx });
    await showHistoryDetail(chatId);
    return true;
  }

  return false;
}

module.exports = {
  showHistoryMenu,
  showSubfilterMenu,
  showGroupFilter,
  showExerciseFilter,
  askHistoryCount,
  showHistoryList,
  showHistoryDetail,
  loadDatesForCurrentFilter,
  validateHistCount,
  handleCallback,
  formatDateShort,
  formatDateWithTime,
  getEmojiNumber
};
