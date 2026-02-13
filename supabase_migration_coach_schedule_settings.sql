-- Міграція: Налаштування шаблону слотів тренера (1K)
-- Таблиця coach_schedule_settings

CREATE TABLE IF NOT EXISTS coach_schedule_settings (
  coach_id       text NOT NULL PRIMARY KEY,
  rest_days      jsonb NOT NULL DEFAULT '[]',  -- [0,6] = Пн, Нд (0=Пн, 6=Нд)
  workout_duration_min integer NOT NULL DEFAULT 60,
  work_start     text NOT NULL DEFAULT '09:00',
  work_end       text NOT NULL DEFAULT '21:00',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_schedule_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON coach_schedule_settings FOR ALL USING (true) WITH CHECK (true);
