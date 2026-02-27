-- FIT 3.0 — додаткові поля для ревізії плану (Логіка складання плану, 9.4.2, 9.5, 11.2)
-- revision_weeks за рівнем (beginner 10, intermediate 7, advanced 5), parent_plan_id для авто-ревізії, activated_at

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS revision_weeks integer,
  ADD COLUMN IF NOT EXISTS parent_plan_id uuid REFERENCES training_plans(plan_id),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

COMMENT ON COLUMN training_plans.revision_weeks IS 'Термін ревізії в тижнях: beginner 10, intermediate 7, advanced 5';
COMMENT ON COLUMN training_plans.parent_plan_id IS 'Попередній план при авто-ревізії (generatePlanRevision)';
COMMENT ON COLUMN training_plans.activated_at IS 'Дата/час активації плану для учня';

-- plan_adjustments (ТЗ 9.4.4)
CREATE TABLE IF NOT EXISTS plan_adjustments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id         uuid REFERENCES training_plans(plan_id) ON DELETE SET NULL,
  new_plan_id     uuid REFERENCES training_plans(plan_id) ON DELETE SET NULL,
  adjustment_type text NOT NULL,
  details         jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_plan_id ON plan_adjustments(plan_id);
