-- Seed: venue_directory_codes з fit_club_directory.md
-- Виконати після supabase_migration_venues.sql

INSERT INTO public.venue_directory_codes (kind, code, label_ua) VALUES
('organization', 'fitness_club', 'Фітнес-клуб'),
('organization', 'sport_club', 'Спортивний клуб'),
('organization', 'studio', 'Студія'),
('organization', 'section', 'Секція'),
('organization', 'gym', 'Тренажерна зала'),
('organization', 'pool', 'Басейн'),
('organization', 'sport_complex', 'Спортивний комплекс'),
('organization', 'rehabilitation_center', 'Реабілітаційний центр'),
('organization', 'sport_school', 'Спортивна школа (ДЮСШ)'),
('organization', 'wellness_center', 'Велнес-центр'),
('organization', 'spa_center', 'СПА-центр')
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO public.venue_directory_codes (kind, code, label_ua) VALUES
('studio', 'pilates_studio', 'Студія пілатесу'),
('studio', 'yoga_studio', 'Студія йоги'),
('studio', 'dance_studio', 'Танцювальна студія'),
('studio', 'stretching_studio', 'Студія стретчингу'),
('studio', 'barre_studio', 'Студія барре'),
('studio', 'aerial_studio', 'Студія повітряної гімнастики'),
('studio', 'pole_studio', 'Пол-денс студія'),
('studio', 'functional_studio', 'Студія функціонального тренінгу'),
('studio', 'ems_studio', 'EMS-студія'),
('studio', 'boxing_studio', 'Студія боксу / кікбоксингу'),
('studio', 'martial_arts_studio', 'Студія єдиноборств'),
('studio', 'crossfit_box', 'Кросфіт-бокс'),
('studio', 'trx_studio', 'TRX-студія'),
('studio', 'rehabilitation_studio', 'Реабілітаційна студія'),
('studio', 'prenatal_studio', 'Студія для вагітних'),
('studio', 'kids_studio', 'Дитяча спортивна студія')
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO public.venue_directory_codes (kind, code, label_ua) VALUES
('section', 'boxing_section', 'Секція боксу'),
('section', 'wrestling_section', 'Секція боротьби'),
('section', 'swimming_section', 'Секція плавання'),
('section', 'gymnastics_section', 'Секція гімнастики'),
('section', 'athletics_section', 'Секція легкої атлетики'),
('section', 'football_section', 'Секція футболу'),
('section', 'volleyball_section', 'Секція волейболу'),
('section', 'basketball_section', 'Секція баскетболу'),
('section', 'tennis_section', 'Секція тенісу')
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO public.venue_directory_codes (kind, code, label_ua) VALUES
('group_class', 'zumba', 'Зумба'),
('group_class', 'dance_mix', 'Танцювальний мікс'),
('group_class', 'latino', 'Латино'),
('group_class', 'hip_hop', 'Хіп-хоп'),
('group_class', 'strip_dance', 'Стрип-денс'),
('group_class', 'pole_dance', 'Пол-денс'),
('group_class', 'body_pump', 'Памп / Body Pump'),
('group_class', 'kettlebell', 'Гирьовий фітнес'),
('group_class', 'crossfit', 'Кросфіт'),
('group_class', 'functional', 'Функціональне тренування'),
('group_class', 'ems_group', 'EMS груповий'),
('group_class', 'circuit_training', 'Колове тренування'),
('group_class', 'trx', 'TRX'),
('group_class', 'cycling', 'Сайклінг / Спінінг'),
('group_class', 'aerobics', 'Аеробіка'),
('group_class', 'step_aerobics', 'Степ-аеробіка'),
('group_class', 'interval', 'HIIT'),
('group_class', 'jumping', 'Джампінг'),
('group_class', 'aqua_aerobics', 'Аквааеробіка'),
('group_class', 'stretching', 'Стретчинг'),
('group_class', 'flexibility', 'Гнучкість'),
('group_class', 'splits', 'Шпагат'),
('group_class', 'foam_rolling', 'Міофасціальний реліз'),
('group_class', 'yoga', 'Йога'),
('group_class', 'pilates', 'Пілатес'),
('group_class', 'barre', 'Барре'),
('group_class', 'body_balance', 'Боді-баланс'),
('group_class', 'tai_chi', 'Тай-чі'),
('group_class', 'qigong', 'Цигун'),
('group_class', 'meditation', 'Медитація'),
('group_class', 'boxing_group', 'Бокс груповий'),
('group_class', 'kickboxing', 'Кікбоксинг'),
('group_class', 'mma_group', 'MMA груповий'),
('group_class', 'karate', 'Карате'),
('group_class', 'self_defense', 'Самооборона'),
('group_class', 'prenatal', 'Для вагітних'),
('group_class', 'postnatal', 'Після пологів'),
('group_class', 'kids_fitness', 'Дитячий фітнес'),
('group_class', 'senior_fitness', 'Фітнес 50+'),
('group_class', 'rehabilitation', 'Реабілітація'),
('group_class', 'back_health', 'Здорова спина')
ON CONFLICT (kind, code) DO NOTHING;
