-- Бажані параметри тіла (цільові заміри)
CREATE TABLE IF NOT EXISTS user_body_goals (
  chat_id        text PRIMARY KEY REFERENCES users(chat_id) ON DELETE CASCADE,
  goal_weight    decimal(5,2),
  goal_waist     decimal(5,1),
  goal_hips      decimal(5,1),
  goal_shoulders decimal(5,1),
  goal_chest     decimal(5,1),
  set_by_coach   text REFERENCES users(chat_id),
  goals_analysis jsonb,
  analysis_date  timestamptz,
  updated_at     timestamptz DEFAULT now()
);

COMMENT ON TABLE user_body_goals IS 'Цільові (бажані) параметри тіла; set_by_coach = NULL якщо вказав сам користувач при реєстрації';
