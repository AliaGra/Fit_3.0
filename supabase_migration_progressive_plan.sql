-- ТЗ: Прогресивний план тренувань — FIT 3.0
-- Таблиця training_plan_weeks + нові поля в training_plans

-- 2.1 Нова таблиця training_plan_weeks
CREATE TABLE IF NOT EXISTS training_plan_weeks (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        uuid NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  week_number    integer NOT NULL,
  day_number     integer NOT NULL,
  day_label      text,
  phase          text NOT NULL,
  exercise_id    integer REFERENCES exercise_library(id),
  exercise_name  text NOT NULL,
  sets           integer,
  reps           text,
  rest_sec       integer,
  order_in_day   integer NOT NULL DEFAULT 1,
  notes          text,
  ai_reason      text,
  medical_status text DEFAULT 'NEUTRAL',
  target_weight  decimal(5,2),
  created_at     timestamptz DEFAULT now(),
  execution_type text NOT NULL DEFAULT 'single',
  set_id         text,
  planned_rounds integer
);

CREATE INDEX IF NOT EXISTS idx_training_plan_weeks_plan_week_day ON training_plan_weeks(plan_id, week_number, day_number);
CREATE INDEX IF NOT EXISTS idx_training_plan_weeks_plan_phase ON training_plan_weeks(plan_id, phase);

COMMENT ON TABLE training_plan_weeks IS 'Прогресивний план: вправи по тижнях і днях (generation_mode = progressive)';
COMMENT ON COLUMN training_plan_weeks.execution_type IS 'single | set';
COMMENT ON COLUMN training_plan_weeks.set_id IS 'Спільний ідентифікатор для вправ сету, напр. w1_d2_s1';
COMMENT ON COLUMN training_plan_weeks.planned_rounds IS 'Кількість кругів сету (для execution_type = set)';

-- 2.2 Нові поля в training_plans
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS generation_mode  text DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS phase_duration   integer,
  ADD COLUMN IF NOT EXISTS total_weeks      integer,
  ADD COLUMN IF NOT EXISTS ai_plan_summary  text,
  ADD COLUMN IF NOT EXISTS created_by_role  text DEFAULT 'coach';

COMMENT ON COLUMN training_plans.generation_mode IS 'simple — старий цикл (training_plan_exercises), progressive — новий (training_plan_weeks)';
COMMENT ON COLUMN training_plans.phase_duration IS 'Кількість тижнів в одній фазі (2|3|4)';
COMMENT ON COLUMN training_plans.total_weeks IS 'Дублює revision_weeks для зручності';
COMMENT ON COLUMN training_plans.ai_plan_summary IS 'AI пояснення загальної логіки плану';
COMMENT ON COLUMN training_plans.created_by_role IS 'coach — план створив тренер, student — учень створив сам';
