# Промпт для нового чату — MAYAG FIT

**Оновлено:** 10.11.2026 (синхрон з `main` + handoff `83c7dbb`)  
Скопіюй **один** блок нижче в перше повідомлення. Деталі — `HANDOFF_NEW_CHAT.md`.

**Документація після змін коду:**

`WORKLOG.md` (чернетка) → **`Зміни_логіки_та_функціоналу.md`** (обовʼязково після коміту на `main`) → за потреби `CHANGELOG.md`.

---

## A) Загальний (рекомендований)

```
Проєкт: MAYAG FIT — Telegram-бот (Node.js, Supabase, Railway).
Репо: https://github.com/AliaGra/Fit_3.0
Робоча папка: d:\Fit 3.0 vs2.0
Перед роботою: git pull origin main

Читати в такому порядку:
1. .cursorrules
2. HANDOFF_NEW_CHAT.md + PROMPT_NEW_CHAT.md (цей файл)
3. Бізнес-логіка_Gym_3_0_v1.1.md — продукт і статус модулів
4. Зміни_логіки_та_функціоналу.md — що ВЖЕ змінено в логіці/UI (хронологія, SHA, файли)
5. CALLBACK_FSM_MODULE_MATRIX.md — callback → FSM → модуль
6. WORKLOG.md — що в роботі зараз
7. DEPLOY.md — Railway, env, webhook

Деплой прод: тільки push у `main` (Railway ~1–3 хв). Інші гілки без merge у `main` прод не оновлюють.

origin/main (листопад 2026, орієнтир):
• ecbe310 — картка клієнта, хаб «Програма» / параметри тіла
• 2faa40f…5f71a5a — хаби картки, публічна картка, інвайт
• dcc4832 — web cabinet (/start web_*, таблиця web_cabinet_onboarding)
• 898c0ed, f34f8bd, dd56b62 — підказки/робочий час, «клієнт» у UI тренера
• 83c7dbb — handoff-доки для нових чатів

Локально: git status — можливі незакомічені перейменування FIT3→MAYAG_FIT; не змішувати з кодовими комітами без плану.

Правила коду:
• UI українською; callback_data з `:`; константи тільки lib/constants.js
• Без GAS для прод-логіки; *.gs лише бібліотека вправ
• Не parse_mode: Markdown для динамічних імен/дат з `_`

Git:
• За замовчуванням — не commit/push, поки я явно не попрошу («закоміть», «пуш», «да» на коміт).
• Якщо прошу commit/push — роби сам і одразу (окремий коміт, без .env і сміття).

Після МОЇХ комітів на main (або після твого push за моєю просьбою):
• онов WORKLOG + блок у Зміни_логіки_та_функціоналу.md (+ CHANGELOG якщо реліз).

Моя задача в цьому чаті:
[екран / роль / очікувана vs фактична поведінка / міграція SQL? / deploy?]
```

---

## B) Реєстрація тренера з сайту (web cabinet) — legacy

```
Проєкт: MAYAG FIT. HANDOFF_NEW_CHAT.md → «Web cabinet».

11.11.2026: сайт-кабінет і кнопка в меню бота зняті. Не відновлювати посилання на cabinet.html у UI/Навігаторі.

Ланцюжок (legacy): раніше mayag.fit/cabinet.html → токен → Telegram /start web_<token> → анкета тренера.
Код legacy: lib/registration.js, lib/router.js, lib/supabase.js; таблиця web_cabinet_onboarding.

Задача: [опиши]
Commit/push — лише за моєю просьбою або «роби сам».
```

---

## C) Довідник закладів (venues)

```
Проєкт: MAYAG FIT. HANDOFF_VENUES_AND_SEARCH.md + VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md + fit_club_directory.md.

Код: lib/venues.js, lib/adminVenues.js; VENUES_*; адмін ADM_V* (POST /admin_webhook).

Після комітів: Зміни_логіки_та_функціоналу.md.

Задача: [пошук / таксономія / адмін / coach venues]
```

---

## D) Розклад / підказки тренера

```
Проєкт: MAYAG FIT. .cursorrules + CALLBACK_FSM_MODULE_MATRIX.md.

Код: lib/schedule.js, lib/coachHints.js, lib/coachFirstSteps.js, lib/coach.js.
На main: 898c0ed (текст після збереження робочого часу), f34f8bd (Назад/Підказки на новому інтервалі), dd56b62 (клієнт vs учень у меню тренера).

Задача: [опиши]
```

---

## E) Тільки документація

```
Проєкт: MAYAG FIT. Не чіпай lib/ без запиту.

Потік: WORKLOG (draft) → після shipped на main — новий розділ у Зміни_логіки_та_функціоналу.md (дата, зміст, SHA, файли, міграції) → за потреби CHANGELOG Unreleased.

Handoff: HANDOFF_NEW_CHAT.md. Статус модулів: Бізнес-логіка_Gym_3_0_v1.1.md.

Задача: [що оновити після коміту ...]
Якщо кажу «коміт/пуш» — зроби сам.
```

---

## F) Продовження після попереднього чату

```
Проєкт: MAYAG FIT. Продовження розробки.

1. git pull origin main
2. HANDOFF_NEW_CHAT.md + Зміни_логіки_та_функціоналу.md (розділи з датою сьогодні/вчора)
3. WORKLOG.md — «Поточна робота»

Попередній контекст (коротко): [встав 2–5 рядків або посилання на задачу]

Нова підзадача: [опиши]
```
