-- Таблиця абонементів залу (опційно заповнюється користувачем у меню «Абонемент»).
-- Запустити в Supabase SQL Editor один раз.

CREATE TABLE IF NOT EXISTS gym_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  amount NUMERIC(10,2),
  is_unlimited BOOLEAN NOT NULL DEFAULT false,
  trainings_count INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminder_sent_3_days BOOLEAN NOT NULL DEFAULT false,
  reminder_sent_2_days BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_gym_subscriptions_chat_id ON gym_subscriptions(chat_id);
CREATE INDEX IF NOT EXISTS idx_gym_subscriptions_end_date ON gym_subscriptions(end_date);
