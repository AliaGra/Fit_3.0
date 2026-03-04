# ТЗ: Прогресивний план тренувань — FIT 3.0

**Версія:** 1.0  
**Дата:** березень 2026  
**Для:** Cursor AI  
**Статус:** Готово до реалізації  

---

## 1. Контекст

### 1.1 Що змінюється

Авто-план у FIT 3.0 зараз генерує один тижневий цикл (N днів) який учень повторює щотижня без змін. Цей підхід замінюється на **прогресивний план** — повний план на всі тижні терміну контролю з фазовою ротацією вправ.

### 1.2 Ключові рішення (узгоджено з власником продукту)

- Прогресивний план — **єдиний** режим авто-плану. Кнопка "Простий план" прибирається з UI.
- Старі плани в `training_plan_exercises` продовжують працювати до кінця терміну (зворотна сумісність через `generation_mode`).
- `training_plan_exercises` для нових прогресивних планів **не заповнюється взагалі**.
- AI отримує **всі дні фази одним запитом** і вирішує: вибір вправи + порядок у дні + пояснення `ai_reason`.
- Тренер втручається в кандидатів **окремо для кожної фази** перед викликом AI.
- Після генерації AI тренер може редагувати план вручну — **без повторного виклику AI**.
- Авто-прогресія `target_weight` після тренування — **без змін**, оновлює записи в `training_plan_weeks`.

---

## 2. База даних

### 2.1 Нова таблиця `training_plan_weeks`

```sql
CREATE TABLE training_plan_weeks (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        uuid NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  week_number    integer NOT NULL,        -- 1..revision_weeks
  day_number     integer NOT NULL,        -- 1..days_per_week
  day_label      text,                    -- напр. "Верх", "Низ", "Повне тіло"
  phase          text NOT NULL,           -- 'A', 'B', 'C'
  exercise_id    integer REFERENCES exercise_library(id),
  exercise_name  text NOT NULL,
  sets           integer,
  reps           text,
  rest_sec       integer,
  order_in_day   integer NOT NULL DEFAULT 1,
  notes          text,                    -- AI коментар тренера (з planComments, якщо є)
  ai_reason      text,                    -- AI пояснення чому обрана ця вправа
  medical_status text DEFAULT 'NEUTRAL',
  target_weight  decimal(5,2),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX ON training_plan_weeks(plan_id, week_number, day_number);
CREATE INDEX ON training_plan_weeks(plan_id, phase);
```

### 2.2 Нові поля в `training_plans`

```sql
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS generation_mode  text DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS phase_duration   integer,
  ADD COLUMN IF NOT EXISTS total_weeks      integer,
  ADD COLUMN IF NOT EXISTS ai_plan_summary  text;

COMMENT ON COLUMN training_plans.generation_mode IS 'simple — старий цикл (training_plan_exercises), progressive — новий (training_plan_weeks)';
COMMENT ON COLUMN training_plans.phase_duration   IS 'Кількість тижнів в одній фазі. Задається тренером.';
COMMENT ON COLUMN training_plans.total_weeks      IS 'Дублює revision_weeks для зручності вибірки';
COMMENT ON COLUMN training_plans.ai_plan_summary  IS 'AI пояснення загальної логіки плану';
```

### 2.3 Файл міграції

Назва файлу: `supabase_migration_progressive_plan.sql`  
Містить: CREATE TABLE training_plan_weeks + ALTER TABLE training_plans.

---

## 3. Повний флоу тренера (покроково)

```
Мої учні → [Учень] → Програма тренувань → Новий план → Авто-підбір
     ↓
[Крок 1] showAutoSummary — профіль учня (goal, level, дні/тиж)
     ↓
[Крок 2] askPhaseDuration — "Скільки тижнів одна фаза?"
         Кнопки: [2 тижні] [3 тижні] [4 тижні]
         Callback: PLAN_PHASE_DUR:2 | PLAN_PHASE_DUR:3 | PLAN_PHASE_DUR:4
     ↓
[Крок 3] askAccentZones (існуючий флоу — без змін)
     ↓
[Крок 4] askAvoidZones (існуючий флоу — без змін)
     ↓
[Крок 5] showSplitPreview (існуючий флоу — без змін)
         Тренер підтверджує розподіл груп м'язів по днях
     ↓
     ═══ ЦИКЛ ПО ФАЗАХ (A, потім B, потім C якщо є) ═══
     ↓
[Крок 6] showPhaseCandidates(phase) — показ кандидатів фази
         Тренер бачить по днях які вправи заплановані:

         "Фаза A — перегляд вправ по днях"

         День 1 — Верх (Спина, Плечі):
         1. Тяга гантелі в нахилі  [замінити]
         2. Горизонтальна тяга     [замінити]
         3. Махи сидячи            [замінити]

         День 2 — Низ (Ноги, Сідниці):
         1. Присід з гирею         [замінити]
         2. Румунська тяга         [замінити]
         ...

         Кнопки: [← Назад] [✓ Підтвердити і запустити AI]

     ↓
[Крок 6а] Якщо тренер натискає [замінити] біля вправи:
          → пошук по бібліотеці (існуючий Alias.searchExercisesWithAliases)
          → тренер обирає вправу → вона замінює кандидата в стані
          → повернення до showPhaseCandidates з оновленим списком
     ↓
[Крок 7] Тренер натискає [✓ Підтвердити і запустити AI]
         → виклик callProgressivePlanAI(phase, candidatesByDay, studentProfile)
         → показ "Генерую план фази A..." (повідомлення без кнопок)
         → AI повертає фінальний набір з порядком і ai_reason
         → зберігається в planState.phaseResults[phase]
     ↓
[Крок 8] Якщо є ще фази → повернення до Кроку 6 для наступної фази (B, C...)
         Якщо всі фази готові → Крок 9
     ↓
[Крок 9] Дані розгортаються по тижнях і зберігаються в training_plan_weeks
         → showFullPlanPreview — тренер бачить весь план
     ↓
[Крок 10] showFullPlanPreview — перегляд всього плану:

          "Прогресивний план | 7 тижнів | 3 дні/тиж"
          "Фаза A: тижні 1-3 | Фаза B: тижні 4-7"

          [Переглянути по тижнях] [AI пояснення] [Редагувати] [Активувати]

     ↓
[Крок 11а] [Переглянути по тижнях] → showWeekView(weekNumber):
           навігація ← Тиждень N →
           показ вправ дня з sets/reps/rest/ai_reason

[Крок 11б] [AI пояснення] → показ ai_plan_summary + ai_reason по вправах

[Крок 11в] [Редагувати] → вибір тижня → вибір дня → список вправ з [замінити]
           Заміна вправи → пошук по бібліотеці → збереження в training_plan_weeks
           БЕЗ повторного виклику AI

[Крок 11г] [Активувати] → setPlanActiveForStudent (існуюча логіка)
           generation_mode = 'progressive' зберігається в training_plans
```

---

## 4. Алгоритм підбору кандидатів

### 4.1 Функція `pickCandidatesForPhase(dayConfigs, phase, usedByGroup, userProfile)`

Файл: `lib/planGenerator.js`

Логіка для кожного дня з dayConfigs:

1. Отримати вправи потрібних груп м'язів з `exercise_library` (активні, `active = 'YES'`).
2. Застосувати `filterExerciseForUser` — виключити BLOCKED, позначити ALLOWED_WITH_MOD.
3. Фільтр за складністю:
   - beginner → difficulty IN ('Низька', 'Початківець')
   - intermediate → difficulty IN ('Низька', 'Середня')
   - advanced → difficulty IN ('Середня', 'Висока', 'Складна')
4. Розділити на базові (`vid = 'Базова'`) та інші (`vid IN ('Ізоляція', 'Стабілізація')`).
5. Якщо фаза B або C — виключити з ізоляційних вправи що вже були в попередніх фазах для тієї самої `group_level2` (usedByGroup: Map<group_level2, Set<exercise_id>>).
6. Кількість кандидатів на слот: 3 вправи (або менше якщо бібліотека обмежена).
7. Пріоритет при відборі кандидатів: SAFE > NEUTRAL > ALLOWED_WITH_MOD.
8. Якщо кандидатів менше 3 — брати скільки є, не доповнювати.

Повертає: масив по днях, кожен день — масив слотів, кожен слот — масив кандидатів.

### 4.2 Кількість вправ на день

Береться з існуючої логіки `getSetsRepsRest` і таблиці розділу 4.4 з `Логіка_складання_плану_тренувань_v1_1.md`:

| Тип дня | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Full Body | 5-6 | 6-7 | 7-8 |
| Upper / Lower | 4-5 | 5-6 | 6-7 |
| Push / Pull / Legs | — | 5-6 | 6-8 |

### 4.3 Sets / Reps / Rest

Береться з існуючої `getSetsRepsRest(goal, level)` — без змін.

---

## 5. AI-шар

### 5.1 Новий файл `lib/ai/progressivePlanAI.js`

Експортує:
- `callProgressivePlanAI(phase, candidatesByDay, studentProfile)` → повертає `aiPhaseResult | null`
- `generatePlanSummary(studentProfile, allPhaseResults)` → повертає рядок `ai_plan_summary | null`

### 5.2 Що передається AI

AI **не отримує** всю бібліотеку вправ. Передаються тільки кандидати що підготував алгоритм.

Поля кандидата що передаються AI:
```
id, name_ua, vid, difficulty, group_level2, medical_status, focus_point (обрізати до 80 символів)
```

### 5.3 Системний промпт

```
Ти — досвідчений персональний тренер. Обираєш оптимальні вправи для тренувального плану.

ПРАВИЛА:
1. Для кожного слоту обери ОДНУ вправу з кандидатів (chosen_exercise_id має бути з наданого списку)
2. Визнач оптимальний порядок вправ у кожному дні: великі м'язові групи → малі, базові → ізоляція
3. Для фази B і далі — враховуй що ізоляційні вправи мають відрізнятись від попередньої фази
4. Коротко поясни вибір кожної вправи (1 речення, до 120 символів, українська мова)
5. Відповідай ТІЛЬКИ валідним JSON без пояснень поза JSON
```

### 5.4 User-промпт (будується функцією `buildProgressivePlanPrompt`)

```
ПРОФІЛЬ УЧНЯ:
Ціль: {goal} | Рівень: {level} | Стать: {gender} | Вік: {age}
Медичні обмеження: {medSummary або "немає"}
Акцент-зони: {accentZones або "немає"}
Зони уникнення: {avoidZones або "немає"}

ФАЗА: {phase}
{якщо phase != 'A': "Ізоляційні вправи мають відрізнятись від фази A"}

КАНДИДАТИ:
{JSON масив по днях зі слотами і кандидатами}
```

### 5.5 Очікувана відповідь AI (JSON)

```json
{
  "days": [
    {
      "day_number": 1,
      "day_label": "Верх",
      "exercises": [
        {
          "slot_index": 0,
          "chosen_exercise_id": 16,
          "order_in_day": 1,
          "ai_reason": "Найефективніша базова вправа для спини у початківця, безпечна для суглобів"
        },
        {
          "slot_index": 1,
          "chosen_exercise_id": 37,
          "order_in_day": 2,
          "ai_reason": "Доповнює тягу, залучає нижні широчайні та розтягує грудні"
        }
      ]
    }
  ],
  "phase_summary": "Фаза A зосереджена на базових рухах для формування правильної техніки перед прогресією."
}
```

### 5.6 Валідація відповіді AI (`lib/ai/aiValidator.js` — додати функцію)

`validateProgressivePlanResponse(aiResponse, candidatesByDay)`:
1. Перевірити що `aiResponse.days` — масив.
2. Для кожної вправи: `chosen_exercise_id` має бути в списку кандидатів відповідного слоту.
3. `order_in_day` — унікальний в межах дня, починається з 1.
4. `ai_reason` — рядок, не порожній, до 150 символів.
5. `phase_summary` — рядок, не порожній, до 300 символів.

**При невалідній відповіді** → fallback: алгоритм сам обирає першого кандидата з кожного слоту, `order_in_day` за порядком слотів, `ai_reason = null`. Plan генерується без AI пояснень.

### 5.7 Вартість (оцінка)

| | Токени |
|---|---|
| Input на фазу (4 дні × 5 вправ × 3 кандидати) | ~1800 |
| Output на фазу | ~500 |
| Вартість фази (GPT-4o-mini) | ~$0.0005 |
| План з 2 фаз + summary | ~$0.0013 |
| 100 планів/місяць | ~$0.13 |

---

## 6. Розгортання по тижнях (функція `expandPhasesToWeeks`)

Файл: `lib/planGenerator.js`

Після того як всі фази підтверджені і AI виконав свою роботу:

```
Вхід: phaseResults (Map phase → exercises по днях), revision_weeks, phase_duration
Вихід: масив рядків для INSERT в training_plan_weeks

Логіка:
  для week від 1 до revision_weeks:
    phaseIndex = floor((week - 1) / phase_duration)
    phaseIndex = min(phaseIndex, кількість фаз - 1)  // остання фаза тягнеться до кінця
    phase = ['A','B','C'][phaseIndex]
    взяти вправи з phaseResults[phase]
    для кожної вправи кожного дня:
      створити рядок з week_number=week, всіма полями вправи
```

Sets/Reps/Rest — однакові для всіх тижнів (авто-прогресія через `target_weight` в runtime).

---

## 7. Виконання плану учнем (зміни в `lib/training.js`)

### 7.1 Визначення поточного тижня

```javascript
function getCurrentPlanWeek(activatedAt, totalWeeks) {
  const days = Math.floor((Date.now() - new Date(activatedAt).getTime()) / 86400000);
  return Math.min(Math.floor(days / 7) + 1, totalWeeks);
}
```

### 7.2 Завантаження вправ дня

В `startStudentPlanWorkout` перевіряти `plan.generation_mode`:

```javascript
if (plan.generation_mode === 'progressive') {
  const week = getCurrentPlanWeek(plan.activated_at, plan.total_weeks);
  exercises = await getPlanWeekDay(plan.plan_id, week, dayNumber);
  // з training_plan_weeks
} else {
  exercises = await getPlanExercises(plan.plan_id, dayNumber);
  // з training_plan_exercises — існуюча логіка без змін
}
```

### 7.3 Авто-прогресія target_weight

`applyProgressionAfterWorkout` — логіка без змін.  
Але `updatePlanExerciseTargetWeight` тепер оновлює `training_plan_weeks` (всі рядки де `exercise_id` збігається і `week_number >= поточний тиждень`), а не `training_plan_exercises`.

---

## 8. Нові функції Supabase (`lib/supabase.js`)

### 8.1 `insertTrainingPlanWeeks(rows)`

Пакетний INSERT масиву рядків в `training_plan_weeks`.

### 8.2 `getPlanWeekDay(planId, weekNumber, dayNumber)`

```sql
SELECT * FROM training_plan_weeks
WHERE plan_id = $1 AND week_number = $2 AND day_number = $3
ORDER BY order_in_day
```

### 8.3 `updateProgressivePlanExerciseWeight(planId, exerciseId, targetWeight, fromWeek)`

```sql
UPDATE training_plan_weeks
SET target_weight = $4
WHERE plan_id = $1 AND exercise_id = $2 AND week_number >= $3
```

### 8.4 `updatePlanWeekExercise(planId, weekNumber, dayNumber, orderInDay, newExercise)`

Для редагування тренером після генерації. Оновлює один рядок в `training_plan_weeks`.

---

## 9. Нові FSM-стани (`lib/state.js` або `lib/constants.js`)

```javascript
const PLAN_PHASE_DUR        = 'PLAN_PHASE_DUR';        // вибір тривалості фази
const PLAN_PHASE_CANDIDATES = 'PLAN_PHASE_CANDIDATES'; // перегляд/редагування кандидатів фази
const PLAN_PHASE_AI_WAIT    = 'PLAN_PHASE_AI_WAIT';    // очікування відповіді AI
const PLAN_FULL_PREVIEW     = 'PLAN_FULL_PREVIEW';      // перегляд всього плану
const PLAN_WEEK_VIEW        = 'PLAN_WEEK_VIEW';         // перегляд конкретного тижня
const PLAN_WEEK_EDIT        = 'PLAN_WEEK_EDIT';         // редагування тижня
```

Нові поля в `planState`:
```javascript
planPhaseDuration:   null,   // число тижнів фази (2|3|4)
planCurrentPhase:    null,   // 'A' | 'B' | 'C' — яка фаза зараз редагується
planCandidates:      {},     // { A: [{day_number, slots:[{candidates}]}], B: ... }
planPhaseResults:    {},     // { A: aiPhaseResult, B: aiPhaseResult }
planTotalWeeks:      null,   // = revision_weeks
```

---

## 10. Нові callback_data (`lib/router.js`)

```
PLAN_PHASE_DUR:{n}              — вибір тривалості фази (n = 2|3|4)
PLAN_CAND_REPLACE:{day}:{idx}   — замінити кандидата (day=номер дня, idx=індекс слоту)
PLAN_CAND_CONFIRM               — підтвердити кандидатів фази і запустити AI
PLAN_FULL_WEEK:{n}              — переглянути тиждень N
PLAN_FULL_AI_REASON             — показати AI пояснення плану
PLAN_FULL_EDIT                  — увійти в режим редагування
PLAN_EDIT_WEEK:{n}:{day}:{ord}  — редагувати конкретну вправу (тиждень, день, order_in_day)
PLAN_ACTIVATE_PROG              — активувати прогресивний план
```

---

## 11. UI — екрани (точний текст для Telegram, без Markdown, VETO 6)

### Екран: вибір тривалості фази

```
Прогресивний план для {ім'я учня}

Ціль: {goal} | Рівень: {level} | {N} днів/тиж | {revision_weeks} тижнів

Скільки тижнів триватиме одна фаза?
(Після кожної фази частина вправ оновлюється для прогресії)

[2 тижні]  [3 тижні]  [4 тижні]
```

### Екран: перегляд кандидатів фази

```
Фаза {A|B|C} — вправи по днях
{якщо B|C: "Ізоляційні вправи оновлені відносно попередньої фази"}

День 1 — {day_label}
1. {exercise_name}  [замінити]
2. {exercise_name}  [замінити]
3. {exercise_name}  [замінити]

День 2 — {day_label}
1. {exercise_name}  [замінити]
...

[← Назад]  [Підтвердити і запустити AI]
```

### Екран: очікування AI

```
Генерую план фази {A|B|C}...
Це займе кілька секунд.
```

### Екран: повний план (після всіх фаз)

```
План готовий

{plan_name} | {total_weeks} тижнів | {days_per_week} дні/тиж
Фаза A: тижні 1-{phase_duration} | Фаза B: тижні {phase_duration+1}-{total_weeks}

[По тижнях]  [AI пояснення]  [Редагувати]  [Активувати]
```

### Екран: тиждень (навігація)

```
Тиждень {N} (Фаза {A|B})

День 1 — {day_label}
1. {exercise_name} — {sets}x{reps}, відп. {rest_sec} сек
   {ai_reason}

2. {exercise_name} — {sets}x{reps}, відп. {rest_sec} сек
   {ai_reason}

[← Тиж.{N-1}]  [Тиж.{N+1} →]  [← До плану]
```

---

## 12. Файли для зміни/створення

| Файл | Дія | Що змінюється |
|---|---|---|
| `supabase_migration_progressive_plan.sql` | Створити | CREATE TABLE training_plan_weeks + ALTER TABLE training_plans |
| `lib/ai/progressivePlanAI.js` | Створити | callProgressivePlanAI, generatePlanSummary, buildProgressivePlanPrompt |
| `lib/ai/aiValidator.js` | Змінити | +validateProgressivePlanResponse |
| `lib/planGenerator.js` | Змінити | +pickCandidatesForPhase, +expandPhasesToWeeks |
| `lib/trainingPlan.js` | Змінити | +showPhaseDurationSelect, +showPhaseCandidates, +showFullPlanPreview, +showWeekView, +showWeekEdit; видалити кнопку "Простий план" з showAutoSummary |
| `lib/training.js` | Змінити | +getCurrentPlanWeek; модифікація startStudentPlanWorkout (перевірка generation_mode) |
| `lib/supabase.js` | Змінити | +insertTrainingPlanWeeks, +getPlanWeekDay, +updateProgressivePlanExerciseWeight, +updatePlanWeekExercise |
| `lib/router.js` | Змінити | +обробники PLAN_PHASE_DUR, PLAN_CAND_*, PLAN_FULL_*, PLAN_EDIT_*, PLAN_ACTIVATE_PROG |
| `lib/constants.js` | Змінити | +нові FSM-стани, +нові поля planState |

---

## 13. Зворотна сумісність

Перевірка в `training.js` при кожному тренуванні за планом:

```javascript
// plan.generation_mode береться з training_plans при завантаженні активного плану
if (plan.generation_mode === 'progressive') {
  // нова логіка: training_plan_weeks
} else {
  // стара логіка: training_plan_exercises (не чіпати)
}
```

Існуючі активні плани (`is_active = true`, `generation_mode = 'simple'` або NULL) продовжують працювати без змін до `valid_until`.

---

## 14. Порядок реалізації для Cursor

```
Крок 1: supabase_migration_progressive_plan.sql — виконати міграцію в Supabase
Крок 2: lib/constants.js — додати нові FSM-стани і поля planState
Крок 3: lib/ai/progressivePlanAI.js — створити файл повністю
Крок 4: lib/ai/aiValidator.js — додати validateProgressivePlanResponse
Крок 5: lib/planGenerator.js — додати pickCandidatesForPhase і expandPhasesToWeeks
Крок 6: lib/supabase.js — додати 4 нові функції
Крок 7: lib/trainingPlan.js — нові UI-функції + видалити кнопку "Простий план"
Крок 8: lib/training.js — getCurrentPlanWeek + перевірка generation_mode
Крок 9: lib/router.js — нові callback-обробники
Крок 10: E2E тест: генерація плану (2 фази) → перегляд → редагування → активація → тренування тижня 1 → тренування тижня 4 (фаза B)
Крок 11: Тест fallback: AI_ENABLED=false → план генерується алгоритмом без ai_reason
Крок 12: Тест зворотної сумісності: старий план в training_plan_exercises продовжує працювати
```

---

## 15. Що НЕ змінюється

- Логіка `getSplitSchemeAndDays` — без змін
- Логіка `getSetsRepsRest` — без змін
- Медична фільтрація `filterExerciseForUser` — без змін
- Anti-Repeat між планами (`getPreviousPlanIsolationExerciseIds`) — без змін
- Акцент-зони / avoid_zones / split_config — без змін, передаються в `options`
- Ручний план (`trainingPlan.js`, потік PLAN_CREATE_MANUAL) — без змін
- Нагадування cron — без змін
- Аналіз невиконання (failureAnalysis.js) — без змін, читає з bot_training_data
- Існуючі AI-функції (planComments, smartReminder) — без змін

---

*FIT 3.0 | ТЗ Прогресивний план | v1.0 | Березень 2026*

---

## 16. Відмінності сценарію: учень без тренера

### 16.1 Визначення сценарію

При вході в систему `users.role` визначає режим роботи:
- `role = 'coach'` → тренерський інтерфейс (існуючий флоу)
- `role = 'student'` з `coach_id IS NULL` → учень без тренера (цей розділ)
- `role = 'student'` з `coach_id IS NOT NULL` → учень з тренером (тренер керує планом)

Учень без тренера (`coach_id IS NULL`) має доступ до створення прогресивного плану самостійно через своє меню.

---

### 16.2 Відмінності при створенні плану

**Флоу кроків — ідентичний** тренерському (розділ 3). Відрізняється тільки мова UI.

#### Таблиця замін тексту

| Крок | Текст для тренера | Текст для учня |
|---|---|---|
| Вибір тривалості фази | "Скільки тижнів одна фаза?" | "Як часто оновлювати вправи?" |
| Кнопки тривалості | [2 тижні] [3 тижні] [4 тижні] | [Частіше — кожні 2 тижні] [Стандартно — кожні 3 тижні] [Рідше — кожні 4 тижні] |
| Заголовок кандидатів | "Фаза A — вправи по днях" | "Твій план — перший блок тренувань" |
| Заголовок наступної фази | "Фаза B — вправи по днях" | "Твій план — другий блок (нові вправи)" |
| Пояснення ротації | (немає) | "У другому блоці частина вправ замінюється — це допомагає уникнути звикання і підтримує прогрес" |
| Кнопка підтвердження кандидатів | "Підтвердити і запустити AI" | "Все підходить, далі" |
| Кнопка заміни вправи | "замінити" | "замінити" (однаково) |
| Очікування AI | "Генерую план фази A..." | "Складаю твій план..." |
| Заголовок повного плану | "Прогресивний план" | "Твій план готовий" |
| Опис фаз у preview | "Фаза A: тижні 1-3 / Фаза B: тижні 4-7" | "Блок 1: тижні 1-3 / Блок 2: тижні 4-7" |
| Кнопка перегляду тижнів | "По тижнях" | "Переглянути по тижнях" |
| Кнопка AI пояснень | "AI пояснення" | "Чому саме ці вправи" |

#### Системний промпт AI для учня без тренера

При `role = 'student'` і `coach_id IS NULL` в `buildProgressivePlanPrompt` додається рядок до системного промпту:

```
Учень тренується самостійно без тренера. Пояснення вибору вправ (ai_reason) мають бути
зрозумілі людині без спортивної освіти — просто, конкретно, без термінів.
Приклад: "Найбезпечніша вправа для спини, не навантажує поперек"
замість: "Ізоляційна вправа для широчайніх з мінімальним залученням розгиначів хребта"
```

---

### 16.3 Відмінності при виконанні тренування

При завантаженні вправ дня (`startStudentPlanWorkout`) перевіряється `plan.created_by_role`:

```javascript
// Зберігати при створенні плану:
// created_by_role = users.role того хто створював план
// Якщо тренер створив для учня → 'coach'
// Якщо учень створив сам → 'student'
```

Нове поле в `training_plans`:
```sql
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS created_by_role text DEFAULT 'coach';
```

#### Екран вправи для учня без тренера

Базовий показ (однаковий для всіх):
```
{exercise_name}
{sets} підходи x {reps} повторів  |  відпочинок {rest_sec} сек
{ai_reason — якщо є}

[Деталі]  [Ввести вагу і повтори]
```

При натисканні [Деталі] — розгортається додатковий блок:
```
Як виконувати:
{focus_point з exercise_library}

Типові помилки:
{common_mistakes з exercise_library}

{youtube_link — якщо не порожній: кнопка [Відео]}

[Згорнути]
```

Callback для кнопки деталей: `EXERCISE_DETAILS:{exercise_id}`

#### Що НЕ показується учням з тренером

Учень що має активний план від тренера (`plan.created_by_role = 'coach'`) — не отримує кнопку [Деталі] і блок підказок. Логіка тренування без змін.

---

### 16.4 Нові поля і функції

**Нове поле БД:**
```sql
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS created_by_role text DEFAULT 'coach';
  -- 'coach' — план створив тренер для учня
  -- 'student' — учень створив сам
```

**Нова функція Supabase:** `getExerciseDetails(exerciseId)` — повертає `focus_point`, `common_mistakes`, `youtube_link` з `exercise_library`.

**Новий callback:** `EXERCISE_DETAILS:{exercise_id}` — обробляється в `router.js`, викликає `showExerciseDetails(bot, chatId, exerciseId)` в `training.js`.

**Нова функція `showExerciseDetails(bot, chatId, exerciseId)`** в `lib/training.js`:
- Завантажує деталі вправи з `exercise_library`
- Формує повідомлення з `focus_point`, `common_mistakes`
- Якщо `youtube_link` не порожній — додає кнопку [Відео] з посиланням
- Кнопка [Згорнути] повертає до екрану вправи

---

### 16.5 Файли що додатково змінюються (до розділу 12)

| Файл | Додаткова зміна |
|---|---|
| `supabase_migration_progressive_plan.sql` | +`created_by_role` в `ALTER TABLE training_plans` |
| `lib/training.js` | +`showExerciseDetails`; перевірка `created_by_role` при показі вправи |
| `lib/supabase.js` | +`getExerciseDetails(exerciseId)` |
| `lib/router.js` | +обробник `EXERCISE_DETAILS:{exercise_id}` |
| `lib/trainingPlan.js` | Умовна логіка тексту UI на основі `users.role` |
| `lib/ai/progressivePlanAI.js` | Умовне додавання рядка до системного промпту при `role = 'student'` |

---

### 16.6 Порядок реалізації (доповнення до розділу 14)

```
Крок 13: Міграція — додати created_by_role в training_plans
Крок 14: trainingPlan.js — умовний текст UI залежно від users.role
Крок 15: progressivePlanAI.js — умовний системний промпт для учня
Крок 16: training.js — showExerciseDetails + перевірка created_by_role
Крок 17: router.js — обробник EXERCISE_DETAILS
Крок 18: E2E тест сценарію: учень без тренера створює план → виконує тренування → натискає Деталі
```


---

## 17. Сети в прогресивному плані

### 17.1 Концепція

В одному дні плану можуть співіснувати два типи виконання вправ:
- `execution_type = 'single'` — одиночна вправа, виконується підходами (sets × reps)
- `execution_type = 'set'` — вправа входить до сету, всі вправи сету виконуються по кругах (plannedRoundsCount)

AI вирішує які вправи об'єднати в сет. Тренер/учень вказує кількість кругів при перегляді кандидатів фази.

**Приклад структури дня:**

```
День 2 — Низ:

[одиночна]  Присід зі штангою — 4×8, відп. 120 сек
[одиночна]  Румунська тяга — 3×10, відп. 90 сек

[сет — 3 круги]
  → Розгинання ноги — 15 повторів
  → Згинання ноги — 15 повторів
  → Підйом на носки — 20 повторів
  відпочинок між кругами: 60 сек
```

---

### 17.2 Зміни в БД

#### Нові поля в `training_plan_weeks`

```sql
ALTER TABLE training_plan_weeks
  ADD COLUMN IF NOT EXISTS execution_type     text NOT NULL DEFAULT 'single',
  -- 'single' | 'set'
  ADD COLUMN IF NOT EXISTS set_id             text,
  -- NULL для одиночних. Для вправ сету — спільний ідентифікатор (напр. 'day1_set1')
  -- Формат: 'w{week}_d{day}_s{set_index}' — напр. 'w1_d2_s1'
  ADD COLUMN IF NOT EXISTS planned_rounds     integer;
  -- NULL для одиночних. Кількість кругів сету (однакове для всіх вправ одного set_id)
```

#### Структура даних в таблиці для прикладу вище

```
week | day | set_id     | exec_type | order | exercise        | sets | reps | rest | rounds
  1  |  2  | NULL       | single    |   1   | Присід зі штан. |  4   |  8   | 120  | NULL
  1  |  2  | NULL       | single    |   2   | Румунська тяга  |  3   |  10  |  90  | NULL
  1  |  2  | w1_d2_s1   | set       |   3   | Розгинання ноги | NULL |  15  |  60  |   3
  1  |  2  | w1_d2_s1   | set       |   4   | Згинання ноги   | NULL |  15  | NULL |   3
  1  |  2  | w1_d2_s1   | set       |   5   | Підйом на носки | NULL |  20  | NULL |   3
```

Примітки:
- `rest_sec` для вправ сету — відпочинок **між кругами**, вказується тільки для першої вправи сету (`order_in_day` мінімальний в групі). Для решти — NULL.
- `sets` для вправ сету — NULL (замінюється на `planned_rounds`).
- `set_id` формується як рядок: `w{week_number}_d{day_number}_s{set_index}`.

---

### 17.3 Що вирішує AI

В JSON-відповіді AI (розділ 5.5) додається новий блок `sets` поряд з `exercises`:

```json
{
  "days": [
    {
      "day_number": 2,
      "day_label": "Низ",
      "exercises": [
        {
          "slot_index": 0,
          "chosen_exercise_id": 69,
          "execution_type": "single",
          "set_id": null,
          "order_in_day": 1,
          "ai_reason": "Базова вправа для квадрицепса, виконується першою поки є сили"
        },
        {
          "slot_index": 1,
          "chosen_exercise_id": 76,
          "execution_type": "single",
          "set_id": null,
          "order_in_day": 2,
          "ai_reason": "Базова вправа для задньої поверхні стегна"
        },
        {
          "slot_index": 2,
          "chosen_exercise_id": 64,
          "execution_type": "set",
          "set_id": "w{w}_d2_s1",
          "order_in_day": 3,
          "ai_reason": "Об'єднана в сет з іншими ізоляційними для економії часу"
        },
        {
          "slot_index": 3,
          "chosen_exercise_id": 80,
          "execution_type": "set",
          "set_id": "w{w}_d2_s1",
          "order_in_day": 4,
          "ai_reason": null
        },
        {
          "slot_index": 4,
          "chosen_exercise_id": 81,
          "execution_type": "set",
          "set_id": "w{w}_d2_s1",
          "order_in_day": 5,
          "ai_reason": null
        }
      ]
    }
  ]
}
```

Правила для AI в системному промпті (доповнення до розділу 5.3):

```
ПРАВИЛА СЕТІВ:
- Об'єднуй в сет тільки ізоляційні вправи (vid != 'Базова')
- Базові вправи ЗАВЖДИ одиночні (execution_type = 'single')
- Максимум 4 вправи в одному сеті
- Мінімум 2 вправи в сеті (інакше — одиночна)
- set_id формат: 'w{w}_d{day_number}_s{індекс сету з 1}' — {w} замінюється при розгортанні по тижнях
- ai_reason вказується тільки для першої вправи сету, для решти — null
- В одному дні може бути не більше 2 сетів
```

---

### 17.4 Кількість кругів — вказує тренер/учень

Після того як AI згенерував фазу і тренер/учень бачить екран кандидатів (розділ 3, Крок 6) — для кожного сету відображається поле вибору кругів.

#### Доповнення до екрану перегляду кандидатів фази

```
День 2 — Низ:
1. Присід з гирею         [замінити]
2. Румунська тяга         [замінити]

Сет (ізоляція):
   Розгинання ноги        [замінити]
   Згинання ноги          [замінити]
   Підйом на носки        [замінити]
   Кількість кругів: [2] [3] [4]   ← вибір кнопками
```

Callback для вибору кругів: `PLAN_SET_ROUNDS:{phase}:{day}:{set_index}:{rounds}`

Обране значення зберігається в `planState.phaseSetRounds`:
```javascript
planState.phaseSetRounds = {
  'A': { 'd2_s1': 3, 'd4_s1': 3 },
  'B': { 'd2_s1': 3 }
}
```

При `expandPhasesToWeeks` — `planned_rounds` береться з `planState.phaseSetRounds` для відповідного дня і сету.

---

### 17.5 Валідація AI-відповіді (доповнення до розділу 5.6)

Додати до `validateProgressivePlanResponse`:

1. Вправи з `execution_type = 'set'` і однаковим `set_id` — мінімум 2, максимум 4.
2. Базові вправи (`vid = 'Базова'`) не можуть мати `execution_type = 'set'`.
3. В одному дні не більше 2 різних `set_id`.
4. `set_id` формат: відповідає паттерну `w{w}_d\d+_s\d+`.

При невалідній відповіді по сетах — fallback: всі вправи стають `execution_type = 'single'`, `set_id = null`.

---

### 17.6 Виконання сету учнем (зміни в `lib/training.js`)

При завантаженні вправ дня (`getPlanWeekDay`) — групувати по `set_id`:

```javascript
function groupDayExercises(exercises) {
  const result = [];
  const setMap = {};

  for (const ex of exercises) {
    if (ex.execution_type === 'single') {
      result.push({ type: 'single', exercise: ex });
    } else {
      if (!setMap[ex.set_id]) {
        setMap[ex.set_id] = { type: 'set', set_id: ex.set_id, planned_rounds: ex.planned_rounds, exercises: [] };
        result.push(setMap[ex.set_id]);
      }
      setMap[ex.set_id].exercises.push(ex);
    }
  }

  return result; // Масив: { type: 'single'|'set', ... }
}
```

#### Показ сету учню під час тренування

```
Сет — 3 круги

Вправа 1/3: Розгинання ноги
15 повторів

[Виконав]
```

Після всіх вправ кола:
```
Коло 1 з 3 завершено
Відпочинок 60 сек

[Пропустити відпочинок]
```

Після всіх кіл — перехід до наступної вправи/сету дня.

---

### 17.7 Файли що додатково змінюються (до розділу 12)

| Файл | Додаткова зміна |
|---|---|
| `supabase_migration_progressive_plan.sql` | +`execution_type`, `set_id`, `planned_rounds` в `training_plan_weeks` |
| `lib/ai/progressivePlanAI.js` | +правила сетів в системний промпт; +`set_id`, `execution_type` в очікувану відповідь |
| `lib/ai/aiValidator.js` | +валідація сетів в `validateProgressivePlanResponse` |
| `lib/planGenerator.js` | +обробка `set_id` при `expandPhasesToWeeks` (підстановка `week_number`) |
| `lib/trainingPlan.js` | +відображення сетів на екрані кандидатів; +кнопки вибору кругів |
| `lib/training.js` | +`groupDayExercises`; +показ сету по колах під час тренування |
| `lib/router.js` | +обробник `PLAN_SET_ROUNDS:{phase}:{day}:{set_index}:{rounds}` |
| `lib/constants.js` | +`planState.phaseSetRounds` |

---

### 17.8 Порядок реалізації (доповнення до розділу 14)

```
Крок 19: Міграція — додати execution_type, set_id, planned_rounds в training_plan_weeks
Крок 20: progressivePlanAI.js — додати правила сетів в промпт і оновити очікувану відповідь
Крок 21: aiValidator.js — додати валідацію сетів
Крок 22: planGenerator.js — обробка set_id при expandPhasesToWeeks
Крок 23: trainingPlan.js — відображення сетів і вибір кругів на екрані кандидатів
Крок 24: training.js — groupDayExercises + показ сету по колах
Крок 25: router.js — обробник PLAN_SET_ROUNDS
Крок 26: E2E тест: план з сетом → перегляд → вибір 3 кругів → активація → виконання сету по колах
Крок 27: Тест fallback: невалідна відповідь AI по сетах → всі вправи стають одиночними
```

