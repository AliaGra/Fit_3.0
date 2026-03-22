-- Різний робочий час по днях тижня (0=Пн … 6=Нд, як rest_days)
-- Значення: { "0": { "start": "09:00", "end": "21:00" }, ... }
-- Якщо NULL — використовуються work_start / work_end для всіх робочих днів.

ALTER TABLE coach_schedule_settings
  ADD COLUMN IF NOT EXISTS work_hours_by_weekday jsonb DEFAULT NULL;

COMMENT ON COLUMN coach_schedule_settings.work_hours_by_weekday IS 'JSON: day 0-6 (Mon-Sun) -> {start, end}; null = single work_start/work_end';
