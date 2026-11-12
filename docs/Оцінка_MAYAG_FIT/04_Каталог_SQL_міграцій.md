# Каталог SQL-міграцій MAYAG FIT

**Призначення:** фіксація **реальної еволюції** схеми поверх еталону `Supabase_створення_таблиць_FIT3.sql`.  
**Кількість файлів:** ~69 (`supabase_migration_*.sql` у корені репо).  
**Застосування:** вручну в Supabase SQL Editor (або скриптом); порядок — за залежностями домену.

---

## 1. Ядро користувачів і профілю

| Файл | Зміст (коротко) |
|------|-----------------|
| `supabase_migration_users_archived.sql` | Архів учнів `is_archived` |
| `supabase_migration_users_is_blocked.sql` | Блок користувача |
| `supabase_migration_users_telegram_username.sql` | Telegram username |
| `supabase_migration_users_accent_avoid_zones.sql` | Зони акценту/уникнення |
| `supabase_migration_users_coach_training_types.sql` | Типи тренувань тренера |
| `supabase_migration_users_coach_service_modes.sql` | Offline/online/programs |
| `supabase_migration_users_client_service_modes.sql` | Режими послуг клієнта |
| `supabase_migration_users_coach_group_training_details.sql` | Деталі групових |
| `supabase_migration_users_venues_location_notify.sql` | Підписка на нові заклади в місті |
| `supabase_migration_city_list_oblast.sql` | Області в city_list |
| `supabase_migration_user_activity_profile.sql` | Профіль активності / NEAT |
| `supabase_migration_user_medical_and_plan_fields.sql` | Медицина + поля плану в users |
| `supabase_migration_user_body_goals.sql` | Бажані параметри тіла |
| `supabase_migration_user_body_goals_add_goal_arm.sql` | goal_arm |
| `supabase_migration_goal_hips_glutes_comment.sql` | Коментар: goal_hips = glutes |
| `supabase_migration_body_type_and_fatpct.sql` | Тип фігури / % жиру |
| `supabase_migration_measurements_*.sql` | Розширення замірів (shoulders/chest/fat, neck/wrist, arm_flex) |
| `supabase_migration_accent_zones.sql` | Акцент-зони (повʼязані поля) |
| `supabase_migration_experience_training_sessions.sql` | Досвід / сесії |
| `supabase_migration_card_images.sql` | Фото/лого на картках |
| `supabase_migration_coach_documents.sql` | Документи освіти |
| `supabase_migration_user_custom_exercises.sql` | «Мої вправи» |
| `supabase_migration_user_cycle_settings.sql` | Налаштування циклу |
| `supabase_migration_cycle_symptoms_and_exercise_flags.sql` | Симптоми + флаги вправ |
| `supabase_migration_cycle_symptom_reminder.sql` | Нагадування симптомів |
| `supabase_migration_exercise_cycle_*` | Бекфіли / фіналізація флагів циклу |
| `supabase_migration_web_cabinet_onboarding.sql` | Веб-кабінет onboarding |

## 2. Бібліотека вправ

| Файл | Зміст |
|------|--------|
| `supabase_migration_exercise_library.sql` | Базова таблиця |
| `…_add_groups.sql` / `…_add_vid_difficulty.sql` | Групи, vid, складність |
| `…_medical_safety.sql` | Медичні поля безпеки |
| `supabase_migration_exercise_aliases.sql` | Псевдоніми |
| `supabase_migration_equipment_etap1.sql` | Нормалізація обладнання |

## 3. Плани та прогресія

| Файл | Зміст |
|------|--------|
| `supabase_migration_training_plans_v2.sql` | Плани v2 (uuid тощо) |
| `supabase_migration_training_plans_revision_fields.sql` | Поля ревізії |
| `supabase_migration_plan_revision_reminder.sql` | Reminder ревізії |
| `supabase_migration_progressive_plan.sql` | Прогресивний план |
| `supabase_migration_plan_adjustments.sql` | Коригування плану |

## 4. Розклад / тренування

| Файл | Зміст |
|------|--------|
| `supabase_migration_coach_schedule_settings.sql` | Налаштування графіка |
| `…_work_hours_by_weekday.sql` | Години по днях |
| `supabase_migration_coach_vacation_days.sql` | Відпустки |
| `supabase_migration_reschedule_from_slot.sql` | Перенос зі слота |
| `supabase_migration_bot_training_data_venue.sql` | venue_id у логах тренувань |
| `supabase_migration_reminders_sent.sql` / `…_reminders_24h.sql` | Дедуп нагадувань слотів (+24h kind) |

## 5. Заклади та абонементи

| Файл | Зміст |
|------|--------|
| `supabase_migration_venues.sql` (+ seed/moderation/phone/hours/amenities/facets/pricing) | Довідник закладів і атрибути |
| `supabase_migration_coach_venue_link_types.sql` | teaches/trains |
| `supabase_migration_venue_managers.sql` | Власники |
| `supabase_migration_coach_venue_owner_link.sql` | Звʼязок тренер–власник |
| `supabase_migration_coach_group_classes.sql` / `…_schedule.sql` | Групові заняття |
| `supabase_gym_subscriptions.sql` / `…_gym_subscriptions_venue.sql` | Абонементи залу |

## 6. Комунікації, відгуки, AI, адмін

| Файл | Зміст |
|------|--------|
| `supabase_migration_broadcast_ads.sql` | ads_opt_in + broadcast_log |
| `supabase_migration_broadcast_potential_v11.sql` | oblast у broadcast_log |
| `supabase_migration_birthday_reminders.sql` | Дедуп ДН-нагадувань |
| `supabase_migration_user_reviews.sql` | Відгуки |
| `supabase_migration_ai_content.sql` | ai_generated_content |
| `supabase_migration_admin_log.sql` | Журнал адміна |
| `supabase_migration_support_requests.sql` | Підтримка / заявки |

---

## 2. Для оцінки

- Міграції **інкрементальні** і доменні (не один моноліт) — типова зріла еволюція схеми.  
- Поруч існують one-time скрипти в `scripts/` (wipe, fix slots) — операційні, не частина звичайного деплою схеми.  
- Нові фічі (розсилка v1.1, ДН) додають **dedup/audit** таблиці, а не ламають ядро `users`.
