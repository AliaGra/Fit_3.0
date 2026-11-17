-- FIT 3.0: фікс залу окремо для personal / split / trio
-- Date: 2026-11-17
-- Застосувати ПІСЛЯ supabase_migration_coach_venue_economics.sql

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS session_fixed_personal numeric
    CHECK (session_fixed_personal IS NULL OR session_fixed_personal >= 0);

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS session_fixed_split numeric
    CHECK (session_fixed_split IS NULL OR session_fixed_split >= 0);

ALTER TABLE public.coach_venue_economics
  ADD COLUMN IF NOT EXISTS session_fixed_trio numeric
    CHECK (session_fixed_trio IS NULL OR session_fixed_trio >= 0);

COMMENT ON COLUMN public.coach_venue_economics.session_fixed_personal IS
  'Фікс залу (грн) за 1 проведену персональну сесію';
COMMENT ON COLUMN public.coach_venue_economics.session_fixed_split IS
  'Фікс залу (грн) за 1 проведену спліт-сесію (на сесію, не на людину)';
COMMENT ON COLUMN public.coach_venue_economics.session_fixed_trio IS
  'Фікс залу (грн) за 1 проведену тріо-сесію (на сесію, не на людину)';

-- Якщо вже був єдиний session_fixed_amount — скопіювати в усі три типи
UPDATE public.coach_venue_economics
SET
  session_fixed_personal = COALESCE(session_fixed_personal, session_fixed_amount),
  session_fixed_split = COALESCE(session_fixed_split, session_fixed_amount),
  session_fixed_trio = COALESCE(session_fixed_trio, session_fixed_amount)
WHERE session_fixed_amount IS NOT NULL
  AND (
    session_fixed_personal IS NULL
    OR session_fixed_split IS NULL
    OR session_fixed_trio IS NULL
  );

COMMENT ON COLUMN public.coach_venue_economics.session_mode IS
  'unset | percent (% від повної gross сесії, спільний) | fixed (окремі session_fixed_personal/split/trio)';
