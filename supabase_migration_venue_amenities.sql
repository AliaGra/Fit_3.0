-- FIT 3.0: "Що є в закладі" (amenities/features) як теги venue_facets
-- 1) Додає новий kind='amenity' у venue_directory_codes
-- 2) Дозволяє facet_kind='amenity' у venue_facets
-- 3) Сідить базові amenity коди

-- 1) venue_directory_codes.kind CHECK: додати 'amenity'
ALTER TABLE public.venue_directory_codes
  DROP CONSTRAINT IF EXISTS venue_directory_codes_kind_check;

ALTER TABLE public.venue_directory_codes
  ADD CONSTRAINT venue_directory_codes_kind_check
  CHECK (kind IN ('organization', 'studio', 'section', 'group_class', 'amenity'));

-- 2) venue_facets.facet_kind CHECK: додати 'amenity'
ALTER TABLE public.venue_facets
  DROP CONSTRAINT IF EXISTS venue_facets_facet_kind_check;

ALTER TABLE public.venue_facets
  ADD CONSTRAINT venue_facets_facet_kind_check
  CHECK (facet_kind IN ('studio', 'section', 'group_class', 'amenity'));

-- 3) Seed amenity codes (мінімальний стартовий список)
INSERT INTO public.venue_directory_codes (kind, code, label_ua) VALUES
('amenity', 'gym_area', 'Тренажерна зала'),
('amenity', 'group_classes', 'Групові заняття'),
('amenity', 'pool', 'Басейн'),
('amenity', 'sauna', 'Баня/сауна'),
('amenity', 'hamam', 'Хамам'),
('amenity', 'massage', 'Масаж'),
('amenity', 'sport_hall', 'Зал (ігровий/універсальний)'),
('amenity', 'spa', 'SPA'),
('amenity', 'play_area', 'Ігрова зона'),
('amenity', 'parking', 'Парковка'),
('amenity', 'cafe', 'Кафе')
ON CONFLICT (kind, code) DO NOTHING;

