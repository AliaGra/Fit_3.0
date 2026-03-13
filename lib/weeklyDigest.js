const supabase = require('./supabase');
const historyAnalysis = require('./ai/historyAnalysis');
const Helpers = require('./helpers');

async function sendWeeklyDigests() {
  const coaches = await supabase.getAllCoaches();
  if (!coaches || !coaches.length) return { sent: 0 };

  let sent = 0;
  for (const coach of coaches) {
    try {
      const students = await supabase.getStudentsByCoachId(coach.chat_id);
      if (!students || !students.length) continue;

      const studentDigests = [];
      for (const student of students) {
        const weekRows = await getWeekRows(student.chatId || student.chat_id);
        const plannedDays = student.trainingDaysPerWeek || student.training_days_per_week || 3;
        studentDigests.push({
          student: {
            first_name: student.firstName || student.first_name || '',
            last_name: student.lastName || student.last_name || '',
            goal: student.goal || '',
            level: student.level || ''
          },
          weekRows,
          plannedDays
        });
      }

      const anyActivity = studentDigests.some((d) => d.weekRows.length > 0);
      if (!anyActivity) continue;

      const digests = await historyAnalysis.buildWeeklyDigest(
        { firstName: coach.first_name || coach.firstName || '' },
        studentDigests
      );
      if (!digests || !digests.length) continue;

      const message = formatDigestMessage(digests);
      await Helpers.safeSend(coach.chat_id, message);
      sent += 1;
    } catch (e) {
      console.error('weeklyDigest.sendWeeklyDigests coach=' + coach.chat_id, e.message);
    }
  }

  return { sent };
}

async function getWeekRows(chatId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .getClient()
    .from('bot_training_data')
    .select('date, exercise_id, exercise_name, weight, reps, set')
    .eq('chat_id', String(chatId))
    .gte('date', `${dateStr}T00:00:00`)
    .order('date', { ascending: true });

  if (error) {
    console.error('weeklyDigest.getWeekRows', error.message);
    return [];
  }
  return data || [];
}

function formatDigestMessage(digests) {
  const weekStr = getCurrentWeekStr();
  let msg = `📊 Тижневий дайджест — ${weekStr}\n`;
  msg += '────────────────────────────\n\n';
  for (const { student, summary } of digests) {
    msg += `👤 ${student.first_name} ${student.last_name || ''}\n`;
    msg += `${summary || 'Дані відсутні.'}\n\n`;
    msg += '────────────────────────────\n\n';
  }
  return msg.trim();
}

function getCurrentWeekStr() {
  const months = [
    'січня','лютого','березня','квітня','травня','червня',
    'липня','серпня','вересня','жовтня','листопада','грудня'
  ];
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

module.exports = { sendWeeklyDigests };

