-- Одноразова очистка: видалити з БД усі дані по інвайт-кодах (INVITE_*).
--
-- Варіант A: тільки «відвʼязані» (coach_id IS NULL) — були видалені з архіву до нової логіки.
-- Варіант B: ВСІ інвайти (INVITE_*) — незалежно від coach_id.
--
-- Виконання: Supabase → SQL Editor → вставити один з блоків → Run.
-- Змінна inv_chat_id (не id) щоб уникнути конфлікту з колонками id у таблицях.

-- ========== ВАРІАНТ A: тільки coach_id IS NULL ==========
/*
DO $$
DECLARE
  invite_ids text[] := ARRAY(
    SELECT chat_id FROM users
    WHERE chat_id LIKE 'INVITE_%' AND coach_id IS NULL
  );
  inv_chat_id text;
BEGIN
  IF array_length(invite_ids, 1) IS NULL THEN
    RAISE NOTICE 'Немає записів для очистки (coach_id IS NULL).';
    RETURN;
  END IF;
  RAISE NOTICE 'Знайдено % інвайт-записів для видалення.', array_length(invite_ids, 1);
  FOREACH inv_chat_id IN ARRAY invite_ids
  LOOP
    DELETE FROM training_plan_exercises WHERE plan_id IN (SELECT plan_id FROM training_plans WHERE student_id = inv_chat_id);
    DELETE FROM training_plans WHERE student_id = inv_chat_id;
    DELETE FROM reminders_sent WHERE slot_id IN (SELECT id FROM workout_schedule WHERE student_id = inv_chat_id);
    DELETE FROM workout_schedule WHERE student_id = inv_chat_id;
    DELETE FROM bot_training_data WHERE chat_id = inv_chat_id;
    DELETE FROM pricing WHERE student_id = inv_chat_id;
    DELETE FROM user_medical_conditions WHERE chat_id = inv_chat_id;
    DELETE FROM measurements_history WHERE chat_id = inv_chat_id;
    DELETE FROM bot_state WHERE chat_id = inv_chat_id;
    DELETE FROM ai_generated_content WHERE entity_id = inv_chat_id;
    DELETE FROM users WHERE chat_id = inv_chat_id;
    RAISE NOTICE 'Видалено: %', inv_chat_id;
  END LOOP;
  RAISE NOTICE 'Готово.';
END $$;
*/

-- ========== ВАРІАНТ B: ВСІ інвайти (INVITE_*) ==========
DO $$
DECLARE
  invite_ids text[] := ARRAY(
    SELECT chat_id FROM users WHERE chat_id LIKE 'INVITE_%'
  );
  inv_chat_id text;
BEGIN
  IF array_length(invite_ids, 1) IS NULL THEN
    RAISE NOTICE 'Немає записів INVITE_%% для видалення.';
    RETURN;
  END IF;
  RAISE NOTICE 'Знайдено % інвайт-записів для видалення (всі INVITE_%%).', array_length(invite_ids, 1);
  FOREACH inv_chat_id IN ARRAY invite_ids
  LOOP
    DELETE FROM training_plan_exercises WHERE plan_id IN (SELECT plan_id FROM training_plans WHERE student_id = inv_chat_id);
    DELETE FROM training_plans WHERE student_id = inv_chat_id;
    DELETE FROM reminders_sent WHERE slot_id IN (SELECT id FROM workout_schedule WHERE student_id = inv_chat_id);
    DELETE FROM workout_schedule WHERE student_id = inv_chat_id;
    DELETE FROM bot_training_data WHERE chat_id = inv_chat_id;
    DELETE FROM pricing WHERE student_id = inv_chat_id;
    DELETE FROM user_medical_conditions WHERE chat_id = inv_chat_id;
    DELETE FROM measurements_history WHERE chat_id = inv_chat_id;
    DELETE FROM bot_state WHERE chat_id = inv_chat_id;
    DELETE FROM ai_generated_content WHERE entity_id = inv_chat_id;
    DELETE FROM users WHERE chat_id = inv_chat_id;
    RAISE NOTICE 'Видалено: %', inv_chat_id;
  END LOOP;
  RAISE NOTICE 'Готово.';
END $$;
