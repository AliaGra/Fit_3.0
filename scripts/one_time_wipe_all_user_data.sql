-- =============================================================================
-- ОДНОРАЗОВА ПОВНА ОЧИСТКА ДАНИХ КОРИСТУВАЧІВ (FIT 3.0)
-- =============================================================================
-- Видаляє: users, записи тренувань, розклад, плани, тарифи, стан бота, медпрофіль
-- тощо — усе, що привʼязане до користувачів бота.
--
-- НЕ чіпає довідники: city_list, exercise_library, equipment (якщо є).
--
-- УВАГА: операція НЕЗВОРОТНА. Зробіть backup (Supabase → Database → Backups)
-- або pg_dump перед запуском.
--
-- Виконання: Supabase → SQL Editor → вставити весь файл → Run.
-- =============================================================================

BEGIN;

-- Звільнити посилання users → training_plans (якщо колонка є)
DO $$
BEGIN
  UPDATE users SET active_plan_id = NULL WHERE active_plan_id IS NOT NULL;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'Колонка users.active_plan_id відсутня — пропущено.';
END $$;

-- Розклад: спочатку залежності від слотів
DO $$
BEGIN
  DELETE FROM reminders_sent;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця reminders_sent відсутня — пропущено.';
END $$;

-- Якщо є self-FK на reschedule_from_slot_id — обнулити перед масовим видаленням
UPDATE workout_schedule SET reschedule_from_slot_id = NULL WHERE reschedule_from_slot_id IS NOT NULL;

DELETE FROM workout_schedule;

-- Плани (від залежностей до батьківської таблиці)
DO $$
BEGIN
  DELETE FROM training_plan_weeks;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця training_plan_weeks відсутня — пропущено.';
END $$;

DELETE FROM training_plan_exercises;

DO $$
BEGIN
  DELETE FROM plan_adjustments;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця plan_adjustments відсутня — пропущено.';
END $$;

DELETE FROM training_plans;

-- Тарифи та налаштування тренера (coach_id = chat_id)
DELETE FROM pricing;
DO $$
BEGIN
  DELETE FROM coach_schedule_settings;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця coach_schedule_settings відсутня — пропущено.';
END $$;
DO $$
BEGIN
  DELETE FROM coach_vacation_days;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця coach_vacation_days відсутня — пропущено.';
END $$;

-- Абонемент залу (меню «Абонемент»)
DO $$
BEGIN
  DELETE FROM gym_subscriptions;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця gym_subscriptions відсутня — пропущено.';
END $$;

DO $$
BEGIN
  DELETE FROM exercise_aliases;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця exercise_aliases відсутня — пропущено.';
END $$;

-- Записи тренувань (підходи, ваги) та історія замірів
DELETE FROM bot_training_data;
DELETE FROM measurements_history;

-- AI (аналітика зберігалась по entity_id = chat_id)
DO $$
BEGIN
  DELETE FROM ai_generated_content;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця ai_generated_content відсутня — пропущено.';
END $$;

-- Цілі тіла / медичний профіль (залежності від users)
DELETE FROM user_body_goals;
DO $$
BEGIN
  DELETE FROM user_medical_conditions;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця user_medical_conditions відсутня — пропущено.';
END $$;

-- FSM бота
DELETE FROM bot_state;

-- Логи (опційно; якщо таблиця є)
DO $$
BEGIN
  DELETE FROM logs;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Таблиця logs відсутня — пропущено.';
END $$;

-- Користувачі — останніми
DELETE FROM users;

COMMIT;

-- Для перевірки після запуску:
-- SELECT COUNT(*) FROM users;
-- SELECT COUNT(*) FROM bot_training_data;
