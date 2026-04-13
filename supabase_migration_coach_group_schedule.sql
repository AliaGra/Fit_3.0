-- FIT 3.0: персональний розклад тренера для групових занять
CREATE TABLE IF NOT EXISTS public.coach_group_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  group_class_code text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  time_start time NOT NULL,
  time_end time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_group_schedule_time_check CHECK (time_end > time_start)
);

CREATE INDEX IF NOT EXISTS idx_coach_group_schedule_coach_venue
  ON public.coach_group_schedule (coach_chat_id, venue_id);

CREATE INDEX IF NOT EXISTS idx_coach_group_schedule_coach_group
  ON public.coach_group_schedule (coach_chat_id, venue_id, group_class_code);
