-- FIT 3.0 — Етап 6: прозорість ціни залу для клієнта (по тренер + зал)
-- Date: 2026-11-19

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS client_gym_policy text NOT NULL DEFAULT 'unset'
    CHECK (client_gym_policy IN ('unset', 'included', 'hint', 'own_membership'));

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS client_gym_hint_text text;

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS client_gym_hint_amount numeric
    CHECK (client_gym_hint_amount IS NULL OR client_gym_hint_amount >= 0);

COMMENT ON COLUMN public.coach_venue_economics.client_gym_policy IS
  'unset | included (зал у ціні тренера) | hint (окремо + орієнт) | own_membership (свій абонемент залу)';

COMMENT ON COLUMN public.coach_venue_economics.client_gym_hint_text IS
  'Текст орієнту для клієнта, коли client_gym_policy = hint';

COMMENT ON COLUMN public.coach_venue_economics.client_gym_hint_amount IS
  'Орієнтовна сума залу в грн (опційно), коли client_gym_policy = hint';