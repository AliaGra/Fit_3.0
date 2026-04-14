# Handoff: довідник закладів (venues) і пошук — FIT 3.0

**Оновлено:** 2026-04-13  
**Репозиторій:** https://github.com/AliaGra/Fit_3.0 (гілка `main`)  
**Перед роботою:** `git pull` — останні релевантні коміти: `1be57cc` (venues MVP), `f061076` (план документації), `19555d3` (адмін: групові лише з довідника).

Цей файл — **контекст для нового чату**: продовження роботи з БД організацій, довідниками, пошуком закладів і адмін-сценарієм.

---

## Що вставити в перше повідомлення нового чату

```
Проєкт: FIT 3.0 (Node, Supabase, Railway). Довідник закладів (venues) — детальний handoff: HANDOFF_VENUES_AND_SEARCH.md у корені репо.

Останні коміти по темі: 1be57cc (venues + міграції + основний бот + адмін v1), 19555d3 (адмін: групові заняття — лише кнопки з довідника, без ручного вводу).

План з фазами і журналом: VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md. Таксономія кодів: fit_club_directory.md.
```

---

## Архітектура (коротко)

| Компонент | Файли / примітки |
|-----------|------------------|
| Дані | `lib/supabase.js` — `insertVenue`, `searchVenues`, `getVenueDirectoryCodes`, `linkCoachVenue`, `setUserPrimaryVenue`, … |
| Транслит пошуку назви | `lib/translitUa.js` |
| Основний бот | `lib/venues.js`, маршрутизація в `lib/router.js` (рання гілка `VENUES_*`, `REG_VENUE_*`, `PROFILE_COACH_VENUES`) |
| Меню / реєстрація / профіль | `lib/menu.js`, `lib/registration.js`, `lib/profile.js` |
| Адмін-бот | `lib/adminBot.js` + `lib/adminVenues.js`; webhook `POST /admin_webhook`; префікс callback **`ADM_V`** → спочатку `adminVenues.route` |
| Константи | `lib/constants.js` — FSM `venue_*`, `reg_venue_offer`; callbacks `VENUES_*`, тощо |
| Матриця callback | `CALLBACK_FSM_MODULE_MATRIX.md` v1.7 — пункт 1a (venues) + блок «Адмін-бот» |

---

## База даних (Supabase)

**Файли міграцій у репо (виконати в SQL Editor, якщо ще не застосовано):**

1. `supabase_migration_venues.sql` — `venues`, `venue_facets`, `venue_directory_codes` (порожня таблиця довідника до seed), `coach_venues`, `user_venues`, `venue_schedule`
2. `supabase_migration_venues_seed_directory.sql` — заповнення `venue_directory_codes` (organization, studio, section, group_class)

**Важливо:** якщо увімкнено **RLS**, потрібні політики для ролі `anon` (як у інших таблиць бота) — інакше insert/select з сервера впадуть.

---

## Змінні середовища

- Основний бот: `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Адмін-бот: `ADMIN_BOT_TOKEN`, **`ADMIN_CHAT_ID`** (лише цей chat_id бачить адмін-функції)

---

## Поведінка UX (що перевірити)

1. **Користувач:** Головне меню → **«Клуби, студії»** → гео (локація + радіус) або текст (область, місто, назва) → фільтр типу організації.
2. **Реєстрація:** після вибору міста — пропозиція знайти заклад / пізніше.
3. **Тренер:** Профіль → **«Де треную (заклади)»** — прив’язка до закладу з пошуку.
4. **Адмін:** Меню адміна → **«Заклади»** → додати заклад: після геолокації — тип організації → **групові заняття тільки кнопками** з довідника (пагінація, тогл, «Готово» / «Без групових»).

---

## Що залишилось / ідеї наступних кроків

- **Пошук у основному боті:** повноцінні фільтри **studio / section / group_class** в UI (у `searchVenues` закладено підтримку; у `venues.js` поки акцент на типі організації).
- **Узгодження** з `TZ_FitnessClubs_FIT3.md` (обладнання клубу / плани) — окреме рішення (**фаза 0.2** у `VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md`).
- **`venue_schedule` / bulk:** за потреби **документувати формат SQL-імпорту** для масового наповнення (фаза **8.1** плану); адмін-UI для розкладу групових і годин уже є.
- **Ціни в основному боті:** показ довідника цін учням (зараз лише адмін-редагування) — продуктове рішення.
- Незакомічені локальні зміни в інших файлах (наприклад `supabase_migration_ai_content.sql`) — не плутати з venues; комітити окремо за потреби.

**Зроблено з попереднього списку handoff:** редагування/картка існуючого закладу в адмін-боті (превʼю, поля, картка зі списку); відображення тренерів для учня (`PVCH`, профіль, публічна картка) — див. **`VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md` v1.3** та **`WORKLOG.md`** (квітень 2026).

---

## Документи проєкту

| Файл | Призначення |
|------|-------------|
| `VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md` | Покроковий план, статуси фаз, журнал комітів |
| `fit_club_directory.md` | Коди типів (organization, studio, section, group_class) |
| `CHANGELOG.md` | Зміни для користувача / реліз-нотатки |
| `Зміни_логіки_та_функціоналу.md` | Хронологія логіки |
| `CALLBACK_FSM_MODULE_MATRIX.md` | Порядок обробки callback у `router.js` + адмін-бот |

Загальний handoff старого зразка: **`HANDOFF_NEW_CHAT.md`** (інші модулі — розклад, body goals, AI тощо).
