# Передача контексту для нового чату — FIT 3.0

**Дата оновлення handoff:** 22.03.2026 (доповнено: див. **HANDOFF_VENUES_AND_SEARCH.md** — довідник закладів, квітень 2026)  
**Проєкт:** Telegram-бот FIT 3.0 (Node.js, Railway, Supabase)  
**Репо:** https://github.com/AliaGra/Fit_3.0  
**Гілка:** `main` (перед новим чатом — `git pull`)

---

## Довідник закладів (venues) — 2026-04

Окремий handoff з комітами, БД, callback і дорожньою картою: **`HANDOFF_VENUES_AND_SEARCH.md`**.

---

## Що вставити в перший меседж нового чату (коротко)

```
Проєкт: FIT 3.0 (Node, Supabase, Railway). Детальний handoff: HANDOFF_NEW_CHAT.md у корені репо.

Довідник закладів (venues) — окремий контекст: HANDOFF_VENUES_AND_SEARCH.md (коміти 1be57cc, 19555d3; план VENUES_DIRECTORY_IMPLEMENTATION_PLAN.md).

Останні зміни (березень 2026):
• Розклад тренера: різний робочий час по днях (work_hours_by_weekday) — міграція supabase_migration_coach_schedule_work_hours_by_weekday.sql має бути виконана в Supabase.
• Фікс: підпис дня при введенні часу в «Різний час по днях» — WEEKDAY_LONG_UA_MON0 (Пн–Нд), не WEEKDAY_LONG_UA.
• Документація синхронізована: Бізнес-логіка §4.4.5–4.4.8 (є §4.4.6a «Додати слоти на день»), CALLBACK_FSM_MODULE_MATRIX.md (v1.7 — порядок Node у `lib/router.js`, зокрема гілка venues п.1a та блок адмін-бота), Зміни_логіки_та_функціоналу.md.

Попередній фокус: body goals + AI body analysis — див. розділи нижче в HANDOFF_NEW_CHAT.md.
```

---

## Архітектура (коротко)

| Компонент | Деталь |
|-----------|--------|
| Runtime | Node.js, хостинг Railway |
| БД | Supabase (PostgreSQL) |
| Бот | Telegram Bot API (webhook POST /webhook) |
| AI | OpenAI API (gpt-4o-mini), опційно через AI_ENABLED |
| Модулі | `lib/` — router, coach, registration, profile, training, schedule, user, supabase, constants, bodyGoals, bodyType, bodyMetrics, medicalProfile, medicalFilter тощо |
| AI-модулі | `lib/ai/` — aiClient, aiPrompts, bodyAnalysis, goalsVsCurrent, planComments, smartReminder, failureAnalysis |

### Callbacks і FSM (канон Node)

- **Файл:** `CALLBACK_FSM_MODULE_MATRIX.md` (**v1.6**, 22.03.2026).
- **Роутинг:** єдине джерело порядку обробки — **`lib/router.js`**, на початку матриці — розділ **«Node.js: порядок у lib/router.js»** (ранні гілки на кшталт `COACH_BOOK`, `REG_NEW`, `HISTORY_MENU` / `HIST_*` тощо; **Coach + Pricing** — через `Coach`, не через `Registration`).
- Застарілий псевдокод **GAS / `Router.gs`** у матриці залишено лише з позначкою legacy; на проді його не використовувати.

---

## Що реалізовано в цьому чаті (нові функції)

### 1. Бажані параметри тіла (`user_body_goals`)
**Таблиця Supabase:**
```
user_body_goals (
  chat_id        text PK → users(chat_id) ON DELETE CASCADE,
  goal_weight    numeric,
  goal_waist     numeric,
  goal_hips      numeric,
  goal_shoulders numeric,
  goal_chest     numeric,
  set_by_coach   text → users(chat_id),
  goals_analysis jsonb,      ← кеш аналізу цілей
  analysis_date  timestamptz,
  updated_at     timestamptz
)
```
**Міграції:**
- `supabase_migration_user_body_goals.sql` — створення таблиці  
- `ALTER TABLE user_body_goals ADD COLUMN IF NOT EXISTS goals_analysis jsonb, analysis_date timestamptz;` — виконано в Supabase

**Потоки введення цілей:**
1. **Тренер при invite** — після зон уникнення → 5 питань (вага, талія, ягодиці, плечі, груди), кожне з «Пропустити». FSM: `invite_body_goals_weight` … `invite_body_goals_chest`.
2. **Тренер у картці учня** — кнопка «🎯 Бажані параметри» → 5 питань. Блокується якщо немає зросту. FSM: `coach_body_goals_weight` … `coach_body_goals_chest`.
3. **Реєстрація (учень/тренер)** — перед `finishRegistration` → «Вказати бажані параметри?» [Пропустити][Заповнити]. FSM: `reg_body_goals_choice`, `reg_body_goals_weight` … `reg_body_goals_chest`.

**Ключові файли:**
- `lib/bodyGoals.js` — `validateGoalField`, `analyzeGoalsVsCurrentState`, `saveBodyGoals`, `showGoalsToStudent`, `buildAIInputBlock`, `determineNotificationLevel`, `buildCoachNotificationText`
- `lib/supabase.js` — `upsertBodyGoals(coachId, studentChatId, goals, analysis)`, `getBodyGoals`, `getLatestMeasurementsForGoals`

---

### 2. Аналіз цілей vs поточний стан (`analyzeGoalsVsCurrentState`)

**Файл:** `lib/bodyGoals.js`

**Логіка:**

**Група 1 — без поточних замірів (блокуючі + попереджувальні):**
- ІМТ цілі < 17.5 → **блок**
- goal_waist / зріст < 0.35 → **блок**
- goal_waist >= goal_hips → **блок**
- ІМТ цілі > 35 (якщо поточний < 30) → **блок**; якщо поточний >= 30 → **попередження**
- Підліток (вік < 16, або 16–17 з teen_mode != false) + схуднення → **блок**
- ІМТ 17.5–18.5 → **попередження**
- goal_hips / goal_waist < 1.10 → **попередження**

**Група 2 — з поточними замірами:**
- goal_hips < current.waist → **блок**
- Дельта талії > 25%, ягодиць > 15%, ваги > 20% → **попередження**
- Тип фігури + вектор розвитку (apple/apple_m/v_shape/athletic_m/rectangle_m/pear/inverted_triangle тощо) → **попередження або блок**

**Результат кешується** в `user_body_goals.goals_analysis` (jsonb):
```json
{
  "errors": [],
  "warnings": [],
  "deltaItems": [{ "field": "glutes", "label": "Ягодиці", "current": 95, "goal": 100, ... }],
  "hasConflict": false,
  "snapshot": { "bodyType": "pear", "currentBMI": 21.9, "currentWH": 0.43, "phase": "surplus" },
  "analyzedAt": "...",
  "triggeredBy": "goals_save"
}
```

**Перерахунок при оновленні замірів:**  
`User.updateMeasurements()` → якщо є waist+glutes+shoulders → lazy require `bodyGoals` → `analyzeGoalsVsCurrentState` → `upsertBodyGoals` → якщо статус змінився → `safeSend` тренеру.

---

### 3. AI-аналітика тіла (збереження та кнопка перегляду)

**Таблиця:** `ai_generated_content` (вже існувала)  
**Ключ:** `content_type = 'body_analysis'`, `entity_id = studentChatId`  
**Поле:** `ai_response = { text: '...', scenario: '...' }`

**Файл:** `lib/ai/bodyAnalysis.js`

Нові функції:
- `generateAndSave(chatId, scenario, measurements)` — генерує, зберігає в БД, повертає текст
- `getStoredAnalysis(chatId)` — читає останній запис з БД
- `sendStoredAnalysis(recipientChatId, studentChatId, labelPrefix)` — показує збережений аналіз
- `generateAndSend(chatId, scenario, measurements, saveForChatId)` — генерує, зберігає (для saveForChatId якщо вказано), відправляє

**Тригери генерації/збереження:**
1. Після `finishCreateStudentByInvite` — зберігається для `inviteCode` (4-й аргумент `saveForChatId`)
2. Після `finishRegistration` (self-registration) — зберігається для `chatId`
3. Після `activateInvite` (invite_activate) — зберігається для `chatId` учня
4. При `User.updateMeasurements()` — lazy require + `generateAndSave` якщо є weight або waist

**При активації invite:**  
`supabase.replaceInviteWithChatId` → тепер оновлює `ai_generated_content.entity_id` і `user_body_goals.chat_id` з `INVITE_XXX` на реальний chatId.

**Кнопки:**
- **Учень, головне меню** → `🤖 AI-аналітика` → callback `AI_ANALYTICS`
- **Тренер, картка учня** → `🤖 AI-аналітика` → callback `COACH_AI_ANALYTICS:studentChatId`

---

### 4. Поля учня для teen-режиму

**ALTER TABLE users:**
```sql
ADD COLUMN IF NOT EXISTS teen_mode boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS confirmed_by_parent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS age_group text;
```
Виконано в Supabase. Логіка `isTeenRestricted(user)` в `lib/bodyGoals.js`:
- вік < 16 → завжди блок
- вік >= 18 → завжди дозволено
- вік 16–17 → блок, якщо `teen_mode !== false`

---

### 5. lib/ai/goalsVsCurrent.js (новий файл)
Короткий AI-переказ блоку аналізу цілей для учня (3–5 речень, без маркерів). Промпт `GOALS_VS_CURRENT` в `lib/ai/aiPrompts.js`.

---

## Відомі проблеми / незавершено

### 🔴 AI-аналітика не показується в картці учня
**Симптом:** кнопка «AI-аналітика» в картці учня або в меню учня показує «ще не сформована».  
**Причина:** аналітика при invite зберігалась під `INVITE_XXX` (inviteCode), а після активації `entity_id` в `ai_generated_content` не оновлювався на реальний chatId.  
**Виправлення додано** в `replaceInviteWithChatId` (коміт `supabase.js`), але **потрібно перевірити**:
1. Для НОВИХ учнів (після цього фіксу) — має працювати автоматично
2. Для ІСНУЮЧИХ учнів — аналітика оновиться при наступному оновленні замірів (або можна вручну через кнопку «AI-аналітика» → "не сформована" → тренер оновлює заміри → генерується нова)

### 🟡 goals_analysis — перерахунок для існуючих записів
Якщо student вже є в `user_body_goals` без `goals_analysis`, при першому виклику `saveBodyGoals` з картки учня — кеш запишеться.

### 🟡 AI_ENABLED = false
Якщо AI вимкнено — `generateAndSave` повертає `null`, нічого не зберігається. Кнопка «AI-аналітика» покаже «ще не сформована». Це очікувана поведінка.

---

## Структура нових файлів / змін

| Файл | Зміна |
|------|-------|
| `lib/bodyGoals.js` | Новий: analyzeGoalsVsCurrentState, isTeenRestricted, calcBMI, shouldShowAIComment, buildAIInputBlock, determineNotificationLevel, buildCoachNotificationText |
| `lib/ai/bodyAnalysis.js` | Розширено: generateAndSave, getStoredAnalysis, sendStoredAnalysis; generateAndSend тепер зберігає в БД |
| `lib/ai/goalsVsCurrent.js` | Новий файл: AI-переказ аналізу цілей |
| `lib/ai/aiPrompts.js` | Додано: SYSTEM_PROMPTS.GOALS_VS_CURRENT, USER_TEMPLATES.GOALS_VS_CURRENT |
| `lib/supabase.js` | upsertBodyGoals тепер приймає `analysis`; replaceInviteWithChatId оновлює ai_generated_content + user_body_goals; userFromRow → teenMode, confirmedByParent, ageGroup |
| `lib/user.js` | updateMeasurements: lazy require bodyGoals + generateAndSave для AI; lazy require bodyGoalsModule замість top-level (циклічна залежність!) |
| `lib/coach.js` | Кнопки в картці учня: Бажані параметри + AI-аналітика; invite flow: аналіз goals + показ тренеру; generateAndSend з 4-м аргументом |
| `lib/registration.js` | Крок body goals choice перед finishRegistration; saveRegBodyGoalsAndFinish |
| `lib/menu.js` | Кнопка AI-аналітика в student menu |
| `lib/router.js` | Callback AI_ANALYTICS; invite_ steps → Coach.handleTextMessage |
| `lib/constants.js` | FSM: invite_body_goals_*, coach_body_goals_*, reg_body_goals_*; Callbacks: AI_ANALYTICS, COACH_AI_ANALYTICS, COACH_BODY_GOALS, INVITE_BODY_GOALS_*, REG_BODY_GOALS_* |
| `supabase_migration_user_body_goals.sql` | Оновлено: goals_analysis, analysis_date |

---

## Що перевірити в новому чаті

1. **AI-аналітика тіла** — після реєстрації учня через invite: коли учень вводить код і заходить в меню, кнопка «AI-аналітика» має показувати збережений текст аналізу.
2. **Бажані параметри** — після встановлення цілей тренером: у картці учня відображати дельту і терміни.
3. **Регенерація AI** — після оновлення замірів учня тренером: `User.updateMeasurements` → новий текст зберігається в `ai_generated_content`.
4. **Розклад / Supabase:** виконана міграція `work_hours_by_weekday`; у боті — «Налаштування» → різний час по днях зберігається; генерація слотів відповідає інтервалам по днях.

---

## Розклад тренера (оновлення Mar 2026, `lib/schedule.js`)

- **Налаштування шаблону:** опція **«Різний час по днях тижня»** — `work_hours_by_weekday` у `coach_schedule_settings` (міграція `supabase_migration_coach_schedule_work_hours_by_weekday.sql`); генерація слотів (`generateSlotsForCoach`, `createSlotsForCoachForDate`) бере інтервал через `getWorkHoursForWeekday`. Підпис дня у запиті часу: **`WEEKDAY_LONG_UA_MON0[dayIdx]`** (індекс 0=Пн…6=Нд), не `WEEKDAY_LONG_UA`. Callbacks: `SCH_SETTINGS_EDIT_WORK:perday`, `SCH_SETTINGS_DAY_HOURS:{0–6}`, `SCH_SETTINGS_WORK_PER_DAY_DONE`; FSM `SCH_SETTINGS_WORK_PER_DAY`.
- **Мій розклад:** лічильники на кнопках фільтрів і списки — **21 день** (`COACH_MY_SCHEDULE_WINDOW_DAYS`, `getCoachMyScheduleWindowStartEndKeys`); без «7 днів» у назвах; **«Всі слоти»** прибрано.
- **«Вільні слоти»** (тренер): як **«Зайняті слоти»** — лише **текст** (заголовок секції «🕐 Вільні слоти», далі по днях: день тижня + дата, рядки `час — Вільний`), **без інлайн-кнопок по слотах** і без пагінації; рядок **макс. вільних на день**; `showCoach7DaysView` + `filter === 'available'`, `pageSlots = []`. Док.: `README.md` (параграф після таблиці документів), `CALLBACK_FSM_MODULE_MATRIX.md` v1.6, §4.4.7 у `Бізнес-логіка_Gym_3_0_v1.1.md`.
- **Розклад → Відмітити тренування:** `SCH_MARK_TRAINING`, `afterCompleteSlot=mark_training` після `SCH_COMPLETE`.
- **Чекають підтвердження:** `afterCoachConfirmDecline` після `SCH_CONF` / `SCH_DECLINE`.
- **Календар тренера:** легенда 🟡 — неділя або відпустка; на кнопці дня — **дд.мм** + день тижня + зайняті в дужках; у тексті календаря — **⏳ На підтвердження:** число або **—**. **Слоти дня** — у тексті рядки для зайнятих / перерви / на підтвердженні; **усі слоти дня** також **інлайн-кнопками** (`showCoachCalendar`, `showCoachDaySlots`).
- Документація: `Бізнес-логіка_Gym_3_0_v1.1.md` §4.4.5–4.4.8 (у т.ч. §4.4.6a «Додати слоти на день»), `CALLBACK_FSM_MODULE_MATRIX.md` v1.6 (блоки «Мій розклад», «Налаштування шаблону», «Розклад»; порядок `router.js` на початку файлу), `Зміни_логіки_та_функціоналу.md`.

---

## Ключові константи / callbacks

```
CALLBACKS.AI_ANALYTICS = 'AI_ANALYTICS'
CALLBACK_PREFIXES.COACH_AI_ANALYTICS = 'COACH_AI_ANALYTICS'
CALLBACK_PREFIXES.COACH_BODY_GOALS = 'COACH_BODY_GOALS'
CALLBACK_PREFIXES.INVITE_BODY_GOALS_SKIP_WEIGHT/WAIST/HIPS/SHOULDERS/CHEST
FSM: invite_body_goals_weight/waist/hips/shoulders/chest
FSM: coach_body_goals_weight/waist/hips/shoulders/chest
FSM: reg_body_goals_choice, reg_body_goals_weight/.../chest
```

---

## Підключення AI (нагадування)

Railway Variables:  
`OPENAI_API_KEY=sk-...`  
`AI_ENABLED=true`  
`AI_MODEL=gpt-4o-mini` (default)  
`AI_MAX_TOKENS=600` (default)
