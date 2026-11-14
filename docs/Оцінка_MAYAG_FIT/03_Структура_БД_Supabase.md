# Структура бази даних Supabase — огляд для оцінки

**Еталон створення:** `Supabase_створення_таблиць_FIT3.sql`  
**Еволюція:** каталог міграцій — [04_Каталог_SQL_міграцій.md](./04_Каталог_SQL_міграцій.md)  
**СУБД:** PostgreSQL (Supabase), доступ з бота через `@supabase/supabase-js` (`lib/supabase.js`).

---

## 1. Домени сутностей (групи)

### Користувачі та профіль
- `users` — центральна сутність (роль, coach_id, місто/область, заміри, зони, ads_opt_in, архів/блок, фото картки…)
- `users.coach_training_types` — `personal` / `split` / `trio` / `group` (legacy `individual` → personal+split+trio)
- `users.coach_service_modes` — `offline` / `online` / `programs` / **`nutrition`**
- `bot_state` — FSM JSON по chat_id
- `measurements_history` — історія замірів
- `user_body_goals` — бажані параметри (`goal_hips` = ягодиці)
- `user_medical_conditions` — медичний профіль учня
- `user_activity_profile` / поля активності в users
- `user_cycle_settings` + симптоми циклу
- `user_custom_exercises` — персональна бібліотека
- `coach_documents` — документи освіти (file_id Telegram)

### Тренування та плани
- `exercise_library` — каталог вправ + медичні поля
- `exercise_aliases` — псевдоніми
- `training_plans` / `training_plan_exercises` — плани
- `bot_training_data` — логи підходів (вага/повтори/set, venue_id)
- `workout_schedule` — слоти розкладу
- `pricing` — тарифи тренера (default + per-student)
- `coach_schedule_settings` / vacation
- `coach_group_classes` — групові тренера (картка `local_*`, опис/ціна/архів; `moderation_status`: draft/pending/published/rejected/`archive_pending`/`restore_pending`)
- `coach_group_schedule` — розклад групових тренера

### Заклади
- `venues` (+ moderation, phone, hours, amenities, pricing catalog…)
- `venue_facets` — типи групових **на картці клубу** (не глобальний довідник платформи)
- `coach_venues` — звʼязок тренер↔заклад (teaches = «Де треную» / trains = «Де тренуюсь»)
- `user_venues` — «Мої заклади» користувача
- `venue_managers` — власники/менеджери
- `gym_subscriptions` (+ offers) — абонементи з venue_id

### Комунікації / модерація / AI
- `broadcast_log` — журнал розсилок
- `birthday_reminders_sent` — дедуп ДН
- `reminders_sent` — дедуп нагадувань про слоти
- `coach_inquiries` — звернення з публічної картки (не клієнт → тренер); `open`/`answered`; `reminder_sent_at`
- `users.coach_inquiry_auto_reply` — автовідповідь на звернення (default true)
- `user_reviews` — відгуки + модерація
- `ai_generated_content` — лог AI
- `admin_log`, `support_requests`, `logs`

### Довідники
- `city_list` — міста/області України (пошук при реєстрації)

---

## 2. Ключові звʼязки

```
users (coach) 1───* users (student via coach_id)
users 1───* training_plans / workout_schedule / bot_training_data
users *───* venues via coach_venues | user_venues | venue_managers
training_plans 1───* training_plan_exercises → exercise_library
workout_schedule (coach_id, student_id, status)
gym_subscriptions (chat_id, venue_id)
user_reviews (author_chat_id → target_chat_id)
```

Ідентифікатор користувача в боті: **Telegram chat_id** (string).  
Незавершені інвайти: `INVITE_*` як chat_id до активації.

---

## 3. Оцінка складності даних

| Критерій | Оцінка |
|----------|--------|
| Кількість таблиць у продакшені | десятки (ядро + venues + plans + comms + AI) |
| Звʼязки | багато-до-багатьох (venues), ієрархії (плани/вправи), часові ряди (schedule, measurements, training_data) |
| FSM | JSON у `bot_state` (висока гнучкість, потреба дисципліни констант) |
| Медицина | структуровані коди + severity у профілі та бібліотеці |
| Ідемпотентність cron | окремі dedup-таблиці (reminders, birthday, flags на subscriptions) |

RLS у міграціях зазвичай дозволяє anon для серверного доступу бота (ключ на Railway) — операційна модель «backend-only».
