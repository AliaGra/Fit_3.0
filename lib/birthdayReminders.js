/**
 * Нагадування про дні народження + вітання від платформи.
 * Cron: GET /cron/birthday-reminders (раз на добу, ранок Київ).
 *
 * - За 3 / 2 / 1 день: тренеру про ДН учня (з coach_id, у т.ч. архів); учню про ДН тренера.
 * - У день ДН: вітання від MAYAG Fit усім із заповненою ДН (не INVITE_, не blocked).
 */
const supabase = require('./supabase');
const Helpers = require('./helpers');
const { CONSTANTS } = require('./constants');

const SEND_DELAY_MS = 50;
const KIND = Object.freeze({
  PAIR_COACH: 'pair_coach',
  PAIR_STUDENT: 'pair_student',
  PLATFORM: 'platform'
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kyivParts(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return { year: y, month: m, day: d };
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Місяць/день ДН для календаря year (29.02 → 28.02 у невисокосний). */
function birthdayMonthDayForYear(birthDate, year) {
  if (!birthDate) return null;
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const p = kyivParts(d);
  let month = p.month;
  let day = p.day;
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    day = 28;
  }
  return { month, day };
}

function addDaysKyiv(baseParts, deltaDays) {
  const utc = Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + deltaDays, 12, 0, 0);
  return kyivParts(new Date(utc));
}

function sameMonthDay(a, b) {
  return a && b && a.month === b.month && a.day === b.day;
}

function displayName(user) {
  if (!user) return 'Користувач';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || 'Користувач';
}

/** Звернення на початку вітання від платформи: «Тренере Імʼя!» або «Імʼя!». */
function platformGreetingLine(user) {
  const name = String((user && user.firstName) || '').trim();
  const isCoach = String((user && user.role) || '').toLowerCase() === CONSTANTS.ROLES.COACH;
  if (isCoach) {
    return name ? 'Тренере ' + name + '!' : 'Тренере!';
  }
  return name ? name + '!' : '';
}

function isSendableUser(u) {
  if (!u || !u.chatId) return false;
  const id = String(u.chatId);
  if (!/^-?\d+$/.test(id)) return false;
  if (id.toUpperCase().startsWith('INVITE_')) return false;
  if (u.isBlocked === true) return false;
  return true;
}

function daysWord(n) {
  if (n === 1) return '1 день';
  if (n >= 2 && n <= 4) return n + ' дні';
  return n + ' днів';
}

async function trySendOnce(recipientId, subjectId, kind, daysBefore, year, text) {
  const inserted = await supabase.insertBirthdayReminderSent({
    recipientChatId: recipientId,
    subjectChatId: subjectId,
    kind,
    daysBefore,
    year
  });
  if (!inserted) return false;
  const ok = await Helpers.safeSend(recipientId, text);
  if (!ok) {
    console.error('birthdayReminders send failed', kind, recipientId, subjectId);
    await supabase.deleteBirthdayReminderSent({
      recipientChatId: recipientId,
      subjectChatId: subjectId,
      kind,
      daysBefore,
      year
    });
  }
  await sleep(SEND_DELAY_MS);
  return !!ok;
}

async function sendBirthdayReminders() {
  const today = kyivParts(new Date());
  const targets = [1, 2, 3].map((days) => ({
    days,
    parts: addDaysKyiv(today, days)
  }));

  const users = await supabase.listUsersWithBirthDateForReminders();
  let sentPairCoach = 0;
  let sentPairStudent = 0;
  let sentPlatform = 0;

  const byChatId = new Map();
  for (const u of users || []) {
    if (!isSendableUser(u)) continue;
    byChatId.set(String(u.chatId), u);
  }

  // --- За 3 / 2 / 1 день: пари тренер ↔ учень ---
  for (const { days, parts } of targets) {
    for (const student of byChatId.values()) {
      if (String(student.role || '').toLowerCase() !== CONSTANTS.ROLES.STUDENT) continue;
      const coachId = student.coachId ? String(student.coachId).trim() : '';
      if (!coachId) continue;

      const studentBd = birthdayMonthDayForYear(student.birthDate, parts.year);
      if (studentBd && sameMonthDay(studentBd, parts)) {
        let coach = byChatId.get(coachId);
        if (!coach) {
          try {
            const User = require('./user');
            coach = await User.getByChatId(coachId);
          } catch (_) {
            coach = null;
          }
        }
        if (coach && isSendableUser(coach) && String(coach.role || '').toLowerCase() === CONSTANTS.ROLES.COACH) {
          const text =
            '🎂 Нагадування\n\nЧерез ' +
            daysWord(days) +
            ' у клієнта ' +
            displayName(student) +
            ' день народження.' +
            (student.isArchived === true ? '\n(профіль в архіві)' : '');
          if (await trySendOnce(String(coach.chatId), String(student.chatId), KIND.PAIR_COACH, days, parts.year, text)) {
            sentPairCoach += 1;
          }
        }
      }
    }

    for (const student of byChatId.values()) {
      if (String(student.role || '').toLowerCase() !== CONSTANTS.ROLES.STUDENT) continue;
      const coachId = student.coachId ? String(student.coachId).trim() : '';
      if (!coachId) continue;
      const coach = byChatId.get(coachId);
      if (!coach || !coach.birthDate) continue;
      if (String(coach.role || '').toLowerCase() !== CONSTANTS.ROLES.COACH) continue;
      if (!isSendableUser(coach)) continue;

      const coachBd = birthdayMonthDayForYear(coach.birthDate, parts.year);
      if (!coachBd || !sameMonthDay(coachBd, parts)) continue;

      const text =
        '🎂 Нагадування\n\nЧерез ' +
        daysWord(days) +
        ' у вашого тренера ' +
        displayName(coach) +
        ' день народження.';
      if (await trySendOnce(String(student.chatId), String(coach.chatId), KIND.PAIR_STUDENT, days, parts.year, text)) {
        sentPairStudent += 1;
      }
    }
  }

  // --- У день ДН: вітання від платформи ---
  for (const u of byChatId.values()) {
    const bd = birthdayMonthDayForYear(u.birthDate, today.year);
    if (!bd || !sameMonthDay(bd, today)) continue;
    const greet = platformGreetingLine(u);
    const text =
      (greet ? greet + '\n\n' : '') +
      '🎂 Вітаємо з днем народження!\n\n' +
      'Бажаємо здоровʼя, сил і нових досягнень.\n' +
      'З повагою, команда MAYAG Fit 💪';
    if (await trySendOnce(String(u.chatId), String(u.chatId), KIND.PLATFORM, 0, today.year, text)) {
      sentPlatform += 1;
      if (u.age != null || u.birthDate) {
        try {
          const User = require('./user');
          const age = User.calculateAge(u.birthDate);
          if (age != null) await supabase.updateUser(String(u.chatId), { age });
        } catch (_) {}
      }
    }
  }

  return {
    sent: sentPairCoach + sentPairStudent + sentPlatform,
    sentPairCoach,
    sentPairStudent,
    sentPlatform
  };
}

module.exports = {
  sendBirthdayReminders,
  KIND,
  kyivParts,
  birthdayMonthDayForYear,
  platformGreetingLine
};
