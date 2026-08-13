-- Розсилка тренера/закладу + opt-in на новини у місті
-- Date: 2026-08-13

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS ads_opt_in boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.ads_opt_in IS
  'Так = отримувати новини/пропозиції тренерів і закладів у своєму місті (потенційні розсилки). Свої тренер/заклад завжди доходять.';

CREATE TABLE IF NOT EXISTS public.broadcast_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_chat_id text NOT NULL,
  sender_role text NOT NULL,
  venue_id text,
  audience_type text NOT NULL,
  city text,
  body text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_log_sender_created_idx
  ON public.broadcast_log (sender_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_log_venue_created_idx
  ON public.broadcast_log (venue_id, created_at DESC);

ALTER TABLE public.broadcast_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.broadcast_log;
CREATE POLICY "Allow all for anon" ON public.broadcast_log FOR ALL USING (true) WITH CHECK (true);
