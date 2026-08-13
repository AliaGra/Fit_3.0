-- Нагадування клієнту за 24 год і за 2 год: дедуп (slot_id, kind, slot_key)
-- slot_key = дата+час слота; після переносу на новий час 24h можна надіслати знову
-- Date: 2026-08-13

ALTER TABLE IF EXISTS public.reminders_sent
  ADD COLUMN IF NOT EXISTS kind text;

ALTER TABLE IF EXISTS public.reminders_sent
  ADD COLUMN IF NOT EXISTS slot_key text;

UPDATE public.reminders_sent
SET kind = '2h'
WHERE kind IS NULL OR btrim(kind) = '';

UPDATE public.reminders_sent rs
SET slot_key = to_char((ws.date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
  || '|'
  || CASE
    WHEN coalesce(ws.time, '') ~ '^\d{1,2}:\d{2}'
      THEN lpad(split_part(ws.time, ':', 1), 2, '0')
        || ':'
        || substr(split_part(ws.time, ':', 2), 1, 2)
    ELSE coalesce(left(ws.time, 5), '')
  END
FROM public.workout_schedule ws
WHERE (rs.slot_key IS NULL OR btrim(rs.slot_key) = '')
  AND ws.id::text = rs.slot_id::text;

UPDATE public.reminders_sent
SET slot_key = 'legacy'
WHERE slot_key IS NULL OR btrim(slot_key) = '';

ALTER TABLE public.reminders_sent
  ALTER COLUMN kind SET DEFAULT '2h';

ALTER TABLE public.reminders_sent
  ALTER COLUMN kind SET NOT NULL;

ALTER TABLE public.reminders_sent
  ALTER COLUMN slot_key SET DEFAULT '';

ALTER TABLE public.reminders_sent
  ALTER COLUMN slot_key SET NOT NULL;

DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.reminders_sent'::regclass
      AND con.contype IN ('p', 'u')
      AND pg_get_constraintdef(con.oid) ILIKE '%(slot_id)%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.reminders_sent DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders_sent' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.reminders_sent ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;
END $$;

UPDATE public.reminders_sent SET id = gen_random_uuid() WHERE id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reminders_sent'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.reminders_sent ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.reminders_sent ADD PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_sent_slot_kind_key_uidx
  ON public.reminders_sent (slot_id, kind, slot_key);

COMMENT ON COLUMN public.reminders_sent.kind IS '2h | 24h';
COMMENT ON COLUMN public.reminders_sent.slot_key IS 'YYYY-MM-DD|HH:MM слота на момент відправки; зміна часу = нове нагадування';
