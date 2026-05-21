-- Тренер ↔ заклад: дві незалежні відмітки
-- teaches_here = «де треную» (проводжу тренування для учнів / публічний профіль)
-- trains_here  = «де тренуюсь» (сам(а) займаюсь; меню «Клуби, студії»)

ALTER TABLE public.coach_venues
  ADD COLUMN IF NOT EXISTS teaches_here boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trains_here boolean NOT NULL DEFAULT false;

-- Існуючі привʼязки: лишаємо в «де треную» і дублюємо в «де тренуюсь», щоб не зникли з «Клуби, студії»
UPDATE public.coach_venues
SET teaches_here = true,
    trains_here = true;

COMMENT ON COLUMN public.coach_venues.teaches_here IS 'Тренер проводить тренування в цьому закладі (профіль, картка для учнів)';
COMMENT ON COLUMN public.coach_venues.trains_here IS 'Тренер займається в цьому закладі (меню Клуби, студії)';
