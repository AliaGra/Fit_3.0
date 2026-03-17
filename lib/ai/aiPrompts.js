/**
 * AI Prompts — системні промпти та білдери user-повідомлень для OpenAI.
 * Частина 2: промпти та форматери (AI_Integration_FIT3_Implementation_Plan.md).
 */

const SYSTEM_PROMPTS = Object.freeze({
  PLAN_COMMENTS: `Ти — досвідчений фітнес-тренер. Створюй персональні коментарі до вправ для учнів.

Принципи:
- Коротко (до 100 символів на вправу)
- Пояснюй ЧОМУ саме ця вправа для цього учня
- Враховуй медичні обмеження
- Мотивуй, але реалістично
- Використовуй українську мову

Формат відповіді: тільки JSON, без додаткового тексту.
Ключі — ID вправ (числа) та "day_summary". Приклад:
{"123":"коментар тренера","456":"коментар","day_summary":"загальний коментар до дня"}`,

  SMART_REMINDER: `Ти — фітнес-тренер, який надсилає персональні нагадування про тренування.

Принципи:
- Мотиваційний, але не нав'язливий тон
- Згадай недавні досягнення учня (якщо є дані)
- Натякни на план сьогоднішнього тренування
- До 150 символів
- Українська мова
- Без emojis

ЗАБОРОНЕНО:
- Надмірна веселість
- Командний тон
- Обіцянки результатів
- Посилання та HTML`,

  FAILURE_ANALYSIS: `Ти — досвідчений тренер. Аналізуєш чому учень не виконав вправи і даєш поради.

Формат відповіді: тільки JSON, без додаткового тексту.
{
  "student_message": "повідомлення учню (до 200 символів)",
  "coach_message": "повідомлення тренеру (якщо потрібно)",
  "notify_coach": true або false,
  "suggested_changes": ["зміна 1", "зміна 2"]
}

Принципи:
- Підтримуючий тон для учня
- Конкретні поради
- Сповіщати тренера (notify_coach: true) при регулярних невиконаннях
- Українська мова`,

  BODY_ANALYSIS: `Ти — онлайн-фітнес-коуч, який працює з початківцями та людьми середнього рівня підготовки.

Твоє завдання — на основі вже порахованих показників дати коротку, зрозумілу аналітику та рекомендації звичайною мовою.

Правила:
- Обсяг: один короткий абзац про стан + 3–4 пункти рекомендацій. Без довгих вступів. Орієнтовно до 350–450 слів.
- Терміни завжди розшифровуй: не пиши лише «ІМТ» чи «WH». При першій згадці обов'язково пиши повністю: «індекс маси тіла (ІМТ)», «відношення талії до стегон (WH)». Далі можна використовувати скорочення в дужках або знову повні назви. Нічого не давай у «зашифрованому» вигляді — читач має одразу розуміти, про що йдеться.
- Не став медичних діагнозів і не замінюй консультацію лікаря.
- Не перераховуй формули — довіряй значенням і статусам з вхідних даних.
- Якщо у статусах є прапорець blocked або requireDoctorConfirmation — обов'язково наголоси на консультації лікаря.
- Пиши українською, просто і підтримуюче. Лише тренування, харчування та відновлення.`
,

  GOALS_VS_CURRENT: `Ти — фітнес-тренер. Отримуєш готовий текстовий блок з висновками коду про цілі та поточний стан.

Правила:
- Переказуй ТІЛЬКИ те, що є у блоці. Нічого не вигадуй і не додавай.
- 3–5 речень, українська мова.
- Без заголовків, без маркерів, без розмітки.
- Якщо є рядок «Увага: ...» — згадай це м’яко, без залякування.`
});

const USER_TEMPLATES = Object.freeze({
  BODY_ANALYSIS: `
Ось дані клієнта у форматі JSON:

{{bodyStatusJson}}

Завдання:
1) Один короткий абзац: поточний стан за whStatus/bmiStatus та тип фігури з bodyType. Обов'язково пиши повними назвами: «індекс маси тіла (ІМТ)», «відношення талії до стегон (WH)» — не лишай тільки абревіатури, щоб читач одразу розумів. Якщо є bodyType.type — label і пріоритети в одному-двох реченнях; якщо insufficient_data — «тип фігури не визначено» і що бракує.
2) Рівно 3–4 пункти рекомендацій (тренування, харчування, відновлення). Без довгих пояснень.
3) Якщо бракує ключових даних (зріст, вага, талія) — в кінці однією фразою: аналіз обмежений, переліч що не вистачає.
4) whStatus.message / bmiStatus.message — врахуй зміст, переформулюй коротко. Якщо є notifyCoach або requireDoctorConfirmation — додай одну фразу про тренера/лікаря.
5) Не вигадуй типи фігури — тільки з bodyType. Відповідь: один абзац + маркований список 3–4 пунктів, без зайвого тексту.
`.trim()
,

  GOALS_VS_CURRENT: `
Ось текстовий блок з даними:

{{goalsBlock}}

Завдання:
Перекажи людською мовою як тренер у 3–5 реченнях. Без списків і заголовків.
`.trim()
});

/**
 * Побудова user-повідомлення для коментарів до плану.
 * @param {Object} profile — first_name або firstName, age, goal, level, medicalConditions
 * @param {Array<{ id: string|number, name_ua?: string, name?: string, medicalStatus?: string, sets?: number, reps?: string }>} exercises
 * @param {string} dayType — тип дня (full_body, upper, lower, push, pull, legs)
 * @returns {string}
 */
function buildPlanCommentsPrompt(profile, exercises, dayType) {
  const name = profile.first_name || profile.firstName || 'Учень';
  const age = profile.age != null ? profile.age : 'не вказано';
  const goal = profile.goal || 'не вказано';
  const level = profile.level || 'не вказано';
  const medical = profile.medicalConditions || profile.medicalSummary || 'немає';

  const lines = [
    'ПРОФІЛЬ УЧНЯ:',
    '- Ім\'я: ' + name,
    '- Вік: ' + age,
    '- Ціль: ' + goal,
    '- Рівень: ' + level,
    '- Медичні стани: ' + medical,
    '',
    'ТИП ДНЯ: ' + (dayType || 'тренування'),
    '',
    'ВПРАВИ ДЛЯ КОМЕНТУВАННЯ:'
  ];

  (exercises || []).forEach((ex) => {
    const id = ex.id != null ? ex.id : '';
    const nameUa = ex.name_ua || ex.name || 'Вправа';
    const status = ex.medicalStatus || '—';
    const sets = ex.sets != null ? ex.sets : '—';
    const reps = ex.reps != null ? ex.reps : '—';
    lines.push('ID: ' + id);
    lines.push('Назва: ' + nameUa);
    lines.push('Медичний статус: ' + status);
    lines.push('Sets: ' + sets + ' Reps: ' + reps);
    lines.push('');
  });

  lines.push('Створи персональні коментарі тренера для кожної вправи (ключі в JSON — ID вправ та "day_summary") та загальний коментар до дня (day_summary).');
  return lines.join('\n');
}

/**
 * Побудова user-повідомлення для розумного нагадування.
 * @param {Object} slot — date/time (або slot_date, start_time), опційно session_type
 * @param {string} studentName
 * @param {Array<{ date?: string, exercise_count?: number, total_weight?: number, best_exercise?: string }>} recentWorkouts
 * @returns {string}
 */
function buildReminderPrompt(slot, studentName, recentWorkouts) {
  const dateStr = slot.slot_date || slot.date || (slot.date instanceof Date ? slot.date.toISOString().slice(0, 10) : '');
  const timeStr = slot.start_time || slot.time || '';
  const sessionType = slot.session_type || 'тренування';

  const lines = [
    'НАГАДУВАННЯ ПРО ТРЕНУВАННЯ:',
    'Учень: ' + (studentName || 'Учень'),
    'Дата/час: ' + dateStr + ' ' + timeStr,
    'Тип: ' + sessionType,
    '',
    'ОСТАННІ ТРЕНУВАННЯ:'
  ];

  const recent = (recentWorkouts || []).slice(0, 3);
  if (recent.length) {
    recent.forEach((w) => {
      let s = '- ' + (w.date || '') + ': ';
      if (w.exercise_count != null) s += w.exercise_count + ' вправ';
      if (w.total_weight != null) s += ', загальна вага ' + w.total_weight + ' кг';
      if (w.best_exercise) s += '. Краща вправа: ' + w.best_exercise;
      lines.push(s);
    });
    const last = recent[0];
    if (last && last.best_exercise) {
      lines.push('');
      lines.push('ОСТАННЄ ДОСЯГНЕННЯ: ' + last.best_exercise);
    }
  } else {
    lines.push('- Немає даних за останній період');
  }

  lines.push('');
  lines.push('Створи персональне нагадування про сьогоднішнє тренування (до 150 символів, українською, без emojis).');
  return lines.join('\n');
}

/**
 * Побудова user-повідомлення для аналізу невиконання вправ.
 * @param {Array<{ name: string, completedSets: number, plannedSets: number, planned_weight?: number, failure_reason?: string }>} failedExercises
 * @param {Array<{ date: string, completion_rate?: number, failed_exercises?: string[] }>} recentHistory
 * @param {Object} workoutData — duration_minutes, feeling_score
 * @returns {string}
 */
function buildFailureAnalysisPrompt(failedExercises, recentHistory, workoutData) {
  const lines = ['НЕВИКОНАНІ ВПРАВИ:'];

  (failedExercises || []).forEach((ex) => {
    lines.push('- ' + (ex.name || 'Вправа') + ': виконано ' + (ex.completedSets ?? '?') + '/' + (ex.plannedSets ?? '?') + ' підходів');
    if (ex.planned_weight != null) lines.push('  Планована вага: ' + ex.planned_weight + ' кг');
    lines.push('  Причина (якщо вказана): ' + (ex.failure_reason || 'не вказана'));
  });

  lines.push('');
  lines.push('ІСТОРІЯ (14 днів):');
  const history = recentHistory || [];
  if (history.length) {
    history.forEach((h) => {
      let s = 'Дата: ' + (h.date || '');
      if (h.completion_rate != null) s += ', Успішність: ' + h.completion_rate + '%';
      if (h.sets_recorded != null) s += ', Підходів: ' + h.sets_recorded;
      if (h.failed_exercises && h.failed_exercises.length) s += ', Проблемні вправи: ' + h.failed_exercises.join(', ');
      lines.push(s);
    });
  } else {
    lines.push('Немає даних за попередні дні.');
  }

  lines.push('');
  lines.push('ЗАГАЛЬНА ІНФОРМАЦІЯ:');
  lines.push('- Тривалість тренування: ' + (workoutData && workoutData.duration_minutes != null ? workoutData.duration_minutes : '?') + ' хв');
  lines.push('- Самопочуття (1-10): ' + (workoutData && workoutData.feeling_score != null ? workoutData.feeling_score : 'не вказано'));

  lines.push('');
  lines.push('Проаналізуй причини невиконання та дай поради. Відповідь тільки у форматі JSON (student_message, coach_message, notify_coach, suggested_changes).');
  return lines.join('\n');
}

module.exports = {
  SYSTEM_PROMPTS,
  USER_TEMPLATES,
  buildPlanCommentsPrompt,
  buildReminderPrompt,
  buildFailureAnalysisPrompt
};
