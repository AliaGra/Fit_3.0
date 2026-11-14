-- FIT 3.0: послуга «План харчування» (coach_service_modes += nutrition)
-- Схема без змін (text[]); лише коментар.

COMMENT ON COLUMN public.users.coach_service_modes IS
  'Формати послуг тренера: offline, online, programs, nutrition';
