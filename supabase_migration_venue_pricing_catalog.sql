-- FIT 3.0: інформативний довідник цін закладу (без оплат у боті).
-- Джерело правди: venue. Тренер у «Клубах» бачить окремо лише свої ставки з таблиці pricing.
--
-- Покриває для тестового залу:
-- 1) Групові — своя ціна на кожен напрям (код з venue_directory_codes kind=group_class).
-- 2) Абонементи в тренажерний зал — різні тарифи: N відвідувань/міс або безліміт, своя ціна.
-- 3) Індивід / спліт / тріо — не дублюємо тут; показ у боті з існуючої pricing (coach_id [, student_id]).
-- 4) Інше: оренда рушника, заморозка абонемента — фіксовані позиції з ціною.

-- ---------------------------------------------------------------------------
-- 1) Групові заняття: ціна на кожен group_class_code у межах закладу
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_group_class_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  group_class_code text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'UAH',
  label_ua text NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, group_class_code)
);

CREATE INDEX IF NOT EXISTS idx_venue_group_class_prices_venue
  ON public.venue_group_class_prices (venue_id) WHERE is_active = true;

COMMENT ON TABLE public.venue_group_class_prices IS 'Інформативні ціни групових; код з venue_directory_codes(kind=group_class)';
COMMENT ON COLUMN public.venue_group_class_prices.label_ua IS 'Опційна підпис замість довідника (рідкісні виключення)';

-- ---------------------------------------------------------------------------
-- 2) Абонементи в зал (тренажерна): ціна залежить від ліміту відвідувань/міс або безліміт
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_gym_membership_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  label_ua text NOT NULL,
  trainings_per_month int NULL,
  is_unlimited boolean NOT NULL DEFAULT false,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'UAH',
  billing_period text NOT NULL DEFAULT 'month' CHECK (billing_period IN ('month')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_gym_membership_offers_limit_chk CHECK (
    (is_unlimited = true AND trainings_per_month IS NULL)
    OR (is_unlimited = false AND trainings_per_month IS NOT NULL AND trainings_per_month > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_venue_gym_membership_offers_venue
  ON public.venue_gym_membership_offers (venue_id) WHERE is_active = true;

COMMENT ON TABLE public.venue_gym_membership_offers IS 'Тарифи абонемента в зал: N разів на місяць або безліміт';
COMMENT ON COLUMN public.venue_gym_membership_offers.trainings_per_month IS 'Якщо is_unlimited=false — скільки тренувань у місяць включено';

-- ---------------------------------------------------------------------------
-- 4) Інші послуги закладу (рушник, заморозка тощо)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_ancillary_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  service_code text NOT NULL,
  label_ua text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'UAH',
  unit text NOT NULL DEFAULT 'one_time' CHECK (unit IN ('one_time', 'per_visit', 'per_month')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, service_code)
);

CREATE INDEX IF NOT EXISTS idx_venue_ancillary_services_venue
  ON public.venue_ancillary_services (venue_id) WHERE is_active = true;

COMMENT ON TABLE public.venue_ancillary_services IS 'Додаткові платні послуги залу (інформативно)';
COMMENT ON COLUMN public.venue_ancillary_services.service_code IS 'Напр. towel_rental, membership_freeze';

-- Рекомендовані коди для сіду в застосунку / адмінці:
-- towel_rental — оренда рушника
-- membership_freeze — заморозка абонемента
