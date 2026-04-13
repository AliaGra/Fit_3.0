-- FIT 3.0: текстовий опис групових занять тренера (які заняття / де / коли)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coach_group_training_details text;

COMMENT ON COLUMN public.users.coach_group_training_details IS
  'Опис групових занять тренера: які формати, у якому закладі (якщо кілька), коли';
