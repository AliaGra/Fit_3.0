-- Профіль активності: окремі колонки для фільтрів/звітів
-- job_type, transport_type, steps_category, extra_activity -> algorithm -> activity_level, neat_coefficient
-- daily_steps — опційно точна кількість кроків (трекер)

ALTER TABLE users ADD COLUMN IF NOT EXISTS job_type           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS transport_type    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS steps_category     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_steps        integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_activity     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_level     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS neat_coefficient   decimal(4,3);

COMMENT ON COLUMN users.job_type IS 'office_sitting | office_mixed | standing | physical';
COMMENT ON COLUMN users.transport_type IS 'car_transit | walk_bike | combined';
COMMENT ON COLUMN users.steps_category IS 'under_5k | 5k_10k | 10k_15k | over_15k';
COMMENT ON COLUMN users.daily_steps IS 'Точна кількість кроків (якщо є трекер), nullable';
COMMENT ON COLUMN users.extra_activity IS 'none | light | moderate | intense';
COMMENT ON COLUMN users.activity_level IS 'sedentary | light | moderate | active | very_active';
COMMENT ON COLUMN users.neat_coefficient IS 'Множник для TDEE, напр. 1.20-1.725';
