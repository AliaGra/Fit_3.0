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
    shortLabel: 'Контакти та адреса',
    body:
      '2. Заповни **телефон**, **Telegram**, **Instagram** та **адресу** — користувачі бачать їх на картці закладу:\n' +
      '🏠 Головне меню → 🏢 Мій заклад → ✏️ Контакти та адреса.'
  },
  {
    id: 3,
    shortLabel: 'Групові заняття',
    body:
      '3. Обери коди **групових занять** з довідника — вони з’являться на публічній картці:\n' +
      '🏠 Головне меню → 🏢 Мій заклад → 🏷 Групові заняття.'
  },
  {
    id: 4,
    shortLabel: 'Перегляд картки',
    body:
      '4. Перевір, як учні та тренери бачать ваш заклад у **Клуби, студії**:\n' +
      '🏠 Головне меню → 🏢 Мій заклад → 👁 Як бачать учні.'
  },
  {
    id: 5,
    shortLabel: 'Тренери закладу',
    body:
      '5. Коли тренери додадуть себе в «Де треную», переглянь список у **Тренери закладу**.\n' +
      'Можна **показати** або **приховати** тренера на картці, або **відв’язати** від закладу:\n' +
      '🏠 Головне меню → 🏢 Мій заклад → 🧑‍🏫 Тренери закладу.'
  },
  {
    id: 6,
    shortLabel: 'Ціни та розклад',
    body:
      '6. Переглянь **ціни** та **розклад групових** (редагування цін — через підтримку на фазі 0):\n' +
      '🏠 Головне меню → 🏢 Мій заклад → 💰 Ціни / 📅 Розклад групових (перегляд).'
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
      '\n💡 Усі підказки та керування закладом — у головному меню → **💡 Підказки** та **🏢 Мій заклад**.\n';
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
