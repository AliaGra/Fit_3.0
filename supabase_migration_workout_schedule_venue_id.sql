-- FIT 3.0: venue_id на слоті (для звітів «після залу» / план-факт)
-- Date: 2026-11-19

ALTER TABLE public.workout_schedule
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.workout_schedule.venue_id IS
  'Заклад проведення (офлайн). NULL = онлайн / без залу — частка залу не застосовується.';

CREATE INDEX IF NOT EXISTS workout_schedule_coach_venue_idx
  ON public.workout_schedule (coach_id, venue_id);
