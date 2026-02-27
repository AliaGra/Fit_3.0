-- FIT 3.0 plan_adjustments (ТЗ 9.4.4, Логіка 9.3)
CREATE TABLE IF NOT EXISTS plan_adjustments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id         uuid REFERENCES training_plans(plan_id) ON DELETE SET NULL,
  new_plan_id     uuid REFERENCES training_plans(plan_id) ON DELETE SET NULL,
  adjustment_type text NOT NULL,
  details         jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_plan_id ON plan_adjustments(plan_id);
