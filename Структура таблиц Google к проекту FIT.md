
# Структура таблиці ** Users**, используемую в Google Sheets.

Используется для:
* восстановления логики всех модулей;
* синхронизации `sheets NEW vs1`;
* проверки соответствия данных профиля.

# 📌 Название листа
Структура таблиці Users (ОНОВЛЕНО)
Назва листа: Users

📌 Структура колонок (A–T, 20 колонок)
КолонкаЗаголовок (EN)Заголовок (UA)Тип данихОписОбов'язковеACreatedAtДата створенняDateДата та час створення/активації користувача✅BUserIDID користувачаString/NumberУнікальний внутрішній ID (може бути INVITE_XXXX)✅CChatIDID телеграмString/NumberTelegram ChatID (може бути INVITE_XXXX)✅DFirstNameІм'яStringІм'я користувача✅ELastNameПрізвищеStringПрізвище користувача❌FCityМістоStringМісто проживання / тренувань❌GRoleРольEnumРоль: student або coach✅HGenderСтатьEnumСтать: male або female❌IAgeВікNumberПовний вік користувача (автообчислення)❌JGoalЦільEnumЦіль: lose / gain / keep❌KCoachIDТренерNumberChatID тренера (FK → Users.ChatID)❌LBirthDateДата народженняDateДата народження (формат: ДД.ММ.РРРР)❌MHeightЗрістNumberЗріст в см❌NWeightВагаNumberВага в кг❌OWaistТаліяNumberОбхват талії в см❌PHipОбхват стегнаNumberОбхват стегна в см (найширша частина)❌QGlutesЯгодиціNumberОбхват ягодиць в см❌RArmОбхват рукиNumberОбхват руки (біцепс) в см❌SInstagramInstagramString (URL)Посилання на профіль Instagram (обов'язково для тренерів)⚠️TCalendarIdID календаряString (Email)Email Google Calendar для синхронізації (обов'язково для тренерів)⚠️

📌 Технічні вимоги
1. Данні починаються з 3-го рядка

Рядок 1 — заголовки EN (English)
Рядок 2 — заголовки UA (Українська)
Данні: починаючи з A3

2. Колонки фіксовані

Не можна міняти порядок колонок
Не можна видаляти або перейменовувати заголовки EN без оновлення коду

3. Особливі правила для колонок S та T
Instagram (колонка S):

Обов'язково для: Role = coach
Формат: Тільки повний URL
Валідація: ^https?://(www\.)?instagram\.com/
Приклад: https://instagram.com/coach_fitness

CalendarId (колонка T):

Обов'язково для: Role = coach
Формат: Email адреса (Google Calendar ID)
Валідація: ^[^\s@]+@[^\s@]+\.[^\s@]+$
Приклад: coach@gmail.com

4. Всі модулі мають використовувати цю структуру

user.gs
sheets.gs
registration.gs
profile.gs
training.gs
menu.gs
coach-flow


📌 Індекси та Foreign Keys
Primary Key (PK)

ChatID (колонка C) — унікальний ідентифікатор користувача

Unique Key (UK)

UserID (колонка B) — унікальний, може бути INVITE_XXXX

Foreign Keys (FK)

CoachID (колонка K) → Users.ChatID (колонка C)

Зв'язок "Учень → Тренер"
Тільки для Role = student
Для Role = coach завжди порожнє

📌 Enum значення
Role (колонка G)
javascriptROLES = {
  STUDENT: "student",
  COACH: "coach"
}
Gender (колонка H)
javascriptGENDERS = {
  MALE: "male",
  FEMALE: "female"
}
Goal (колонка J)
javascriptGOALS = {
  LOSE: "lose",      // Схуднути
  GAIN: "gain",      // Набрати масу
  KEEP: "keep"       // Підтримувати форму
}

📌 Формати даних
CreatedAt (колонка A)

Тип: Date Object
Формат при записі: new Date()
Формат при читанні: ISO 8601 або uk-UA locale
Приклад: 2026-02-03T14:35:22.000Z

BirthDate (колонка L)

Тип: Date Object
Формат вводу користувачем: ДД.ММ.РРРР
Формат збереження: Date Object
Приклад вводу: 15.05.1995
Приклад збереження: Date Object

Age (колонка I)

Тип: Number
Автообчислення: При оновленні BirthDate
Формула: поточний рік - рік народження
Оновлюється: При зміні BirthDate через User.updateBirthDate()


📌 Приклади записів
Приклад 1: Учень (зареєстрований)
| A          | B         | C         | D      | E        | F     | G       | H      | I  | J    | K         | L          | M   | N  | O  | P  | Q  | R  | S    | T    |
|------------|-----------|-----------|--------|----------|-------|---------|--------|----|----- |-----------|------------|-----|----|----|----|----|----|----- |------|
| 01.02.2026 | 123456789 | 123456789 | Марія  | Коваль   | Одеса | student | female | 29 | lose | 111222333 | 15.05.1995 | 165 | 68 | 72 | 95 | 98 | 32 |      |      |
Приклад 2: Тренер
| A          | B         | C         | D       | E         | F     | G     | H    | I  | J    | K | L          | M   | N  | O  | P  | Q  | R  | S                                    | T                    |
|------------|-----------|-----------|---------|-----------|-------|-------|------|----|----- |---|------------|-----|----|----|----|----|----|--------------------------------------|----------------------|
| 28.01.2026 | 111222333 | 111222333 | Олексій | Тренеров  | Одеса | coach | male | 35 | keep |   | 10.03.1989 | 180 | 85 | 82 | 98 | 102| 40 | https://instagram.com/coach_fitness | coach_fit@gmail.com  |
Приклад 3: Інвайт (неактивований)
| A          | B             | C             | D     | E      | F | G       | H | I | J    | K         | L | M | N | O | P | Q | R | S | T |
|------------|---------------|---------------|-------|--------|---|---------|---|---|------|-----------|---|---|---|---|---|---|---|---|---|
| 31.01.2026 | INVITE_A3F7C2 | INVITE_A3F7C2 | Петро | Іванов |   | student |   |   | keep | 111222333 |   |   |   |   |   |   |   |   |   |
Ознаки неактивованого інвайту:

UserID === ChatID === "INVITE_XXXX"
CoachID вже заповнений
Більшість полів порожні


📌 Службові нотатки
Поля профілю (анкета)

BirthDate, Height, Weight, Waist, Hip, Glutes, Arm, City
Age (автообчислення при зміні BirthDate)

Поля для ролей

Role, CoachID, Instagram, CalendarId

Поля внутрішнього ядра

CreatedAt, UserID, ChatID

Зв'язок Тренер-Учень

Учень може мати CoachID (FK → Users.ChatID тренера)
Тренер не має CoachID (завжди порожнє)
Один тренер може мати багато учнів (one-to-many)

======================================================================

# Структура таблиці ExerciseLibrary (ВИПРАВЛЕНО)
Назва листа: ExerciseLibrary (без пробілу!)

📌 Структура колонок (A–L, 12 колонок)
КолонкаEN HeaderUA HeaderТип данихОписОбов'язковеAIDНомер упражненияNumberУнікальний ID вправи✅BGroupNameГрупа м'язівStringКатегорія / група м'язів для швидкого вибору✅CExerciseNameНазва вправиStringОсновна назва вправи (для кнопок і запису)✅DEquipmentОбладнанняStringВикористовуваний інвентар❌EActiveСтатус активностіEnumYES / NO (чи використовується вправа в боті)✅FCommentКоментарStringДодаткові нотатки тренера❌GFocusPointКлючовий фокусStringНа що звертати увагу (довідково)❌HCommonMistakesЗвичайні помилкиStringЧасті помилки виконання (довідково)❌IProperFeelingЩо відчуваємоStringЩо має відчувати учень (довідково)❌JStaticHoldsОсобливості статикиStringСпеціальна інформація по статиці (довідково)❌KYouTubeLinkПосилання YouTubeString (URL)Тимчасове посилання на стороннє навчальне відео❌LMyChannelLinkПосилання з мого каналуString (URL)Авторське навчальне відео❌
⚠️ КРИТИЧНО: Колонка H тепер називається CommonMistakes (множина), не CommonMistake!

📌 Технічні вимоги
1. Данні починаються з 3-го рядка

Рядок 1 — англійські заголовки (EN)
Рядок 2 — українські заголовки (UA)
Данні: починаючи з A3

2. Порядок колонок фіксований
❗ Не можна міняти порядок без зміни sheets.gs
3. Використання в модулі sheets.gs
Функція getAllExercises() має повертати всі 12 колонок:
javascriptfunction getAllExercises() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('ExerciseLibrary');
  
  const data = sheet.getRange('A3:L').getValues();
  
  return data
    .filter(row => row[0]) // ID не порожнє
    .map(row => ({
      id: row[0],                    // A: ID
      groupName: row[1],             // B: GroupName
      exerciseName: row[2],          // C: ExerciseName
      equipment: row[3],             // D: Equipment
      active: row[4],                // E: Active
      comment: row[5],               // F: Comment
      focusPoint: row[6],            // G: FocusPoint
      commonMistakes: row[7],        // H: CommonMistakes ← ВИПРАВЛЕНО!
      properFeeling: row[8],         // I: ProperFeeling
      staticHolds: row[9],           // J: StaticHolds
      youtubeLink: row[10],          // K: YouTubeLink
      myChannelLink: row[11]         // L: MyChannelLink
    }));
}
4. Використання в модулі training.gs

При виборі групи → використовувати GroupName
При виборі вправи → ExerciseName
Довідкові дані (FocusPoint, CommonMistakes, ProperFeeling) доступні тренеру
Фільтрація: Active = "NO" → приховати вправу


📌 Enum значення
Active (колонка E)
javascriptACTIVE_STATUS = {
  YES: "YES",
  NO: "NO"
}
Логіка фільтрації:

Active === "YES" → показувати вправу
Active === "NO" → не показувати (архівована)


📌 Формати даних
ID (колонка A)

Тип: Number
Унікальність: Кожна вправа має унікальний ID
Автоінкремент: Рекомендовано

GroupName (колонка B)
Можливі значення (українською):

Груди
Спина
Ноги
Плечі
Руки
Прес
Кардіо

YouTubeLink та MyChannelLink (колонки K, L)

Формат: Повний URL
Валідація: ^https?://
Приклад: https://youtube.com/watch?v=xxxxx


📌 Приклади записів
Приклад 1: Активна вправа з повною інформацією
| A  | B      | C                    | D      | E   | F                    | G                        | H                                  | I                           | J                  | K                           | L                          |
|----|--------|----------------------|--------|-----|----------------------|--------------------------|------------------------------------|-----------------------------|--------------------|-----------------------------|----------------------------|
| 1  | Груди  | Жим штанги лежачи    | Штанга | YES | Базова вправа        | Зведення лопаток         | Локті надто широко, тремтіння      | Напруга в грудях            |                    | https://youtube.com/xxxxx   | https://mysite.com/video1  |
Приклад 2: Неактивна вправа (архівована)
| A  | B     | C                | D         | E  | F                          | G | H | I | J | K | L |
|----|-------|------------------|-----------|----|----------------------------|---|---|---|---|---|---|
| 42 | Руки  | Згинання на лаві | Гантелі   | NO | Застаріла техніка          |   |   |   |   |   |   |
Приклад 3: Вправа для статики
| A  | B    | C      | D      | E   | F            | G                    | H                        | I                     | J                                    | K | L |
|----|------|--------|--------|-----|--------------|----------------------|--------------------------|----------------------|--------------------------------------|---|---|
| 15 | Прес | Планка | Власна | YES | Статична     | Рівна лінія тіла     | Провисання стегон        | Напруга в животі     | Тримати 30-60 сек, не затримувати дих |   |   |

📌 Використання тренером
Можливості перегляду довідкової інформації:

FocusPoint — на що звертати увагу
CommonMistakes — частіки помилки учня
ProperFeeling — що має відчувати учень
Comment — додаткові нотатки
YouTubeLink / MyChannelLink — навчальні відео

UI тренера:
📚 **Деталі вправи: Жим штанги лежачи**

🎯 **Фокус:**
Зведення лопаток, опускання штанги до середини грудей

⚠️ **Часті помилки:**
Локті надто широко, тремтіння, відрив ягодиць від лави

✅ **Що має відчувати:**
Напруга в грудях, стабільність плечей

📹 **Навчальне відео:**
[Переглянути на YouTube]
[Мій навчальний відео]

📌 Службові нотатки

Training.gs має будувати меню на основі GroupName та ExerciseName
Coach Mode має доступ до всіх довідкових колонок
Active фільтрує вправи (показувати тільки YES)
YouTubeLink / MyChannelLink можуть бути відправлені учню
Можливе розширення — додати категорії рівня тренера (початківець/середній/продвинутий)
===============================================================================

# Структура таблицы **MeasurementsHistory** (FIT 3.0)

Документ фиксирует **каноничную структуру** листа MeasurementsHistory, согласно присланному скриншоту.

Эта таблица используется для:

* хранения истории замеров пользователя,
* отображения динамики ученику и тренеру,
* аналитики прогресса,
* связи с профилем 3.0.

---

# 📌 Название листа

**MeasurementsHistory**

---

# 📌 Структура колонок (A–I)

| Колонка | EN Header | UA/RU Header | Описание                                 |
| ------- | --------- | ------------ | ---------------------------------------- |
| **A**   | ChatID    | ID чату      | Telegram ChatID пользователя             |
| **B**   | Date      | Дата         | Дата замера                              |
| **C**   | Height    | Зріст        | Рост пользователя (см)                   |
| **D**   | Weight    | Вага         | Вес (кг)                                 |
| **E**   | Waist     | Талія        | Обхват талии                             |
| **F**   | Hip       | Стегна       | Обхват бедра                             |
| **G**   | Glutes    | Ягодиці      | Обхват ягодиц                            |
| **H**   | Arm       | Рука         | Обхват руки (бицепс)                     |
| **I**   | Source    | Джерело      | Источник данных: profile/training/manual |

---

# 📌 Технические правила

### 1. Данные начинаются с **3-й строки**

* строка 1 — английские заголовки
* строка 2 — украинские заголовки
* данные идут с A3

### 2. Порядок колонок фиксирован

❗ Изменение порядка или названий EN-заголовков приведёт к ошибкам в `sheets NEW vs1`.

### 3. Использование в модуле `sheets`

Необходима функция:

```js
insertMeasurementEntry(chatId, date, height, weight, waist, hip, glutes, arm, source)
```

которая добавляет строку вида:

```
[A, B, C, D, E, F, G, H, I]
```

Также потребуется:

```js
getMeasurementHistory(chatId)
```

для отображения тренеру.

### 4. Использование в модуле `profile`

* После заполнения анкеты **каждый замер** должен писаться в MeasurementsHistory.
* Помимо обновления Users, система должна сохранять:

  * первый замер как baseline,
  * каждый последующий — как snapshot.

### 5. Использование тренером

* просмотр динамики ученика
* анализ прогресса
* визуализация в будущем (не в коде сейчас, но структура уже должна быть готова)

---

# 📌 Служебные заметки

* ChatID — основной ключ поиска.
* Age здесь **не записывается**, возраст считается из BirthDate → хранится в Users.
* Height может быть пустым, если не менялся.
* Source фиксирует, откуда пришли данные (например: "profile").

---

=================================================================================
# Структура таблицы **TrainingPlanExercises** (FIT 3.0)

Документ фиксирует **каноничную структуру** листа TrainingPlanExercises на основе предоставленного скриншота.

Эта таблица используется для:

* хранения упражнений каждого тренировочного плана,
* отображения программы тренировок ученику,
* передачи тренеру полной структуры плана,
* связи между упражнениями и днями плана.

---

# 📌 Название листа

**TrainingPlanExercises**

---

# 📌 Структура колонок (A–G)

| Колонка | EN Header    | UA Header    | Описание                                                        |
| ------- | ------------ | ------------ | --------------------------------------------------------------- |
| **A**   | PlanID       | ID плану     | Уникальный идентификатор плана, к которому относится упражнение |
| **B**   | Day          | День         | Порядковый номер тренировочного дня (1,2,3…)                    |
| **C**   | ExerciseName | Назва вправи | Название упражнения из ExerciseLibrary                          |
| **D**   | Sets         | Підходи      | Количество подходов                                             |
| **E**   | Reps         | Повторення   | Количество повторений                                           |
| **F**   | RestSec      | Відпочинок   | Время отдыха в секундах                                         |
| **G**   | Notes        | Коментар     | Комментарии тренера                                             |

---

# 📌 Технические требования

### 1. Данные начинаются с **3-й строки**

* строка 1 — английские заголовки
* строка 2 — украинские заголовки
* данные идут с A3

### 2. Порядок колонок фиксирован

❗ Менять порядок или названия EN-заголовков без обновления кодовой базы запрещено.

### 3. Использование в модуле `sheets`

Необходимы функции:

#### Получение всех упражнений для плана

```js
getTrainingPlanExercises(planId)
```

возвращает массив записей:

```js
{
  planId,
  day,
  exerciseName,
  sets,
  reps,
  restSec,
  notes
}
```

#### Добавление упражнения в план

```js
insertTrainingPlanExercise(planId, day, exerciseName, sets, reps, restSec, notes)
```

### 4. Использование в модуле `training`

* отображение дня тренировок по плану
* отображение упражнения и инструкций
* передача тренеру плана

### 5. Использование тренером

* составление программы
* редактирование упражнений плана
* просмотр плана ученика

---

# 📌 Служебные заметки для восстановления логики

* ExerciseName должен совпадать с именем из ExerciseLibrary.
* PlanID должен совпадать с ID в TrainingPlans.
* Day используется для группировки упражнений внутри одного плана.
* Notes может быть пустым, но колонка должна существовать.

---
======================================================================

#Структура таблиці WorkoutSchedule
Назва листа: WorkoutSchedule

📌 Призначення
Таблиця для:

Реєстрації та управління статусами тренувальних слотів
Запису учнів на тренування
Синхронізації з Google Calendar
Відстеження історії змін статусів
Збереження вартості проведеного тренування (колонки I, J)


📌 Структура колонок (A–J, 10 колонок)
КолонкаEN HeaderUA HeaderТип данихОписОбов'язковеAIDУнікальний ідентифікаторString (UUID)Унікальний ID запису✅BCoachIDChatID тренераNumberTelegram ChatID тренера✅CStudentIDChatID учняNumberTelegram ChatID учня (порожнє якщо AVAILABLE)❌DDateДата тренуванняDateДата тренування (формат: РРРР-ММ-ДД)✅ETimeЧас початкуStringЧас початку тренування (формат: ГГ:ХХ)✅FStatusПоточний статусEnumAVAILABLE, REQUESTED, BOOKED, COMPLETED, CANCELED✅GUpdatedAtЧас останнього оновленняDateTimestamp останньої зміни статусу✅HCalEventIDID події в CalendarStringID пов'язаної події в Google Calendar❌IPriceChargedВартість з одного учняNumberСума з одного учня; заповнюється при Status = COMPLETED❌JCurrencyВалютаStringВалюта (наприклад UAH); заповнюється разом з PriceCharged❌

📌 Технічні вимоги
1. Данні починаються з 3-го рядка

Рядок 1 — англійські заголовки (EN)
Рядок 2 — українські описи
Данні: починаючи з A3

2. Порядок колонок фіксований
❗ Будь-які зміни порядку призведуть до помилок в schedule.gs та calendar.gs
3. ID генерується автоматично
javascriptconst recordId = Utilities.getUuid(); // "a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d"
4. Date та Time - окремі колонки

Date зберігається як Date Object
Time зберігається як String у форматі "HH:mm"
Причина: зручність фільтрації та відображення

5. UpdatedAt оновлюється при кожній зміні
При будь-якій зміні Status → UpdatedAt = new Date()

📌 Enum значення
Status (колонка F)
javascriptconst SCHEDULE_STATUS = {
  AVAILABLE: "AVAILABLE",     // Вільний слот, тренер доступний
  REQUESTED: "REQUESTED",     // Учень подав запит на запис
  BOOKED: "BOOKED",          // Запис підтверджено тренером
  COMPLETED: "COMPLETED",     // Тренування завершено
  CANCELED: "CANCELED"        // Запис скасовано (тренером або учнем)
};
Переходи статусів:
AVAILABLE → REQUESTED → BOOKED → COMPLETED
    ↓           ↓           ↓
CANCELED    CANCELED    CANCELED
Деталі:

AVAILABLE:

Тренер створив вільний слот
StudentID = null
Доступний для запису


REQUESTED:

Учень подав запит на запис
StudentID = ChatID учня
Очікує підтвердження тренера


BOOKED:

Тренер підтвердив запис
StudentID = ChatID учня
Синхронізовано з Calendar (CalEventID заповнено)


COMPLETED:

Тренування відбулось
Можлива прив'язка до BotTrainingData
При переході в COMPLETED заповнюються I (PriceCharged), J (Currency) — поточна ціна з листа Pricing (з поділом на 1/2/3 для персональна/спліт/тріо)


CANCELED:

Запис скасовано
Може бути скасовано на будь-якому етапі
StudentID зберігається (для історії)




📌 Формати даних
A: ID

Тип: String (UUID)
Формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Генерація: Utilities.getUuid()
Унікальність: Кожен запис має унікальний ID

B: CoachID

Тип: Number
Формат: Telegram ChatID (8-10 цифр)
FK: → Users.ChatID (де Role = 'coach')
Приклад: 111222333

C: StudentID

Тип: Number або null
Формат: Telegram ChatID або порожнє
FK: → Users.ChatID (де Role = 'student')
Правило:

null якщо Status = AVAILABLE
число якщо Status = REQUESTED, BOOKED, COMPLETED, CANCELED



D: Date

Тип: Date Object
Формат збереження: Date Object
Формат відображення: ДД.ММ.РРРР (українська локаль)
Приклад збереження: new Date(2026, 1, 10) (10 лютого 2026)
Приклад відображення: 10.02.2026

E: Time

Тип: String
Формат: "HH:mm" (24-годинний)
Валідація: /^\d{2}:\d{2}$/
Приклади: "10:00", "14:30", "18:00"

F: Status

Тип: String (Enum)
Можливі значення: Тільки з SCHEDULE_STATUS enum
Валідація: Перевірка на наявність в списку дозволених

G: UpdatedAt

Тип: Date Object
Формат: new Date()
Оновлюється: При кожній зміні Status
Формат відображення: ДД.ММ.РРРР ГГ:ХХ

H: CalEventID

Тип: String або null
Формат: Google Calendar Event ID
Приклад: "abc123def456"
Заповнюється: При створенні події в Calendar (Status = BOOKED)
Використання: Для оновлення/видалення подій в Calendar

I: PriceCharged

Тип: Number або порожньо. Сума з одного учня. Заповнюється при Status = COMPLETED з листа Pricing (поділ на 1/2/3 за типом).

J: Currency

Тип: String або порожньо. Приклад: "UAH". Заповнюється разом з PriceCharged при COMPLETED.


📌 Індекси та Foreign Keys
Primary Key (PK)

ID (колонка A) — унікальний ідентифікатор запису

Foreign Keys (FK)

CoachID (колонка B) → Users.ChatID (де Role = 'coach')
StudentID (колонка C) → Users.ChatID (де Role = 'student')

Індекси для пошуку
Рекомендовані індекси для швидкого пошуку:

CoachID + Date — пошук слотів тренера на дату
StudentID + Status — пошук записів учня
Status — фільтрація по статусу


📌 Бізнес-правила
1. Створення слоту (AVAILABLE)
javascript// Тренер створює вільний слот
{
  id: Utilities.getUuid(),
  coachId: 111222333,
  studentId: null,           // ← Порожнє
  date: new Date(2026, 1, 10),
  time: "10:00",
  status: "AVAILABLE",       // ← Початковий статус
  updatedAt: new Date(),
  calEventId: null           // ← Ще не створено в Calendar
}
2. Запит на запис (AVAILABLE → REQUESTED)
javascript// Учень подає запит
// Оновлюємо запис:
{
  // ... інші поля
  studentId: 987654321,      // ← Заповнюється
  status: "REQUESTED",       // ← Змінюється
  updatedAt: new Date()      // ← Оновлюється
}
3. Підтвердження запису (REQUESTED → BOOKED)
javascript// Тренер підтверджує
// 1. Оновлюємо запис:
{
  // ... інші поля
  status: "BOOKED",
  updatedAt: new Date(),
  calEventId: "cal_event_123"  // ← Створюється подія в Calendar
}

// 2. Створюємо подію в Google Calendar:
Calendar.createEvent({
  summary: "Тренування: [Ім'я учня]",
  start: { dateTime: "2026-02-10T10:00:00+02:00" },
  end: { dateTime: "2026-02-10T11:00:00+02:00" }
})
4. Скасування (будь-який → CANCELED)
javascript// Скасування може статися на будь-якому етапі
{
  // ... інші поля
  status: "CANCELED",
  updatedAt: new Date()
  // studentId залишається (для історії)
  // calEventId залишається (може бути видалено з Calendar)
}
5. Завершення (BOOKED → COMPLETED)
javascript// Після тренування
{
  // ... інші поля
  status: "COMPLETED",
  updatedAt: new Date()
}

📌 Приклади записів
Приклад 1: Вільний слот
| A                                    | B         | C    | D          | E     | F         | G              | H    |
|--------------------------------------|-----------|------|------------|-------|-----------|----------------|------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 |      | 10.02.2026 | 10:00 | AVAILABLE | 03.02.2026 14:00 |      |
Приклад 2: Запит учня
| A                                    | B         | C         | D          | E     | F         | G              | H    |
|--------------------------------------|-----------|-----------|------------|-------|-----------|----------------|------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | REQUESTED | 03.02.2026 15:30 |      |
Приклад 3: Підтверджений запис
| A                                    | B         | C         | D          | E     | F      | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|--------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | BOOKED | 03.02.2026 16:00 | cal_evt_123  |
Приклад 4: Завершене тренування
| A                                    | B         | C         | D          | E     | F         | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|-----------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | COMPLETED | 10.02.2026 11:05 | cal_evt_123  |
Приклад 5: Скасований запис
| A                                    | B         | C         | D          | E     | F        | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|----------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | CANCELED | 05.02.2026 09:20 | cal_evt_123  |

📌 Використання в модулях
Schedule.gs (основний модуль)
Функції:
javascript// Створити вільний слот
createAvailableSlot(coachId, date, time)

// Учень подає запит
requestBooking(studentId, slotId)

// Тренер підтверджує
confirmBooking(coachId, slotId)

// Скасування
cancelBooking(slotId, initiatorId)

// Отримати слоти
getAvailableSlots(coachId, date)
getStudentBookings(studentId)
getCoachSchedule(coachId, startDate, endDate)

Calendar.gs (інтеграція з Google Calendar)
Функції:
javascript// Створити подію в Calendar
createCalendarEvent(slotData)

// Оновити подію
updateCalendarEvent(calEventId, changes)

// Видалити подію
deleteCalendarEvent(calEventId)

// Синхронізувати
syncScheduleWithCalendar(coachId)

Sheets.gs (доступ до даних)
Функції:
javascript// Вставка
insertScheduleRecord(data)

// Оновлення
updateScheduleStatus(slotId, newStatus)

// Пошук
findScheduleById(slotId)
findScheduleByCoach(coachId, date)
findScheduleByStudent(studentId)

// Фільтрація
getScheduleByStatus(status)
getScheduleByDateRange(startDate, endDate)

📌 Валідація даних
Перевірка при створенні слоту
javascriptfunction validateSlot(data) {
  // 1. CoachID існує та є тренером
  const coach = User.getByChatId(data.coachId);
  if (!coach || coach.role !== 'coach') {
    throw new Error("Невірний ID тренера");
  }
  
  // 2. Date не в минулому
  const now = new Date();
  if (data.date < now) {
    throw new Error("Не можна створити слот в минулому");
  }
  
  // 3. Time правильного формату
  if (!/^\d{2}:\d{2}$/.test(data.time)) {
    throw new Error("Невірний формат часу");
  }
  
  // 4. Немає дублікатів (той же CoachID, Date, Time)
  const existing = Sheets.findScheduleByCoach(data.coachId, data.date);
  const duplicate = existing.find(slot => slot.time === data.time);
  if (duplicate) {
    throw new Error("Слот вже існує");
  }
  
  return true;
}

Перевірка при зміні статусу
javascriptfunction validateStatusChange(currentStatus, newStatus) {
  // Дозволені переходи
  const allowedTransitions = {
    'AVAILABLE': ['REQUESTED', 'CANCELED'],
    'REQUESTED': ['BOOKED', 'CANCELED'],
    'BOOKED': ['COMPLETED', 'CANCELED'],
    'COMPLETED': [],  // Кінцевий стан
    'CANCELED': []    // Кінцевий стан
  };
  
  if (!allowedTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Неможливо змінити ${currentStatus} → ${newStatus}`);
  }
  
  return true;
}

📌 Службові нотатки
Життєвий цикл запису
1. Створення:
   Тренер → createAvailableSlot()
   Status: AVAILABLE
   StudentID: null

2. Запит:
   Учень → requestBooking()
   Status: AVAILABLE → REQUESTED
   StudentID: заповнюється

3. Підтвердження:
   Тренер → confirmBooking()
   Status: REQUESTED → BOOKED
   CalEventID: створюється

4. Завершення:
   Автоматично або вручну
   Status: BOOKED → COMPLETED

Альтернатива: Скасування на будь-якому етапі
   Status: * → CANCELED

Зв'язок з іншими таблицями
1. Users:

CoachID → Users.ChatID (Role = coach)
StudentID → Users.ChatID (Role = student)

2. BotTrainingData:

Після COMPLETED можна прив'язати тренування
Запис в BotTrainingData з ChatID = StudentID
Можлива прив'язка через Date та Time

3. Google Calendar:

CalEventID зв'язує з подією в Calendar
Двосторонній зв'язок (можна оновлювати обидва)


Типові запити
Вільні слоти тренера на дату:
javascriptWHERE CoachID = X
  AND Date = Y
  AND Status = 'AVAILABLE'
ORDER BY Time ASC
Записи учня:
javascriptWHERE StudentID = X
  AND Status IN ('REQUESTED', 'BOOKED')
ORDER BY Date ASC, Time ASC
Розклад тренера на тиждень:
javascriptWHERE CoachID = X
  AND Date BETWEEN start AND end
ORDER BY Date ASC, Time ASC

Версія структури: 1.0
Дата створення: 03.02.2026
Статус: ЕТАЛОН (Single Source of Truth)

========================================================================

# 📌 Название листа **BotTrainingData**

---

# 📌 Структура колонок (A–H)

| Колонка | EN Header  | RU/UA Header    | Описание                               |
| ------- | ---------- | --------------- | -------------------------------------- |
| **A**   | IDrecords  | ID записи       | Уникальный ID записи тренировки        |
| **B**   | Date       | Дата            | Дата выполнения упражнения (timestamp) |
| **C**   | ExerciseID | ID Упражнения   | ID упражнения из ExerciseLibrary       |
| **D**   | Exercise   | Название        | Название упражнения (кеш для удобства) |
| **E**   | Weight     | Вес             | Вес снаряда / тела                     |
| **F**   | Reps       | Повторы         | Количество повторений                  |
| **G**   | Set        | Подход          | Номер подхода                          |
| **H**   | ChatID     | ID Пользователя | Telegram ChatID пользователя           |

---

# 📌 Технические правила

### 1. Данные начинаются с **3-й строки**

* строка 1 — английские заголовки
* строка 2 — русские / украинские заголовки
* данные идут с A3

### 2. Порядок колонок фиксирован

Любое изменение приведёт к повреждению данных.

### 3. Использование в модуле `sheets`

Необходимы функции:

#### Добавление записи тренировки

```js
insertTrainingEntry(id, date, exerciseId, exerciseName, weight, reps, set, chatId)
```

должно дописывать строку в **строго A–H**.

#### Получение всех тренировок пользователя

```js
getTrainingHistory(chatId)
```

возвращает массив:

```js
{
  id,
  date,
  exerciseId,
  exerciseName,
  weight,
  reps,
  set,
  chatId
}
```

### 4. Использование в модуле `training`

* После каждого упражнения запись отправляется в BotTrainingData.
* IDrecords создаётся автоматически (лучше timestamp+random или auto-increment).

### 5. Использование тренером

* Просмотр истории ученика.
* Анализ выполнения.
* Выявление слабых мест.

---

# 📌 Служебные заметки

* ExerciseName дублирует имя из ExerciseLibrary для удобства.
* ExerciseID должен соответствовать ID из ExerciseLibrary.
* Date хранится как timestamp (YYYY/MM/DD HH:MM:SS).
* ChatID — основной ключ фильтрации.

---
==========================================================

# Структура таблиці **Pricing** (FIT 3.0)

Назва листа: **Pricing**

📌 Призначення
Таблиця для збереження вартості тренувань тренера:
* **За замовчуванням** — один рядок на тренера (CoachID заповнено, StudentID порожній): ціни за типами (персональне / спліт / тріо).
* **Індивідуально** — рядки з конкретним StudentID: окремі ціни для учня.

Вартість застосовується з моменту введення; при переході слоту в COMPLETED у WorkoutSchedule записуються колонки I (PriceCharged), J (Currency) з поділом ціни на 1/2/3 за типом тренування.

📌 Структура колонок (A–G, 7 колонок)

| Колонка | EN Header   | UA Header        | Тип даних | Опис | Обов'язкове |
|---------|-------------|------------------|-----------|------|-------------|
| A       | CoachID     | ChatID тренера   | Number    | Telegram ChatID тренера | ✅ |
| B       | StudentID   | ChatID учня      | Number/пусто | Telegram ChatID учня; порожнє = тариф за замовчуванням тренера | ❌ |
| C       | PricePersonal | Ціна персональне | Number    | Ціна за одне персональне тренування (ціле число, UAH) | ❌ |
| D       | PriceSplit  | Ціна спліт       | Number    | Ціна за тренування на двох (на одного учня = ціна/2) | ❌ |
| E       | PriceTrio   | Ціна тріо        | Number    | Ціна за тренування на трьох (на одного учня = ціна/3) | ❌ |
| F       | Currency    | Валюта           | String    | Валюта (наприклад UAH) | ❌ |
| G       | UpdatedAt   | Оновлено         | Date      | Час останнього оновлення запису | ❌ |

📌 Технічні вимоги
* Дані починаються з 3-го рядка (рядок 1 — EN заголовки, рядок 2 — UA, з A3 — дані).
* Унікальність: один рядок на пару (CoachID, StudentID); для тарифу за замовчуванням StudentID порожній.
* FK: CoachID → Users.ChatID (Role = coach), StudentID → Users.ChatID (Role = student) або порожнє.

📌 Використання в модулях
* **sheets.gs**: getCoachPricing, getStudentPricing, getCurrentPrice, setPricing; при COMPLETED — запис у WorkoutSchedule (I, J).
* **registration.gs**: FSM введення/зміни вартості (Ввести вартість, Індивідуальна вартість, Змінити вартість); відображення вартості в картці учня.
* **training.gs**: при завершенні тренування — отримання поточної ціни та запис PriceCharged, Currency у слот; звіти за доходами за період.

---

# Структура таблицы **CityList** (FIT 3.0)

Документ фиксирует **каноничную структуру листа CityList**, согласно предоставленному скриншоту.

Эта таблица используется для:

* автоподстановки города при заполнении профиля ученика,
* фильтрации тренеров по городу,
* корректной работы модуля `profile` (ввод города),
* корректной работы `sheets` при поиске доступных городов.

---

# 📌 Название листа

**CityList**

---

# 📌 Структура колонок (A–B)

| Колонка | EN Header | UA Header                             | Описание                            |
| ------- | --------- | ------------------------------------- | ----------------------------------- |
| **A**   | CityID    | унікальний ID міста (число або рядок) | Уникальный идентификатор города     |
| **B**   | CityName  | назва міста українською               | Название города на украинском языке |

---

# 📌 Технические правила

### 1. Данные начинаются с **3-й строки**

* строка 1 — английские заголовки
* строка 2 — украинские заголовки
* данные идут с A3

### 2. Порядок колонок фиксирован

* A = CityID
* B = CityName

### 3. Использование в модуле `sheets`

CityList - функції в Sheets.gs
javascript// Отримати всі міста
function getAllCities() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('CityList');
  
  const data = sheet.getRange('A3:B').getValues();
  
  return data
    .filter(row => row[0])  // CityID не порожнє
    .map(row => ({
      cityId: row[0],       // A: CityID
      cityName: row[1]      // B: CityName
    }));
}

// Пошук міст по префіксу (для автопідстановки)
function searchCities(prefix) {
  const allCities = getAllCities();
  const lowerPrefix = prefix.toLowerCase();
  
  return allCities.filter(city => 
    city.cityName.toLowerCase().startsWith(lowerPrefix)
  );
}

// Перевірка існування міста
function cityExists(cityName) {
  const allCities = getAllCities();
  return allCities.some(city => 
    city.cityName.toLowerCase() === cityName.toLowerCase()
  );
}
Використання в Profile.gs:
javascript// При введенні міста учнем
const cities = Sheets.searchCities(userInput);  // "Оде" → ["Одеса"]

// Валідація перед збереженням
if (!Sheets.cityExists(selectedCity)) {
  return "Місто не знайдено в списку";
}```

### 4. Использование в модуле `profile`

* Автоподстановка города при вводе.
* Проверка существования города.
* Запись выбранного города в таблицу Users.

### 5. Связь с тренерами

* При выборе тренера → фильтрация списка тренеров по CityName.

---

# 📌 Служебные заметки

* CityID может быть как числовым, так и строковым.
* Вся локализация для пользователя — украинская (CityName).
* В `constants` будут только enum для FSM, не список городов.

---

=============================================================
Структура  таблиц в Гугл Шитс:коротко
1.	Users:
CreatedAt	UserID	ChatID	FirstName	LastName	City	Role	Gender	Age	Goal	CoachID	BirthDate	Height	Weight	Waist	Hip	Glutes	Arm
2.	Exercise Library: Роб, !обрати внимание, меняю название, убираю пробел, теперь эта таблица называется: ExerciseLibrary:
ID	GroupName	ExerciseName	Equipment	Active	Comment	FocusPoint	CommonMistakes	ProperFeeling	StaticHolds	YouTubeLink	MyChannelLink
3.	BotTrainingData:
IDrecords	Date	ExerciseID	Exercise	Weight	Reps	Set	ChatID
4.	CityList:
CityID	CityName
5.	TrainingPlanExercises:
PlanID	Day	ExerciseName	Sets	Reps	RestSec	Notes
6.	TrainingPlans:
PlanID	CoachID  	PlanName	Goal    	 Level 	Description	 IsActive
7.	MeasurementsHistory
ChatID	Date	Height	Weight	Waist	Hip	Glutes	Arm	Source



====

Структура таблиці WorkoutSchedule
Назва листа: WorkoutSchedule

📌 Призначення
Таблиця для:

Реєстрації та управління статусами тренувальних слотів
Запису учнів на тренування
Синхронізації з Google Calendar
Відстеження історії змін статусів
Збереження вартості проведеного тренування (колонки I, J)


📌 Структура колонок (A–J, 10 колонок)
КолонкаEN HeaderUA HeaderТип данихОписОбов'язковеAIDУнікальний ідентифікаторString (UUID)Унікальний ID запису✅BCoachIDChatID тренераNumberTelegram ChatID тренера✅CStudentIDChatID учняNumberTelegram ChatID учня (порожнє якщо AVAILABLE)❌DDateДата тренуванняDateДата тренування (формат: РРРР-ММ-ДД)✅ETimeЧас початкуStringЧас початку тренування (формат: ГГ:ХХ)✅FStatusПоточний статусEnumAVAILABLE, REQUESTED, BOOKED, COMPLETED, CANCELED✅GUpdatedAtЧас останнього оновленняDateTimestamp останньої зміни статусу✅HCalEventIDID події в CalendarStringID пов'язаної події в Google Calendar❌IPriceChargedВартість з одного учняNumberСума з одного учня; заповнюється при Status = COMPLETED❌JCurrencyВалютаStringВалюта (наприклад UAH); заповнюється разом з PriceCharged❌

📌 Технічні вимоги
1. Данні починаються з 3-го рядка

Рядок 1 — англійські заголовки (EN)
Рядок 2 — українські описи
Данні: починаючи з A3

2. Порядок колонок фіксований
❗ Будь-які зміни порядку призведуть до помилок в schedule.gs та calendar.gs
3. ID генерується автоматично
javascriptconst recordId = Utilities.getUuid(); // "a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d"
4. Date та Time - окремі колонки

Date зберігається як Date Object
Time зберігається як String у форматі "HH:mm"
Причина: зручність фільтрації та відображення

5. UpdatedAt оновлюється при кожній зміні
При будь-якій зміні Status → UpdatedAt = new Date()

📌 Enum значення
Status (колонка F)
javascriptconst SCHEDULE_STATUS = {
  AVAILABLE: "AVAILABLE",     // Вільний слот, тренер доступний
  REQUESTED: "REQUESTED",     // Учень подав запит на запис
  BOOKED: "BOOKED",          // Запис підтверджено тренером
  COMPLETED: "COMPLETED",     // Тренування завершено
  CANCELED: "CANCELED"        // Запис скасовано (тренером або учнем)
};
Переходи статусів:
AVAILABLE → REQUESTED → BOOKED → COMPLETED
    ↓           ↓           ↓
CANCELED    CANCELED    CANCELED
Деталі:

AVAILABLE:

Тренер створив вільний слот
StudentID = null
Доступний для запису


REQUESTED:

Учень подав запит на запис
StudentID = ChatID учня
Очікує підтвердження тренера


BOOKED:

Тренер підтвердив запис
StudentID = ChatID учня
Синхронізовано з Calendar (CalEventID заповнено)


COMPLETED:

Тренування відбулось
Можлива прив'язка до BotTrainingData
При переході в COMPLETED заповнюються I (PriceCharged), J (Currency) — поточна ціна з листа Pricing (з поділом на 1/2/3 для персональна/спліт/тріо)


CANCELED:

Запис скасовано
Може бути скасовано на будь-якому етапі
StudentID зберігається (для історії)




📌 Формати даних
A: ID

Тип: String (UUID)
Формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Генерація: Utilities.getUuid()
Унікальність: Кожен запис має унікальний ID

B: CoachID

Тип: Number
Формат: Telegram ChatID (8-10 цифр)
FK: → Users.ChatID (де Role = 'coach')
Приклад: 111222333

C: StudentID

Тип: Number або null
Формат: Telegram ChatID або порожнє
FK: → Users.ChatID (де Role = 'student')
Правило:

null якщо Status = AVAILABLE
число якщо Status = REQUESTED, BOOKED, COMPLETED, CANCELED



D: Date

Тип: Date Object
Формат збереження: Date Object
Формат відображення: ДД.ММ.РРРР (українська локаль)
Приклад збереження: new Date(2026, 1, 10) (10 лютого 2026)
Приклад відображення: 10.02.2026

E: Time

Тип: String
Формат: "HH:mm" (24-годинний)
Валідація: /^\d{2}:\d{2}$/
Приклади: "10:00", "14:30", "18:00"

F: Status

Тип: String (Enum)
Можливі значення: Тільки з SCHEDULE_STATUS enum
Валідація: Перевірка на наявність в списку дозволених

G: UpdatedAt

Тип: Date Object
Формат: new Date()
Оновлюється: При кожній зміні Status
Формат відображення: ДД.ММ.РРРР ГГ:ХХ

H: CalEventID

Тип: String або null
Формат: Google Calendar Event ID
Приклад: "abc123def456"
Заповнюється: При створенні події в Calendar (Status = BOOKED)
Використання: Для оновлення/видалення подій в Calendar

I: PriceCharged

Тип: Number або порожньо. Сума з одного учня. Заповнюється при Status = COMPLETED з листа Pricing (поділ на 1/2/3 за типом).

J: Currency

Тип: String або порожньо. Приклад: "UAH". Заповнюється разом з PriceCharged при COMPLETED.


📌 Індекси та Foreign Keys
Primary Key (PK)

ID (колонка A) — унікальний ідентифікатор запису

Foreign Keys (FK)

CoachID (колонка B) → Users.ChatID (де Role = 'coach')
StudentID (колонка C) → Users.ChatID (де Role = 'student')

Індекси для пошуку
Рекомендовані індекси для швидкого пошуку:

CoachID + Date — пошук слотів тренера на дату
StudentID + Status — пошук записів учня
Status — фільтрація по статусу


📌 Бізнес-правила
1. Створення слоту (AVAILABLE)
javascript// Тренер створює вільний слот
{
  id: Utilities.getUuid(),
  coachId: 111222333,
  studentId: null,           // ← Порожнє
  date: new Date(2026, 1, 10),
  time: "10:00",
  status: "AVAILABLE",       // ← Початковий статус
  updatedAt: new Date(),
  calEventId: null           // ← Ще не створено в Calendar
}
2. Запит на запис (AVAILABLE → REQUESTED)
javascript// Учень подає запит
// Оновлюємо запис:
{
  // ... інші поля
  studentId: 987654321,      // ← Заповнюється
  status: "REQUESTED",       // ← Змінюється
  updatedAt: new Date()      // ← Оновлюється
}
3. Підтвердження запису (REQUESTED → BOOKED)
javascript// Тренер підтверджує
// 1. Оновлюємо запис:
{
  // ... інші поля
  status: "BOOKED",
  updatedAt: new Date(),
  calEventId: "cal_event_123"  // ← Створюється подія в Calendar
}

// 2. Створюємо подію в Google Calendar:
Calendar.createEvent({
  summary: "Тренування: [Ім'я учня]",
  start: { dateTime: "2026-02-10T10:00:00+02:00" },
  end: { dateTime: "2026-02-10T11:00:00+02:00" }
})
4. Скасування (будь-який → CANCELED)
javascript// Скасування може статися на будь-якому етапі
{
  // ... інші поля
  status: "CANCELED",
  updatedAt: new Date()
  // studentId залишається (для історії)
  // calEventId залишається (може бути видалено з Calendar)
}
5. Завершення (BOOKED → COMPLETED)
javascript// Після тренування
{
  // ... інші поля
  status: "COMPLETED",
  updatedAt: new Date()
}

📌 Приклади записів
Приклад 1: Вільний слот
| A                                    | B         | C    | D          | E     | F         | G              | H    |
|--------------------------------------|-----------|------|------------|-------|-----------|----------------|------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 |      | 10.02.2026 | 10:00 | AVAILABLE | 03.02.2026 14:00 |      |
Приклад 2: Запит учня
| A                                    | B         | C         | D          | E     | F         | G              | H    |
|--------------------------------------|-----------|-----------|------------|-------|-----------|----------------|------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | REQUESTED | 03.02.2026 15:30 |      |
Приклад 3: Підтверджений запис
| A                                    | B         | C         | D          | E     | F      | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|--------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | BOOKED | 03.02.2026 16:00 | cal_evt_123  |
Приклад 4: Завершене тренування
| A                                    | B         | C         | D          | E     | F         | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|-----------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | COMPLETED | 10.02.2026 11:05 | cal_evt_123  |
Приклад 5: Скасований запис
| A                                    | B         | C         | D          | E     | F        | G              | H            |
|--------------------------------------|-----------|-----------|------------|-------|----------|----------------|--------------|
| a3f7c2d1-8e4b-4f3a-9d6e-1b5c8a2f7e9d | 111222333 | 987654321 | 10.02.2026 | 10:00 | CANCELED | 05.02.2026 09:20 | cal_evt_123  |

📌 Використання в модулях
Schedule.gs (основний модуль)
Функції:
javascript// Створити вільний слот
createAvailableSlot(coachId, date, time)

// Учень подає запит
requestBooking(studentId, slotId)

// Тренер підтверджує
confirmBooking(coachId, slotId)

// Скасування
cancelBooking(slotId, initiatorId)

// Отримати слоти
getAvailableSlots(coachId, date)
getStudentBookings(studentId)
getCoachSchedule(coachId, startDate, endDate)

Calendar.gs (інтеграція з Google Calendar)
Функції:
javascript// Створити подію в Calendar
createCalendarEvent(slotData)

// Оновити подію
updateCalendarEvent(calEventId, changes)

// Видалити подію
deleteCalendarEvent(calEventId)

// Синхронізувати
syncScheduleWithCalendar(coachId)

Sheets.gs (доступ до даних)
Функції:
javascript// Вставка
insertScheduleRecord(data)

// Оновлення
updateScheduleStatus(slotId, newStatus)

// Пошук
findScheduleById(slotId)
findScheduleByCoach(coachId, date)
findScheduleByStudent(studentId)

// Фільтрація
getScheduleByStatus(status)
getScheduleByDateRange(startDate, endDate)

📌 Валідація даних
Перевірка при створенні слоту
javascriptfunction validateSlot(data) {
  // 1. CoachID існує та є тренером
  const coach = User.getByChatId(data.coachId);
  if (!coach || coach.role !== 'coach') {
    throw new Error("Невірний ID тренера");
  }
  
  // 2. Date не в минулому
  const now = new Date();
  if (data.date < now) {
    throw new Error("Не можна створити слот в минулому");
  }
  
  // 3. Time правильного формату
  if (!/^\d{2}:\d{2}$/.test(data.time)) {
    throw new Error("Невірний формат часу");
  }
  
  // 4. Немає дублікатів (той же CoachID, Date, Time)
  const existing = Sheets.findScheduleByCoach(data.coachId, data.date);
  const duplicate = existing.find(slot => slot.time === data.time);
  if (duplicate) {
    throw new Error("Слот вже існує");
  }
  
  return true;
}

Перевірка при зміні статусу
javascriptfunction validateStatusChange(currentStatus, newStatus) {
  // Дозволені переходи
  const allowedTransitions = {
    'AVAILABLE': ['REQUESTED', 'CANCELED'],
    'REQUESTED': ['BOOKED', 'CANCELED'],
    'BOOKED': ['COMPLETED', 'CANCELED'],
    'COMPLETED': [],  // Кінцевий стан
    'CANCELED': []    // Кінцевий стан
  };
  
  if (!allowedTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Неможливо змінити ${currentStatus} → ${newStatus}`);
  }
  
  return true;
}

📌 Службові нотатки
Життєвий цикл запису
1. Створення:
   Тренер → createAvailableSlot()
   Status: AVAILABLE
   StudentID: null

2. Запит:
   Учень → requestBooking()
   Status: AVAILABLE → REQUESTED
   StudentID: заповнюється

3. Підтвердження:
   Тренер → confirmBooking()
   Status: REQUESTED → BOOKED
   CalEventID: створюється

4. Завершення:
   Автоматично або вручну
   Status: BOOKED → COMPLETED

Альтернатива: Скасування на будь-якому етапі
   Status: * → CANCELED

Зв'язок з іншими таблицями
1. Users:

CoachID → Users.ChatID (Role = coach)
StudentID → Users.ChatID (Role = student)

2. BotTrainingData:

Після COMPLETED можна прив'язати тренування
Запис в BotTrainingData з ChatID = StudentID
Можлива прив'язка через Date та Time

3. Google Calendar:

CalEventID зв'язує з подією в Calendar
Двосторонній зв'язок (можна оновлювати обидва)


Типові запити
Вільні слоти тренера на дату:
javascriptWHERE CoachID = X
  AND Date = Y
  AND Status = 'AVAILABLE'
ORDER BY Time ASC
Записи учня:
javascriptWHERE StudentID = X
  AND Status IN ('REQUESTED', 'BOOKED')
ORDER BY Date ASC, Time ASC
Розклад тренера на тиждень:
javascriptWHERE CoachID = X
  AND Date BETWEEN start AND end
ORDER BY Date ASC, Time ASC




=============================================================================================

# Структура таблицы **Logs** 

Документ фиксирует **каноничную структуру листа Logs**, используемую для мониторинга ошибок и диагностики работы бота.

Эта таблица используется для:
* записи критических сбоев (Crash Reports);
* проверки работоспособности системы (System Check);
* отладки ошибок, когда недоступна консоль разработчика.

---

# 📌 Название листа

 Структура таблиці Logs
Назва листа: Logs

📌 Призначення
Таблиця для:

Запису критичних збоїв (Crash Reports)
Моніторингу роботоспроможності системи
Діагностики помилок (коли консоль розробника недоступна)
Audit Trail (історія важливих подій)


📌 Структура колонок (A–D, 4 колонки)
КолонкаEN HeaderUA HeaderТип данихОписОбов'язковеATimestampЧасова міткаDateТочна дата та час виникнення події✅BContextКонтекстStringМісце збою (модуль.функція)✅CMessageПовідомленняStringТекст помилки (Error Message)✅DStackСтекStringТехнічний шлях помилки (Stack Trace)❌

📌 Технічні вимоги
1. Данні починаються з 3-го рядка

Рядок 1 — англійські заголовки (EN)
Рядок 2 — українські заголовки (UA)
Данні: починаючи з A3 (нові записи додаються в кінець)

2. Порядок колонок фіксований
Модуль sheets.gs записує дані масивом в точному порядку: [Timestamp, Context, Message, Stack]
3. Автоматичне додавання записів
Нові записи завжди додаються в кінець (appendRow), а не вставляються

📌 Формати даних
A: Timestamp

Тип: Date Object
Формат збереження: new Date()
Формат відображення: ДД.ММ.РРРР ГГ:ХХ:СС
Приклад: 03.02.2026 14:35:22

B: Context

Тип: String
Формат: Модуль.функція або Модуль.метод
Приклади:

Main.doPost
Router.handleCallback_
Sheets.insertUser
Training.startWorkout
Calendar.createEvent



C: Message

Тип: String
Максимальна довжина: 1000 символів (рекомендовано)
Формат: Зрозуміле повідомлення про помилку
Приклади:

ReferenceError: User is not defined
TypeError: Cannot read property 'chatId' of null
Invalid callback_data format



D: Stack

Тип: String
Формат: Stack Trace (якщо доступний)
Обробка:

Якщо Error Object має .stack → використати
Інакше → порожній рядок або "N/A"


Приклад:

at Training.startWorkout (Training.gs:45)
at Router.handleCallback_ (Router.gs:123)
at Main.doPost (Main.gs:15)

📌 Функція Sheets.logError()
Сигнатура
javascriptfunction logError(error, context)
Параметри

error (Error | String) — об'єкт помилки або текст
context (String) — контекст виклику (модуль.функція)

Реалізація
javascriptfunction logError(error, context) {
  try {
    const sheet = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID)
      .getSheetByName('Logs');
    
    // Парсинг помилки
    let message = '';
    let stack = '';
    
    if (error instanceof Error) {
      message = error.message || 'Unknown error';
      stack = error.stack || '';
    } else if (typeof error === 'string') {
      message = error;
      stack = '';
    } else {
      message = JSON.stringify(error);
      stack = '';
    }
    
    // Обрізка довгих значень
    if (message.length > 1000) {
      message = message.substring(0, 997) + '...';
    }
    
    if (stack.length > 5000) {
      stack = stack.substring(0, 4997) + '...';
    }
    
    // Додавання запису
    sheet.appendRow([
      new Date(),    // A: Timestamp
      context,       // B: Context
      message,       // C: Message
      stack          // D: Stack
    ]);
    
    SpreadsheetApp.flush();
    
  } catch (logError) {
    // Якщо логування не вдалось — нічого не робимо
    // (щоб не створювати нескінченний цикл помилок)
    console.error('Failed to log error:', logError);
  }
}

📌 Використання в коді
Базове використання
javascripttry {
  // Небезпечний код
  const user = User.getByChatId(chatId);
  if (!user) {
    throw new Error('User not found');
  }
} catch (error) {
  Sheets.logError(error, 'User.getByChatId');
  // Обробка помилки
}
В main.doPost()
javascriptfunction doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    Router.route(update);
  } catch (error) {
    Sheets.logError(error, 'Main.doPost');
    return ContentService.createTextOutput('Error logged');
  }
}
В Router
javascriptfunction handleCallback_(chatId, callbackData) {
  try {
    // Обробка callback
    if (callbackData === 'TRAIN_START') {
      Training.startWorkout(chatId);
    }
  } catch (error) {
    Sheets.logError(error, 'Router.handleCallback_');
    Helpers.safeSend(chatId, 'Виникла помилка. Спробуйте пізніше.');
  }
}
З додатковим контекстом
javascripttry {
  Sheets.insertUser(userData);
} catch (error) {
  const context = `Sheets.insertUser (chatId: ${userData.chatId})`;
  Sheets.logError(error, context);
}

📌 Приклади записів
Приклад 1: ReferenceError
| A                  | B                      | C                                    | D                                           |
|--------------------|------------------------|--------------------------------------|---------------------------------------------|
| 03.02.2026 14:35:22| Main.doPost            | ReferenceError: User is not defined  | at doPost (Main.gs:15)\nat ...              |
Приклад 2: TypeError
| A                  | B                      | C                                              | D                                           |
|--------------------|------------------------|------------------------------------------------|---------------------------------------------|
| 03.02.2026 15:20:10| Router.handleCallback_ | TypeError: Cannot read property 'step' of null | at handleCallback_ (Router.gs:45)\nat ...   |
Приклад 3: Custom Error
| A                  | B                      | C                                    | D                                           |
|--------------------|------------------------|--------------------------------------|---------------------------------------------|
| 03.02.2026 16:10:05| Training.startWorkout  | Student not found for chatId: 123456 |                                             |
Приклад 4: JSON Parse Error
| A                  | B                      | C                                         | D                                      |
|--------------------|------------------------|-------------------------------------------|----------------------------------------|
| 03.02.2026 17:45:30| Main.doPost            | SyntaxError: Unexpected token in JSON...  | at JSON.parse (Main.gs:12)\nat ...     |

📌 Аналіз логів
Запити для діагностики
1. Останні помилки (10 записів):
javascriptfunction getRecentErrors(limit = 10) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues();
  
  // Видалити заголовки (рядки 1-2)
  const logs = data.slice(2);
  
  // Сортувати по даті (новіші першими)
  logs.sort((a, b) => b[0] - a[0]);
  
  // Взяти перші N
  return logs.slice(0, limit).map(row => ({
    timestamp: row[0],
    context: row[1],
    message: row[2],
    stack: row[3]
  }));
}
2. Помилки за період:
javascriptfunction getErrorsByDateRange(startDate, endDate) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues().slice(2);
  
  return data.filter(row => {
    const timestamp = row[0];
    return timestamp >= startDate && timestamp <= endDate;
  });
}
3. Помилки по контексту:
javascriptfunction getErrorsByContext(context) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues().slice(2);
  
  return data.filter(row => row[1] === context);
}
4. Частота помилок:
javascriptfunction getErrorFrequency() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues().slice(2);
  
  const frequency = {};
  data.forEach(row => {
    const context = row[1];
    frequency[context] = (frequency[context] || 0) + 1;
  });
  
  return frequency;
}

📌 Обслуговування логів
Очищення старих записів
Функція для очищення логів старших 30 днів:
javascriptfunction cleanOldLogs(daysToKeep = 30) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  // Знайти рядки старіші за cutoffDate
  const rowsToDelete = [];
  for (let i = 2; i < data.length; i++) {  // Починаємо з рядка 3
    const timestamp = data[i][0];
    if (timestamp < cutoffDate) {
      rowsToDelete.push(i + 1);  // +1 бо індекси рядків з 1
    }
  }
  
  // Видалити рядки (в зворотньому порядку)
  rowsToDelete.reverse().forEach(row => {
    sheet.deleteRow(row);
  });
  
  return rowsToDelete.length;
}
Експорт логів
Експорт в CSV:
javascriptfunction exportLogsToCSV() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName('Logs');
  
  const data = sheet.getDataRange().getValues();
  
  const csv = data.map(row => row.join(',')).join('\n');
  
  return csv;
}

📌 Службові нотатки
Рівні логування (опціонально)
Можна додати колонку Level (E) для розрізнення рівнів:

ERROR — критичні помилки
WARN — попередження
INFO — інформаційні повідомлення
DEBUG — налагоджувальна інформація

Альтернативи
Якщо таблиця стає занадто великою:

Використовувати окремі таблиці по місяцях (Logs_2026_02)
Налаштувати тригер для автоматичного архівування
Використовувати зовнішній сервіс логування (якщо потрібно)


Версія структури: 1.0
Дата створення: 03.02.2026
Статус: ЕТАЛОН (Single Source of Truth)

================================================================================
TRAININGPLANS (СТАТУС: ТАБЛИЦЯ ІСНУЄ)
📌 Структура таблиці TrainingPlans
Назва листа: TrainingPlans
Статус: ✅ Таблиця створена та використовується
КолонкаEN HeaderUA HeaderТип данихОписAPlanIDID плануStringУнікальний ідентифікатор плануBCoachIDID тренераNumberChatID тренера (автор плану)CPlanNameНазва плануStringНазва програмиDGoalЦільEnumlose/gain/keepELevelРівеньEnumbeginner/intermediate/advancedFDescriptionОписStringДетальний опис програмиGIsActiveАктивнийBooleanYES/NO (чи використовується)
Даний з 3-го рядка
===============================================================================

📌 МОДУЛЬ CONSTANTS.GS
Призначення: Єдине місце для всіх констант проекту
Структура:
javascript// ===== GOOGLE SHEETS =====
const SPREADSHEET_ID = PropertiesService.getScriptProperties()
  .getProperty('SPREADSHEET_ID');

const SHEETS = {
  USERS: 'Users',
  EXERCISE_LIBRARY: 'ExerciseLibrary',
  BOT_TRAINING_DATA: 'BotTrainingData',
  MEASUREMENTS_HISTORY: 'MeasurementsHistory',
  WORKOUT_SCHEDULE: 'WorkoutSchedule',
  CITY_LIST: 'CityList',
  TRAINING_PLANS: 'TrainingPlans',
  TRAINING_PLAN_EXERCISES: 'TrainingPlanExercises',
  LOGS: 'Logs'
};

// ===== КОЛОНКИ USERS (A-T) =====
const USERS_COL = {
  CREATED_AT: 1,      // A
  USER_ID: 2,         // B
  CHAT_ID: 3,         // C
  FIRST_NAME: 4,      // D
  LAST_NAME: 5,       // E
  CITY: 6,            // F
  ROLE: 7,            // G
  GENDER: 8,          // H
  AGE: 9,             // I
  GOAL: 10,           // J
  COACH_ID: 11,       // K
  BIRTH_DATE: 12,     // L
  HEIGHT: 13,         // M
  WEIGHT: 14,         // N
  WAIST: 15,          // O
  HIP: 16,            // P
  GLUTES: 17,         // Q
  ARM: 18,            // R
  INSTAGRAM: 19,      // S
  CALENDAR_ID: 20     // T
};

// ===== ENUM: ROLES =====
const ROLES = {
  STUDENT: 'student',
  COACH: 'coach'
};

// ===== ENUM: GENDERS =====
const GENDERS = {
  MALE: 'male',
  FEMALE: 'female'
};

// ===== ENUM: GOALS =====
const GOALS = {
  LOSE: 'lose',      // Схуднути
  GAIN: 'gain',      // Набрати масу
  KEEP: 'keep'       // Підтримувати форму
};

// ===== ENUM: SCHEDULE STATUS =====
const SCHEDULE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  REQUESTED: 'REQUESTED',
  BOOKED: 'BOOKED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED'
};

// ===== ENUM: ACTIVE STATUS (ExerciseLibrary) =====
const ACTIVE_STATUS = {
  YES: 'YES',
  NO: 'NO'
};

// ===== FSM STATES =====
const FSM_STATES = {
  // Registration
  REG_START: 'reg_start',
  REG_ROLE: 'reg_role',
  REG_FIRST_NAME: 'reg_first_name',
  REG_LAST_NAME: 'reg_last_name',
  REG_GENDER: 'reg_gender',
  REG_GOAL: 'reg_goal',
  REG_BIRTH_DATE: 'reg_birth_date',
  REG_CITY: 'reg_city',
  REG_INSTAGRAM: 'reg_instagram',
  REG_CALENDAR_ID: 'reg_calendar_id',
  REG_INVITE_INPUT: 'reg_invite_input',
  
  // Training
  TRAINING_MODE_SELECT: 'training_mode_select',
  TRAINING_GROUP_SELECT: 'training_group_select',
  TRAINING_EX_SELECT: 'training_ex_select',
  TRAINING_INPUT_DATA: 'training_input_data',
  TRAINING_CIRCUIT_BUILD: 'training_circuit_build',
  TRAINING_CIRCUIT_EXECUTION: 'training_circuit_execution',
  
  // History
  HISTORY_MAIN_MENU: 'history_main_menu',
  HISTORY_FILTER_SELECTED: 'history_filter_selected',
  HISTORY_GROUP_SELECT: 'history_group_select',
  HISTORY_INPUT_COUNT: 'history_input_count',
  HISTORY_LIST_VIEW: 'history_list_view',
  HISTORY_DETAIL_VIEW: 'history_detail_view',
  
  // Profile
  PROFILE_VIEW: 'profile_view',
  PROFILE_EDIT: 'profile_edit',
  
  // Schedule
  SCHEDULE_VIEW: 'schedule_view',
  SCHEDULE_CREATE: 'schedule_create',
  SCHEDULE_BOOKING: 'schedule_booking'
};

// ===== TRAINING MODES =====
const TRAINING_MODES = {
  STUDENT: 'STUDENT',   // Учень тренується сам
  SELF: 'SELF',         // Тренер тренується сам
  COACH: 'COACH'        // Тренер веде учня
};

// ===== MUSCLE GROUPS (Ukrainian) =====
const MUSCLE_GROUPS = [
  'Груди',
  'Спина',
  'Ноги',
  'Плечі',
  'Руки',
  'Прес',
  'Кардіо'
];

// ===== DATE FORMATS =====
const DATE_FORMATS = {
  FULL_TIMESTAMP: 'ДД.ММ.РРРР ГГ:ХХ',
  DATE_ONLY: 'ДД.ММ.РРРР',
  TIME_ONLY: 'ГГ:ХХ',
  INPUT_DATE_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/,
  INPUT_TIME_PATTERN: /^\d{2}:\d{2}$/
};

// ===== TELEGRAM BOT =====
const BOT_TOKEN = PropertiesService.getScriptProperties()
  .getProperty('BOT_TOKEN');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
Використання:
javascript// Доступ до листа
const sheet = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID)
  .getSheetByName(CONSTANTS.SHEETS.USERS);

// Доступ до колонки
const chatId = row[CONSTANTS.USERS_COL.CHAT_ID - 1];  // -1 бо масиви з 0

// Перевірка ролі
if (user.role === CONSTANTS.ROLES.COACH) {
  // ...
}

// FSM state
State.set(chatId, { step: CONSTANTS.FSM_STATES.REG_FIRST_NAME });


=====
СТАНДАРТ ФОРМАТІВ ДАТ ТА ЧАСУ (FIT 3.0)
Версія: 1.0
Дата: 03.02.2026
Статус: ОБОВ'ЯЗКОВО для всіх модулів

🎯 ЗАГАЛЬНЕ ПРАВИЛО
Внутрішнє зберігання (БД) ≠ Відображення користувачу

БД: Завжди Date Object (JavaScript Date)
Користувач: Завжди українська локаль


📦 ФОРМАТИ ДЛЯ ЗБЕРЕЖЕННЯ В GOOGLE SHEETS
1. Date Object (Timestamp)
Колонки, що використовують:

Users.CreatedAt (A)
Users.BirthDate (L)
BotTrainingData.Date (B)
MeasurementsHistory.Date (B)
WorkoutSchedule.Date (D)
WorkoutSchedule.UpdatedAt (G)
Logs.Timestamp (A)

Формат запису:
javascript// ✅ ПРАВИЛЬНО:
const now = new Date();
sheet.getRange(row, column).setValue(now);

// ❌ НЕПРАВИЛЬНО:
sheet.getRange(row, column).setValue("2026-02-03");
sheet.getRange(row, column).setValue("03.02.2026");
Як зберігається в Sheets:
Google Sheets автоматично розуміє Date Object і зберігає як серійне число з форматуванням.
Приклад:
javascriptconst timestamp = new Date(); // Mon Feb 03 2026 14:35:22 GMT+0200
// В Sheets буде: 46128.608 (внутрішнє) + відображення "03.02.2026 14:35:22"

2. Time (тільки час)
Колонки, що використовують:

WorkoutSchedule.Time (E)

Формат запису:
javascript// ✅ ПРАВИЛЬНО:
const time = "10:00"; // String у форматі HH:mm
sheet.getRange(row, 5).setValue(time);

// ❌ НЕПРАВИЛЬНО:
const time = new Date(); // Не використовувати Date для тільки часу
Формат: "HH:mm" (24-годинний формат)
Приклади:

"09:00" — 9:00 ранку
"14:30" — 14:30 дня
"18:00" — 18:00 вечора


👤 ФОРМАТИ ДЛЯ ВІДОБРАЖЕННЯ КОРИСТУВАЧУ
1. Повна дата з часом (Timestamp)
Використання:

Історія тренувань
Логи подій
Останнє оновлення

Формат: ДД.ММ.РРРР ГГ:ХХ
Приклад:
javascriptfunction formatFullTimestamp(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Приклад виводу:
// "03.02.2026 14:35"
UI приклад:
📅 Тренування: 01.02.2026 14:35

💪 Жим штанги: 80кг × 8

2. Дата без часу
Використання:

Дата народження
Дата тренування (без точного часу)
Календар подій

Формат: ДД.ММ.РРРР
Приклад:
javascriptfunction formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}

// Приклад виводу:
// "15.05.1995"
UI приклад:
👤 **Профіль**

📅 Дата народження: 15.05.1995
🎂 Вік: 29 років

3. Час (окремо)
Використання:

Слоти розкладу
Час початку тренування

Формат: ГГ:ХХ
Приклад:
javascriptfunction formatTime(timeString) {
  // timeString вже у форматі "HH:mm"
  return timeString; // "10:00"
}
UI приклад:
📅 **Доступні слоти на 03.02.2026:**

[10:00] [12:00] [14:00] [16:00]

4. Відносний час (для історії)
Використання:

"Сьогодні", "Вчора", "3 дні тому"

Формат: Динамічний
Приклад:
javascriptfunction formatRelativeDate(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Вчора";
  if (days < 7) return `${days} дні тому`;
  
  // Інакше повертаємо звичайний формат
  return formatDate(date);
}

// Приклади виводу:
// "Сьогодні"
// "Вчора"
// "3 дні тому"
// "25.01.2026"

🔄 КОНВЕРТАЦІЯ ФОРМАТІВ
1. Парсинг вводу користувача (ДД.ММ.РРРР → Date Object)
Використання: Введення дати народження, вибір дати
javascriptfunction parseUserDate(input) {
  // Очікується: "15.05.1995"
  const parts = input.split('.');
  
  if (parts.length !== 3) {
    throw new Error("Неправильний формат. Очікується: ДД.ММ.РРРР");
  }
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Місяці від 0
  const year = parseInt(parts[2], 10);
  
  // Валідація
  if (day < 1 || day > 31) throw new Error("День має бути від 1 до 31");
  if (month < 0 || month > 11) throw new Error("Місяць має бути від 1 до 12");
  if (year < 1900 || year > new Date().getFullYear()) {
    throw new Error("Рік некоректний");
  }
  
  return new Date(year, month, day);
}

2. Читання з Sheets (Date Object → Формат для UI)
Використання: Відображення даних з БД
javascriptfunction readDateFromSheet(value) {
  // Google Sheets повертає Date Object або String
  if (value instanceof Date) {
    return value; // Вже Date Object
  }
  
  if (typeof value === 'string') {
    return new Date(value); // Конвертувати з String
  }
  
  throw new Error("Невідомий тип дати");
}

// Приклад використання:
const dateFromSheet = sheet.getRange(row, col).getValue();
const dateObject = readDateFromSheet(dateFromSheet);
const displayDate = formatDate(dateObject); // "15.05.1995"

📋 ТАБЛИЦЯ ЗАСТОСУВАННЯ
ТаблицяКолонкаТип в БДФормат в БДФормат для користувачаUsersCreatedAt (A)Date Objectnew Date()03.02.2026 14:35UsersBirthDate (L)Date Objectnew Date(1995, 4, 15)15.05.1995BotTrainingDataDate (B)Date Objectnew Date()01.02.2026 14:35MeasurementsHistoryDate (B)Date Objectnew Date()03.02.2026WorkoutScheduleDate (D)Date Objectnew Date(2026, 1, 10)10.02.2026WorkoutScheduleTime (E)String"10:00"10:00WorkoutScheduleUpdatedAt (G)Date Objectnew Date()03.02.2026 14:35LogsTimestamp (A)Date Objectnew Date()03.02.2026 14:35:22

⚠️ ТИПОВІ ПОМИЛКИ
❌ ПОМИЛКА 1: Збереження String замість Date Object
javascript// ❌ НЕПРАВИЛЬНО:
sheet.appendRow(["03.02.2026", "Марія", ...]);

// ✅ ПРАВИЛЬНО:
sheet.appendRow([new Date(), "Марія", ...]);
❌ ПОМИЛКА 2: Різні формати в різних місцях
javascript// ❌ НЕПРАВИЛЬНО:
const date1 = "2026-02-03"; // ISO формат
const date2 = "03/02/2026"; // US формат
const date3 = "03.02.2026"; // UA формат

// ✅ ПРАВИЛЬНО: Завжди Date Object в БД
const date = new Date(2026, 1, 3);
❌ ПОМИЛКА 3: Не враховувати часовий пояс
javascript// ❌ НЕПРАВИЛЬНО:
const date = new Date("2026-02-03"); // UTC 00:00

// ✅ ПРАВИЛЬНО: Використовувати локальний час
const date = new Date(2026, 1, 3); // Локальний час

🎯 ЧЕКЛИСТ ДЛЯ РОЗРОБНИКІВ
При роботі з датами в коді:

 Перевірив що зберігаю Date Object, а не String
 Використовую форматування для відображення користувачу
 Парсинг вводу користувача в правильний формат (ДД.ММ.РРРР)
 Валідація дат перед збереженням
 Обробка помилок при парсингу
 Тестування з різними датами (майбутнє, минуле, сьогодні)


📚 КОНСТАНТИ ДЛЯ ВИКОРИСТАННЯ
Додати в constants.gs:
javascriptconst DATE_FORMATS = {
  // Для відображення користувачу
  FULL_TIMESTAMP: 'ДД.ММ.РРРР ГГ:ХХ',     // "03.02.2026 14:35"
  DATE_ONLY: 'ДД.ММ.РРРР',                 // "03.02.2026"
  TIME_ONLY: 'ГГ:ХХ',                      // "14:35"
  
  // Для валідації вводу
  INPUT_DATE_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/,  // 15.05.1995
  INPUT_TIME_PATTERN: /^\d{2}:\d{2}$/,          // 10:00
  
  // Для внутрішнього використання
  STORAGE: 'Date Object'                   // Завжди Date Object
};

Версія стандарту: 1.0
Дата створення: 03.02.2026
Обов'язково до виконання: ✅ ТАК




