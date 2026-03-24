-- Разове виправлення після старої логіки cancelSlot (status = CANCELED замість AVAILABLE).
-- Виконати в Supabase SQL Editor. Переглянути перед UPDATE:
-- SELECT id, coach_id, date, time, status, student_id FROM workout_schedule WHERE status = 'CANCELED';

UPDATE workout_schedule
SET
  status = 'AVAILABLE',
  student_id = NULL,
  updated_at = now()
WHERE status = 'CANCELED';
