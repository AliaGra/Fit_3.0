-- FIT 3.0: додати номер телефону закладу
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.venues.phone IS 'Телефон закладу (для копіювання/контакту)';

