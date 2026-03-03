# ТЗ: Акцент-зони, уникнення та пресети сетів — FIT 3.0

**Версія:** 1.0  
**Дата:** березень 2026  
**Проєкт:** FIT 3.0 (Node.js, Supabase, Telegram Bot API, Railway)  
**Для:** Cursor AI (розробка та впровадження)  
**Статус:** Готово до реалізації

---

## 1. Контекст і мета

### 1.1 Поточний стан

У FIT 3.0 тренер створює план тренувань двома способами:
- **Вручну** (`lib/trainingPlan.js`): назва → ціль → ревізія → кількість днів → додавання вправ по днях
- **Авто-підбір** (`lib/planGenerator.js`): читає профіль учня → генерує план через `generateTrainingPlan()`

Обидва способи НЕ враховують:
- Акцент учня на конкретні зони тіла (попа, спина, руки тощо)
- Зони, які учень НЕ хоче розвивати (наприклад, широкі плечі — не чіпати)
- Частоту появи пріоритетних груп м'язів у тижневому розкладі
- Зручний вибір схеми сетів при ручному додаванні вправ

### 1.2 Що потрібно реалізувати

1. **Акцент-зони** — новий крок у FSM перед генерацією/підтвердженням плану (для авто і ручного)
2. **Уникнення зон** — другий новий крок після акценту
3. **Preview розподілу** — тренер бачить і підтверджує розподіл по днях перед генерацією
4. **Пресети сетів** — при ручному додаванні вправи пропонуються варіанти схем залежно від goal/level
5. **Міграція БД** — нові поля в `training_plans`

---

## 2. База даних

### 2.1 Міграція (новий файл: `supabase_migration_accent_zones.sql`)

```sql
-- Додаємо поля до таблиці training_plans
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS accent_zones TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_zones  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS split_config JSONB   DEFAULT '[]';

COMMENT ON COLUMN training_plans.accent_zones IS 'Зони акценту: glutes, legs, thighs, abs, arms, back, shoulders, full';
COMMENT ON COLUMN training_plans.avoid_zones  IS 'Зони уникнення: ті самі ключі';
COMMENT ON COLUMN training_plans.split_config IS 'Розподіл груп м''язів по днях, підтверджений тренером';
```

### 2.2 Структура split_config (JSONB)

```json
[
  {
    "day_number": 1,
    "day_label": "День 1",
    "muscle_groups": ["Сідниці", "Задня поверхня стегна", "Квадрицепс"],
    "is_accent_day": true
  },
  {
    "day_number": 2,
    "day_label": "День 2",
    "muscle_groups": ["Сідниці", "Спина", "Трапеція"],
    "is_accent_day": true
  },
  {
    "day_number": 3,
    "day_label": "День 3",
    "muscle_groups": ["Прес", "Біцепс", "Трицепс"],
    "is_accent_day": false
  }
]
```

---

## 3. Нові константи (`lib/constants.js`)

Додати в кінець файлу:

```js
// ─── Акцент-зони ────────────────────────────────────────────────────────────

// Ключі акценту → групи м'язів (group_level2 з exercise_library)
const ACCENT_MAP = {
  glutes:    ['Сідниці', 'Задня поверхня стегна'],
  legs:      ['Квадрицепс', 'Литки'],
  thighs:    ['Приводящі', 'Відводящі'],
  abs:       ['Прес'],
  arms:      ['Біцепс', 'Трицепс', 'Передпліччя'],
  back:      ['Широчайший', 'Трапеція', 'Ромбоподібний'],
  shoulders: ['Дельтоподібний'],
  full:      []  // рівномірно, без акценту
};

// Підписи для UI (Telegram-кнопки)
const ACCENT_LABELS = {
  glutes:    'Попа',
  legs:      'Ноги',
  thighs:    'Стегна',
  abs:       'Прес',
  arms:      'Руки',
  back:      'Спина',
  shoulders: 'Плечі',
  full:      'Все рівномірно'
};

// Порядок показу кнопок
const ACCENT_ZONES_ORDER = ['glutes', 'legs', 'thighs', 'abs', 'arms', 'back', 'shoulders', 'full'];

// Зони, доступні для уникнення (без 'full')
const AVOID_ZONES_ORDER = ['glutes', 'legs', 'thighs', 'abs', 'arms', 'back', 'shoulders'];

// ─── Частота акценту по тижню ────────────────────────────────────────────────

// Скільки днів на тиждень отримують акцентні групи
// Ключ = daysPerWeek, значення = кількість акцентних днів
const ACCENT_DAYS_COUNT = {
  2: 1,
  3: 2,
  4: 3,
  5: 3
};

// ─── Пресети сетів ───────────────────────────────────────────────────────────

// goal → level → масив пресетів [label, sets, reps, rest_sec]
const SET_PRESETS = {
  lose: {
    beginner:     [
      { label: '3 × 15',  sets: 3, reps: 15, rest_sec: 60  },
      { label: '4 × 12',  sets: 4, reps: 12, rest_sec: 60  },
      { label: '2 × 20',  sets: 2, reps: 20, rest_sec: 45  }
    ],
    intermediate: [
      { label: '4 × 15',  sets: 4, reps: 15, rest_sec: 60  },
      { label: '3 × 20',  sets: 3, reps: 20, rest_sec: 45  },
      { label: '4 × 12',  sets: 4, reps: 12, rest_sec: 60  }
    ],
    advanced:     [
      { label: '4 × 20',  sets: 4, reps: 20, rest_sec: 45  },
      { label: '5 × 15',  sets: 5, reps: 15, rest_sec: 60  },
      { label: '3 × 25',  sets: 3, reps: 25, rest_sec: 30  }
    ]
  },
  gain: {
    beginner:     [
      { label: '3 × 8-10', sets: 3, reps: 9,  rest_sec: 90  },
      { label: '4 × 6-8',  sets: 4, reps: 7,  rest_sec: 120 },
      { label: '3 × 10',   sets: 3, reps: 10, rest_sec: 90  }
    ],
    intermediate: [
      { label: '4 × 6-8',  sets: 4, reps: 7,  rest_sec: 120 },
      { label: '5 × 5',    sets: 5, reps: 5,  rest_sec: 180 },
      { label: '3 × 8',    sets: 3, reps: 8,  rest_sec: 90  }
    ],
    advanced:     [
      { label: '5 × 5',    sets: 5, reps: 5,  rest_sec: 180 },
      { label: '6 × 4-6',  sets: 6, reps: 5,  rest_sec: 180 },
      { label: '4 × 8',    sets: 4, reps: 8,  rest_sec: 120 }
    ]
  },
  keep: {
    beginner:     [
      { label: '3 × 10-12', sets: 3, reps: 11, rest_sec: 75 },
      { label: '3 × 12',    sets: 3, reps: 12, rest_sec: 75 },
      { label: '4 × 10',    sets: 4, reps: 10, rest_sec: 75 }
    ],
    intermediate: [
      { label: '3 × 10-12', sets: 3, reps: 11, rest_sec: 75 },
      { label: '4 × 10',    sets: 4, reps: 10, rest_sec: 75 },
      { label: '4 × 12',    sets: 4, reps: 12, rest_sec: 60 }
    ],
    advanced:     [
      { label: '4 × 10-12', sets: 4, reps: 11, rest_sec: 75 },
      { label: '5 × 8-10',  sets: 5, reps: 9,  rest_sec: 90 },
      { label: '3 × 12',    sets: 3, reps: 12, rest_sec: 60 }
    ]
  }
};

module.exports = {
  // ...existing exports...
  ACCENT_MAP,
  ACCENT_LABELS,
  ACCENT_ZONES_ORDER,
  AVOID_ZONES_ORDER,
  ACCENT_DAYS_COUNT,
  SET_PRESETS
};
```

---

## 4. Нові FSM-стани (`lib/state.js` або константи стану)

Додати нові FSM-стани:

```js
// Акцент і уникнення
const PLAN_ACCENT_SELECT  = 'PLAN_ACCENT_SELECT';   // вибір акцент-зон
const PLAN_AVOID_SELECT   = 'PLAN_AVOID_SELECT';    // вибір зон уникнення
const PLAN_SPLIT_PREVIEW  = 'PLAN_SPLIT_PREVIEW';   // preview розподілу

// Пресети сетів (ручний план)
const PLAN_SETS_PRESET    = 'PLAN_SETS_PRESET';     // вибір пресету або вручну
```

Нові поля в `planState` (об'єкт стану тренера):

```js
// Додати до існуючого planState:
planAccentZones:  [],   // масив обраних ключів, напр. ['glutes']
planAvoidZones:   [],   // масив ключів уникнення, напр. ['shoulders']
planSplitConfig:  [],   // підтверджений split_config
planOrigin:       null  // 'auto' | 'manual' — звідки прийшли до акценту
```

---

## 5. Нові callback_data

Додати в `CALLBACK_FSM_MODULE_MATRIX.md` і обробити в `lib/router.js`:

```
plan_accent_toggle:{zone}    — вмикає/вимикає зону в planAccentZones
plan_accent_next             — перехід до PLAN_AVOID_SELECT
plan_accent_back             — назад (авто: до showAutoSummary; ручний: до PLAN_DAYS)

plan_avoid_toggle:{zone}     — вмикає/вимикає зону в planAvoidZones
plan_avoid_skip              — пропустити (planAvoidZones = [])
plan_avoid_next              — перехід до PLAN_SPLIT_PREVIEW
plan_avoid_back              — назад до PLAN_ACCENT_SELECT

plan_split_confirm           — підтвердити preview → генерація або збереження плану
plan_split_back              — назад до PLAN_AVOID_SELECT

plan_sets_preset:{index}     — обрати пресет (index = 0,1,2 з SET_PRESETS)
plan_sets_custom             — ввести вручну (існуючий флоу sets/reps/rest)
plan_sets_back               — назад до вибору вправи
```

---

## 6. Нові функції — `lib/trainingPlan.js`

### 6.1 `askAccentZones(bot, chatId, planState)`

**Призначення:** показати екран вибору акцент-зон.

**Логіка:**
- Будує клавіатуру з `ACCENT_ZONES_ORDER`
- Кнопка позначена `✓` якщо вже в `planState.planAccentZones`
- «Все рівномірно» — при виборі очищає всі інші зони і блокує вибір (або навпаки — скидає 'full' при виборі іншої зони)
- Максимум 2 зони (крім 'full')
- Кнопки «→ Далі» і «← Назад»

**Текст повідомлення:**
```
На що робимо акцент у плані?
Обери 1-2 зони (або "Все рівномірно")
```

**Приклад клавіатури (3 кнопки в ряд):**
```
[✓ Попа]  [Ноги]    [Стегна]
[Прес]    [Руки]    [Спина]
[Плечі]   [Все рівномірно]
[← Назад]           [→ Далі]
```

**Валідація при «→ Далі»:**
- Якщо нічого не обрано → показати помилку «Обери хоча б одну зону або "Все рівномірно"»

---

### 6.2 `askAvoidZones(bot, chatId, planState)`

**Призначення:** показати екран зон уникнення.

**Логіка:**
- Будує клавіатуру з `AVOID_ZONES_ORDER`
- Зони, що є в `planState.planAccentZones` — показуються сірими або з позначкою `✗` (недоступні для уникнення)
- Реалізація недоступності: кнопка з текстом `— Попа` (тире = недоступна), callback = `plan_avoid_disabled` (нічого не робить)
- Вже обрані зони уникнення — позначені `✓`
- Кнопки «Пропустити», «→ Далі», «← Назад»

**Текст повідомлення:**
```
Є зони, які НЕ розвиваємо? (необов'язково)
Наприклад: плечі і так широкі — не навантажуємо
```

---

### 6.3 `showSplitPreview(bot, chatId, planState, studentProfile)`

**Призначення:** показати тренеру розподіл груп м'язів по днях і отримати підтвердження.

**Логіка:**
1. Викликає `generateSplitWithAccent(daysPerWeek, accentZones, avoidZones, gender, level)` → отримує `splitConfig`
2. Зберігає `splitConfig` в `planState.planSplitConfig`
3. Будує текст з переліком днів та груп
4. Показує кнопки «✓ Підтвердити» і «← Змінити акцент»

**Текст повідомлення (приклад для 3 днів, акцент Попа):**
```
Розподіл тренувань:

День 1 — Попа, Задня поверхня стегна, Квадрицепс  ★
День 2 — Попа, Задня поверхня стегна, Спина  ★
День 3 — Прес, Біцепс, Трицепс

★ — акцентний день
Акцент: Попа (2 з 3 днів)
Уникаємо: Плечі
```

**Кнопки:**
```
[✓ Підтвердити]
[← Змінити акцент]
```

**Після підтвердження:**
- Авто-план: виклик `generateTrainingPlan()` з `options.splitConfig`, `options.accentZones`, `options.avoidZones`
- Ручний план: перехід до `showPlanEditDaySelect()`, де тепер дні вже мають назви груп з `splitConfig`

---

### 6.4 `showSetsPreset(bot, chatId, exerciseId, exerciseName, planState)`

**Призначення:** показати пресети сетів при додаванні вправи в ручний план.

**Логіка:**
1. Визначає `goal` і `level` з `planState` (goal зберігається при створенні плану, level — з профілю учня)
2. Бере масив пресетів з `SET_PRESETS[goal][level]`
3. Показує 3 варіанти + «Ввести вручну»

**Текст повідомлення:**
```
Вправа: {exerciseName}

Оберіть схему підходів:
(ціль: {goalLabel}, рівень: {levelLabel})
```

**Кнопки:**
```
[4 × 6-8]   ← перший пресет (рекомендовано)
[5 × 5]
[3 × 8]
[Ввести вручну]
[← Назад]
```

**При виборі пресету:**
- Одразу зберігати `sets`, `reps`, `rest_sec` в `training_plan_exercises` без додаткових запитів
- Показати підтвердження: «Вправа додана: {назва}, {label}»

**При «Ввести вручну»:**
- Перехід до існуючого флоу ручного вводу (поточна реалізація `PLAN_EXERCISE_ADD`)

---

## 7. Нова функція — `lib/planGenerator.js`

### 7.1 `generateSplitWithAccent(daysPerWeek, accentZones, avoidZones, gender, level)`

**Призначення:** побудувати `splitConfig` з урахуванням акценту та уникнення.

**Алгоритм:**

```js
function generateSplitWithAccent(daysPerWeek, accentZones, avoidZones, gender, level) {
  const { ACCENT_MAP, ACCENT_DAYS_COUNT } = require('./constants');

  // 1. Визначаємо базовий split (існуюча функція)
  const base = getSplitSchemeAndDays(level, daysPerWeek, gender);
  // base.dayConfigs = [{ day_number, day_label, muscleGroups: [...] }, ...]

  // 2. Скільки днів отримають акцент
  const accentDays = ACCENT_MAP.full in accentZones ? 0 : (ACCENT_DAYS_COUNT[daysPerWeek] || 1);

  // 3. Збираємо акцентні групи м'язів (union усіх обраних зон)
  const accentGroups = accentZones
    .filter(z => z !== 'full')
    .flatMap(z => ACCENT_MAP[z] || []);

  // 4. Збираємо уникнуті групи
  const avoidGroups = avoidZones.flatMap(z => ACCENT_MAP[z] || []);

  // 5. Для перших N днів — додаємо/замінюємо на акцентні групи
  const splitConfig = base.dayConfigs.map((day, index) => {
    const isAccentDay = index < accentDays;
    let groups = [...day.muscleGroups];

    if (isAccentDay) {
      // Додаємо акцентні групи на початок, якщо їх ще немає
      accentGroups.forEach(g => {
        if (!groups.includes(g)) groups.unshift(g);
      });
      // Обрізаємо до розумної кількості (max 4 групи на день)
      groups = groups.slice(0, 4);
    }

    // Видаляємо уникнуті групи з усіх днів
    groups = groups.filter(g => !avoidGroups.includes(g));

    // Якщо день залишився порожній після видалення — додати нейтральну групу
    if (groups.length === 0) {
      groups = ['Прес'];  // нейтральний фолбек
    }

    return {
      day_number: day.day_number,
      day_label: day.day_label,
      muscle_groups: groups,
      is_accent_day: isAccentDay
    };
  });

  return splitConfig;
}
```

### 7.2 Модифікація `generateTrainingPlan(studentChatId, options)`

Додати в `options`:
```js
options = {
  // ...існуючі поля...
  accentZones:  [],   // з planState.planAccentZones
  avoidZones:   [],   // з planState.planAvoidZones
  splitConfig:  []    // підтверджений тренером (з planState.planSplitConfig)
}
```

Якщо `options.splitConfig` не порожній — використовувати його замість `getSplitSchemeAndDays`.

При збереженні плану (`insertTrainingPlan`) — передавати `accent_zones`, `avoid_zones`, `split_config`.

### 7.3 Модифікація `insertTrainingPlan` (`lib/supabase.js`)

```js
// Додати поля до INSERT:
async function insertTrainingPlan(data) {
  return supabase.from('training_plans').insert({
    // ...існуючі поля...
    accent_zones: data.accentZones || [],
    avoid_zones:  data.avoidZones  || [],
    split_config: data.splitConfig || []
  });
}
```

---

## 8. Маршрутизація (`lib/router.js`)

### 8.1 Нові callback handlers

Додати блок обробки нових callbacks (після існуючих `PLAN_*` обробників):

```js
// ─── АКЦЕНТ-ЗОНИ ────────────────────────────────────────────────────────────

if (data.startsWith('plan_accent_toggle:')) {
  const zone = data.split(':')[1];
  await handleAccentToggle(bot, chatId, zone, planState);
  return;
}

if (data === 'plan_accent_next') {
  await askAvoidZones(bot, chatId, planState);
  return;
}

if (data === 'plan_accent_back') {
  // Авто: повернення до showAutoSummary
  // Ручний: повернення до askPlanDays
  if (planState.planOrigin === 'auto') {
    await showAutoSummary(bot, chatId, planState);
  } else {
    await askPlanDays(bot, chatId, planState);
  }
  return;
}

// ─── УНИКНЕННЯ ──────────────────────────────────────────────────────────────

if (data.startsWith('plan_avoid_toggle:')) {
  const zone = data.split(':')[1];
  await handleAvoidToggle(bot, chatId, zone, planState);
  return;
}

if (data === 'plan_avoid_skip' || data === 'plan_avoid_next') {
  await showSplitPreview(bot, chatId, planState, studentProfile);
  return;
}

if (data === 'plan_avoid_back') {
  await askAccentZones(bot, chatId, planState);
  return;
}

if (data === 'plan_avoid_disabled') {
  // нічого не робити (зона в акценті)
  return;
}

// ─── PREVIEW ────────────────────────────────────────────────────────────────

if (data === 'plan_split_confirm') {
  if (planState.planOrigin === 'auto') {
    await handlePlanGenerate(bot, chatId, planState);
  } else {
    await showPlanEditDaySelect(bot, chatId, planState);
  }
  return;
}

if (data === 'plan_split_back') {
  await askAvoidZones(bot, chatId, planState);
  return;
}

// ─── ПРЕСЕТИ СЕТІВ ──────────────────────────────────────────────────────────

if (data.startsWith('plan_sets_preset:')) {
  const index = parseInt(data.split(':')[1]);
  await handleSetsPreset(bot, chatId, index, planState);
  return;
}

if (data === 'plan_sets_custom') {
  // Перехід до існуючого ручного вводу
  await askPlanExerciseSets(bot, chatId, planState);
  return;
}

if (data === 'plan_sets_back') {
  await showPlanEditExercises(bot, chatId, planState);
  return;
}
```

### 8.2 Вбудовування в існуючі потоки

**Авто-план** — в `lib/trainingPlan.js`, функція `showAutoSummary`:
- Після відображення підсумку профілю кнопка «Генерувати» → замінити на «→ Далі» з callback `plan_accent_start`
- При `plan_accent_start`: встановити `planState.planOrigin = 'auto'`, викликати `askAccentZones()`

**Ручний план** — в `lib/trainingPlan.js`, функція `askPlanDays`:
- Після вибору кількості днів (callback `PLAN_DAYS`) → замість переходу до збереження плану викликати `askAccentZones()`
- Встановити `planState.planOrigin = 'manual'`

**Ручне додавання вправи** — в `lib/trainingPlan.js`, обробник вибору вправи:
- Після вибору вправи (існуючий callback `PLAN_EXERCISE_ADD` або аналог) → замість прямого запиту sets/reps викликати `showSetsPreset()`

---

## 9. Допоміжні функції — `lib/trainingPlan.js`

```js
// Перемикач акценту (toggle)
async function handleAccentToggle(bot, chatId, zone, planState) {
  if (zone === 'full') {
    planState.planAccentZones = ['full'];
  } else {
    // Прибрати 'full' якщо є
    planState.planAccentZones = planState.planAccentZones.filter(z => z !== 'full');
    // Toggle
    if (planState.planAccentZones.includes(zone)) {
      planState.planAccentZones = planState.planAccentZones.filter(z => z !== zone);
    } else if (planState.planAccentZones.length < 2) {
      planState.planAccentZones.push(zone);
    }
    // Якщо стало 0 — нічого не знімати (залишити порожнє)
  }
  // Оновити повідомлення (editMessageReplyMarkup або editMessageText)
  await askAccentZones(bot, chatId, planState);
}

// Перемикач уникнення (toggle)
async function handleAvoidToggle(bot, chatId, zone, planState) {
  if (planState.planAccentZones.includes(zone)) return; // захист
  if (planState.planAvoidZones.includes(zone)) {
    planState.planAvoidZones = planState.planAvoidZones.filter(z => z !== zone);
  } else {
    planState.planAvoidZones.push(zone);
  }
  await askAvoidZones(bot, chatId, planState);
}

// Збереження пресету сетів
async function handleSetsPreset(bot, chatId, index, planState) {
  const { SET_PRESETS } = require('./constants');
  const goal  = planState.planGoal  || 'keep';
  const level = planState.planLevel || 'beginner';
  const preset = SET_PRESETS[goal]?.[level]?.[index];
  if (!preset) return;

  // Зберігаємо в training_plan_exercises
  const exerciseId = planState.currentExerciseId;
  const dayNumber  = planState.currentDayNumber;

  await supabase.from('training_plan_exercises').insert({
    plan_id:     planState.planId,
    exercise_id: exerciseId,
    day_number:  dayNumber,
    sets:        preset.sets,
    reps:        preset.reps,
    rest_sec:    preset.rest_sec,
    order_in_day: planState.currentOrderInDay || 1
  });

  await bot.sendMessage(chatId,
    `Вправу додано: ${planState.currentExerciseName}, ${preset.label}`
  );
  // Повернення до вибору наступної вправи
  await showPlanEditDaySelect(bot, chatId, planState);
}
```

---

## 10. Повні сценарії (user flow)

### 10.1 Авто-план з акцентом

```
1. Тренер: Мої учні → [Учень] → Програма → Новий план → Авто-підбір
2. showAutoSummary — показує профіль учня
   Кнопка: [→ Далі до налаштування акценту]
3. askAccentZones — тренер обирає "Попа" (toggle), натискає [→ Далі]
4. askAvoidZones — тренер обирає "Плечі", натискає [→ Далі]
5. showSplitPreview — показує:
     День 1 — Сідниці, Задня поверхня стегна, Квадрицепс  ★
     День 2 — Сідниці, Задня поверхня стегна, Спина  ★
     День 3 — Прес, Біцепс, Трицепс
   Кнопки: [✓ Підтвердити] [← Змінити акцент]
6. Тренер: [✓ Підтвердити]
7. generateTrainingPlan() — з options.splitConfig, accentZones, avoidZones
8. Показ згенерованого плану (існуючий флоу)
```

### 10.2 Ручний план з акцентом

```
1. Тренер: Мої учні → [Учень] → Програма → Новий план → Вручну
2. askPlanName → askPlanGoal → askPlanRevisionWeeks → askPlanDays
3. Після вибору днів → askAccentZones
4. askAvoidZones
5. showSplitPreview — показує розподіл
   Кнопки: [✓ Підтвердити] [← Змінити акцент]
6. Підтвердити → showPlanEditDaySelect
   (Дні вже мають підписи з muscle_groups з splitConfig)
7. Тренер додає вправи по днях (існуючий флоу) + нові пресети сетів
```

### 10.3 Додавання вправи з пресетом

```
1. Тренер у ручному плані: День 1 → Сідниці → [вправа "Присідання з гантелями"]
2. showSetsPreset — показує:
     Вправа: Присідання з гантелями
     (ціль: Набір маси, рівень: Середній)
     [4 × 6-8]  ← рекомендовано
     [5 × 5]
     [3 × 8]
     [Ввести вручну]
3. Тренер: [4 × 6-8]
4. Вправа збережена: "Присідання з гантелями, 4 × 6-8"
5. Повернення до вибору наступної вправи
```

---

## 11. Правила та обмеження

1. **Не більше 2 акцент-зон** — якщо тренер намагається обрати 3-тю, кнопка не спрацьовує (вже 2 обрано — решта неактивна, але без повідомлення про помилку)
2. **Акцент і уникнення не перетинаються** — зони з акценту заблоковані для уникнення
3. **'full' скидає все** — вибір «Все рівномірно» знімає решту вибраних акцентів
4. **Уникнення необов'язкове** — «Пропустити» = `avoidZones = []`, поведінка як раніше
5. **Якщо всі зони уникнуті** — система ігнорує уникнення (не може бути порожнього плану)
6. **Без Markdown у повідомленнях** — дотримання VETO 6 проєкту (простий текст)
7. **Back завжди доступний** — на кожному кроці є кнопка назад
8. **Пресети тільки в ручному плані** — у авто-плані сети визначаються `getSetsRepsRest()` (без змін)

---

## 12. Файли для створення/зміни

| Файл | Дія | Що змінюється |
|------|-----|---------------|
| `supabase_migration_accent_zones.sql` | **Створити** | ALTER TABLE training_plans |
| `lib/constants.js` | **Змінити** | +ACCENT_MAP, ACCENT_LABELS, ACCENT_ZONES_ORDER, AVOID_ZONES_ORDER, ACCENT_DAYS_COUNT, SET_PRESETS |
| `lib/state.js` | **Змінити** | +нові FSM-стани і поля planState |
| `lib/trainingPlan.js` | **Змінити** | +askAccentZones, askAvoidZones, showSplitPreview, showSetsPreset, handleAccentToggle, handleAvoidToggle, handleSetsPreset; модифікація showAutoSummary і askPlanDays |
| `lib/planGenerator.js` | **Змінити** | +generateSplitWithAccent; модифікація generateTrainingPlan |
| `lib/supabase.js` | **Змінити** | модифікація insertTrainingPlan |
| `lib/router.js` | **Змінити** | +обробники plan_accent_*, plan_avoid_*, plan_split_*, plan_sets_* |
| `CALLBACK_FSM_MODULE_MATRIX.md` | **Змінити** | +нові callbacks |

---

## 13. Порядок реалізації (для Cursor)

Рекомендований порядок, щоб не ламати існуючий функціонал:

```
Крок 1: supabase_migration_accent_zones.sql — виконати міграцію
Крок 2: lib/constants.js — додати всі нові константи
Крок 3: lib/state.js — додати FSM-стани і поля planState
Крок 4: lib/planGenerator.js — функція generateSplitWithAccent
Крок 5: lib/supabase.js — модифікація insertTrainingPlan
Крок 6: lib/trainingPlan.js — всі нові функції UI
Крок 7: lib/router.js — нові callback-обробники
Крок 8: Тест авто-плану з акцентом (end-to-end)
Крок 9: Тест ручного плану з пресетами сетів
Крок 10: Оновити CALLBACK_FSM_MODULE_MATRIX.md
```

---

## 14. Що НЕ змінюється

- Логіка `getSplitSchemeAndDays` — не переписувати, тільки використовувати як базу
- `getSetsRepsRest` для авто-плану — без змін
- Флоу тренування учня — без змін
- Medical filter — без змін
- Anti-Repeat логіка — без змін
- Автопрогресія — без змін
- Нагадування (cron) — без змін

---

*Документ готовий до передачі в Cursor для реалізації.*
