-- FIT 3.0: типи тренувань personal/split/trio/group + модерація архіву групових
-- Ідемпотентно: якщо moderation_* ще немає — додає (з moderation_v1).

-- 0) Картка групового (card_v1) — якщо ще не застосовували
ALTER TABLE public.coach_group_classes
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS price_amount numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS price_currency text NULL DEFAULT 'UAH',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- 1) Колонки модерації (moderation_v1) — якщо ще не застосовували
ALTER TABLE public.coach_group_classes
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS moderation_note text NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS moderated_by text NULL;

COMMENT ON COLUMN public.users.coach_training_types IS
  'Типи тренувань тренера: personal, split, trio, group (legacy individual = personal+split+trio)';

COMMENT ON COLUMN public.coach_group_classes.moderation_status IS
  'draft | pending | published | rejected | archive_pending | restore_pending';

-- 2) Розгорнути legacy individual → personal, split, trio (без дублікатів)
UPDATE public.users
SET coach_training_types = (
  SELECT ARRAY(
    SELECT DISTINCT x FROM unnest(
      array_cat(
        array_remove(coach_training_types, 'individual'),
        CASE
          WHEN 'individual' = ANY (coach_training_types)
            THEN ARRAY['personal', 'split', 'trio']::text[]
          ELSE ARRAY[]::text[]
        END
      )
    ) AS x
    WHERE x IS NOT NULL AND x <> ''
  )
)
WHERE coach_training_types IS NOT NULL
  AND 'individual' = ANY (coach_training_types);

-- 3) Індекси модерації
CREATE INDEX IF NOT EXISTS idx_coach_group_classes_moderation
  ON public.coach_group_classes (moderation_status, submitted_at DESC)
  WHERE moderation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_moderation_any
  ON public.coach_group_classes (moderation_status, submitted_at DESC)
  WHERE moderation_status IN ('pending', 'archive_pending', 'restore_pending');

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_coach_venue_arch
  ON public.coach_group_classes (coach_chat_id, venue_id, is_archived);
