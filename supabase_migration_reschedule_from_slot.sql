-- Зв'язок «новий слот REQUESTED» → «старий слот BOOKED» при переносі ініційованому тренером
-- (щоб учень підтвердив саме той старий слот, а не перший BOOKED у списку).
ALTER TABLE workout_schedule
  ADD COLUMN IF NOT EXISTS reschedule_from_slot_id text NULL;
