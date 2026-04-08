-- FIT 3.0: локальні назви групових занять лише для одного закладу (не з довідника).
-- Виконати після supabase_migration_venues.sql

ALTER TABLE public.venue_facets
  ADD COLUMN IF NOT EXISTS label_ua text;

COMMENT ON COLUMN public.venue_facets.label_ua IS 'Для group_class: підпис, якщо code починається з local_ (унікальний для закладу). Для кодів з venue_directory_codes — NULL.';
