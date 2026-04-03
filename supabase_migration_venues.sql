-- FIT 3.0: довідник закладів (клуби, студії, секції)
-- Застосувати після наявності public у проєкті.
-- Координати обовʼязкові; адреса опційна (див. бізнес-логіку в боті).

-- Довідник кодів з fit_club_directory.md (наповнюється seed-файлом)
CREATE TABLE IF NOT EXISTS public.venue_directory_codes (
  kind text NOT NULL CHECK (kind IN ('organization', 'studio', 'section', 'group_class')),
  code text NOT NULL,
  label_ua text NOT NULL,
  PRIMARY KEY (kind, code)
);

CREATE INDEX IF NOT EXISTS venue_directory_codes_kind_idx ON public.venue_directory_codes (kind);

COMMENT ON TABLE public.venue_directory_codes IS 'Таксономія типів закладів і занять (FIT довідник)';

-- Заклади
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name_ua text NOT NULL,
  oblast text NOT NULL,
  city text NOT NULL,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  telegram_url text,
  instagram_url text,
  organization_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_operator_chat_id text,
  CONSTRAINT venues_lat_range CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT venues_lng_range CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX IF NOT EXISTS venues_oblast_city_idx ON public.venues (oblast, city);
CREATE INDEX IF NOT EXISTS venues_active_idx ON public.venues (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS venues_lat_lng_idx ON public.venues (latitude, longitude);

COMMENT ON TABLE public.venues IS 'Заклад: координати з Telegram (обовʼязково), адреса — опційно';
COMMENT ON COLUMN public.venues.organization_type IS 'Код з venue_directory_codes(kind=organization)';

-- Теги: студія / секція / групове заняття (many-to-many)
CREATE TABLE IF NOT EXISTS public.venue_facets (
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  facet_kind text NOT NULL CHECK (facet_kind IN ('studio', 'section', 'group_class')),
  code text NOT NULL,
  PRIMARY KEY (venue_id, facet_kind, code)
);

CREATE INDEX IF NOT EXISTS venue_facets_kind_code_idx ON public.venue_facets (facet_kind, code);

-- Тренер ↔ заклади
CREATE TABLE IF NOT EXISTS public.coach_venues (
  coach_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_chat_id, venue_id)
);

CREATE INDEX IF NOT EXISTS coach_venues_venue_idx ON public.coach_venues (venue_id);

-- Користувач ↔ обрані заклади (реєстрація / профіль)
CREATE TABLE IF NOT EXISTS public.user_venues (
  user_chat_id text NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_chat_id, venue_id)
);

CREATE INDEX IF NOT EXISTS user_venues_venue_idx ON public.user_venues (venue_id);

-- Розклад (MVP: лише схема + ручний SQL-імпорт; UI бота пізніше)
-- weekday: ISO 8601 — 1=Пн … 7=Нд
CREATE TABLE IF NOT EXISTS public.venue_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  time_start time,
  time_end time,
  title text,
  group_class_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venue_schedule_venue_idx ON public.venue_schedule (venue_id);

COMMENT ON TABLE public.venue_schedule IS 'Розклад закладу: імпорт SQL, без UI бота на етапі 1';
