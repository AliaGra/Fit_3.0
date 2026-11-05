-- Тренер → заявка на роль власника закладу + режим меню.
-- Запустити в Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_menu_mode text NULL
    CHECK (active_menu_mode IS NULL OR active_menu_mode IN ('coach', 'venue_owner'));

CREATE TABLE IF NOT EXISTS public.venue_owner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  venue_id uuid NULL REFERENCES public.venues (id) ON DELETE SET NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz NULL,
  moderated_by text NULL
);

CREATE INDEX IF NOT EXISTS idx_venue_owner_requests_status_created
  ON public.venue_owner_requests (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_venue_owner_requests_coach
  ON public.venue_owner_requests (coach_chat_id);

ALTER TABLE public.venue_owner_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.venue_owner_requests;
CREATE POLICY "Allow all for anon" ON public.venue_owner_requests
  FOR ALL USING (true) WITH CHECK (true);
