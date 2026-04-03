-- Додатковий замір: біцепс у напруженому стані
-- measurements_history
ALTER TABLE measurements_history ADD COLUMN IF NOT EXISTS arm_flex decimal(4,1);

-- users (поточні значення)
ALTER TABLE users ADD COLUMN IF NOT EXISTS arm_flex decimal(4,1);

COMMENT ON COLUMN measurements_history.arm_flex IS 'Обхват біцепса у напруженому стані (см)';
COMMENT ON COLUMN users.arm_flex IS 'Обхват біцепса у напруженому стані (см)';
