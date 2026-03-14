-- Зони акценту та уникнення в профілі користувача (для авто-плану та реєстрації)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accent_zones TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_zones  TEXT[] DEFAULT '{}';

COMMENT ON COLUMN users.accent_zones IS 'Зони акценту: glutes, legs, thighs, abs, arms, back, shoulders, full';
COMMENT ON COLUMN users.avoid_zones  IS 'Зони уникнення: ті самі ключі';
