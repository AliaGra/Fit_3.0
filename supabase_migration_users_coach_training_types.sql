-- FIT 3.0: типи тренувань тренера (для реєстрації та групування в картці закладу)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coach_training_types text[];

COMMENT ON COLUMN public.users.coach_training_types IS
  'Типи тренувань тренера: individual, group';

