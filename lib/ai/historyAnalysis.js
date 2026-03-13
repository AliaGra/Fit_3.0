const supabase = require('../supabase');
const aiClient = require('./aiClient');

async function analyzeWorkout(rows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildWorkoutAnalysisPrompt(rows, userProfile, role);
  return aiClient.complete(prompt, { maxTokens: 400 });
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

async function analyzeExerciseProgress(exerciseName, allRows, userProfile, role) {
  if (!aiClient.isEnabled()) return null;
  const prompt = buildProgressPrompt(exerciseName, allRows, userProfile, role);
  return aiClient.complete(prompt, { maxTokens: 400 });
}

function buildProgressPrompt(exerciseName, allRows, userProfile, role) {
  const byDate = groupByDate(allRows);
  const trend = byDate
    .map((d) => `${formatDateShort(d.date)}: ${d.maxWeight}кг x ${Math.round(d.avgReps)} повт (${d.sets} підх)`)
    .join('\n');

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

function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(row);
  }
  return Array.from(map, ([date, rws]) => ({
    date,
    maxWeight: Math.max(...rws.map((r) => r.weight || 0)),
    avgReps: rws.reduce((s, r) => s + (r.reps || 0), 0) / rws.length,
    sets: rws.length
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function groupRowsForPrompt(rows) {
  const groups = {};
  const exerciseMap = new Map();
  for (const row of rows) {
    const exId = row.exercise_id;
    const gl2 = (row.exercise_library && row.exercise_library.group_level2) || 'Інше';
    if (!exerciseMap.has(exId)) {
      exerciseMap.set(exId, { name: row.exercise_name, gl2, sets: [] });
    }
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
      const setsText = ex.sets.map((s) => `${s.weight}кг x ${s.reps}`).join(', ');
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
  return Object.entries(byDate)
    .map(([date, rows]) => {
      const names = [...new Map(rows.map((r) => [r.exercise_id, r.exercise_name])).values()];
      return `${formatDateShort(date)}: ${names.join(', ')}`;
    })
    .join('\n');
}

function countUniqueDates(rows) {
  return new Set(rows.map((r) => r.date.slice(0, 10))).size;
}

function formatDateShort(dateStr) {
  const months = [
    'січ.','лют.','берез.','квіт.','трав.','черв.',
    'лип.','серп.','вер.','жовт.','лист.','груд.'
  ];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

async function getWorkoutAnalysisCached(chatId, dateStr, rows, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'workout_analysis', dateStr);
  if (cached) return cached;
  const result = await analyzeWorkout(rows, userProfile, role);
  if (result) {
    await supabase.setAiCache(chatId, 'workout_analysis', dateStr, result);
  }
  return result;
}

async function getExerciseProgressCached(chatId, exerciseId, allRows, exerciseName, userProfile, role) {
  const cached = await supabase.getAiCache(chatId, 'exercise_progress', String(exerciseId));
  if (cached) return cached;
  const result = await analyzeExerciseProgress(exerciseName, allRows, userProfile, role);
  if (result) {
    await supabase.setAiCache(chatId, 'exercise_progress', String(exerciseId), result);
  }
  return result;
}

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
Учень: ${student.first_name} ${student.last_name || ''}, ціль: ${student.goal || ''}, рівень: ${student.level || 'не вказано'}.
Заплановано: ${plannedDays} тренування/тиждень. Проведено: ${actualDays}.

Виконані тренування:
${exercises || 'Тренувань за тиждень не було.'}

Огляд у форматі:
1. Відвідуваність (факт/план)
2. Найкращий результат тижня (якщо є)
3. Що потребує уваги (якщо є)
Максимум 4 речення. Стиль: технічний, для тренера. Мова: українська.`;
}

module.exports = {
  getWorkoutAnalysisCached,
  getExerciseProgressCached,
  buildWeeklyDigest
};

