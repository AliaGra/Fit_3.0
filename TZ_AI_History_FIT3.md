# ТЗ: AI-аналіз в модулі «Історія тренувань» — FIT 3.0

**Версія:** 1.0
**Дата:** березень 2026
**Для:** Cursor AI
**Залежність:** ТЗ\_Історія\_тренувань\_v1\_1\_FIT3.md — реалізувати першим

\---

## 1\. Контекст

### 1.1 Що вже є в системі

AI підключений до трьох точок:

* `lib/ai/planComments.js` — коментарі до вправ плану
* `lib/ai/smartReminder.js` — розумні нагадування
* `lib/ai/failureAnalysis.js` — аналіз невиконання вправ

Інфраструктура:

* `lib/ai/aiClient.js` — клієнт OpenAI, перевірка AI\_ENABLED
* `lib/ai/aiPrompts.js` — системні промпти
* Таблиця `ai\_generated\_content` — кеш AI-відповідей

### 1.2 Що реалізуємо — три нові точки

|#|Точка|Де|Хто бачить|
|-|-|-|-|
|1|Аналіз одного тренування|Кнопка в деталях тренування|Всі (свої дані)|
|2|Прогрес по вправі|Після списку в фільтрі «за вправою»|Всі (свої дані)|
|3|Тижневий дайджест|Cron щопонеділка → тренеру|Тільки тренер|

### 1.3 Тон відповідей

* **Учень:** змішаний — цифри + короткий мотивуючий коментар (як тренер-друг)
* **Тренер (свої дані):** технічний — цифри + факти + рекомендація
* **Дайджест по учню:** стисло, технічно, для прийняття рішення тренером

\---

## 2\. Таблиця ai\_generated\_content — нові content\_type

Без ALTER TABLE — просто нові рядки з новими значеннями `content\_type`:

```
'workout\_analysis'   — аналіз тренування   (ref\_id = dateStr '2026-02-01')
'exercise\_progress'  — прогрес по вправі   (ref\_id = exerciseId як рядок)
'weekly\_digest'      — тижневий дайджест   (ref\_id = 'week\_YYYY-WW')
```

Кеш TTL:

* `workout\_analysis` → 24 год по (chat\_id, content\_type, ref\_id)
* `exercise\_progress` → 24 год по (chat\_id, content\_type, ref\_id)
* `weekly\_digest` → не кешується, cron завжди генерує новий

\---

## 3\. Новий файл lib/ai/historyAnalysis.js

### 3.1 analyzeWorkout(rows, userProfile, role)

```js
async function analyzeWorkout(rows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildWorkoutAnalysisPrompt(rows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildWorkoutAnalysisPrompt(rows, userProfile, role) {
  const grouped = groupRowsForPrompt(rows);
  const dataText = formatRowsForPrompt(grouped);
  // dataText: "Груди:\\n- Жим штанги: 80кг×8, 80кг×7, 75кг×8\\n..."

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

  // coach — технічний аналіз власного тренування
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

### 3.2 analyzeExerciseProgress(exerciseName, allRows, userProfile, role)

```js
async function analyzeExerciseProgress(exerciseName, allRows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildProgressPrompt(exerciseName, allRows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildProgressPrompt(exerciseName, allRows, userProfile, role) {
  const byDate = groupByDate(allRows);
  // \[{ date, maxWeight, avgReps, sets }, ...]

  const trend = byDate.map(d =>
    `${formatDateShort(d.date)}: ${d.maxWeight}кг × ${Math.round(d.avgReps)} повт (${d.sets} підх)`
  ).join('\\n');

  const first = byDate\[0];
  const last = byDate\[byDate.length - 1];
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

### 3.3 buildWeeklyDigest(coachProfile, studentDigests)

```js
async function buildWeeklyDigest(coachProfile, studentDigests) {
  if (!aiClient.isEnabled()) return null;

  const results = \[];
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
Учень: ${student.first\_name} ${student.last\_name || ''}, ціль: ${student.goal}, рівень: ${student.level || 'не вказано'}.
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

### 3.4 Допоміжні функції

```js
// Групування по датах для промпту прогресу
function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!map.has(day)) map.set(day, \[]);
    map.get(day).push(row);
  }
  return Array.from(map, (\[date, rws]) => ({
    date,
    maxWeight: Math.max(...rws.map(r => r.weight || 0)),
    avgReps: rws.reduce((s, r) => s + (r.reps || 0), 0) / rws.length,
    sets: rws.length
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// Групування рядків для промпту аналізу тренування
function groupRowsForPrompt(rows) {
  const groups = {};
  const exerciseMap = new Map();
  for (const row of rows) {
    const exId = row.exercise\_id;
    const gl2 = row.exercise\_library?.group\_level2 || 'Інше';
    if (!exerciseMap.has(exId)) exerciseMap.set(exId, { name: row.exercise\_name, gl2, sets: \[] });
    exerciseMap.get(exId).sets.push({ weight: row.weight, reps: row.reps });
  }
  for (const \[, ex] of exerciseMap) {
    if (!groups\[ex.gl2]) groups\[ex.gl2] = \[];
    groups\[ex.gl2].push(ex);
  }
  return groups;
}

// Форматування для промпту
function formatRowsForPrompt(grouped) {
  let text = '';
  for (const \[group, exercises] of Object.entries(grouped)) {
    text += `${group}:\\n`;
    for (const ex of exercises) {
      const setsText = ex.sets.map(s => `${s.weight}кг×${s.reps}`).join(', ');
      text += `- ${ex.name}: ${setsText}\\n`;
    }
  }
  return text.trim();
}

// Форматування тижня для дайджесту
function formatWeekRowsForPrompt(weekRows) {
  if (!weekRows.length) return '';
  const byDate = {};
  for (const row of weekRows) {
    const day = row.date.slice(0, 10);
    if (!byDate\[day]) byDate\[day] = \[];
    byDate\[day].push(row);
  }
  return Object.entries(byDate).map((\[date, rows]) => {
    const names = \[...new Map(rows.map(r => \[r.exercise\_id, r.exercise\_name])).values()];
    return `${formatDateShort(date)}: ${names.join(', ')}`;
  }).join('\\n');
}

function countUniqueDates(rows) {
  return new Set(rows.map(r => r.date.slice(0, 10))).size;
}

// Обгортки з кешем
async function getWorkoutAnalysisCached(chatId, dateStr, rows, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'workout\_analysis', dateStr);
  if (cached) return cached;
  const result = await analyzeWorkout(rows, userProfile, role);
  if (result) await supabase.setAiCache(chatId, 'workout\_analysis', dateStr, result);
  return result;
}

async function getExerciseProgressCached(chatId, exerciseId, allRows, exerciseName, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'exercise\_progress', String(exerciseId));
  if (cached) return cached;
  const result = await analyzeExerciseProgress(exerciseName, allRows, userProfile, role);
  if (result) await supabase.setAiCache(chatId, 'exercise\_progress', String(exerciseId), result);
  return result;
}

module.exports = {
  getWorkoutAnalysisCached,
  getExerciseProgressCached,
  buildWeeklyDigest
};
```

\---

## 4\. Нові функції lib/supabase.js

```js
// Кеш AI — отримати (TTL 24 год)
async function getAiCache(chatId, contentType, refId) {
  const { data } = await supabase
    .from('ai\_generated\_content')
    .select('content, created\_at')
    .eq('chat\_id', String(chatId))
    .eq('content\_type', contentType)
    .eq('ref\_id', refId)
    .order('created\_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const age = Date.now() - new Date(data.created\_at).getTime();
  if (age > 24 \* 60 \* 60 \* 1000) return null;
  return data.content;
}

// Кеш AI — зберегти
async function setAiCache(chatId, contentType, refId, content) {
  await supabase.from('ai\_generated\_content').insert({
    id: crypto.randomUUID(),
    chat\_id: String(chatId),
    content\_type: contentType,
    ref\_id: String(refId),
    content,
    created\_at: new Date().toISOString()
  });
}

// Всі активні тренери (для дайджесту)
async function getAllCoaches() {
  const { data } = await supabase
    .from('users')
    .select('chat\_id, first\_name, last\_name')
    .eq('role', 'coach')
    .eq('is\_archived', false);
  return data || \[];
}

// Активні учні тренера (для дайджесту)
async function getStudentsByCoachId(coachChatId) {
  const { data } = await supabase
    .from('users')
    .select('chat\_id, first\_name, last\_name, goal, training\_days\_per\_week, experience\_start\_date')
    .eq('coach\_id', String(coachChatId))
    .eq('role', 'student')
    .eq('is\_archived', false);
  return data || \[];
}
```

\---

## 5\. Зміни в lib/history.js

### 5.1 showHistoryDetail — кнопка AI

```js
// Після формування навігаційних кнопок — додати перед \[🔙 Назад]:

if (process.env.AI\_ENABLED === 'true') {
  keyboard.push(\[{
    text: '🤖 Аналіз тренування',
    callback\_data: `HIST\_AI\_ANALYZE:${dateStr}`
  }]);
}
```

### 5.2 showHistoryList — кнопка AI для exercise

```js
// Після списку кнопок з датами:

if (
  process.env.AI\_ENABLED === 'true' \&\&
  histState.histFilter === 'exercise' \&\&
  histState.histDates.length >= 2  // мінімум 2 тренування для аналізу тренду
) {
  keyboard.push(\[{
    text: '🤖 Аналіз прогресу',
    callback\_data: `HIST\_AI\_PROGRESS:${histState.histFilterExerciseId}`
  }]);
}
```

### 5.3 Нові функції відображення

```js
async function showAiAnalysis(bot, chatId, analysisText, backCallback) {
  const text = `🤖 AI-аналіз:\\n\\n${analysisText}`;
  await bot.sendMessage(chatId, text, {
    reply\_markup: {
      inline\_keyboard: \[\[{ text: '🔙 Назад', callback\_data: backCallback }]]
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

\---

## 6\. Нові callback handlers в lib/router.js

```js
// ─── AI АНАЛІЗ ТРЕНУВАННЯ ───────────────────────────────────────────────────

if (data.startsWith('HIST\_AI\_ANALYZE:')) {
  const dateStr = data.slice('HIST\_AI\_ANALYZE:'.length);
  const targetChatId = userState.histTargetChatId;
  const loadingMsg = await history.showAiLoading(bot, chatId);

  try {
    const rows = await supabase.getWorkoutByDate(targetChatId, dateStr);

    const profile = await supabase.getUserByChatId(targetChatId);
    const expDays = planGenerator.getExperienceDays(profile);
    const level = planGenerator.getLevelFromExperienceDays(expDays);
    const userProfile = {
      firstName: profile.first\_name,
      goal: profile.goal || 'keep',
      level,
      gender: profile.gender
    };

    // Роль: хто дивиться свої дані — coach або student
    const role = (String(chatId) === String(targetChatId) \&\& user.role === 'coach')
      ? 'coach' : 'student';

    const analysis = await historyAnalysis.getWorkoutAnalysisCached(
      targetChatId, dateStr, rows, userProfile, role
    );

    await bot.deleteMessage(chatId, loadingMsg.message\_id);

    if (!analysis) {
      await bot.sendMessage(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
      return;
    }

    await history.showAiAnalysis(bot, chatId, analysis, `HIST\_VIEW:${dateStr}`);

  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message\_id).catch(() => {});
    await bot.sendMessage(chatId, 'Помилка при отриманні аналізу. Спробуйте пізніше.');
    console.error('HIST\_AI\_ANALYZE error:', err);
  }
  return;
}

// ─── AI ПРОГРЕС ПО ВПРАВІ ───────────────────────────────────────────────────

if (data.startsWith('HIST\_AI\_PROGRESS:')) {
  const exerciseId = parseInt(data.split(':')\[1]);
  const targetChatId = userState.histTargetChatId;
  const loadingMsg = await history.showAiLoading(bot, chatId);

  try {
    // Всі дати по вправі без ліміту
    const dates = await supabase.getWorkoutDatesByExercise(targetChatId, exerciseId, 999);

    if (dates.length < 2) {
      await bot.deleteMessage(chatId, loadingMsg.message\_id);
      await bot.sendMessage(chatId,
        'Потрібно щонайменше 2 тренування з цією вправою для аналізу прогресу.',
        { reply\_markup: { inline\_keyboard: \[\[{ text: '🔙 Назад', callback\_data: 'HIST\_BACK\_LIST' }]] } }
      );
      return;
    }

    // Завантажити всі підходи по цій вправі
    const exerciseRows = \[];
    for (const d of dates) {
      const dayRows = await supabase.getWorkoutByDate(targetChatId, d);
      exerciseRows.push(...dayRows.filter(r => r.exercise\_id === exerciseId));
    }

    const exerciseName = exerciseRows\[0]?.exercise\_name || 'Вправа';

    const profile = await supabase.getUserByChatId(targetChatId);
    const expDays = planGenerator.getExperienceDays(profile);
    const level = planGenerator.getLevelFromExperienceDays(expDays);
    const userProfile = {
      firstName: profile.first\_name,
      goal: profile.goal || 'keep',
      level
    };
    const role = (String(chatId) === String(targetChatId) \&\& user.role === 'coach')
      ? 'coach' : 'student';

    const analysis = await historyAnalysis.getExerciseProgressCached(
      targetChatId, exerciseId, exerciseRows, exerciseName, userProfile, role
    );

    await bot.deleteMessage(chatId, loadingMsg.message\_id);

    if (!analysis) {
      await bot.sendMessage(chatId, 'Не вдалося отримати аналіз. Спробуйте пізніше.');
      return;
    }

    await history.showAiAnalysis(bot, chatId, analysis, 'HIST\_BACK\_LIST');

  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message\_id).catch(() => {});
    await bot.sendMessage(chatId, 'Помилка при отриманні аналізу. Спробуйте пізніше.');
    console.error('HIST\_AI\_PROGRESS error:', err);
  }
  return;
}
```

\---

## 7\. Новий файл lib/weeklyDigest.js

```js
const supabase = require('./supabase');
const historyAnalysis = require('./ai/historyAnalysis');
const aiClient = require('./ai/aiClient');

async function sendWeeklyDigests(bot) {
  if (!aiClient.isEnabled()) return;

  const coaches = await supabase.getAllCoaches();

  for (const coach of coaches) {
    try {
      const students = await supabase.getStudentsByCoachId(coach.chat\_id);
      if (!students.length) continue;

      const studentDigests = \[];

      for (const student of students) {
        const weekRows = await getWeekRows(student.chat\_id);
        const plannedDays = student.training\_days\_per\_week || 3;
        studentDigests.push({ student, weekRows, plannedDays });
      }

      // Пропустити якщо жоден учень не тренувався
      const anyActivity = studentDigests.some(d => d.weekRows.length > 0);
      if (!anyActivity) continue;

      const digests = await historyAnalysis.buildWeeklyDigest(
        { firstName: coach.first\_name },
        studentDigests
      );

      if (!digests || !digests.length) continue;

      const message = formatDigestMessage(digests);
      await bot.sendMessage(coach.chat\_id, message);

    } catch (err) {
      console.error(`weekly-digest error for coach ${coach.chat\_id}:`, err);
      // Продовжити для інших тренерів
    }
  }
}

async function getWeekRows(chatId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  const { data } = await supabase
    .getClient()  // або пряме звернення до supabase instance
    .from('bot\_training\_data')
    .select('date, exercise\_id, exercise\_name, weight, reps, set')
    .eq('chat\_id', String(chatId))
    .gte('date', `${dateStr}T00:00:00`)
    .order('date', { ascending: true });

  return data || \[];
}

function formatDigestMessage(digests) {
  const weekStr = getCurrentWeekStr();
  let msg = `📊 Тижневий дайджест — ${weekStr}\\n`;
  msg += '─'.repeat(28) + '\\n\\n';

  for (const { student, summary } of digests) {
    msg += `👤 ${student.first\_name} ${student.last\_name || ''}\\n`;
    msg += `${summary || 'Дані відсутні.'}\\n\\n`;
    msg += '─'.repeat(28) + '\\n\\n';
  }

  return msg.trim();
}

function getCurrentWeekStr() {
  const months = \[
    'січня','лютого','березня','квітня','травня','червня',
    'липня','серпня','вересня','жовтня','листопада','грудня'
  ];
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Пн
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Нд
  return `${start.getDate()} ${months\[start.getMonth()]}–${end.getDate()} ${months\[end.getMonth()]}`;
}

module.exports = { sendWeeklyDigests };
```

\---

## 8\. Новий endpoint в index.js

```js
const weeklyDigest = require('./lib/weeklyDigest');

// Поряд з існуючими /cron/\* ендпоінтами:
app.get('/cron/weekly-digest', async (req, res) => {
  if (req.query.secret !== process.env.REMINDER\_CRON\_SECRET) {
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

Налаштувати на cron-job.org поряд з існуючими cron-job'ами:

```
URL:      GET https://your-app.railway.app/cron/weekly-digest?secret=XXX
Розклад:  Кожного понеділка о 08:00
```

\---

## 9\. Приклади відповідей AI (очікуваний вигляд)

### Аналіз тренування — учень

```
🤖 AI-аналіз:

Жим штанги: тримав 80кг стабільно всі 3 підходи — хороший знак,
можна наступного разу спробувати 82.5кг.

Французький жим: вага впала з 25кг до 20кг на 3-му підході —
трицепс втомився. Спробуй починати з 22кг і не гнатись за вагою.

\[🔙 Назад]
```

### Прогрес по вправі — тренер (свій)

```
🤖 AI-аналіз:

Тяга штанги в нахилі: 8 тренувань за 2 місяці, ріст з 80кг до 100кг (+25%).
Темп +2.5кг/тиждень — вище середнього для intermediate рівня.
Повтори стабільні (8-10 у всіх підходах) — прогресія чиста.
При 100кг×10 у всіх підходах переходь на 102.5кг.

\[🔙 Назад]
```

### Тижневий дайджест — тренер

```
📊 Тижневий дайджест — 10–16 березня
────────────────────────────

👤 Олексій Петренко
Відвідуваність: 3/3. Жим штанги +5кг цього тижня.
Все йде за планом.

────────────────────────────

👤 Марія Коваль
Відвідуваність: 2/3 — пропустила середу. Присідання стабільні,
але плечі не тренувала вже 2 тижні — варто обговорити.

────────────────────────────
```

\---

## 10\. Правила та обмеження

1. Кнопки `\[🤖 ...]` показуються ТІЛЬКИ якщо `process.env.AI\_ENABLED === 'true'`. При `false` — кнопок немає взагалі, логіка не змінюється.
2. Завжди показувати `showAiLoading` перед запитом і видаляти після (`deleteMessage`).
3. При помилці OpenAI — «Не вдалося отримати аналіз. Спробуйте пізніше» + `console.error`. Не кидати виняток назовні.
4. Мінімум 2 тренування для аналізу прогресу — при меншій кількості показати пояснення без виклику AI.
5. Тижневий дайджест: якщо жоден учень тренера не мав активності за тиждень — не надсилати нічого.
6. При помилці для одного тренера в дайджесті — продовжити для інших (`try/catch` у циклі).
7. `maxTokens`: 400 для аналізу тренування і прогресу, 250 для одного учня в дайджесті.
8. Мова промптів — українська, зафіксована в коді.
9. Тон промптів не редагується через бот — тільки через код.
10. Тренер переглядає учня — `targetChatId !== chatId` — це завжди `'student'` тон (навіть якщо тренер дивиться на учня). `'coach'` тон тільки коли тренер дивиться на СВОЇ дані (`targetChatId === chatId`).

\---

## 11\. Файли для створення/зміни

|Файл|Дія|Що|
|-|-|-|
|`lib/ai/historyAnalysis.js`|Створити|analyzeWorkout, analyzeExerciseProgress, buildWeeklyDigest, всі промпти, допоміжні функції, обгортки з кешем|
|`lib/weeklyDigest.js`|Створити|sendWeeklyDigests, getWeekRows, formatDigestMessage, getCurrentWeekStr|
|`lib/history.js`|Змінити|+кнопка AI в showHistoryDetail; +кнопка AI в showHistoryList (exercise filter); +showAiAnalysis, showAiLoading|
|`lib/supabase.js`|Змінити|+getAiCache, setAiCache, getAllCoaches, getStudentsByCoachId|
|`lib/router.js`|Змінити|+HIST\_AI\_ANALYZE:\* і HIST\_AI\_PROGRESS:\* handlers|
|`index.js`|Змінити|+GET /cron/weekly-digest endpoint|
|`DEPLOY.md`|Змінити|+cron weekly-digest (щопонеділка 08:00)|
|`CALLBACK\_FSM\_MODULE\_MATRIX.md`|Змінити|+HIST\_AI\_ANALYZE, HIST\_AI\_PROGRESS|

\---

## 12\. Порядок реалізації (для Cursor)

```
Крок 1: lib/supabase.js — getAiCache, setAiCache, getAllCoaches, getStudentsByCoachId
Крок 2: lib/ai/historyAnalysis.js — створити повністю
Крок 3: lib/history.js — кнопки AI + showAiAnalysis + showAiLoading
Крок 4: lib/router.js — HIST\_AI\_ANALYZE і HIST\_AI\_PROGRESS
Крок 5: тест — аналіз тренування (AI\_ENABLED=true, одне тренування)
Крок 6: тест — аналіз прогресу (мінімум 2 тренування по вправі)
Крок 7: тест — кеш (повторний клік протягом 24 год, без нового запиту до OpenAI)
Крок 8: lib/weeklyDigest.js — створити
Крок 9: index.js — /cron/weekly-digest
Крок 10: тест дайджесту — GET /cron/weekly-digest?secret=XXX вручну
Крок 11: cron-job.org — налаштувати розклад
Крок 12: DEPLOY.md, CALLBACK\_FSM\_MODULE\_MATRIX.md — оновити
```

\---

## 13\. Що НЕ змінюється

* `lib/ai/planComments.js`, `smartReminder.js`, `failureAnalysis.js` — без змін
* `lib/ai/aiClient.js`, `aiPrompts.js` — без змін
* Таблиця `ai\_generated\_content` — без ALTER TABLE
* Вся логіка History без AI — без змін (AI є опційним шаром поверх)
* Змінна `AI\_ENABLED` — існуюча, не додавати нову

\---

*Документ готовий до передачі в Cursor.*

