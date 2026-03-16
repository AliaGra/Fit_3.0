/**
 * Body analysis AI — генерація текстового аналізу тіла за замірами.
 */

const aiClient = require('./aiClient');
const { SYSTEM_PROMPTS, USER_TEMPLATES } = require('./aiPrompts');
const { getWHStatus, getBMIStatus } = require('../bodyMetrics');
const { classifyBodyType } = require('../bodyType');
const User = require('../user');
const Helpers = require('../helpers');

function buildBodyStatus(user, measurements, scenario) {
  const heightCm = user.height != null ? user.height : measurements.height;
  const weightKg = measurements.weight != null ? measurements.weight : user.weight;
  const waistCm = measurements.waist != null ? measurements.waist : user.waist;

  const rawHip = measurements.hip != null ? measurements.hip : user.hip != null ? user.hip : null;
  const glutesCm = measurements.glutes != null ? measurements.glutes : user.glutes != null ? user.glutes : null;
  // Якщо окремо «стегна» не збирали — використовуємо обхват сідниць (у потоці запрошення тренера є лише сідниці)
  const hipCm = rawHip != null ? rawHip : glutesCm;

  const bodyStatus = {
    scenario,
    gender: user.gender || 'unknown',
    age: user.age != null ? user.age : null,
    goal: user.goal || null,
    heightCm,
    weightKg,
    waistCm,
    hipCm,
    glutesCm,
    shouldersCm: measurements.shoulders != null ? measurements.shoulders : user.shoulders != null ? user.shoulders : null,
    chestCm: measurements.chest != null ? measurements.chest : user.chest != null ? user.chest : null,
    bodyFatPct: measurements.bodyFatPct != null ? measurements.bodyFatPct : user.bodyFatPct != null ? user.bodyFatPct : null
  };

  bodyStatus.whStatus = getWHStatus(bodyStatus.waistCm, bodyStatus.heightCm);
  bodyStatus.bmiStatus = getBMIStatus(bodyStatus.weightKg, bodyStatus.heightCm);

  // Тип фігури (якщо є базові заміри)
  const typeInput = {
    height: bodyStatus.heightCm,
    shoulders: bodyStatus.shouldersCm,
    chest: bodyStatus.chestCm,
    waist: bodyStatus.waistCm,
    glutes: bodyStatus.glutesCm
  };
  bodyStatus.bodyType = classifyBodyType(typeInput, user.gender || 'unknown');

  const missing = [];
  if (!bodyStatus.heightCm) missing.push('зріст');
  if (!bodyStatus.weightKg) missing.push('вага');
  if (!bodyStatus.waistCm) missing.push('талія');
  bodyStatus.missingCore = missing;

  return bodyStatus;
}

async function generateText(bodyStatus) {
  if (!aiClient.isEnabled()) return null;
  const tpl = USER_TEMPLATES && USER_TEMPLATES.BODY_ANALYSIS ? USER_TEMPLATES.BODY_ANALYSIS : '';
  if (!tpl) return null;

  const bodyStatusJson = JSON.stringify(bodyStatus, null, 2);
  const userContent = tpl.replace('{{bodyStatusJson}}', bodyStatusJson);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.BODY_ANALYSIS },
    { role: 'user', content: userContent }
  ];

  const result = await aiClient.chatCompletion(messages, {
    maxTokens: 400,
    temperature: 0.6
  });
  return result && result.content ? result.content.trim() : null;
}

/**
 * Генерація та відправка аналітики учню.
 * @param {string|number} chatId
 * @param {string} scenario - 'coach_invite_create' | 'invite_activate' | 'self_registration'
 * @param {Object} measurements - об'єкт з полями weight, waist, hip, glutes, shoulders, chest, bodyFatPct, height (опційно)
 */
async function generateAndSend(chatId, scenario, measurements = {}) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) return;

    const bodyStatus = buildBodyStatus(user, measurements, scenario);

    if (bodyStatus.missingCore && bodyStatus.missingCore.length > 0) {
      const list = bodyStatus.missingCore.join(', ');
      await Helpers.safeSend(
        chatId,
        'Для детальної аналітики тіла потрібно вказати: ' +
          list +
          '. Коли всі заміри будуть заповнені в профілі — бот надасть аналітику автоматично.'
      );
      return;
    }

    const text = await generateText(bodyStatus);
    if (!text) {
      await Helpers.safeSend(
        chatId,
        'AI-аналітика тимчасово недоступна. Спробуй оновити заміри пізніше.'
      );
      return;
    }

    await Helpers.safeSend(chatId, '📊 Аналіз тіла за замірами:\n\n' + text);
  } catch (e) {
    console.error('BodyAnalysis.generateAndSend', e.message || e);
    await Helpers.safeSend(
      chatId,
      'AI-аналітика тимчасово недоступна. Спробуй оновити заміри пізніше.'
    );
  }
}

module.exports = {
  generateAndSend
};

