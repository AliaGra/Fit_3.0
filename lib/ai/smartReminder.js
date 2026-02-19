/**
 * Розумні нагадування — AI-персоналізація тексту нагадування (Частина 4, AI_Integration_FIT3_Implementation_Plan.md).
 */
const aiClient = require('./aiClient');
const aiPrompts = require('./aiPrompts');
const aiValidator = require('./aiValidator');

/**
 * Згенерувати персональний текст нагадування про тренування.
 * @param {Object} slot — id, studentId, coachId, date (Date), time (string)
 * @param {string} studentName
 * @param {Array<{ date?: string, exercise_count?: number, total_weight?: number, best_exercise?: string }>} recentWorkouts
 * @returns {Promise<string | null>}
 */
async function generateSmartReminder(slot, studentName, recentWorkouts) {
  if (!aiClient.isEnabled() || !slot) return null;

  const userMessage = aiPrompts.buildReminderPrompt(slot, studentName, recentWorkouts);
  const messages = [
    { role: 'system', content: aiPrompts.SYSTEM_PROMPTS.SMART_REMINDER },
    { role: 'user', content: userMessage }
  ];

  const result = await aiClient.chatCompletion(messages, {
    responseFormat: null,
    temperature: 0.6,
    maxTokens: 200
  });

  if (!result || !result.content) return null;

  const text = result.content.trim();
  if (!aiValidator.validateReminder(text)) return null;

  return text;
}

module.exports = {
  generateSmartReminder
};
