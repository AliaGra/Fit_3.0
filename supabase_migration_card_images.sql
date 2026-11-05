-- Зображення на публічних картках: тренер (фото/лого), клієнт (фото), заклад (лого).
-- Запустити в Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS card_image_file_id text NULL,
  ADD COLUMN IF NOT EXISTS card_image_kind text NULL
    CHECK (card_image_kind IS NULL OR card_image_kind IN ('photo', 'logo'));

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS logo_file_id text NULL;

COMMENT ON COLUMN public.users.card_image_file_id IS 'Telegram file_id фото/лого для публічної картки';
COMMENT ON COLUMN public.users.card_image_kind IS 'photo | logo (тренер: будь-яке; клієнт: photo)';
COMMENT ON COLUMN public.venues.logo_file_id IS 'Telegram file_id логотипу закладу';
