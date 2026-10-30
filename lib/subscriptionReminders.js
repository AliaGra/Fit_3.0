/**
 * Нагадування про абонемент (спільні для тренера і користувача):
 * - за 3 і 2 дні до end_date;
 * - для типу «на N»: залишилось 2 або 1 день тренувань у залі;
 * - злиття подій одного абонемента в одне повідомлення;
 * - mark лише після успішного safeSend.
 */
const supabase = require('./supabase');
const Helpers = require('./helpers');
const { isNotYetStarted, todayYmd } = require('./subscriptionNavigator');

function formatDateUA(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).slice(0, 10).split('-');
  if (parts.length !== 3) return ymd;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

async function venueName(venueId) {
  if (!venueId) return '';
  try {
    const v = await supabase.getVenueById(venueId);
    const name = v && (v.nameUa || v.name || v.title);
    return name && String(name).trim() ? String(name).trim() : '';
  } catch (e) {
    return '';
  }
}

function eventKey(subId) {
  return String(subId);
}

/**
 * Зібрати події поточного циклу, згрупувати по sub.id, надіслати, mark по факту успіху.
 */
async function sendSubscriptionReminders() {
  const today = todayYmd();
  const in3 = new Date();
  in3.setHours(12, 0, 0, 0);
  in3.setDate(in3.getDate() + 3);
  const in2 = new Date();
  in2.setHours(12, 0, 0, 0);
  in2.setDate(in2.getDate() + 2);
  const date3 = in3.toISOString().slice(0, 10);
  const date2 = in2.toISOString().slice(0, 10);

  /** @type {Map<string, { sub: object, dateDays: number|null, nLeft: number|null }>} */
  const bySub = new Map();

  function ensureBucket(sub) {
    const key = eventKey(sub.id);
    if (!bySub.has(key)) {
      bySub.set(key, { sub, dateDays: null, nLeft: null });
    }
    return bySub.get(key);
  }

  for (const days of [3, 2]) {
    const endDateStr = days === 3 ? date3 : date2;
    const list = await supabase.getGymSubscriptionsForReminder(endDateStr, days);
    for (const sub of list || []) {
      if (!sub.chatId || !sub.venueId) continue;
      if (isNotYetStarted(sub, today)) continue;
      if (!(await supabase.isGymSubscriptionActive(sub))) continue;
      const bucket = ensureBucket(sub);
      // Якщо вже є date-подія (спочатку обробляємо 3, потім 2) — лишаємо більш «термінову» (менше днів)
      if (bucket.dateDays == null || days < bucket.dateDays) {
        bucket.dateDays = days;
        bucket.sub = sub;
      }
    }
  }

  const nList = await supabase.getGymSubscriptionsForNRemainingReminder();
  for (const sub of nList || []) {
    if (!sub.chatId || !sub.venueId || sub.isUnlimited) continue;
    if (isNotYetStarted(sub, today)) continue;
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
    const bucket = ensureBucket(sub);
    // Більш терміновий залишок (1) перекриває 2, якщо обидва якось потрапили
    if (bucket.nLeft == null || left < bucket.nLeft) {
      bucket.nLeft = left;
      bucket.sub = sub;
    }
  }

  let sent = 0;
  for (const bucket of bySub.values()) {
    const { sub, dateDays, nLeft } = bucket;
    if (dateDays == null && nLeft == null) continue;
    if (!sub.venueId) continue;

    const place = await venueName(sub.venueId);
    if (!place) {
      console.error('SubscriptionReminders: no venue name', sub.id, sub.venueId);
      continue;
    }
    const endFmt = formatDateUA(sub.endDate);
    let msg = '';

    if (dateDays != null && nLeft != null) {
      msg =
        '⚠️ **Твій абонемент скоро завершиться!**\n' +
        '🏢 ' +
        place +
        '\n\n' +
        '📅 Термін дії завершується через ' +
        dateDays +
        ' дні — ' +
        endFmt +
        '.\n' +
        '🎟 Також залишилося лише ' +
        nLeft +
        ' ' +
        (nLeft === 1 ? 'день' : 'дні') +
        ' тренувань у цьому залі.\n\n' +
        'Плануй наступні тренування та подбай про своєчасне продовження абонемента.';
    } else if (dateDays === 3) {
      msg =
        '⏳ **Твій абонемент скоро завершиться!**\n' +
        '🏢 ' +
        place +
        '\n\n' +
        'До завершення дії твого абонемента залишилося 3 дні.\n' +
        '📅 Дата завершення: ' +
        endFmt +
        '\n\n' +
        'Перевір термін дії та подбай про своєчасне продовження абонемента.';
    } else if (dateDays === 2) {
      msg =
        '⚠️ **Абонемент завершується через 2 дні!**\n' +
        '🏢 ' +
        place +
        '\n\n' +
        'Термін дії твого абонемента завершується ' +
        endFmt +
        '.\n' +
        'Залишилося 2 дні.\n\n' +
        'Не забудь подбати про продовження, якщо плануєш і надалі тренуватися в цьому залі.';
    } else if (nLeft === 2) {
      msg =
        '🎟 **У тебе залишилося 2 дні тренувань у залі!**\n' +
        '🏢 ' +
        place +
        '\n\n' +
        'За твоїм абонементом залишилося лише 2 дні тренувань у цьому залі.\n' +
        '📅 Термін дії абонемента до: ' +
        endFmt +
        '\n\n' +
        'Плануй наступні тренування та не забудь вчасно подбати про продовження абонемента.';
    } else if (nLeft === 1) {
      msg =
        '⚠️ **Залишився останній день тренувань у залі!**\n' +
        '🏢 ' +
        place +
        '\n\n' +
        'За твоїм абонементом залишився лише 1 день тренувань у цьому залі.\n' +
        '📅 Термін дії абонемента до: ' +
        endFmt +
        '\n\n' +
        'Якщо плануєш продовжувати тренування в цьому залі, подбай про наступний абонемент.';
    } else {
      continue;
    }

    try {
      const result = await Helpers.safeSend(sub.chatId, msg, { parse_mode: 'Markdown' });
      if (!result) {
        console.error('SubscriptionReminders: send failed', sub.id, sub.chatId);
        continue;
      }
      if (dateDays != null) {
        await supabase.markGymSubscriptionReminderSent(sub.id, dateDays);
      }
      if (nLeft != null) {
        await supabase.markGymSubscriptionNReminderSent(sub.id, nLeft);
      }
      sent++;
    } catch (e) {
      console.error('SubscriptionReminders send', sub.id, e.message);
    }
  }

  return { sent };
}

module.exports = { sendSubscriptionReminders };
