-- Web cabinet onboarding: temporary website request linked to a Telegram account.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.web_cabinet_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  phone text NOT NULL,
  chat_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contact_confirmed', 'completed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  contact_confirmed_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS web_cabinet_onboarding_chat_idx
  ON public.web_cabinet_onboarding (chat_id);

CREATE INDEX IF NOT EXISTS web_cabinet_onboarding_expires_idx
  ON public.web_cabinet_onboarding (expires_at);

ALTER TABLE public.web_cabinet_onboarding ENABLE ROW LEVEL SECURITY;
