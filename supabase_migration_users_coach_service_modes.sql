-- FIT 3.0: формати надання послуг тренера (реєстрація)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coach_service_modes text[];

COMMENT ON COLUMN public.users.coach_service_modes IS
  'Формати послуг тренера: offline, online, programs';
