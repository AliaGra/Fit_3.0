-- Додаткові заміри: шия та зап'ястя (для точнішого профілю)
-- measurements_history
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS neck  decimal(4,1);
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS wrist decimal(4,1);

-- users (поточні значення)
ALTER TABLE users ADD COLUMN IF NOT EXISTS neck  decimal(4,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS wrist decimal(4,1);

COMMENT ON COLUMN measurements_history.neck IS 'Обхват шиї (см)';
COMMENT ON COLUMN measurements_history.wrist IS 'Обхват зап''ястя (см)';
COMMENT ON COLUMN users.neck IS 'Обхват шиї (см)';
COMMENT ON COLUMN users.wrist IS 'Обхват зап''ястя (см)';
