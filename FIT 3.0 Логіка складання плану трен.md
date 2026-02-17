FIT 3.0 Логіка складання плану тренувань для індивідуального користувача

Документ покриває повний цикл: збір даних → медична фільтрація → персоналізація → генерація плану → призначення → виконання → прогрес
Версія 1.0 | Лютий 2026 | Railway + Supabase + Node.js
 
1. ОГЛЯД СИСТЕМИ
Система складання плану тренувань у FIT 3.0 — це 6-крокова послідовність від збору даних профілю до виконання та коригування плану. Кожен крок враховує медичний стан, ціль, рівень підготовки та параметри тіла користувача.
1.1 Загальна послідовність (Flow)
КРОК 1: Збір даних профілю (вже є у боті)
Ціль (lose/gain/keep) · Рівень досвіду (beginner/intermediate/advanced) · Стать · Вік · Вага · Зріст · BMI (авто)
КРОК 2: Медичний профіль користувача
Список MC-кодів + severity → фільтрація бази вправ, медичні обмеження
КРОК 3: Алгоритм підбору параметрів плану
Кількість днів · Сплітова схема · Об'єм · Інтенсивність · Тип вправ (базові / ізоляція)
КРОК 4: Генерація плану (DB-запит + правила)
Запис у training_plans + training_plan_exercises · Медична безпека кожної вправи
КРОК 5: Призначення та перегляд (тренер або автоматично)
Тренер переглядає / редагує → активує план для учня
КРОК 6: Виконання та прогрес
Учень тренується за планом · Логування підходів · Авто-прогресія · Ревізія плану

2. ПАРАМЕТРИ ПРОФІЛЮ КОРИСТУВАЧА
Алгоритм складання плану читає наступні поля з таблиці users у Supabase. Всі параметри впливають на вибір вправ, об'єм та інтенсивність.

Поле	Значення	Вплив на план
goal	lose / gain / keep	Визначає тип навантаження, баланс кардіо/сила, діапазон повторів
experience_days	0-90 / 91-365 / 366+	Beginner/Intermediate/Advanced — складність вправ, об'єм підходів
gender	male / female	Пріоритет груп м'язів, вибір базових вправ, модифікації
age	Number	Вплив на відновлення, обмеження при суглобових проблемах
weight / height	Number (кг/см)	BMI авто-розрахунок → впливає на вибір вправ при ожирінні
medical_conditions	MC001...MC025 + severity	Фільтрація небезпечних вправ, модифікації, альтернативи
training_days_per_week	2 / 3 / 4 / 5	Сплітова схема, розподіл груп м'язів по днях

Поле medical_conditions та training_days_per_week — нові поля, які потрібно додати до таблиці users. Детально у розділі 3 та 4.

 
3. МЕДИЧНИЙ ПРОФІЛЬ КОРИСТУВАЧА
3.1 Структура медичного профілю
Медичний профіль зберігається у окремій таблиці user_medical_conditions, яка пов'язана з users через chat_id. Це дозволяє зберігати кілька станів для одного користувача з різним ступенем тяжкості.
Таблиця: user_medical_conditions
Колонка	Тип	Nullable	Опис
id	uuid PK	NO	Первинний ключ
chat_id	text FK → users	NO	Telegram chat ID користувача
mc_code	text	NO	Код стану: MC001...MC025
severity	text	NO	mild/moderate/severe (або специфічне: acute/chronic, trimester1/2/3, etc.)
notes	text	YES	Примітка тренера або лікаря
is_active	boolean	NO	true = активний стан; false = в анамнезі
created_at	timestamptz	NO	Дата додавання
updated_at	timestamptz	YES	Дата оновлення severity
3.2 Каталог медичних станів (MC-коди)
Повний перелік MC-кодів, які підтримує система. Severity-специфікатори відповідають документу "Розшифровка severity".

Код	Стан	Severity варіанти	Основне правило
MC001	Коліна (артрит, зв'язки)	mild/moderate/severe	severe → виключити присідання, випади, стрибки
MC002	Нижня спина (грижі)	mild/moderate/severe	moderate+ → виключити осьове навантаження, скручування
MC003	Плечі (ротаторна манжета)	mild/moderate/severe	severe → виключити жими над головою, тягу
MC004	Гіпертонія	stage1/stage2/stage3	stage3 → тільки після стабілізації тиску
MC005	Діабет	type1/type2	type1 → контроль глюкози до/під час/після
MC006	Астма	mild/moderate/severe	moderate+ → розминка, уникати холодного повітря
MC007	Варикоз	mild/moderate/severe	severe → уникати статичних навантажень, тромбофлебіт
MC008	Остеопороз	osteopenia/mild/moderate/severe	moderate+ → виключити ударні вправи, важку вагу
MC009	Вагітність	trimester1/2/3	trimester3 → мінімальна інтенсивність, без живота
MC010	Після пологів	0-6wk/6-12wk/3-6mo	0-6wk → тільки Кегель, ходьба
MC011	Діастаз прямих м'язів	mild/moderate/severe	moderate+ → виключити класичні скручування
MC012	Серцеві захворювання	mild/moderate/severe	severe → тільки під медичним наглядом
MC014	Грижа (пахова/пупкова)	mild/moderate/severe	severe → тренування протипоказані
MC015	Шийний остеохондроз	mild/moderate/severe	severe → обмежити навантаження повністю
MC016	Сколіоз	mild/moderate/severe	severe → тренування під наглядом спеціаліста
MC017	Епілепсія	controlled/uncontrolled	uncontrolled → заборона важких ваг, тренування на висоті
MC018	Ожиріння	class1/class2/class3	class3 → тільки під медичним контролем
MC019	Плоскостопість	mild/moderate/severe	severe → виключити стрибкові вправи
MC020	Ахіллове сухожилля	acute/chronic	acute → НЕ тренувати ноги
MC021	Ревматоїдний артрит	mild/moderate/severe	severe → мінімальна активність
MC022	Глаукома	early/moderate/advanced	moderate+ → заборона інверсій
MC023	Відшарування сітківки	recent/remote	recent → мінімальні навантаження
MC024	Постковідний синдром	mild/moderate/severe	severe → значне обмеження активності
MC025	Гіпотиреоз	mild/moderate/severe	severe → низька інтенсивність, довше відновлення
3.3 Алгоритм медичної фільтрації вправ
При генерації плану для кожної вправи з exercise_library виконується наступна перевірка:
Псевдокод: filterExerciseForUser(exercise, userMedConditions)
1. Розібрати exercise.medical_contraindications → [{mc_code, severity_threshold}]
2. Для кожного mc у user.medical_conditions (is_active = true):
   a. Якщо mc_code є у medical_contraindications AND user.severity >= threshold:
      → повернути { status: "BLOCKED", reason: mc_code + severity }
   b. Якщо mc_code є у medical_limitations:
      → повернути { status: "ALLOWED_WITH_MOD", modification: modifications[mc_code] }
   c. Якщо mc_code є у safe_for:
      → повернути { status: "SAFE", note: "Рекомендована при цьому стані" }
3. Якщо жодного медичного маркера → { status: "NEUTRAL" }



Пріоритет статусів
Статус	Дія	Опис
BLOCKED	Виключити з плану	Вправа протипоказана. Замінити з alternatives
ALLOWED_WITH_MOD	Включити з поміткою	Додати modification до поля notes вправи
SAFE	Пріоритизувати	Вправа рекомендована при стані — брати в першу чергу
NEUTRAL	Включити	Нейтральна вправа — стандартна логіка відбору

4. АЛГОРИТМ ПІДБОРУ ПАРАМЕТРІВ ПЛАНУ
4.1 Крок 1 — Визначення рівня (Level)
Рівень визначається через experience_days, який обчислюється від experience_start_date. Тренер встановлює вручну.

experience_days	Level	Характеристики плану
0–90 днів (0–3 міс)	beginner	2–3 дні/тиж · 2–3 підходи · 12–15 повт · Full body або Upper/Lower · тільки базові + легкі ізоляції · відпочинок 90–120 сек
91–365 днів (3–12 міс)	intermediate	3–4 дні/тиж · 3–4 підходи · 8–12 повт · Push/Pull/Legs або Upper/Lower · базові + ізоляція · відпочинок 60–90 сек
366+ днів (>1 року)	advanced	4–5 днів/тиж · 4–5 підходів · 6–10 повт · 4-day split або PPL · важкі базові + широка ізоляція · відпочинок 45–90 сек
4.2 Крок 2 — Визначення сплітової схеми
Схема обирається за комбінацією Level + training_days_per_week (тренувальних днів на тиждень). Якщо поле не задано — брати значення за замовчуванням для рівня.
Level	Днів/тиж	Схема	Розподіл по днях
beginner	2	Full Body ×2	День 1: все тіло · День 2: все тіло
beginner	3	Full Body ×3	Д1: все · Д2: все · Д3: все
intermediate	3	Upper / Lower / Full	Д1: Верх · Д2: Низ · Д3: Повне тіло
intermediate	4	Upper/Lower ×2	Д1: Верх · Д2: Низ · Д3: Верх · Д4: Низ
advanced	4	PPL + Upper	Д1: Push · Д2: Pull · Д3: Legs · Д4: Upper
advanced	5	PPL+Upper+Lower	Д1: Push · Д2: Pull · Д3: Legs · Д4: Upper · Д5: Lower



4.3 Крок 3 — Параметри навантаження за ціллю (goal)
Goal	Повтори	Підходи	Вправи (vid пріоритет)
lose (схуднення)	15–20 повт	3 підходи	Ізоляція > Базова. Більше кардіо-елементів. Коротший відпочинок
gain (набір маси)	6–10 повт	4–5 підходів	Базова > Ізоляція. Важкі компаунди. Довший відпочинок
keep (підтримка)	10–15 повт	3–4 підходи	Баланс Базова/Ізоляція. Різноманітність. Стабілізація

4.4 Крок 4 — Визначення кількості вправ на день
Кількість вправ залежить від типу дня (full body / upper / lower / push / pull / legs) і рівня.
Тип дня	Beginner	Intermediate	Advanced
Full Body	5–6 вправ	6–7 вправ	7–8 вправ
Upper / Lower	4–5 вправ	5–6 вправ	6–7 вправ
Push / Pull / Legs	–	5–6 вправ	6–8 вправ

5. АЛГОРИТМ ПІДБОРУ ВПРАВ
5.1 Пріоритети вибору вправ
Вправи відбираються з exercise_library по наступному алгоритму для кожного типу дня:
•	1. Зібрати всі вправи потрібних груп м'язів (group_level1/level2)
•	2. Відфільтрувати BLOCKED (медичні протипоказання)
•	3. Пріоритизувати SAFE (рекомендовані при стані)
•	4. Відфільтрувати за difficulty (beginner → Низька/Середня; advanced → Середня/Висока)
•	5. Відфільтрувати за vid: для gain → Базова першочергово; для lose → Ізоляція
•	6. Рандомна вибірка з відфільтрованого пулу (уникати повторів між сесіями)
5.2 Відповідність тип дня → групи м'язів
Тип дня	group_level1	group_level2 (пріоритет)
Full Body	Верх + Низ + Кор	Спина, Груди, Ноги, Прес (по 1–2 вправи)
Upper	Верх	Спина 2 + Груди 2 + Плечі 1 + (Руки 1 для advanced)
Lower	Низ + Кор	Ноги 3 + Сідниці 1–2 + Прес 1
Push	Верх (тяга)	Груди 2–3 + Плечі 2 + (Трицепс 1)
Pull	Верх (тяга)	Спина 3–4 + (Біцепс 1)
Legs	Низ	Ноги 3 + Сідниці 2–3 + Кор 1



5.3 Відбір для жінок (gender = female)
•	Акцент: Низ (Ноги + Сідниці) — збільшити частку
•	Full Body: Ноги 2 + Сідниці 2 + Спина 1 + Груди 1 + Прес 1
•	Lower: Ноги 2 + Сідниці 3 + Прес 1
•	Upper: Спина 2 + Плечі 2 + Груди 1 + (Руки 1)
•	Виключити вправи на важку вагу для грудей за замовчуванням, якщо немає goal=gain
5.4 Відбір при ожирінні (MC018)
Клас	Обмеження для підбору вправ
class1 (BMI 30–35)	Уникати важких присідань з вагою; використовувати leg press, жим ногами. Стабілізаційні вправи OK
class2 (BMI 35–40)	Виключити вправи стоячи з штангою; перевагу — тренажери, кабелі. Зменшити ударне навантаження
class3 (BMI 40+)	Тільки сидячи/лежачи. Без стрибків. Мінімальна ударна. Суворо SAFE-вправи

6. СТРУКТУРА БД: ПЛАНИ ТРЕНУВАНЬ
6.1 Таблиця training_plans
Розширена схема порівняно з v1.1 — додано поля для індивідуалізації та автогенерації.

Колонка	Тип	Опис
plan_id	uuid PK	Унікальний ID плану
coach_id	text FK → users	ChatID тренера-автора (null якщо авто)
student_id	text FK → users	ChatID учня, для якого план (null = шаблон)
plan_name	text	Назва плану (auto або задана тренером)
goal	text	lose / gain / keep
level	text	beginner / intermediate / advanced
split_scheme	text	full_body / upper_lower / ppl / etc.
days_per_week	integer	2, 3, 4 або 5
description	text	Опис плану (може бути авто-генерований)
is_active	boolean	true = поточний активний план учня
is_template	boolean	true = шаблон тренера (не прив'язаний до учня)
generation_type	text	manual (тренер) / auto (алгоритм) / ai (AI)
created_at	timestamptz	Дата створення
valid_until	timestamptz	Термін дії плану (опціонально)







6.2 Таблиця training_plan_exercises
Детальний список вправ плану. Зберігає медичні примітки, прогресію та посилання на exercise_library.

Колонка	Тип	Опис
id	uuid PK	ID рядка
plan_id	uuid FK → training_plans	Зв'язок з планом
exercise_id	integer FK → exercise_library	ID вправи з бібліотеки
exercise_name	text	Денормалізована назва (UA) для швидкого доступу
day_number	integer	Номер тренувального дня: 1, 2, 3...
day_label	text	Підпис дня: "Верх тіла", "Push", "Full Body"
order_in_day	integer	Порядок вправи в дні: 1, 2, 3...
sets	integer	Кількість підходів
reps	text	Повтори або діапазон: "8", "10–12", "30 сек"
rest_sec	integer	Відпочинок між підходами (сек)
notes	text	Техніка, модифікація при MC (авто-заповнюється)
medical_status	text	NEUTRAL / SAFE / ALLOWED_WITH_MOD для цього учня
progression_type	text	weight / reps / none — тип прогресії
target_weight	decimal	Початкова вага (якщо задана тренером)

7. ГЕНЕРАЦІЯ ПЛАНУ — ПОВНИЙ АЛГОРИТМ
7.1 Вхідні дані (Input)
generateTrainingPlan(studentChatId, options)
Input:
  studentChatId  — chat_id учня
  options.days_per_week — 2/3/4/5 (може не бути — береться дефолт для рівня)
  options.plan_name     — назва (опціонально)
  options.created_by    — coach_id або "auto"






7.2 Покроковий алгоритм
Крок 1: Читаємо профіль учня
•	users → goal, gender, weight, height, experience_days
•	user_medical_conditions WHERE chat_id = studentChatId AND is_active = true
•	Розрахувати BMI = weight / (height/100)²
•	Визначити level за experience_days (таблиця 4.1)
Крок 2: Визначаємо параметри плану
•	days_per_week: з options або дефолт по level (beginner=3, intermediate=4, advanced=4)
•	split_scheme: з таблиці 4.2 за [level + days_per_week]
•	Формуємо масив day_configs: [{day_number, day_type, muscle_groups}]
Крок 3: Для кожного дня підбираємо вправи
1.	Визначаємо target_groups (Верх/Низ/Кор → конкретні group_level2)
2.	SELECT * FROM exercise_library WHERE group_level2 IN (...) AND active = 'YES'
3.	Для кожної вправи: filterExerciseForUser(exercise, userMedConditions)
4.	Виключаємо BLOCKED, ставимо SAFE вперед, ALLOWED_WITH_MOD позначаємо
5.	Фільтруємо по difficulty відповідно до level
6.	Фільтруємо по vid відповідно до goal (базові/ізоляція)
7.	Відбираємо потрібну кількість вправ (таблиця 4.4)
Крок 4: Визначаємо sets, reps, rest для кожної вправи
•	Базові значення: з таблиці 4.3 (goal)
•	Модифікація за level: beginner → менше підходів, більше повторів
•	Модифікація при MC: якщо ALLOWED_WITH_MOD → зменшити sets або reps відповідно до severity
Крок 5: Запис у БД
8.	INSERT INTO training_plans → отримуємо plan_id
9.	Для кожної вправи кожного дня: INSERT INTO training_plan_exercises з усіма полями
10.	Якщо options.is_active = true → оновити попередній план (is_active = false)

8. UX СЦЕНАРІЇ У БОТІ
8.1 Сценарій А: Тренер створює план для учня (ручний режим)
Крок	Дія тренера	Дія системи
1	Мої учні → [Ім'я] → Програма тренувань	Показ списку активних планів учня + кнопка [+ Новий план]
2	[+ Новий план] → Вибір: Вручну / Авто-підбір	Запит параметрів або авто-генерація
3	Вручну: ввести назву, ціль, рівень, днів/тиж	State зберігає параметри плану
4	По днях: вибір вправ з бібліотеки	Показ відфільтрованих вправ (BLOCKED не показуються). ALLOWED_WITH_MOD — з позначкою ⚠️
5	[✅ Зберегти план]	INSERT у training_plans + training_plan_exercises
6	[🎯 Активувати для учня]	is_active = true для нового, false для старого. Учень отримує сповіщення


8.2 Сценарій Б: Авто-генерація плану

Крок	Дія тренера	Дія системи
1	Мої учні → [Ім'я] → Програма → Авто-підбір	Читаємо весь профіль учня
2	Підтвердити параметри (або ввести кількість днів)	Показ summary: рівень, ціль, медичні стани, кількість днів
3	[⚙️ Генерувати]	Запускає generateTrainingPlan() → повний алгоритм розд. 7
4	Перегляд згенерованого плану	Показ всіх днів з вправами. Кнопки: [✏️ Редагувати] [✅ Активувати] [🗑 Видалити]
5	[✅ Активувати]	is_active = true. Учень отримує сповіщення з планом

8.3 Сценарій В: Учень виконує план

Крок	Дія учня	Дія системи
1	[💪 Почати тренування]	Перевірка active плану. Якщо є → показ поточного дня плану
2	Вибір дня (Д1/Д2/Д3) або авто-наступний	Показ вправ дня з sets/reps/rest. Вправи з ⚠️ — з модифікацією
3	По вправах: реєструє вагу та повтори	INSERT у bot_training_data. Порівняння з target
4	[🏁 Завершити тренування]	Позначає сесію COMPLETED. Оновлює workout_schedule
5	Прогрес: автопрогресія	Якщо завершено всі підходи на target → +2.5кг або +1 повт наступного разу

9. ПРОГРЕСІЯ ТА АДАПТАЦІЯ ПЛАНУ
9.1 Правила автопрогресії

Тип прогресії	Умова	Дія системи
Вагова (weight)	Виконав всі підходи на всі повтори	Наступне тренування: +2.5 кг (базові) або +1.25 кг (ізоляція)
Повторна (reps)	Завершив верхню межу діапазону (напр. 12 з 10–12)	Наступне: збільшити reps на 1–2 або перейти до вагової
Деавтоматизація	Не виконав мінімум підходів 2 рази поспіль	Зменшити вагу на 10%. Тренер отримує сповіщення
Ревізія плану	Після 4–8 тижнів (задається в плані)	Тренер отримує сповіщення: "Час оновити план для [Ім'я]"


9.2 Обмеження прогресії при MC
•	При ALLOWED_WITH_MOD: прогресія тільки через reps, не через weight
•	При MC з severity = moderate: ліміт ваги = поточна вага × 1.5 (не збільшувати понад)
•	При загостренні (severity зростає) → план тимчасово деактивується + сповіщення тренеру

9.3 Оновлення плану при зміні медичного стану
•	Зміна severity → перевірити всі вправи плану через filterExerciseForUser()
•	Якщо нова BLOCKED вправа в плані → замінити на alternatives або деактивувати
•	Логувати зміну в таблицю plan_adjustments (mc_code, old_severity, new_severity, affected_exercises)

10. FSM СТАНИ ТА CALLBACK_DATA
10.1 Нові FSM стани
Відповідно до VETO RULE 1 — тільки Enum через constants.js. Додати до FSM_STATES:

FSM State	Модуль	Призначення
PLAN_SELECT_TYPE	trainingPlan.js	Вибір: вручну / авто / шаблон
PLAN_SET_NAME	trainingPlan.js	Введення назви плану
PLAN_SET_GOAL	trainingPlan.js	Вибір цілі (lose/gain/keep)
PLAN_SET_LEVEL	trainingPlan.js	Вибір рівня
PLAN_SET_DAYS	trainingPlan.js	Вибір кількості днів/тиж
PLAN_ADD_EXERCISE	trainingPlan.js	Додавання вправи до дня плану
PLAN_REVIEW	trainingPlan.js	Перегляд плану перед збереженням
MC_ADD_CODE	medicalProfile.js	Введення MC-коду
MC_ADD_SEVERITY	medicalProfile.js	Вибір severity для MC
WORKOUT_SELECT_DAY	training.js	Вибір дня плану для тренування
10.2 callback_data для планів
Тип 1 (FSM команди) та Тип 2 (одношагові дії) за гібридним підходом:
callback_data	Тип	Опис
PLAN_CREATE_MANUAL	Тип 1	Старт ручного створення плану
PLAN_CREATE_AUTO	Тип 1	Старт авто-генерації
PLAN_GOAL_LOSE/GAIN/KEEP	Тип 1	Вибір цілі
PLAN_DAYS_2/3/4/5	Тип 1	Кількість тренувальних днів
PLAN_CONFIRM_SAVE	Тип 1	Підтвердження збереження плану
PLAN_ACTIVATE:{plan_id}	Тип 2	Активувати конкретний план
PLAN_VIEW:{plan_id}	Тип 2	Переглянути план
PLAN_DELETE:{plan_id}	Тип 2	Видалити план
MC_ADD	Тип 1	Старт додавання MC стану
MC_REMOVE:{mc_id}	Тип 2	Видалити медичний стан
WORKOUT_DAY:{day_number}	Тип 2	Вибрати день плану для тренування

11. SQL МІГРАЦІЇ SUPABASE
Нові таблиці та зміни в існуючих для підтримки логіки планів тренувань.
11.1 Таблиця user_medical_conditions
CREATE TABLE user_medical_conditions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id       text NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  mc_code       text NOT NULL,  -- MC001...MC025
  severity      text NOT NULL,
  notes         text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz,
  UNIQUE (chat_id, mc_code)     -- один стан на користувача
);
CREATE INDEX ON user_medical_conditions(chat_id, is_active);
11.2 Таблиця training_plans (оновлена)
CREATE TABLE training_plans (
  plan_id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id        text REFERENCES users(chat_id),
  student_id      text REFERENCES users(chat_id),
  plan_name       text NOT NULL,
  goal            text NOT NULL CHECK (goal IN ('lose','gain','keep')),
  level           text NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  split_scheme    text,
  days_per_week   integer,
  description     text,
  is_active       boolean DEFAULT false,
  is_template     boolean DEFAULT false,
  generation_type text DEFAULT 'manual',
  created_at      timestamptz DEFAULT now(),
  valid_until     timestamptz
);
11.3 Таблиця training_plan_exercises (оновлена)
CREATE TABLE training_plan_exercises (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id         uuid NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  exercise_id     integer REFERENCES exercise_library(id),
  exercise_name   text NOT NULL,
  day_number      integer NOT NULL,
  day_label       text,
  order_in_day    integer DEFAULT 1,
  sets            integer,
  reps            text,
  rest_sec        integer,
  notes           text,
  medical_status  text DEFAULT 'NEUTRAL',
  progression_type text DEFAULT 'weight',
  target_weight   decimal(5,2)
);
CREATE INDEX ON training_plan_exercises(plan_id, day_number);

11.4 Додати поля до таблиці users
ALTER TABLE users ADD COLUMN training_days_per_week integer;
ALTER TABLE users ADD COLUMN active_plan_id uuid REFERENCES training_plans(plan_id);

12. ПРІОРИТЕТ РЕАЛІЗАЦІЇ
Рекомендований порядок впровадження модулів від базового до просунутого:

#	Модуль	Пріоритет	Залежності
1	SQL міграції (розд.11)	🔴 Критично	— (база для всього)
2	medicalProfile.js — CRUD медичних станів	🔴 Критично	user_medical_conditions
3	filterExerciseForUser() — медична фільтрація	🔴 Критично	user_medical_conditions + exercise_library
4	generateTrainingPlan() — авто-генерація	🟡 Висока	кроки 1–3
5	trainingPlan.js — ручне створення	🟡 Висока	exercise_library, training_plans
6	Виконання плану (training.js)	🟡 Висока	training_plan_exercises + bot_training_data
7	Автопрогресія ваги/повторів	🟢 Середня	bot_training_data + training_plan_exercises
8	Ревізія плану (нагадування тренеру)	🟢 Середня	training_plans.valid_until + cron
9	AI-генерація плану	🔵 Низька	Anthropic API + весь профіль



FIT 3.0 | Логіка складання плану тренувань | v1.0 | Лютий 2026
