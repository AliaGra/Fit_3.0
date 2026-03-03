-- ТЗ: Акцент-зони, уникнення та пресети сетів — FIT 3.0
-- Додаємо поля до таблиці training_plans

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS accent_zones TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_zones  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS split_config JSONB   DEFAULT '[]';

COMMENT ON COLUMN training_plans.accent_zones IS 'Зони акценту: glutes, legs, thighs, abs, arms, back, shoulders, full';
COMMENT ON COLUMN training_plans.avoid_zones  IS 'Зони уникнення: ті самі ключі';
COMMENT ON COLUMN training_plans.split_config IS 'Розподіл груп м''язів по днях, підтверджений тренером';
