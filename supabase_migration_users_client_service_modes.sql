-- MAYAG FIT: формат тренувань клієнта з тренером (офлайн / онлайн)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS client_service_modes text[];

COMMENT ON COLUMN public.users.client_service_modes IS
  'Як клієнт тренується з тренером: offline, online (можна обидва). Задає тренер при інвайті.';
