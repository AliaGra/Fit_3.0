/**
 * Додаткові розділи підказок тренера (чеклісти в bot_state).
 */
const State = require('./state');

const COACH_PLAN_HINTS = Object.freeze({
  key: 'plan',
  persistKey: 'coachPlanHintsDone',
  menuLabel: '📋 План тренувань для учня',
  headerTitle: '📋 **План тренувань для учня**',
  steps: [
    {
      id: 1,
      shortLabel: 'Профіль учня перед планом',
      body:
        '1. Перед складанням плану переконайся, що в профілі учня заповнені:\n' +
        '• поточні заміри та активність;\n' +
        '• бажані параметри тіла (за потреби);\n' +
        '• **медичний профіль** (обмеження враховуються при підборі вправ);\n' +
        '• **мета тренувань**, дата народження, **зони акценту та уникнення**.\n' +
        'Без цих даних авто-план буде менш точним.\n' +
        '🏠 Головне меню → 👥 Мої учні → Список учнів → обери учня → Обміри/Активність, Медичний профіль.'
    },
    {
      id: 2,
      shortLabel: 'AI-аналітика учня',
      body:
        '2. Запусти AI-аналіз тіла учня — отримаєш рекомендації щодо навантаження\n' +
        'та акцентних зон перед складанням плану:\n' +
        '🏠 Головне меню → 👥 Мої учні → Список учнів → обери учня → 🤖 AI-аналітика.\n' +
        'Оновлюй заміри учня — аналіз показує динаміку.'
    },
    {
      id: 3,
      shortLabel: 'Відкрити план учня',
      body:
        '3. Відкрий список планів конкретного учня:\n' +
        '🏠 Головне меню → 👥 Мої учні → Список учнів → обери учня → 📋 План тренувань.\n' +
        'Тут можна створити новий план або редагувати існуючі.'
    },
    {
      id: 4,
      shortLabel: 'Авто-підбір плану',
      body:
        '4. **Авто-підбір** — платформа згенерує план за профілем учня:\n' +
        '➕ Новий план → **Авто-підбір** → кількість вправ на день (або «За рекомендацією»)\n' +
        '→ тривалість фази → **зони акценту** (1–2 або «Все рівномірно») → підтвердження split.\n' +
        'Платформа враховує ціль, рівень, дні на тиждень, медичні обмеження та бібліотеку вправ.\n' +
        'Якщо профіль неповний — доповни в картці учня або обери **План вручну**.'
    },
    {
      id: 5,
      shortLabel: 'План вручну',
      body:
        '5. **Вручну** — повний контроль тренера:\n' +
        '➕ Новий план → **Вручну** → назва, ціль, рівень, дні на тиждень.\n' +
        'Додавай вправи з **Бібліотеки вправ** та **Мої вправи** (свої вправи — лише для тебе).\n' +
        'Для кожної вправи обери пресет підходів або введи вручну.\n' +
        'Можна редагувати дні плану після створення.'
    },
    {
      id: 6,
      shortLabel: 'Активувати план',
      body:
        '6. Після створення натисни **🎯 Активувати** — учень побачить цей план\n' +
        'під час тренування (вправи, підходи, ваги).\n' +
        'Один учень — один активний план. Новий план можна активувати замість попереднього.\n' +
        'Перегляд і редагування — у тому ж розділі **План тренувань** картки учня.'
    }
  ]
});

const COACH_TRAINING_HINTS = Object.freeze({
  key: 'training',
  persistKey: 'coachTrainingHintsDone',
  menuLabel: '💪 Проведення тренувань',
  headerTitle: '💪 **Проведення тренувань**',
  steps: [
    {
      id: 1,
      shortLabel: 'Тренування з учнем',
      body:
        '1. Щоб почати тренування з учнем, відкрий картку учня і натисни «Тренування учнів»:\n' +
        '🏠 Головне меню → 💪 Тренування → Тренування учнів.\n' +
        'Тип тренування: персональне (1 учень), спліт (2 учні), тріо (3 учні).\n' +
        'Ціна за тип визначається у «Вартість тренувань».'
    },
    {
      id: 2,
      shortLabel: 'Відмітити тренування',
      body:
        '2. Після завершення тренування відміть його як виконане — платформа запише дату,\n' +
        'обчислить дохід і додасть до звіту:\n' +
        '🏠 Головне меню → 📅 Розклад → ✔️ Відмітити тренування.'
    },
    {
      id: 3,
      shortLabel: 'Моє тренування',
      body:
        '3. Ти також можеш логувати своє власне тренування (без учня) — для відстеження\n' +
        'власної фізичної активності:\n' +
        '🏠 Головне меню → 💪 Тренування → Моє тренування.'
    },
    {
      id: 4,
      shortLabel: 'Бібліотека та мої вправи',
      body:
        '4. Для складання планів використовуй бібліотеку платформи та свої вправи.\n' +
        'Свої — доступні лише тобі:\n' +
        '🏠 Головне меню → 💪 Тренування → Бібліотека вправ\n' +
        '🏠 Головне меню → 💪 Тренування → ⭐ Мої вправи.'
    }
  ]
});

const COACH_BREAKS_HINTS = Object.freeze({
  key: 'breaks',
  persistKey: 'coachBreaksHintsDone',
  menuLabel: '📅 Перерви та відпустки',
  headerTitle: '📅 **Перерви та відпустки**',
  steps: [
    {
      id: 1,
      shortLabel: 'Перерва на слот',
      body:
        '1. Якщо в певний час ти не приймаєш учнів — постав перерву на конкретний слот.\n' +
        'Учні не бачать слоти зі статусом «перерва»; записати на нього можна вручну:\n' +
        '🏠 Головне меню → 📅 Розклад → 🍔 Мої перерви \\ відпустки → Створити перерву\n' +
        '(або в Календарі: обери день → час → «🍔 Хочу перерву»).'
    },
    {
      id: 2,
      shortLabel: 'Відпустка',
      body:
        '2. Якщо ти йдеш у відпустку — заблокуй цілий день, щоб учні не бачили вільних\n' +
        'слотів на ці дати:\n' +
        '🏠 Головне меню → 📅 Розклад → 🍔 Мої перерви \\ відпустки → Створити відпустку.\n' +
        '⚠️ Дні з підтвердженими записами заблокувати не можна — спочатку перенеси або\n' +
        'скасуй тренування.'
    }
  ]
});

const COACH_REPORTS_HINTS = Object.freeze({
  key: 'reports',
  persistKey: 'coachReportsHintsDone',
  menuLabel: '📊 Звіти та доходи',
  headerTitle: '📊 **Звіти та доходи**',
  steps: [
    {
      id: 1,
      shortLabel: 'Статистика та доходи',
      body:
        '1. Переглядай статистику тренувань і суму доходів за обраний період:\n' +
        '🏠 Головне меню → 📊 Звіти → Сума доходів або Історія моїх тренувань.\n' +
        'Введи кількість днів (1–365) — платформа підрахує кількість проведених\n' +
        'тренувань і суму за вказаний період.'
    },
    {
      id: 2,
      shortLabel: 'Коректний облік доходів',
      body:
        '2. Щоб доходи рахувались коректно — відмічай кожне тренування як виконане\n' +
        '(«✔️ Відмітити тренування») і переконайся, що вартість тренувань встановлена\n' +
        '(«Вартість тренувань» у профілі або в картці учня).'
    }
  ]
});

const COACH_SUBSCRIPTION_HINTS = Object.freeze({
  key: 'subscription',
  persistKey: 'coachSubscriptionHintsDone',
  menuLabel: '🎫 Абонемент залу',
  headerTitle: '🎫 **Абонемент залу**',
  steps: [
    {
      id: 1,
      shortLabel: 'Абонемент у залі',
      body:
        '1. Якщо ти оплачуєш абонемент у залі — внеси його в платформу:\n' +
        '🏠 Головне меню → 🎫 Абонемент.\n' +
        'Укажи суму, кількість тренувань (або безліміт) і термін дії.\n' +
        'Платформа нагадає за 3 і 2 дні до кінця, а також після того,\n' +
        'як закінчаться тренування за абонементом.'
    }
  ]
});

const COACH_HINT_SECTIONS = Object.freeze([
  COACH_PLAN_HINTS,
  COACH_TRAINING_HINTS,
  COACH_BREAKS_HINTS,
  COACH_REPORTS_HINTS,
  COACH_SUBSCRIPTION_HINTS
]);

function getSectionByKey(key) {
  return COACH_HINT_SECTIONS.find((s) => s.key === key) || null;
}

function normalizeDoneMap(steps, raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const item of steps) {
    out[item.id] = !!raw[item.id] || !!raw[String(item.id)];
  }
  return out;
}

async function getDoneMap(chatId, section) {
  const st = await State.get(chatId);
  return normalizeDoneMap(section.steps, st && st[section.persistKey]);
}

async function setStepDone(chatId, section, stepId, done) {
  const id = parseInt(String(stepId), 10);
  if (!section.steps.some((s) => s.id === id)) return false;
  const st = (await State.get(chatId)) || {};
  const map = normalizeDoneMap(section.steps, st[section.persistKey]);
  map[id] = !!done;
  await State.update(chatId, { [section.persistKey]: map });
  return true;
}

async function toggleStep(chatId, section, stepId) {
  const id = parseInt(String(stepId), 10);
  const map = await getDoneMap(chatId, section);
  return setStepDone(chatId, section, id, !map[id]);
}

function countDone(map, section) {
  let n = 0;
  for (const item of section.steps) {
    if (map[item.id]) n++;
  }
  return n;
}

function buildSectionIntroText(section) {
  let text = '';
  for (const item of section.steps) {
    text += item.body + '\n';
  }
  return text.trim();
}

module.exports = {
  COACH_HINT_SECTIONS,
  COACH_PLAN_HINTS,
  COACH_TRAINING_HINTS,
  COACH_BREAKS_HINTS,
  COACH_REPORTS_HINTS,
  COACH_SUBSCRIPTION_HINTS,
  getSectionByKey,
  getDoneMap,
  setStepDone,
  toggleStep,
  countDone,
  buildSectionIntroText,
  normalizeDoneMap
};
