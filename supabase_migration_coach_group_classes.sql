-- FIT 3.0: групові заняття тренера по кожному закладу
CREATE TABLE IF NOT EXISTS public.coach_group_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  group_class_code text NOT NULL,
  label_ua text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_chat_id, venue_id, group_class_code)
);

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_coach_venue
  ON public.coach_group_classes (coach_chat_id, venue_id);
