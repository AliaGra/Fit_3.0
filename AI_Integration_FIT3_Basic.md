# AI ІНТЕГРАЦІЯ FIT 3.0 — БАЗОВІ ФУНКЦІЇ

**Версія:** 1.0  
**Дата:** 17.02.2026  
**Стек:** Node.js, Railway, OpenAI GPT-4o mini  
**Етап:** Базові функції (місяць 1)

---

## 📋 ОГЛЯД ІНТЕГРАЦІЇ

### Мета
Додати AI-функціонал до існуючого FIT 3.0 бота для покращення користувацького досвіду при **мінімальній вартості** та **максимальній цінності**.

### Базові функції (Етап 1)
1. **Персоналізовані коментарі тренера** — при генерації планів тренувань
2. **Розумні нагадування** — замість стандартних cron-повідомлень
3. **Аналіз невиконання вправ** — коли учень не виконує норму

### Бюджет
- **Модель:** GPT-4o mini ($0.15/$0.60 за 1M токенів)
- **Очікувана вартість:** ~$5-10/місяць при 100 активних користувачах
- **ROI:** Зменшення навантаження на тренера + збільшення залученості учнів

---

## 🏗 АРХІТЕКТУРНІ ПРИНЦИПИ

### 1. AI як доповнення, не заміна
- Детермінований алгоритм (розділи 4–7 з `Логіка складання плану тренувань.md`) **залишається основним**
- AI генерує тільки "м'які" дані: коментарі, пояснення, мотиваційні тексти
- При збої AI — система працює без нього

### 2. Мінімізація токенів
- ❌ НЕ передавати всю `exercise_library` (~31К токенів)
- ✅ Передавати тільки відібрані 6–8 вправ для конкретного дня
- ✅ Structured output (JSON) замість вільного тексту

### 3. Безпека та надійність
- AI НЕ генерує sets/reps/rest (це робить алгоритм)
- AI НЕ змінює медичні фільтри
- Всі AI-відповіді валідуються перед збереженням

---

## 🔧 ТЕХНІЧНА РЕАЛІЗАЦІЯ

### 1. Нова структура проєкту

```
lib/
├── ai/
│   ├── aiClient.js        # OpenAI клієнт + error handling
│   ├── aiPrompts.js       # Системні промпти для кожної функції
│   ├── aiFormatter.js     # Форматування даних для AI
│   └── aiValidator.js     # Валідація AI-відповідей
├── planGenerator.js       # Доповнити AI-коментарями
├── training.js            # Доповнити AI-аналізом невиконання
└── remindersCron.js       # Доповнити AI-персоналізацією
```

### 2. Нові змінні середовища (Railway)

```bash
OPENAI_API_KEY=sk-...
AI_ENABLED=true
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=600
AI_TIMEOUT_MS=10000
```

### 3. Нові таблиці Supabase

```sql
-- AI-генерований контент для аудиту та кешування
CREATE TABLE ai_generated_content (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    content_type text NOT NULL, -- 'plan_comment', 'reminder', 'failure_analysis'
    entity_id text NOT NULL,    -- plan_id, chat_id, etc.
    prompt_hash text,           -- для кешування однакових запитів
    ai_response jsonb NOT NULL,
    tokens_used integer,
    cost_usd decimal(8,6),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX ON ai_generated_content(content_type, entity_id);
CREATE INDEX ON ai_generated_content(prompt_hash); -- для кешу

-- AI налаштування тренера (опційно)
ALTER TABLE users ADD COLUMN ai_features_enabled boolean DEFAULT true;
```

---

## 📝 ДЕТАЛЬНА РЕАЛІЗАЦІЯ ФУНКЦІЙ

### ФУНКЦІЯ 1: Персоналізовані коментарі тренера

#### Де застосовується
- **Файл:** `lib/planGenerator.js`
- **Функція:** `generateTrainingPlan()`
- **Момент:** Після підбору вправ, перед збереженням в `training_plan_exercises`

#### Алгоритм
```javascript
// lib/planGenerator.js
async function generateTrainingPlan(studentChatId, planParams) {
    // 1. Існуючий алгоритм: фільтрація, підбір вправ
    const selectedExercises = await selectExercisesForDay(dayType, level, goal, medicalConditions);
    
    // 2. AI-генерація коментарів (НОВОЕ)
    const aiComments = await generatePlanComments(studentProfile, selectedExercises, dayType);
    
    // 3. Збереження з коментарями
    for (let exercise of selectedExercises) {
        await supabase.insertPlanExercise({
            ...exercise,
            notes: aiComments[exercise.id] || exercise.defaultNotes
        });
    }
}

// lib/ai/aiClient.js - НОВИЙ ФАЙЛ
async function generatePlanComments(studentProfile, exercises, dayType) {
    const prompt = buildPlanCommentsPrompt(studentProfile, exercises, dayType);
    
    const response = await openai.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPTS.PLAN_COMMENTS },
            { role: 'user', content: prompt }
        ],
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 600,
        temperature: 0.7,
        response_format: { type: 'json_object' }
    });
    
    return JSON.parse(response.choices[0].message.content);
}
```

#### Структура промпту
```javascript
// lib/ai/aiPrompts.js - НОВИЙ ФАЙЛ
const SYSTEM_PROMPTS = {
    PLAN_COMMENTS: `Ти — досвідчений фітнес-тренер. Створюй персональні коментарі до вправ для учнів.

Принципи:
- Коротко (до 100 символів на вправу)
- Пояснюй ЧОМУ саме ця вправа для цього учня
- Враховуй медичні обмеження
- Мотивуй, але реалістично
- Використовуй українську мову

Формат відповіді: JSON
{
  "exercise_id_1": "коментар тренера",
  "exercise_id_2": "коментар тренера",
  "day_summary": "загальний коментар до дня"
}`
};

function buildPlanCommentsPrompt(profile, exercises, dayType) {
    return `
ПРОФІЛЬ УЧНЯ:
- Ім'я: ${profile.first_name}
- Вік: ${profile.age}
- Ціль: ${profile.goal}
- Рівень: ${profile.level}
- Медичні стани: ${profile.medicalConditions || 'немає'}

ТИП ДНЯ: ${dayType}

ВПРАВИ ДЛЯ КОМЕНТУВАННЯ:
${exercises.map(ex => `
ID: ${ex.id}
Назва: ${ex.name_ua}
Медичний статус: ${ex.medicalStatus}
Sets: ${ex.sets} Reps: ${ex.reps}
`).join('\n')}

Створи персональні коментарі тренера для кожної вправи та загальний коментар до дня.`;
}
```

#### Приклад AI-відповіді
```json
{
  "exercise_1": "Почни з малої ваги через проблеми з колінами. Техніка важливіша за вагу!",
  "exercise_2": "Ідеальна вправа для твоєї цілі — акцент на широчайші м'язи",
  "exercise_3": "Обережно з амплітудою — не нижче середини грудей",
  "day_summary": "День спини: зосередься на якості руху та відчутті м'язів"
}
```

#### Інтеграція з існуючим кодом
```javascript
// В lib/trainingPlan.js — при відображенні плану
function displayPlanDay(planExercises) {
    let message = `📋 *День ${dayNumber}*\n\n`;
    
    for (let exercise of planExercises) {
        message += `${exercise.name_ua}\n`;
        message += `${exercise.sets} підходи × ${exercise.reps} повторів\n`;
        
        // AI-коментар тренера (НОВОЕ)
        if (exercise.notes) {
            message += `💬 *Тренер:* ${exercise.notes}\n`;
        }
        message += '\n';
    }
    return message;
}
```

#### Вартість
- **Input:** ~2,500 токенів (профіль + 6 вправ)
- **Output:** ~400 токенів (JSON з коментарями)
- **Вартість:** ~$0.001 за план дня
- **При 100 учнях × 3 дні = $0.30/місяць**

---

### ФУНКЦІЯ 2: Розумні нагадування

#### Де застосовується
- **Ендпоінт:** `GET /cron/reminders`
- **Файл:** `lib/remindersCron.js` (новий або модифікація існуючого)

#### Алгоритм
```javascript
// lib/remindersCron.js - МОДИФІКАЦІЯ
async function sendTrainingReminders() {
    const upcomingSlots = await supabase.getUpcomingSlots();
    
    for (let slot of upcomingSlots) {
        // Отримуємо історію тренувань учня
        const studentHistory = await getStudentTrainingHistory(slot.student_id, 30); // за 30 днів
        
        // AI-генерація персонального нагадування
        const aiReminder = await generateSmartReminder(slot, studentHistory);
        
        // Відправка з fallback до стандартного
        const message = aiReminder || getDefaultReminder(slot);
        await sendMessage(slot.student_id, message);
        
        // Логування для аналітики
        await logAIUsage('reminder', slot.id, aiReminder ? 'success' : 'fallback');
    }
}

async function generateSmartReminder(slot, history) {
    try {
        const prompt = buildReminderPrompt(slot, history);
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPTS.SMART_REMINDER },
                { role: 'user', content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.8
        });
        
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('AI reminder failed:', error);
        return null; // fallback to standard
    }
}
```

#### Промпт для нагадувань
```javascript
const SYSTEM_PROMPTS = {
    SMART_REMINDER: `Ти — фітнес-тренер, який надсилає персональні нагадування про тренування.

Принципи:
- Мотиваційний, але не нав'язливий тон
- Згадай недавні досягнення учня
- Натякни на план сьогоднішнього тренування
- До 150 символів
- Українська мова
- Без emojis (додам пізніше)

ЗАБОРОНЕНО:
- Надмірна веселість
- Командний тон
- Обіцянки результатів`
};

function buildReminderPrompt(slot, history) {
    const recentWorkouts = history.slice(0, 3);
    const lastWorkout = recentWorkouts[0];
    
    return `
НАГАДУВАННЯ ПРО ТРЕНУВАННЯ:
Учень: ${slot.student_name}
Дата/час: ${slot.slot_date} ${slot.start_time}
Тип: ${slot.session_type}

ОСТАННІ ТРЕНУВАННЯ:
${recentWorkouts.map(w => `
- ${w.date}: ${w.exercise_count} вправ, загальна вага ${w.total_weight}кг
`).join('')}

${lastWorkout ? `ОСТАННЄ ДОСЯГНЕННЯ: ${lastWorkout.best_exercise}` : ''}

Створи персональне нагадування про сьогоднішнє тренування.`;
}
```

#### Приклади AI-нагадувань
```
"Привіт, Анно! Вчора ти відмінно виконала присідання. Сьогодні день спини — час працювати над поставою!"

"Максим, помітив твій прогрес у жимі лежачи. На сьогоднішньому тренуванні спробуємо нове вихідне положення"

"Олена, ти пропустила тренування у понеділок, але це не страшно. Сьогодні ми наверстаємо втрачене!"
```

#### Вартість нагадувань
- **Input:** ~300 токенів
- **Output:** ~50 токенів  
- **Вартість:** ~$0.0001 за нагадування
- **При 100 нагадувань/день = $3/місяць**

---

### ФУНКЦІЯ 3: Аналіз невиконання вправ

#### Де застосовується
- **Файл:** `lib/training.js`
- **Функція:** після завершення тренування учнем
- **Тригер:** коли учень виконав < 80% від запланованих підходів

#### Алгоритм
```javascript
// lib/training.js - ДОПОВНЕННЯ існуючої функції
async function completeStudentWorkout(chatId, workoutData) {
    // Існуюча логіка збереження
    await insertTrainingData(chatId, workoutData);
    
    // Аналіз невиконання (НОВОЕ)
    const failedExercises = workoutData.exercises.filter(ex => 
        ex.completedSets < ex.plannedSets * 0.8
    );
    
    if (failedExercises.length > 0) {
        const aiAnalysis = await analyzeWorkoutFailures(chatId, failedExercises, workoutData);
        
        if (aiAnalysis) {
            // Відправляємо учню
            await sendMessage(chatId, `💡 *Аналіз тренування:*\n${aiAnalysis.student_message}`);
            
            // Сповіщаємо тренера (якщо критично)
            if (aiAnalysis.notify_coach) {
                const coachId = await getCoachIdByStudent(chatId);
                await sendMessage(coachId, `⚠️ *Увага:* ${aiAnalysis.coach_message}`);
            }
        }
    }
    
    // Автопрогресія (існуюча логіка)
    await handleAutoProgression(chatId, workoutData);
}

async function analyzeWorkoutFailures(chatId, failedExercises, workoutData) {
    try {
        // Історія за 14 днів для аналізу патернів
        const recentHistory = await getTrainingDataByChatAndPeriod(chatId, 14);
        
        const prompt = buildFailureAnalysisPrompt(failedExercises, recentHistory, workoutData);
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPTS.FAILURE_ANALYSIS },
                { role: 'user', content: prompt }
            ],
            max_tokens: 400,
            temperature: 0.5,
            response_format: { type: 'json_object' }
        });
        
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('Failure analysis failed:', error);
        return null;
    }
}
```

#### Промпт для аналізу
```javascript
const SYSTEM_PROMPTS = {
    FAILURE_ANALYSIS: `Ти — досвідчений тренер. Аналізуєш чому учень не виконав вправи і даєш поради.

Формат відповіді: JSON
{
  "student_message": "повідомлення учню (до 200 символів)",
  "coach_message": "повідомлення тренеру (якщо потрібно)",
  "notify_coach": true/false,
  "suggested_changes": ["список змін до плану"]
}

Принципи:
- Підтримуючий тон для учня
- Конкретні поради
- Сповіщати тренера при регулярних невиконаннях
- Українська мова`
};

function buildFailureAnalysisPrompt(failedExercises, history, workoutData) {
    return `
НЕВИКОНАНІ ВПРАВИ:
${failedExercises.map(ex => `
- ${ex.name}: виконано ${ex.completedSets}/${ex.plannedSets} підходів
- Планована вага: ${ex.planned_weight}кг
- Причина (якщо вказана): ${ex.failure_reason || 'не вказана'}
`).join('')}

ІСТОРІЯ (14 днів):
${history.map(h => `
Дата: ${h.date}
Успішність: ${h.completion_rate}%
Проблемні вправи: ${h.failed_exercises.join(', ')}
`).join('')}

ЗАГАЛЬНА ІНФОРМАЦІЯ:
- Тривалість тренування: ${workoutData.duration_minutes} хв
- Самопочуття (1-10): ${workoutData.feeling_score || 'не вказано'}

Проаналізуй причини невиконання та дай поради.`;
}
```

#### Приклад AI-аналізу
```json
{
  "student_message": "Помічаю труднощі з присіданнями 3 тренування поспіль. Спробуй зменшити вагу на 10% і сосередься на техніці",
  "coach_message": "Іван регулярно не виконує присідання — можливо варто переглянути програму",
  "notify_coach": true,
  "suggested_changes": ["зменшити вагу в присіданнях на 10%", "додати розминку колін"]
}
```

#### Вартість аналізу
- **Input:** ~1,000 токенів
- **Output:** ~200 токенів
- **Вартість:** ~$0.0003 за аналіз
- **При 20 аналізів/день = $2/місяць**

---

## 🛡 БЕЗПЕКА ТА ВАЛІДАЦІЯ

### 1. Валідація AI-відповідей

```javascript
// lib/ai/aiValidator.js - НОВИЙ ФАЙЛ
class AIValidator {
    static validatePlanComments(response) {
        if (!response || typeof response !== 'object') return false;
        
        // Перевірка розміру коментарів
        for (let [key, comment] of Object.entries(response)) {
            if (typeof comment !== 'string') return false;
            if (comment.length > 200) return false;
            if (comment.includes('<') || comment.includes('>')) return false; // XSS
        }
        
        return true;
    }
    
    static validateReminder(reminder) {
        if (!reminder || typeof reminder !== 'string') return false;
        if (reminder.length > 300) return false;
        if (reminder.includes('http')) return false; // Заборонити посилання
        
        return true;
    }
    
    static validateFailureAnalysis(response) {
        if (!response || typeof response !== 'object') return false;
        
        const required = ['student_message', 'notify_coach'];
        for (let field of required) {
            if (!response.hasOwnProperty(field)) return false;
        }
        
        return true;
    }
}
```

### 2. Error Handling та Fallbacks

```javascript
// lib/ai/aiClient.js
class AIClient {
    static async safeCall(aiFunction, fallback) {
        try {
            const result = await aiFunction();
            return result || fallback;
        } catch (error) {
            console.error(`AI call failed: ${error.message}`);
            await this.logAIError(error);
            return fallback;
        }
    }
    
    static async logAIError(error) {
        await supabase.insertLog({
            event: 'AI_ERROR',
            details: {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        });
    }
}
```

### 3. Rate Limiting та бюджет

```javascript
// lib/ai/aiClient.js
class AIClient {
    static async checkBudget() {
        const monthlySpend = await this.getMonthlySpend();
        const budget = parseFloat(process.env.AI_MONTHLY_BUDGET) || 50;
        
        if (monthlySpend >= budget) {
            console.warn(`AI budget exceeded: $${monthlySpend}/$${budget}`);
            return false;
        }
        
        return true;
    }
    
    static async trackUsage(functionName, tokensUsed, cost) {
        await supabase.insert('ai_generated_content', {
            content_type: functionName,
            tokens_used: tokensUsed,
            cost_usd: cost,
            created_at: new Date().toISOString()
        });
    }
}
```

---

## 🚀 ПЛАН ВПРОВАДЖЕННЯ

### Тиждень 1: Підготовка інфраструктури
- [ ] Створити `lib/ai/` модулі
- [ ] Додати змінні середовища в Railway
- [ ] Створити таблиці в Supabase
- [ ] Налаштувати OpenAI API

### Тиждень 2: Функція 1 — Коментарі тренера
- [ ] Інтегрувати в `planGenerator.js`
- [ ] Протестувати з реальними планами
- [ ] Додати валідацію та fallbacks
- [ ] Деплой та моніторинг

### Тиждень 3: Функція 2 — Розумні нагадування  
- [ ] Модифікувати `/cron/reminders`
- [ ] Протестувати різні типи повідомлень
- [ ] Налаштувати fallback до стандартних нагадувань

### Тиждень 4: Функція 3 — Аналіз невиконання
- [ ] Інтегрувати в `training.js`
- [ ] Протестувати логіку визначення невиконання
- [ ] Налаштувати сповіщення тренерам

### Тиждень 5: Тестування та оптимізація
- [ ] Повне E2E тестування
- [ ] Аналіз витрат
- [ ] Документація для тренерів
- [ ] Моніторинг та аналітика

---

## 📊 МОНІТОРИНГ ТА АНАЛІТИКА

### Ключові метрики
```sql
-- Дашборд витрат AI
SELECT 
    content_type,
    DATE(created_at) as date,
    COUNT(*) as requests,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usd) as total_cost
FROM ai_generated_content 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY content_type, DATE(created_at)
ORDER BY date DESC;

-- Аналіз ефективності
SELECT 
    student_id,
    COUNT(*) as ai_reminders_sent,
    COUNT(CASE WHEN attended = true THEN 1 END) as attended_after_reminder,
    COUNT(CASE WHEN attended = true THEN 1 END)::float / COUNT(*) as attendance_rate
FROM workout_schedule ws
JOIN ai_generated_content ai ON ai.entity_id = ws.id::text
WHERE ai.content_type = 'reminder'
    AND ws.slot_date >= NOW() - INTERVAL '30 days'
GROUP BY student_id;
```

### Алерти
- Якщо щоденні витрати > $2
- Якщо коефіцієнт помилок AI > 5%
- Якщо час відповіді AI > 15 секунд

---

## 🔄 НАСТУПНІ КРОКИ

### Після успішного впровадження Етапу 1:
1. **Етап 2** — Автоматичні звіти тренера з AI-інсайтами
2. **Етап 3** — Адаптація планів на основі AI-аналізу прогресу
3. **Масштабування** — Міграція на Claude API для кращої якості

### Можливі покращення:
- Кешування часто повторюваних промптів
- A/B тестування різних AI-моделей
- Інтеграція з телеметрією тренувань (пульс, сон)

---

**Автор документа:** Claude  
**Статус:** Готово до впровадження  
**Наступна ревізія:** після завершення Етапу 1

---

## 📚 ДОДАТКИ

### Додаток А: Приклади промптів
[Детальні приклади всіх системних промптів]

### Додаток Б: Схема бази даних
[SQL скрипти для створення нових таблиць]

### Додаток В: Конфігурація Railway
[Повний список змінних середовища]

### Додаток Г: Процедури тестування  
[Чек-лист для тестування кожної AI-функції]
