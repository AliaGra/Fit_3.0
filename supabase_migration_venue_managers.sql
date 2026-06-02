-- Власник / менеджер закладу (фаза 0 — обмежена роль у основному боті)
-- Прив'язка: admin призначає manager_chat_id до venue_id (див. adminVenues ADM_VOWN)

CREATE TABLE IF NOT EXISTS public.venue_managers (
  manager_chat_id text NOT NULL REFERENCES public.users (chat_id) ON DELETE CASCADE,
  venue_id        uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_chat_id, venue_id)
);

CREATE INDEX IF NOT EXISTS venue_managers_venue_idx
  ON public.venue_managers (venue_id);

COMMENT ON TABLE public.venue_managers IS 'Менеджер закладу; owner — власник (фаза 0)';

-- Чи показувати тренера на публічній картці закладу (teaches_here лишається для прив''язки)
ALTER TABLE public.coach_venues
  ADD COLUMN IF NOT EXISTS listing_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.coach_venues.listing_visible IS 'false — приховано з картки закладу; teaches_here може лишатись true';

UPDATE public.coach_venues SET listing_visible = true WHERE listing_visible IS NULL;
