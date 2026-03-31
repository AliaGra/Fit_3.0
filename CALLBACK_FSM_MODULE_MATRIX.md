# CALLBACK → FSM STATE → MODULE MATRIX

**Версія:** 1.6  
**Дата:** 22.03.2026  
**Призначення:** Матриця співвідношень `callback_data`, FSM-станів та обробників. **Продакшен:** Node.js (`lib/router.js`). Розділ «Історичний еталон GAS» збережено лише для порівняння.

---

## ⚙️ Node.js: порядок у `lib/router.js`

Критично: **перший збіг виграє**. Порядок нижче — фактичний (оновлено за кодом `handleCallback`).

1. `BACK_TO_MAIN` → очищення state, `Menu.show`
2. `MENU_TRAINING` → підменю тренувань
3. `AI_ANALYTICS` → `lib/ai/bodyAnalysis` (повний аналіз)
4. `MENU_SCHEDULE` → підменю розкладу
5. `MENU_SUBSCRIPTION` → `Subscription.showMenu`
6. `SUB_ADD`, `SUB_HISTORY`, `SUB_TYPE_UNLIMITED`, `SUB_TYPE_FIXED`, `SUB_BACK` → `Subscription.handleCallback`
7. Префікси Alias (`ALIAS_*` у константах) → `Alias.handleCallback`
8. `LIBRARY_VIEW`, `LIBRARY_GROUP`, `LIBRARY_EXERCISE`, `LIBRARY_SEARCH`, `LIBRARY_BACK`, `LIBRARY_TOP` → `Library.handleCallback`
9. `SCH_S_MY_SCHEDULE` → `Schedule.showStudentMySchedule` (прямий виклик)
10. `SCH_S_RES`, `SCH_S_RESCHEDULE`, `SCH_S_RESCHEDULE_PICK`, `SCH_S_RES_CALENDAR`, `SCH_S_RES_DAY`, `SCH_S_RES_CANCEL` → `Schedule.handleCallback`
11. `CANCEL_ACTION` → `Menu.show`
12. `COACH_BOOK` → `Schedule.startBookStudent` (окрема гілка; не загальний `Schedule.handleCallback` з п.15)
13. `REG_NEW` → `Registration.handleCallback` (тестовий режим: показ повідомлення про closed beta + посилання на підтримку)
13a. `DEV_CONTACT_MENU` → `Menu.showDeveloperContactMenu`
13b. `DEV_CONTACT_OFFER` → `Menu.sendOfferText` (показ `OFERTA.md`)
14. `INV_ACC_*`, `INV_AVD_*` (інвайт: зони) → `Coach.handleCallback`
15. **`Registration.handleCallback`** — лише реєстраційні та пов’язані кроки; якщо повертає `true`, вихід
16. Префікси медпрофілю `MC_*` → `MedicalProfile.handleCallback`
17. Префікси планів `PLAN_*` (повний набір у `router.js`) → `TrainingPlan.handleCallback`
18. **`Coach.handleCallback`** — учні, інвайт, pricing, картка учня, `COACH_*` тощо
19. **`Profile.handleCallback`**
20. **`Schedule.handleCallback`** (усі інші `SCH_*`, не перехоплені вище)
21. **`Training.handleCallback`**
22. **`Reports.handleCallback`**
23. `HISTORY_MENU` → `History.showHistoryMenu` (прямий виклик)
24. Усі `HIST_*` → `History.handleCallback`
25. **`TRAINING_START`** → учень: `Training.startStudentPlanWorkout`; тренер: `Training.startSelfTraining` (прямий виклик з router, не через `Training.handleCallback`)
26. Якщо користувач не знайдений → `Registration.start`; інакше `Menu.show`

**Висновок:** не можна визначати модуль лише за префіксом `COACH_` / `SCH_` без урахування цього порядку (наприклад `COACH_BOOK` обробляється раніше за загальний `Schedule`).

---

## 📋 ФОРМАТ CALLBACK_DATA

**Правило парсингу:**
```javascript
const [action, ...params] = callbackData.split(':');
// Приклад: "VIEW_STUDENT:123456789"
// action = "VIEW_STUDENT"
// params[0] = "123456789"
```

**У документації для наочності використовується підкреслення:**
- Документація: `VIEW_STUDENT_123456789`
- Реальний код: `VIEW_STUDENT:123456789`

---

## 🔴 БЛОК 1: РЕЄСТРАЦІЯ (REGISTRATION MODULE)

### Таблиця 1.1: Registration Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 1 | `REG_NEW` | `WAITING_FOR_START_CHOICE` | — | `Registration.handleCallback()` | Тестовий режим: "Нова реєстрація" заблокована (closed beta), показати повідомлення + посилання на підтримку |
| 2 | `REG_INVITE` | `WAITING_FOR_START_CHOICE` | `reg_invite_input` | `Registration.handleCallback()` | Вибір "Ввести код" |
| 3 | `REG_ROLE_STUDENT` | `reg_role` | `reg_first_name` | `Registration.handleCallback()` | Вибір ролі "Учень" |
| 4 | `REG_ROLE_COACH` | `reg_role` | `reg_first_name` | `Registration.handleCallback()` | Вибір ролі "Тренер" |
| 5 | `REG_GENDER_MALE` | `reg_gender` | `reg_goal` | `Registration.handleCallback()` | Вибір статі "Чоловік" |
| 6 | `REG_GENDER_FEMALE` | `reg_gender` | `reg_goal` | `Registration.handleCallback()` | Вибір статі "Жінка" |
| 7 | `REG_GOAL_LOSE` | `reg_goal` | `reg_birth_date` | `Registration.handleCallback()` | Мета "Схуднути" |
| 8 | `REG_GOAL_GAIN` | `reg_goal` | `reg_birth_date` | `Registration.handleCallback()` | Мета "Набрати масу" |
| 9 | `REG_GOAL_KEEP` | `reg_goal` | `reg_birth_date` | `Registration.handleCallback()` | Мета "Підтримувати" |
| 10 | `REG_SKIP_LASTNAME` | `reg_last_name` | `reg_city` | `Registration.handleCallback()` | Пропустити прізвище |
| 11 | `REG_CONTINUE` | `reg_first_name` | `reg_last_name` | `Registration.handleCallback()` | Продовжити після імені |
| 12 | `REG_ACCENT_SKIP` | `reg_accent_choice` | `reg_city` | `Registration.handleCallback()` | Пропустити зони акценту |
| 13 | `REG_ACCENT_FILL` | `reg_accent_choice` | `reg_accent_select` | `Registration.handleCallback()` | Заповнити зони акценту |
| 14 | `REG_ACC_TGL:{zone}` | `reg_accent_select` | — | `Registration.handleCallback()` | Тогл зони акценту |
| 15 | `REG_ACC_NXT` | `reg_accent_select` | `reg_avoid_select` | `Registration.handleCallback()` | Далі до зон уникнення |
| 16 | `REG_ACC_BCK` | `reg_accent_select` | `reg_accent_choice` | `Registration.handleCallback()` | Назад |
| 17 | `REG_AVD_TGL:{zone}` | `reg_avoid_select` | — | `Registration.handleCallback()` | Тогл зони уникнення |
| 18 | `REG_AVD_SKP` / `REG_AVD_NXT` | `reg_avoid_select` | `reg_city` | `Registration.handleCallback()` | Пропустити / Зберегти |
| 19 | `REG_AVD_BCK` | `reg_avoid_select` | `reg_accent_select` | `Registration.handleCallback()` | Назад до акценту |
| 20 | `CITY:{cityName}` | `reg_city` | `reg_gender` або фініш | `Registration.handleCallback()` | Вибір міста зі списку |
| 21 | `REG_MEAS_SKIP` / `REG_MEAS_FILL` | `reg_measurements_choice` | `reg_body_goals_choice` або `reg_weight` | `Registration.handleCallback()` | Пропустити або ввести заміри тіла (вага, талія, стегна, ягодиці, плечі, груди, % жиру) |
| 21a | `REG_BODY_GOALS_SKIP` | `reg_body_goals_choice` | `null` (finishRegistration) | `Registration.handleCallback()` | Пропустити бажані параметри |
| 21b | `REG_BODY_GOALS_FILL` | `reg_body_goals_choice` | `reg_body_goals_weight` | `Registration.handleCallback()` | Заповнити бажані параметри |
| 21c | `REG_BODY_GOALS_SKIP_WEIGHT` … `REG_BODY_GOALS_SKIP_CHEST` | `reg_body_goals_*` | Наступний крок або saveRegBodyGoalsAndFinish | `Registration.handleCallback()` | Пропустити поле |
| 22 | `REG_INVITE_OFFER_READ` | `reg_invite_offer` | `reg_invite_offer` | `Registration.handleCallback()` | Показати текст оферти з `OFERTA.md` + кнопки виходу (написати розробнику / головне меню) |
| 23 | `REG_INVITE_OFFER_ACCEPT` | `reg_invite_offer` | `null` | `Registration.handleCallback()` | Акцепт оферти → активація інвайту (activateInvite/linkCoachByInviteCode) |
| 24 | `REG_INVITE_OFFER_DECLINE` | `reg_invite_offer` | `WAITING_FOR_START_CHOICE` | `Registration.handleCallback()` | Відмова → “Доступ не активовано.” → повернення на старт |

### Таблиця 1.2: Registration Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 1 | `reg_invite_input` | Текст (код) | `startsWith('INVITE_')` | `reg_invite_offer` (гейт оферти) | `Registration.handleTextMessage()` |
| 2 | `reg_first_name` | Текст (ім'я) | Не порожнє, 2-30 символів | `reg_last_name` або `reg_continue` | `Registration.handleTextMessage()` |
| 3 | `reg_last_name` | Текст (прізвище) | Не порожнє, 2-50 символів | `reg_city` | `Registration.handleTextMessage()` |
| 4 | `reg_city` | Текст (місто) | Не порожнє, 2-50 символів | `reg_gender` (student) або `reg_instagram` (coach) | `Registration.handleTextMessage()` |
| 5 | `reg_birth_date` | Текст (дата) | `dd.mm.yyyy`, валідна дата | `reg_accent_choice` | `Registration.handleTextMessage()` |
| 5a | `reg_accent_choice` | Callback | — | `reg_city` (skip) або `reg_accent_select` (fill) | `Registration.handleCallback()` |
| 5b | `reg_accent_select` | Callback | — | `reg_avoid_select` (REG_ACC_NXT) | `Registration.handleCallback()` |
| 5c | `reg_avoid_select` | Callback | — | `reg_city` (REG_AVD_SKP/NXT) | `Registration.handleCallback()` |
| 6 | `reg_height` | Текст (число) | 100-250 см | `reg_city` (student) | `Registration.handleTextMessage()` |
| 7 | `reg_weight` / `reg_waist` / `reg_hip` / `reg_glutes` / `reg_arm` / `reg_shoulders` / `reg_chest` / `reg_body_fat` | Текст (число) | Діапазони з CONSTANTS.VALIDATION | Ланцюжок замірів → `finishRegistration` | `Registration.handleTextMessage()` |
| 8 | `reg_instagram` | Текст (@username) | Опціонально, `@` або порожньо | `reg_calendar_id` | `Registration.handleTextMessage()` |
| 9 | `reg_calendar_id` | Текст (ID) | Email формат або порожньо | `reg_body_goals_choice` | `Registration.handleTextMessage()` |
| 9a | `reg_body_goals_choice` | Callback | — | `null` (REG_BODY_GOALS_SKIP) або `reg_body_goals_weight` (REG_BODY_GOALS_FILL) | `Registration.handleCallback()` |
| 9b | `reg_body_goals_weight` … `reg_body_goals_chest` | Текст (число) | bodyGoals.validateGoalField(..., null) | Наступний крок або saveRegBodyGoalsAndFinish | `Registration.handleTextMessage()` |

---

## 🔵 БЛОК 2: ПРОФІЛЬ (PROFILE MODULE)

### Таблиця 2.1: Profile Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 13 | `PROFILE_VIEW` | `null` (Головне меню) | `null` | `Profile.handleCallback()` | Показати профіль |
| 14 | `PROFILE_UPDATE_MEASUREMENTS` | `null` | `profile_weight` | `Profile.handleCallback()` | Почати оновлення замірів |
| 15 | `PROFILE_EDIT_DATA` | `null` | Показ меню змін | `Profile.handleCallback()` | Показати меню змін |
| 16 | `PROFILE_EDIT_FIRSTNAME` | `null` | `profile_edit_firstname` | `Profile.handleCallback()` | Змінити ім'я |
| 17 | `PROFILE_EDIT_LASTNAME` | `null` | `profile_edit_lastname` | `Profile.handleCallback()` | Змінити прізвище |
| 18 | `PROFILE_EDIT_CITY` | `null` | `profile_edit_city` | `Profile.handleCallback()` | Змінити місто |
| 19 | `PROFILE_EDIT_HEIGHT` | `null` | `profile_edit_height` | `Profile.handleCallback()` | Змінити зріст |
| 20 | `PROFILE_EDIT_BIRTHDATE` | `null` | `profile_edit_birthdate` | `Profile.handleCallback()` | Змінити дату народження |
| 20a | `PROFILE_EDIT_ACCENT` | `null` | `profile_accent_select` | `Profile.handleCallback()` | Зони акценту та уникнення |
| 20b | `PROFILE_ACC_TGL:{zone}` | `profile_accent_select` | — | `Profile.handleCallback()` | Тогл зони акценту |
| 20c | `PROFILE_ACC_NXT` | `profile_accent_select` | `profile_avoid_select` | `Profile.handleCallback()` | Далі |
| 20d | `PROFILE_ACC_BCK` | `profile_accent_select` | Показ edit menu | `Profile.handleCallback()` | Назад |
| 20e | `PROFILE_AVD_TGL:{zone}` | `profile_avoid_select` | — | `Profile.handleCallback()` | Тогл зони уникнення |
| 20f | `PROFILE_AVD_SKP` / `PROFILE_AVD_NXT` | `profile_avoid_select` | `null` (збережено) | `Profile.handleCallback()` | Пропустити / Зберегти |
| 20g | `PROFILE_AVD_BCK` | `profile_avoid_select` | `profile_accent_select` | `Profile.handleCallback()` | Назад до акценту |

### Таблиця 2.2: Profile Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 9 | `profile_weight` | Число (кг) | 30-300 | `profile_waist` | `Profile.handleTextMessage()` |
| 10 | `profile_waist` | Число (см) | 40-200 | `profile_hip` | `Profile.handleTextMessage()` |
| 11 | `profile_hip` | Число (см) | 40-200 | `profile_glutes` | `Profile.handleTextMessage()` |
| 12 | `profile_glutes` | Число (см) | 40-200 | `profile_arm` | `Profile.handleTextMessage()` |
| 13 | `profile_arm` | Число (см) | 15-80 | `null` (фініш) | `Profile.handleTextMessage()` |
| 14 | `profile_edit_firstname` | Текст | 2-30 символів | `null` | `Profile.handleTextMessage()` |
| 15 | `profile_edit_lastname` | Текст | 2-50 символів | `null` | `Profile.handleTextMessage()` |
| 16 | `profile_edit_city` | Текст | 2-50 символів | `null` | `Profile.handleTextMessage()` |
| 17 | `profile_edit_height` | Число | 100-250 см | `null` | `Profile.handleTextMessage()` |
| 18 | `profile_edit_birthdate` | Дата | `dd.mm.yyyy` | `null` | `Profile.handleTextMessage()` |

---

## 🟢 БЛОК 3: ТРЕНУВАННЯ (TRAINING MODULE)

### Таблиця 3.1: Training Start Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 21 | `TRAINING_START` | `null` (Головне меню) | Залежить від ролі | **`router.js` → `Training.startStudentPlanWorkout` / `Training.startSelfTraining`** (не `Training.handleCallback`) | Почати тренування з головного меню |
| 22 | `TRAINING_MODE_SINGLE` | `null` | `training_group` | `Training.handleCallback()` | Одинарна вправа |
| 23 | `TRAINING_MODE_CIRCUIT` | `null` | `training_circuit_build` | `Training.handleCallback()` | Круговий сет |
| 24 | `TRAINING_FINISH` | Будь-який training_* | `null` | `Training.handleCallback()` | Завершити тренування |

### Таблиця 3.2: Training Group Selection Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 25 | `GROUP:{groupId}` | `training_group` | Показ вправ групи | `Training.handleCallback()` | Вибір групи м'язів |
| 26 | `EXERCISE:{exerciseId}` | Після вибору групи | `training_weight` | `Training.handleCallback()` | Вибір вправи |
| 27 | `CIRCUIT_ADD:{exerciseId}` | `training_circuit_build` | Додано в сет | `Training.handleCallback()` | Додати в круговий сет |
| 28 | `CIRCUIT_START` | `training_circuit_build` | `training_circuit_exec` | `Training.handleCallback()` | Почати виконання кола |
| 29 | `CIRCUIT_EXERCISE:{index}` | `training_circuit_exec` | `training_weight` | `Training.handleCallback()` | Вибір вправи з кола |
| 30 | `CIRCUIT_FINISH_ROUND` | `training_circuit_exec` | Наступне коло або фініш | `Training.handleCallback()` | Завершити коло |

### Таблиця 3.3: Training Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 19 | `training_weight` | Число (кг) | 0.5-500 | `training_reps` | `Training.handleTextMessage()` |
| 20 | `training_reps` | Число | 1-999 | `training_set` | `Training.handleTextMessage()` |
| 21 | `training_set` | Число | 1-20 | Запис + продовжити | `Training.handleTextMessage()` |


БЛОК 3B: ТРЕНУВАННЯ - SELF РЕЖИМ (TRAINING MODULE - SELF MODE)
Призначення: Тренер логує власні тренування (не плутати з тренуваннями учнів)
Особливості SELF режиму:

Тренер тренує себе (ChatID = CoachID)
StudentID = NULL або "SELF"
Окремий запис в BotTrainingData з позначкою SELF
Використовує той самий Training модуль, але з суфіксом "_SELF"

Таблиця 3B.1: Training SELF Mode Callbacks
№Callback_dataFSM State RequiredНаступний FSM StateОбробникДія70TRAINING_SELF_STARTnull (Coach Menu)Показ режимівTraining.handleCallback()Почати власне тренування71TRAINING_SELF_MODE_SINGLEnulltraining_self_groupTraining.handleCallback()Одинарна вправа (SELF)72TRAINING_SELF_MODE_CIRCUITnulltraining_self_circuit_buildTraining.handleCallback()Круговий сет (SELF)73TRAINING_SELF_FINISHБудь-який training_self_*nullTraining.handleCallback()Завершити власне тренування
Таблиця 3B.2: Training SELF Group Selection Callbacks
№Callback_dataFSM State RequiredНаступний FSM StateОбробникДія74SELF_GROUP:{groupId}training_self_groupПоказ вправ групиTraining.handleCallback()Вибір групи м'язів (SELF)75SELF_EXERCISE:{exerciseId}Після вибору групиtraining_self_weightTraining.handleCallback()Вибір вправи (SELF)76SELF_CIRCUIT_ADD:{exerciseId}training_self_circuit_buildДодано в сетTraining.handleCallback()Додати в круговий сет (SELF)77SELF_CIRCUIT_STARTtraining_self_circuit_buildtraining_self_circuit_execTraining.handleCallback()Почати виконання кола (SELF)78SELF_CIRCUIT_EXERCISE:{index}training_self_circuit_exectraining_self_weightTraining.handleCallback()Вибір вправи з кола (SELF)79SELF_CIRCUIT_FINISH_ROUNDtraining_self_circuit_execНаступне коло або фінішTraining.handleCallback()Завершити коло (SELF)
Таблиця 3B.3: Training SELF Text Input States
№FSM StateОчікуєВалідаціяНаступний StateОбробник24training_self_weightЧисло (кг)0.5-500training_self_repsTraining.handleTextMessage()25training_self_repsЧисло1-999training_self_setTraining.handleTextMessage()26training_self_setЧисло1-20Запис + продовжитиTraining.handleTextMessage()
SELF Mode в State:
javascript// Приклад State для SELF режиму
State.set(coachId, {
  step: "training_self_group",
  data: {
    mode: "SELF",
    trainingId: "SELF_" + Date.now(),
    startTime: new Date(),
    exercises: []
  }
});
Відмінності від Student Mode:
ПараметрStudent ModeSELF ModeChatIDStudent ChatIDCoach ChatIDStudentIDStudent ChatIDNULL або "SELF"CoachIDCoach ChatIDCoach ChatID (той самий)Callback префіксTRAINING_TRAINING_SELF_ або SELF_FSM State префіксtraining_training_self_TrainingId форматtimestampSELF_timestamp
**Node:** префікси `TRAINING_*`, `SELF_*`, `GROUP:`, `EXERCISE:` тощо потрапляють у **`Training.handleCallback`** після проходження гілок `router.js` (див. розділ «Node.js: порядок у lib/router.js»).

📊 ОНОВЛЕНА СТАТИСТИКА CALLBACKS
┌────────────────────────────┬─────────┐
│ Модуль                     │ Кількість │
├────────────────────────────┼─────────┤
│ Registration               │ 12      │
│ Profile                    │ 8       │
│ Training (Start + Groups)  │ 10      │
│ Training SELF Mode         │ 10      │ ← NEW!
│ History                    │ 9       │
│ Coach-Student              │ 7       │
│ Schedule (Coach)           │ 8       │
│ Schedule (Student)         │ 7       │
│ Navigation                 │ 5       │
│ Library                    │ 3       │
├────────────────────────────┼─────────┤
│ ВСЬОГО CALLBACKS           │ 79      │ ← Було 69
└────────────────────────────┴─────────┘

┌────────────────────────────┬─────────┐
│ FSM Text Input States      │ 26      │ ← Було 23
├────────────────────────────┼─────────┤
│ ВСЬОГО FSM СТАНІВ          │ 105+    │ ← Було 92+
└────────────────────────────┴─────────┘

=======================================================================================================================

## 🟡 БЛОК 4: ІСТОРІЯ — застарілий префікс `HISTORY_*` (legacy)

> **Node / FIT 3.0:** у `lib/training.js` **немає** обробників `HISTORY_*`. Актуальна історія тренувань — префікси **`HIST_*`**, callback **`HISTORY_MENU`**, модуль **`lib/history.js`**, порядок виклику в **`lib/router.js`** (п. 23–24 у розділі «Node.js: порядок»). Таблиці нижче збережено як опис старого GAS-флоу; для імплементації та тестів використовуйте **розділ «📗 БЛОК: ІСТОРІЯ ТРЕНУВАНЬ»** у цьому ж файлі.

### Таблиця 4.1 (legacy): History Callbacks — не використовувати в Node

| № | Callback_data | Примітка |
|---|---------------|----------|
| 31–39 | `HISTORY_*` | Заміна в Node: `HIST_FILTER:*`, `HIST_GROUP:*`, `HIST_VIEW:*`, тощо — див. розділ з `lib/history.js` |

### Таблиця 4.2 (legacy): `history_input_n`

| № | FSM State | Примітка |
|---|-----------|----------|
| 22 | `history_input_n` | У Node: **`hist_count_input`** + `History.validateHistCount` (`lib/router.js`, `lib/history.js`) |

---

## 🟠 БЛОК 5: ТРЕНЕР-УЧЕНЬ (COACH-STUDENT MODULE)

### Таблиця 5.1: Coach Student Management Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 40 | `COACH_STUDENTS` | `null` (Coach Menu) | Показ списку | **`Coach.handleCallback()`** | Список учнів |
| 41 | `COACH_ADD_STUDENT` | `null` (Coach Menu) | `coach_add_student_name` | **`Coach.handleCallback()`** | Додати учня |
| 42 | `VIEW_STUDENT:{chatId}` | `null` | Показ картки | **`Coach.handleCallback()`** | Картка учня |
| 43 | `COACH_TRAIN:{chatId}` | `null` | `training_group` | `Training.handleCallback()` | Тренувати учня (Coach Mode) |
| 44 | `COACH_HISTORY:{chatId}` | `null` | меню історії (`hist_menu`) | **`Coach.handleCallback()`** → `History.showHistoryMenu` | Історія учня |
| 45 | `COACH_BOOK:{chatId}` | `null` | старт запису | **`router.js` → `Schedule.startBookStudent`** (рання гілка; див. порядок router) | Записати учня |
| 46 | `COACH_PROFILE:{chatId}` | `null` | Показ профілю | `Profile.handleCallback()` | Профіль учня |
| 46h | `COACH_BODY_GOALS:{chatId}` | `null` (картка учня) | `coach_body_goals_weight` | `Coach.handleCallback()` | Бажані параметри учня |
| 46i | `COACH_BODY_GOALS_SKIP_WEIGHT` … `COACH_BODY_GOALS_SKIP_CHEST` | `coach_body_goals_*` | Наступний крок або збереження | `Coach.handleCallback()` | Пропустити поле |
| 46j | `INVITE_BODY_GOALS_SKIP_WEIGHT` … `INVITE_BODY_GOALS_SKIP_CHEST` | `invite_body_goals_*` | Наступний крок або finishCreateStudentByInvite | `Coach.handleCallback()` | Пропустити поле (інвайт) |
| 46k | `INVITE_BODY_GOALS_BCK` | `invite_body_goals_weight` | `coach_add_student_avoid_select` | `Coach.handleCallback()` | Назад до зон уникнення |

### Таблиця 5.2: Coach Text Input States (інвайт, параметри)

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 23 | `coach_add_student_name` | Текст (Ім'я Прізвище) | Min 2 слова | `coach_add_student_age` | `Coach.handleTextMessage()` |
| 23d | `coach_add_student_age` | Дата ДД.ММ.РРРР | 10–100 років | `coach_add_student_gender` | `Coach.handleTextMessage()` |
| 23e | `coach_add_student_weight` | Число (кг) | WEIGHT_MIN–WEIGHT_MAX | `coach_add_student_height` | `Coach.handleTextMessage()` |
| 23f | `coach_add_student_height` | Число (см) | HEIGHT_MIN–HEIGHT_MAX | `coach_add_student_waist` | `Coach.handleTextMessage()` |
| 23g | `coach_add_student_waist` | Число (см) | WAIST_MIN–WAIST_MAX | `coach_add_student_glutes` | `Coach.handleTextMessage()` |
| 23h | `coach_add_student_glutes` | Число (см) | GLUTES_MIN–GLUTES_MAX | `coach_add_student_accent_select` | `Coach.handleTextMessage()` |
| 23i | `coach_add_student_accent_select` | Callback | — | `coach_add_student_avoid_select` (INV_ACC_NXT) або назад | `Coach.handleCallback()` |
| 23j | `coach_add_student_avoid_select` | Callback | — | `invite_body_goals_weight` (INV_AVD_SKP / INV_AVD_NXT) | `Coach.handleCallback()` |
| 23k | `invite_body_goals_weight` … `invite_body_goals_chest` | Текст (число) | bodyGoals.validateGoalField(..., height) | Наступний крок або finishCreateStudentByInvite | `Coach.handleTextMessage()` |
| 23l | `coach_body_goals_weight` … `coach_body_goals_chest` | Текст (число) | bodyGoals.validateGoalField(..., student.height) | Наступний крок або bodyGoals.saveBodyGoals | `Coach.handleTextMessage()` |

**Інвайт: після медичного профілю** — крок `coach_add_student_measurements_choice`: callback `INVITE_MEASUREMENTS_SKIP` (→ зони акценту) або `INVITE_MEASUREMENTS_FILL` (→ `coach_add_student_weight`). Після параметрів або пропуску — **зони акценту та уникнення**: `showInviteAccentZones` → `askInviteAvoidZones`; callback `INV_ACC_TGL`, `INV_ACC_NXT`, `INV_ACC_BCK`, `INV_AVD_TGL`, `INV_AVD_SKP`, `INV_AVD_NXT`, `INV_AVD_BCK`. Після «Далі»/«Пропустити» у блоці уникнення — **бажані параметри тіла**: `askInviteBodyGoalsWeight` → `invite_body_goals_weight` … `invite_body_goals_chest`; callback `INVITE_BODY_GOALS_SKIP_WEIGHT` … `INVITE_BODY_GOALS_SKIP_CHEST`, `INVITE_BODY_GOALS_BCK` (→ назад до зон уникнення). Після останнього кроку — finishCreateStudentByInvite. Callback `INVITE_MC_DONE` / `INVITE_MC_SKIP` ведуть до `coach_add_student_measurements_choice`.

**Інвайт: бажані параметри (текст):** FSM `invite_body_goals_weight` … `invite_body_goals_chest` — Coach.handleTextMessage(); валідація через bodyGoals.validateGoalField(..., state.inviteHeight). Router: кроки `invite_*` маршрутизуються в Coach.

### Таблиця 5.3: Pricing (Вартість тренувань) Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 46a | `PRICING_SET_DEFAULT` | `null` (Мої учні) | `pricing_type_select` | **`Coach.handleCallback()`** | Ввести вартість (тариф за замовчуванням) |
| 46b | `PRICING_SET_INDIVIDUAL` | `null` (Мої учні) | `pricing_select_student` | **`Coach.handleCallback()`** | Індивідуальна вартість |
| 46c | `PRICING_CHANGE` | `null` (Мої учні) | `pricing_type_select` | **`Coach.handleCallback()`** | Змінити вартість |
| 46d | `PRICING_TYPE_PERSONAL` | `pricing_type_select` | `pricing_input_amount` | **`Coach.handleCallback()`** | Тип: персональне |
| 46e | `PRICING_TYPE_SPLIT` | `pricing_type_select` | `pricing_input_amount` | **`Coach.handleCallback()`** | Тип: спліт |
| 46f | `PRICING_TYPE_TRIO` | `pricing_type_select` | `pricing_input_amount` | **`Coach.handleCallback()`** | Тип: тріо |
| 46g | `PRICING_STUDENT:{chatId}` | `pricing_select_student` | `pricing_type_select` | **`Coach.handleCallback()`** | Вибір учня (індивідуальна вартість) |

### Таблиця 5.4: Pricing Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 23a | `pricing_type_select` | — | Callback (тип) | `pricing_input_amount` | **`Coach.handleCallback()`** |
| 23b | `pricing_input_amount` | Ціле число (UAH) | PRICE_MIN–PRICE_MAX | `null` (фініш, запис у Pricing) | **`Coach.handleTextMessage()`** (`router.js`: кроки `pricing_*` → Coach) |
| 23c | `pricing_select_student` | — | Callback PRICING_STUDENT:chatId | `pricing_type_select` | **`Coach.handleCallback()`** |

**Примітка:** Дані FSM (coachId, studentId, тип тренування) зберігаються в State; callback_data для FSM-кроків не містить ID (VETO 1). Для простих операцій дозволено `PRICING_STUDENT:{chatId}`. **У Node** усю цінову логіку веде **`Coach`**, не `Registration`.

---

## 🔴 БЛОК 6: РОЗКЛАД (SCHEDULE MODULE)

### Таблиця 6.1: Schedule Coach Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 47 | `SCH_MY_SCHEDULE` | `null` (Coach Menu) | Показ записів | `Schedule.handleCallback()` | Меню «Розклад» (тренер) |
| 47a | `SCH_MARK_TRAINING` / `SCH_MARK_TRAINING:{page}` | `null`; після ✔️ — `afterCompleteSlot=mark_training` | — | `Schedule.handleCallback()` | «Відмітити тренування» (підтверджені слоти, 21 день) |
| 48 | `SCH_BOOK_COACH:{slotId}` | `null` | `sch_select_student` | `Schedule.handleCallback()` | Записати когось на слот |
| 49 | `SCH_C_REQ:{eventId}_{studentId}` | `null` | `sch_waiting_confirm` | `Schedule.handleCallback()` | Тренер записує учня (запит) |
| 50 | `SCH_CONF:{slotId}` | `null` | Підтвердження | `Schedule.handleCallback()` | Тренер підтверджує запит учня |
| 51 | `SCH_DECLINE:{slotId}` | `null` | Відхилення | `Schedule.handleCallback()` | Тренер відхиляє запит учня |
| 52 | `SCH_CANCEL:{slotId}` | `null` | Скасування | `Schedule.handleCallback()` | Тренер скасовує запис |
| 53 | `SCH_RESCHEDULE:{slotId}` | `null` | `sch_select_new_slot` | `Schedule.handleCallback()` | Тренер переносить |
| 54 | `SCH_COMPLETE:{slotId}` | `null` | Завершення | `Schedule.handleCallback()` | Підтвердити присутність |

**Примітки (Mar 2026):** `SCH_CONF` / `SCH_DECLINE` — якщо в `bot_state` є `afterCoachConfirmDecline: 'requested'` (екран «Чекають підтвердження»), після успіху викликається `showCoach7DaysView(..., 'requested', 0)` замість головного меню «Розклад». `SCH_7_ALL` (застаріла кнопка) → `showCoachMyScheduleMenu`.

### Таблиця 6.2: Schedule Student Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 55 | `SCH_STUDENT_BOOK` | `null` (Student Menu) | Показ слотів | `Schedule.handleCallback()` | Записатись на тренування |
| 56 | `SCH_S_REQ:{slotId}` | `null` | `sch_waiting_confirm` | `Schedule.handleCallback()` | Учень просить запис |
| 57 | `SCH_S_CONFIRM:{slotId}` | `sch_waiting_confirm` | Підтвердження | `Schedule.handleCallback()` | Учень підтверджує запис тренера |
| 58 | `SCH_S_DECLINE:{slotId}` | `sch_waiting_confirm` | Відхилення | `Schedule.handleCallback()` | Учень відхиляє запис тренера |
| 59 | `SCH_S_MY_SCHEDULE` | `null` (Student Menu) | Показ записів | `Schedule.handleCallback()` | Мій розклад (учень) |
| 60 | `SCH_S_CANCEL_REQ:{slotId}` | `null` | Запит тренеру | `Schedule.handleCallback()` | Попросити скасувати |
| 61 | `SCH_S_RESCHEDULE_REQ:{slotId}` | `null` | Запит тренеру | `Schedule.handleCallback()` | Попросити перенести |

---

## 🟣 БЛОК 7: МЕНЮ ТА НАВІГАЦІЯ

### Таблиця 7.1: General Navigation Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 62 | `BACK_TO_MAIN` | Будь-який | `null` | `Menu.handleCallback()` | Головне меню |
| 63 | `BACK_TO_PROFILE` | Будь-який profile_* | Показ профілю | `Profile.handleCallback()` | Назад до профілю |
| 64 | `BACK_TO_HISTORY` | Будь-який history_* | Показ фільтрів | `Training.handleCallback()` | Назад до історії |
| 65 | `BACK_TO_STUDENTS` | Будь-який в контексті учня | Список учнів | `Registration.handleCallback()` | Назад до списку учнів |
| 66 | `CANCEL_ACTION` | Будь-який | `null` | `State.clearState()` | Скасувати дію |

### Таблиця 7.2: Library Access Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 67 | `LIBRARY_VIEW` | `null` | Показ груп | `Training.handleCallback()` | Бібліотека вправ |
| 68 | `LIBRARY_GROUP:{groupId}` | `null` | Показ вправ | `Training.handleCallback()` | Переглянути групу |
| 69 | `LIBRARY_EXERCISE:{exId}` | `null` | Детальний опис | `Training.handleCallback()` | Детальний опис вправи |

### Таблиця 7.3: Абонемент залу (Subscription)

| № | Callback_data | FSM State | Наступний FSM State | Обробник | Дія |
|---|---------------|-----------|---------------------|----------|-----|
| 69a | `MENU_SUBSCRIPTION` | `null` (Головне меню) | sub_menu | Router → Subscription.showMenu() | Відкрити меню «Абонемент» |
| 69b | `SUB_ADD` | sub_menu | sub_add_amount | Subscription.handleCallback() | Додати оплату |
| 69c | `SUB_HISTORY` | sub_menu | Показ історії | Subscription.handleCallback() | Історія абонементів |
| 69d | `SUB_BACK` | будь-який sub_* | sub_menu | Subscription.handleCallback() | Назад до меню абонемента |
| 69e | `SUB_TYPE_UNLIMITED` | sub_add_type | sub_add_start | Subscription.handleCallback() | Безліміт → дата початку |
| 69f | `SUB_TYPE_FIXED` | sub_add_type | sub_add_count | Subscription.handleCallback() | Фікс. к-сть → кількість тренувань |

**Текстові кроки:** `sub_add_amount` (сума або 0), `sub_add_count` (кількість тренувань), `sub_add_start` (ДД.ММ.РРРР), `sub_add_end` (ДД.ММ.РРРР). Обробник: `Subscription.handleTextMessage()`. Модуль: lib/subscription.js.

---

## 📗 БЛОК: ІСТОРІЯ ТРЕНУВАНЬ (HISTORY MODULE)

**Модуль:** `lib/history.js`. Джерело даних: `bot_training_data`. Три точки входу: учень (Головне меню → «📊 Історія»), тренер своя («📊 Моя історія»), тренер за учня (картка учня → «📊 Історія»).

### Таблиця: History Callbacks

| № | Callback_data | FSM State / контекст | Наступний FSM State | Обробник | Дія |
|---|---------------|----------------------|---------------------|----------|-----|
| 75 | `HISTORY_MENU` | `null` (Головне меню) | `hist_menu` | Router → History.showHistoryMenu() | Відкрити меню історії (своя або учня) |
| 76 | `COACH_HISTORY:{studentChatId}` | `null` (картка учня) | `hist_menu` | Coach.handleCallback() → History.showHistoryMenu() | Історія учня |
| 77 | `HIST_FILTER:all` | hist_menu | hist_subfilter | History.handleCallback() | Всі тренування → showSubfilterMenu |
| 78 | `HIST_FILTER:group` | hist_menu | hist_group_select | History.handleCallback() | За групою → showGroupFilter |
| 79 | `HIST_FILTER:exercise` | hist_menu | hist_group_select | History.handleCallback() | За вправою → showGroupFilter |
| 80 | `HIST_GROUP:{group_level2}` | hist_group_select | hist_subfilter / hist_ex_select | History.handleCallback() | Вибір групи; далі subfilter або showExerciseFilter |
| 81 | `HIST_EX:{exerciseId}` | hist_ex_select | hist_subfilter | History.handleCallback() | Вибір вправи → showSubfilterMenu |
| 82 | `HIST_SUB:prev` | hist_subfilter | hist_detail | History.handleCallback() | Попереднє тренування (1 дата) → showHistoryDetail |
| 83 | `HIST_SUB:last_n` | hist_subfilter | hist_count_input | History.handleCallback() | Останні N → askHistoryCount |
| 84 | `HIST_VIEW:{dateStr}` | hist_list | hist_detail | History.handleCallback() | Відкрити деталі тренування за датою |
| 85 | `HIST_PREV` | hist_detail | hist_detail | History.handleCallback() | Попереднє (старіше) тренування в списку |
| 86 | `HIST_NEXT` | hist_detail | hist_detail | History.handleCallback() | Наступне (новіше) тренування в списку |
| 87 | `HIST_BACK_MENU` | будь-який | hist_menu | History.handleCallback() | Назад до меню фільтрів |
| 88 | `HIST_BACK_SUBFILTER` | hist_list / hist_detail | hist_subfilter | History.handleCallback() | Назад до підфільтрів |
| 89 | `HIST_BACK_LIST` | hist_detail | hist_list | History.handleCallback() | Назад до списку дат |
| 90 | `HIST_BACK_GROUP` | hist_ex_select | hist_group_select | History.handleCallback() | Назад до вибору групи |
| 91 | `HIST_BACK_STUDENT` | hist_menu (coach_student) | — | History.handleCallback() | Назад до картки учня |
| 92 | `HIST_AI_ANALYZE:{dateStr}` | hist_detail | — | History.handleCallback() → historyAnalysis.getWorkoutAnalysisCached() | AI-аналіз одного тренування |
| 93 | `HIST_AI_PROGRESS:{exerciseId}` | hist_list (фільтр за вправою) | — | History.handleCallback() → historyAnalysis.getExerciseProgressCached() | AI-аналіз прогресу по вправі |

### Таблиця: History Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 27 | `hist_count_input` | Число (N) | 1–100 | hist_list | Router handleTextMessage → History.validateHistCount, loadDatesForCurrentFilter, showHistoryList |

**Примітка:** State зберігає histTargetChatId, histOrigin ('self' | 'coach_own' | 'coach_student'), histFilter, histFilterGroup, histFilterExerciseId, histDates, histCurrentIndex, histDetailOrigin. Роутинг: action.startsWith('HIST_') → History.handleCallback; HISTORY_MENU та COACH_HISTORY обробляються в router та coach.js окремо.

---

## 📘 БЛОК: ПЛАНИ ТРЕНУВАНЬ (TRAINING PLAN MODULE)

**Модуль:** `lib/trainingPlan.js`, `lib/training.js` (тренер: вибір дня плану / вільне тренування)

### Таблиця: Plan + Coach training by plan Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 70 | `PLAN_EXERCISE:{exId}` | `plan_add_exercise_day` / `plan_search_input` | `plan_sets_preset` | `TrainingPlan.handleCallback()` | Обрати вправу для плану (ручне додавання) |
| 71 | `PLAN_EXERCISE_ADD:{exId}:SET` | Після PLAN_SETS_CUSTOM | `plan_add_exercise_day` | `TrainingPlan.handleCallback()` | Тип виконання: кілька підходів (сети) |
| 72 | `PLAN_EXERCISE_ADD:{exId}:SINGLE` | Після PLAN_SETS_CUSTOM | `plan_add_exercise_day` | `TrainingPlan.handleCallback()` | Тип виконання: одиночне |
| 72a | `PLAN_ACC_ST` | Авто-підбір | `plan_accent_select` | `TrainingPlan.handleCallback()` | Почати вибір акцент-зон |
| 72b | `PLAN_ACC_TGL:{zone}` | `plan_accent_select` | `plan_accent_select` | `TrainingPlan.handleCallback()` | Toggle акцент-зони |
| 72c | `PLAN_ACC_NXT` | `plan_accent_select` | `plan_avoid_select` | `TrainingPlan.handleCallback()` | Далі до уникнення |
| 72d | `PLAN_ACC_BCK` | `plan_accent_select` | `plan_set_days` / auto summary | `TrainingPlan.handleCallback()` | Назад |
| 72e | `PLAN_AVD_TGL:{zone}` | `plan_avoid_select` | `plan_avoid_select` | `TrainingPlan.handleCallback()` | Toggle зони уникнення |
| 72f | `PLAN_AVD_SKP` / `PLAN_AVD_NXT` | `plan_avoid_select` | `plan_split_preview` | `TrainingPlan.handleCallback()` | Пропустити / Далі |
| 72g | `PLAN_AVD_BCK` | `plan_avoid_select` | `plan_accent_select` | `TrainingPlan.handleCallback()` | Назад |
| 72h | `PLAN_SPL_CFM` | `plan_split_preview` | `plan_add_exercise_day` / план | `TrainingPlan.handleCallback()` | Підтвердити розподіл |
| 72i | `PLAN_SPL_BCK` | `plan_split_preview` | `plan_avoid_select` | `TrainingPlan.handleCallback()` | Змінити акцент |
| 72j | `PLAN_SETS_PR:{index}` | `plan_sets_preset` | `plan_add_exercise_day` | `TrainingPlan.handleCallback()` | Обрати пресет сетів |
| 72k | `PLAN_SETS_CU` | `plan_sets_preset` | Вибір SET/SINGLE | `TrainingPlan.handleCallback()` | Ввести вручну |
| 72l | `PLAN_SETS_BC` | `plan_sets_preset` | `plan_add_exercise_day` | `TrainingPlan.handleCallback()` | Назад до вибору вправи |
| 73 | `COACH_PLAN_DAY:{studentChatId}:{dayNum}` | `coach_train_plan_choice` | `training_student_plan_input` | `Training.handleCallback()` | Тренер обрав день плану для тренування учня |
| 74 | `COACH_TRAIN_FREE:{studentChatId}` | `coach_train_plan_choice` | `training_group` | `Training.handleCallback()` | Тренер обрав «Вільне тренування» (без плану) |

**Примітка:** Після вибору вправи в ручному плані (PLAN_EXERCISE) показується вибір пресетів сетів (SET_PRESETS за goal/level) або «Ввести вручну» → SET/SINGLE. Акцент-зони: авто-план → «→ Далі до акценту» → askAccentZones → askAvoidZones → showSplitPreview → Підтвердити. Ручний план: після PLAN_DAYS → askAccentZones → askAvoidZones → showSplitPreview → створення плану. У askAvoidZones зони, які вже в акценті (planAccentZones), **не показуються** у клавіатурі (03.2026). Підпис glutes у ACCENT_LABELS — «Ягодиці».

---

---

## 🆕 БЛОК: ОНОВЛЕННЯ 03.2026 (Чат Mar 2026)

### Нові callbacks — Розклад (учень)

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| S1 | `SCH_S_MY_EDIT` | `null` (меню «Розклад») | Показ слотів з кнопками дій | `Schedule.handleCallback()` | «🔄 Змінити запис» — підменю зі слотами і кнопкою «Перенести» |
| S2 | `SCH_CR_OK:{newSlotId}` | `null` (кнопка тренеру) | Підтвердження переносу | `Schedule.handleCallback()` | Тренер підтверджує перенос учня (коротка форма, без 64-байт помилки) |
| S3 | `SCH_CR_NO:{newSlotId}` | `null` (кнопка тренеру) | Відхилення переносу | `Schedule.handleCallback()` | Тренер відхиляє перенос учня (коротка форма) |
| S4 | `SCH_SR_OK:{newSlotId}` | `null` (кнопка учня) | Підтвердження переносу | `Schedule.handleCallback()` | Учень підтверджує перенос, **ініційований тренером** (коротка форма; інакше `SCH_STUDENT_CONF_RESCHEDULE` + два UUID ламає відправку повідомлення) |
| S5 | `SCH_SR_NO:{newSlotId}` | `null` (кнопка учня) | Відхилення переносу | `Schedule.handleCallback()` | Учень відхиляє перенос тренера (коротка форма) |

**Примітка SCH_CR_OK / SCH_CR_NO:** Замінюють `SCH_COACH_CONF_RESCHEDULE` + `SCH_COACH_DECLINE_RESCHEDULE` з двома UUID (перевищення 64 байти Telegram). Приймають тільки `newSlotId`; старий слот знаходиться автоматично через `getSlotsByStudentAndStatus(BOOKED)`.

**Примітка SCH_SR_OK / SCH_SR_NO:** Аналогічно для **запиту тренера на перенос** до учня: старий `SCH_STUDENT_CONF_RESCHEDULE:old:new` перевищував ліміт → повідомлення учню не доходило. Перед відправкою клавіатури новий слот зберігається як `REQUESTED` + `studentId`; учень підтверджує/відхиляє лише за `newSlotId`. Після відповіді учня — `Menu.showScheduleSubmenu` (підменю «Розклад», не головне меню). Після підтвердження скасування за запитом тренера (`SCH_STUDENT_CONF_CANCEL`) — текст «Дякую, скасування підтверджено» + те саме підменю «Розклад».

### Нові callbacks — Розклад (тренер — перенос через календар)

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| C1 | `SCH_C_RES_CAL` | `sch_coach_reschedule_pick` | Показ календаря | `Schedule.handleCallback()` | Назад до календаря переносу тренера |
| C2 | `SCH_C_RES_DAY:{dateKey}` | `sch_coach_reschedule_pick` | Показ слотів дня | `Schedule.handleCallback()` | Тренер обрав дату для переносу |
| C3 | `SCH_C_RES_CANCEL` | `sch_coach_reschedule_pick` | `showCoachCalendar` | `Schedule.handleCallback()` | Скасувати перенос тренера |

**Старий флоу:** `SCH_RESCHEDULE_REQ` → плоский список 8 слотів  
**Новий флоу:** `SCH_RESCHEDULE_REQ` → `showCoachRescheduleCalendar` (21 день) → `SCH_C_RES_DAY` → слоти дня → `SCH_RESCHEDULE_PICK` → підтвердження → `showCoachCalendar`

### Зміни UX — Меню «Мій розклад» (тренер)

- **Порядок кнопок:** «📆 Календар (21 день)» — **1-е місце** у `showCoachMyScheduleMenu`
- **Перейменування:** «Мої резерви» → **«Мої перерви»**; кнопка слота «📌 Резерв» → **«🍔 Хочу перерву»**
- **Вікно 21 день:** лічильники на кнопках фільтрів і списки в `showCoach7DaysView` — майбутні слоти на **21 календарний день** (`COACH_MY_SCHEDULE_WINDOW_DAYS`, `getCoachMyScheduleWindowStartEndKeys`). У назвах кнопок **немає** «7 днів»; формат **«Зайняті слоти (N)»** тощо.
- **Прибрано** пункт **«Всі слоти»** з меню; `SCH_7_ALL` → `showCoachMyScheduleMenu` (старі кнопки).
- **«Зайняті слоти» (фільтр `booked`):** без кнопок «Скасувати»/«Перенести»; показ **макс. зайнятих на день**; відмітка виконання — **«Розклад» → «Відмітити тренування»**.
- **«Вільні слоти» (фільтр `available`):** лише **текстовий список** у тій самій компоновці, що й «Зайняті» — заголовки **день тижня + дата (дд.мм)**, далі рядки **час — Вільний**; **немає інлайн-кнопок по слотах** і **немає пагінації**; показ **макс. вільних на день**; дії зі слотом — через **Календар** або інші фільтри «Мій розклад». Реалізація: `showCoach7DaysView` + `filter === 'available'`, `pageSlots = []`.
- **«Чекають підтвердження»:** після `SCH_CONF` / `SCH_DECLINE` — залишитись у перегляді (`afterCoachConfirmDecline`, `showCoach7DaysView(..., 'requested', 0)`).
- **Підказки (viewHint):** не показуються для фільтрів **зайняті**, **вільні**, **мої перерви** (`showCoach7DaysView`); для **вільних** також без довгої підказки про дії зі слотом.
- **`showCoachDaySlots`:** заголовок дня — дата + день тижня **без року**; у **тексті** — рядки лише для REQUESTED / BOOKED / RESERVED; далі «Обери слот:»; на **інлайн-кнопках** — **`formatSlotTimeOnly`** (час без дати), не `formatSlotDateTime`.
- **Перерва:** після `setSlotReserve` — пауза **1.5 с** перед оновленням

### Налаштування шаблону слотів (callback / FSM, `lib/schedule.js`)

| Callback | Призначення |
|----------|-------------|
| `SCH_SETTINGS_EDIT_WORK:perday` | Відкрити екран **різний час по днях** (`showSettingsWorkPerDay`, `handleSettingsWorkPerDayOpen`) |
| `SCH_SETTINGS_DAY_HOURS:{0–6}` | Обрати день (індекс як **Пн=0 … Нд=6**) → введення інтервалу текстом |
| `SCH_SETTINGS_WORK_PER_DAY_DONE` | Повернутися до підсумку налаштувань (`handleSettingsWorkPerDayDone`) |
| FSM `SCH_SETTINGS_WORK_PER_DAY` | Крок з кнопками днів + очікування вводу часу для `awaitingWorkTimeForDay` |

**Допоміжні функції:** `getWorkHoursForWeekday`, `buildWorkHoursMapFromSettings`, `padHHMM`; для підпису дня при вводі часу — **`WEEKDAY_LONG_UA_MON0`** (не плутати з `WEEKDAY_LONG_UA`, де неділя=0 як у `Date.getDay()`).

### Зміни UX — Меню «Розклад» (тренер)

- «📌 Створити резерв» → **«🍔 Створити перерву»**
- «🏖 Відпустка» → **«🏖 Створити відпустку»**
- **«✔️ Відмітити тренування»** — `SCH_MARK_TRAINING` / `SCH_MARK_TRAINING:{page}`; після `SCH_COMPLETE` — `afterCompleteSlot=mark_training` → знову екран відмітки.
- **Календар тренера** (`showCoachCalendar`): у тексті — **⏳ На підтвердження:** кількість REQUESTED у вікні 21 день або **—**; кнопки днів — **дд.мм + день тижня** (`formatDateShortWithWeekday`) + зайняті в дужках; легенда емодзі: 🟢 сьогодні; 🟡 неділя / відпустка / вихідний за шаблоном; ⬜ немає слотів.
- **Додати слоти на день:** `SCH_ADD_SLOTS_FOR_DAY` → `showAddSlotsForDayCalendar`; `SCH_ADD_SLOTS_DAY_PICK:{dateKey}` → `createSlotsForCoachForDate` (шаблон 4.4.5 у бізнес-логіці).

### Зміни UX — Меню «Розклад» (учень)

- Кнопка **«🔄 Змінити запис»** (`SCH_S_MY_EDIT`) додана до `showScheduleSubmenu` (menu.js)
- «Мій розклад» тепер показує **тільки список** (без кнопок дій на кожен слот)
- Після запиту на запис (`SCH_S_REQ`) учень повертається до **календаря** (не до списку дня)
- Календар учня: **🔵** позначає дати, де вже є підтверджений або очікуваний запис
- Те саме 🔵 — у календарі переносу (`showStudentRescheduleCalendar`)

### Зміни — Інвайт активація (lib/registration.js, lib/user.js, lib/supabase.js)

- **Fallback для вже зареєстрованого учня:** якщо `activateInvite` кидає `This Telegram account is already registered` → автоматично викликається `linkCoachByInviteCode(chatId, code)`
- **FK-constraint fix:** `replaceInviteWithChatId` тепер спочатку **вставляє** нового користувача (INSERT), потім переносить залежні таблиці (`user_body_goals`, `user_medical_conditions` тощо), і тільки потім позначає інвайт USED → усуває помилку `user_body_goals_chat_id_fkey`
- Нові функції в `supabase.js`: `getUserByUserId(userId)`, `syncUserChatIdToUserId(userId)`

### Зміни — Ідеальна вага (lib/bodyMetrics.js, lib/bodyGoals.js, lib/ai/bodyAnalysis.js)

| Правило | Опис | Реалізація |
|---------|------|-----------|
| BMI min (ж) | Мінімальний ІМТ для goal_weight: **17.5** | `getBMIMinForGoal('female', false)` |
| BMI min (ч) | Мінімальний ІМТ для goal_weight: **18.0** | `getBMIMinForGoal('male', false)` |
| BMI min (підлітки ≤17) | Мінімальний ІМТ для goal_weight: **16.5** | `getBMIMinForGoal(*, true)` |
| BMI max | Максимальний ІМТ для goal_weight: **29.9** | `BMI_RANGES.goal_max = 29.9` |
| Fallback floor (ж) | При зрості < 152.4 см — мін. база **43 кг** | `Math.max(adjIdeal, 43.0)` |
| Fallback floor (ч) | При зрості < 152.4 см — мін. база **47 кг** | `Math.max(adjIdeal, 47.0)` |
| Конфіденційність підлітків | Учень-підліток (age ≤17) **не бачить числових діапазонів** ваги | `showIdealNumbers = !isTeen \|\| forCoach` |

### Зміни — Зони акценту (lib/registration.js, lib/profile.js)

- При виборі **«Все рівномірно»** або **2-ї зони** автоматичний перехід до «Зони, які не розвиваємо» (без кнопки «→ Далі»)
- Застосовується і при реєстрації, і при редагуванні профілю

### Зміни — Меню обмірів тренера (lib/coach.js)

- У меню `showCoachMeasurementsPicker`: кнопки тепер показують **поточні значення** (напр. `⚖️ Вага: 72 кг`); fallback з профілю учня якщо в останньому замірі поле null
- Видалено підменю **«📌 Поточні обміри»** з меню «Обміри/Активність»

---

## 📊 СТАТИСТИКА CALLBACKS

```
┌────────────────────────────┬─────────┐
│ Модуль                     │ Кількість │
├────────────────────────────┼─────────┤
│ Registration               │ 12      │
│ Profile                    │ 8       │
│ Training (Start + Groups)  │ 10      │
│ Coach-Student + Pricing    │ 14      │
│ Schedule (Coach)           │ 8       │
│ Schedule (Student)         │ 7       │
│ Navigation                 │ 5       │
│ Library                    │ 3       │
│ Історія тренувань (HIST_*) │ 19      │  ← 03.2026 + AI_HISTORY
├────────────────────────────┼─────────┤
│ ВСЬОГО CALLBACKS           │ 84      │
└────────────────────────────┴─────────┘

┌────────────────────────────┬─────────┐
│ FSM Text Input States      │ 27      │  ← +1 hist_count_input (03.2026)
├────────────────────────────┼─────────┤
│ ВСЬОГО FSM СТАНІВ          │ 100+    │
└────────────────────────────┴─────────┘
```

---

## 🔍 Роутинг callbacks

### Актуально: `lib/router.js` (Node.js)

Повний порядок і особливі гілки (`COACH_BOOK`, `REG_NEW`, `TRAINING_START`, `HISTORY_MENU`, `HIST_*`) — у розділі **«Node.js: порядок у lib/router.js»** вище. Текстовий ввід маршрутизується в **`handleTextMessage`** у тому ж файлі (кроки `reg_*`, `coach_*`, `invite_*`, `pricing_*`, `profile_*`, `sch_*`, `training_*`, `hist_count_input`, тощо).

### Історичний еталон: Google Apps Script (`Router.gs`)

Нижче — спрощений **старий** псевдокод для GAS (без змінних гілок Node). **Не використовувати** як опис продакшен FIT 3.0 на Railway.

```javascript
// LEGACY GAS — не відповідає lib/router.js
function handleCallback_(chatId, callbackData) {
  const [action, ...params] = callbackData.split(':');
  if (action.startsWith('REG_')) {
    return Registration.handleCallback(chatId, action, params);
  }
  if (action.startsWith('PROFILE_')) {
    return Profile.handleCallback(chatId, action, params);
  }
  if (action.startsWith('TRAINING_') || action.startsWith('HISTORY_') ||
      action.startsWith('GROUP:') || action.startsWith('EXERCISE:') ||
      action.startsWith('CIRCUIT_') || action.startsWith('LIBRARY_')) {
    return Training.handleCallback(chatId, action, params);
  }
  if (action.startsWith('COACH_') || action.startsWith('VIEW_STUDENT:') || action.startsWith('PRICING_')) {
    return Registration.handleCallback(chatId, action, params);
  }
  if (action.startsWith('SCH_')) {
    return Schedule.handleCallback(chatId, action, params);
  }
  if (action.startsWith('BACK_') || action === 'CANCEL_ACTION') {
    return handleNavigation_(chatId, action, params);
  }
  if (action === 'CITY') {
    return Registration.handleCallback(chatId, action, params);
  }
}
```

---

## ✅ КРИТИЧНІ ПРАВИЛА

1. **Парсинг callback:**
   - ✅ Завжди використовувати `split(':')` для розділення
   - ✅ Перший елемент = action, решта = parameters

2. **Валідація FSM state:**
   - ✅ Перед обробкою callback перевірити поточний state
   - ✅ Якщо state не відповідає - показати помилку або main menu

3. **Очищення state:**
   - ✅ Після завершення flow (фініш реєстрації, завершення тренування) завжди `State.clearState()`
   - ✅ При натисканні BACK_TO_MAIN завжди `State.clearState()`

4. **Відповідь на callback:**
   - ✅ Завжди викликати `Helpers.answerCallback(callbackQueryId)` ПЕРШИМ
   - ✅ Потім оновлювати state, відправляти повідомлення

5. **Параметри в callback:**
   - ✅ chatId/userId передається ЗАВЖДИ через двокрапку: `VIEW_STUDENT:{chatId}`
   - ✅ Множинні параметри: `SCH_C_REQ:{eventId}_{studentId}` (парсити через `split('_')`)

---

## 🎯 ВИКОРИСТАННЯ

**Для розробників:**
- Додавляючи callback, перевіряти **порядок у `lib/router.js`** і відповідний модуль (`Coach` / `Schedule` / `Training` / `History` тощо)
- Перевіряти цю таблицю при додаванні нових callbacks
- Дотримуватись єдиного формату `ACTION:param1:param2`
- Оновлювати матрицю при змінах

**Для тестування:**
- Кожен callback має бути протестований у відповідному FSM state
- Перевіряти обробку неправильного state (не той крок)
- Тестувати missing parameters

**Для документації:**
- Посилатись на номери з таблиці (#1, #25, #47)
- При описі сценаріїв вказувати callback_data з цієї матриці
