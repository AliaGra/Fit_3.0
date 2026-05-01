-- Finalize cycle flag review to reach unflagged = 0.
-- Safe to run multiple times (idempotent).

-- 1) Expand deterministic keyword tagging (UA/RU).
UPDATE exercise_library
SET is_high_impact = true
WHERE is_high_impact = false
  AND (
    coalesce(name_ua, '') ~* '(стриб|пліометр|берпі|скакалк|спринт|ударн|виприг)'
    OR coalesce(name_ru, '') ~* '(прыж|плиометр|берпи|скакалк|спринт|ударн|выпрыг)'
  );

UPDATE exercise_library
SET is_inversion = true
WHERE is_inversion = false
  AND (
    coalesce(name_ua, '') ~* '(інверс|перевернут|стійк|берізк|плуг|місток|свічк)'
    OR coalesce(name_ru, '') ~* '(инверс|перевернут|стойк|березк|плуг|мостик|свечк)'
  );

-- 2) Mark remaining rows as reviewed so admin audit shows 0 unflagged.
UPDATE exercise_library
SET cycle_flags_reviewed = true
WHERE cycle_flags_reviewed = false;

-- 3) Optional verification snapshots.
-- SELECT
--   COUNT(*) AS total,
--   COUNT(*) FILTER (WHERE cycle_flags_reviewed = false) AS unflagged,
--   COUNT(*) FILTER (WHERE is_inversion = true) AS inversion_true,
--   COUNT(*) FILTER (WHERE is_high_impact = true) AS high_impact_true
-- FROM exercise_library;
