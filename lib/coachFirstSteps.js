/**
 * Підказки тренера «В першу чергу» — тексти реєстрації + чекліст (зберігання в bot_state).
 */
const State = require('./state');
const { CONSTANTS } = require('./constants');

const PERSIST_KEY = 'coachFirstStepsDone';

/** 9 пунктів онбордингу (id 1–9). */
const COACH_FIRST_STEPS = Object.freeze([
  {
    id: 1,
    shortLabel: 'Розклад робочого тижня',
    body:
      '1. Спочатку налаштуй розклад свого робочого тижня: 🏠 Головне меню → 📅 Розклад → ⚙️ Налаштування розкладу.'
  },
  {
    id: 2,
    shortLabel: 'Вільні слоти',
    body:
      '2. Потім створи вільні слоти («вікна») для запису учнів на тренування: 🏠 Головне меню → 📅 Розклад → 🕒 Слоти → 📆 Створити слоти.'
  },
  {
    id: 3,
    shortLabel: 'Додати учнів',
    body:
      '3.Додай своїх учнів на платформу: 🏠 Головне меню → 👥 Мої учні → Додати учня → сформуй інвайт-код і передай учню для входу та прив’язки до тебе.'
  },
  {
    id: 4,
    shortLabel: 'Запис тренувань на платформу',
    body:
      '4. Перенеси час тренувань своїх учнів на платформу одним із двох способів:\n' +
      '=або: 🏠 Головне меню → Розклад → Календар: вибери потрібну дату і час\n' +
      '=або: 🏠 Головне меню → Мої учні → Список учнів: обери учня → Записати'
  },
  {
    id: 5,
    shortLabel: 'Пояснити учню про запис',
    body:
      '5. Поясни учню, що за потреби перенести або записатись на нове тренування йому більше не потрібно телефонувати чи писати тобі, намагаючись узгодити ваш вільний час.\n' +
      'Тепер йому достатньо увійти на платформу в телеграмі і перенести час тренування, вибравши зручний вільний слот у тебе. Ти одразу отримаєш повідомлення в телеграмі, і после твого підтвердження — в учня та у тебе зміниться час тренування.'
  },
  {
    id: 6,
    shortLabel: 'Профіль учня',
    body:
      '6. Разом із кожним учнем заповни його профіль: так ти зможеш складати коректні плани тренувань для учня, відстежувати динаміку розвитку його тіла та прогресію навантаження: 🏠 Головне меню → Мої учні → Список учнів: вибери потрібне прізвище → Обміри/Активність та Медичний профіль.'
  },
  {
    id: 7,
    shortLabel: 'Плани тренувань',
    body:
      '7. Створи плани тренувань кожному учню, використовуючи бібліотеку вправ платформи та додаючи свої вправи, які будуть доступні только тобі: 🏠 Головне меню → Мої учні → Список учнів: вибери потрібне прізвище → План тренувань.'
  },
  {
    id: 8,
    shortLabel: 'Вартість тренувань',
    body:
      '8. Установи вартість своїх тренувань (тоді платформа буде вести статистику твоїх доходів): 🏠 Головне меню → Мій профіль → Вартість тренувань.\n' +
      'Якщо в учня індивідуальний тариф: 🏠 Головне меню → Мої учні → Список учнів: вибери потрібне прізвище → Індивідуальний тариф.'
  },
  {
    id: 9,
    shortLabel: 'AI-аналітика учня',
    body:
      '9. Після заповнення профілю учня (заміри, активність, ціль) — запусти\n' +
      'AI-аналіз тіла учня. Платформа надасть рекомендації щодо навантаження,\n' +
      'акцентних зон і планування:\n' +
      '🏠 Головне меню → 👥 Мої учні → Список учнів → обери учня → 🤖 AI-аналітика.'
  }
]);

function normalizeDoneMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const item of COACH_FIRST_STEPS) {
    out[item.id] = !!raw[item.id] || !!raw[String(item.id)];
  }
  return out;
}

async function getDoneMap(chatId) {
  const st = await State.get(chatId);
  return normalizeDoneMap(st && st[PERSIST_KEY]);
}

async function setStepDone(chatId, stepId, done) {
  const id = parseInt(String(stepId), 10);
  if (!COACH_FIRST_STEPS.some((s) => s.id === id)) return false;
  const st = (await State.get(chatId)) || {};
  const map = normalizeDoneMap(st[PERSIST_KEY]);
  map[id] = !!done;
  await State.update(chatId, { [PERSIST_KEY]: map });
  return true;
}

async function toggleStep(chatId, stepId) {
  const id = parseInt(String(stepId), 10);
  const map = await getDoneMap(chatId);
  return setStepDone(chatId, id, !map[id]);
}

function buildRegAiIntroHintsText(role) {
  if (role === CONSTANTS.ROLES.COACH) {
    let text = 'Що тобі зробити в першу чергу:\n\n';
    for (const item of COACH_FIRST_STEPS) {
      text += item.body + '\n';
    }
    text +=
      '\n💡 Усі підказки щодо перших кроків та огляд можливостей платформи ти знайдеш у головному меню — кнопка **💡 Підказки**.\n';
    return text;
  }
  return (
    '📋 **Далі в анкеті:** поточні заміри, щоденна активність і бажані параметри тіла.\n' +
    '🤖 Це потрібно для AI-аналітики та коректного плану тренувань.\n\n'
  );
}

function countDone(map) {
  let n = 0;
  for (const item of COACH_FIRST_STEPS) {
    if (map[item.id]) n++;
  }
  return n;
}

module.exports = {
  COACH_FIRST_STEPS,
  PERSIST_KEY,
  getDoneMap,
  setStepDone,
  toggleStep,
  buildRegAiIntroHintsText,
  countDone,
  normalizeDoneMap
};
