-- ============================================
-- FIT 3.0 — додавання відсутніх груп у exercise_library
-- Виконати в Supabase SQL Editor ПОСЛЯ імпорту основних даних
-- ID 900001-900003 — зарезервовані під placeholder-и
-- ============================================

-- 1. Кардіо — у 1-шу групу (group_level1), інші комірки поки порожні
INSERT INTO exercise_library (id, group_level1, group_level2, group_level3, name_ua, name_ru, active)
VALUES (900001, 'Кардіо', NULL, NULL, 'Кардіо (вправи додаються)', 'Кардио (упражнения добавляются)', 'YES')
ON CONFLICT (id) DO UPDATE SET group_level1 = 'Кардіо', active = 'YES';

-- 2. Руки — додати в таблицю (group_level1 = 'Руки')
INSERT INTO exercise_library (id, group_level1, group_level2, group_level3, name_ua, name_ru, active)
VALUES (900002, 'Руки', NULL, NULL, 'Руки (вправи додаються)', 'Руки (упражнения добавляются)', 'YES')
ON CONFLICT (id) DO UPDATE SET group_level1 = 'Руки', active = 'YES';

-- 3. Передня дельта — під Плечі (group_level1='Плечі', group_level2='Передня дельта')
INSERT INTO exercise_library (id, group_level1, group_level2, group_level3, name_ua, name_ru, active)
VALUES (900003, 'Плечі', 'Передня дельта', NULL, 'Передня дельта (вправи додаються)', 'Передняя дельта (упражнения добавляются)', 'YES')
ON CONFLICT (id) DO UPDATE SET group_level1 = 'Плечі', group_level2 = 'Передня дельта', active = 'YES';
