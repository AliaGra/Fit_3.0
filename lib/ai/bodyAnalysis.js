/**
 * Body analysis AI — генерація текстового аналізу тіла за замірами.
 */

const aiClient = require('./aiClient');
const { SYSTEM_PROMPTS, USER_TEMPLATES } = require('./aiPrompts');
const { getWHStatus, getBMIStatus } = require('../bodyMetrics');
const { classifyBodyType } = require('../bodyType');
const { interpretBodyProfile } = require('../bodyInterpretation');
const User = require('../user');
const Helpers = require('../helpers');
const supabase = require('../supabase');

const CONTENT_TYPE_BODY = 'body_analysis';

// Ідеальна вага за формулою Devine + детерміновані поправки (тілобудова/вік/стаж)
function calcIdealWeight(heightCm, gender, bodyBuild, age, experienceStartDate) {
  const base = gender === 'female' ? 45.5 : 50.0;
  const inches = Math.max(0, (heightCm - 152.4) / 2.54);
  const ideal = base + 2.3 * inches;
  const build = bodyBuild || 'normosthenic';
  const buildFactor = build === 'asthenic' ? 0.95 : (build === 'hypersthenic' ? 1.05 : 1.0);

  const ageNum = age != null ? Number(age) : null;
  const ageFactor = (ageNum != null && isFinite(ageNum) && ageNum >= 45) ? 1.01 : 1.0;

  let expDays = 0;
  if (experienceStartDate) {
    const d = experienceStartDate instanceof Date ? experienceStartDate : new Date(experienceStartDate);
    if (!isNaN(d.getTime())) expDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000)));
  }
  const expFactor = expDays >= 365 ? 1.02 : (expDays >= 180 ? 1.01 : 1.0);

  const adjIdeal = ideal * buildFactor * ageFactor * expFactor;
  const rangePct = (ageNum != null && ageNum >= 45) ? 0.12 : 0.10;

  return {
    min: Math.round(adjIdeal * (1 - rangePct)),
    ideal: Math.round(adjIdeal),
    max: Math.round(adjIdeal * (1 + rangePct)),
    meta: { build, expDays, age: ageNum }
  };
}

// Вікова група
function getAgeGroup(age) {
  if (!age) return null;
  if (age < 35) return 'young_adult';
  if (age < 45) return 'middle_age';
  if (age < 55) return 'senior_middle';
  return 'senior';
}

// Розподіл тренувань з пріоритетів типу фігури
function calcVolumeSplit(priority) {
  if (!priority) return { upper: 50, lower: 50 };
  if (priority.lower === 'grow' && priority.upper !== 'grow') return { upper: 30, lower: 70 };
  if (priority.upper === 'grow' && priority.lower !== 'grow') return { upper: 70, lower: 30 };
  return { upper: 50, lower: 50 };
}

// Конкретні цілі в см/кг на основі розрахованих відхилень
function calcConcreteGoals(heightCm, waistCm, weightKg, idealWeight) {
  const goals = {};
  // Ціль по талії: до WH < 0.49 (верхня норма)
  if (waistCm && heightCm) {
    const targetWaist = Math.round(heightCm * 0.49);
    if (waistCm > targetWaist) {
      goals.waistReduceCm = waistCm - targetWaist;
      goals.targetWaist = targetWaist;
    }
  }
  // Надлишок ваги відносно ідеальної
  if (weightKg && idealWeight) {
    const excess = Math.round((weightKg - idealWeight.max) * 10) / 10;
    if (excess > 0) goals.weightExcessKg = excess;
  }
  return goals;
}

function buildBodyStatus(user, measurements, scenario) {
  const heightCm = user.height != null ? user.height : measurements.height;
  const weightKg = measurements.weight != null ? measurements.weight : user.weight;
  const waistCm = measurements.waist != null ? measurements.waist : user.waist;
  const neckCm = measurements.neck != null ? measurements.neck : user.neck != null ? user.neck : null;
  const wristCm = measurements.wrist != null ? measurements.wrist : user.wrist != null ? user.wrist : null;

  const rawHip = measurements.hip != null ? measurements.hip : user.hip != null ? user.hip : null;
  const glutesCm = measurements.glutes != null ? measurements.glutes : user.glutes != null ? user.glutes : null;
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
    neckCm,
    wristCm,
    bodyFatPct: measurements.bodyFatPct != null ? measurements.bodyFatPct : user.bodyFatPct != null ? user.bodyFatPct : null
  };

  bodyStatus.whStatus = getWHStatus(bodyStatus.waistCm, bodyStatus.heightCm);
  bodyStatus.bmiStatus = getBMIStatus(bodyStatus.weightKg, bodyStatus.heightCm);

  const typeInput = {
    height: bodyStatus.heightCm,
    shoulders: bodyStatus.shouldersCm,
    chest: bodyStatus.chestCm,
    waist: bodyStatus.waistCm,
    glutes: bodyStatus.glutesCm,
    neck: bodyStatus.neckCm,
    wrist: bodyStatus.wristCm
  };
  bodyStatus.bodyType = classifyBodyType(typeInput, user.gender || 'unknown');

  // Додаткові розрахункові поля для AI
  if (heightCm && user.gender) {
    const build = (bodyStatus.bodyType && bodyStatus.bodyType.bodyBuild) ? bodyStatus.bodyType.bodyBuild : (user.bodyBuild || null);
    bodyStatus.idealWeight = calcIdealWeight(heightCm, user.gender, build, user.age, user.experienceStartDate);
  }
  bodyStatus.ageGroup = getAgeGroup(user.age);
  if (bodyStatus.bodyType && bodyStatus.bodyType.priority) {
    bodyStatus.volumeSplit = calcVolumeSplit(bodyStatus.bodyType.priority);
  }
  bodyStatus.concreteGoals = calcConcreteGoals(heightCm, waistCm, weightKg, bodyStatus.idealWeight);

  const missing = [];
  if (!bodyStatus.heightCm) missing.push('зріст');
  if (!bodyStatus.weightKg) missing.push('вага');
  if (!bodyStatus.waistCm) missing.push('талія');
  bodyStatus.missingCore = missing;

  // Детермінована інтерпретація (Option 5A) — для AI як готові висновки
  try {
    const wh = bodyStatus.whStatus && bodyStatus.whStatus.wh != null ? Number(bodyStatus.whStatus.wh) : null;
    const bmi = bodyStatus.bmiStatus && bodyStatus.bmiStatus.bmi != null ? Number(bodyStatus.bmiStatus.bmi) : null;
    const bt = bodyStatus.bodyType || {};
    bodyStatus.interpretation = interpretBodyProfile({
      gender: user.gender || 'unknown',
      bodyType: bt.type || null,
      bodyBuild: bt.bodyBuild || null,
      fatPct: bt.fatPct != null ? bt.fatPct : (bodyStatus.bodyFatPct != null ? bodyStatus.bodyFatPct : null),
      fatStatus: bt.fatStatus || null,
      wh,
      bmi,
      age: user.age != null ? user.age : null,
      priority: bt.priority || null,
      phase: bt.priority && bt.priority.phase ? bt.priority.phase : null,
      hasWrist: bodyStatus.wristCm != null,
      hasNeck: bodyStatus.neckCm != null
    });
  } catch (e) {
    bodyStatus.interpretation = null;
  }

  return bodyStatus;
}

// Детермінований текстовий блок для AI — код рахує все, AI тільки переказує
// options: { forCoach?: boolean, studentName?: string } — для тренера опис у третій особі
function buildBodyAnalysisBlock(bodyStatus, options) {
  const lines = [];
  if (options && options.forCoach) {
    const namePart = options.studentName ? ' Ім\'я учня: ' + options.studentName + '.' : '';
    lines.push('Аудиторія: тренер.' + namePart + ' Описуй учня в третій особі (учень/учениця, у нього/неї), не звертайся до учня на «ви».');
  }
  const gender = bodyStatus.gender === 'female' ? 'жінка' : bodyStatus.gender === 'male' ? 'чоловік' : null;
  const age = bodyStatus.age != null ? bodyStatus.age + ' р.' : null;

  if (gender || age) {
    lines.push('Профіль: ' + [gender, age, bodyStatus.heightCm ? 'зріст ' + bodyStatus.heightCm + ' см' : null].filter(Boolean).join(', '));
  }

  // Поточний стан
  if (bodyStatus.bmiStatus && bodyStatus.bmiStatus.message) {
    lines.push('ІМТ: ' + bodyStatus.bmiStatus.message);
  } else if (bodyStatus.bmiStatus) {
    lines.push('ІМТ: ' + bodyStatus.bmiStatus.bmi + ' — норма');
  }

  if (bodyStatus.whStatus && bodyStatus.whStatus.message) {
    lines.push('WH (талія/зріст): ' + bodyStatus.whStatus.wh + ' — ' + bodyStatus.whStatus.message);
  } else if (bodyStatus.whStatus) {
    lines.push('WH (талія/зріст): ' + bodyStatus.whStatus.wh + ' — норма');
  }

  // Ідеальна вага і надлишок
  if (bodyStatus.idealWeight) {
    lines.push('Ідеальна вага для зросту: ' + bodyStatus.idealWeight.min + '–' + bodyStatus.idealWeight.max + ' кг');
    if (bodyStatus.concreteGoals && bodyStatus.concreteGoals.weightExcessKg > 0) {
      lines.push('Надлишок відносно норми: ' + bodyStatus.concreteGoals.weightExcessKg + ' кг');
    }
  }

  // Тип фігури
  if (bodyStatus.bodyType && bodyStatus.bodyType.type && bodyStatus.bodyType.type !== 'insufficient_data') {
    const bt = bodyStatus.bodyType;
    lines.push('Тип фігури: ' + (bt.label || bt.type));
    if (bt.description) lines.push('Характеристика: ' + bt.description);
    if (bt.bodyBuild) {
      const map = { asthenic: 'астенік', normosthenic: 'нормостенік', hypersthenic: 'гіперстенік' };
      lines.push('Тілобудова (за запʼястям): ' + (map[bt.bodyBuild] || bt.bodyBuild));
    }
    if (bt.fatPct != null) {
      const status = bt.fatStatus === 'above_normal' ? 'вище норми' : (bt.fatStatus === 'normal' ? 'в межах норми' : null);
      lines.push('% жиру (оцінка за шиєю): ' + bt.fatPct + '%' + (status ? ' — ' + status : ''));
    }
  } else if (!bodyStatus.shouldersCm || !bodyStatus.glutesCm) {
    lines.push('Тип фігури: не визначено (бракує обмірів плечей або ягодиць)');
  }

  // Інтерпретація 5A — готові висновки для AI
  if (bodyStatus.interpretation) {
    if (bodyStatus.interpretation.note) lines.push('Примітка (детерміновано): ' + bodyStatus.interpretation.note);
    if (Array.isArray(bodyStatus.interpretation.risk) && bodyStatus.interpretation.risk.length) {
      lines.push('Ризики (коди): ' + bodyStatus.interpretation.risk.join(', '));
    }
    if (bodyStatus.interpretation.priority_note) lines.push('Пріоритет (детерміновано): ' + bodyStatus.interpretation.priority_note);
  }

  // Рекомендована фаза
  if (bodyStatus.bodyType && bodyStatus.bodyType.priority && bodyStatus.bodyType.priority.phase) {
    const phaseMap = {
      deficit: 'дефіцит калорій (зниження жиру)',
      surplus: 'профіцит калорій (набір м\'язової маси)',
      maintenance: 'підтримка',
      recomposition: 'рекомпозиція (замінюємо жир на м\'язи без різкої зміни ваги)'
    };
    const phaseEff = bodyStatus.interpretation && bodyStatus.interpretation.phaseEffective
      ? bodyStatus.interpretation.phaseEffective
      : bodyStatus.bodyType.priority.phase;
    lines.push('Рекомендована фаза: ' + (phaseMap[phaseEff] || phaseEff));
  }

  // Розподіл тренувань — конкретно в %
  if (bodyStatus.volumeSplit) {
    lines.push('Розподіл тренувань: ' + bodyStatus.volumeSplit.lower + '% нижнє тіло, ' + bodyStatus.volumeSplit.upper + '% верхнє тіло');
  }

  // Конкретні цілі в см/кг
  if (bodyStatus.concreteGoals) {
    if (bodyStatus.concreteGoals.waistReduceCm > 0) {
      lines.push('Ціль по талії: зменшити на ' + bodyStatus.concreteGoals.waistReduceCm + ' см (до ' + bodyStatus.concreteGoals.targetWaist + ' см — верхня межа норми WH)');
    }
    if (bodyStatus.concreteGoals.weightExcessKg > 0) {
      lines.push('Ціль по вазі: знизити на ' + bodyStatus.concreteGoals.weightExcessKg + ' кг до ідеального діапазону');
    }
  }

  // Вікові особливості
  if (bodyStatus.ageGroup === 'senior') {
    lines.push('Вік 55+ — силові тренування критичні для збереження м\'язів і кісток. Відновлення між тренуваннями ніг: 72+ год');
  } else if (bodyStatus.ageGroup === 'senior_middle') {
    lines.push('Вік 45+ — рекомпозиція пріоритетніша за схуднення. Білок: 2.0 г/кг маси тіла. Відновлення між тренуваннями ніг: 48+ год');
  }

  // Медичні прапорці
  if (bodyStatus.whStatus && bodyStatus.whStatus.requireDoctorConfirmation) {
    lines.push('ОБОВ\'ЯЗКОВО: консультація лікаря перед початком будь-яких тренувань');
  } else if (bodyStatus.whStatus && bodyStatus.whStatus.notifyCoach) {
    lines.push('Рекомендується консультація лікаря перед початком тренувань');
  }

  return lines.join('\n');
}

async function generateText(bodyStatus, options) {
  if (!aiClient.isEnabled()) return null;
  const templateKey = options && options.fullAnalysisBlock ? 'BODY_FULL_ANALYSIS' : 'BODY_ANALYSIS';
  const tpl = USER_TEMPLATES && USER_TEMPLATES[templateKey] ? USER_TEMPLATES[templateKey] : '';
  if (!tpl) return null;

  // Передаємо детермінований текстовий блок замість JSON
  // Код розраховує ВСЕ → AI тільки переказує готові висновки
  const analysisBlock = buildBodyAnalysisBlock(bodyStatus, options || {});
  const fullBlock = options && options.fullAnalysisBlock ? String(options.fullAnalysisBlock) : null;
  const userContent = fullBlock
    ? tpl.replace('{{fullAnalysisBlock}}', fullBlock)
    : tpl.replace('{{bodyAnalysisBlock}}', analysisBlock);

  const messages = [
    { role: 'system', content: templateKey === 'BODY_FULL_ANALYSIS' ? SYSTEM_PROMPTS.BODY_FULL_ANALYSIS : SYSTEM_PROMPTS.BODY_ANALYSIS },
    { role: 'user', content: userContent }
  ];

  // Низька temperature — однаковий вхідний блок дає стабільніший текст (менше варіацій між запитами)
  const result = await aiClient.chatCompletion(messages, {
    maxTokens: 400,
    temperature: 0.2
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
 * @param {{ forCoach?: boolean, studentName?: string }} [options] - для тренера: опис у третій особі
 * @returns {string|null}
 */
async function generateAndSave(chatId, scenario, measurements = {}, options) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) return null;
    const bodyStatus = buildBodyStatus(user, measurements, scenario);
    if (bodyStatus.missingCore && bodyStatus.missingCore.length > 0) return null;
    const text = await generateText(bodyStatus, options || {});
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

/**
 * Завжди генерувати свіжу AI-аналітику і відправити.
 * Використовується тренером у картці учня (щоб завжди показувати актуальні дані).
 * @param {string|number} recipientChatId - кому відправити
 * @param {string|number} studentChatId - чий аналіз генерувати
 * @param {string} [labelPrefix] - префікс заголовку
 * @param {string} [studentName] - ім'я учня (для формулювання у третій особі)
 */
async function regenerateAndSendAnalysis(recipientChatId, studentChatId, labelPrefix, studentName) {
  await sendFullAnalysis(recipientChatId, studentChatId, labelPrefix, true, { fromCoach: true, studentChatId, studentName: studentName || '' });
}

/**
 * Побудувати текст дельти по цілях — детерміновано кодом, без AI.
 * @param {Array} deltaItems
 * @returns {string|null}
 */
function buildDeltaLines(deltaItems) {
  if (!deltaItems || deltaItems.length === 0) return null;
  const lines = [];
  for (const item of deltaItems) {
    if (!item || item.current == null || item.goal == null) continue;
    if (item.reached) {
      lines.push(item.label + ': ' + item.current + ' ' + item.unit + ' — ціль досягнута ✅');
    } else {
      lines.push(
        item.label + ': ' + item.current + ' → ' + item.goal + ' ' + item.unit +
        ' (' + item.direction + ' ' + item.delta + ' ' + item.unit + ' — ~' + item.months + ' міс.)'
      );
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Повна аналітика: поточний стан + порівняння з цілями (якщо є).
 * Блок 1: AI генерує з розрахованих даних (BMI, WH, тип фігури).
 * Блок 2: Дельти — детерміновано кодом. AI лише переказує готовий текстовий блок.
 * @param {string|number} recipientChatId - кому відправити
 * @param {string|number} studentChatId - чий аналіз
 * @param {string} [labelPrefix] - префікс заголовку
 * @param {boolean} [forceRegenerate] - true = завжди генерувати нову (для тренера)
 * @param {{ fromCoach?: boolean, studentChatId?: string }} [backContext] - контекст для кнопки «Назад»
 */
async function sendFullAnalysis(recipientChatId, studentChatId, labelPrefix, forceRegenerate = false, backContext = null) {
  const { CONSTANTS } = require('../constants');
  try {
    const today = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    const header = labelPrefix || '📊 AI-аналітика тіла';

    // ── ЄДИНИЙ БЛОК: поточний стан + цілі ──
    let bodyText = null;
    const genOptions = (forceRegenerate && backContext && backContext.fromCoach)
      ? { forCoach: true, studentName: (backContext.studentName || '').trim() }
      : {};
    // Збираємо детермінований блок по цілях (якщо є)
    let fullAnalysisBlock = null;
    try {
      const user = await User.getByChatId(String(studentChatId));
      const supabaseModule = require('../supabase');
      const goalsRow = await supabaseModule.getBodyGoals(String(studentChatId));
      const goalsAnalysis = goalsRow ? (goalsRow.goals_analysis || null) : null;
      if (user) {
        const bodyStatus = buildBodyStatus(user, {}, forceRegenerate ? 'coach_request' : 'on_demand');
        const bodyBlock = buildBodyAnalysisBlock(bodyStatus, genOptions || {});
        let goalsBlock = null;
        if (goalsAnalysis) {
          const bodyGoalsModule = require('../bodyGoals');
          goalsBlock = bodyGoalsModule.buildDeterministicGoalsBlock(goalsAnalysis);
        }
        fullAnalysisBlock = goalsBlock ? (bodyBlock + '\n\n' + goalsBlock) : bodyBlock;
        genOptions.fullAnalysisBlock = fullAnalysisBlock;
      }
    } catch (e) {
      console.error('BodyAnalysis.sendFullAnalysis fullBlock', e.message || e);
    }

    if (forceRegenerate && aiClient.isEnabled()) {
      bodyText = await generateAndSave(studentChatId, 'coach_request', {}, genOptions);
    } else {
      const stored = await getStoredAnalysis(studentChatId);
      if (stored && stored.text) {
        bodyText = stored.text;
      } else if (aiClient.isEnabled()) {
        bodyText = await generateAndSave(studentChatId, 'on_demand', {}, genOptions);
      }
    }

    if (bodyText) {
      await Helpers.safeSend(recipientChatId, header + ' (оновлено: ' + today + '):\n\n' + bodyText);
    } else {
      await Helpers.safeSend(recipientChatId, '📊 Для аналізу поточного стану потрібні заміри: вага, талія та зріст.');
    }

    // Кнопка виходу з аналітики (під текстом аналітики)
    const backRow = buildBackButton(backContext, CONSTANTS);
    if (backRow.length > 0) {
      await Helpers.sendKeyboard(recipientChatId, '—', backRow);
    }
  } catch (e) {
    console.error('BodyAnalysis.sendFullAnalysis', e.message || e);
    await Helpers.safeSend(recipientChatId, '📊 AI-аналітика тимчасово недоступна.');
  }
}

/** Кнопка «Назад»: для тренера — до картки учня, для учня — головне меню */
function buildBackButton(backContext, CONSTANTS) {
  if (!CONSTANTS || !CONSTANTS.CALLBACKS) return [];
  if (backContext && backContext.fromCoach && backContext.studentChatId) {
    const viewStudent = (CONSTANTS.CALLBACK_PREFIXES && CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT) || 'VIEW_STUDENT';
    return [[{ text: '🔙 До картки учня', callback_data: viewStudent + ':' + String(backContext.studentChatId) }]];
  }
  return [[{ text: '🏠 Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
}

module.exports = {
  generateAndSend,
  generateAndSave,
  getStoredAnalysis,
  sendStoredAnalysis,
  sendOrGenerateAnalysis,
  regenerateAndSendAnalysis,
  sendFullAnalysis
};

