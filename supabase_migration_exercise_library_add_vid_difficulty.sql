-- ============================================
-- FIT 3.0 — додати колонки vid, difficulty до exercise_library
-- Виконати якщо таблиця вже створена і потрібно лише додати нові поля
-- vid: базова, изоляция, стабилизация, растяжка
-- difficulty: высокая, средняя, низкая
-- ============================================

ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS vid text,
  ADD COLUMN IF NOT EXISTS difficulty text;
