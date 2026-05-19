-- Персональна бібліотека вправ користувача (будь-яка роль)
CREATE TABLE IF NOT EXISTS public.user_custom_exercises (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_chat_id       text NOT NULL REFERENCES public.users(chat_id) ON DELETE CASCADE,
  name_ua             text NOT NULL,
  source_exercise_id  integer REFERENCES public.exercise_library(id) ON DELETE SET NULL,
  group_level1        text,
  group_level2        text,
  group_level3        text,
  coach_medical_note  text,
  video_url           text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_custom_exercises_owner_idx
  ON public.user_custom_exercises (owner_chat_id, is_active);

CREATE INDEX IF NOT EXISTS user_custom_exercises_owner_group_idx
  ON public.user_custom_exercises (owner_chat_id, group_level1, group_level2, group_level3);

-- Зв'язок ручного плану з персональною вправою
ALTER TABLE public.training_plan_exercises
  ADD COLUMN IF NOT EXISTS custom_exercise_id uuid REFERENCES public.user_custom_exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS training_plan_exercises_custom_idx
  ON public.training_plan_exercises (custom_exercise_id)
  WHERE custom_exercise_id IS NOT NULL;

COMMENT ON TABLE public.user_custom_exercises IS 'Персональні вправи користувача; owner_chat_id — власник (student/coach)';
COMMENT ON COLUMN public.user_custom_exercises.coach_medical_note IS 'Примітка тренера; для учня в автологіці плану не використовується';
COMMENT ON COLUMN public.training_plan_exercises.custom_exercise_id IS 'Посилання на user_custom_exercises; exercise_id може бути NULL';
