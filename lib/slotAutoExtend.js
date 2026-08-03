/**
 * Автопродовження слотів тренерів (cron).
 * Якщо до останнього слота залишилось менше SLOTS_AUTO_EXTEND_WHEN_DAYS_LEFT днів —
 * додає ще SLOTS_AUTO_EXTEND_DAYS календарних днів уперед.
 */
const CONSTANTS = require('./constants');
const supabase = require('./supabase');
const Helpers = require('./helpers');
const Schedule = require('./schedule');

async function daysUntilLastSlot(coachChatId) {
  const last = await supabase.getMaxSlotDateByCoach(coachChatId);
  if (!last) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(last);
  lastDay.setHours(0, 0, 0, 0);
  return Math.floor((lastDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * @returns {{ ok: boolean, coachesChecked: number, extended: number, createdSlots: number, notified: number }}
 */
async function runSlotAutoExtend() {
  const whenLeft = CONSTANTS.SCHEDULE_SETTINGS.SLOTS_AUTO_EXTEND_WHEN_DAYS_LEFT || 14;
  const extendDays = CONSTANTS.SCHEDULE_SETTINGS.SLOTS_AUTO_EXTEND_DAYS || 7;
  const coaches = await supabase.getAllCoaches();
  let extended = 0;
  let createdSlots = 0;
  let notified = 0;
  let coachesChecked = 0;

  for (const row of coaches || []) {
    const chatId = row && row.chat_id != null ? String(row.chat_id) : '';
    if (!chatId) continue;
    const settings = await supabase.getCoachScheduleSettings(chatId);
    if (!settings) continue;
    coachesChecked++;

    const daysLeft = await daysUntilLastSlot(chatId);
    if (daysLeft == null) continue;
    if (daysLeft >= whenLeft) continue;

    const result = await Schedule.generateSlotsForCoach(chatId, extendDays);
    if (!result || !result.ok) continue;
    extended++;
    createdSlots += result.created || 0;
    if (result.created > 0) {
      try {
        await Helpers.safeSend(
          chatId,
          '📆 Автоматично додано ' +
            result.created +
            ' слотів ще на ' +
            extendDays +
            ' днів уперед (щоб розклад не обривався).'
        );
        notified++;
      } catch (err) {
        console.error('slotAutoExtend notify', chatId, err && err.message);
      }
    }
  }

  return { ok: true, coachesChecked, extended, createdSlots, notified };
}

module.exports = {
  runSlotAutoExtend,
  daysUntilLastSlot
};
