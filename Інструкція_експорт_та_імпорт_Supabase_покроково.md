# Покрокова інструкція: експорт з Google Sheets та імпорт у Supabase

---

## Частина 1. Експорт даних у Google Apps Script

### Крок 1.1. Відкрити проєкт

1. Відкрийте таблицю Google Sheets, прив’язану до бота FIT 3.0.
2. Меню **Розширення** → **Apps Script** (або перейдіть за посиланням на ваш скрипт у браузері).
3. Переконайтеся, що в проєкті є файл **ExportForSupabase.gs** (разом із Main.gs, constants, sheets тощо).

### Крок 1.2. Перевірити SPREADSHEET_ID

1. У редакторі Apps Script: **Проєкт** (іконка годинника) → **Властивості проєкту** (або **Project settings**).
2. Розділ **Script properties**. Має бути властивість **SPREADSHEET_ID** з ID вашої таблиці.
3. Якщо її немає — натисніть **Додати властивість**, ім’я: `SPREADSHEET_ID`, значення: ID таблиці (з URL: `https://docs.google.com/spreadsheets/d/ **ОСЬ_ЦЕЙ_ID** /edit`).

### Крок 1.3. Запустити експорт у Drive

1. У списку файлів відкрийте **ExportForSupabase.gs**.
2. Над редактором коду є випадаючий список **«Select function»**. Клацніть по ньому і виберіть **runExportToDrive**.
3. Натисніть **Виконати** (Run).
4. Перший раз з’явиться запит дозволів: **Переглянути дозволи** → оберіть ваш акаунт Google → **Дозволити**.
5. Після виконання відкрийте **Виконання** (Execution log) або **Логи** (View → Logs). Там буде рядок на кшталт: `Created folder: https://drive.google.com/...`

У списку функцій тепер мають бути видно: **runExportToDrive**, **runExportToDriveWithLogs**, **runExportAllForSupabase**, **runGetExportAsJsonString**.

### Крок 1.4. Взяти файли з Drive

1. Відкрийте Google Drive (drive.google.com).
2. У корені диска знайдіть папку **FIT_Export_YYYY-MM-DD_HH-mm** (дата й час запуску).
3. У папці будуть файли:
   - **export_full.json** — усі таблиці в одному файлі;
   - **users.json**, **exercise_library.json**, **workout_schedule.json**, **pricing.json** тощо — по одному файлу на таблицю.
4. За потреби завантажте ці файли на комп’ютер (ПКМ по файлу → Завантажити) або залиште в Drive для подальшого використання.

**Якщо потрібні й логи:** у списку функцій виберіть **runExportToDriveWithLogs** замість runExportToDrive — тоді в папці з’явиться також **logs.json**.

---

## Частина 2. Підготовка Supabase

### Крок 2.1. Створити проєкт (якщо ще немає)

1. Зайдіть на [supabase.com](https://supabase.com), увійдіть у акаунт.
2. **New project** → вкажіть організацію, ім’я проєкту, пароль БД, регіон → **Create new project**.
3. Дочекайтеся створення проєкту.

### Крок 2.2. Отримати URL та ключ API

1. У лівій панелі: **Project Settings** (іконка шестерні).
2. Вкладка **API**: скопіюйте та збережіть:
   - **Project URL** (наприклад `https://xxxxx.supabase.co`);
   - **anon public** ключ (поле **Project API keys** → `anon` `public`).

Це знадобиться для імпорту через API або для майбутнього бекенду.

---

## Частина 3. Створення таблиць у Supabase (SQL)

### Крок 3.1. Відкрити SQL Editor

1. У лівій панелі Supabase виберіть **SQL Editor**.
2. Натисніть **New query**.

### Крок 3.2. Виконати скрипт створення таблиць

Скрипт SQL винесено в окремий файл: **Supabase_створення_таблиць_FIT3.sql**

1. Відкрийте файл **Supabase_створення_таблиць_FIT3.sql** у цьому проєкті.
2. Скопіюйте весь вміст і вставте у вікно запиту в Supabase **SQL Editor**.
3. Натисніть **Run** (або Ctrl+Enter).

Таблиці та колонки відповідають полям з експортованих JSON-файлів (snake_case). Дати приймаються як `timestamptz`. У таблиці `bot_training_data` колонка номера підходу збережена як `"set"` (в лапках), бо в PostgreSQL `set` — зарезервоване слово.

**Примітка:** якщо в `pricing` або `training_plan_exercises` у вас можуть бути дублікати за ключем, можливо доведеться змінити `PRIMARY KEY` або використати унікальний індекс замість одного поля. Після першого імпорту перевірте дані в Table Editor.

### Перевірка: чи все перенесено правильно

| № | Таблиця | Відповідність експорту (ExportForSupabase.gs) |
|---|---------|-----------------------------------------------|
| 1 | city_list | ✓ city_id, city_name |
| 2 | users | ✓ Поля: created_at, user_id, chat_id, first_name, last_name, city, role, gender, age, goal, coach_id, birth_date, height, weight, waist, hip, glutes, arm, instagram, calendar_id, experience_start_date (досвід учня, встановлюється тренером) |
| 3 | exercise_library | ✓ id, group_name, exercise_name, equipment, active, comment, focus_point, common_mistakes, proper_feeling, static_holds, youtube_link, my_channel_link |
| 4 | training_plans | ✓ plan_id, coach_id, plan_name, goal, level, description, is_active |
| 5 | training_plan_exercises | ✓ id (auto), plan_id, day, exercise_name, sets, reps, rest_sec, notes |
| 6 | pricing | ✓ id (auto), coach_id, student_id, price_personal, price_split, price_trio, currency, updated_at, default_training_type |
| 7 | workout_schedule | ✓ id, coach_id, student_id, date, time, status, updated_at, cal_event_id, price_charged, currency, training_type |
| 8 | measurements_history | ✓ id (auto), chat_id, date, height, weight, waist, hip, glutes, arm, source |
| 9 | bot_training_data | ⚠️ Колонка **set** — зарезервоване слово в PostgreSQL. Потрібно в лапках: **"set"** |
| 10 | logs | ✓ id (auto), timestamp, context, message, stack |

У файлі **Supabase_створення_таблиць_FIT3.sql** колонка вже задана як `"set"`. Якщо ви раніше виконували старий скрипт без лапок і таблиця `bot_training_data` не створилась через помилку — видаліть її (`DROP TABLE IF EXISTS bot_training_data;`) і виконайте знову повний скрипт з файлу. RLS та політики для всіх 10 таблиць у скрипті присутні — це потрібно для імпорту через anon API.

---

## Частина 4. Імпорт даних у Supabase

**Покрокова інструкція з перенесення даних з папки FIT_Export (Google Drive) у Supabase** — у окремому файлі: **Імпорт_даних_з_Drive_в_Supabase_покроково.md**. Там описано: завантаження папки з Drive, встановлення Node.js, запуск скрипта **import-to-supabase.mjs** і перевірка в Table Editor.

Коротко: завантажити папку FIT_Export на комп’ютер → в папці проєкту виконати `npm init -y`, `npm install @supabase/supabase-js` → задати `SUPABASE_URL` і `SUPABASE_ANON_KEY` → `node import-to-supabase.mjs "шлях_до_папки_FIT_Export"`.

---

Нижче — альтернативи (curl або Table Editor).

### Варіант A. Імпорт через REST API (рекомендовано)

Потрібні: **Project URL** та **anon key** з кроку 2.2.

Порядок імпорту (з урахуванням зовнішніх ключів):

1. **city_list**  
2. **users**  
3. **exercise_library**  
4. **training_plans**  
5. **training_plan_exercises**  
6. **pricing**  
7. **workout_schedule**  
8. **measurements_history**  
9. **bot_training_data**  
10. **logs** (якщо експортували).

Приклад для **curl** (замініть `YOUR_PROJECT_REF` та `YOUR_ANON_KEY`):

```bash
# Приклад: імпорт users
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/rest/v1/users" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d @users.json
```

Файл **users.json** має містити масив об’єктів у форматі `[{ "created_at": "...", "chat_id": "...", ... }, ...]`. Якщо у вас у файлі є обгортка типу `{ "users": [ ... ] }`, потрібно відправити саме масив зсередини (наприклад, витягнути в іншому файлі або скриптом).

**Якщо масив великий:** Supabase приймає батчі. Розбийте масив на частини (наприклад по 100–500 записів) і зробіть кілька POST-запитів з відрізками масиву.

### Варіант B. Скрипт для імпорту (Node.js)

Можна зробити невеликий скрипт, який читає кожен `.json` з папки експорту і відправляє дані на Supabase пачками. Приклад ідеї:

1. Встановити `@supabase/supabase-js`: `npm init -y && npm i @supabase/supabase-js`.
2. Створити файл, наприклад `import-to-supabase.mjs`:
   - читати з диска файли `users.json`, `exercise_library.json` тощо;
   - для кожного файлу: якщо це об’єкт з одним ключем (наприклад `users`), взяти масив з цього ключа;
   - викликати `supabase.from('users').insert(rows)` (або іншу таблицю) пачками по 100–200 рядків.
3. Запускати імпорт у порядку зі списку вище.

Якщо потрібен готовий приклад такого скрипту — можна додати його окремим файлом у проєкт.

### Варіант C. Table Editor (ручна вставка або CSV)

1. У Supabase: **Table Editor** → виберіть таблицю (наприклад **users**).
2. **Insert** → **Import data from CSV**. Потрібно попередньо перетворити відповідний масив з JSON у CSV (назви колонок = ключі з JSON).
3. Або вставляти рядки вручну через **Insert row** (для невеликих об’ємів).

---

## Швидкий чеклист

- [ ] У GAS задано **SPREADSHEET_ID** у Script Properties.
- [ ] Запущено **exportToDrive()**, папка з’явилась у Google Drive.
- [ ] Файли з папки експорту завантажені локально або доступні для скрипта.
- [ ] У Supabase створено проєкт, збережено **Project URL** та **anon key**.
- [ ] У **SQL Editor** виконано скрипт створення таблиць (Частина 3).
- [ ] Дані імпортовані у правильному порядку: city_list → users → exercise_library → training_plans → … → bot_training_data (і logs за потреби).
- [ ] У **Table Editor** перевірено наявність даних у кількох таблицях.

Після цього можна підключати бекенд бота або веб-додаток до Supabase замість Google Sheets.

Версія: 1.0 | 06.02.2026
