-- FIT 3.0: Telegram @username для кнопки «Написати в Telegram»
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_username text;

COMMENT ON COLUMN public.users.telegram_username IS
  'Публічний @username з Telegram (без @); оновлюється автоматично при активності в боті';
