-- ============================================
-- FIT 3.0 — ревізія плану (Логіка складання плану, п. 9.1)
-- valid_until вже є в training_plans. Додаємо колонку для "нагадування надіслано".
-- ============================================

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS revision_reminder_sent_at timestamptz;

COMMENT ON COLUMN training_plans.revision_reminder_sent_at IS 'Коли тренеру надіслано нагадування про ревізію плану (один раз після valid_until)';

-- Опціонально: для планів, активованих до цієї міграції — встановити valid_until від created_at + 6 тижнів
-- UPDATE training_plans SET valid_until = created_at + interval '42 days' WHERE is_active = true AND valid_until IS NULL;
