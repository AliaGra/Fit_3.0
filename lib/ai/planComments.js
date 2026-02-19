/**
 * AI-коментарі тренера до вправ плану (Частина 3 — AI_Integration_FIT3_Implementation_Plan.md).
 * generatePlanComments(profile, exercises, dayType, entityId) → { "exerciseId": "коментар", ... } або null.
 */
const aiClient = require('./aiClient');
const aiPrompts = require('./aiPrompts');
const aiValidator = require('./aiValidator');
const supabase = require('../supabase');

/**
 * Згенерувати персональні коментарі тренера для вправ одного дня плану.
 * @param {Object} profile — firstName, age, goal, level, medicalConditions (рядок) або medicalSummary
 * @param {Array<{ exerciseId: number, exerciseName: string, medicalStatus?: string, sets?: number, reps?: string }>} exercises — вправи дня
 * @param {string} dayType — full_body, upper, lower, push, pull, legs
 * @param {string} entityId — для логу (planId_dayNum)
 * @returns {Promise<Record<string, string> | null>} мапінг "exerciseId" -> "коментар", day_summary; або null
 */
async function generatePlanComments(profile, exercises, dayType, entityId) {
  if (!aiClient.isEnabled() || !profile || !exercises || !exercises.length) return null;

  const userMessage = aiPrompts.buildPlanCommentsPrompt(profile, exercises.map((ex) => ({
    id: ex.exerciseId,
    name_ua: ex.exerciseName,
    name: ex.exerciseName,
    medicalStatus: ex.medicalStatus,
    sets: ex.sets,
    reps: ex.reps
  })), dayType);

  const messages = [
    { role: 'system', content: aiPrompts.SYSTEM_PROMPTS.PLAN_COMMENTS },
    { role: 'user', content: userMessage }
  ];

  const result = await aiClient.chatCompletion(messages, {
    responseFormat: { type: 'json_object' },
    temperature: 0.7
  });

  if (!result || !result.content) return null;

  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch (e) {
    console.error('planComments.generatePlanComments parse', e.message);
    return null;
  }

  const trimmed = aiValidator.trimPlanComments(parsed);
  if (!aiValidator.validatePlanComments(trimmed)) return null;

  const usage = result.usage;
  const tokensUsed = usage && usage.total_tokens != null ? usage.total_tokens : null;
  const costUsd = usage && usage.prompt_tokens != null && usage.completion_tokens != null
    ? aiClient.estimateCostUsd(usage.prompt_tokens, usage.completion_tokens)
    : null;

  if (entityId) {
    await supabase.insertAIGeneratedContent({
      contentType: 'plan_comment',
      entityId,
      aiResponse: trimmed,
      tokensUsed,
      costUsd
    });
  }

  return trimmed;
}

module.exports = {
  generatePlanComments
};
