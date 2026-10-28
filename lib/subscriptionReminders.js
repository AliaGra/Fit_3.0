/**
 * Нагадування про абонемент:
 * - за 3 і 2 дні до end_date (кожен активний окремо);
 * - для типу «на N»: залишилось 2 або 1 тренування (по залу).
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

async function venueSuffix(venueId) {
  if (!venueId) return '';
  try {
    const v = await supabase.getVenueById(venueId);
    if (!v) return '';
    const name = (v.nameUa || v.name || v.title || '').toString().trim();
    return name ? ' (' + name + ')' : '';
  } catch (e) {
    return '';
  }
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
      if (!(await supabase.isGymSubscriptionActive(sub))) continue;
      const dateStr = endDateStr.split('-').reverse().join('.');
      const place = await venueSuffix(sub.venueId);
      const msg =
        '🎫 **Нагадування про абонемент**' +
        place +
        '\n\nТермін дії абонемента закінчується через ' +
        days +
        ' дні — ' +
        dateStr +
        '.\n\nЯкщо потрібно продовжити — оплати новий і додай його в меню «Абонемент».';
      try {
        await Helpers.safeSend(sub.chatId, msg, { parse_mode: 'Markdown' });
        await supabase.markGymSubscriptionReminderSent(sub.id, days);
        sent++;
      } catch (e) {
        console.error('SubscriptionReminders date', sub.id, e.message);
      }
    }
  }

  const nList = await supabase.getGymSubscriptionsForNRemainingReminder();
  for (const sub of nList || []) {
    if (!sub.chatId || !sub.venueId || sub.isUnlimited) continue;
    if (!(await supabase.isGymSubscriptionActive(sub))) continue;
    const used = await supabase.getWorkoutDaysCountInRange(
      sub.chatId,
      sub.startDate,
      sub.endDate,
      sub.venueId
    );
    const left = (sub.trainingsCount || 0) - used;
    if (left !== 2 && left !== 1) continue;
    if (left === 2 && sub.reminderSentN2) continue;
    if (left === 1 && sub.reminderSentN1) continue;
    const place = await venueSuffix(sub.venueId);
    const msg =
      '🎫 **Абонемент**' +
      place +
      '\n\nЗалишилось тренувань: **' +
      left +
      '** з ' +
      (sub.trainingsCount || 0) +
      '.\n\nПісля вичерпання додай новий абонемент у меню «Абонемент».';
    try {
      await Helpers.safeSend(sub.chatId, msg, { parse_mode: 'Markdown' });
      await supabase.markGymSubscriptionNReminderSent(sub.id, left);
      sent++;
    } catch (e) {
      console.error('SubscriptionReminders N', sub.id, e.message);
    }
  }

  return { sent };
}

module.exports = { sendSubscriptionReminders };
