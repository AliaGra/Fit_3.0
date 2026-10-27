-- MAYAG FIT: модерація закладів, доданих тренером
-- Застосувати після supabase_migration_venues.sql

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS moderation_status text;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS created_by_coach_chat_id text;

UPDATE public.venues
SET moderation_status = 'approved'
WHERE moderation_status IS NULL OR trim(moderation_status) = '';

ALTER TABLE public.venues
  ALTER COLUMN moderation_status SET DEFAULT 'approved';

ALTER TABLE public.venues
  ALTER COLUMN moderation_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venues_moderation_status_check'
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_moderation_status_check
      CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS venues_moderation_status_idx
  ON public.venues (moderation_status);

CREATE INDEX IF NOT EXISTS venues_pending_created_idx
  ON public.venues (created_at DESC)
  WHERE moderation_status = 'pending';

COMMENT ON COLUMN public.venues.moderation_status IS
  'pending = чекає адміна; approved = у публічному каталозі; rejected = відхилено';
COMMENT ON COLUMN public.venues.created_by_coach_chat_id IS
  'chat_id тренера, який запропонував заклад (якщо додано з реєстрації/профілю)';
