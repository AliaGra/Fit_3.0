-- Діагностика: Ярослав Грачов / INVITE_82CD
-- Виконай у Supabase SQL Editor

-- 1) Рядок інвайту
SELECT user_id, chat_id, first_name, last_name, role, coach_id, created_at
FROM users
WHERE user_id ILIKE '%82CD%' OR chat_id ILIKE '%82CD%';

-- 2) За іменем (усі рядки, включно з технічними)
SELECT user_id, chat_id, first_name, last_name, role, created_at
FROM users
WHERE first_name ILIKE '%Ярослав%' OR last_name ILIKE '%Грачов%';

-- 3) Реальний Telegram-акаунт (має бути в «Користувачі»)
SELECT user_id, chat_id, first_name, last_name, role, created_at
FROM users
WHERE chat_id ~ '^\d+$'
  AND (first_name ILIKE '%Ярослав%' OR last_name ILIKE '%Грачов%');

-- 4) Виправити старі рядки (user_id лишився INVITE_*)
UPDATE users
SET user_id = chat_id
WHERE chat_id ~ '^\d+$'
  AND user_id ILIKE 'INVITE_%';
