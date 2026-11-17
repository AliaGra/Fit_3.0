-- FIT 3.0: групові абонементи клієнта (фіксує тренер у картці)
-- Date: 2026-11-17
-- Для плану доходів / % залу від оплат абонементів (місяць = start_date)

CREATE TABLE IF NOT EXISTS public.coach_group_class_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  student_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  group_class_id uuid NOT NULL REFERENCES public.coach_group_classes (id) ON DELETE CASCADE,
  amount_paid numeric NOT NULL DEFAULT 0
    CHECK (amount_paid >= 0),
  currency text NOT NULL DEFAULT 'UAH',
  start_date date NOT NULL,
  end_date date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_group_class_subscriptions_dates_chk
    CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.coach_group_class_subscriptions IS
  'Груповий абонемент клієнта: тренер фіксує вручну (оплата, початок/кінець, заняття).';

COMMENT ON COLUMN public.coach_group_class_subscriptions.amount_paid IS
  'Сума оплати абонемента; для % залу потрапляє в місяць start_date';

COMMENT ON COLUMN public.coach_group_class_subscriptions.start_date IS
  'Початок дії; місяць цієї дати = місяць обліку оплати для % залу';

CREATE INDEX IF NOT EXISTS coach_gcs_coach_idx
  ON public.coach_group_class_subscriptions (coach_chat_id);

CREATE INDEX IF NOT EXISTS coach_gcs_student_idx
  ON public.coach_group_class_subscriptions (student_chat_id);

CREATE INDEX IF NOT EXISTS coach_gcs_coach_start_idx
  ON public.coach_group_class_subscriptions (coach_chat_id, start_date);

CREATE INDEX IF NOT EXISTS coach_gcs_class_idx
  ON public.coach_group_class_subscriptions (group_class_id);

ALTER TABLE public.coach_group_class_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.coach_group_class_subscriptions;
CREATE POLICY "Allow all for anon" ON public.coach_group_class_subscriptions
  FOR ALL USING (true) WITH CHECK (true);
