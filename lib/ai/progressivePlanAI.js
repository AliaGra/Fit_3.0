/**
 * Прогресивний план — вибір вправ по фазах через AI (ТЗ_Прогресивний_план_FIT3.md).
 * callProgressivePlanAI(phase, candidatesByDay, studentProfile) → aiPhaseResult | null
 * generatePlanSummary(studentProfile, allPhaseResults) → ai_plan_summary | null
 */
const aiClient = require('./aiClient');
const aiValidator = require('./aiValidator');

const SYSTEM_PROMPT = `Ти — досвідчений персональний тренер. Обираєш оптимальні вправи для тренувального плану.

ПРАВИЛА:
1. Для кожного слоту обери ОДНУ вправу з кандидатів (chosen_exercise_id має бути з наданого списку)
2. Визнач оптимальний порядок вправ у кожному дні: великі м'язові групи → малі, базові → ізоляція
3. Для фази B і далі — враховуй що ізоляційні вправи мають відрізнятись від попередньої фази
4. Коротко поясни вибір кожної вправи (1 речення, до 120 символів, українська мова)
5. Відповідай ТІЛЬКИ валідним JSON без пояснень поза JSON`;

const SYSTEM_PROMPT_STUDENT = `
Учень тренується самостійно без тренера. Пояснення вибору вправ (ai_reason) мають бути
зрозумілі людині без спортивної освіти — просто, конкретно, без термінів.
Приклад: "Найбезпечніша вправа для спини, не навантажує поперек"
замість: "Ізоляційна вправа для широчайніх з мінімальним залученням розгиначів хребта"`;

/**
 * Побудова user-промпту для фази прогресивного плану.
 * @param {string} phase — 'A' | 'B' | 'C'
 * @param {Array<{ day_number: number, day_label: string, slots: Array<{ candidates: Array<{ id: number, name_ua: string, vid?: string, difficulty?: string, group_level2: string, medical_status?: string, focus_point?: string }> }> }>} candidatesByDay
 * @param {{ goal?: string, level?: string, gender?: string, age?: number, medicalSummary?: string, accentZones?: string[], avoidZones?: string[], role?: string, coach_id?: string }} studentProfile
 */
function buildProgressivePlanPrompt(phase, candidatesByDay, studentProfile) {
  const goal = studentProfile.goal || 'не вказано';
  const level = studentProfile.level || 'не вказано';
  const gender = studentProfile.gender || 'не вказано';
  const age = studentProfile.age != null ? studentProfile.age : 'не вказано';
  const medSummary = studentProfile.medicalSummary || studentProfile.medicalConditions || 'немає';
  const accentZones = Array.isArray(studentProfile.accentZones) && studentProfile.accentZones.length
    ? studentProfile.accentZones.join(', ')
    : 'немає';
  const avoidZones = Array.isArray(studentProfile.avoidZones) && studentProfile.avoidZones.length
    ? studentProfile.avoidZones.join(', ')
    : 'немає';

  const lines = [
    'ПРОФІЛЬ УЧНЯ:',
    'Ціль: ' + goal + ' | Рівень: ' + level + ' | Стать: ' + gender + ' | Вік: ' + age,
    'Медичні обмеження: ' + medSummary,
    'Акцент-зони: ' + accentZones,
    'Зони уникнення: ' + avoidZones,
    '',
    'ФАЗА: ' + phase
  ];
  if (phase !== 'A') {
    lines.push('Ізоляційні вправи мають відрізнятись від фази A');
    lines.push('');
  }
  lines.push('КАНДИДАТИ:');
  const candidatesJson = JSON.stringify(candidatesByDay, null, 0);
  lines.push(candidatesJson);
  return lines.join('\n');
}

/**
 * Виклик AI для вибору вправ однієї фази.
 * @param {string} phase — 'A' | 'B' | 'C'
 * @param {Array} candidatesByDay — масив по днях зі слотами та кандидатами
 * @param {Object} studentProfile — профіль учня (goal, level, gender, age, medicalSummary, accentZones, avoidZones, role, coach_id)
 * @returns {Promise<{ days: Array<{ day_number: number, day_label: string, exercises: Array<{ slot_index: number, chosen_exercise_id: number, order_in_day: number, ai_reason: string }> }>, phase_summary: string } | null>}
 */
async function callProgressivePlanAI(phase, candidatesByDay, studentProfile) {
  if (!aiClient.isEnabled()) return null;
  if (!candidatesByDay || !candidatesByDay.length) return null;

  let systemContent = SYSTEM_PROMPT;
  const isStudentWithoutCoach = studentProfile.role === 'student' && !studentProfile.coach_id;
  if (isStudentWithoutCoach) {
    systemContent += SYSTEM_PROMPT_STUDENT;
  }

  const userContent = buildProgressivePlanPrompt(phase, candidatesByDay, studentProfile);
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ];

  const result = await aiClient.chatCompletion(messages, {
    responseFormat: { type: 'json_object' },
    maxTokens: 1200,
    temperature: 0.5
  });

  if (!result || !result.content) return null;

  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch (e) {
    console.error('progressivePlanAI.callProgressivePlanAI parse', e.message);
    return null;
  }

  const valid = aiValidator.validateProgressivePlanResponse(parsed, candidatesByDay);
  if (!valid) {
    if (process.env.DEBUG === '1') console.log('[progressivePlanAI] validateProgressivePlanResponse failed');
    return null;
  }

  return parsed;
}

/**
 * Генерація загального AI-пояснення плану (після всіх фаз).
 * @param {Object} studentProfile
 * @param {Object} allPhaseResults — { A: aiPhaseResult, B: aiPhaseResult, ... }
 * @returns {Promise<string | null>}
 */
async function generatePlanSummary(studentProfile, allPhaseResults) {
  if (!aiClient.isEnabled()) return null;
  if (!allPhaseResults || typeof allPhaseResults !== 'object') return null;

  const phaseSummaries = [];
  for (const [phase, data] of Object.entries(allPhaseResults)) {
    if (data && data.phase_summary) phaseSummaries.push('Фаза ' + phase + ': ' + data.phase_summary);
  }
  if (!phaseSummaries.length) return null;

  const userContent = [
    'ПРОФІЛЬ: ціль ' + (studentProfile.goal || '') + ', рівень ' + (studentProfile.level || ''),
    'ПІДСУМКИ ФАЗ:',
    ...phaseSummaries,
    '',
    'Напиши коротке загальне пояснення логіки всього плану (2-4 речення, до 300 символів, українська мова). Тільки текст, без JSON.'
  ].join('\n');

  const messages = [
    { role: 'system', content: 'Ти — фітнес-тренер. Дай короткий підсумок логіки плану тренувань для учня. Українська мова.' },
    { role: 'user', content: userContent }
  ];

  const result = await aiClient.chatCompletion(messages, { maxTokens: 200 });
  if (!result || !result.content) return null;
  const text = result.content.trim().slice(0, 300);
  return text || null;
}

module.exports = {
  callProgressivePlanAI,
  generatePlanSummary,
  buildProgressivePlanPrompt
};
