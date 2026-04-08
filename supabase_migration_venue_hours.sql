-- FIT 3.0: графік роботи закладу (working hours)
-- По днях тижня (ISO 1=Пн … 7=Нд). На день — один інтервал або "вихідний".

CREATE TABLE IF NOT EXISTS public.venue_hours (
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  is_closed boolean NOT NULL DEFAULT false,
  time_open time,
  time_close time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, weekday),
  CONSTRAINT venue_hours_time_required CHECK (
    (is_closed = true AND time_open IS NULL AND time_close IS NULL) OR
    (is_closed = false AND time_open IS NOT NULL AND time_close IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS venue_hours_venue_idx ON public.venue_hours (venue_id);

COMMENT ON TABLE public.venue_hours IS 'Графік роботи закладу по днях тижня (1..7). Один інтервал на день або "вихідний".';

