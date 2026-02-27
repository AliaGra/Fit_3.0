-- Крок 1: Перевірка — які інвайти є в БД і чи coach_id = NULL.
-- Запусти це в SQL Editor, щоб зрозуміти, чому дані не видалились.
-- Якщо в колонці coach_id є значення (не порожньо) — попередній скрипт їх не чіпав (видаляв тільки при coach_id IS NULL).

SELECT chat_id, coach_id, first_name, last_name, created_at
FROM users
WHERE chat_id LIKE 'INVITE_%'
ORDER BY created_at DESC;
