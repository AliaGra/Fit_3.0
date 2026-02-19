/**
 * Reminders — нагадування учням про тренування за N годин.
 * Частина 4 AI: при AI_ENABLED — персоналізований текст (generateSmartReminder), інакше — фіксований.
 */
const supabase = require('./supabase');
const User = require('./user');
const telegram = require('./telegram');
const smartReminderAI = require('./ai/smartReminder');

const REMINDER_HOURS_BEFORE = parseInt(process.env.REMINDER_HOURS_BEFORE || '2', 10) || 2;

function formatSlotTime(dateObj, timeStr) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const [h = 0, m = 0] = (String(timeStr || '00:00').match(/\d+/g) || []).map(Number);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month} о ${h}:${String(m).padStart(2, '0')}`;
}

async function sendReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);

  const slots = await supabase.getBookedSlotsInWindow(windowStart, windowEnd);
  if (!slots || slots.length === 0) return { sent: 0 };

  let sent = 0;
  for (const slot of slots) {
    if (!slot.studentId) continue;
    const already = await supabase.wasReminderSent(slot.id);
    if (already) continue;

    const student = await User.getByChatId(slot.studentId);
    const coach = await User.getByChatId(slot.coachId);
    const coachName = coach ? (coach.firstName || '').trim() + (coach.lastName ? ' ' + coach.lastName : '').trim() : 'Тренер';
    const slotStr = formatSlotTime(slot.date, slot.time);
    const studentName = student ? (student.firstName || '').trim() + (student.lastName ? ' ' + student.lastName : '').trim() : 'Учень';

    let text;
    let usedAI = false;
    const aiText = await smartReminderAI.generateSmartReminder(
      slot,
      studentName,
      await supabase.getStudentRecentWorkoutsSummary(slot.studentId, 30)
    );
    if (aiText) {
      text = '⏰ Нагадування\n\n' + aiText;
      usedAI = true;
    } else {
      text = `⏰ **Нагадування**\n\nУ тебе сьогодні тренування!\n\n📅 ${slotStr}\n👨‍🏫 ${coachName || 'Тренер'}`;
    }

    try {
      await telegram.sendMessage(slot.studentId, text, usedAI ? {} : { parse_mode: 'Markdown' });
      if (usedAI) {
        await supabase.insertAIGeneratedContent({
          contentType: 'reminder',
          entityId: String(slot.id),
          aiResponse: { text }
        });
      }
      await supabase.insertReminderSent(slot.id);
      sent++;
    } catch (e) {
      console.error('Reminders.sendReminders', slot.id, e.message);
    }
  }
  return { sent };
}

module.exports = { sendReminders };
