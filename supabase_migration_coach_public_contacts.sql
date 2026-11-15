-- Публічні контакти тренера на картці (опційно)
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_phone_visible boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_telegram_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.public_phone IS 'Телефон для публічної картки (не обовʼязково = phone)';
COMMENT ON COLUMN users.public_phone_visible IS 'Показувати public_phone на публічній картці';
COMMENT ON COLUMN users.public_telegram_visible IS 'Показувати @telegram_username на публічній картці (посилання t.me)';