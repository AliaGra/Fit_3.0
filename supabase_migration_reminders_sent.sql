-- ============================================
-- FIT 3.0 — таблиця для відстеження відправлених нагадувань
-- Виконати в Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS reminders_sent (
  slot_id     text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_id)
);

ALTER TABLE reminders_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON reminders_sent FOR ALL USING (true) WITH CHECK (true);
