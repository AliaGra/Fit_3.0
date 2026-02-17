-- ============================================
-- FIT 3.0 — перший етап планів тренувань (Логіка складання плану тренувань.md)
-- 11.1 Таблиця user_medical_conditions
-- 11.4 Додати поля до таблиці users: training_days_per_week, active_plan_id
-- Виконати в Supabase SQL Editor
-- ============================================

-- 11.1 Таблиця user_medical_conditions
CREATE TABLE IF NOT EXISTS user_medical_conditions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id       text NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  mc_code       text NOT NULL,
  severity      text NOT NULL,
  notes         text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz,
  UNIQUE (chat_id, mc_code)
);

CREATE INDEX IF NOT EXISTS idx_user_medical_conditions_chat_active
  ON user_medical_conditions(chat_id, is_active);

-- 11.4 Додати поля до таблиці users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_days_per_week integer,
  ADD COLUMN IF NOT EXISTS active_plan_id uuid;

-- Примітка: FK active_plan_id REFERENCES training_plans(plan_id) додати після
-- міграції training_plans на uuid plan_id (розд. 11.2 документа).
