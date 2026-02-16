-- Міграція: Дні відпустки тренера (блокують запис учням на цілий день)
-- Таблиця coach_vacation_days

CREATE TABLE IF NOT EXISTS coach_vacation_days (
  coach_id  text NOT NULL,
  date      text NOT NULL,   -- YYYY-MM-DD
  PRIMARY KEY (coach_id, date)
);

ALTER TABLE coach_vacation_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON coach_vacation_days FOR ALL USING (true) WITH CHECK (true);
