-- FIT 3.0: умови розрахунку тренера з залом (крок 1 — налаштування)
-- Date: 2026-11-17
--
-- По кожному залу з «Де треную»:
--   session_*  — індивідуальні / спліт / тріо (за проведену сесію): percent АБО fixed
--   group_*    — групові: percent від оплат абонементів АБО fixed за відвідувача на заняття

CREATE TABLE IF NOT EXISTS public.coach_venue_economics (
  coach_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,

  session_mode text NOT NULL DEFAULT 'unset'
    CHECK (session_mode IN ('unset', 'percent', 'fixed')),
  session_percent numeric
    CHECK (session_percent IS NULL OR (session_percent >= 0 AND session_percent <= 100)),
  session_fixed_amount numeric
    CHECK (session_fixed_amount IS NULL OR session_fixed_amount >= 0),

  group_mode text NOT NULL DEFAULT 'unset'
    CHECK (group_mode IN ('unset', 'percent_subs', 'fixed_per_attendee')),
  group_percent numeric
    CHECK (group_percent IS NULL OR (group_percent >= 0 AND group_percent <= 100)),
  group_fixed_per_attendee numeric
    CHECK (group_fixed_per_attendee IS NULL OR group_fixed_per_attendee >= 0),

  currency text NOT NULL DEFAULT 'UAH',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_chat_id, venue_id)
);

COMMENT ON TABLE public.coach_venue_economics IS
  'Умови розрахунку тренера з залом: % або фікс (сесії) + % абонементів чи фікс за відвідувача (групові).';

COMMENT ON COLUMN public.coach_venue_economics.session_mode IS
  'unset | percent (% від повної gross сесії) | fixed (грн за 1 проведену сесію)';

COMMENT ON COLUMN public.coach_venue_economics.group_mode IS
  'unset | percent_subs (% від оплат групових абонементів у місяці start_date) | fixed_per_attendee (грн × відвідувач на заняття)';

CREATE INDEX IF NOT EXISTS coach_venue_economics_venue_idx
  ON public.coach_venue_economics (venue_id);

CREATE INDEX IF NOT EXISTS coach_venue_economics_coach_idx
  ON public.coach_venue_economics (coach_chat_id);

ALTER TABLE public.coach_venue_economics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.coach_venue_economics;
CREATE POLICY "Allow all for anon" ON public.coach_venue_economics
  FOR ALL USING (true) WITH CHECK (true);
