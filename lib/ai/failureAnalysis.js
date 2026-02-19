/**
 * Аналіз невиконання вправ після тренування за планом (Частина 5, AI_Integration_FIT3_Implementation_Plan.md).
 */
const aiClient = require('./aiClient');
const aiPrompts = require('./aiPrompts');
const aiValidator = require('./aiValidator');
const supabase = require('../supabase');

const FAILURE_THRESHOLD = 0.8;

/**
 * Зібрати історію тренувань за останні 14 днів (по датах, кількість підходів).
 * @param {string} chatId
 * @returns {Promise<Array<{ date: string, sets_recorded: number }>>}
 */
async function getRecentWorkoutHistory(chatId) {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const rows = await supabase.getTrainingDataByChatAndDate(chatId, startDay, endDay);
  const byDate = {};
  for (const r of rows) {
    const dateKey = (r.date && r.date.slice) ? r.date.slice(0, 10) : '';
    if (!dateKey) continue;
    if (!byDate[dateKey]) byDate[dateKey] = 0;
    byDate[dateKey]++;
  }
  return Object.keys(byDate)
    .sort()
    .reverse()
    .slice(0, 14)
    .map((date) => ({ date, sets_recorded: byDate[date] }));
}

/**
 * Проаналізувати невиконання вправ та отримати поради (для учня та тренера).
 * @param {string} chatId — chat_id учня
 * @param {Array<{ name: string, completedSets: number, plannedSets: number, planned_weight?: number, failure_reason?: string }>} failedExercises
 * @param {Object} workoutData — duration_minutes, feeling_score (опційно)
 * @returns {Promise<{ student_message: string, coach_message?: string, notify_coach: boolean, suggested_changes?: string[] } | null>}
 */
async function analyzeWorkoutFailures(chatId, failedExercises, workoutData = {}) {
  if (!aiClient.isEnabled() || !failedExercises || !failedExercises.length) return null;

  const recentHistory = await getRecentWorkoutHistory(chatId);
  const userMessage = aiPrompts.buildFailureAnalysisPrompt(failedExercises, recentHistory, workoutData);
  const messages = [
    { role: 'system', content: aiPrompts.SYSTEM_PROMPTS.FAILURE_ANALYSIS },
    { role: 'user', content: userMessage }
  ];

  const result = await aiClient.chatCompletion(messages, {
    responseFormat: { type: 'json_object' },
    temperature: 0.5,
    maxTokens: 400
  });

  if (!result || !result.content) return null;

  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch (e) {
    console.error('failureAnalysis.analyzeWorkoutFailures parse', e.message);
    return null;
  }

  const trimmed = aiValidator.trimFailureAnalysis(parsed);
  if (!aiValidator.validateFailureAnalysis(trimmed)) return null;

  const entityId = chatId + '_' + (Date.now ? Date.now() : new Date().toISOString());
  await supabase.insertAIGeneratedContent({
    contentType: 'failure_analysis',
    entityId,
    aiResponse: trimmed,
    tokensUsed: result.usage && result.usage.total_tokens != null ? result.usage.total_tokens : null,
    costUsd: result.usage && result.usage.prompt_tokens != null && result.usage.completion_tokens != null
      ? aiClient.estimateCostUsd(result.usage.prompt_tokens, result.usage.completion_tokens)
      : null
  });

  return trimmed;
}

module.exports = {
  analyzeWorkoutFailures,
  getRecentWorkoutHistory,
  FAILURE_THRESHOLD
};
