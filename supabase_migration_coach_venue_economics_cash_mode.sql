-- FIT 3.0: режим збору грошей A/B (етап 1 Каси)
-- Date: 2026-11-19
--
-- session_cash_mode / group_cash_mode:
--   unset  — ще не обрано
--   coach  — A: тренер бере з клієнта, віддає залу комісію
--   venue  — B: зал бере з клієнта, віддає тренеру «чисті»

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS session_cash_mode text NOT NULL DEFAULT 'unset';

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS group_cash_mode text NOT NULL DEFAULT 'unset';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coach_venue_economics_session_cash_mode_chk'
  ) THEN
    ALTER TABLE public.coach_venue_economics
      ADD CONSTRAINT coach_venue_economics_session_cash_mode_chk
      CHECK (session_cash_mode IN ('unset', 'coach', 'venue'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coach_venue_economics_group_cash_mode_chk'
  ) THEN
    ALTER TABLE public.coach_venue_economics
      ADD CONSTRAINT coach_venue_economics_group_cash_mode_chk
      CHECK (group_cash_mode IN ('unset', 'coach', 'venue'));
  END IF;
END $$;

COMMENT ON COLUMN public.coach_venue_economics.session_cash_mode IS
  'Хто бере оплату за indiv/split/trio: unset | coach (A) | venue (B)';

COMMENT ON COLUMN public.coach_venue_economics.group_cash_mode IS
  'Хто бере оплату за групові: unset | coach (A) | venue (B)';
