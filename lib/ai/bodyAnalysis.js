/**
 * Body analysis AI — генерація текстового аналізу тіла за замірами.
 */

const aiClient = require('./aiClient');
const { SYSTEM_PROMPTS, USER_TEMPLATES } = require('./aiPrompts');
const { getWHStatus, getBMIStatus } = require('../bodyMetrics');
const { classifyBodyType } = require('../bodyType');
const User = require('../user');
const Helpers = require('../helpers');
const supabase = require('../supabase');

const CONTENT_TYPE_BODY = 'body_analysis';

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
 * Отримати збережений AI-аналіз тіла з БД.
 * @param {string|number} studentChatId
 * @returns {{ text: string, createdAt: Date }|null}
 */
async function getStoredAnalysis(studentChatId) {
  try {
    const row = await supabase.getAIGeneratedByEntity(CONTENT_TYPE_BODY, String(studentChatId));
    if (!row || !row.aiResponse) return null;
    const text = row.aiResponse.text || null;
    if (!text) return null;
    return { text, createdAt: row.createdAt };
  } catch (e) {
    console.error('BodyAnalysis.getStoredAnalysis', e.message || e);
    return null;
  }
}

/**
 * Збудувати, зберегти в БД та повернути текст AI-аналізу.
 * @param {string|number} chatId - chatId того, чию аналітику будуємо (учень)
 * @param {string} scenario
 * @param {Object} measurements
 * @returns {string|null}
 */
async function generateAndSave(chatId, scenario, measurements = {}) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) return null;
    const bodyStatus = buildBodyStatus(user, measurements, scenario);
    if (bodyStatus.missingCore && bodyStatus.missingCore.length > 0) return null;
    const text = await generateText(bodyStatus);
    if (!text) return null;
    await supabase.insertAIGeneratedContent({
      contentType: CONTENT_TYPE_BODY,
      entityId: String(chatId),
      aiResponse: { text, scenario }
    });
    return text;
  } catch (e) {
    console.error('BodyAnalysis.generateAndSave', e.message || e);
    return null;
  }
}

/**
 * Генерація, збереження в БД та відправка аналітики.
 * @param {string|number} chatId - кому відправляємо (може бути тренер або учень)
 * @param {string} scenario
 * @param {Object} measurements
 * @param {string|number|null} [saveForChatId] - чий chatId зберігати в БД (якщо відрізняється від chatId)
 */
async function generateAndSend(chatId, scenario, measurements = {}, saveForChatId) {
  const storeChatId = saveForChatId != null ? saveForChatId : chatId;
  try {
    const user = await User.getByChatId(storeChatId);
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

    // Зберігаємо для учня (storeChatId) незалежно від того, кому показуємо
    await supabase.insertAIGeneratedContent({
      contentType: CONTENT_TYPE_BODY,
      entityId: String(storeChatId),
      aiResponse: { text, scenario }
    });

    await Helpers.safeSend(chatId, '📊 Аналіз тіла за замірами:\n\n' + text);
  } catch (e) {
    console.error('BodyAnalysis.generateAndSend', e.message || e);
    await Helpers.safeSend(
      chatId,
      'AI-аналітика тимчасово недоступна. Спробуй оновити заміри пізніше.'
    );
  }
}

/**
 * Показати AI-аналітику для chatId з БД (без регенерації).
 * @param {string|number} recipientChatId - кому відправити
 * @param {string|number} studentChatId - чий аналіз показати
 * @param {string} [labelPrefix] - префікс заголовку ('📊 AI-аналітика:' чи схожий)
 */
async function sendStoredAnalysis(recipientChatId, studentChatId, labelPrefix) {
  try {
    const stored = await getStoredAnalysis(studentChatId);
    if (stored && stored.text) {
      const dateStr = stored.createdAt
        ? stored.createdAt.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      const header = labelPrefix || '📊 AI-аналітика тіла';
      const dateLine = dateStr ? ' (оновлено: ' + dateStr + ')' : '';
      await Helpers.safeSend(recipientChatId, header + dateLine + ':\n\n' + stored.text);
    } else {
      await Helpers.safeSend(recipientChatId, '📊 AI-аналітика ще не сформована. Оновіть заміри в профілі — аналітика з\'явиться автоматично.');
    }
  } catch (e) {
    console.error('BodyAnalysis.sendStoredAnalysis', e.message || e);
    await Helpers.safeSend(recipientChatId, '📊 AI-аналітика тимчасово недоступна.');
  }
}

/**
 * Показати AI-аналітику: якщо збережена — показати, якщо немає — згенерувати і показати.
 * @param {string|number} recipientChatId - кому відправити
 * @param {string|number} studentChatId - чий аналіз показати
 * @param {string} [labelPrefix] - префікс заголовку
 */
async function sendOrGenerateAnalysis(recipientChatId, studentChatId, labelPrefix) {
  try {
    const stored = await getStoredAnalysis(studentChatId);
    if (stored && stored.text) {
      const dateStr = stored.createdAt
        ? stored.createdAt.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      const header = labelPrefix || '📊 AI-аналітика тіла';
      const dateLine = dateStr ? ' (оновлено: ' + dateStr + ')' : '';
      await Helpers.safeSend(recipientChatId, header + dateLine + ':\n\n' + stored.text);
      return;
    }

    if (!aiClient.isEnabled()) {
      await Helpers.safeSend(recipientChatId, '📊 AI-аналітика ще не сформована. Оновіть заміри в профілі — аналітика з\'явиться автоматично.');
      return;
    }

    // Спроба згенерувати на льоту
    const text = await generateAndSave(studentChatId, 'on_demand', {});
    if (text) {
      const header = labelPrefix || '📊 AI-аналітика тіла';
      await Helpers.safeSend(recipientChatId, header + ':\n\n' + text);
    } else {
      await Helpers.safeSend(recipientChatId, '📊 AI-аналітика ще не сформована. Для аналізу потрібні заміри: вага, талія та зріст.');
    }
  } catch (e) {
    console.error('BodyAnalysis.sendOrGenerateAnalysis', e.message || e);
    await Helpers.safeSend(recipientChatId, '📊 AI-аналітика тимчасово недоступна.');
  }
}

module.exports = {
  generateAndSend,
  generateAndSave,
  getStoredAnalysis,
  sendStoredAnalysis,
  sendOrGenerateAnalysis
};

