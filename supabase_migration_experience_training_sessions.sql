-- Унікальні зафіксовані тренування для нарахування досвіду (кожні 8 → +1 міс. до experience_start_date)
-- Запускати в Supabase SQL editor після деплою коду бота.

CREATE TABLE IF NOT EXISTS experience_training_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experience_training_session_events_chat_event UNIQUE (chat_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_experience_training_session_events_chat
  ON experience_training_session_events (chat_id);

COMMENT ON TABLE experience_training_session_events IS 'Дедуплікація зафіксованих тренувань для +досвіду: слот розкладу, завершення вільного тренування, завершення дня плану без слота.';
