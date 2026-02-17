/**
 * PlanRevisionReminders — нагадування тренеру про ревізію плану (Логіка складання плану, п. 9.1)
 * Після 4–8 тижнів (valid_until) тренер отримує: "Час оновити план для [Ім'я]"
 */
const supabase = require('./supabase');
const User = require('./user');
const telegram = require('./telegram');

async function sendPlanRevisionReminders() {
  const plans = await supabase.getPlansDueForRevision();
  if (!plans || !plans.length) return { sent: 0 };

  let sent = 0;
  for (const plan of plans) {
    if (!plan.coachId) continue;

    let studentName = plan.studentId || 'Учень';
    try {
      const student = await User.getByChatId(plan.studentId);
      if (student) {
        const first = (student.firstName || '').trim();
        const last = (student.lastName || '').trim();
        studentName = [first, last].filter(Boolean).join(' ').trim() || studentName;
      }
    } catch (_) {}

    const text =
      '📋 **Ревізія плану**\n\nЧас оновити план для **' +
      studentName +
      '**.\n\nПлан «' +
      (plan.planName || 'План') +
      '» активний вже понад 6 тижнів. Зайди в Мої учні → ' +
      studentName +
      ' → Програма тренувань.';

    try {
      await telegram.sendMessage(plan.coachId, text, { parse_mode: 'Markdown' });
      await supabase.markPlanRevisionReminderSent(plan.planId);
      sent++;
    } catch (e) {
      console.error('PlanRevisionReminders', plan.planId, e.message);
    }
  }
  return { sent };
}

module.exports = { sendPlanRevisionReminders };
