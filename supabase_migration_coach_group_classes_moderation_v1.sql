-- FIT 3.0: модерація групового заняття тренера → картка клубу (етап D)

ALTER TABLE public.coach_group_classes
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS moderation_note text NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS moderated_by text NULL;

COMMENT ON COLUMN public.coach_group_classes.moderation_status IS
  'draft | pending | published | rejected — заявка на розміщення на картці клубу';
COMMENT ON COLUMN public.coach_group_classes.moderation_note IS
  'Примітка адміна (напр. причина відхилення)';

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_moderation
  ON public.coach_group_classes (moderation_status, submitted_at DESC)
  WHERE moderation_status = 'pending';
