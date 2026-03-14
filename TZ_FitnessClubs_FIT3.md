# ТЗ: БД фітнес-клубів + фільтрація вправ за обладнанням — FIT 3.0

**Версія:** 1.0
**Дата:** березень 2026
**Для:** Cursor AI

---

## 1. Контекст і мета

Користувач прив'язується до одного або кількох фітнес-клубів / студій.
При складанні нового плану тренувань система знає, в якому клубі буде тренуватись учень,
і показує лише вправи з обладнанням, яке є в цьому клубі.

Варіант «Вдома» — окремий тип місця тренування зі своїм незалежним списком обладнання,
яке адмін налаштовує в Supabase.

---

## 2. Нові таблиці Supabase

### 2.1 fitness_clubs

```sql
CREATE TABLE fitness_clubs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  city         text NOT NULL,
  instagram_url text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON fitness_clubs(city);
```

Наповнення: тільки адміністратор вручну через Supabase.

### 2.2 club_category_tags — довідник тегів

```sql
CREATE TABLE club_category_tags (
  tag_code     text PRIMARY KEY,
  tag_name_ua  text NOT NULL,
  tag_group    text NOT NULL  -- 'type' | 'group_class' | 'age'
);
```

Початкові дані (INSERT вручну адміном):

| tag_code | tag_name_ua | tag_group |
|---|---|---|
| `gym` | Тренажерний зал | type |
| `group_fitness` | Групові заняття | type |
| `swimming` | Басейн | type |
| `rehabilitation` | Реабілітація | type |
| `yoga` | Йога | group_class |
| `pilates` | Пілатес | group_class |
| `dance` | Танці | group_class |
| `boxing` | Бокс / єдиноборства | group_class |
| `crossfit` | Кросфіт | group_class |
| `stretching` | Стретчинг | group_class |
| `kids` | Дитячі секції (до 16) | age |
| `seniors` | 40+ / Senior fitness | age |

### 2.3 club_tags — теги клубу

```sql
CREATE TABLE club_tags (
  club_id   uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  tag_code  text REFERENCES club_category_tags(tag_code),
  PRIMARY KEY (club_id, tag_code)
);
```

### 2.4 club_equipment — обладнання клубу

```sql
CREATE TABLE club_equipment (
  club_id       uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  equipment_id  text NOT NULL,  -- FK до EquipmentDirectory (text PK)
  PRIMARY KEY (club_id, equipment_id)
);

CREATE INDEX ON club_equipment(club_id);
```

Наповнення: адміністратор вручну через Supabase.
`equipment_id` — значення з таблиці `EquipmentDirectory` (EQ_BARBELL, EQ_CABLE тощо).

**Спеціальний запис для варіанту «Вдома»:**
Варіант «Вдома» не є записом у `fitness_clubs`.
Це окремий псевдо-клуб з фіксованим `id = '00000000-0000-0000-0000-000000000001'`
та назвою «Вдома». Його обладнання також зберігається в `club_equipment`.
Адмін наповнює його вручну (гантелі, килимок, еспандер, турнік тощо).

```sql
-- Вставити один раз вручну:
INSERT INTO fitness_clubs (id, name, city, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Вдома', '', true);
```

### 2.5 user_clubs — клуби користувача

```sql
CREATE TABLE user_clubs (
  chat_id     text NOT NULL,
  club_id     uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, club_id)
);

CREATE INDEX ON user_clubs(chat_id);
```

`is_primary = true` — перший вибраний клуб. При виборі нового плану тренувань
обладнання береться з клубу, обраного для цього плану (поле `club_id` в `training_plans`).

### 2.6 Зміна таблиці training_plans — додати club_id

```sql
ALTER TABLE training_plans
ADD COLUMN club_id uuid REFERENCES fitness_clubs(id);
```

При складанні нового плану — зберігається клуб, для якого план створено.
Саме за `training_plans.club_id` фільтруються вправи при виконанні плану.

---

## 3. Логіка фільтрації вправ

### 3.1 Загальне правило

При будь-якому виборі вправ (бібліотека, план, вільне тренування) — фільтр залежить від контексту:

| Ситуація | Фільтрація |
|---|---|
| Є активний план з `club_id` | Тільки вправи з обладнанням цього клубу |
| Вільне тренування, один клуб | Тільки вправи з обладнанням цього клубу |
| Вільне тренування, кілька клубів | Запитати клуб перед початком (якщо > 1) |
| Без клубу | Всі вправи + попередження |
| Вдома | Вправи з обладнанням псевдо-клубу «Вдома» |

### 3.2 Формат equipment_id в exercise_library

Поле `equipment_id` в `exercise_library` — текстовий рядок. Може містити:
- Один код: `EQ_BARBELL`
- Кілька через кому: `EQ_BENCH,EQ_BARBELL`
- Власна вага: `BW`
- NULL — якщо вправа не потребує нічого

**Правила доступності вправи:**
- `equipment_id = NULL` або `equipment_id = 'BW'` — **завжди доступна**
- Один тренажер (`EQ_CABLE`) — доступна якщо він є в клубі
- Кілька через кому (`EQ_BENCH,EQ_BARBELL`) — доступна якщо **хоча б один** є в клубі

### 3.3 Алгоритм фільтрації — Node.js (не SQL)

Оскільки `equipment_id` зберігається рядком через кому, фільтрація виконується
в Node.js після отримання вправ з БД:

```js
// Псевдокод логіки:
const clubEqSet = new Set(clubEquipmentIds); // обладнання клубу

exercises.filter(ex => {
  if (!ex.equipment_id || ex.equipment_id === 'BW') return true; // завжди
  const ids = ex.equipment_id.split(',').map(s => s.trim());
  return ids.some(id => clubEqSet.has(id)); // хоча б один збігається
});
```

### 3.4 Аксесуари (ACC_*)

`ACC_MAT`, `ACC_BAND`, `ACC_FITBALL`, `ACC_STEP`, `ACC_KETTLEBELL` —
додаються в `club_equipment` вручну адміном як і решта обладнання.

Для псевдо-клубу **«Вдома»** адмін додає в `club_equipment`:
`BW`, `ACC_MAT`, `ACC_BAND`, `EQ_PULLUP_BAR`, `EQ_DUMBBELL` — все що реально є вдома.
Список гнучкий — адмін налаштовує під реальність.

### 3.5 Попередження при відсутності клубу

При старті тренування без прив'язки до клубу — одноразове повідомлення:

```
Увага: ви не прив'язані до жодного клубу або залу.
Показуємо всі вправи — деякі тренажери можуть бути недоступні у вашому місці тренування.

Щоб прив'язати клуб: Профіль → Мої клуби.

[Продовжити]
```

---

## 4. Реєстрація — вибір клубу

### 4.1 Місце в потоці реєстрації

Крок після вибору міста (для обох ролей — тренер і учень):

```
REGISTRATION_CITY → REGISTRATION_CLUB_SELECT → REGISTRATION_CLUB_MORE → далі
```

### 4.2 Сценарій вибору

**Є клуби в місті:**
```
Оберіть ваш фітнес-клуб або студію у місті Одеса:

[🏋️ FitLife Gym]
[💃 Studio Dance Art]
[🥊 Boxing Club Одеса]
[🏠 Вдома]
[⏭️ Пропустити]
```

**Після вибору першого клубу:**
```
FitLife Gym додано.
Бажаєте додати ще один клуб?

[➕ Додати ще]
[✅ Готово]
```

**Вибрав «Додати ще» — список без вже обраних:**
```
Оберіть ще один клуб:

[💃 Studio Dance Art]
[🏠 Вдома]
[✅ Готово]
```

**Немає клубів у місті:**
```
У місті [місто] поки немає доданих клубів.
Ви можете додати клуб пізніше: Профіль → Мої клуби.

[Продовжити]
```

**«Пропустити»** — переходить далі, клуби не вибрані.

Перший вибраний клуб: `is_primary = true`. Решта: `is_primary = false`.

### 4.3 FSM-стани

| Стан | Опис |
|---|---|
| `REGISTRATION_CLUB_SELECT` | Показ списку клубів міста |
| `REGISTRATION_CLUB_MORE` | Питання «Додати ще?» після кожного вибору |

Callback-data:
```
REG_CLUB_SELECT:{clubId}   — вибір клубу
REG_CLUB_MORE              — додати ще один
REG_CLUB_DONE              — завершити вибір клубів
REG_CLUB_SKIP              — пропустити
```

---

## 5. Профіль — управління клубами

### 5.1 Новий пункт у меню профілю

```
Профіль → [🏋️ Мої клуби]
```

### 5.2 Екран «Мої клуби»

**Є клуби:**
```
Ваші клуби:

🏋️ FitLife Gym (основний)
💃 Studio Dance Art

[➕ Додати клуб]
[🗑️ Видалити клуб]
[🔙 Назад]
```

**Немає клубів:**
```
Ви ще не прив'язані до жодного клубу.

[➕ Додати клуб]
[🔙 Назад]
```

### 5.3 Додавання клубу з профілю

Той самий сценарій, що при реєстрації: вибір міста (або поточне місто) → список клубів → вибір.

### 5.4 Видалення клубу

```
Який клуб видалити?

[🏋️ FitLife Gym]
[💃 Studio Dance Art]
[🔙 Назад]
```

Після вибору — підтвердження:
```
Видалити FitLife Gym з ваших клубів?

[✅ Так, видалити]
[🔙 Скасувати]
```

Якщо видаляється `is_primary` — `is_primary = true` автоматично переходить
до наступного клубу в списку (якщо є).

### 5.5 FSM-стани

| Стан | Опис |
|---|---|
| `PROFILE_CLUBS_MENU` | Список клубів користувача |
| `PROFILE_CLUBS_ADD` | Вибір клубу для додавання |
| `PROFILE_CLUBS_DELETE` | Вибір клубу для видалення |
| `PROFILE_CLUBS_DELETE_CONFIRM` | Підтвердження видалення |

---

## 6. Складання плану — вибір клубу

### 6.1 Коли запитувати

Тільки при створенні **нового плану** (авто або вручну), якщо у учня більше одного клубу.
Якщо один клуб — вибір автоматичний, питання не задається.
Якщо клубів немає — план складається без фільтрації + попередження.

### 6.2 Екран вибору клубу при новому плані

Вставляється між «Термін ревізії» і «Дні тренувань»:

```
В якому клубі тренуємось?

[🏋️ FitLife Gym]
[💃 Studio Dance Art]
[🏠 Вдома]
```

Callback: `PLAN_CLUB:{clubId}`

Обраний `club_id` зберігається в `training_plans.club_id`.

### 6.3 Якщо клубів немає

```
Клуб не вказано — план буде складено з усіх доступних вправ.
Деякі тренажери можуть бути недоступні у вашому місці тренування.

[Продовжити]
```

### 6.4 Відображення клубу в плані

У заголовку плану при перегляді:
```
План: Силовий на масу
Клуб: FitLife Gym
Активний до: 15 травня 2026
```

---

## 7. Нові функції lib/supabase.js

```js
// Клуби за містом (для вибору при реєстрації / профілі)
async function getClubsByCity(city) {
  const { data } = await supabase
    .from('fitness_clubs')
    .select('id, name, city')
    .eq('city', city)
    .eq('is_active', true)
    .order('name');
  return data || [];
}

// Клуб «Вдома» (фіксований id)
const HOME_CLUB_ID = '00000000-0000-0000-0000-000000000001';

// Клуби користувача
async function getUserClubs(chatId) {
  const { data } = await supabase
    .from('user_clubs')
    .select('club_id, is_primary, fitness_clubs(id, name, city)')
    .eq('chat_id', String(chatId))
    .order('is_primary', { ascending: false });
  return data || [];
}

// Додати клуб користувачу
async function addUserClub(chatId, clubId) {
  // Перевірити чи є вже клуби (для is_primary)
  const existing = await getUserClubs(chatId);
  const isPrimary = existing.length === 0;

  await supabase.from('user_clubs').insert({
    chat_id: String(chatId),
    club_id: clubId,
    is_primary: isPrimary,
    created_at: new Date().toISOString()
  });
}

// Видалити клуб користувача
async function removeUserClub(chatId, clubId) {
  const clubs = await getUserClubs(chatId);
  const wasPrimary = clubs.find(c => c.club_id === clubId)?.is_primary;

  await supabase
    .from('user_clubs')
    .delete()
    .eq('chat_id', String(chatId))
    .eq('club_id', clubId);

  // Якщо видалили primary — призначити наступний
  if (wasPrimary) {
    const remaining = clubs.filter(c => c.club_id !== clubId);
    if (remaining.length > 0) {
      await supabase
        .from('user_clubs')
        .update({ is_primary: true })
        .eq('chat_id', String(chatId))
        .eq('club_id', remaining[0].club_id);
    }
  }
}

// Обладнання клубу
async function getClubEquipmentIds(clubId) {
  const { data } = await supabase
    .from('club_equipment')
    .select('equipment_id')
    .eq('club_id', clubId);
  return (data || []).map(r => r.equipment_id);
}

// Вправи за клубом — фільтрація в Node.js
// equipment_id в exercise_library зберігається рядком через кому: "EQ_BENCH,EQ_BARBELL"
// Логіка: BW і NULL — завжди; кілька тренажерів — достатньо хоча б одного в клубі
async function getExercisesByClub(clubId, filters = {}) {
  // Крок 1: всі вправи з БД (з фільтрами групи якщо є)
  let query = supabase.from('exercise_library').select('*');
  if (filters.group_level1) query = query.eq('group_level1', filters.group_level1);
  if (filters.group_level2) query = query.eq('group_level2', filters.group_level2);
  if (filters.group_level3) query = query.eq('group_level3', filters.group_level3);

  const { data: allExercises } = await query.order('name_ua');
  if (!allExercises) return [];

  // Крок 2: якщо немає клубу — повернути всі без фільтрації
  if (!clubId) return allExercises;

  // Крок 3: обладнання клубу
  const clubEqIds = await getClubEquipmentIds(clubId);
  const clubEqSet = new Set(clubEqIds);

  // Крок 4: фільтрація в Node.js
  return allExercises.filter(ex => {
    // BW і NULL — завжди доступні
    if (!ex.equipment_id || ex.equipment_id === 'BW') return true;
    // Кілька тренажерів через кому — достатньо хоча б одного в клубі
    const ids = ex.equipment_id.split(',').map(s => s.trim());
    return ids.some(id => clubEqSet.has(id));
  });
}

// Визначити club_id для поточного тренування (вільне тренування)
// Якщо один клуб — повернути його. Якщо кілька — null (треба запитати).
// Якщо немає — null (показати всі + попередження).
async function resolveTrainingClub(chatId) {
  const clubs = await getUserClubs(chatId);
  if (clubs.length === 0) return { clubId: null, needsChoice: false, noClub: true };
  if (clubs.length === 1) return { clubId: clubs[0].club_id, needsChoice: false, noClub: false };
  return { clubId: null, needsChoice: true, noClub: false, clubs };
}
```

Додати до `module.exports`: всі перелічені функції + `HOME_CLUB_ID`.

---

## 8. Зміни в потоках тренування

### 8.1 Вільне тренування — старт

У `askExecutionTypeThenMuscleGroup` перед вибором груп м'язів:

```js
const { clubId, needsChoice, noClub, clubs } = await supabase.resolveTrainingClub(chatId);

if (needsChoice) {
  // Показати вибір клубу → зберегти в userState.trainingClubId → продовжити
  userState.state = 'TRAINING_CHOOSE_CLUB';
  userState.pendingTrainingStart = true;
  // Показати кнопки клубів
  return;
}

if (noClub) {
  // Показати попередження → продовжити з усіма вправами
  userState.trainingClubId = null;
  userState.trainingNoClubWarningShown = true;
}

if (clubId) {
  userState.trainingClubId = clubId;
}
```

**Новий FSM-стан:** `TRAINING_CHOOSE_CLUB`

Callback: `TRAINING_CLUB:{clubId}` → зберегти в `userState.trainingClubId` → продовжити.

### 8.2 Тренування за планом

`training_plans.club_id` вже відомий. При старті плану:

```js
const clubId = plan.club_id || null;
userState.trainingClubId = clubId;
```

Фільтрація вправ автоматична через `getExercisesByClub(clubId)`.

### 8.3 Фільтрація при виборі вправ

У всіх місцях де викликається `getExercisesByGroup` або пошук вправ —
замінити на `getExercisesByClub(userState.trainingClubId, filters)`.

Якщо `trainingClubId === null` (без клубу) — використовувати стару логіку (всі вправи).

### 8.4 Складання плану — вибір клубу

У `trainingPlan.js`, функція створення нового плану:

```js
// Після кроку «Термін ревізії», перед «Дні тренувань»:
const clubs = await supabase.getUserClubs(studentChatId);

if (clubs.length > 1) {
  // Показати вибір клубу
  userState.state = 'PLAN_CHOOSE_CLUB';
  // Кнопки клубів + callback PLAN_CLUB:{clubId}
  return;
}

if (clubs.length === 1) {
  userState.planClubId = clubs[0].club_id;
  // Продовжити автоматично
}

if (clubs.length === 0) {
  userState.planClubId = null;
  // Показати попередження → продовжити
}
```

При збереженні плану: `training_plans.club_id = userState.planClubId`.

---

## 9. Зміни в lib/registration.js

### 9.1 Новий крок після міста

```js
// Після збереження міста:
const clubs = await supabase.getClubsByCity(city);

if (clubs.length > 0) {
  // Показати вибір клубу + варіант «Вдома» + «Пропустити»
  userState.state = 'REGISTRATION_CLUB_SELECT';
  userState.registrationClubs = clubs;
} else {
  // Немає клубів у місті — перейти далі
  userState.state = NEXT_REGISTRATION_STEP;
}
```

### 9.2 Обробка вибору клубу

```js
if (data.startsWith('REG_CLUB_SELECT:')) {
  const clubId = data.slice('REG_CLUB_SELECT:'.length);
  await supabase.addUserClub(chatId, clubId);
  userState.registrationSelectedClubs = [...(userState.registrationSelectedClubs || []), clubId];

  // Показати «Додати ще?» з клубами, що залишились
  const remaining = userState.registrationClubs.filter(
    c => !userState.registrationSelectedClubs.includes(c.id)
  );

  if (remaining.length > 0) {
    // Показати кнопки: [➕ Додати ще] [✅ Готово]
    userState.state = 'REGISTRATION_CLUB_MORE';
  } else {
    // Всі клуби обрано — перейти далі
    goToNextStep();
  }
}

if (data === 'REG_CLUB_MORE') {
  userState.state = 'REGISTRATION_CLUB_SELECT';
  // Показати список без вже обраних
}

if (data === 'REG_CLUB_DONE' || data === 'REG_CLUB_SKIP') {
  goToNextStep();
}
```

---

## 10. Файли для створення/зміни

| Файл | Дія | Що |
|---|---|---|
| Supabase (міграція) | Створити | Таблиці `fitness_clubs`, `club_category_tags`, `club_tags`, `club_equipment`, `user_clubs`; ALTER TABLE `training_plans` ADD COLUMN `club_id`; INSERT псевдо-клуб «Вдома» |
| `lib/supabase.js` | Змінити | +`getClubsByCity`, `getUserClubs`, `addUserClub`, `removeUserClub`, `getClubEquipmentIds`, `getExercisesByClub`, `resolveTrainingClub`, `HOME_CLUB_ID` |
| `lib/registration.js` | Змінити | +крок REGISTRATION_CLUB_SELECT / MORE після міста |
| `lib/training.js` | Змінити | +TRAINING_CHOOSE_CLUB перед стартом вільного тренування; заміна getExercisesByGroup → getExercisesByClub |
| `lib/trainingPlan.js` | Змінити | +PLAN_CHOOSE_CLUB при новому плані; збереження club_id в training_plans |
| `lib/planGenerator.js` | Змінити | Фільтрація вправ через getExercisesByClub при авто-генерації плану |
| `lib/profile.js` | Змінити | +розділ «Мої клуби» (перегляд, додавання, видалення) |
| `lib/router.js` | Змінити | +REG_CLUB_*, TRAINING_CLUB:*, PLAN_CLUB:*, PROFILE_CLUBS_* handlers |
| `CALLBACK_FSM_MODULE_MATRIX.md` | Змінити | +всі нові стани і callbacks |

---

## 11. SQL міграція (повна)

```sql
-- 1. Фітнес-клуби
CREATE TABLE fitness_clubs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  city          text NOT NULL,
  instagram_url text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON fitness_clubs(city);

-- Псевдо-клуб «Вдома»
INSERT INTO fitness_clubs (id, name, city, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Вдома', '', true);

-- 2. Довідник тегів
CREATE TABLE club_category_tags (
  tag_code    text PRIMARY KEY,
  tag_name_ua text NOT NULL,
  tag_group   text NOT NULL
);
INSERT INTO club_category_tags VALUES
  ('gym',           'Тренажерний зал',         'type'),
  ('group_fitness', 'Групові заняття',          'type'),
  ('swimming',      'Басейн',                   'type'),
  ('rehabilitation','Реабілітація',             'type'),
  ('yoga',          'Йога',                     'group_class'),
  ('pilates',       'Пілатес',                  'group_class'),
  ('dance',         'Танці',                    'group_class'),
  ('boxing',        'Бокс / єдиноборства',      'group_class'),
  ('crossfit',      'Кросфіт',                  'group_class'),
  ('stretching',    'Стретчинг',                'group_class'),
  ('kids',          'Дитячі секції (до 16)',    'age'),
  ('seniors',       '40+ / Senior fitness',     'age');

-- 3. Теги клубу
CREATE TABLE club_tags (
  club_id  uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  tag_code text REFERENCES club_category_tags(tag_code),
  PRIMARY KEY (club_id, tag_code)
);

-- 4. Обладнання клубу
CREATE TABLE club_equipment (
  club_id      uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  equipment_id text NOT NULL,
  PRIMARY KEY (club_id, equipment_id)
);
CREATE INDEX ON club_equipment(club_id);

-- 5. Клуби користувача
CREATE TABLE user_clubs (
  chat_id    text NOT NULL,
  club_id    uuid REFERENCES fitness_clubs(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, club_id)
);
CREATE INDEX ON user_clubs(chat_id);

-- 6. Клуб у плані тренувань
ALTER TABLE training_plans
ADD COLUMN club_id uuid REFERENCES fitness_clubs(id);
```

---

## 12. Порядок реалізації (для Cursor)

```
── БЛОК 1: БД і базові функції ──

Крок 1:  Виконати SQL міграцію в Supabase
Крок 2:  lib/supabase.js — getClubsByCity, getUserClubs, addUserClub,
         removeUserClub, getClubEquipmentIds, getExercisesByClub,
         resolveTrainingClub, HOME_CLUB_ID

── БЛОК 2: Реєстрація ──

Крок 3:  lib/registration.js — крок REGISTRATION_CLUB_SELECT після міста
Крок 4:  lib/router.js — REG_CLUB_SELECT, REG_CLUB_MORE, REG_CLUB_DONE, REG_CLUB_SKIP
Крок 5:  Тест — реєстрація, місто з клубами → вибір → збереження в user_clubs
Крок 6:  Тест — реєстрація, місто без клубів → крок пропускається
Крок 7:  Тест — вибір «Вдома» → додається HOME_CLUB_ID

── БЛОК 3: Профіль — Мої клуби ──

Крок 8:  lib/profile.js — розділ «Мої клуби» (перегляд, додавання, видалення)
Крок 9:  lib/router.js — PROFILE_CLUBS_* handlers
Крок 10: Тест — додати клуб з профілю
Крок 11: Тест — видалити primary клуб → is_primary переходить до наступного

── БЛОК 4: Фільтрація вправ під час тренування ──

Крок 12: lib/training.js — TRAINING_CHOOSE_CLUB при вільному тренуванні (> 1 клубу)
Крок 13: lib/training.js — заміна getExercisesByGroup → getExercisesByClub
Крок 14: Тест — один клуб → вправи фільтруються, питання немає
Крок 15: Тест — два клуби → питання «В якому клубі?» → фільтрація
Крок 16: Тест — без клубу → попередження → всі вправи
Крок 17: Тест — вправи без equipment_id → завжди показуються

── БЛОК 5: Фільтрація при складанні плану ──

Крок 18: lib/trainingPlan.js — PLAN_CHOOSE_CLUB при новому плані (> 1 клубу)
Крок 19: lib/trainingPlan.js — збереження club_id в training_plans
Крок 20: lib/planGenerator.js — getExercisesByClub при авто-генерації
Крок 21: Тест — новий план, два клуби → вибір клубу → вправи з цього клубу
Крок 22: Тест — новий план, один клуб → вибір автоматичний
Крок 23: Тест — тренування за планом → club_id береться з плану

── БЛОК 6: Документація ──

Крок 24: CALLBACK_FSM_MODULE_MATRIX.md — оновити
```

---

## 13. Що НЕ змінюється

- Таблиця `EquipmentDirectory` — без змін (club_equipment посилається на її equipment_id)
- Таблиця `exercise_library` — без змін (equipment_id вже є)
- Логіка медичної фільтрації — без змін (застосовується після фільтрації за клубом)
- Anti-Repeat Logic, гендерна персоналізація — без змін
- Бібліотека вправ (перегляд) — без фільтрації за клубом (показувати всі, це довідник)

---

## 14. Бізнес-правила — зведено

1. Адмін наповнює `fitness_clubs`, `club_equipment`, `club_category_tags` вручну через Supabase.
2. Користувач може бути прив'язаний до необмеженої кількості клубів.
3. Перший вибраний клуб — `is_primary = true`.
4. «Вдома» — окремий псевдо-клуб з фіксованим id, рівноправний з іншими.
5. Питання «В якому клубі тренуємось?» — тільки при створенні нового плану і якщо клубів > 1.
6. При вільному тренуванні і клубів > 1 — питання задається перед стартом.
7. Вправи без `equipment_id` (власна вага) — показуються завжди, незалежно від клубу.
8. Без клубу — показати всі вправи + одноразове попередження.
9. Бібліотека вправ (перегляд) — без фільтрації за клубом.
10. Медична фільтрація застосовується після фільтрації за клубом.

---

*Документ готовий до передачі в Cursor.*
