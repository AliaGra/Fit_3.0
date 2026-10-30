-- Відгуки тренер ↔ клієнт (дзеркально). Модерація адміном перед публікацією.
-- Запустити в Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_chat_id text NOT NULL,
  target_chat_id text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz NULL,
  moderated_by text NULL,
  CONSTRAINT user_reviews_author_target_unique UNIQUE (author_chat_id, target_chat_id),
  CONSTRAINT user_reviews_no_self CHECK (author_chat_id <> target_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reviews_target_status
  ON public.user_reviews (target_chat_id, status);

CREATE INDEX IF NOT EXISTS idx_user_reviews_status_created
  ON public.user_reviews (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reviews_author
  ON public.user_reviews (author_chat_id);

ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.user_reviews;
CREATE POLICY "Allow all for anon" ON public.user_reviews
  FOR ALL USING (true) WITH CHECK (true);
