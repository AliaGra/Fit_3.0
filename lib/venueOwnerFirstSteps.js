/**
 * Підказки власника закладу — «В першу чергу».
 */
const State = require('./state');
const { CONSTANTS } = require('./constants');

const PERSIST_KEY = 'venueOwnerFirstStepsDone';

const VENUE_OWNER_FIRST_STEPS = Object.freeze([
  {
    id: 1,
    shortLabel: 'Прив’язка закладу',
    body:
      '1. Після реєстрації адміністратор платформи призначає ваш акаунт власником конкретного закладу.\n' +
      'Доки заклад не прив’язано — у головному меню буде повідомлення про очікування.\n' +
      'Зверніться в **Зв’язок з розробником**, якщо прив’язка затримується.'
  },
  {
    id: 2,
    shortLabel: 'Картка клубу',
    body:
      '2. Перевір публічну картку закладу — так її бачать користувачі платформи:\n' +
      '🏠 Головне меню → 🏢 **Мій заклад**.'
  },
  {
    id: 3,
    shortLabel: 'Тренери закладу',
    body:
      '3. Коли тренери додадуть заклад у «Де треную», переглянь їхні картки:\n' +
      '🏠 Головне меню → 🧑‍🏫 **Тренери закладу** (обери ім’я — відкриється картка тренера).'
  },
  {
    id: 4,
    shortLabel: 'Зв’язок з підтримкою',
    body:
      '4. Зміни контактів, групових, цін або розкладу — через **Зв’язок з розробником** у головному меню.'
  }
]);

function normalizeDoneMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const item of VENUE_OWNER_FIRST_STEPS) {
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
  if (!VENUE_OWNER_FIRST_STEPS.some((s) => s.id === id)) return false;
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

function countDone(map) {
  let n = 0;
  for (const item of VENUE_OWNER_FIRST_STEPS) {
    if (map[item.id]) n++;
  }
  return n;
}

function buildRegAiIntroHintsText(role) {
  if (role === CONSTANTS.ROLES.VENUE_OWNER) {
    let text = 'Що зробити в першу чергу:\n\n';
    for (const item of VENUE_OWNER_FIRST_STEPS) {
      text += item.body + '\n';
    }
    text +=
      '\n🏠 Головне меню: **Мій заклад**, **Тренери закладу**, **Зв’язок з розробником**, **Мій профіль**.\n';
    return text;
  }
  return '';
}

module.exports = {
  VENUE_OWNER_FIRST_STEPS,
  PERSIST_KEY,
  getDoneMap,
  setStepDone,
  toggleStep,
  countDone,
  buildRegAiIntroHintsText
};
