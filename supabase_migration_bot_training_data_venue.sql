-- Логи тренувань: заклад для обліку абонемента (офлайн). NULL = онлайн / без залу.
-- Запустити в Supabase SQL Editor.

ALTER TABLE public.bot_training_data
  ADD COLUMN IF NOT EXISTS venue_id uuid NULL REFERENCES public.venues (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bot_training_data_chat_venue_date
  ON public.bot_training_data (chat_id, venue_id, date);
