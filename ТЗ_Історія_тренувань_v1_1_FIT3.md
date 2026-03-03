# ТЗ: Модуль «Історія тренувань» — FIT 3.0

**Версія:** 1.1 (з урахуванням Карти_всех_возможных_сценариев.md)
**Дата:** березень 2026
**Проєкт:** FIT 3.0 (Node.js, Supabase, Telegram Bot API, Railway)
**Для:** Cursor AI
**Статус:** Готово до реалізації

---

## 1. Контекст

Бізнес-логіка_Gym_3_0_v1.1.md, рядок №9:
> Історія тренувань | Заглушка | Повідомлення «ще в розробці»

Джерело даних: таблиця `bot_training_data` — зберігає всі записи підходів.
Одне тренування = записи з однаковим `chat_id` і `date::date`.

### Три точки входу (одна логіка, різний targetChatId)

| Хто | Де | targetChatId |
|-----|----|--------------|
| Учень | Головне меню → «📊 Історія» | chatId учня |
| Тренер (своя) | Головне меню → «📊 Моя історія» | chatId тренера |
| Тренер (за учня) | Мої учні → [Учень] → «📊 Історія» | chatId учня |

---

## 2. Таблиця bot_training_data (джерело)

| Поле | Тип | Опис |
|------|-----|------|
| id | uuid | Унікальний ID запису |
| date | timestamptz | Дата і час підходу |
| exercise_id | int | ID з exercise_library |
| exercise_name | text | Кешована назва |
| weight | numeric | Вага (кг) |
| reps | int | Повтори |
| set | int | Номер підходу |
| chat_id | text | ChatID учня/тренера |

---

## 3. Архітектура flow (з Карти сценаріїв 3.4)

```
HIST_OPEN
  └── showHistoryMenu
        ├── [📋 Всі тренування]      → showSubfilterMenu
        │     ├── [⏮ Попереднє тренування]  → getWorkoutDates(limit=1) → showHistoryDetail
        │     └── [📋 Останні N тренувань]  → askHistoryCount → showHistoryList
        │
        ├── [💪 За групою м'язів]    → showGroupFilter
        │     └── [Спина / Ноги / ...]      → showSubfilterMenu
        │           ├── [⏮ Попереднє]       → showHistoryDetail
        │           └── [📋 Останні N]      → askHistoryCount → showHistoryList
        │
        └── [🎯 За вправою]          → showGroupFilter (для фільтрації вправ)
              └── [Назва групи]              → showExerciseFilter
                    └── [Назва вправи]       → showSubfilterMenu
                          ├── [⏮ Попереднє] → showHistoryDetail
                          └── [📋 Останні N]→ askHistoryCount → showHistoryList

showHistoryList → клік по рядку → showHistoryDetail
showHistoryDetail → [◀️ Попереднє] / [▶️ Наступне] (навігація по histDates)
```

**Поточне незавершене тренування — НЕ реалізовуємо** (відповідь замовника).

---

## 4. Нові функції lib/supabase.js

### 4.1 getWorkoutDates(chatId, limit)

```js
async function getWorkoutDates(chatId, limit = 20) {
  const { data, error } = await supabase
    .from('bot_training_data')
    .select('date')
    .eq('chat_id', String(chatId))
    .order('date', { ascending: false });

  if (error) throw error;

  const seen = new Set();
  const dates = [];
  for (const row of data) {
    const day = row.date.slice(0, 10);
    if (!seen.has(day)) {
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
  }
  return dates; // ['2026-02-01', '2026-01-30', ...]
}
```

### 4.2 getWorkoutByDate(chatId, dateStr)

```js
async function getWorkoutByDate(chatId, dateStr) {
  const { data, error } = await supabase
    .from('bot_training_data')
    .select(`
      id, date, exercise_id, exercise_name, weight, reps, set,
      exercise_library ( group_level1, group_level2 )
    `)
    .eq('chat_id', String(chatId))
    .gte('date', `${dateStr}T00:00:00`)
    .lte('date', `${dateStr}T23:59:59`)
    .order('date', { ascending: true });

  if (error) throw error;
  return data;
}
```

### 4.3 getWorkoutDatesByMuscleGroup(chatId, groupLevel2, limit)

```js
async function getWorkoutDatesByMuscleGroup(chatId, groupLevel2, limit = 20) {
  const { data: exercises } = await supabase
    .from('exercise_library')
    .select('id')
    .eq('group_level2', groupLevel2)
    .eq('active', 'YES');

  const exerciseIds = exercises.map(e => e.id);

  const { data, error } = await supabase
    .from('bot_training_data')
    .select('date')
    .eq('chat_id', String(chatId))
    .in('exercise_id', exerciseIds)
    .order('date', { ascending: false });

  if (error) throw error;

  const seen = new Set();
  const dates = [];
  for (const row of data) {
    const day = row.date.slice(0, 10);
    if (!seen.has(day)) {
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}
```

### 4.4 getWorkoutDatesByExercise(chatId, exerciseId, limit)

```js
async function getWorkoutDatesByExercise(chatId, exerciseId, limit = 20) {
  const { data, error } = await supabase
    .from('bot_training_data')
    .select('date')
    .eq('chat_id', String(chatId))
    .eq('exercise_id', exerciseId)
    .order('date', { ascending: false });

  if (error) throw error;

  const seen = new Set();
  const dates = [];
  for (const row of data) {
    const day = row.date.slice(0, 10);
    if (!seen.has(day)) {
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}
```

### 4.5 getExercisesTrainedByStudent(chatId, groupLevel2)

```js
// groupLevel2 — опційно, для фільтрації списку вправ по групі
async function getExercisesTrainedByStudent(chatId, groupLevel2 = null) {
  let query = supabase
    .from('bot_training_data')
    .select('exercise_id, exercise_name')
    .eq('chat_id', String(chatId));

  const { data, error } = await query;
  if (error) throw error;

  const seen = new Map();
  for (const row of data) {
    if (!seen.has(row.exercise_id)) {
      seen.set(row.exercise_id, row.exercise_name);
    }
  }

  let exercises = Array.from(seen, ([id, name]) => ({ id, name }));

  // Якщо є фільтр по групі — відфільтрувати через exercise_library
  if (groupLevel2) {
    const { data: libData } = await supabase
      .from('exercise_library')
      .select('id')
      .eq('group_level2', groupLevel2)
      .eq('active', 'YES');
    const allowedIds = new Set(libData.map(e => e.id));
    exercises = exercises.filter(e => allowedIds.has(e.id));
  }

  return exercises;
}
```

---

## 5. Нові FSM-стани

Додати в lib/state.js або там де зберігаються константи станів:

```js
const HIST_MENU          = 'HIST_MENU';
const HIST_SUBFILER      = 'HIST_SUBFILTER';
const HIST_GROUP_SELECT  = 'HIST_GROUP_SELECT';
const HIST_EX_SELECT     = 'HIST_EX_SELECT';
const HIST_LIST          = 'HIST_LIST';
const HIST_DETAIL        = 'HIST_DETAIL';
const HIST_COUNT_INPUT   = 'HIST_COUNT_INPUT';
```

Нові поля в об'єкті стану користувача (userState):

```js
histTargetChatId:     null,    // чия історія (може != chatId при coach_student)
histOrigin:           null,    // 'self' | 'coach_own' | 'coach_student'
histFilter:           null,    // 'all' | 'group' | 'exercise'
histFilterGroup:      null,    // group_level2 (для фільтрів group і exercise)
histFilterExerciseId: null,    // exerciseId (для фільтру exercise)
histDates:            [],      // масив дат ['2026-02-01', ...]
histCurrentIndex:     0,       // поточна позиція в масиві histDates
```

---

## 6. Нові callback_data

Додати в lib/router.js та CALLBACK_FSM_MODULE_MATRIX.md:

```
// Відкриття
HIST_OPEN                        — відкрити меню фільтрів

// Головні фільтри (крок 1)
HIST_FILTER:all                  — всі тренування → showSubfilterMenu
HIST_FILTER:group                — за групою → showGroupFilter (крок 2a)
HIST_FILTER:exercise             — за вправою → showGroupFilter (крок 2b, для вибору вправи)

// Вибір групи м'язів (крок 2)
HIST_GROUP:{group_level2}        — обрати групу; поведінка залежить від histFilter

// Вибір вправи (крок 3, тільки для exercise)
HIST_EX:{exerciseId}             — обрати вправу → showSubfilterMenu

// Підфільтри (карта 3.4.1 / 3.4.2 / 3.4.3)
HIST_SUB:prev                    — попереднє тренування (1 дата)
HIST_SUB:last_n                  — останні N → askHistoryCount

// Список і деталі
HIST_VIEW:{dateStr}              — відкрити деталі конкретної дати
HIST_PREV                        — новіше тренування (index--)
HIST_NEXT                        — старіше тренування (index++)

// Назад
HIST_BACK_MENU                   — до меню фільтрів
HIST_BACK_SUBFILTER              — до підфільтрів
HIST_BACK_LIST                   — до списку тренувань
HIST_BACK_GROUP                  — до вибору групи (для exercise flow)
HIST_BACK_STUDENT                — до картки учня (coach_student)
```

---

## 7. Новий файл lib/history.js

### 7.1 showHistoryMenu(bot, chatId, targetChatId, origin)

Зберігає в стан: histTargetChatId, histOrigin.

Текст для coach_student:
```
📊 Історія тренувань — [Ім'я Прізвище учня]

Оберіть фільтр:
```

Текст для self / coach_own:
```
📊 Моя історія тренувань

Оберіть фільтр:
```

Кнопки:
```
[📋 Всі тренування]
[💪 За групою м'язів]
[🎯 За вправою]
[🔙 Назад]
```

Кнопка «Назад»:
- coach_student → HIST_BACK_STUDENT
- self / coach_own → головне меню (MAIN_MENU або аналог)

---

### 7.2 showSubfilterMenu(bot, chatId, histState)

Показується після вибору будь-якого фільтру (all / group / exercise).
Показує підфільтри відповідно до карти сценаріїв 3.4.1 / 3.4.2 / 3.4.3.

Текст:
```
Який період показати?
```

Кнопки:
```
[⏮ Попереднє тренування]
[📋 Останні N тренувань]
[🔙 Назад]
```

Кнопка «Назад» → HIST_BACK_MENU (до головного меню фільтрів).

При виборі [⏮ Попереднє тренування]:
1. Залежно від histFilter викликати відповідну функцію supabase з limit=1
2. Якщо дат 0 → повідомлення «Тренувань ще немає» + кнопка «Назад»
3. Якщо є → одразу showHistoryDetail (без проміжного списку)

При виборі [📋 Останні N тренувань] → askHistoryCount

---

### 7.3 showGroupFilter(bot, chatId, histState)

Використовується для двох сценаріїв:
- histFilter === 'group' → після вибору групи → showSubfilterMenu
- histFilter === 'exercise' → після вибору групи → showExerciseFilter

Текст:
```
Оберіть групу м'язів:
```

Кнопки (по 2 в рядку, групи 2-го рівня з GROUPS_BY_TOP):
```
[💪 Груди]    [🔥 Спина]
[🦵 Ноги]     [🍑 Сідниці]
[🤸 Плечі]    [💪 Руки]
[🏋️ Прес]
[🔙 Назад]
```

Callback: HIST_GROUP:{group_level2}

Кнопка «Назад» → HIST_BACK_MENU.

Логіка при кліку HIST_GROUP:{group}:
```js
userState.histFilterGroup = group;
if (userState.histFilter === 'group') {
  await history.showSubfilterMenu(bot, chatId, userState);
} else {
  // histFilter === 'exercise'
  await history.showExerciseFilter(bot, chatId, userState);
}
```

---

### 7.4 showExerciseFilter(bot, chatId, histState)

Призначення: список вправ що учень виконував у вибраній групі.

Логіка:
1. getExercisesTrainedByStudent(targetChatId, histFilterGroup) → масив вправ
2. Якщо порожньо → «Вправ з цієї групи ще немає» + [🔙 Назад]
3. До 30 кнопок по 1 в рядку

Текст:
```
Оберіть вправу:
```

Кнопки:
```
[Підтягування]
[Тяга штанги в нахилі]
...
[🔙 Назад]
```

Callback: HIST_EX:{exerciseId}
Кнопка «Назад» → HIST_BACK_GROUP (повернення до вибору групи).

При кліку HIST_EX:{exerciseId}:
```js
userState.histFilterExerciseId = exerciseId;
await history.showSubfilterMenu(bot, chatId, userState);
```

---

### 7.5 askHistoryCount(bot, chatId)

FSM-стан: HIST_COUNT_INPUT

Текст:
```
Скільки тренувань показати?
Введіть число від 1 до 100:
```

Кнопка «Назад» → HIST_BACK_SUBFILTER.

Валідація:
```js
function validateHistCount(input) {
  const n = parseInt(input);
  if (isNaN(n) || n < 1 || n > 100) return { valid: false };
  return { valid: true, value: n };
}
```

При невалідному вводі повторити запит: «Введіть число від 1 до 100».

---

### 7.6 showHistoryList(bot, chatId, histState)

Відображає список дат тренувань кнопками.

Логіка:
1. histDates вже заповнений (масив дат)
2. Для кожної дати викликати getWorkoutByDate → рахувати статистику
3. Відобразити кнопки

Текст:
```
📋 Тренування (всього: N):
```

Кнопки (одна на рядок):
```
[📅 01.02.2026 — Груди+Трицепс (4 вправи, 10 підходів)]
[📅 30.01.2026 — Спина+Біцепс (5 вправ, 14 підходів)]
...
[🔙 Назад]
```

Формат рядка кнопки (відповідає карті сценаріїв):
```js
function formatWorkoutListItem(dateStr, rows) {
  const date = formatDateShort(dateStr); // '01.02.2026'
  const groups = [...new Set(
    rows.map(r => r.exercise_library?.group_level2).filter(Boolean)
  )];
  const exerciseCount = new Set(rows.map(r => r.exercise_id)).size;
  const setCount = rows.length;
  return `📅 ${date} — ${groups.join('+')} (${exerciseCount} вправи, ${setCount} підходів)`;
}
```

Callback: HIST_VIEW:{dateStr}

При порожньому histDates:
```
За цим фільтром тренувань ще немає.

[🔙 Назад]
```

Кнопка «Назад» → HIST_BACK_SUBFILTER.

---

### 7.7 showHistoryDetail(bot, chatId, histState)

Призначення: деталі одного тренування. Відповідає формату з карти сценаріїв 3.4.

Логіка:
1. dateStr = histState.histDates[histState.histCurrentIndex]
2. getWorkoutByDate(histTargetChatId, dateStr)
3. groupRowsByExercise(rows) → згрупувати по group_level2 → по вправах
4. Сформувати текст

Формат тексту (точно як у карті сценаріїв):
```
📅 Тренування: 01.02.2026 14:35

Груди:

1️⃣ Жим штанги лежачи
   Підхід 1: 80кг × 8 повторів
   Підхід 2: 80кг × 7 повторів
   Підхід 3: 75кг × 8 повторів

2️⃣ Жим гантелей на похилій
   Підхід 1: 32кг × 10 повторів
   Підхід 2: 32кг × 9 повторів

📊 Всього вправ: 4
💪 Всього підходів: 10

[◀️ Попереднє]  [▶️ Наступне]  [🔙 Назад]
```

Кнопки:
- [◀️ Попереднє] → HIST_PREV (показується якщо histCurrentIndex < histDates.length - 1)
- [▶️ Наступне] → HIST_NEXT (показується якщо histCurrentIndex > 0)
- [🔙 Назад] → HIST_BACK_LIST (якщо прийшли зі списку) або HIST_BACK_SUBFILTER (якщо прийшли з «Попереднє»)

Зберігати в histState.histDetailOrigin: 'list' | 'prev' — щоб знати куди повернутись.

Функція групування:
```js
function groupRowsByExercise(rows) {
  // rows відсортовані по date asc (set asc)
  const groups = {};        // { group_level2: [{ name, sets }] }
  const exerciseMap = new Map();

  for (const row of rows) {
    const exId = row.exercise_id;
    const gl2 = row.exercise_library?.group_level2 || 'Інше';

    if (!exerciseMap.has(exId)) {
      exerciseMap.set(exId, { name: row.exercise_name, groupLevel2: gl2, sets: [] });
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
  return groups; // { 'Груди': [{name, sets}], 'Трицепс': [...] }
}
```

Функція форматування тексту:
```js
function formatDetailText(dateStr, groups) {
  const datetime = formatDateWithTime(dateStr);
  let text = `📅 Тренування: ${datetime}\n\n`;

  let exerciseNum = 1;
  let totalSets = 0;
  let totalExercises = 0;

  for (const [groupName, exercises] of Object.entries(groups)) {
    text += `${groupName}:\n\n`;
    for (const ex of exercises) {
      text += `${getEmojiNumber(exerciseNum)} ${ex.name}\n`;
      for (const s of ex.sets) {
        text += `   Підхід ${s.setNum}: ${s.weight}кг × ${s.reps} повторів\n`;
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

// Емодзі-цифри (1️⃣ - 9️⃣, далі звичайні цифри)
function getEmojiNumber(n) {
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
  return n <= 9 ? emojis[n-1] : `${n}.`;
}
```

---

## 8. Маршрутизація lib/router.js

### 8.1 Callback handlers

```js
// ─── ВІДКРИТТЯ ──────────────────────────────────────────────────────────────

if (data === 'HIST_OPEN') {
  const isCoachViewingStudent = !!userState.viewingStudentId;
  const targetChatId = isCoachViewingStudent ? userState.viewingStudentId : chatId;
  const origin = isCoachViewingStudent
    ? 'coach_student'
    : (user.role === 'coach' ? 'coach_own' : 'self');
  await history.showHistoryMenu(bot, chatId, targetChatId, origin);
  return;
}

// ─── ГОЛОВНІ ФІЛЬТРИ ────────────────────────────────────────────────────────

if (data === 'HIST_FILTER:all') {
  userState.histFilter = 'all';
  userState.histFilterGroup = null;
  userState.histFilterExerciseId = null;
  await history.showSubfilterMenu(bot, chatId, userState);
  return;
}

if (data === 'HIST_FILTER:group') {
  userState.histFilter = 'group';
  await history.showGroupFilter(bot, chatId, userState);
  return;
}

if (data === 'HIST_FILTER:exercise') {
  userState.histFilter = 'exercise';
  await history.showGroupFilter(bot, chatId, userState);
  return;
}

// ─── ВИБІР ГРУПИ ────────────────────────────────────────────────────────────

if (data.startsWith('HIST_GROUP:')) {
  const group = data.slice('HIST_GROUP:'.length);
  userState.histFilterGroup = group;
  if (userState.histFilter === 'group') {
    await history.showSubfilterMenu(bot, chatId, userState);
  } else {
    // histFilter === 'exercise'
    await history.showExerciseFilter(bot, chatId, userState);
  }
  return;
}

// ─── ВИБІР ВПРАВИ ───────────────────────────────────────────────────────────

if (data.startsWith('HIST_EX:')) {
  const exerciseId = parseInt(data.split(':')[1]);
  userState.histFilterExerciseId = exerciseId;
  await history.showSubfilterMenu(bot, chatId, userState);
  return;
}

// ─── ПІДФІЛЬТРИ ─────────────────────────────────────────────────────────────

if (data === 'HIST_SUB:prev') {
  // Завантажити 1 дату і одразу відкрити деталі
  const dates = await loadDatesForCurrentFilter(userState, 1);
  if (!dates.length) {
    await bot.sendMessage(chatId, 'Тренувань ще немає.');
    return;
  }
  userState.histDates = dates;
  userState.histCurrentIndex = 0;
  userState.histDetailOrigin = 'prev';
  await history.showHistoryDetail(bot, chatId, userState);
  return;
}

if (data === 'HIST_SUB:last_n') {
  await history.askHistoryCount(bot, chatId);
  return;
}

// ─── СПИСОК ─────────────────────────────────────────────────────────────────

if (data.startsWith('HIST_VIEW:')) {
  const dateStr = data.slice('HIST_VIEW:'.length);
  const idx = userState.histDates.indexOf(dateStr);
  userState.histCurrentIndex = idx >= 0 ? idx : 0;
  userState.histDetailOrigin = 'list';
  await history.showHistoryDetail(bot, chatId, userState);
  return;
}

// ─── НАВІГАЦІЯ В ДЕТАЛЯХ ─────────────────────────────────────────────────────

if (data === 'HIST_PREV') {
  // Старіше = більший індекс
  if (userState.histCurrentIndex < userState.histDates.length - 1) {
    userState.histCurrentIndex++;
  }
  await history.showHistoryDetail(bot, chatId, userState);
  return;
}

if (data === 'HIST_NEXT') {
  // Новіше = менший індекс
  if (userState.histCurrentIndex > 0) {
    userState.histCurrentIndex--;
  }
  await history.showHistoryDetail(bot, chatId, userState);
  return;
}

// ─── НАЗАД ───────────────────────────────────────────────────────────────────

if (data === 'HIST_BACK_MENU') {
  await history.showHistoryMenu(bot, chatId, userState.histTargetChatId, userState.histOrigin);
  return;
}

if (data === 'HIST_BACK_SUBFILTER') {
  await history.showSubfilterMenu(bot, chatId, userState);
  return;
}

if (data === 'HIST_BACK_LIST') {
  await history.showHistoryList(bot, chatId, userState);
  return;
}

if (data === 'HIST_BACK_GROUP') {
  // Повернення до вибору групи (тільки для exercise flow)
  await history.showGroupFilter(bot, chatId, userState);
  return;
}

if (data === 'HIST_BACK_STUDENT') {
  await showStudentProfile(bot, chatId, userState.histTargetChatId);
  return;
}
```

### 8.2 Допоміжна функція для завантаження дат (по фільтру)

```js
// Використовується в HIST_SUB:prev та HIST_COUNT_INPUT
async function loadDatesForCurrentFilter(userState, limit) {
  const { histTargetChatId, histFilter, histFilterGroup, histFilterExerciseId } = userState;

  if (histFilter === 'all') {
    return await supabase.getWorkoutDates(histTargetChatId, limit);
  }
  if (histFilter === 'group') {
    return await supabase.getWorkoutDatesByMuscleGroup(histTargetChatId, histFilterGroup, limit);
  }
  if (histFilter === 'exercise') {
    return await supabase.getWorkoutDatesByExercise(histTargetChatId, histFilterExerciseId, limit);
  }
  return [];
}
```

### 8.3 Обробка текстового вводу (в handleMessage)

```js
if (userState.step === 'HIST_COUNT_INPUT') {
  const result = history.validateHistCount(msg.text);
  if (!result.valid) {
    await bot.sendMessage(chatId, 'Введіть число від 1 до 100:');
    return;
  }
  userState.histDates = await loadDatesForCurrentFilter(userState, result.value);
  userState.histCurrentIndex = 0;
  userState.histDetailOrigin = 'list';
  userState.step = null;
  await history.showHistoryList(bot, chatId, userState);
  return;
}
```

### 8.4 Підключення кнопок в існуючих меню

Головне меню учня (lib/menu.js):
- Замінити заглушку «Історія» → callback HIST_OPEN

Головне меню тренера (lib/menu.js):
- Кнопка «Моя історія» → callback HIST_OPEN (origin = coach_own)

Картка учня (lib/user.js або де відображається профіль учня):
- Кнопка «Історія» → зберегти `userState.viewingStudentId = studentChatId` → callback HIST_OPEN

---

## 9. Допоміжні функції (lib/history.js або lib/helpers.js)

```js
// Коротка дата '01.02.2026'
function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Дата + час '01.02.2026 14:35'
function formatDateWithTime(dateStr) {
  // dateStr може бути '2026-02-01' або повний ISO timestamp
  const d = new Date(dateStr);
  const date = formatDateShort(dateStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

// Емодзі-цифри
function getEmojiNumber(n) {
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
  return n <= 9 ? emojis[n-1] : `${n}.`;
}
```

---

## 10. Повні сценарії (user flow)

### 10.1 Учень — всі тренування, останні N

```
1. Учень: головне меню → [📊 Історія]
   → HIST_OPEN → showHistoryMenu (origin='self')

2. → [📋 Всі тренування]
   → HIST_FILTER:all → showSubfilterMenu

3. → [📋 Останні N тренувань]
   → HIST_SUB:last_n → askHistoryCount
   → Учень вводить: 10

4. HIST_COUNT_INPUT → loadDatesForCurrentFilter(limit=10)
   → showHistoryList: список 10 кнопок

5. → [📅 01.02.2026 — Груди+Трицепс (4 вправи, 10 підходів)]
   → HIST_VIEW:2026-02-01 → showHistoryDetail

6. → [◀️ Попереднє]
   → HIST_PREV → histCurrentIndex++ → showHistoryDetail

7. → [🔙 Назад]
   → HIST_BACK_LIST → showHistoryList
```

### 10.2 Учень — попереднє тренування по групі

```
1. showHistoryMenu → [💪 За групою м'язів]
   → HIST_FILTER:group → showGroupFilter

2. → [🔥 Спина]
   → HIST_GROUP:Спина → showSubfilterMenu

3. → [⏮ Попереднє тренування]
   → HIST_SUB:prev → getWorkoutDatesByMuscleGroup(chatId, 'Спина', 1)
   → одразу showHistoryDetail (без проміжного списку)

4. → [🔙 Назад]
   → HIST_BACK_SUBFILTER → showSubfilterMenu
```

### 10.3 Учень — за вправою

```
1. showHistoryMenu → [🎯 За вправою]
   → HIST_FILTER:exercise → showGroupFilter

2. → [💪 Руки]
   → HIST_GROUP:Руки → (histFilter==='exercise') → showExerciseFilter

3. → [Підйом гантелей на біцепс]
   → HIST_EX:42 → showSubfilterMenu

4. → [📋 Останні N тренувань]
   → askHistoryCount → 5
   → loadDatesForCurrentFilter('exercise', exerciseId=42, limit=5)
   → showHistoryList
```

### 10.4 Тренер — історія учня

```
1. Тренер: Мої учні → [Олексій] → [📊 Історія]
   → userState.viewingStudentId = studentChatId
   → HIST_OPEN → showHistoryMenu
     Заголовок: "📊 Історія тренувань — Олексій Петренко"
     origin = 'coach_student'

2. Далі аналогічно 10.1, але всі запити по targetChatId = studentChatId

3. На екрані меню фільтрів кнопка [🔙 Назад]
   → HIST_BACK_STUDENT → showStudentProfile
```

---

## 11. Правила та обмеження

1. Емодзі у форматі — залишаємо (підтверджено).
2. Поточне незавершене тренування — НЕ реалізовуємо.
3. Ліміт тренувань — до 100 (як у карті сценаріїв).
4. Ліміт вправ у фільтрі — до 30 кнопок; якщо більше, показати перші 30.
5. ChatID — завжди String(chatId) при запиті до Supabase.
6. Кнопка «Назад» — присутня на кожному екрані.
7. targetChatId ніколи не підмінюється chatId тренера при відкритті з картки учня.
8. Порожній результат — завжди зрозуміле повідомлення.
9. Помилка Supabase — «Помилка завантаження. Спробуйте пізніше» + логування.
10. Навігація [◀️ Попереднє] / [▶️ Наступне] — відповідно карті; Попереднє = старіше (більший індекс у масиві).

---

## 12. Файли для створення/зміни

| Файл | Дія | Що змінюється |
|------|-----|---------------|
| lib/history.js | Створити | showHistoryMenu, showSubfilterMenu, showGroupFilter, showExerciseFilter, askHistoryCount, showHistoryList, showHistoryDetail, validateHistCount, groupRowsByExercise, formatDetailText, formatWorkoutListItem, getEmojiNumber, formatDateShort, formatDateWithTime |
| lib/supabase.js | Змінити | +getWorkoutDates, getWorkoutByDate, getWorkoutDatesByMuscleGroup, getWorkoutDatesByExercise, getExercisesTrainedByStudent |
| lib/router.js | Змінити | +всі HIST_* callbacks; +loadDatesForCurrentFilter; +HIST_COUNT_INPUT у handleMessage |
| lib/menu.js | Змінити | Заглушка «Історія» → HIST_OPEN (учень і тренер) |
| lib/user.js або картка учня | Змінити | Кнопка «Історія» → viewingStudentId + HIST_OPEN |
| CALLBACK_FSM_MODULE_MATRIX.md | Змінити | +HIST_* callbacks |
| Бізнес-логіка_Gym_3_0_v1.1.md | Змінити | Рядок №9: Заглушка → Реалізовано |

---

## 13. Порядок реалізації (для Cursor)

```
Крок 1: lib/supabase.js — 5 нових функцій (розділ 4)
Крок 2: lib/history.js — створити файл з усіма функціями (розділи 7, 9)
Крок 3: lib/router.js — loadDatesForCurrentFilter + всі HIST_* handlers (розділ 8)
Крок 4: lib/menu.js — підключити HIST_OPEN замість заглушки
Крок 5: картка учня — viewingStudentId + HIST_OPEN
Крок 6: тест — учень, всі тренування, останні N (flow 10.1)
Крок 7: тест — учень, попереднє по групі (flow 10.2)
Крок 8: тест — учень, за вправою (flow 10.3)
Крок 9: тест — тренер, історія учня (flow 10.4)
Крок 10: оновити CALLBACK_FSM_MODULE_MATRIX.md та Бізнес-логіку
```

---

## 14. Що НЕ змінюється

- Таблиця bot_training_data — без ALTER TABLE
- lib/training.js — логіка запису тренувань без змін
- Автопрогресія та деавтоматизація — без змін
- Медичний фільтр, плани тренувань — без змін
- Всі існуючі callback handlers — без змін

---

Документ готовий до передачі в Cursor для реалізації.
