-- Exercise cycle flags: reviewed workflow + initial backfill for existing library.

ALTER TABLE IF EXISTS exercise_library
ADD COLUMN IF NOT EXISTS cycle_flags_reviewed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN exercise_library.cycle_flags_reviewed IS 'true = флаги циклу перевірені (manual/auto), false = needs_review';

-- High-impact keywords (UA/RU)
UPDATE exercise_library
SET is_high_impact = true
WHERE lower(coalesce(name_ua, '') || ' ' || coalesce(name_ru, '')) ~
  '(стриб|прыж|скакал|плиом|бурпі|бурпи|джамп|jump|box jump|скачк)';

-- Inversion keywords (UA/RU)
UPDATE exercise_library
SET is_inversion = true
WHERE lower(coalesce(name_ua, '') || ' ' || coalesce(name_ru, '')) ~
  '(стійк|стойк|берізк|березк|перевернут|інверс|инверс|голов.*вниз|голов[аы].*ниже)';

-- Mark all current rows as reviewed after backfill.
UPDATE exercise_library
SET cycle_flags_reviewed = true
WHERE cycle_flags_reviewed = false;

