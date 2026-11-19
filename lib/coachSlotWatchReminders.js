/**
 * Етап 5: нагадування тренеру +N хв після старту BOOKED-слота (що не COMPLETED).
 * Cron GET /cron/coach-slot-watch (кожні 5 хв, REMINDER_CRON_SECRET).
 */
const { CONSTANTS } = require('./constants');
const supabase = require('./supabase');
const User = require('./user');
const Helpers = require('./helpers');
const Schedule = require('./schedule');

const KIND = 'coach_slot_open_5m';

async function studentDisplayName(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return 'Клієнт';
  const u = (await supabase.findUserByAnyId(id)) || (await User.getByChatId(id));
  if (!u) return id.startsWith('INVITE_') ? 'Запрошення' : id;
  const last = String(u.lastName || u.last_name || '').trim();
  const first = String(u.firstName || u.first_name || '').trim();
  if (last && first) return last + ' ' + first;
  return (last || first || id).trim();
}

async function sendCoachSlotWatchReminders() {
  const now = new Date();
  const slots = await supabase.getBookedSlotsPastStart({ now });
  if (!slots.length) return { sent: 0, checked: 0 };

  let sent = 0;
  for (const slot of slots) {
    const coachId = String(slot.coachId || '').trim();
    if (!coachId) continue;
    const slotId = String(slot.id || '').trim();
    if (!slotId) continue;

    const already = await supabase.wasReminderSent(slotId, KIND, '');
    if (already) continue;

    const coach = await User.getByChatId(coachId);
    if (!coach || coach.role !== CONSTANTS.ROLES.COACH) continue;

    const when = Schedule.formatSlotDateTime(slot);
    const student = await studentDisplayName(slot.studentId);
    const minutes =
      parseInt(process.env.COACH_SLOT_WATCH_MINUTES || '5', 10) || 5;

    const text =
      '⏰ Час тренування минув ' +
      minutes +
      ' хв\n\n' +
      '📅 ' +
      when +
      '\n' +
      '👤 ' +
      student +
      '\n\n' +
      'Тренування ще не відмічене як проведене.';

    const keyboard = [
      [{ text: '✔️ Відмітити', callback_data: CONSTANTS.CALLBACKS.SCH_COMPLETE + ':' + slotId }],
      [{ text: '📅 Відкрити розклад', callback_data: CONSTANTS.CALLBACKS.MENU_SCHEDULE }]
    ];

    try {
      await Helpers.sendKeyboard(coachId, text, keyboard);
      await supabase.insertReminderSent(slotId, KIND, '');
      sent += 1;
    } catch (e) {
      console.error('coachSlotWatchReminders.send', slotId, e && e.message);
    }
  }

  return { sent, checked: slots.length };
}

module.exports = { sendCoachSlotWatchReminders, KIND };