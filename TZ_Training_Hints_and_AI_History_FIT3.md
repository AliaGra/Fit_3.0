# ТЗ: Підказки під час тренування + AI-аналіз в модулі «Історія» — FIT 3.0

**Версія:** 1.0
**Дата:** березень 2026
**Для:** Cursor AI
**Залежність:** ТЗ_Історія_тренувань_v1_1_FIT3.md — реалізувати першим

---

## 1. Контекст і що реалізуємо

### 1.1 Що вже є в системі

AI підключений до трьох точок:
- `lib/ai/planComments.js` — коментарі до вправ плану
- `lib/ai/smartReminder.js` — розумні нагадування
- `lib/ai/failureAnalysis.js` — аналіз невиконання вправ

Інфраструктура:
- `lib/ai/aiClient.js` — клієнт OpenAI, перевірка AI_ENABLED
- `lib/ai/aiPrompts.js` — системні промпти
- Таблиця `ai_generated_content` — кеш AI-відповідей

### 1.2 Чотири нові точки

| # | Точка | Де | Хто бачить | Залежить від AI |
|---|---|---|---|---|
| 1 | **Підказка з минулими результатами** | У тексті повідомлення під час тренування (підхід 1) | Всі | Ні — завжди |
| 2 | **Аналіз одного тренування** | Кнопка в деталях тренування (Історія) | Всі (свої дані) | Так — AI_ENABLED |
| 3 | **Прогрес по вправі** | Після списку в фільтрі «за вправою» (Історія) | Всі (свої дані) | Так — AI_ENABLED |
| 4 | **Тижневий дайджест** | Cron щопонеділка → тренеру | Тільки тренер | Так — AI_ENABLED |

### 1.3 Тон AI-відповідей

- **Учень:** цифри + короткий мотивуючий коментар (як тренер-друг)
- **Тренер (свої дані):** технічний — цифри + факти + рекомендація
- **Тренер дивиться на учня:** завжди тон 'student' (targetChatId !== chatId)
- **Дайджест по учню:** стисло, технічно, для прийняття рішення тренером

---

## 2. Фіча 1: Підказка з минулими результатами під час тренування

### 2.1 Бізнес-правила

| Правило | Значення |
|---|---|
| Коли показувати | Тільки перед підходом №1 вправи (`currentSet === 1`) |
| Підходи 2, 3, … | Підказка не показується |
| Якщо немає історії | Показати рядок «Перше тренування з цією вправою» |
| Що показувати | Останнє тренування (дата + всі підходи) + рекорд ever (якщо вищий за останнє) |
| Чиї дані | Завжди `targetChatId` (учень або сам тренер/учень) |
| Хто бачить | Всі: учень за планом, тренер своє, тренер веде учня |
| Нові таблиці | Немає |
| Нові FSM-стани | Немає |

### 2.2 Вигляд повідомлення

**Є історія:**
```
Жим штанги лежачи — Підхід 1/3

Минулого разу (05 берез.): 75кг x 8, 75кг x 7, 70кг x 8
Рекорд: 80кг x 6

Введи вагу (кг):
```

**Перше тренування з вправою:**
```
Жим штанги лежачи — Підхід 1/3

Перше тренування з цією вправою

Введи вагу (кг):
```

**Підходи 2, 3, … (без підказки):**
```
Жим штанги лежачи — Підхід 2/3

Введи вагу (кг):
```

Рядок «Рекорд» показується тільки якщо рекордна вага вища за максимальну вагу останнього тренування. Якщо останнє тренування і є рекордне — рядок не дублюється.

Без Markdown (VETO 6) — без зірочок, жирного, курсиву.

---

## 3. Таблиця ai_generated_content — нові content_type

Без ALTER TABLE — просто нові рядки з новими значеннями `content_type`:

```
'workout_analysis'   — аналіз тренування   (ref_id = dateStr '2026-02-01')
'exercise_progress'  — прогрес по вправі   (ref_id = exerciseId як рядок)
'weekly_digest'      — тижневий дайджест   (ref_id = 'week_YYYY-WW')
```

Кеш TTL:
- `workout_analysis` → 24 год по (chat_id, content_type, ref_id)
- `exercise_progress` → 24 год по (chat_id, content_type, ref_id)
- `weekly_digest` → не кешується, cron завжди генерує новий

---

## 4. Нові функції lib/supabase.js

Всі шість функцій додаються в один файл. Додати до `module.exports`.

### 4.1 getLastWorkoutByExercise(chatId, exerciseId, excludeDate)
*(для підказки під час тренування)*

```js
async function getLastWorkoutByExercise(chatId, exerciseId, excludeDate) {
  // Крок 1: знайти останню дату перед сьогодні
  const { data: dateRow } = await supabase
    .from('bot_training_data')
    .select('date')
    .eq('chat_id', String(chatId))
    .eq('exercise_id', exerciseId)
    .lt('date', `${excludeDate}T00:00:00`)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!dateRow) return null;

  const lastDate = dateRow.date.slice(0, 10);

  // Крок 2: всі підходи цієї дати
  const { data: rows } = await supabase
    .from('bot_training_data')
    .select('weight, reps, set')
    .eq('chat_id', String(chatId))
    .eq('exercise_id', exerciseId)
    .gte('date', `${lastDate}T00:00:00`)
    .lt('date', `${lastDate}T23:59:59`)
    .order('set', { ascending: true });

  return { date: lastDate, rows: rows || [] };
}
```

### 4.2 getBestSetByExercise(chatId, exerciseId)
*(для підказки під час тренування)*

```js
async function getBestSetByExercise(chatId, exerciseId) {
  const { data } = await supabase
    .from('bot_training_data')
    .select('weight, reps')
    .eq('chat_id', String(chatId))
    .eq('exercise_id', exerciseId)
    .not('weight', 'is', null)
    .order('weight', { ascending: false })
    .order('reps', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null; // { weight, reps } або null
}
```

### 4.3 getAiCache(chatId, contentType, refId)
*(для AI-аналізу)*

```js
async function getAiCache(chatId, contentType, refId) {
  const { data } = await supabase
    .from('ai_generated_content')
    .select('content, created_at')
    .eq('chat_id', String(chatId))
    .eq('content_type', contentType)
    .eq('ref_id', refId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const age = Date.now() - new Date(data.created_at).getTime();
  if (age > 24 * 60 * 60 * 1000) return null;
  return data.content;
}
```

### 4.4 setAiCache(chatId, contentType, refId, content)
*(для AI-аналізу)*

```js
async function setAiCache(chatId, contentType, refId, content) {
  await supabase.from('ai_generated_content').insert({
    id: crypto.randomUUID(),
    chat_id: String(chatId),
    content_type: contentType,
    ref_id: String(refId),
    content,
    created_at: new Date().toISOString()
  });
}
```

### 4.5 getAllCoaches()
*(для тижневого дайджесту)*

```js
async function getAllCoaches() {
  const { data } = await supabase
    .from('users')
    .select('chat_id, first_name, last_name')
    .eq('role', 'coach')
    .eq('is_archived', false);
  return data || [];
}
```

### 4.6 getStudentsByCoachId(coachChatId)
*(для тижневого дайджесту)*

```js
async function getStudentsByCoachId(coachChatId) {
  const { data } = await supabase
    .from('users')
    .select('chat_id, first_name, last_name, goal, training_days_per_week, experience_start_date')
    .eq('coach_id', String(coachChatId))
    .eq('role', 'student')
    .eq('is_archived', false);
  return data || [];
}
```

---

## 5. Нові функції lib/training.js

### 5.1 buildExerciseHint(chatId, exerciseId)
*(підказка перед підходом 1)*

```js
async function buildExerciseHint(chatId, exerciseId) {
  const today = new Date().toISOString().slice(0, 10);

  const [lastWorkout, bestSet] = await Promise.all([
    supabase.getLastWorkoutByExercise(chatId, exerciseId, today),
    supabase.getBestSetByExercise(chatId, exerciseId)
  ]);

  // Немає жодної історії
  if (!lastWorkout && !bestSet) {
    return 'Перше тренування з цією вправою';
  }

  let hint = '';

  // Останнє тренування
  if (lastWorkout && lastWorkout.rows.length > 0) {
    const dateStr = formatHintDate(lastWorkout.date);
    const setsText = lastWorkout.rows
      .map(r => `${r.weight}кг x ${r.reps}`)
      .join(', ');
    hint += `Минулого разу (${dateStr}): ${setsText}`;
  }

  // Рекорд — показувати тільки якщо вищий за останнє тренування
  if (bestSet) {
    const lastMaxWeight = lastWorkout
      ? Math.max(...lastWorkout.rows.map(r => r.weight || 0))
      : 0;

    if (bestSet.weight > lastMaxWeight) {
      if (hint) hint += '\n';
      hint += `Рекорд: ${bestSet.weight}кг x ${bestSet.reps}`;
    }
  }

  return hint || 'Перше тренування з цією вправою';
}

// Допоміжна: скорочена дата без року — «05 берез.»
function formatHintDate(dateStr) {
  const months = [
    'січ.','лют.','берез.','квіт.','трав.','черв.',
    'лип.','серп.','вер.','жовт.','лист.','груд.'
  ];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
```

Додати до `module.exports`: `buildExerciseHint`.

### 5.2 Інтеграція підказки в потоки тренування

Підказка додається тільки при `currentSet === 1` у трьох функціях:

**Тренування за планом — showStudentPlanExercise:**
```js
let hintLine = '';
if (currentSet === 1) {
  hintLine = await buildExerciseHint(targetChatId, exercise.exercise_id);
}

const text = [
  `${exercise.name} — Підхід ${currentSet}/${exercise.sets}`,
  '',
  hintLine,
  '',
  'Введи вагу (кг):'
].join('\n').replace(/\n{3,}/g, '\n\n');
```

**Вільне тренування — askTrainingInputDataWithPlannedSets:**
```js
let hintLine = '';
if (currentSet === 1) {
  const hintChatId = userState.trainingTargetChatId || chatId;
  hintLine = await buildExerciseHint(hintChatId, exerciseId);
}

const text = [
  `${exerciseName} — Підхід ${currentSet}/${plannedSetsCount}`,
  '',
  hintLine,
  '',
  'Введи вагу (кг):'
].join('\n').replace(/\n{3,}/g, '\n\n');
```

**Сет-кола — askTrainingInputForSetCircuit:**
```js
// Показувати тільки в першому крузі (currentRound === 1)
let hintLine = '';
if (currentRound === 1) {
  const hintChatId = userState.trainingTargetChatId || chatId;
  hintLine = await buildExerciseHint(hintChatId, exerciseId);
}
```

---

## 6. Новий файл lib/ai/historyAnalysis.js

### 6.1 analyzeWorkout(rows, userProfile, role)

```js
async function analyzeWorkout(rows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildWorkoutAnalysisPrompt(rows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildWorkoutAnalysisPrompt(rows, userProfile, role) {
  const grouped = groupRowsForPrompt(rows);
  const dataText = formatRowsForPrompt(grouped);

  if (role === 'student') {
    return `Ти фітнес-тренер. Проаналізуй одне тренування учня.
Учень: ${userProfile.firstName}, ціль: ${userProfile.goal}, рівень: ${userProfile.level}.

Дані тренування:
${dataText}

Формат відповіді:
- 1-2 конкретні факти з цифрами (що добре, що впало)
- 1 коротка порада на наступне тренування
Стиль: як тренер-друг, просто і по суті. 4-6 речень. Мова: українська.`;
  }

  return `Ти спортивний аналітик. Проаналізуй тренування тренера.
Ціль: ${userProfile.goal}, рівень: ${userProfile.level}.

Дані тренування:
${dataText}

Технічний аналіз:
- Динаміка ваги/повторів по підходах (де падіння, де стабільно)
- Оцінка структури (баланс груп м'язів, обсяг)
- 1 рекомендація
Стиль: технічний, з цифрами. 5-7 речень. Мова: українська.`;
}
```

### 6.2 analyzeExerciseProgress(exerciseName, allRows, userProfile, role)

```js
async function analyzeExerciseProgress(exerciseName, allRows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildProgressPrompt(exerciseName, allRows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildProgressPrompt(exerciseName, allRows, userProfile, role) {
  const byDate = groupByDate(allRows);

  const trend = byDate.map(d =>
    `${formatDateShort(d.date)}: ${d.maxWeight}кг x ${Math.round(d.avgReps)} повт (${d.sets} підх)`
  ).join('\n');

  const first = byDate[0];
  const last = byDate[byDate.length - 1];
  const weightGrowth = last.maxWeight - first.maxWeight;
  const sessions = byDate.length;

  if (role === 'student') {
    return `Ти фітнес-тренер. Проаналізуй прогрес учня у вправі.
Учень: ${userProfile.firstName}, ціль: ${userProfile.goal}.
Вправа: ${exerciseName}, тренувань: ${sessions}.

Динаміка:
${trend}

Зміна ваги: ${weightGrowth >= 0 ? '+' : ''}${weightGrowth}кг

Відповідь:
- Факт прогресу з цифрами
- Темп (швидко / нормально / повільно)
- 1 конкретна порада
Стиль: просто, з підтримкою. 4-5 речень. Мова: українська.`;
  }

  return `Ти спортивний аналітик. Оціни динаміку тренера у вправі.
Вправа: ${exerciseName}, тренувань: ${sessions}.
Ціль: ${userProfile.goal}, рівень: ${userProfile.level}.

Динаміка:
${trend}

Зміна ваги: ${weightGrowth >= 0 ? '+' : ''}${weightGrowth}кг

Технічний аналіз:
- Темп прогресу (кг/тиждень)
- Стабільність повторів
- Рекомендація щодо подальшої прогресії
5-7 речень. Мова: українська.`;
}
```

### 6.3 buildWeeklyDigest(coachProfile, studentDigests)

```js
async function buildWeeklyDigest(coachProfile, studentDigests) {
  if (!aiClient.isEnabled()) return null;

  const results = [];
  for (const { student, weekRows, plannedDays } of studentDigests) {
    const prompt = buildStudentWeekPrompt(student, weekRows, plannedDays);
    const summary = await aiClient.complete(prompt, { maxTokens: 250 });
    results.push({ student, summary });
  }
  return results;
}

function buildStudentWeekPrompt(student, weekRows, plannedDays) {
  const actualDays = countUniqueDates(weekRows);
  const exercises = formatWeekRowsForPrompt(weekRows);

  return `Ти фітнес-аналітик. Стислий огляд тижня учня для тренера.
Учень: ${student.first_name} ${student.last_name || ''}, ціль: ${student.goal}, рівень: ${student.level || 'не вказано'}.
Заплановано: ${plannedDays} тренування/тиждень. Проведено: ${actualDays}.

Виконані тренування:
${exercises || 'Тренувань за тиждень не було.'}

Огляд у форматі:
1. Відвідуваність (факт/план)
2. Найкращий результат тижня (якщо є)
3. Що потребує уваги (якщо є)
Максимум 4 речення. Стиль: технічний, для тренера. Мова: українська.`;
}
```

### 6.4 Допоміжні функції та обгортки з кешем

```js
function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(row);
  }
  return Array.from(map, ([date, rws]) => ({
    date,
    maxWeight: Math.max(...rws.map(r => r.weight || 0)),
    avgReps: rws.reduce((s, r) => s + (r.reps || 0), 0) / rws.length,
    sets: rws.length
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function groupRowsForPrompt(rows) {
  const groups = {};
  const exerciseMap = new Map();
  for (const row of rows) {
    const exId = row.exercise_id;
    const gl2 = row.exercise_library?.group_level2 || 'Інше';
    if (!exerciseMap.has(exId)) exerciseMap.set(exId, { name: row.exercise_name, gl2, sets: [] });
    exerciseMap.get(exId).sets.push({ weight: row.weight, reps: row.reps });
  }
  for (const [, ex] of exerciseMap) {
    if (!groups[ex.gl2]) groups[ex.gl2] = [];
    groups[ex.gl2].push(ex);
  }
  return groups;
}

function formatRowsForPrompt(grouped) {
  let text = '';
  for (const [group, exercises] of Object.entries(grouped)) {
    text += `${group}:\n`;
    for (const ex of exercises) {
      const setsText = ex.sets.map(s => `${s.weight}кг x ${s.reps}`).join(', ');
      text += `- ${ex.name}: ${setsText}\n`;
    }
  }
  return text.trim();
}

function formatWeekRowsForPrompt(weekRows) {
  if (!weekRows.length) return '';
  const byDate = {};
  for (const row of weekRows) {
    const day = row.date.slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(row);
  }
  return Object.entries(byDate).map(([date, rows]) => {
    const names = [...new Map(rows.map(r => [r.exercise_id, r.exercise_name])).values()];
    return `${formatDateShort(date)}: ${names.join(', ')}`;
  }).join('\n');
}

function countUniqueDates(rows) {
  return new Set(rows.map(r => r.date.slice(0, 10))).size;
}

function formatDateShort(dateStr) {
  const months = [
    'січ.','лют.','берез.','квіт.','трав.','черв.',
    'лип.','серп.','вер.','жовт.','лист.','груд.'
  ];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// Обгортки з кешем
async function getWorkoutAnalysisCached(chatId, dateStr, rows, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'workout_analysis', dateStr);
  if (cached) return cached;
  const result = await analyzeWorkout(rows, userProfile, role);
  if (result) await supabase.setAiCache(chatId, 'workout_analysis', dateStr, result);
  return result;
}

async function getExerciseProgressCached(chatId, exerciseId, allRows, exerciseName, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'exercise_progress', String(exerciseId));
  if (cached) return cached;
  const result = await analyzeExerciseProgress(exerciseName, allRows, userProfile, role);
  if (result) await supabase.setAiCache(chatId, 'exercise_progress', String(exerciseId), result);
  return result;
}

module.exports = {
  getWorkoutAnalysisCached,
  getExerciseProgressCached,
  buildWeeklyDigest
};
```

---

## 7. Зміни в lib/history.js

### 7.1 showHistoryDetail — кнопка AI-аналізу тренування

```js
// Після формування навігаційних кнопок — додати перед [🔙 Назад]:
if (process.env.AI_ENABLED === 'true') {
  keyboard.push([{
    text: '🤖 Аналіз тренування',
    callback_data: `HIST_AI_ANALYZE:${dateStr}`
  }]);
}
```

### 7.2 showHistoryList — кнопка AI-прогресу по вправі

```js
// Після списку кнопок з датами:
if (
  process.env.AI_ENABLED === 'true' &&
  histState.histFilter === 'exercise' &&
  histState.histDates.length >= 2
) {
  keyboard.push([{
    text: '🤖 Аналіз прогресу',
    callback_data: `HIST_AI_PROGRESS:${histState.histFilterExerciseId}`
  }]);
}
```

### 7.3 Нові функції відображення

```js
async function showAiAnalysis(bot, chatId, analysisText, backCallback) {
  const text = `🤖 AI-аналіз:\n\n${analysisText}`;
  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: backCallback }]]
    }
  });
}

async function showAiLoading(bot, chatId) {
  return await bot.sendMessage(chatId, '🤖 Аналізую дані...');
}

module.exports = {
  // ...існуючі exports...
  showAiAnalysis,
  showAiLoading
};
```

---

## 8. Нові callback handlers в lib/router.js

```js
// ─── AI АНАЛІЗ ТРЕНУВАННЯ ────────────────────────────────────────────────────

if (data.startsWith('HIST_AI_ANALYZE:')) {
  const dateStr = data.slice('HIST_AI_ANALYZE:'.length);
  const targetChatId = userState.histTargetChatId;
  const loadingMsg = await history.showAiLoading(bot, chatId);

  try {
    const rows = await supabase.getWorkoutByDate(targetChatId, dateStr);
    const profile = await supabase.getUserByChatId(targetChatId);
    const expDays = planGenerator.getExperienceDays(profile);
    const level = planGenerator.getLevelFromExperienceDays(expDays);
    const userProfile = {
      firstName: profile.first_name,
      goal: profile.goal || 'keep',
      level,
      gender: profile.gender
    };

    const role = (String(chatId) === String(targetChatId) && user.role === 'coach')
      ? 'coach' : 'student';

    const analysis = await historyAnalysis.getWorkoutAnalysisCached(
      targetChatId, dateStr, rows, userProfile, role
    );

    await bot.deleteMessage(chatId, loadingMsg.message_id);

    if (!analysis) {
      await bot.sendMessage(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
      return;
    }

    await history.showAiAnalysis(bot, chatId, analysis, `HIST_VIEW:${dateStr}`);

  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, 'Помилка при отриманні аналізу. Спробуйте пізніше.');
    console.error('HIST_AI_ANALYZE error:', err);
  }
  return;
}

// ─── AI ПРОГРЕС ПО ВПРАВІ ────────────────────────────────────────────────────

if (data.startsWith('HIST_AI_PROGRESS:')) {
  const exerciseId = parseInt(data.split(':')[1]);
  const targetChatId = userState.histTargetChatId;
  const loadingMsg = await history.showAiLoading(bot, chatId);

  try {
    const dates = await supabase.getWorkoutDatesByExercise(targetChatId, exerciseId, 999);

    if (dates.length < 2) {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      await bot.sendMessage(chatId,
        'Потрібно щонайменше 2 тренування з цією вправою для аналізу прогресу.',
        { reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'HIST_BACK_LIST' }]] } }
      );
      return;
    }

    const exerciseRows = [];
    for (const d of dates) {
      const dayRows = await supabase.getWorkoutByDate(targetChatId, d);
      exerciseRows.push(...dayRows.filter(r => r.exercise_id === exerciseId));
    }

    const exerciseName = exerciseRows[0]?.exercise_name || 'Вправа';
    const profile = await supabase.getUserByChatId(targetChatId);
    const expDays = planGenerator.getExperienceDays(profile);
    const level = planGenerator.getLevelFromExperienceDays(expDays);
    const userProfile = {
      firstName: profile.first_name,
      goal: profile.goal || 'keep',
      level
    };
    const role = (String(chatId) === String(targetChatId) && user.role === 'coach')
      ? 'coach' : 'student';

    const analysis = await historyAnalysis.getExerciseProgressCached(
      targetChatId, exerciseId, exerciseRows, exerciseName, userProfile, role
    );

    await bot.deleteMessage(chatId, loadingMsg.message_id);

    if (!analysis) {
      await bot.sendMessage(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
      return;
    }

    await history.showAiAnalysis(bot, chatId, analysis, 'HIST_BACK_LIST');

  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, 'Помилка при отриманні аналізу. Спробуйте пізніше.');
    console.error('HIST_AI_PROGRESS error:', err);
  }
  return;
}
```

---

## 9. Новий файл lib/weeklyDigest.js

```js
const supabase = require('./supabase');
const historyAnalysis = require('./ai/historyAnalysis');
const aiClient = require('./ai/aiClient');

async function sendWeeklyDigests(bot) {
  if (!aiClient.isEnabled()) return;

  const coaches = await supabase.getAllCoaches();

  for (const coach of coaches) {
    try {
      const students = await supabase.getStudentsByCoachId(coach.chat_id);
      if (!students.length) continue;

      const studentDigests = [];
      for (const student of students) {
        const weekRows = await getWeekRows(student.chat_id);
        const plannedDays = student.training_days_per_week || 3;
        studentDigests.push({ student, weekRows, plannedDays });
      }

      const anyActivity = studentDigests.some(d => d.weekRows.length > 0);
      if (!anyActivity) continue;

      const digests = await historyAnalysis.buildWeeklyDigest(
        { firstName: coach.first_name },
        studentDigests
      );

      if (!digests || !digests.length) continue;

      const message = formatDigestMessage(digests);
      await bot.sendMessage(coach.chat_id, message);

    } catch (err) {
      console.error(`weekly-digest error for coach ${coach.chat_id}:`, err);
      // Продовжити для інших тренерів
    }
  }
}

async function getWeekRows(chatId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  const { data } = await supabase
    .getClient()
    .from('bot_training_data')
    .select('date, exercise_id, exercise_name, weight, reps, set')
    .eq('chat_id', String(chatId))
    .gte('date', `${dateStr}T00:00:00`)
    .order('date', { ascending: true });

  return data || [];
}

function formatDigestMessage(digests) {
  const weekStr = getCurrentWeekStr();
  let msg = `📊 Тижневий дайджест — ${weekStr}\n`;
  msg += '─'.repeat(28) + '\n\n';

  for (const { student, summary } of digests) {
    msg += `👤 ${student.first_name} ${student.last_name || ''}\n`;
    msg += `${summary || 'Дані відсутні.'}\n\n`;
    msg += '─'.repeat(28) + '\n\n';
  }

  return msg.trim();
}

function getCurrentWeekStr() {
  const months = [
    'січня','лютого','березня','квітня','травня','червня',
    'липня','серпня','вересня','жовтня','листопада','грудня'
  ];
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

module.exports = { sendWeeklyDigests };
```

---

## 10. Новий endpoint в index.js

```js
const weeklyDigest = require('./lib/weeklyDigest');

app.get('/cron/weekly-digest', async (req, res) => {
  if (req.query.secret !== process.env.REMINDER_CRON_SECRET) {
    return res.status(403).send('Forbidden');
  }
  try {
    await weeklyDigest.sendWeeklyDigests(bot);
    res.send('OK');
  } catch (err) {
    console.error('weekly-digest cron error:', err);
    res.status(500).send('Error');
  }
});
```

Налаштувати на cron-job.org:
```
URL:      GET https://your-app.railway.app/cron/weekly-digest?secret=XXX
Розклад:  Кожного понеділка о 08:00
```

---

## 11. Приклади повідомлень (очікуваний вигляд)

### Підказка під час тренування — є історія
```
Жим штанги лежачи — Підхід 1/3

Минулого разу (05 берез.): 75кг x 8, 75кг x 7, 70кг x 8
Рекорд: 80кг x 6

Введи вагу (кг):
```

### AI-аналіз тренування — учень
```
🤖 AI-аналіз:

Жим штанги: тримав 80кг стабільно всі 3 підходи — хороший знак,
можна наступного разу спробувати 82.5кг.

Французький жим: вага впала з 25кг до 20кг на 3-му підході —
трицепс втомився. Спробуй починати з 22кг.

[🔙 Назад]
```

### AI-прогрес по вправі — тренер (свій)
```
🤖 AI-аналіз:

Тяга штанги в нахилі: 8 тренувань за 2 місяці, ріст з 80кг до 100кг (+25%).
Темп +2.5кг/тиждень — вище середнього для intermediate рівня.
Повтори стабільні (8-10 у всіх підходах) — прогресія чиста.
При 100кг x 10 у всіх підходах переходь на 102.5кг.

[🔙 Назад]
```

### Тижневий дайджест — тренер
```
📊 Тижневий дайджест — 10–16 березня
────────────────────────────

👤 Олексій Петренко
Відвідуваність: 3/3. Жим штанги +5кг цього тижня. Все йде за планом.

────────────────────────────

👤 Марія Коваль
Відвідуваність: 2/3 — пропустила середу. Присідання стабільні,
але плечі не тренувала вже 2 тижні — варто обговорити.

────────────────────────────
```

---

## 12. Правила та обмеження

1. Підказка під час тренування — працює **завжди**, незалежно від `AI_ENABLED`.
2. Кнопки `[🤖 ...]` в Історії — тільки якщо `AI_ENABLED === 'true'`. При `false` кнопок немає, логіка не змінюється.
3. Завжди показувати `showAiLoading` перед AI-запитом і видаляти після (`deleteMessage`).
4. При помилці OpenAI — «Не вдалося отримати аналіз. Спробуйте пізніше» + `console.error`. Не кидати виняток назовні.
5. Мінімум 2 тренування для AI-аналізу прогресу — при меншій кількості пояснення без виклику AI.
6. Тижневий дайджест: якщо жоден учень не мав активності за тиждень — не надсилати нічого.
7. При помилці для одного тренера в дайджесті — продовжити для інших (`try/catch` у циклі).
8. `maxTokens`: 400 для аналізу тренування і прогресу, 250 для одного учня в дайджесті.
9. Мова промптів — українська, зафіксована в коді. Тон не редагується через бот.
10. `'coach'` тон — тільки коли `targetChatId === chatId` і `user.role === 'coach'`. У всіх інших випадках — `'student'`.
11. Без Markdown у всіх текстах бота (VETO 6).

---

## 13. Файли для створення/зміни

| Файл | Дія | Що |
|---|---|---|
| `lib/supabase.js` | Змінити | +`getLastWorkoutByExercise`, `getBestSetByExercise` (підказка); +`getAiCache`, `setAiCache`, `getAllCoaches`, `getStudentsByCoachId` (AI) |
| `lib/training.js` | Змінити | +`buildExerciseHint`, `formatHintDate`; виклик у 3 місцях (план, вільне, сет-кола) |
| `lib/ai/historyAnalysis.js` | Створити | analyzeWorkout, analyzeExerciseProgress, buildWeeklyDigest, промпти, допоміжні функції, кеш-обгортки |
| `lib/weeklyDigest.js` | Створити | sendWeeklyDigests, getWeekRows, formatDigestMessage, getCurrentWeekStr |
| `lib/history.js` | Змінити | +кнопка AI в showHistoryDetail; +кнопка AI в showHistoryList; +showAiAnalysis, showAiLoading |
| `lib/router.js` | Змінити | +HIST_AI_ANALYZE:* і HIST_AI_PROGRESS:* handlers |
| `index.js` | Змінити | +GET /cron/weekly-digest endpoint |
| `DEPLOY.md` | Змінити | +cron weekly-digest (щопонеділка 08:00) |
| `CALLBACK_FSM_MODULE_MATRIX.md` | Змінити | +HIST_AI_ANALYZE, HIST_AI_PROGRESS |

---

## 14. Порядок реалізації (для Cursor)

```
── БЛОК 1: Підказка під час тренування (без AI, швидкий результат) ──

Крок 1:  lib/supabase.js — getLastWorkoutByExercise, getBestSetByExercise
Крок 2:  lib/training.js — buildExerciseHint, formatHintDate
Крок 3:  lib/training.js — інтеграція в showStudentPlanExercise (план)
Крок 4:  тест — учень, вправа з історією → підказка перед підходом 1
Крок 5:  тест — підхід 2, 3 → підказки немає
Крок 6:  тест — вправа без історії → «Перше тренування з цією вправою»
Крок 7:  lib/training.js — інтеграція в askTrainingInputDataWithPlannedSets (вільне)
Крок 8:  lib/training.js — інтеграція в askTrainingInputForSetCircuit (сет-кола)
Крок 9:  тест — тренер веде учня → підказка з історії учня
Крок 10: тест — рекорд = остання вага → рядок «Рекорд» не дублюється

── БЛОК 2: AI-аналіз в Історії ──

Крок 11: lib/supabase.js — getAiCache, setAiCache, getAllCoaches, getStudentsByCoachId
Крок 12: lib/ai/historyAnalysis.js — створити повністю
Крок 13: lib/history.js — кнопки AI + showAiAnalysis + showAiLoading
Крок 14: lib/router.js — HIST_AI_ANALYZE і HIST_AI_PROGRESS handlers
Крок 15: тест — аналіз тренування (AI_ENABLED=true)
Крок 16: тест — аналіз прогресу (мінімум 2 тренування по вправі)
Крок 17: тест — кеш (повторний клік протягом 24 год — без нового запиту до OpenAI)
Крок 18: тест — AI_ENABLED=false → кнопок немає, підказка під час тренування є

── БЛОК 3: Тижневий дайджест ──

Крок 19: lib/weeklyDigest.js — створити
Крок 20: index.js — /cron/weekly-digest
Крок 21: тест — GET /cron/weekly-digest?secret=XXX вручну
Крок 22: cron-job.org — налаштувати розклад (щопонеділка 08:00)
Крок 23: DEPLOY.md, CALLBACK_FSM_MODULE_MATRIX.md — оновити
```

---

## 15. Що НЕ змінюється

- `lib/ai/planComments.js`, `smartReminder.js`, `failureAnalysis.js` — без змін
- `lib/ai/aiClient.js`, `aiPrompts.js` — без змін
- Таблиця `ai_generated_content` — без ALTER TABLE
- Вся логіка History без AI — без змін
- Вся логіка запису підходів під час тренування — без змін
- Змінна `AI_ENABLED` — існуюча, не додавати нову

---

*Документ готовий до передачі в Cursor.*
