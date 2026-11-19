-- FIT 3.0: Каса — фіксація звірки з залом (етап 2 сесії, етап 3 групові)
-- Date: 2026-11-19

CREATE TABLE IF NOT EXISTS public.coach_cash_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  -- uuid закладу або 'none' якщо без прив’язки до залу
  venue_id text NOT NULL,
  business_date date NOT NULL,
  -- sessions = денна каса indiv/split/trio; group_month = місячна групова (етап 3)
  kind text NOT NULL DEFAULT 'sessions'
    CHECK (kind IN ('sessions', 'group_month')),
  plan_amount numeric NOT NULL CHECK (plan_amount >= 0),
  fact_amount numeric NOT NULL CHECK (fact_amount >= 0),
  -- coach = A тренер-каса; venue = B зал-каса на момент фіксації
  cash_mode text NOT NULL CHECK (cash_mode IN ('coach', 'venue')),
  currency text NOT NULL DEFAULT 'UAH',
  status text NOT NULL DEFAULT 'closed' CHECK (status = 'closed'),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_cash_settlements_unique_idx
  ON public.coach_cash_settlements (coach_chat_id, venue_id, business_date, kind);

COMMENT ON TABLE public.coach_cash_settlements IS
  'Остаточна фіксація каси тренера з залом після звірки план = факт.';

ALTER TABLE public.coach_cash_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.coach_cash_settlements;
CREATE POLICY "Allow all for anon" ON public.coach_cash_settlements
  FOR ALL USING (true) WITH CHECK (true);