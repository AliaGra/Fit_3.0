# CALLBACK → FSM STATE → MODULE MATRIX

**Версія:** 1.1  
**Дата:** 17.02.2026  
**Призначення:** Повна матриця співвідношень callback_data, FSM станів та обробників

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
| 1 | `REG_NEW` | `WAITING_FOR_START_CHOICE` | `reg_role` | `Registration.handleCallback()` | Вибір "Нова реєстрація" |
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
| 12 | `CITY:{cityName}` | `reg_city` | `reg_gender` або фініш | `Registration.handleCallback()` | Вибір міста зі списку |

### Таблиця 1.2: Registration Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 1 | `reg_invite_input` | Текст (код) | `startsWith('INVITE_')` | `null` (фініш) | `Registration.handleTextMessage()` |
| 2 | `reg_first_name` | Текст (ім'я) | Не порожнє, 2-30 символів | `reg_last_name` або `reg_continue` | `Registration.handleTextMessage()` |
| 3 | `reg_last_name` | Текст (прізвище) | Не порожнє, 2-50 символів | `reg_city` | `Registration.handleTextMessage()` |
| 4 | `reg_city` | Текст (місто) | Не порожнє, 2-50 символів | `reg_gender` (student) або `reg_instagram` (coach) | `Registration.handleTextMessage()` |
| 5 | `reg_birth_date` | Текст (дата) | `dd.mm.yyyy`, валідна дата | `reg_city` (student) або `reg_instagram` (coach) | `Registration.handleTextMessage()` |
| 6 | `reg_height` | Текст (число) | 100-250 см | `reg_city` (student) | `Registration.handleTextMessage()` |
| 7 | `reg_instagram` | Текст (@username) | Опціонально, `@` або порожньо | `reg_calendar_id` | `Registration.handleTextMessage()` |
| 8 | `reg_calendar_id` | Текст (ID) | Email формат або порожньо | `null` (фініш) | `Registration.handleTextMessage()` |

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
| 21 | `TRAINING_START` | `null` (Головне меню) | Показ режимів | `Training.handleCallback()` | Почати тренування |
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
Приклад роутингу в Router:
javascript// Додати в handleCallback_ функцію:

// 3B. Training SELF Mode
if (action.startsWith('TRAINING_SELF_') || action.startsWith('SELF_')) {
  return Training.handleCallback(chatId, action, params);
}

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

🔍 ОНОВЛЕННЯ ЗМІСТУ ДОКУМЕНТА
Поточний зміст (рядки 8-23):
markdown## 📋 ЗМІСТ

- БЛОК 1: РЕЄСТРАЦІЯ (REGISTRATION MODULE)
- БЛОК 2: ПРОФІЛЬ (PROFILE MODULE)
- БЛОК 3: ТРЕНУВАННЯ (TRAINING MODULE)
- БЛОК 4: ІСТОРІЯ (HISTORY MODULE)
- БЛОК 5: ТРЕНЕР-УЧЕНЬ (COACH-STUDENT MODULE)
- БЛОК 6: РОЗКЛАД - ТРЕНЕР (SCHEDULE - COACH)
- БЛОК 7: РОЗКЛАД - УЧЕНЬ (SCHEDULE - STUDENT)
- БЛОК 8: МЕНЮ ТА НАВІГАЦІЯ
ОНОВЛЕНИЙ зміст (додати після БЛОК 3):
markdown## 📋 ЗМІСТ

- БЛОК 1: РЕЄСТРАЦІЯ (REGISTRATION MODULE)
- БЛОК 2: ПРОФІЛЬ (PROFILE MODULE)
- БЛОК 3: ТРЕНУВАННЯ (TRAINING MODULE)
- **БЛОК 3B: ТРЕНУВАННЯ - SELF РЕЖИМ (TRAINING MODULE - SELF MODE)** ← NEW!
- БЛОК 4: ІСТОРІЯ (HISTORY MODULE)
- БЛОК 5: ТРЕНЕР-УЧЕНЬ (COACH-STUDENT MODULE)
- БЛОК 6: РОЗКЛАД - ТРЕНЕР (SCHEDULE - COACH)
- БЛОК 7: РОЗКЛАД - УЧЕНЬ (SCHEDULE - STUDENT)
- БЛОК 8: МЕНЮ ТА НАВІГАЦІЯ


=======================================================================================================================

## 🟡 БЛОК 4: ІСТОРІЯ (HISTORY MODULE)

### Таблиця 4.1: History Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 31 | `HISTORY_MENU` | `null` | Показ фільтрів | `Training.handleCallback()` | Відкрити історію |
| 32 | `HISTORY_ALL` | `null` | Показ підфільтрів | `Training.handleCallback()` | Всі тренування |
| 33 | `HISTORY_BY_GROUP` | `null` | Показ груп | `Training.handleCallback()` | За групою м'язів |
| 34 | `HISTORY_BY_EXERCISE` | `null` | Показ груп → вправ | `Training.handleCallback()` | За вправою |
| 35 | `HISTORY_CURRENT` | Після фільтру | Показ поточного | `Training.handleCallback()` | Поточне тренування |
| 36 | `HISTORY_PREVIOUS` | Після фільтру | Показ попереднього | `Training.handleCallback()` | Попереднє тренування |
| 37 | `HISTORY_LAST_N` | Після фільтру | `history_input_n` | `Training.handleCallback()` | Останні N тренувань |
| 38 | `HISTORY_GROUP:{groupId}` | `HISTORY_BY_GROUP` | Показ підфільтрів | `Training.handleCallback()` | Вибір конкретної групи |
| 39 | `HISTORY_EXERCISE:{exId}` | `HISTORY_BY_EXERCISE` | Показ підфільтрів | `Training.handleCallback()` | Вибір конкретної вправи |

### Таблиця 4.2: History Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 22 | `history_input_n` | Число | 1-100 | Показ N тренувань | `Training.handleTextMessage()` | 

---

## 🟠 БЛОК 5: ТРЕНЕР-УЧЕНЬ (COACH-STUDENT MODULE)

### Таблиця 5.1: Coach Student Management Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 40 | `COACH_STUDENTS` | `null` (Coach Menu) | Показ списку | `Registration.handleCallback()` | Список учнів |
| 41 | `COACH_ADD_STUDENT` | `null` (Coach Menu) | `coach_add_student_name` | `Registration.handleCallback()` | Додати учня |
| 42 | `VIEW_STUDENT:{chatId}` | `null` | Показ картки | `Registration.handleCallback()` | Картка учня |
| 43 | `COACH_TRAIN:{chatId}` | `null` | `training_group` | `Training.handleCallback()` | Тренувати учня (Coach Mode) |
| 44 | `COACH_HISTORY:{chatId}` | `null` | Показ фільтрів | `Training.handleCallback()` | Історія учня |
| 45 | `COACH_BOOK:{chatId}` | `null` | Показ слотів | `Schedule.handleCallback()` | Записати учня |
| 46 | `COACH_PROFILE:{chatId}` | `null` | Показ профілю | `Profile.handleCallback()` | Профіль учня |

### Таблиця 5.2: Coach Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 23 | `coach_add_student_name` | Текст (Ім'я Прізвище) | Min 2 слова | Створення інвайту | `Registration.handleTextMessage()` |

### Таблиця 5.3: Pricing (Вартість тренувань) Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 46a | `PRICING_SET_DEFAULT` | `null` (Мої учні) | `pricing_type_select` | `Registration.handleCallback()` | Ввести вартість (тариф за замовчуванням) |
| 46b | `PRICING_SET_INDIVIDUAL` | `null` (Мої учні) | `pricing_select_student` | `Registration.handleCallback()` | Індивідуальна вартість |
| 46c | `PRICING_CHANGE` | `null` (Мої учні) | `pricing_type_select` | `Registration.handleCallback()` | Змінити вартість |
| 46d | `PRICING_TYPE_PERSONAL` | `pricing_type_select` | `pricing_input_amount` | `Registration.handleCallback()` | Тип: персональне |
| 46e | `PRICING_TYPE_SPLIT` | `pricing_type_select` | `pricing_input_amount` | `Registration.handleCallback()` | Тип: спліт |
| 46f | `PRICING_TYPE_TRIO` | `pricing_type_select` | `pricing_input_amount` | `Registration.handleCallback()` | Тип: тріо |
| 46g | `PRICING_STUDENT:{chatId}` | `pricing_select_student` | `pricing_type_select` | `Registration.handleCallback()` | Вибір учня (індивідуальна вартість) |

### Таблиця 5.4: Pricing Text Input States

| № | FSM State | Очікує | Валідація | Наступний State | Обробник |
|---|-----------|--------|-----------|-----------------|----------|
| 23a | `pricing_type_select` | — | Callback (тип) | `pricing_input_amount` | `Registration.handleCallback()` |
| 23b | `pricing_input_amount` | Ціле число (UAH) | PRICE_MIN–PRICE_MAX | `null` (фініш, запис у Pricing) | `Registration.handleTextMessage()` |
| 23c | `pricing_select_student` | — | Callback PRICING_STUDENT:chatId | `pricing_type_select` | `Registration.handleCallback()` |

**Примітка:** Дані FSM (coachId, studentId, тип тренування) зберігаються в State; callback_data для FSM-кроків не містить ID (VETO 1). Для простих операцій дозволено `PRICING_STUDENT:{chatId}`.

---

## 🔴 БЛОК 6: РОЗКЛАД (SCHEDULE MODULE)

### Таблиця 6.1: Schedule Coach Callbacks

| № | Callback_data | FSM State Required | Наступний FSM State | Обробник | Дія |
|---|---------------|-------------------|---------------------|----------|-----|
| 47 | `SCH_MY_SCHEDULE` | `null` (Coach Menu) | Показ записів | `Schedule.handleCallback()` | Мій розклад (тренер) |
| 48 | `SCH_BOOK_COACH:{slotId}` | `null` | `sch_select_student` | `Schedule.handleCallback()` | Записати когось на слот |
| 49 | `SCH_C_REQ:{eventId}_{studentId}` | `null` | `sch_waiting_confirm` | `Schedule.handleCallback()` | Тренер записує учня (запит) |
| 50 | `SCH_CONF:{slotId}` | `null` | Підтвердження | `Schedule.handleCallback()` | Тренер підтверджує запит учня |
| 51 | `SCH_DECLINE:{slotId}` | `null` | Відхилення | `Schedule.handleCallback()` | Тренер відхиляє запит учня |
| 52 | `SCH_CANCEL:{slotId}` | `null` | Скасування | `Schedule.handleCallback()` | Тренер скасовує запис |
| 53 | `SCH_RESCHEDULE:{slotId}` | `null` | `sch_select_new_slot` | `Schedule.handleCallback()` | Тренер переносить |
| 54 | `SCH_COMPLETE:{slotId}` | `null` | Завершення | `Schedule.handleCallback()` | Підтвердити присутність |

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

**Примітка:** Після вибору вправи в ручному плані (PLAN_EXERCISE) показується вибір пресетів сетів (SET_PRESETS за goal/level) або «Ввести вручну» → SET/SINGLE. Акцент-зони: авто-план → «→ Далі до акценту» → askAccentZones → askAvoidZones → showSplitPreview → Підтвердити. Ручний план: після PLAN_DAYS → askAccentZones → askAvoidZones → showSplitPreview → створення плану.

---

## 📊 СТАТИСТИКА CALLBACKS

```
┌────────────────────────────┬─────────┐
│ Модуль                     │ Кількість │
├────────────────────────────┼─────────┤
│ Registration               │ 12      │
│ Profile                    │ 8       │
│ Training (Start + Groups)  │ 10      │
│ History                    │ 9       │
│ Coach-Student + Pricing     │ 14      │  ← +7 Pricing
│ Schedule (Coach)           │ 8       │
│ Schedule (Student)         │ 7       │
│ Navigation                 │ 5       │
│ Library                    │ 3       │
├────────────────────────────┼─────────┤
│ ВСЬОГО CALLBACKS           │ 76      │
└────────────────────────────┴─────────┘

┌────────────────────────────┬─────────┐
│ FSM Text Input States      │ 26      │  ← +3 pricing_*
├────────────────────────────┼─────────┤
│ ВСЬОГО FSM СТАНІВ          │ 95+     │
└────────────────────────────┴─────────┘
```

---

## 🔍 ПРАВИЛА РОУТИНГУ В ROUTER.GS

### Алгоритм розподілу callbacks:

```javascript
function handleCallback_(chatId, callbackData) {
  const [action, ...params] = callbackData.split(':');
  
  // 1. Registration
  if (action.startsWith('REG_')) {
    return Registration.handleCallback(chatId, action, params);
  }
  
  // 2. Profile
  if (action.startsWith('PROFILE_')) {
    return Profile.handleCallback(chatId, action, params);
  }
  
  // 3. Training & History
  if (action.startsWith('TRAINING_') || action.startsWith('HISTORY_') || 
      action.startsWith('GROUP:') || action.startsWith('EXERCISE:') ||
      action.startsWith('CIRCUIT_') || action.startsWith('LIBRARY_')) {
    return Training.handleCallback(chatId, action, params);
  }
  
  // 4. Coach-Student + Pricing (Вартість тренувань)
  if (action.startsWith('COACH_') || action.startsWith('VIEW_STUDENT:') || action.startsWith('PRICING_')) {
    // Registration: учні, картка учня, PRICING_SET_DEFAULT, PRICING_SET_INDIVIDUAL, PRICING_CHANGE, PRICING_TYPE_*, PRICING_STUDENT:{chatId}
    return Registration.handleCallback(chatId, action, params);
  }
  
  // 5. Schedule
  if (action.startsWith('SCH_')) {
    return Schedule.handleCallback(chatId, action, params);
  }
  
  // 6. Navigation
  if (action.startsWith('BACK_') || action === 'CANCEL_ACTION') {
    return handleNavigation_(chatId, action, params);
  }
  
  // 7. City selection
  if (action === 'CITY') {
    return Registration.handleCallback(chatId, action, params);
  }
  
  Logger.log('Unknown callback: ' + callbackData);
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
- Перевіряти цю таблицю при додаванні нових callbacks
- Дотримуватись єдиного формату `ACTION:param1_param2`
- Оновлювати матрицю при змінах

**Для тестування:**
- Кожен callback має бути протестований у відповідному FSM state
- Перевіряти обробку неправильного state (не той крок)
- Тестувати missing parameters

**Для документації:**
- Посилатись на номери з таблиці (#1, #25, #47)
- При описі сценаріїв вказувати callback_data з цієї матриці
