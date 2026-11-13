-- FIT 3.0: картка групового заняття тренера (етап A)
-- Назва вже в label_ua; додаємо опис, ціну, архів.

ALTER TABLE public.coach_group_classes
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS price_amount numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS price_currency text NULL DEFAULT 'UAH',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coach_group_classes.description IS 'Короткий опис групового (до ~300 символів у UI)';
COMMENT ON COLUMN public.coach_group_classes.price_amount IS 'Вартість заняття (число)';
COMMENT ON COLUMN public.coach_group_classes.price_currency IS 'Валюта вартості, за замовч. UAH';
COMMENT ON COLUMN public.coach_group_classes.is_archived IS 'true = в архіві, не показується в активному списку';

CREATE INDEX IF NOT EXISTS idx_coach_group_classes_coach_venue_arch
  ON public.coach_group_classes (coach_chat_id, venue_id, is_archived);
