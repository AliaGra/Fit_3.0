-- FIT 3.0: звернення до тренера з публічної картки (не клієнти)
-- Date: 2026-11-14

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coach_inquiry_auto_reply boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.coach_inquiry_auto_reply IS
  'Тренер: автовідповідь на звернення з публічної картки (true = увімкнено).';

CREATE TABLE IF NOT EXISTS public.coach_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  from_chat_id text NOT NULL,
  kind text NOT NULL,
  label_ua text,
  question_text text,
  group_class_code text,
  status text NOT NULL DEFAULT 'open',
  reminder_sent_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_inquiries_kind_chk CHECK (
    kind IN (
      'club_personal',
      'club_split',
      'club_trio',
      'club_group',
      'online',
      'programs',
      'nutrition',
      'question'
    )
  ),
  CONSTRAINT coach_inquiries_status_chk CHECK (status IN ('open', 'answered'))
);

COMMENT ON TABLE public.coach_inquiries IS
  'Звернення користувача (ще не клієнта) до тренера з публічної картки.';

CREATE INDEX IF NOT EXISTS coach_inquiries_coach_status_idx
  ON public.coach_inquiries (coach_chat_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_inquiries_from_coach_open_idx
  ON public.coach_inquiries (from_chat_id, coach_chat_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS coach_inquiries_open_reminder_idx
  ON public.coach_inquiries (created_at)
  WHERE status = 'open' AND reminder_sent_at IS NULL;

ALTER TABLE public.coach_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.coach_inquiries;
CREATE POLICY "Allow all for anon" ON public.coach_inquiries FOR ALL USING (true) WITH CHECK (true);
