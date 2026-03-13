ТЗ  Нормалізація обладнання (equipment)
Таблиця equipment · Міграція exercise_library · JOIN у Node.js · Імпорт ExerciseLibrary v2

Область змін:	Supabase (DDL + seed + міграція) · Node.js (сервіс картки вправи)
Залежності:	Існуюча таблиця exercise_library · існуючий сервіс показу картки вправи
Поза скоупом:	UI/UX бота · логіка тренувань · медичні обмеження · нові вправи
Порядок кроків:	1 → 2 → 3 → 4. Кожен крок — атомарний, можна перевіряти окремо

Крок 1 — Створити таблицю equipment в Supabase
Виконати в Supabase → SQL Editor. Окрема міграція.

1.1 DDL
-- ===================================================
-- MIGRATION: 001_create_equipment
-- ===================================================
CREATE TABLE IF NOT EXISTS equipment (
  id           TEXT PRIMARY KEY,
  name_ua      TEXT        NOT NULL,
  type         TEXT        NOT NULL
               CHECK (type IN (
                 'Тренажер', 'Вільна вага',
                 'Снаряд', 'Аксесуар', 'Власна вага'
               )),
  photo_url    TEXT,
  description  TEXT,
  sort_order   INT         DEFAULT 0,
  is_active    BOOLEAN     DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

1.2 Опис полів
Поле	Тип	Призначення
id	TEXT PK	Код тренажера: EQ_CABLE, EQ_BARBELL, BW, ACC_MAT…
name_ua	TEXT	Назва для виводу: «Блоковий тренажер»
type	TEXT	Тренажер / Вільна вага / Снаряд / Аксесуар / Власна вага
photo_url	TEXT NULL	Фото тренажера — зараз NULL, використається в майбутньому
description	TEXT NULL	Де знайти в залі — зараз NULL
sort_order	INT	Порядок у списку при виборі
is_active	BOOLEAN	false = прихований з інтерфейсу

⚠️  photo_url і description залишити NULL — поля закладаються зараз щоб уникнути ALTER TABLE пізніше.

1.3 Seed-дані (31 рядок)
Вставити одразу після CREATE TABLE в тій самій міграції:

INSERT INTO equipment (id, name_ua, type, sort_order) VALUES
  ('EQ_CABLE',            'Блоковий тренажер',                       'Тренажер',    10),
  ('EQ_CROSSOVER',        'Кросовер',                                'Тренажер',    20),
  ('EQ_BARBELL',          'Штанга',                                  'Вільна вага', 30),
  ('EQ_SMITH',            'Smith machine',                           'Тренажер',    40),
  ('EQ_DUMBBELL',         'Гантелі / Гантеля',                       'Вільна вага', 50),
  ('EQ_GRAVITRON',        'Гравітрон',                               'Тренажер',    60),
  ('EQ_PULLUP_BAR',       'Турнік',                                  'Снаряд',      70),
  ('EQ_DIPS_BAR',         'Бруси',                                   'Снаряд',      80),
  ('EQ_HACK_SQUAT',       'Гак-тренажер',                            'Тренажер',    90),
  ('EQ_T_BAR',            'Т-гриф тренажер',                         'Тренажер',   100),
  ('EQ_PEC_DECK',         'Тренажер Pec Deck (Метелик)',              'Тренажер',   110),
  ('EQ_LEG_PRESS',        'Тренажер для жиму ногами 45°',            'Тренажер',   120),
  ('EQ_LEG_EXTENSION',    'Тренажер для розгинання ніг',             'Тренажер',   130),
  ('EQ_LEG_CURL_LIE',     'Тренажер для згинання ніг (лежачи)',      'Тренажер',   140),
  ('EQ_LEG_CURL_SIT',     'Тренажер для згинання ніг (сидячи)',      'Тренажер',   150),
  ('EQ_LEG_ABDUCTOR',     'Тренажер для відведення ніг',             'Тренажер',   160),
  ('EQ_LEG_ADDUCTOR',     'Тренажер для зведення ніг (аддуктор)',    'Тренажер',   170),
  ('EQ_CALF_STAND',       'Тренажер для литків стоячи',              'Тренажер',   180),
  ('EQ_CALF_SIT',         'Тренажер для литків сидячи',              'Тренажер',   190),
  ('EQ_LATERAL_MACHINE',  'Тренажер для дельт (махи в сторони)',     'Тренажер',   200),
  ('EQ_REAR_DELT_MACHINE','Тренажер для задньої дельти',             'Тренажер',   210),
  ('EQ_AB_CRUNCH',        'Тренажер для преса (Ab Crunch)',          'Тренажер',   220),
  ('EQ_HYPEREXT',         'Лава для гіперекстензій',                 'Снаряд',     230),
  ('EQ_INTER_CHEST',      'Inter Atletika Chest Press',              'Тренажер',   240),
  ('EQ_INTER_ROW',        'Inter Atletika Seated Row',               'Тренажер',   250),
  ('BW',                  'Власна вага',                             'Власна вага',260),
  ('ACC_MAT',             'Килимок',                                 'Аксесуар',   270),
  ('ACC_FITBALL',         'Фітбол',                                  'Аксесуар',   280),
  ('ACC_BAND',            'Фітнес-резинка',                          'Аксесуар',   290),
  ('ACC_KETTLEBELL',      'Гиря',                                    'Вільна вага',300),
  ('ACC_STEP',            'Платформа / сходинка',                    'Аксесуар',   310);

1.4 Перевірка після кроку 1
-- Має повернути 31
SELECT COUNT(*) FROM equipment;

-- Перевірити розподіл по типах
SELECT type, COUNT(*) FROM equipment GROUP BY type ORDER BY type;

Крок 2 — Міграція таблиці exercise_library
Три атомарні ALTER у правильному порядку. Виконати в Supabase → SQL Editor.

⚠️  Якщо в exercise_library зараз є тільки колонка equipment (TEXT), спочатку додати колонку equipment_id (TEXT). Після імпорту даних (Крок 3) можна буде накласти FK і видалити equipment.
⚠️  Крок 2.3 (FK constraint) виконувати ТІЛЬКИ після успішного завершення Кроку 3 (імпорт даних). Передчасний FK заблокує вставку рядків з незнайомими equipment_id.

2.0 Додати колонку equipment_id (якщо її ще немає)
-- MIGRATION: 002a_exercise_library_add_equipment_id
ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS equipment_id TEXT;

2.1 Додати колонку attachment
-- MIGRATION: 002_exercise_library_add_attachment
ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS attachment TEXT;

-- Перевірка:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exercise_library' AND column_name = 'attachment';

2.2 Перевірити що equipment_id заповнений у всіх рядках
-- Має повернути 0. Якщо > 0 — спочатку заповнити порожні.
SELECT COUNT(*) FROM exercise_library WHERE equipment_id IS NULL OR equipment_id = '';

2.3 Додати FK constraint (після імпорту даних — Крок 3)
-- MIGRATION: 003_exercise_library_fk_equipment
-- !! Виконати ПІСЛЯ Кроку 3 !!
ALTER TABLE exercise_library
  ADD CONSTRAINT fk_exercise_library_equipment
  FOREIGN KEY (equipment_id)
  REFERENCES equipment(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

2.4 Видалити стару колонку equipment
-- MIGRATION: 004_exercise_library_drop_old_equipment
-- !! Виконати ОСТАННІМ після тестування картки вправи !!
ALTER TABLE exercise_library DROP COLUMN IF EXISTS equipment;

⚠️  Стару колонку equipment видаляти тільки після того як картка вправи в боті успішно відображає назву через JOIN (Крок 4).

Крок 3 — Імпорт ExerciseLibrary v3 (medical) в Supabase
Файл ExerciseLibrary_v3_medical.xlsx містить вправи з колонками equipment_id та attachment. Потрібно синхронізувати дані з існуючою таблицею exercise_library.

3.1 Колонки xlsx (строгий порядок)
Перший рядок у файлі — заголовки (без пропуску рядків).

id · group1 · group2 · group3 · name_ua · name_ru · equipment_id · attachment · active · type · difficulty · focus_point · common_mistakes · proper_feeling · static_holds · youtube_link · my_channel_link · medical_contraindications · medical_limitations · safe_for · modifications · alternatives · safety_notes

Маппінг у таблицю exercise_library: group1→group_level1, group2→group_level2, group3→group_level3, type→vid. Решта колонок — однойменні.

3.2 Стратегія імпорту
Використовувати UPSERT (INSERT … ON CONFLICT DO UPDATE) — безпечно, не видаляє існуючі рядки.

⚠️  НЕ використовувати TRUNCATE + INSERT — це видалить зв'язані дані (плани тренувань, training_plan_exercises, training_plan_weeks тощо).

3.3 Скрипт імпорту (Node.js)
Створити файл scripts/import-exercises.js:

// scripts/import-exercises.js
// Запуск: node scripts/import-exercises.js
// Файл: data/ExerciseLibrary_v3_medical.xlsx (колонки в строгому порядку)

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — обхід RLS
);

async function importExercises() {
  const wb = XLSX.readFile(path.join(__dirname, '../data/ExerciseLibrary_v3_medical.xlsx'));
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const exercises = rows
    .filter(r => r['id'] != null && String(r['id']).trim() !== '')
    .map(r => ({
      id:                        parseInt(r['id'], 10) || r['id'],
      group_level1:              (r['group1'] ?? '').toString().trim() || null,
      group_level2:              (r['group2'] ?? '').toString().trim() || null,
      group_level3:              (r['group3'] ?? '').toString().trim() || null,
      name_ua:                   (r['name_ua'] ?? '').toString().trim() || null,
      name_ru:                   (r['name_ru'] ?? '').toString().trim() || null,
      equipment_id:              (r['equipment_id'] ?? '').toString().trim() || null,
      attachment:                (r['attachment'] ?? '').toString().trim() || null,
      active:                    (r['active'] ?? '').toString().toUpperCase() === 'YES' ? 'YES' : null,
      vid:                       (r['type'] ?? '').toString().trim() || null,
      difficulty:                (r['difficulty'] ?? '').toString().trim() || null,
      focus_point:               (r['focus_point'] ?? '').toString().trim() || null,
      common_mistakes:           (r['common_mistakes'] ?? '').toString().trim() || null,
      proper_feeling:            (r['proper_feeling'] ?? '').toString().trim() || null,
      static_holds:              (r['static_holds'] ?? '').toString().trim() || null,
      youtube_link:              (r['youtube_link'] ?? '').toString().trim() || null,
      my_channel_link:           (r['my_channel_link'] ?? '').toString().trim() || null,
      medical_contraindications: (r['medical_contraindications'] ?? '').toString().trim() || null,
      medical_limitations:       (r['medical_limitations'] ?? '').toString().trim() || null,
      safe_for:                  (r['safe_for'] ?? '').toString().trim() || null,
      modifications:             (r['modifications'] ?? '').toString().trim() || null,
      alternatives:              (r['alternatives'] ?? '').toString().trim() || null,
      safety_notes:              (r['safety_notes'] ?? '').toString().trim() || null,
    }));

  console.log(`Імпортуємо ${exercises.length} вправ...`);

  const { error } = await supabase
    .from('exercise_library')
    .upsert(exercises, {
      onConflict: 'id',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('Помилка імпорту:', error);
    process.exit(1);
  }

  console.log('Імпорт успішний!');
}

importExercises();

3.4 Залежність: xlsx пакет
# Якщо xlsx ще не встановлено:
npm install xlsx

3.5 Файл даних
Покласти ExerciseLibrary_v3_medical.xlsx в папку:
project-root/data/ExerciseLibrary_v3_medical.xlsx

3.6 Перевірка після імпорту
-- Загальна кількість (має бути ≥ 114):
SELECT COUNT(*) FROM exercise_library;

-- Всі рядки мають equipment_id:
SELECT COUNT(*) FROM exercise_library WHERE equipment_id IS NULL OR equipment_id = '';
-- Має повернути 0

-- Перевірити attachment:
SELECT id, name_ua, equipment_id, attachment
FROM exercise_library
WHERE equipment_id = 'EQ_CABLE'
LIMIT 5;

Крок 4 — Оновити Node.js сервіс картки вправи
Оновити існуючу функцію отримання та форматування картки вправи. Додати JOIN з таблицею equipment.

4.1 Оновити запит до Supabase
Знайти в коді функцію яка отримує вправу по id (getExerciseById або аналог). Замінити запит:

// ДО:
const { data: exercise, error } = await supabase
  .from('exercise_library')
  .select('*')
  .eq('id', exerciseId)
  .single();

// ПІСЛЯ:
const { data: exercise, error } = await supabase
  .from('exercise_library')
  .select(`
    *,
    equipment:equipment_id (
      name_ua,
      type
    )
  `)
  .eq('id', exerciseId)
  .single();

// exercise.equipment.name_ua → "Блоковий тренажер"
// exercise.attachment        → "V-рукоять"

4.2 Додати helper formatEquipment
Додати в той самий файл (або в utils/formatters.js якщо існує):

/**
 * Формує рядок обладнання для виводу в картці вправи.
 * @param {object} exercise - рядок з таблиці exercise_library (з JOIN equipment)
 * @returns {string}
 */
function formatEquipment(exercise) {
  const name = exercise.equipment?.name_ua ?? '';
  const att  = exercise.attachment ?? '';
  if (!name) return '—';
  return att ? `${name} — ${att}` : name;
}

// Приклади:
// formatEquipment({ equipment: { name_ua: "Блоковий тренажер" }, attachment: "V-рукоять" })
// → "Блоковий тренажер — V-рукоять"
//
// formatEquipment({ equipment: { name_ua: "Штанга" }, attachment: null })
// → "Штанга"
//
// formatEquipment({ equipment: { name_ua: "Власна вага" }, attachment: null })
// → "Власна вага"

4.3 Використати в шаблоні повідомлення
Знайти місце де формується текст картки вправи. Замінити старий вивід equipment на новий:

// ДО (приклад):
const msg = [
  `📌 *${exercise.name_ua}*`,
  `🏋️ ${exercise.equipment}`,   // старе текстове поле
  ...
].join("\n");

// ПІСЛЯ:
const msg = [
  `📌 *${exercise.name_ua}*`,
  `🏋️ ${formatEquipment(exercise)}`,  // JOIN + helper
  ...
].join("\n");

⚠️  Якщо exercise.equipment поверне null (вправа без тренажера — BW), formatEquipment поверне "Власна вага" через name_ua з таблиці equipment.

Зведений порядок виконання
#	Дія	Де виконувати	Перевірка
1	CREATE TABLE equipment + INSERT seed (31 рядок)	Supabase SQL Editor	COUNT = 31
2	ALTER TABLE exercise_library ADD COLUMN attachment	Supabase SQL Editor	Колонка є
3	Покласти xlsx у data/, запустити import-exercises.js	Термінал	≥114 вправ, 0 NULL
4	ALTER TABLE exercise_library ADD CONSTRAINT fk_equipment	Supabase SQL Editor	Constraint є
5	Оновити запит + додати formatEquipment в Node.js	Cursor / редактор	Картка виводить назву
6	Протестувати картку вправи в боті	Telegram (тест)	Назва = правильна
7	ALTER TABLE exercise_library DROP COLUMN equipment	Supabase SQL Editor	Колонка видалена

⚠️  Крок 7 — незворотній. Виконувати тільки після успішного тесту в Telegram (крок 6).

Критерії завершення Етапу 1
Критерій	Статус
Таблиця equipment існує, містить рівно 31 рядок	☐
exercise_library.attachment існує як окрема TEXT колонка	☐
equipment_id заповнений у всіх рядках exercise_library (0 NULL)	☐
FK constraint fk_exercise_library_equipment створений	☐
Картка вправи в боті виводить назву: «Блоковий тренажер — V-рукоять»	☐
Картка вправи без насадки виводить просто назву: «Штанга»	☐
Вправа «Власна вага» виводить: «Власна вага» (без «—»)	☐
Стара колонка exercise_library.equipment видалена	☐

