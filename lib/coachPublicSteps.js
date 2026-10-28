/**
 * Навігатор тренера «Публічні дані» / «Моя публічна картка».
 * Відмітки coachPublicStepsDone зберігаються для сумісності, у UI більше не показуються.
 */
const State = require('./state');

const PERSIST_KEY = 'coachPublicStepsDone';

const COACH_PUBLIC_STEPS = Object.freeze([
  {
    id: 1,
    shortLabel: 'Instagram',
    title: '📸 Instagram',
    why: 'Додай посилання на свій Instagram, якщо хочеш, щоб клієнти могли познайомитися з тобою ближче.',
    ctaLabel: '📸 Додати або змінити Instagram'
  },
  {
    id: 2,
    shortLabel: 'Документи про освіту',
    title: '🎓 Документи про освіту',
    why: 'Додай інформацію про свою освіту, щоб клієнти могли ознайомитися з твоєю кваліфікацією.',
    ctaLabel: '🎓 Додати або змінити дані'
  },
  {
    id: 3,
    shortLabel: 'Де я треную',
    title: '📍 Де я треную',
    why: 'Вкажи, де ти проводиш тренування, щоб клієнтам було легше знайти зручне місце для занять з тобою.',
    ctaLabel: '📍 Додати або змінити місце'
  }
]);

function getPublicStepById(stepId) {
  const id = parseInt(String(stepId), 10);
  return COACH_PUBLIC_STEPS.find((s) => s.id === id) || null;
}

function formatPublicStepPageText(item) {
  if (!item) return '';
  return [item.title || item.shortLabel, '', item.why || ''].filter(Boolean).join('\n').trim();
}

function normalizeDoneMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') {
    for (const item of COACH_PUBLIC_STEPS) out[item.id] = false;
    return out;
  }
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
  let text =
    '📢 Моя публічна картка\n\n' +
    'Тут ти можеш керувати інформацією, яку бачать клієнти та користувачі MAYAG Fit.\n\n';
  for (const item of COACH_PUBLIC_STEPS) {
    text += (item.title || item.shortLabel) + '\n' + (item.why || '') + '\n\n';
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
  normalizeDoneMap,
  getPublicStepById,
  formatPublicStepPageText
};
