-- Плечі, груди, відсоток жиру для типу фігури та персоналізованого плану
-- measurements_history
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS shoulders    decimal(5,1);
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS chest       decimal(5,1);
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS body_fat_pct decimal(4,1);

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS shoulders    decimal(5,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chest        decimal(5,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS body_fat_pct decimal(4,1);

COMMENT ON COLUMN measurements_history.shoulders IS 'Обхват плечей (см), найширша точка дельт';
COMMENT ON COLUMN measurements_history.chest IS 'Обхват грудей (см), найширша точка грудної клітки';
COMMENT ON COLUMN measurements_history.body_fat_pct IS 'Відсоток жиру (каліпер), наприклад 22.5';
COMMENT ON COLUMN users.shoulders IS 'Обхват плечей (см)';
COMMENT ON COLUMN users.chest IS 'Обхват грудей (см)';
COMMENT ON COLUMN users.body_fat_pct IS 'Відсоток жиру (каліпер)';
