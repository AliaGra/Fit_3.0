-- FIT 3.0 — body_type / body_build / fat% sources (for deterministic analytics)
-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS body_type text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS body_build text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fat_pct_manual decimal(4,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS fat_pct_navy decimal(4,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS fat_pct_source text;

COMMENT ON COLUMN users.body_type IS 'Body type (apple/pear/hourglass/...); recalculated on measurements save';
COMMENT ON COLUMN users.body_build IS 'Body build from wrist: asthenic/normosthenic/hypersthenic';
COMMENT ON COLUMN users.fat_pct_manual IS 'Body fat % entered manually (caliper)';
COMMENT ON COLUMN users.fat_pct_navy IS 'Body fat % estimated from neck (US Navy)';
COMMENT ON COLUMN users.fat_pct_source IS 'Which fat % to use as primary: manual|navy|null';
