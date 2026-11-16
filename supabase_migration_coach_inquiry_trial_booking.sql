-- Пробний запис на слот після відповіді тренера на звернення (1 спроба на пару учень–тренер)
-- Date: 2026-11-16

ALTER TABLE public.coach_inquiries
  ADD COLUMN IF NOT EXISTS offer_booking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coach_inquiries.offer_booking IS
  'Тренер увімкнув запис на вільний слот у цій відповіді';

CREATE TABLE IF NOT EXISTS public.student_coach_trial_booking (
  student_chat_id text NOT NULL,
  coach_chat_id text NOT NULL,
  inquiry_id uuid NOT NULL REFERENCES public.coach_inquiries (id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  slot_id uuid,
  PRIMARY KEY (student_chat_id, coach_chat_id)
);

COMMENT ON TABLE public.student_coach_trial_booking IS
  'Одна пробна спроба запису на тренера без coach_id у профілі';

CREATE INDEX IF NOT EXISTS student_coach_trial_booking_inquiry_idx
  ON public.student_coach_trial_booking (inquiry_id);

ALTER TABLE public.student_coach_trial_booking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.student_coach_trial_booking;
CREATE POLICY "Allow all for anon" ON public.student_coach_trial_booking
  FOR ALL USING (true) WITH CHECK (true);