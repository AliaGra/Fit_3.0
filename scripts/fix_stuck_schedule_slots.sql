-- Діагностика та виправлення «слот не повернувся» у workout_schedule.
-- Виконуй у Supabase SQL Editor. Спочатку лише SELECT — переглянь рядки, потім UPDATE.

-- --- 1) ДІАГНОСТИКА (заміни COACH_ID якщо потрібно) ---
-- SELECT id, date, time, status, student_id, updated_at
-- FROM workout_schedule
-- WHERE coach_id = '797936608'
-- ORDER BY date, time;

-- Слоти, які бот не показує як вільні:
-- • CANCELED — старий баг cancelSlot
-- • AVAILABLE, але student_id не NULL — розсинхрон двох UPDATE
-- • BOOKED/REQUESTED — скасування не дійшло до БД (треба вирішувати вручну за id)

-- --- 2) Виправити CANCELED → вільний слот ---
UPDATE workout_schedule
SET status = 'AVAILABLE', student_id = NULL, updated_at = now()
WHERE status = 'CANCELED';

-- --- 3) Виправити AVAILABLE + залишений student_id ---
UPDATE workout_schedule
SET student_id = NULL, updated_at = now()
WHERE status = 'AVAILABLE' AND student_id IS NOT NULL;

-- --- 4) Якщо після скасування слот лишився BOOKED або REQUESTED (тільки якщо впевнений):
-- Знайди id у таблиці вище, потім:
-- UPDATE workout_schedule
-- SET status = 'AVAILABLE', student_id = NULL, updated_at = now()
-- WHERE id = 'ТУТ_UUID_СЛОТА';

-- --- 5) Відпустка: учні не бачать слоти на дні з coach_vacation_days.
-- SELECT * FROM coach_vacation_days WHERE coach_id = '797936608';
