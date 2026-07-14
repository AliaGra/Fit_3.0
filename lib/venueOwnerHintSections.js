/**
 * Розділи підказок власника закладу (чеклісти в bot_state).
 */
const State = require('./state');

const VENUE_OWNER_PROFILE_HINTS = Object.freeze({
  key: 'profile',
  persistKey: 'venueOwnerProfileHintsDone',
  menuLabel: '✏️ Профіль закладу',
  headerTitle: '✏️ **Профіль закладу**',
  steps: [
    {
      id: 1,
      shortLabel: 'Контакти та адреса',
      body:
        '1. Оновлюй **телефон**, **Telegram**, **Instagram** і **адресу** — вони на публічній картці:\n' +
        '🏠 Головне меню → 🏢 Мій заклад → ✏️ Контакти та адреса.\n' +
        'Надішли «-», щоб очистити поле.'
    },
    {
      id: 2,
      shortLabel: 'Групові заняття',
      body:
        '2. Обери коди **групових занять** з довідника платформи — вмикай/вимикай потрібні:\n' +
        '🏠 Головне меню → 🏢 Мій заклад → 🏷 Групові заняття.\n' +
        'Зміни зберігаються одразу.'
    },
    {
      id: 3,
      shortLabel: 'Як бачать користувачі',
      body:
        '3. Переглянь картку так, як її бачать у **Клуби, студії** (контакти, групові, ціни, тренери):\n' +
        '🏠 Головне меню → 🏢 Мій заклад → 👁 Як бачать користувачі платформи ваш клуб.'
    }
  ]
});

const VENUE_OWNER_CONTENT_HINTS = Object.freeze({
  key: 'content',
  persistKey: 'venueOwnerContentHintsDone',
  menuLabel: '💰 Ціни та розклад',
  headerTitle: '💰 **Ціни та розклад**',
  steps: [
    {
      id: 1,
      shortLabel: 'Довідник цін',
      body:
        '1. Переглядай **ціни** закладу (групові, абонементи, послуги) у розділі **💰 Ціни**.\n' +
        'На фазі 0 повне редагування цін — через адміністратора платформи або підтримку.\n' +
        '🏠 Головне меню → 🏢 Мій заклад → 💰 Ціни.'
    },
    {
      id: 2,
      shortLabel: 'Розклад групових',
      body:
        '2. **Розклад групових** — перегляд у боті; зміни розкладу на фазі 0 — через підтримку.\n' +
        '🏠 Головне меню → 🏢 Мій заклад → 📅 Розклад групових (перегляд).'
    }
  ]
});

const VENUE_OWNER_COACHES_HINTS = Object.freeze({
  key: 'coaches',
  persistKey: 'venueOwnerCoachesHintsDone',
  menuLabel: '🧑‍🏫 Тренери закладу',
  headerTitle: '🧑‍🏫 **Тренери закладу**',
  steps: [
    {
      id: 1,
      shortLabel: 'Список тренерів',
      body:
        '1. Тренери самі додають заклад у профілі (**Де треную**). Ти бачиш усіх, хто вказав цей заклад:\n' +
        '🏠 Головне меню → 🏢 Мій заклад → 🧑‍🏫 Тренери закладу.'
    },
    {
      id: 2,
      shortLabel: 'Показати на картці',
      body:
        '2. **Показати на картці** — тренер з’являється на публічній картці закладу для клієнтів і в пошуку.\n' +
        'Відкрий тренера в списку → **✅ Показати на картці**.'
    },
    {
      id: 3,
      shortLabel: 'Приховати з картки',
      body:
        '3. **Приховати** — тренер лишається прив’язаним, але не показується на картці (наприклад, поки не підтвердиш профіль).\n' +
        'Відкрий тренера → **⏸ Приховати з картки**.'
    },
    {
      id: 4,
      shortLabel: 'Відв’язати тренера',
      body:
        '4. **Відв’язати** — тренер більше не вказує цей заклад у «Де треную» для нових клієнтів на картці.\n' +
        'Використовуй обережно. Відкрий тренера → **🚫 Відв’язати від закладу**.'
    }
  ]
});

const VENUE_OWNER_LIMITS_HINTS = Object.freeze({
  key: 'limits',
  persistKey: 'venueOwnerLimitsHintsDone',
  menuLabel: 'ℹ️ Межі ролі (фаза 0)',
  headerTitle: 'ℹ️ **Межі ролі (фаза 0)**',
  steps: [
    {
      id: 1,
      shortLabel: 'Без клієнтів і планів',
      body:
        '1. Власник закладу **не** веде клієнтів, не складає плани тренувань і не проводить персональні тренування в боті.\n' +
        'Це роблять тренери, прив’язані до закладу.'
    },
    {
      id: 2,
      shortLabel: 'Без розкладу персональних',
      body:
        '2. **Розклад персональних** тренувань і запис клієнтів до тренера — у кабінеті тренера, не власника.\n' +
        'Ви бачите лише **розклад групових** (перегляд).'
    },
    {
      id: 3,
      shortLabel: 'Ціни та підтримка',
      body:
        '3. **Редагування цін** і зміни групового розкладу на фазі 0 — через адміністратора або **Зв’язок з розробником**.\n' +
        'У боті доступні перегляд цін і керування карткою закладу.'
    }
  ]
});

const VENUE_OWNER_HINT_SECTIONS = Object.freeze([
  VENUE_OWNER_PROFILE_HINTS,
  VENUE_OWNER_CONTENT_HINTS,
  VENUE_OWNER_COACHES_HINTS,
  VENUE_OWNER_LIMITS_HINTS
]);

function getSectionByKey(key) {
  return VENUE_OWNER_HINT_SECTIONS.find((s) => s.key === key) || null;
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
  VENUE_OWNER_HINT_SECTIONS,
  VENUE_OWNER_PROFILE_HINTS,
  VENUE_OWNER_CONTENT_HINTS,
  VENUE_OWNER_COACHES_HINTS,
  VENUE_OWNER_LIMITS_HINTS,
  getSectionByKey,
  getDoneMap,
  setStepDone,
  toggleStep,
  countDone,
  buildSectionIntroText
};
