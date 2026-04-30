-- Persist last automatic symptom reminder timestamp.

ALTER TABLE IF EXISTS user_cycle_settings
ADD COLUMN IF NOT EXISTS last_symptom_reminder_sent_at timestamptz;

COMMENT ON COLUMN user_cycle_settings.last_symptom_reminder_sent_at IS 'Коли востаннє надсилалось авто-нагадування про symptom-check';

