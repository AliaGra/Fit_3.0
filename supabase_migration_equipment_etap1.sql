-- ===================================================
-- ТЗ Етап 1: Нормалізація обладнання (equipment)
-- Виконати в Supabase → SQL Editor.
-- Крок 2.3 (FK) і 2.4 (DROP equipment) — окремо після імпорту та тесту.
-- ===================================================

-- 1. Таблиця equipment + seed (31 рядок)
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
  ('ACC_BAND',             'Фітнес-резинка',                          'Аксесуар',   290),
  ('ACC_KETTLEBELL',      'Гиря',                                    'Вільна вага',300),
  ('ACC_STEP',            'Платформа / сходинка',                    'Аксесуар',   310)
ON CONFLICT (id) DO NOTHING;

-- 2.0 Колонка equipment_id у exercise_library
ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS equipment_id TEXT;

-- 2.1 Колонка attachment у exercise_library
ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS attachment TEXT;

-- Перевірка: SELECT COUNT(*) FROM equipment;  -- має бути 31
-- Після імпорту даних виконати окремо:
-- ALTER TABLE exercise_library ADD CONSTRAINT fk_exercise_library_equipment
--   FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON UPDATE CASCADE ON DELETE SET NULL;
-- Після тесту картки в боті виконати окремо:
-- ALTER TABLE exercise_library DROP COLUMN IF EXISTS equipment;
