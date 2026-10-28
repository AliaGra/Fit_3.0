-- Абонемент залу: привʼязка до закладу (nullable для legacy).
-- Запустити в Supabase SQL Editor.

ALTER TABLE public.gym_subscriptions
  ADD COLUMN IF NOT EXISTS venue_id uuid NULL REFERENCES public.venues (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gym_subscriptions_chat_venue
  ON public.gym_subscriptions (chat_id, venue_id);

-- Прапорці нагадувань «залишилось 2 / 1 тренування» (тип «на N»).
ALTER TABLE public.gym_subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_n2 boolean NOT NULL DEFAULT false;

ALTER TABLE public.gym_subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_n1 boolean NOT NULL DEFAULT false;
