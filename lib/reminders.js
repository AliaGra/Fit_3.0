/**
 * Reminders — нагадування учням: за 24 год (шаблон) і за 2 год (AI або шаблон).
 * Cron GET /cron/reminders щогодини. Дедуп: reminders_sent (slot_id + kind + slot_key).
 */
const supabase = require('./supabase');
const User = require('./user');
const telegram = require('./telegram');
const smartReminderAI = require('./ai/smartReminder');

const REMINDER_HOURS_BEFORE = parseInt(process.env.REMINDER_HOURS_BEFORE || '2', 10) || 2;
const REMINDER_HOURS_24 = parseInt(process.env.REMINDER_HOURS_24 || '24', 10) || 24;

const KIND_2H = '2h';
const KIND_24H = '24h';

function formatSlotTime(dateObj, timeStr) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const [h = 0, m = 0] = (String(timeStr || '00:00').match(/\d+/g) || []).map(Number);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month} о ${h}:${String(m).padStart(2, '0')}`;
}

function slotKey(slot) {
  const d = slot && slot.date instanceof Date ? slot.date : new Date(slot && slot.date);
  const ymd = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String((slot && slot.date) || '').slice(0, 10);
  const m = String((slot && slot.time) || '').match(/(\d{1,2}):(\d{2})/);
  const hm = m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '';
  return ymd + '|' + hm;
}

function coachDisplayName(coach) {
  if (!coach) return 'Тренер';
  const name = ((coach.firstName || '').trim() + (coach.lastName ? ' ' + coach.lastName : '')).trim();
  return name || 'Тренер';
}

async function sendWindow(kind, hoursBefore) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  const slots = await supabase.getBookedSlotsInWindow(windowStart, windowEnd);
  if (!slots || !slots.length) return 0;

  let sent = 0;
  for (const slot of slots) {
    if (!slot.studentId) continue;
    const studentId = String(slot.studentId);
    if (studentId.toUpperCase().startsWith('INVITE_')) continue;

    const key = slotKey(slot);
    const already = await supabase.wasReminderSent(slot.id, kind, key);
    if (already) continue;

    const coach = await User.getByChatId(slot.coachId);
    const coachName = coachDisplayName(coach);
    const slotStr = formatSlotTime(slot.date, slot.time);

    let text;
    let usedAI = false;
    if (kind === KIND_24H) {
      text =
        '⏰ Нагадування\n\nЗавтра тренування.\n\n📅 ' + slotStr + '\n👨‍🏫 ' + coachName;
    } else {
      const student = await User.getByChatId(studentId);
      const studentName = student
        ? ((student.firstName || '').trim() + (student.lastName ? ' ' + student.lastName : '')).trim() || 'Учень'
        : 'Учень';
      const aiText = await smartReminderAI.generateSmartReminder(
        slot,
        studentName,
        await supabase.getStudentRecentWorkoutsSummary(studentId, 30)
      );
      if (aiText) {
        text = '⏰ Нагадування\n\n' + aiText;
        usedAI = true;
      } else {
        text = `⏰ **Нагадування**\n\nУ тебе сьогодні тренування!\n\n📅 ${slotStr}\n👨‍🏫 ${coachName}`;
      }
    }

    try {
      await telegram.sendMessage(studentId, text, usedAI || kind === KIND_24H ? {} : { parse_mode: 'Markdown' });
      if (usedAI) {
        await supabase.insertAIGeneratedContent({
          contentType: 'reminder',
          entityId: String(slot.id),
          aiResponse: { text }
        });
      }
      await supabase.insertReminderSent(slot.id, kind, key);
      sent += 1;
    } catch (e) {
      console.error('Reminders.sendReminders', kind, slot.id, e && e.message);
    }
  }
  return sent;
}

async function sendReminders() {
  const sent24 = await sendWindow(KIND_24H, REMINDER_HOURS_24);
  const sent2 = await sendWindow(KIND_2H, REMINDER_HOURS_BEFORE);
  return { sent: sent24 + sent2, sent24, sent2 };
}

module.exports = { sendReminders, KIND_2H, KIND_24H };
