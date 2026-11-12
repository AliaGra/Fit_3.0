-- Нагадування / вітання з днем народження (дедуп cron)
-- Date: 2026-11-12

CREATE TABLE IF NOT EXISTS public.birthday_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_chat_id text NOT NULL,
  subject_chat_id text NOT NULL,
  kind text NOT NULL,
  days_before integer NOT NULL,
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT birthday_reminders_sent_kind_chk
    CHECK (kind IN ('pair_coach', 'pair_student', 'platform')),
  CONSTRAINT birthday_reminders_sent_days_chk
    CHECK (days_before IN (0, 1, 2, 3))
);

COMMENT ON TABLE public.birthday_reminders_sent IS
  'Дедуп: pair_coach = тренеру про ДН учня; pair_student = учню про ДН тренера; platform = вітання від платформи в день ДН.';

COMMENT ON COLUMN public.birthday_reminders_sent.year IS
  'Календарний рік настання ДН (Europe/Kyiv), за який уже надіслано.';

CREATE UNIQUE INDEX IF NOT EXISTS birthday_reminders_sent_uniq
  ON public.birthday_reminders_sent (recipient_chat_id, subject_chat_id, kind, days_before, year);

CREATE INDEX IF NOT EXISTS birthday_reminders_sent_created_idx
  ON public.birthday_reminders_sent (created_at DESC);

ALTER TABLE public.birthday_reminders_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.birthday_reminders_sent;
CREATE POLICY "Allow all for anon" ON public.birthday_reminders_sent FOR ALL USING (true) WITH CHECK (true);
