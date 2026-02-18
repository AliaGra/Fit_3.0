/**
 * AI Validator — валідація відповідей AI перед збереженням/відправкою.
 * Частина 1: інфраструктура AI (AI_Integration_FIT3_Implementation_Plan.md).
 */

const MAX_PLAN_COMMENT_LENGTH = 200;
const MAX_REMINDER_LENGTH = 300;
const MAX_STUDENT_MESSAGE_LENGTH = 500;
const MAX_COACH_MESSAGE_LENGTH = 500;
const DANGEROUS_PATTERNS = /<|>|javascript:|http\s*:/i;

/**
 * Валідація AI-відповіді для коментарів до плану (JSON: exercise_id -> текст, day_summary).
 * @param {any} response
 * @returns {boolean}
 */
function validatePlanComments(response) {
  if (!response || typeof response !== 'object') return false;
  for (const [key, value] of Object.entries(response)) {
    if (typeof value !== 'string') return false;
    if (value.length > MAX_PLAN_COMMENT_LENGTH) return false;
    if (DANGEROUS_PATTERNS.test(value)) return false;
  }
  return true;
}

/**
 * Обрізати коментарі плану до максимальної довжини.
 * @param {Record<string, string>} response
 * @returns {Record<string, string>}
 */
function trimPlanComments(response) {
  if (!response || typeof response !== 'object') return response;
  const out = {};
  for (const [key, value] of Object.entries(response)) {
    out[key] = typeof value === 'string'
      ? value.slice(0, MAX_PLAN_COMMENT_LENGTH).trim()
      : '';
  }
  return out;
}

/**
 * Валідація тексту нагадування (вільний текст).
 * @param {any} reminder
 * @returns {boolean}
 */
function validateReminder(reminder) {
  if (reminder == null) return false;
  const s = typeof reminder === 'string' ? reminder.trim() : String(reminder);
  if (s.length === 0 || s.length > MAX_REMINDER_LENGTH) return false;
  if (DANGEROUS_PATTERNS.test(s) || /https?:\/\//i.test(s)) return false;
  return true;
}

/**
 * Валідація AI-відповіді для аналізу невиконання (JSON).
 * @param {any} response
 * @returns {boolean}
 */
function validateFailureAnalysis(response) {
  if (!response || typeof response !== 'object') return false;
  if (typeof response.student_message !== 'string') return false;
  if (response.notify_coach !== undefined && typeof response.notify_coach !== 'boolean') return false;
  if (response.student_message.length > MAX_STUDENT_MESSAGE_LENGTH) return false;
  if (response.coach_message && response.coach_message.length > MAX_COACH_MESSAGE_LENGTH) return false;
  if (DANGEROUS_PATTERNS.test(response.student_message)) return false;
  if (response.coach_message && DANGEROUS_PATTERNS.test(response.coach_message)) return false;
  return true;
}

/**
 * Обрізати повідомлення в об'єкті аналізу невиконання.
 * @param {{ student_message: string, coach_message?: string, notify_coach?: boolean, suggested_changes?: string[] }} response
 * @returns {typeof response}
 */
function trimFailureAnalysis(response) {
  if (!response || typeof response !== 'object') return response;
  return {
    student_message: (response.student_message || '').slice(0, MAX_STUDENT_MESSAGE_LENGTH).trim(),
    coach_message: response.coach_message ? response.coach_message.slice(0, MAX_COACH_MESSAGE_LENGTH).trim() : undefined,
    notify_coach: !!response.notify_coach,
    suggested_changes: Array.isArray(response.suggested_changes) ? response.suggested_changes : undefined
  };
}

module.exports = {
  validatePlanComments,
  trimPlanComments,
  validateReminder,
  validateFailureAnalysis,
  trimFailureAnalysis,
  MAX_PLAN_COMMENT_LENGTH,
  MAX_REMINDER_LENGTH
};
