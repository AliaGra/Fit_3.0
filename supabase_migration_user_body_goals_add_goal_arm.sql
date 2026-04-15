-- Add desired biceps parameter to user body goals
-- Run in Supabase SQL editor before deploying bot changes.

ALTER TABLE IF EXISTS user_body_goals
ADD COLUMN IF NOT EXISTS goal_arm decimal(5,1);

COMMENT ON COLUMN user_body_goals.goal_arm IS 'Бажаний обхват біцепса (см)';
