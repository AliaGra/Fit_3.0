# Промпт для нового чату — MAYAG FIT

**Оновлено:** 10.11.2026  
Скопіюй **один** блок нижче в перше повідомлення нового чату. Деталі — у `HANDOFF_NEW_CHAT.md`.

---

## A) Загальний (рекомендований)

```
Проєкт: MAYAG FIT — Telegram-бот (Node.js, Supabase, Railway). Робоча папка: d:\Fit 3.0 vs2.0

ОБОВʼЯЗКОВО прочитай перед змінами:
• .cursorrules
• HANDOFF_NEW_CHAT.md (контекст, гілки, міграції, останні фічі)
• Бізнес-логіка_Gym_3_0_v1.1.md + CALLBACK_FSM_MODULE_MATRIX.md — для callback/FSM
• Зміни_логіки_та_функціоналу.md — хронологія ВПРОВАДЖЕНИХ змін (доповнювати після моїх комітів на main)
• WORKLOG.md — чернетка під час роботи; після shipped — також блок у «Зміни логіки»

Деплой: лише гілка `main` на Railway (`git push origin main`). Feature-гілки самі по собі прод не оновлюють.

Останній tip `origin/main` (листопад 2026): ecbe310 — хаб «Програма» на картці клієнта; раніше 2faa40f хаби картки, 5f71a5a інвайт, web onboarding dcc4832 (`/start web_*`, `web_cabinet_onboarding`).

Локально (перевір git status!): можуть бути НЕЗАКОМІЧЕНІ перейменування доків FIT3→MAYAG_FIT і дрібні правки коментарів у lib/ai/* — не комітити всього разом без узгодження.

Правила:
• Українська в UI бота; callback через `:`; константи лише в lib/constants.js
• Не git commit / push без моєї явної просьби
• Після моїх комітів — за потреби: WORKLOG + Зміни_логіки_та_функціоналу.md (+ CHANGELOG якщо реліз)

Моя задача в цьому чаті:
[ОПИШИ ТУТ: екран, роль, очікувана поведінка, чи потрібен deploy]
```

---

## B) Реєстрація тренера з сайту (web cabinet)

```
Проєкт: MAYAG FIT. Handoff: HANDOFF_NEW_CHAT.md (розділ «Web cabinet»).

Фіча: mayag.fit/cabinet.html → токен 15 хв → Telegram `/start web_<token>` → підтвердження контакту → реєстрація тренера → витринка на сайті.

Код: lib/registration.js (`startWebOnboarding`, `handleWebContactMessage`), lib/router.js, lib/supabase.js; FSM `REG_WEB_CONTACT`; міграція `supabase_migration_web_cabinet_onboarding.sql`.

Env: `SUPABASE_SERVICE_ROLE_KEY` для сайту/бекенду (див. DEPLOY.md, WORKLOG draft 2026-08-28).

Статус: перевірити міграцію в Supabase + E2E; WORKLOG — status draft, commit раніше був dcc4832 (гілка злита в main).

Задача: [наприклад: допиляти повернення на сайт / edge cases / тест-план / merge]
Не комітити без моєї просьби.
```

---

## C) Довідник закладів (venues)

```
Проєкт: MAYAG FIT. Детальний handoff: HANDOFF_VENUES_AND_SEARCH.md + VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md.

Код: lib/venues.js, lib/adminVenues.js, lib/translitUa.js; callbacks `VENUES_*`, адмін `ADM_V*`.

Задача: [пошук / таксономія / адмін / coach venues]
Канон: fit_club_directory.md, міграції venue_* у корені репо.
```

---

## D) Розклад / підказки тренера

```
Проєкт: MAYAG FIT. Handoff: HANDOFF_NEW_CHAT.md.

Нещодавно на main: підказки після збереження робочого часу (898c0ed); кнопки Назад/Підказки при новому інтервалі (f34f8bd); термін «клієнт» для тренера (dd56b62). Код: lib/schedule.js, lib/coachHints.js, lib/coachFirstSteps.js.

Задача: [опиши]
Дотримуйся .cursorrules і CALLBACK_FSM_MODULE_MATRIX.md.
```

---

## E) Тільки документація / WORKLOG

```
Проєкт: MAYAG FIT. Онови документацію після комітів користувача: WORKLOG.md, за потреби CHANGELOG.md і Зміни_логіки_та_функціоналу.md (правило: у CHANGELOG лише shipped/ready).

Останній handoff: HANDOFF_NEW_CHAT.md. Не чіпай lib/ без запиту.
```
