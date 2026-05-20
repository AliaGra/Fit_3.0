# Передача контексту для нового чату — FIT 3.0

**Дата оновлення handoff:** 19.05.2026  
**Проєкт:** Telegram-бот FIT 3.0 (Node.js, Railway, Supabase)  
**Репо:** https://github.com/AliaGra/Fit_3.0  
**Гілка:** `main` (перед новим чатом — `git pull`)

---

## Що вставити в перший меседж нового чату

```
Проєкт: FIT 3.0 (Node, Supabase, Railway). Handoff: @HANDOFF_NEW_CHAT.md

Останні коміти (main, травень 2026):
• 8ed0a12 — адмін-бот: «Користувачі» без дубля після активації інвайту (фільтр user_id INVITE_%)
• 336510c — реєстрація: intro циклу/менопаузи; профіль «Цикл і менопауза»; роль Тренер→Учень
• fd40667 — «Мої вправи» + ручний план (custom_exercise_id)
• e92e07a — notify: тренер прив’язав заклад → користувачі з user_venues
• 1be26af — notify нового закладу за oblast/city/district

Міграція на Supabase (перевірити!): supabase_migration_user_custom_exercises.sql — для «Мої вправи».

Доки синхронізовані: CHANGELOG, Зміни_логіки, Бізнес-логіка v1.8, CALLBACK_FSM v1.10, WORKLOG.

Заклади (venues) — окремо: @HANDOFF_VENUES_AND_SEARCH.md

Задача: [опиши що потрібно]
Не коммитити / не пушити без моєї просьби. Не додавати fit_nutrition_*.xlsx у git.
```

---

## Де суть проєкту (канон)

| Пріоритет | Документ | Навіщо |
|-----------|----------|--------|
| 1 | **README.md** | Стек, структура `lib/`, cron, посилання |
| 2 | **Бізнес-логіка_Gym_3_0_v1.1.md** (v1.8) | Продукт і правила: реєстрація, інвайти, розклад, плани, профіль |
| 3 | **CALLBACK_FSM_MODULE_MATRIX.md** (v1.10) | Callback → FSM → модуль; порядок у `lib/router.js` |
| 4 | **Схемы_технических_данных_v2.md** | Таблиці Supabase, зв’язки |
| 5 | **Зміни_логіки_та_функціоналу.md** | Хронологія змін по датах |
| 6 | **WORKLOG.md** | Що зроблено в розробці + sha комітів |
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

## Останнє на main (травень 2026)

### Адмін-бот — дубль у «Користувачі» (`8ed0a12`)
- Після `replaceInviteWithChatId` у БД: реальний user + заготовка `USED_INVITE_*`.
- **👥 Користувачі** / статистика: `adminRealUsersQuery()` — без `user_id LIKE 'INVITE_%'`.
- Активні коди — лише **🔑 Інвайти**.

### Реєстрація / профіль — цикл (`336510c`)
- Після **Жінка** → `REG_CYCLE_INTRO` (зараз / пізніше).
- Профіль (жінка): **🌸 Цикл і менопауза** (`PROFILE_EDIT_CYCLE`, `PROFILE_CY_*`, `CY_ST`…).
- Роль на `/start`: **Тренер** → **Учень**.

### «Мої вправи» (`fd40667`)
- `💪 Тренування → ⭐ Мої вправи` — `lib/myExercises.js`.
- Ручний план: `PLAN_EXERCISE:c_<uuid>`, `PLAN_GROUP:__myex__`.
- **Міграція:** `supabase_migration_user_custom_exercises.sql` (таблиця `user_custom_exercises`, колонка `training_plan_exercises.custom_exercise_id`).
- Не в UI: імпорт з каталогу в бібліотеку; авто-план custom не підмішує.

### Notify: тренер у закладі (`e92e07a`)
- Перша `linkCoachVenue` → `lib/coachVenueNotify.js` → користувачі з `user_venues`.
- `COACH_VENUE_NOTIFY_DISABLED=1` — вимкнути.

### Notify: новий заклад (`1be26af`)
- Після збереження закладу в адміні → `lib/venueNewNotify.js` за `oblast+city(+district)`.

### Інвайти (загальне)
- Help-бот: оператор генерує універсальний `INVITE_*`.
- Активація: гейт оферти → `activateInvite` / `linkCoachByInviteCode`.
- Node: `replaceInviteWithChatId` — INSERT реального user + перенос FK; заготовка → `USED_*`.

---

## Міграції — перевірити на Supabase

| Файл | Статус |
|------|--------|
| `supabase_migration_user_custom_exercises.sql` | **Потрібна** для «Мої вправи» |
| `supabase_migration_users_venues_location_notify.sql` | oblast/district (notify закладів) |
| `supabase_migration_coach_schedule_work_hours_by_weekday.sql` | різний час по днях |
| `supabase_migration_user_body_goals.sql` | бажані параметри + goals_analysis |
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

**Ключові модулі:** `registration.js`, `profile.js`, `coach.js`, `schedule.js`, `training.js`, `trainingPlan.js`, `planGenerator.js`, `venues.js`, `bodyGoals.js`, `myExercises.js`, `adminBot.js`, `helpBot.js`.

**Матриця callback:** `CALLBACK_FSM_MODULE_MATRIX.md` v1.10 — на початку файлу порядок Node у `router.js` (venues п.1a, `MY_EX_*` п.2a, Registration, Coach, Profile, Schedule…).

---

## Довідник закладів (venues)

Окремий handoff: **`HANDOFF_VENUES_AND_SEARCH.md`** (коміти, callback `VENUES_*`, `ADM_V*`, deep link `venue_<id>`, `pvch_<chatId>`).

---

## Cron (Railway / зовнішній scheduler)

- `GET /cron/reminders?secret=...` — нагадування учням
- `GET /cron/plan-revision?secret=...` — ревізія плану тренеру
- `GET /cron/subscription-reminders?secret=...` — абонемент залу

Секрети: `DEPLOY.md`.

---

## Env (часто потрібні)

```
BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY
ADMIN_BOT_TOKEN, ADMIN_CHAT_ID
HELP_BOT_TOKEN
OPENAI_API_KEY, AI_ENABLED=true   # опційно
COACH_VENUE_NOTIFY_DISABLED=1    # вимкнути notify тренера в закладі
VENUE_NEW_NOTIFY_DISABLED=1      # якщо є — вимкнути notify нового закладу
```

---

## Що перевірити після змін

1. **Інвайт:** help → код → основний бот → оферта → активація → в адміні **один** користувач (`8ed0a12`).
2. **Мої вправи:** міграція виконана → додати вправу → ручний план → `custom_exercise_id` у БД.
3. **Цикл:** жінка-учень/тренер — intro «пізніше» / «зараз»; профіль → Цикл і менопауза.
4. **Notify закладу:** тренер прив’язує заклад → push користувачам з «Мої заклади».
5. **AI-аналітика після invite:** `entity_id` оновлюється в `replaceInviteWithChatId` — для нових учнів має працювати; старі — після оновлення замірів.

---

## Реалізовано раніше (стисло — body goals + AI)

Деталі в `WORKLOG` / `Бізнес-логіка` §7a–7c.

- **`user_body_goals`** — бажані параметри (тренер invite/картка, реєстрація); `lib/bodyGoals.js`, `analyzeGoalsVsCurrentState`.
- **`ai_generated_content`** — body_analysis; `lib/ai/bodyAnalysis.js`; кнопки `AI_ANALYTICS`, `COACH_AI_ANALYTICS`.
- **Teen-режим:** `users.teen_mode`, `confirmed_by_parent`, `age_group`.
- **`lib/ai/goalsVsCurrent.js`** — AI-переказ аналізу цілей.

---

## Розклад тренера (березень 2026 — актуально)

- **Різний час по днях:** `work_hours_by_weekday`, міграція `supabase_migration_coach_schedule_work_hours_by_weekday.sql`; підпис дня — `WEEKDAY_LONG_UA_MON0`.
- **Мій розклад:** вікно 21 день; **Вільні слоти** — текст на 3 дні + «Інші вільні слоти».
- **Календар:** BOOKED — 3 кнопки в ряд; перерва — «Відмінити»; легенда 🟡.
- Док.: `Бізнес-логіка` §4.4.5–4.4.8, `CALLBACK_FSM` блоки SCH_*.

---

## Відомі обмеження / не зроблено

- Імпорт вправи з каталогу в «Мої вправи» (`source_exercise_id`) — без UI.
- Custom-вправи не в авто-генерації плану (лише ручний підбір).
- Рядки `USED_INVITE_*` у `users` можуть лишатись у БД (приховані в адмінці).
- **AI_ENABLED=false** → кнопка «AI-аналітика» покаже «ще не сформована» (очікувано).
- Модуль **харчування** — в обговоренні, не в проді.
- Не комітити: `fit_nutrition_full_145.xlsx`, `~$*.xlsx`.

---

## Ключові callbacks (додатково до матриці)

```
# Цикл (реєстрація)
REG_CYCLE_INTRO, REG_CYCLE_FILL_NOW, REG_CYCLE_FILL_LATER
CY_ST, CY_LEN, CY_BLD, CY_LSKP

# Цикл (профіль)
PROFILE_EDIT_CYCLE, PROFILE_CYCLE_EDIT_LEN, PROFILE_CYCLE_EDIT_BLEED
PROFILE_CY_LEN, PROFILE_CY_BLD

# Мої вправи
MY_EX_MENU, MY_EX_ADD, MY_EX_LIST, MY_EX_G:*, MY_EX_ITEM:*
PLAN_GROUP:__myex__, PLAN_EXERCISE:c_<uuid>

# AI / goals (раніше)
AI_ANALYTICS, COACH_AI_ANALYTICS, COACH_BODY_GOALS
```

---

## Підключення AI

Railway: `OPENAI_API_KEY`, `AI_ENABLED=true`, `AI_MODEL=gpt-4o-mini`.  
Покроково: **Підключення_AI_покроково.md**, **AI_Integration_FIT3_Basic.md**.
