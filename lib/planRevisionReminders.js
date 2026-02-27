/**
 * PlanRevisionReminders — ревізія плану (Логіка 9.4.3, ТЗ 9.5).
 * generation_type = 'auto': generatePlanRevision + сповіщення учню.
 * generation_type = 'manual': сповіщення тренеру «Час оновити план для [Ім'я]».
 */
const supabase = require('./supabase');
const User = require('./user');
const telegram = require('./telegram');
const planGenerator = require('./planGenerator');

async function sendPlanRevisionReminders() {
  const plans = await supabase.getPlansDueForRevision();
  if (!plans || !plans.length) return { sent: 0 };

  let sent = 0;
  for (const plan of plans) {
    const isAuto = (plan.generationType || 'manual').toLowerCase() === 'auto';

    if (isAuto) {
      try {
        const result = await planGenerator.generatePlanRevision(plan.planId);
        if (result && result.studentId) {
          const n = result.revisionWeeks != null ? result.revisionWeeks : 6;
          const text = 'Твій план оновлено! Ось нові вправи на наступні ' + n + ' тижнів 💪';
          await telegram.sendMessage(result.studentId, text);
          sent++;
        }
      } catch (e) {
        console.error('PlanRevisionReminders auto', plan.planId, e.message, e.stack);
      }
      continue;
    }

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
      '📋 Ревізія плану\n\nЧас оновити план для ' +
      studentName +
      '.\n\nПлан «' +
      (plan.planName || 'План') +
      '» активний вже понад 6 тижнів. Зайди в Мої учні → ' +
      studentName +
      ' → Програма тренувань.';

    try {
      await telegram.sendMessage(plan.coachId, text);
      await supabase.markPlanRevisionReminderSent(plan.planId);
      sent++;
    } catch (e) {
      console.error('PlanRevisionReminders', plan.planId, e.message);
    }
  }
  return { sent };
}

module.exports = { sendPlanRevisionReminders };
