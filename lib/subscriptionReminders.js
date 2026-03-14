/**
 * Нагадування про закінчення абонемента: за 3 дні та за 2 дні до end_date.
 * Повідомлення надсилаються користувачу в бот (як при записі на тренування).
 * Якщо абонемент з фіксованою кількістю тренувань і вони вже вичерпані — нагадування за датою не надсилаємо.
 */
const supabase = require('./supabase');
const Helpers = require('./helpers');

function getDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

async function sendSubscriptionReminders() {
  const today = new Date();
  const in3 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const in2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const date3 = getDateKey(in3);
  const date2 = getDateKey(in2);
  let sent = 0;

  for (const days of [3, 2]) {
    const endDateStr = days === 3 ? date3 : date2;
    const list = await supabase.getGymSubscriptionsForReminder(endDateStr, days);
    for (const sub of list || []) {
      if (!sub.chatId) continue;
      if (!sub.isUnlimited) {
        const used = await supabase.getWorkoutDaysCountInRange(sub.chatId, sub.startDate, sub.endDate);
        if (used >= (sub.trainingsCount || 0)) continue;
      }
      const dateStr = endDateStr.split('-').reverse().join('.');
      const msg = '🎫 **Нагадування про абонемент**\n\nТермін дії абонемента закінчується через ' + days + ' дні — ' + dateStr + '.\n\nЯкщо потрібно продовжити — оплати новий і додай його в меню «Абонемент».';
      try {
        await Helpers.safeSend(sub.chatId, msg, { parse_mode: 'Markdown' });
        await supabase.markGymSubscriptionReminderSent(sub.id, days);
        sent++;
      } catch (e) {
        console.error('SubscriptionReminders', sub.id, e.message);
      }
    }
  }
  return { sent };
}

module.exports = { sendSubscriptionReminders };
