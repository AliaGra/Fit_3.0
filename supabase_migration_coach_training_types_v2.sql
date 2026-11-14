-- FIT 3.0: типи тренувань personal/split/trio/group + модерація архіву групових

COMMENT ON COLUMN public.users.coach_training_types IS
  'Типи тренувань тренера: personal, split, trio, group (legacy individual = personal+split+trio)';

COMMENT ON COLUMN public.coach_group_classes.moderation_status IS
  'draft | pending | published | rejected | archive_pending | restore_pending';

-- Розгорнути legacy individual → personal, split, trio (без дублікатів)
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

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_moderation_any
  ON public.coach_group_classes (moderation_status, submitted_at DESC)
  WHERE moderation_status IN ('pending', 'archive_pending', 'restore_pending');
