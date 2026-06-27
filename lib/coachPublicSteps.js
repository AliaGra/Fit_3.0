/**
 * Підказки тренера «Публічні дані» — чекліст (зберігання в bot_state).
 */
const State = require('./state');

const PERSIST_KEY = 'coachPublicStepsDone';

const COACH_PUBLIC_STEPS = Object.freeze([
  {
    id: 1,
    shortLabel: 'Instagram',
    body:
      '1. Додай посилання на свій інстаграм-акаунт:\n' +
      '🏠 Головне меню → 👤 Мій профіль → ✏️ Редагувати дані → Instagram'
  },
  {
    id: 2,
    shortLabel: 'Документи про освіту',
    body:
      '2. Завантаж документи про освіту у сфері фітнес-індустрії:\n' +
      '🏠 Головне меню → 👤 Мій профіль → 📄 Мої документи'
  },
  {
    id: 3,
    shortLabel: 'Де треную',
    body:
      '3. Укажи, в яких фітнес-центрах та студіях ти проводиш тренування:\n' +
      '🏠 Головне меню → 👤 Мій профіль → 🏢 Де треную\n' +
      'або 🏠 Головне меню → 🏢 Клуби, студії → розділ «Де треную».'
  },
  {
    id: 4,
    shortLabel: 'Розклад робочого тижня',
    body:
      '4. Якщо цього ще не зробив, налаштуй розклад свого робочого тижня:\n' +
      '🏠 Головне меню → 📅 Розклад → ⚙️ Налаштування розкладу.\n' +
      'Після цього створи слоти: 📅 Розклад → 🕒 Слоти → 📆 Створити слоти.'
  }
]);

const INTRO =
  'Ці дані бачитимуть твої учні та користувачі платформи, які шукають тренера:\n\n';

function normalizeDoneMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const item of COACH_PUBLIC_STEPS) {
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
  if (!COACH_PUBLIC_STEPS.some((s) => s.id === id)) return false;
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

function buildPublicDataIntroText() {
  let text = INTRO;
  for (const item of COACH_PUBLIC_STEPS) {
    text += item.body + '\n';
  }
  return text.trim();
}

function countDone(map) {
  let n = 0;
  for (const item of COACH_PUBLIC_STEPS) {
    if (map[item.id]) n++;
  }
  return n;
}

module.exports = {
  COACH_PUBLIC_STEPS,
  PERSIST_KEY,
  getDoneMap,
  setStepDone,
  toggleStep,
  buildPublicDataIntroText,
  countDone,
  normalizeDoneMap
};
