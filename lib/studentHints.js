/**
 * Підказки учня (з тренером) — 4 розділи з чеклістами.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const State = require('./state');

// ─── Тексти розділів ─────────────────────────────────────────────────────────

const SECTIONS = Object.freeze([
  {
    key: 'first',
    persistKey: 'studentHintsFirstDone',
    menuLabel: '🚀 В першу чергу',
    headerTitle: '🚀 **В першу чергу**',
    menuCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_FIRST,
    fullTextCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_FIRST_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_FIRST_T,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_FIRST_V,
    steps: [
      {
        id: 1,
        shortLabel: 'Заповнити профіль',
        navButtons: [
          { text: '✏️ Редагувати дані', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_DATA }
        ],
        body:
          '1. Заповни свій профіль — поточні фізичні параметри та активність.\n' +
          'Тренер використовує ці дані для складання коректних планів тренувань:\n' +
          '🏠 Головне меню → 👤 Мій профіль → ✏️ Редагувати дані\n' +
          '(зріст, вага, дата народження, рівень активності, ціль тренувань).'
      },
      {
        id: 2,
        shortLabel: 'Бажані параметри',
        navButtons: [
          { text: '🎯 Бажані параметри', callback_data: CONSTANTS.CALLBACKS.PROFILE_EDIT_GOALS }
        ],
        body:
          '2. Заповни бажані параметри тіла — скільки важити, обсяги, відсоток жиру.\n' +
          'Це ціль, до якої платформа разом із тренером веде тебе:\n' +
          '🏠 Головне меню → 👤 Мій профіль → 🎯 Бажані параметри.'
      },
      {
        id: 3,
        shortLabel: 'Записатись на тренування',
        navButtons: [
          { text: '🖋️ Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }
        ],
        body:
          '3. Запишись на перше тренування — вибери зручний день і час зі слотів тренера:\n' +
          '🏠 Головне меню → 📅 Розклад → 🖋️ Записатись на тренування.\n' +
          'Тренер отримає запит на підтвердження і підтвердить запис.'
      },
      {
        id: 4,
        shortLabel: 'Мій розклад',
        navButtons: [
          { text: '📅 Мій розклад', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE }
        ],
        body:
          '4. Перевіряй «Мій розклад» перед кожним тренуванням — там завжди актуальний список\n' +
          'твоїх підтверджених та очікуючих записів:\n' +
          '🏠 Головне меню → 📅 Розклад → 📅 Мій розклад.'
      },
      {
        id: 5,
        shortLabel: 'Картка тренера',
        navButtons: [
          { text: '👨‍🏫 Мій тренер', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }
        ],
        body:
          '5. Переглянь картку свого тренера — там розклад роботи, заклади і документи про освіту:\n' +
          '🏠 Головне меню → 💪 Тренування → 👨‍🏫 Мій тренер.'
      }
    ]
  },
  {
    key: 'schedule',
    persistKey: 'studentHintsScheduleDone',
    menuLabel: '📅 Мій розклад та записи',
    headerTitle: '📅 **Мій розклад та записи**',
    menuCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_SCHEDULE,
    fullTextCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_SCHEDULE_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_SCH_T,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_SCH_V,
    steps: [
      {
        id: 1,
        shortLabel: 'Самостійний запис',
        navButtons: [
          { text: '🖋️ Записатись на тренування', callback_data: CONSTANTS.CALLBACKS.SCH_STUDENT_BOOK }
        ],
        body:
          '1. Щоб записатись на тренування самостійно — відкрий календар вільних слотів тренера\n' +
          'і вибери зручний час:\n' +
          '🏠 Головне меню → 📅 Розклад → 🖋️ Записатись на тренування.\n' +
          'Після вибору часу тренер отримає запит. Запис підтвердиться після відповіді тренера.'
      },
      {
        id: 2,
        shortLabel: 'Перенести запис',
        navButtons: [
          { text: '🔄 Змінити запис', callback_data: CONSTANTS.CALLBACKS.SCH_S_MY_EDIT }
        ],
        body:
          '2. Щоб перенести вже записане тренування — відкрий список і натисни «🔄 Перенести»\n' +
          'навпроти потрібного запису:\n' +
          '🏠 Головне меню → 📅 Розклад → 🔄 Змінити запис.\n' +
          'Запит на перенос піде тренеру — після його підтвердження час зміниться.'
      },
      {
        id: 3,
        shortLabel: 'Запис від тренера',
        navButtons: [],
        body:
          '3. Якщо тренер записав тебе сам — тобі надійде повідомлення із кнопками\n' +
          '«✅ Підтвердити» та «❌ Відхилити».\n' +
          'Поки не відповіси — головне меню не відкриється (захист від випадкового пропуску).'
      }
    ]
  },
  {
    key: 'ai',
    persistKey: 'studentHintsAiDone',
    menuLabel: '🤖 AI-аналітика та план',
    headerTitle: '🤖 **AI-аналітика та план тренувань**',
    menuCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_AI,
    fullTextCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_AI_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_AI_T,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_AI_V,
    steps: [
      {
        id: 1,
        shortLabel: 'AI-аналіз тіла',
        navButtons: [
          { text: '🤖 AI-аналітика', callback_data: CONSTANTS.CALLBACKS.AI_ANALYTICS }
        ],
        body:
          '1. Запусти AI-аналіз свого тіла — отримаєш рекомендації щодо фізичного стану,\n' +
          'акцентних зон та оптимального навантаження:\n' +
          '🏠 Головне меню → 🤖 AI-аналітика.\n' +
          'Чим повніше заповнений профіль (заміри, активність, ціль) — тим точніший аналіз.'
      },
      {
        id: 2,
        shortLabel: 'Оновлення замірів',
        navButtons: [
          { text: '📊 Оновити заміри', callback_data: CONSTANTS.CALLBACKS.PROFILE_UPDATE_MEASUREMENTS }
        ],
        body:
          '2. Оновлюй заміри регулярно (раз на 2–4 тижні) — платформа відстежує динаміку\n' +
          'твого тіла та прогрес у досягненні цілі:\n' +
          '🏠 Головне меню → 👤 Мій профіль → 📊 Оновити заміри.'
      },
      {
        id: 3,
        shortLabel: 'Тренування та план',
        navButtons: [
          { text: '💪 Моє тренування', callback_data: CONSTANTS.CALLBACKS.TRAINING_START }
        ],
        body:
          '3. Переглядай план тренувань, який склав тренер — вправи, підходи та ваги:\n' +
          '🏠 Головне меню → 💪 Тренування → Моє тренування\n' +
          '(або відкривається автоматично при початку тренування).'
      }
    ]
  },
  {
    key: 'progress',
    persistKey: 'studentHintsProgressDone',
    menuLabel: '📊 Мій прогрес',
    headerTitle: '📊 **Мій прогрес**',
    menuCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_PROGRESS,
    fullTextCallback: CONSTANTS.CALLBACKS.STUDENT_HINTS_PROGRESS_TEXT,
    togglePrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_PRG_T,
    viewPrefix: CONSTANTS.CALLBACK_PREFIXES.STUD_H_PRG_V,
    steps: [
      {
        id: 1,
        shortLabel: 'Історія тренувань',
        navButtons: [
          { text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACKS.HISTORY_MENU }
        ],
        body:
          '1. Переглядай всю історію своїх тренувань — дати, вправи, підходи, навантаження:\n' +
          '🏠 Головне меню → 💪 Тренування → 📊 Історія тренувань.'
      },
      {
        id: 2,
        shortLabel: 'Абонемент залу',
        navButtons: [
          { text: '🎫 Абонемент', callback_data: CONSTANTS.CALLBACKS.MENU_SUBSCRIPTION }
        ],
        body:
          '2. Якщо ти маєш абонемент у залі — внеси його в платформу:\n' +
          '🏠 Головне меню → 🎫 Абонемент.\n' +
          'Платформа нагадає за 3 і 2 дні до кінця терміну та після завершення тренувань\n' +
          'за абонементом.'
      }
    ]
  }
]);

// ─── Допоміжні функції ────────────────────────────────────────────────────────

function getSectionByKey(key) {
  return SECTIONS.find((s) => s.key === key) || null;
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

// ─── Показ меню ──────────────────────────────────────────────────────────────

async function showHintsMenu(chatId) {
  const keyboard = [];
  for (const section of SECTIONS) {
    keyboard.push([{ text: section.menuLabel, callback_data: section.menuCallback }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, '💡 **Підказки**\n\nОбери розділ:', keyboard, { parse_mode: 'Markdown' });
}

async function showChecklist(chatId, section) {
  const done = await getDoneMap(chatId, section);
  const doneCount = countDone(done, section);
  const total = section.steps.length;
  const header =
    section.headerTitle +
    '\n\n' +
    'Виконано: **' + doneCount + ' / ' + total + '**\n\n' +
    'Обери пункт — відкриється повний текст. Відмітку ✅ можна поставити після прочитання.\n\n';

  const keyboard = [];
  for (const item of section.steps) {
    const mark = done[item.id] ? '✅' : '☐';
    keyboard.push([{ text: mark + ' ' + item.id + '. ' + item.shortLabel, callback_data: section.viewPrefix + ':' + item.id }]);
  }
  keyboard.push([{ text: '📋 Деталі всіх пунктів', callback_data: section.fullTextCallback }]);
  keyboard.push([{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.STUDENT_HINTS_MENU }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(chatId, header, keyboard, { parse_mode: 'Markdown' });
}

async function showFullText(chatId, section) {
  let text = section.headerTitle + '\n\n';
  for (const item of section.steps) {
    text += item.body + '\n\n';
  }
  const keyboard = [
    [{ text: '🔙 До чекліста', callback_data: section.menuCallback }],
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.STUDENT_HINTS_MENU }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  ];
  await Helpers.sendKeyboard(chatId, text.trim(), keyboard, { parse_mode: 'Markdown' });
}

async function showStepDetail(chatId, section, stepId) {
  const id = parseInt(String(stepId), 10);
  const item = section.steps.find((s) => s.id === id);
  if (!item) {
    await showChecklist(chatId, section);
    return;
  }
  const done = await getDoneMap(chatId, section);
  const mark = done[id] ? '✅ Виконано' : '☐ Ще не виконано';
  const toggleLabel = done[id] ? '☐ Зняти відмітку' : '✅ Відмітити виконаним';

  const keyboard = [];
  if (item.navButtons && item.navButtons.length > 0) {
    keyboard.push(item.navButtons);
  }
  keyboard.push([{ text: toggleLabel, callback_data: section.togglePrefix + ':' + id }]);
  keyboard.push(
    [{ text: '🔙 До списку пунктів', callback_data: section.menuCallback }],
    [{ text: '🔙 Підказки', callback_data: CONSTANTS.CALLBACKS.STUDENT_HINTS_MENU }],
    [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
  );
  await Helpers.sendKeyboard(
    chatId,
    '**Пункт ' + id + '.** ' + item.shortLabel + '\n\n' + mark + '\n\n' + item.body,
    keyboard,
    { parse_mode: 'Markdown' }
  );
}

// ─── Обробник callbacks ───────────────────────────────────────────────────────

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.STUDENT_HINTS_MENU) {
    await showHintsMenu(chatId);
    return true;
  }

  for (const section of SECTIONS) {
    if (action === section.menuCallback) {
      await showChecklist(chatId, section);
      return true;
    }
    if (action === section.fullTextCallback) {
      await showFullText(chatId, section);
      return true;
    }
    if (action === section.viewPrefix && param) {
      await showStepDetail(chatId, section, param);
      return true;
    }
    if (action === section.togglePrefix && param) {
      await toggleStep(chatId, section, param);
      await showStepDetail(chatId, section, param);
      return true;
    }
  }

  return false;
}

module.exports = {
  SECTIONS,
  showHintsMenu,
  showChecklist,
  showFullText,
  showStepDetail,
  handleCallback
};
