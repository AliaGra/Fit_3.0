ТЗ: AI-аналіз в модулі «Історія тренувань» — FIT 3.0
Версія: 1.0
Дата: березень 2026
Для: Cursor AI
Залежність: ТЗ_Історія_тренувань_v1_1_FIT3.md — реалізувати першим

1. Контекст
1.1 Що вже є в системі
AI підключений до трьох точок:

lib/ai/planComments.js — коментарі до вправ плану
lib/ai/smartReminder.js — розумні нагадування
lib/ai/failureAnalysis.js — аналіз невиконання вправ

Інфраструктура:

lib/ai/aiClient.js — клієнт OpenAI, перевірка AI_ENABLED
lib/ai/aiPrompts.js — системні промпти
Таблиця ai_generated_content — кеш AI-відповідей

1.2 Що реалізуємо — три нові точки
#ТочкаДеХто бачить1Аналіз одного тренуванняКнопка в деталях тренуванняВсі (свої дані)2Прогрес по вправіПісля списку в фільтрі «за вправою»Всі (свої дані)3Тижневий дайджестCron щопонеділка → тренеруТільки тренер
1.3 Тон відповідей

Учень: змішаний — цифри + короткий мотивуючий коментар (як тренер-друг)
Тренер (свої дані): технічний — цифри + факти + рекомендація
Дайджест по учню: стисло, технічно, для прийняття рішення тренером


2. Таблиця ai_generated_content — нові content_type
Без ALTER TABLE — просто нові рядки з новими значеннями content_type:
'workout_analysis'   — аналіз тренування   (ref_id = dateStr '2026-02-01')
'exercise_progress'  — прогрес по вправі   (ref_id = exerciseId як рядок)
'weekly_digest'      — тижневий дайджест   (ref_id = 'week_YYYY-WW')
Кеш TTL:

workout_analysis → 24 год по (chat_id, content_type, ref_id)
exercise_progress → 24 год по (chat_id, content_type, ref_id)
weekly_digest → не кешується, cron завжди генерує новий


3. Новий файл lib/ai/historyAnalysis.js
3.1 analyzeWorkout(rows, userProfile, role)
jsasync function analyzeWorkout(rows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildWorkoutAnalysisPrompt(rows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildWorkoutAnalysisPrompt(rows, userProfile, role) {
  const grouped = groupRowsForPrompt(rows);
  const dataText = formatRowsForPrompt(grouped);
  // dataText: "Груди:\n- Жим штанги: 80кг×8, 80кг×7, 75кг×8\n..."

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
3.2 analyzeExerciseProgress(exerciseName, allRows, userProfile, role)
jsasync function analyzeExerciseProgress(exerciseName, allRows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildProgressPrompt(exerciseName, allRows, userProfile, role);
  return await aiClient.complete(prompt, { maxTokens: 400 });
}

function buildProgressPrompt(exerciseName, allRows, userProfile, role) {
  const byDate = groupByDate(allRows);
  // [{ date, maxWeight, avgReps, sets }, ...]

  const trend = byDate.map(d =>
    `${formatDateShort(d.date)}: ${d.maxWeight}кг × ${Math.round(d.avgReps)} повт (${d.sets} підх)`
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
3.3 buildWeeklyDigest(coachProfile, studentDigests)
jsasync function buildWeeklyDigest(coachProfile, studentDigests) {
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
3.4 Допоміжні функції
js// Групування по датах для промпту прогресу
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

// Групування рядків для промпту аналізу тренування
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

// Форматування для промпту
function formatRowsForPrompt(grouped) {
  let text = '';
  for (const [group, exercises] of Object.entries(grouped)) {
    text += `${group}:\n`;
    for (const ex of exercises) {
      const setsText = ex.sets.map(s => `${s.weight}кг×${s.reps}`).join(', ');
      text += `- ${ex.name}: ${setsText}\n`;
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

4. Нові функції lib/supabase.js
js// Кеш AI — отримати (TTL 24 год)
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

// Кеш AI — зберегти
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

// Всі активні тренери (для дайджесту)
async function getAllCoaches() {
  const { data } = await supabase
    .from('users')
    .select('chat_id, first_name, last_name')
    .eq('role', 'coach')
    .eq('is_archived', false);
  return data || [];
}

// Активні учні тренера (для дайджесту)
async function getStudentsByCoachId(coachChatId) {
  const { data } = await supabase
    .from('users')
    .select('chat_id, first_name, last_name, goal, training_days_per_week, experience_start_date')
    .eq('coach_id', String(coachChatId))
    .eq('role', 'student')
    .eq('is_archived', false);
  return data || [];
}

5. Зміни в lib/history.js
5.1 showHistoryDetail — кнопка AI
js// Після формування навігаційних кнопок — додати перед [🔙 Назад]:

if (process.env.AI_ENABLED === 'true') {
  keyboard.push([{
    text: '🤖 Аналіз тренування',
    callback_data: `HIST_AI_ANALYZE:${dateStr}`
  }]);
}
5.2 showHistoryList — кнопка AI для exercise
js// Після списку кнопок з датами:

if (
  process.env.AI_ENABLED === 'true' &&
  histState.histFilter === 'exercise' &&
  histState.histDates.length >= 2  // мінімум 2 тренування для аналізу тренду
) {
  keyboard.push([{
    text: '🤖 Аналіз прогресу',
    callback_data: `HIST_AI_PROGRESS:${histState.histFilterExerciseId}`
  }]);
}
5.3 Нові функції відображення
jsasync function showAiAnalysis(bot, chatId, analysisText, backCallback) {
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

6. Нові callback handlers в lib/router.js
js// ─── AI АНАЛІЗ ТРЕНУВАННЯ ───────────────────────────────────────────────────

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

    // Роль: хто дивиться свої дані — coach або student
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

// ─── AI ПРОГРЕС ПО ВПРАВІ ───────────────────────────────────────────────────

if (data.startsWith('HIST_AI_PROGRESS:')) {
  const exerciseId = parseInt(data.split(':')[1]);
  const targetChatId = userState.histTargetChatId;
  const loadingMsg = await history.showAiLoading(bot, chatId);

  try {
    // Всі дати по вправі без ліміту
    const dates = await supabase.getWorkoutDatesByExercise(targetChatId, exerciseId, 999);

    if (dates.length < 2) {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      await bot.sendMessage(chatId,
        'Потрібно щонайменше 2 тренування з цією вправою для аналізу прогресу.',
        { reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'HIST_BACK_LIST' }]] } }
      );
      return;
    }

    // Завантажити всі підходи по цій вправі
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

7. Новий файл lib/weeklyDigest.js
jsconst supabase = require('./supabase');
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

      // Пропустити якщо жоден учень не тренувався
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
    .getClient()  // або пряме звернення до supabase instance
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
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Пн
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Нд
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

module.exports = { sendWeeklyDigests };

8. Новий endpoint в index.js
jsconst weeklyDigest = require('./lib/weeklyDigest');

// Поряд з існуючими /cron/* ендпоінтами:
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
Налаштувати на cron-job.org поряд з існуючими cron-job'ами:
URL:      GET https://your-app.railway.app/cron/weekly-digest?secret=XXX
Розклад:  Кожного понеділка о 08:00

9. Приклади відповідей AI (очікуваний вигляд)
Аналіз тренування — учень
🤖 AI-аналіз:

Жим штанги: тримав 80кг стабільно всі 3 підходи — хороший знак,
можна наступного разу спробувати 82.5кг.

Французький жим: вага впала з 25кг до 20кг на 3-му підході —
трицепс втомився. Спробуй починати з 22кг і не гнатись за вагою.

[🔙 Назад]
Прогрес по вправі — тренер (свій)
🤖 AI-аналіз:

Тяга штанги в нахилі: 8 тренувань за 2 місяці, ріст з 80кг до 100кг (+25%).
Темп +2.5кг/тиждень — вище середнього для intermediate рівня.
Повтори стабільні (8-10 у всіх підходах) — прогресія чиста.
При 100кг×10 у всіх підходах переходь на 102.5кг.

[🔙 Назад]
Тижневий дайджест — тренер
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

10. Правила та обмеження

Кнопки [🤖 ...] показуються ТІЛЬКИ якщо process.env.AI_ENABLED === 'true'. При false — кнопок немає взагалі, логіка не змінюється.
Завжди показувати showAiLoading перед запитом і видаляти після (deleteMessage).
При помилці OpenAI — «Не вдалося отримати аналіз. Спробуйте пізніше» + console.error. Не кидати виняток назовні.
Мінімум 2 тренування для аналізу прогресу — при меншій кількості показати пояснення без виклику AI.
Тижневий дайджест: якщо жоден учень тренера не мав активності за тиждень — не надсилати нічого.
При помилці для одного тренера в дайджесті — продовжити для інших (try/catch у циклі).
maxTokens: 400 для аналізу тренування і прогресу, 250 для одного учня в дайджесті.
Мова промптів — українська, зафіксована в коді.
Тон промптів не редагується через бот — тільки через код.
Тренер переглядає учня — targetChatId !== chatId — це завжди 'student' тон (навіть якщо тренер дивиться на учня). 'coach' тон тільки коли тренер дивиться на СВОЇ дані (targetChatId === chatId).


11. Файли для створення/зміни
ФайлДіяЩоlib/ai/historyAnalysis.jsСтворитиanalyzeWorkout, analyzeExerciseProgress, buildWeeklyDigest, всі промпти, допоміжні функції, обгортки з кешемlib/weeklyDigest.jsСтворитиsendWeeklyDigests, getWeekRows, formatDigestMessage, getCurrentWeekStrlib/history.jsЗмінити+кнопка AI в showHistoryDetail; +кнопка AI в showHistoryList (exercise filter); +showAiAnalysis, showAiLoadinglib/supabase.jsЗмінити+getAiCache, setAiCache, getAllCoaches, getStudentsByCoachIdlib/router.jsЗмінити+HIST_AI_ANALYZE:* і HIST_AI_PROGRESS:* handlersindex.jsЗмінити+GET /cron/weekly-digest endpointDEPLOY.mdЗмінити+cron weekly-digest (щопонеділка 08:00)CALLBACK_FSM_MODULE_MATRIX.mdЗмінити+HIST_AI_ANALYZE, HIST_AI_PROGRESS

12. Порядок реалізації (для Cursor)
Крок 1: lib/supabase.js — getAiCache, setAiCache, getAllCoaches, getStudentsByCoachId
Крок 2: lib/ai/historyAnalysis.js — створити повністю
Крок 3: lib/history.js — кнопки AI + showAiAnalysis + showAiLoading
Крок 4: lib/router.js — HIST_AI_ANALYZE і HIST_AI_PROGRESS
Крок 5: тест — аналіз тренування (AI_ENABLED=true, одне тренування)
Крок 6: тест — аналіз прогресу (мінімум 2 тренування по вправі)
Крок 7: тест — кеш (повторний клік протягом 24 год, без нового запиту до OpenAI)
Крок 8: lib/weeklyDigest.js — створити
Крок 9: index.js — /cron/weekly-digest
Крок 10: тест дайджесту — GET /cron/weekly-digest?secret=XXX вручну
Крок 11: cron-job.org — налаштувати розклад
Крок 12: DEPLOY.md, CALLBACK_FSM_MODULE_MATRIX.md — оновити

13. Що НЕ змінюється

lib/ai/planComments.js, smartReminder.js, failureAnalysis.js — без змін
lib/ai/aiClient.js, aiPrompts.js — без змін
Таблиця ai_generated_content — без ALTER TABLE
Вся логіка History без AI — без змін (AI є опційним шаром поверх)
Змінна AI_ENABLED — існуюча, не додавати нову


Документ готовий до передачі в Cursor.