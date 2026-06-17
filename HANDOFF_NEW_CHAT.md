# Передача контексту для нового чату — FIT 3.0

**Дата оновлення handoff:** 03.06.2026  
**Проєкт:** Telegram-бот FIT 3.0 (Node.js, Railway, Supabase)  
**Репо:** https://github.com/AliaGra/Fit_3.0  
**Гілка:** `main` (перед новим чатом — `git pull`)

---

## Що вставити в перший меседж нового чату

```
Проєкт: FIT 3.0 (Node, Supabase, Railway). Handoff: @HANDOFF_NEW_CHAT.md

Останні коміти (main, червень 2026):
• 800f7a8 — власник закладу: картка тренера (PVCH) без інвайт-підказок і кнопок учня
• 6da6d83 — docs sync WORKLOG → CHANGELOG, Зміни_логіки, Бізнес-логіка, CALLBACK_FSM
• 537b296 — адмін: зняття власника закладу без видалення клубу (ADM_VOWN_RM, ADM_UVOWN)
• b35ff46 — «Клуби, студії»: пошук область/НП з city_list (VEN_LOC_OBL, VEN_LOC_CIT)
• 1207ab4 — головне меню: Умови користування за роллю (MENU_TERMS_OF_USE)
• 7c71f39 — роль venue_owner, фаза 0 (venue_managers, lib/venueOwner.js)

Міграції на Supabase (перевірити!):
• supabase_migration_venue_managers.sql — власник закладу (venue_managers)
• supabase_migration_user_custom_exercises.sql — «Мої вправи»

Доки: README, Бізнес-логіка v1.9, CALLBACK_FSM v1.11, Зміни_логіки, CHANGELOG, WORKLOG.

Заклади: @HANDOFF_VENUES_AND_SEARCH.md

Задача: [опиши що потрібно]
Не коммитити / не пушити без моєї просьби. Не додавати fit_nutrition_*.xlsx, ~$*.xlsx у git.
WORKLOG оновлюю окремими комітами після коду.
```

---

## Де суть проєкту (канон)

| Пріоритет | Документ | Навіщо |
|-----------|----------|--------|
| 1 | **README.md** | Стек, структура `lib/`, cron, посилання |
| 2 | **Бізнес-логіка_Gym_3_0_v1.1.md** (v1.9) | Продукт: ролі, інвайти, розклад, плани, venues, venue_owner |
| 3 | **CALLBACK_FSM_MODULE_MATRIX.md** (v1.11) | Callback → FSM → модуль; порядок у `lib/router.js` |
| 4 | **Схемы_технических_данных_v2.md** | Таблиці Supabase, зв’язки |
| 5 | **Зміни_логіки_та_функціоналу.md** | Хронологія змін по датах |
| 6 | **WORKLOG.md** | Робоча пам’ять + sha комітів |
| 7 | **CHANGELOG.md** | Коротко для користувача (Unreleased) |

**Операційно:** `DEPLOY.md` (Railway, env, webhook).  
**Заклади:** `VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md`, `HANDOFF_VENUES_AND_SEARCH.md`.

---

## Три боти (webhook)

| Бот | Webhook | Env | Модуль |
|-----|---------|-----|--------|
| Основний FIT 3.0 | `POST /webhook` | `BOT_TOKEN` | `lib/router.js` |
| Адмін | `POST /admin_webhook` | `ADMIN_BOT_TOKEN`, `ADMIN_CHAT_ID` | `lib/adminBot.js`, `lib/adminVenues.js` |
| Help / support | `POST /help_webhook` | `HELP_BOT_TOKEN` | `lib/helpBot.js` (інвайт-коди для beta) |

Деплой: `git push` → `main` → Railway перезапуск (~1–3 хв).

---

## Останнє на main (червень 2026)

### Власник закладу — роль `venue_owner` (фаза 0, `7c71f39` …)
- Реєстрація **🏢 Власник закладу**; прив’язка через адмін (`venue_managers`, `ADM_VOWN`).
- Меню: **Мій заклад**, **Тренери закладу**, **Клуби, студії**, **Зв’язок з розробником**; без «Мій профіль» і без 💡 підказок.
- Кабінет: `lib/venueOwner.js` — контакти, групові, прев’ю закладу (service role).
- **Міграція:** `supabase_migration_venue_managers.sql`.

### Власник: картка тренера (`800f7a8`)
- **Тренери закладу** → `PVCH`: без інвайт-тексту й кнопок учня; **До списку тренерів** (`VO_COACHES`).
- Реалізація: `lib/coach.js` → `showPublicVenueCoachCard` (перевірка `venue_owner`).

### Умови користування (`1207ab4`, `6922fb6`, `29a2ecd`, `f119b80`)
- **📜 Умови користування** у головному меню всіх ролей; `lib/termsOfUse.js`, `MENU_TERMS_OF_USE`.

### Пошук закладів (`b35ff46`)
- **Клуби, студії** → область/НП з `city_list` (`VEN_LOC_OBL`, `VEN_LOC_CIT`); окремо пошук за назвою.

### Адмін: зняття власника (`537b296`)
- **👑 Зняти власника** на картці закладу; **Зняти з закладу** на картці користувача.
- Заклад не видаляється; `venue_managers` delete; роль → `student` без інших прив’язок.

### Документація (`6da6d83`)
- Sync WORKLOG → `CHANGELOG`, `Зміни_логіки`, `Бізнес-логіка` v1.9, `CALLBACK_FSM` v1.11.

---

## Міграції — перевірити на Supabase

| Файл | Статус |
|------|--------|
| `supabase_migration_venue_managers.sql` | **Потрібна** для `venue_owner` |
| `supabase_migration_user_custom_exercises.sql` | **Потрібна** для «Мої вправи» |
| `supabase_migration_users_venues_location_notify.sql` | oblast/district (notify закладів) |
| `supabase_migration_venues.sql` + seed | довідник закладів |
| Інші `supabase_migration_*.sql` | за модулем — див. README / WORKLOG |

---

## Архітектура (коротко)

| Компонент | Деталь |
|-----------|--------|
| Runtime | Node.js ≥18, Railway |
| БД | Supabase (PostgreSQL), шар `lib/supabase.js` |
| Роутинг | `lib/router.js` — **перший збіг виграє** |
| FSM | `lib/state.js` + `lib/constants.js` |
| AI | `lib/ai/*`, `AI_ENABLED`, OpenAI gpt-4o-mini |

**Ключові модулі:** `registration.js`, `profile.js`, `coach.js`, `schedule.js`, `training.js`, `venues.js`, `venueOwner.js`, `termsOfUse.js`, `adminBot.js`, `adminVenues.js`, `helpBot.js`.

**Ролі:** `student`, `coach`, `venue_owner` (`lib/constants.js` → `ROLES`).

---

## Cron

- `GET /cron/reminders?secret=...` — нагадування учням (вікно ~2–3 год до слоту; `REMINDER_HOURS_BEFORE`)
- `GET /cron/plan-revision?secret=...` — ревізія плану тренеру
- `GET /cron/subscription-reminders?secret=...` — абонемент залу

Секрети: `DEPLOY.md`.

---

## Env (часто потрібні)

```
BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ADMIN_BOT_TOKEN, ADMIN_CHAT_ID
HELP_BOT_TOKEN
OPENAI_API_KEY, AI_ENABLED=true
COACH_VENUE_NOTIFY_DISABLED=1
VENUE_NEW_NOTIFY_DISABLED=1
CRON_SECRET / REMINDER_CRON_SECRET
```

---

## Відомі обмеження / не зроблено

- `venue_owner` — фаза 0: редагування цін/розкладу через адміна, не в боті.
- Імпорт вправи з каталогу в «Мої вправи» — без UI.
- Рядки `USED_INVITE_*` у `users` можуть лишатись (приховані в адмінці).
- Модуль **харчування** — в обговоренні, не в проді.
- Не комітити: `fit_nutrition_*.xlsx`, `~$*.xlsx`, локальні `.docx` чернетки.

---

## Ключові callbacks (додатково)

```
# Власник закладу
VO_HUB, VO_COACHES, VO_CONTACTS, VO_GROUPS, PVCH (перегляд тренера)
ADM_VOWN, ADM_VOWN_RM, ADM_UVOWN

# Умови
MENU_TERMS_OF_USE

# Заклади (користувач)
VEN_LOC_OBL, VEN_LOC_CIT, VENUES_NAME_SEARCH, VENUES_MENU, PVCH

# Інвайти / цикл / мої вправи — див. CALLBACK_FSM_MODULE_MATRIX.md
```
