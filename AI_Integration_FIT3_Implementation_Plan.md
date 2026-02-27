# AI ІНТЕГРАЦІЯ FIT 3.0 — ПОКРОКОВИЙ ПЛАН ВПРОВАДЖЕННЯ

**Джерело:** `AI_Integration_FIT3_Basic.md`  
**Підхід:** впровадження частинами, кожна частина — незалежно тестована.

---

## ЧАСТИНА 0. Підготовка (без AI)

Перед будь-якими викликами API перевірити, що існуючий код стабільний і є точки вставки.

| Крок | Дія | Файли | Критерій готовності |
|------|-----|-------|---------------------|
| 0.1 | Переконатися, що `planGenerator.js` після підбору вправ передає масив `selectedExercises` з полями id, name_ua, medicalStatus, sets, reps — і що при записі в БД використовується поле `notes` | lib/planGenerator.js, lib/supabase.js | Можна отримати масив вправ для одного дня перед insert |
| 0.2 | Переконатися, що cron нагадувань викликає одну функцію (наприклад `sendReminders()` у lib/reminders.js), яка отримує слоти і відправляє повідомлення учням | index.js, lib/reminders.js | Є один вхід для підстановки тексту нагадування |
| 0.3 | Переконатися, що після завершення тренування учнем викликається одна функція (наприклад у `finishStudentPlanWorkout` або окрема обробка), де є доступ до списку вправ і факту виконання підходів | lib/training.js | Є місце, де можна додати виклик аналізу невиконання після збереження даних |

---

## ЧАСТИНА 1. Інфраструктура AI

Мета: мати робочий клієнт OpenAI, валідацію, лог і fallback без інтеграції в бізнес-логіку.

| Крок | Дія | Деталі | Файли |
|------|-----|--------|--------|
| 1.1 | Створити каталог `lib/ai/` | — | lib/ai/ |
| 1.2 | Реалізувати **OpenAI клієнт** | Виклик `openai.chat.completions.create` з env `OPENAI_API_KEY`, `AI_MODEL`, `AI_MAX_TOKENS`, `AI_TIMEOUT_MS`. Обгортка з try/catch, таймаут, повертає `{ content, usage }` або `null`. | lib/ai/aiClient.js |
| 1.3 | Додати **перевірку увімкнення** | Якщо `AI_ENABLED !== 'true'` або немає `OPENAI_API_KEY` — усі функції AI повертають `null` (fallback без виклику API). | lib/ai/aiClient.js |
| 1.4 | Реалізувати **валідатор** | Функції: `validatePlanComments(obj)`, `validateReminder(str)`, `validateFailureAnalysis(obj)` — перевірка типів, довжини, відсутність небезпечних символів/посилань. | lib/ai/aiValidator.js |
| 1.5 | SQL-міграція **ai_generated_content** | Таблиця: id, content_type, entity_id, prompt_hash, ai_response (jsonb), tokens_used, cost_usd, created_at. Індекси по content_type, entity_id, prompt_hash. | supabase_migration_ai_content.sql |
| 1.6 | Функції Supabase для AI | `insertAIGeneratedContent(record)`, опційно `getAIGeneratedByEntity(contentType, entityId)` для кешу. | lib/supabase.js |
| 1.7 | Опційно: колонка **users.ai_features_enabled** | ALTER TABLE users ADD COLUMN ai_features_enabled boolean DEFAULT true. | та ж або окрема міграція |
| 1.8 | Документувати змінні Railway | OPENAI_API_KEY, AI_ENABLED=true, AI_MODEL=gpt-4o-mini, AI_MAX_TOKENS=600, AI_TIMEOUT_MS=10000. | .cursorrules або README / AI_Integration_FIT3_Basic.md |

**Критерій завершення частини 1:** є модуль, який по запиту (наприклад, тестовий endpoint або одразовий виклик з коду) викликає OpenAI і повертає текст; при вимкненому AI або помилці повертається null без падіння.

---

## ЧАСТИНА 2. Промпти та форматери

Мета: централізовані промпти і побудова повідомлень для AI без викликів з бізнес-логіки.

| Крок | Дія | Деталі | Файли |
|------|-----|--------|--------|
| 2.1 | **Системні промпти** | Константи SYSTEM_PROMPTS: PLAN_COMMENTS, SMART_REMINDER, FAILURE_ANALYSIS — тексти з документу (українська, формат JSON де потрібно). | lib/ai/aiPrompts.js |
| 2.2 | **Білдер промпту для коментарів плану** | `buildPlanCommentsPrompt(profile, exercises, dayType)` — профіль (ім'я, вік, goal, level, медичні стани), тип дня, список вправ (id, name_ua, medicalStatus, sets, reps). Вихід — один рядок для user message. | lib/ai/aiPrompts.js або aiFormatter.js |
| 2.3 | **Білдер промпту для нагадувань** | `buildReminderPrompt(slot, studentName, recentWorkouts)` — дата/час слота, ім'я учня, останні 1–3 тренування (дата, к-сть вправ, загальна вага або краще вправа). Вихід — один рядок. | lib/ai/aiPrompts.js або aiFormatter.js |
| 2.4 | **Білдер промпту для аналізу невиконання** | `buildFailureAnalysisPrompt(failedExercises, recentHistory, workoutData)` — невиконані вправи (назва, completedSets/plannedSets, вага), історія за 14 днів (дата, completion_rate, проблемні вправи), тривалість, самопочуття. Вихід — один рядок. | lib/ai/aiPrompts.js або aiFormatter.js |

**Критерій завершення частини 2:** за фіктивними вхідними даними білдери повертають коректні тексти промптів; системні промпти збережені в одному місці.

---

## ЧАСТИНА 3. Функція 1 — Персоналізовані коментарі тренера

Мета: після підбору вправ для дня плану додати AI-коментарі в поле `notes` перед збереженням у БД.

| Крок | Дія | Деталі | Файли |
|------|-----|--------|--------|
| 3.1 | Функція **generatePlanComments** | Вхід: профіль учня (firstName, age, goal, level, medicalSummary), масив вправ дня (id, name_ua, medicalStatus, sets, reps), dayType. Виклик aiClient з SYSTEM_PROMPTS.PLAN_COMMENTS та buildPlanCommentsPrompt. response_format: json_object. Парсинг JSON. | lib/ai/aiClient.js або окрема lib/ai/planComments.js |
| 3.2 | Валідація відповіді | Після парсингу — aiValidator.validatePlanComments(response). Якщо не пройдено — повернути null. Обрізати кожен коментар до 200 символів. | lib/ai/aiValidator.js |
| 3.3 | Мапінг на вправи | Відповідь має вигляд { "exercise_id_1": "текст", "exercise_id_2": "текст", "day_summary": "..." }. Для кожної вправи в масиві: notes = response[ex.id] || ex.defaultNotes. day_summary можна зберігати окремо або в першій вправі дня — за домовленістю. | lib/ai/ або planGenerator |
| 3.4 | Інтеграція в **planGenerator** | У циклі по днях після отримання selectedExercises для дня: якщо AI_ENABLED і профіль доступний — викликати generatePlanComments; отриманий мапінг підставити в notes кожної вправи перед insertTrainingPlanExercise. При помилці або null — залишити notes як є (порожні або default). | lib/planGenerator.js |
| 3.5 | Лог і бюджет | Після успішного виклику — insertAIGeneratedContent({ content_type: 'plan_comment', entity_id: planId або day key, ai_response, tokens_used, cost_usd }). | lib/ai/aiClient.js, lib/supabase.js |
| 3.6 | Перегляд у боті | У trainingPlan.js при відображенні плану (перегляд дня): якщо у вправи є notes — показувати рядок типу «Тренер: …». | lib/trainingPlan.js |

**Критерій завершення частини 3:** при генерації плану (Авто-підбір) у вправ з’являються короткі персональні коментарі; при вимкненому AI план генерується без коментарів.

---

## ЧАСТИНА 4. Функція 2 — Розумні нагадування

Мета: замість фіксованого тексту нагадування надсилати AI-згенерований текст (з fallback).

| Крок | Дія | Деталі | Файли |
|------|-----|--------|--------|
| 4.1 | Дані для промпту | У **lib/reminders.js** при обробці слота: отримати student_name (User.getByChatId), опційно останні тренування за 30 днів (bot_training_data або workout_schedule COMPLETED по student_id) — дата, кількість вправ/підходів. Якщо немає готової функції — додати getStudentRecentWorkoutsSummary(chatId, days). | lib/reminders.js, lib/supabase.js |
| 4.2 | Функція **generateSmartReminder** | Вхід: slot (studentId, date, time, coachId), studentName, recentWorkouts (масив коротких описів). Побудова промпту buildReminderPrompt. Виклик OpenAI (без json_object — вільний текст). Валідація validateReminder (довжина, без посилань). Повертає рядок або null. | lib/ai/ (наприклад aiClient або remindersAI.js) |
| 4.3 | Інтеграція в **sendReminders** | Для кожного слота: якщо AI_ENABLED — викликати generateSmartReminder; якщо результат не null і валідний — використати його як текст повідомлення; інакше — поточний фіксований текст (formatSlotTime, ім’я тренера). Префікс «Нагадування» або emoji за бажанням додати до обох варіантів. | lib/reminders.js |
| 4.4 | Лог | Після відправки — insertAIGeneratedContent для content_type 'reminder', entity_id = slot.id. | lib/reminders.js, supabase |

**Критерій завершення частини 4:** при увімкненому AI учні отримують персоніфіковані нагадування; при вимкненому або помилці — стандартний текст.

---

## ЧАСТИНА 5. Функція 3 — Аналіз невиконання вправ

Мета: після завершення тренування учнем, якщо є вправи з виконанням &lt; 80% підходів, отримати AI-аналіз і надіслати учню повідомлення + за потреби тренеру.

| Крок | Дія | Деталі | Файли |
|------|-----|--------|--------|
| 5.1 | Визначення невиконання | Після завершення тренування за планом: для кожного дня є список вправ з planned sets; з bot_training_data за поточну дату й chat_id можна порахувати completed sets на вправу. Якщо completedSets < plannedSets * 0.8 — вправа в списку failedExercises. Зібрати: name, completedSets, plannedSets, planned weight (target_weight з плану). | lib/training.js |
| 5.2 | Історія за 14 днів | Функція getTrainingDataByChatAndDate вже є. Додати або розширити для отримання агрегованої «успішності» по днях (скільки підходів виконано vs заплановано) — або передати сирі записи за 14 днів і описати їх у промпті. | lib/supabase.js, lib/ai/aiFormatter.js |
| 5.3 | Функція **analyzeWorkoutFailures** | Вхід: chatId, failedExercises, workoutData (duration_minutes, feeling_score опційно). Зібрати recentHistory (14 днів). buildFailureAnalysisPrompt → виклик OpenAI, response_format: json_object. Парсинг JSON, validateFailureAnalysis. Повертає { student_message, coach_message, notify_coach, suggested_changes } або null. | lib/ai/ (наприклад aiClient або failureAnalysis.js) |
| 5.4 | Інтеграція в **training.js** | Після applyProgressionAfterWorkout (або в кінці finishStudentPlanWorkout): зібрати по поточному дню та записах сьогодні список вправ з planned/completed sets; якщо є невиконання &lt; 80% — викликати analyzeWorkoutFailures. Якщо результат є: відправити учню «Аналіз тренування:» + student_message; якщо notify_coach === true — відправити тренеру (coachId учня) coach_message. | lib/training.js |
| 5.5 | Лог і валідація | Логувати в ai_generated_content (content_type: 'failure_analysis', entity_id: chatId або session id). Обрізати student_message і coach_message за довжиною у валідаторі. | lib/ai/aiValidator.js, supabase |

**Критерій завершення частини 5:** після тренування з недовиконанням учень отримує короткий аналіз; при потребі тренер — сповіщення; при вимкненому AI нічого не відправляється.

---

## ЧАСТИНА 6. Кеш, бюджет, моніторинг (опційно)

| Крок | Дія | Деталі |
|------|-----|--------|
| 6.1 | Кеш по prompt_hash | Перед викликом AI обчислити hash промпту (наприклад SHA256 від system+user). Перевірити ai_generated_content по prompt_hash; якщо є запис за останні N годин — повернути збережену відповідь. Корисно для однакових коментарів до типових планів. |
| 6.2 | Місячний бюджет | Змінна AI_MONTHLY_BUDGET (наприклад 50). Перед кожним викликом (або раз на день) підраховувати SUM(cost_usd) за поточний місяць; якщо >= бюджету — не викликати API, fallback. |
| 6.3 | Алерти | Опційно: при щоденних витратах > $2 або error rate > 5% писати в лог або відправляти повідомлення адміну. |

---

## ПОРЯДОК ВПРОВАДЖЕННЯ (рекомендований)

1. **Частина 1** — інфраструктура (без неї нічого не працює).
2. **Частина 2** — промпти (потрібні для 3–5).
3. **Частина 3** — коментарі тренера (найпростіша інтеграція, один виклик на день плану).
4. **Частина 4** — розумні нагадування (незалежний cron).
5. **Частина 5** — аналіз невиконання (залежить від наявності даних про planned/completed у training.js).
6. **Частина 6** — за бажанням після стабільної роботи 3–5.

Після кожної частини — деплой, перевірка з AI_ENABLED=true та AI_ENABLED=false, перегляд логів і таблиці ai_generated_content.

---

## ЧЕКЛИСТ ПЕРЕД КОЖНОЮ ЧАСТИНОЮ

- [ ] Змінні середовища описані (і при потребі додані в Railway).
- [ ] Міграції Supabase виконані для цієї частини.
- [ ] При падінні або вимкненому AI бот не падає і показує fallback.
- [ ] Українська мова в промптах і в відповідях.
- [ ] Ніяких секретів і повних профілів у логах клієнта.

Якщо скажеш, з якої частини почати (наприклад 1 або 1+2), можу розписати конкретні кроки коду для неї.
