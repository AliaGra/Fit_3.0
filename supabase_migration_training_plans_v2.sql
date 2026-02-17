-- ============================================
-- FIT 3.0 — плани тренувань (Логіка складання плану тренувань.md, 11.2, 11.3)
-- Таблиці training_plans (uuid), training_plan_exercises.
-- Увага: якщо вже є старі таблиці training_plans/training_plan_exercises (plan_id text),
-- їх потрібно видалити або перейменувати перед виконанням.
-- ============================================

-- 11.2 Таблиця training_plans (оновлена схема)
DROP TABLE IF EXISTS training_plan_exercises;
DROP TABLE IF EXISTS training_plans;

CREATE TABLE training_plans (
  plan_id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id        text REFERENCES users(chat_id),
  student_id      text REFERENCES users(chat_id),
  plan_name       text NOT NULL,
  goal            text NOT NULL CHECK (goal IN ('lose','gain','keep')),
  level           text NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  split_scheme    text,
  days_per_week   integer,
  description     text,
  is_active       boolean DEFAULT false,
  is_template     boolean DEFAULT false,
  generation_type text DEFAULT 'manual',
  created_at      timestamptz DEFAULT now(),
  valid_until     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_training_plans_student ON training_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_coach ON training_plans(coach_id);

-- 11.3 Таблиця training_plan_exercises
CREATE TABLE training_plan_exercises (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id         uuid NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  exercise_id     integer REFERENCES exercise_library(id),
  exercise_name   text NOT NULL,
  day_number      integer NOT NULL,
  day_label       text,
  order_in_day    integer DEFAULT 1,
  sets            integer,
  reps            text,
  rest_sec        integer,
  notes           text,
  medical_status  text DEFAULT 'NEUTRAL',
  progression_type text DEFAULT 'weight',
  target_weight   decimal(5,2)
);

CREATE INDEX IF NOT EXISTS idx_training_plan_exercises_plan_day ON training_plan_exercises(plan_id, day_number);

-- Опціонально: додати FK active_plan_id у users (якщо ще не додано з посиланням)
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_active_plan_id_fkey;
-- ALTER TABLE users ADD CONSTRAINT users_active_plan_id_fkey FOREIGN KEY (active_plan_id) REFERENCES training_plans(plan_id);
