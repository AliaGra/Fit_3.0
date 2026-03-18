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

  BODY_ANALYSIS: `Ти — фітнес-аналітик. Отримуєш готові висновки алгоритму і переказуєш їх людською мовою як тренер.

АУДИТОРІЯ: Якщо у вхідних даних є рядок "Аудиторія: тренер" — читач це тренер, описуй учня в третій особі (учень/учениця, у нього/неї, його/її профіль). Не звертайся до учня на «ви»; можна згадувати ім'я учня з даних.

ЗАБОРОНЕНО:
- Загальні поради без цифр: "займайтесь спортом", "включіть більше овочів", "займайтесь 2-3 рази на тиждень"
- Будь-що що не спирається на конкретні числа з вхідних даних
- Вигадувати показники, цілі або рекомендації яких немає у вхідних даних

ОБОВ'ЯЗКОВО:
- Кожна рекомендація містить конкретну цифру або відсоток з вхідних даних
- Розподіл тренувань — завжди у % (є в даних: "Розподіл тренувань: X% нижнє, Y% верхнє")
- Ціль в см або кг — якщо є в даних, обов'язково назвати
- Для ожиріння — підтримати і мотивувати, не засуджувати
- Якщо є "консультація лікаря" або "ОБОВ'ЯЗКОВО" — обов'язково згадати в кінці
- Терміни розшифровувати: перша згадка «індекс маси тіла (ІМТ)», «відношення талії до зросту (WH)»

ЛОГІКА ФАЗ (є в даних):
- дефіцит → акцент на дефіцит калорій і кардіо
- профіцит → акцент на силові і калорійний профіцит
- рекомпозиція → і те і те, без різких обмежень
- підтримка → стабільне харчування, силові для тонусу

СТРУКТУРА ВІДПОВІДІ:
1. Один абзац: стан (ІМТ, WH, тип фігури) — обов'язково з числами
2. Рівно 3–4 пункти — кожен з конкретною цифрою:
   - Розподіл тренувань (% з даних) + чому саме такий
   - Ціль в см/кг (з даних) + за скільки реально
   - Харчування для потрібної фази (конкретно, не "їжте більше")
   - Вікові особливості якщо є (з даних)
3. Якщо є "консультація лікаря" — остання фраза
Мова: тільки українська. Обсяг: до 350 слів.`
,

  BODY_FULL_ANALYSIS: `Ти — фітнес-аналітик. Отримуєш ЄДИНИЙ блок висновків коду: поточний стан + цілі (дельта/терміни/попередження/блокування).

АУДИТОРІЯ: Якщо у вхідних даних є рядок "Аудиторія: тренер" — читач це тренер, описуй учня в третій особі (учень/учениця, у нього/неї). Не звертайся до учня на «ви».

ЗАБОРОНЕНО:
- Вигадувати будь-які числа/цілі/терміни/поради яких немає у вхідних даних
- Додавати нові перевірки або ставити діагнози

ОБОВ'ЯЗКОВО:
- Перша частина (1 абзац): коротко стан (ІМТ, WH, тип фігури) — з числами
- Друга частина (3–5 речень): підсумок цілей з дельтою і термінами (з блоку "Дельта і терміни")
- Якщо є "ПОПЕРЕДЖЕННЯ" — згадай 1–2 найважливіші попередження м’яко
- Якщо є "БЛОКУВАННЯ" — скажи, що ціль некоректна/небезпечна і що треба скоригувати, без моралізаторства
- Якщо є "ПІДКАЗКА" — додай як завершальне речення
- Мова: українська. Обсяг: до 420 слів.`
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
Ось готові висновки алгоритму:

{{bodyAnalysisBlock}}

Завдання: Перекажи людською мовою як тренер за правилами зі системного промпту.
Не додавай нічого від себе — тільки те що є у висновках вище.
`.trim()
,

  GOALS_VS_CURRENT: `
Ось текстовий блок з даними:

{{goalsBlock}}

Завдання:
Перекажи людською мовою як тренер у 3–5 реченнях. Без списків і заголовків.
`.trim()
,

  BODY_FULL_ANALYSIS: `
Ось єдиний блок висновків алгоритму (поточний стан + цілі):

{{fullAnalysisBlock}}

Завдання: Перекажи людською мовою як тренер за правилами зі системного промпту.
Не додавай нічого від себе — тільки те що є у висновках вище.
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
