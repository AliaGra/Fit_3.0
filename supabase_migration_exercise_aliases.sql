-- FIT 3.0 — Система псевдонімів вправ (ТЗ_Псевдоніми_вправ.md)
-- user_id TEXT (як users.chat_id), повнотекстовий пошук GIN по alias

-- Для gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS exercise_aliases (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL,
  exercise_id INT NOT NULL,
  alias       TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'personal'
                CHECK (scope IN ('personal', 'coach_shared')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_alias_exercise
    FOREIGN KEY (exercise_id)
    REFERENCES exercise_library(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_user_alias
    UNIQUE (user_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_aliases_user_id
  ON exercise_aliases(user_id);

CREATE INDEX IF NOT EXISTS idx_aliases_exercise_id
  ON exercise_aliases(exercise_id);

CREATE INDEX IF NOT EXISTS idx_aliases_scope_user
  ON exercise_aliases(user_id, scope);

-- Повнотекстовий пошук по alias (від 3 символів)
CREATE INDEX IF NOT EXISTS idx_aliases_alias_gin
  ON exercise_aliases USING gin(to_tsvector('simple', alias));

COMMENT ON TABLE exercise_aliases IS 'Власні назви (псевдоніми) вправ для пошуку: personal — тільки для власника, coach_shared — тренер + всі його учні';
