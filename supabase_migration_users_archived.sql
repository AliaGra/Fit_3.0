-- ============================================
-- FIT 3.0 — архів учнів тренера
-- У списку «Мої учні» показуються тільки учні з is_archived = false або NULL.
-- Архівовані відображаються в «Архив учнів».
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_coach_archived
  ON users(coach_id) WHERE is_archived = true;

COMMENT ON COLUMN users.is_archived IS 'true = учень прихований з основного списку тренера, показується в Архів учнів';
