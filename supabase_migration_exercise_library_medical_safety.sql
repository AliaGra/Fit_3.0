-- ============================================
-- FIT 3.0 — додавання колонок медичних та безпекових полів у exercise_library
-- Виконати в Supabase SQL Editor
-- Відповідає колонкам Q–V у Google Sheets
-- ============================================

ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS medical_contraindications text,   -- Q: абсолютні заборони
  ADD COLUMN IF NOT EXISTS medical_limitations       text,   -- R: обмеження з примітками
  ADD COLUMN IF NOT EXISTS safe_for                  text,   -- S: безпечно при цих станах
  ADD COLUMN IF NOT EXISTS modifications            text,   -- T: як модифікувати
  ADD COLUMN IF NOT EXISTS alternatives             text,   -- U: альтернативні вправи
  ADD COLUMN IF NOT EXISTS safety_notes             text;   -- V: загальні примітки безпеки
