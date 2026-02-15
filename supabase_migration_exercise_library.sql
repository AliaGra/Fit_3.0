-- ============================================
-- FIT 3.0 — міграція exercise_library (нова структура)
-- Виконати в Supabase SQL Editor
-- Після виконання: запустити експорт з Sheets → імпорт
-- ============================================

-- Видаляємо стару таблицю (дані будуть втрачені — імпортуємо з Sheets)
DROP TABLE IF EXISTS exercise_library CASCADE;

-- Нова структура: 3 рівні груп + name_ua, name_ru
-- vid: базова, изоляция, стабилизация, растяжка
-- difficulty: высокая, средняя, низкая
CREATE TABLE exercise_library (
  id              integer PRIMARY KEY,
  group_level1    text,
  group_level2    text,
  group_level3    text,
  name_ua         text,
  name_ru         text,
  equipment       text,
  active          text,
  focus_point     text,
  common_mistakes text,
  proper_feeling  text,
  static_holds    text,
  youtube_link    text,
  my_channel_link text,
  vid             text,  -- вид: базова, изоляция, стабилизация, растяжка
  difficulty      text   -- сложность: высокая, средняя, низкая
);

ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON exercise_library FOR ALL USING (true) WITH CHECK (true);
