# Передача контексту для нового чату — MAYAG FIT

**Дата оновлення handoff:** 06.11.2026  
**Проєкт:** Telegram-бот MAYAG FIT (Node.js, Railway, Supabase)  
**Репо:** https://github.com/AliaGra/Fit_3.0  
**Гілка деплою:** `main` (перед новим чатом — `git pull origin main`)  
**Важливо:** пуш лише в `deploy/*` **не** оновлює прод. Railway слухає **`main`**.

---

## Що вставити в перший меседж нового чату

```
Проєкт: MAYAG FIT (Node, Supabase, Railway). Handoff: @HANDOFF_NEW_CHAT.md

Останні коміти (main, 05–06.11.2026):
• 2faa40f — картка клієнта: хаби Програма / Формат·тариф / Звіт·Аналітика
• 5f71a5a — інвайт: без публічної картки / відгуку до активації
• df1eafe — публічна картка клієнта: імʼя+ініціал, стать, вік, формат, клуб
• 8a4198e — реєстрація без району; інвайт клієнта «Прізвище Імʼя»
• a51c717 — тренер ↔ власник: заявка адміну + перемикач меню (role=coach)
• 36721dc — фото/лого на публічних картках (тренер/клієнт/заклад)
• 70b4594…bf2d53f — коротка оферта + mayag.fit/oferta.html, welcome UX

Міграції на Supabase (перевірити!):
• supabase_migration_card_images.sql
• supabase_migration_coach_venue_owner_link.sql
• (раніше) supabase_migration_user_reviews.sql, venue_managers, тощо

Доки: README, Бізнес-логіка v1.11, Зміни_логіки, CHANGELOG, WORKLOG.
Заклади: @HANDOFF_VENUES_AND_SEARCH.md

Задача: [опиши що потрібно]
Не коммитити / не пушити без моєї просьби. Після коду — push саме в main для Railway.
```

---

## Де суть проєкту (канон)

| Пріоритет | Документ | Навіщо |
|-----------|----------|--------|
| 1 | **README.md** | Стек, структура `lib/`, cron |
| 2 | **Бізнес-логіка_Gym_3_0_v1.1.md** (v1.11) | Продукт: ролі, інвайти, розклад, venues, dual coach-owner |
| 3 | **CALLBACK_FSM_MODULE_MATRIX.md** | Callback → FSM → модуль |
| 4 | **Схемы_технических_данных_v2.md** | Таблиці Supabase |
| 5 | **Зміни_логіки_та_функціоналу.md** | Хронологія змін |
| 6 | **WORKLOG.md** | Робоча памʼять |
| 7 | **CHANGELOG.md** | Коротко для користувача |

**Операційно:** `DEPLOY.md` (Railway, env, webhook).  
**Заклади:** `VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md`, `HANDOFF_VENUES_AND_SEARCH.md`.

---

## Три боти (webhook)

| Бот | Webhook | Env | Модуль |
|-----|---------|-----|--------|
| Основний MAYAG FIT | `POST /webhook` | `BOT_TOKEN` | `lib/router.js` |
| Адмін | `POST /admin_webhook` | `ADMIN_BOT_TOKEN`, `ADMIN_CHAT_ID` | `lib/adminBot.js`, `lib/adminVenues.js` |
| Help / support | `POST /help_webhook` | `HELP_BOT_TOKEN` | `lib/helpBot.js` |

Деплой: `git push origin main` → Railway (~1–3 хв).

---

## Останнє на main (05–06.11.2026)

### 1) Аватари / фото (`36721dc`)
- Тренер: фото **або** лого; клієнт: фото; заклад: лого.
- `lib/cardImages.js`; міграція `supabase_migration_card_images.sql`.

### 2) Тренер + власник (`a51c717`)
- Заявка з меню тренера → адмін **🏢 Заявки власника (тренер)**.
- `role` лишається `coach`; доступ через `venue_managers` + `active_menu_mode`.
- `lib/coachOwnerLink.js`; міграція `supabase_migration_coach_venue_owner_link.sql`.

### 3) Картка клієнта — хаби меню (`2faa40f`)
- **Програма тренувань** (`COACH_STU_PROG`), **Формат / тариф** (`COACH_STU_FMT`), **Звіт / Аналітика** (`COACH_STU_RPT`).
- План тільки в Програмі; «Обміри/Медицина/Досвід» з центру прибрано.

### 4) Публічна картка клієнта / інвайт (`df1eafe`, `5f71a5a`, `8a4198e`)
- Розширений зміст + приховування для неактивованого інвайту.
- Реєстрація без району; додавання клієнта — **Прізвище Імʼя**.

### 5) Оферта / welcome (`bf2d53f`…`70b4594`)
- Коротка оферта + сайт; welcome без зайвого intro/ракети.

---

## Міграції, які мають бути в Supabase

Обовʼязково для фіч листопада:
1. `supabase_migration_card_images.sql`
2. `supabase_migration_coach_venue_owner_link.sql`

Якщо колонок/таблиць немає — фічі в боті падають або мовчки не зберігають дані.
