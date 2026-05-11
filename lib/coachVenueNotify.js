/**
 * Розсилка в основний бот: користувачі, у яких у профілі обрано заклад X, отримують
 * повідомлення, коли тренер уперше прив’язує себе до цього закладу (coach_venues).
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const supabase = require('./supabase');

const DELAY_MS = 70;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function coachDisplayName(user) {
  if (!user) return 'Тренер';
  const fn = String(user.firstName || '').trim();
  const ln = String(user.lastName || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ');
  return name || 'Тренер';
}

/**
 * @param {string|number} coachChatId
 * @param {string} venueId
 * @returns {Promise<{ sent: number, failed: number, skipped: boolean }>}
 */
async function notifyUsersNewCoachAtVenue(coachChatId, venueId) {
  if (String(process.env.COACH_VENUE_NOTIFY_DISABLED || '').trim() === '1') {
    return { sent: 0, failed: 0, skipped: true };
  }
  const cid = String(coachChatId || '').trim();
  const vid = String(venueId || '').trim();
  if (!cid || !vid) return { sent: 0, failed: 0, skipped: true };

  const venue = await supabase.getVenueById(vid);
  if (!venue || !venue.isActive) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const coachUser = await supabase.getUserByChatId(cid);
  if (!coachUser || String(coachUser.role || '') !== CONSTANTS.ROLES.COACH) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const chatIds = await supabase.listUserChatIdsLinkedToVenue(vid, cid);
  if (!chatIds.length) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const coachName = Helpers.escapeHtml(coachDisplayName(coachUser));
  const venueName = Helpers.escapeHtml(String(venue.nameUa || '').trim() || 'Заклад');
  const cityLine = [String(venue.city || '').trim(), String(venue.oblast || '').trim()]
    .filter(Boolean)
    .map((s) => Helpers.escapeHtml(s))
    .join(', ');

  const deepCoach = Helpers.publicCoachPageLink(cid);
  const deepVenue = Helpers.publicVenuePageLink(vid);
  const deepCoachLine =
    deepCoach ? `\n\n🔗 <a href="${Helpers.htmlHrefAttr(deepCoach)}">Відкрити картку тренера в Telegram</a>` : '';
  const deepVenueLine =
    deepVenue ? `\n🔗 <a href="${Helpers.htmlHrefAttr(deepVenue)}">Відкрити заклад у Telegram</a>` : '';

  const body =
    `👤 <b>Новий тренер у твоєму закладі</b>\n\n` +
    `<b>${coachName}</b> тренує в <b>${venueName}</b>` +
    (cityLine ? `\n📌 ${cityLine}` : '') +
    deepCoachLine +
    deepVenueLine +
    `\n\n<i>Натисни кнопку нижче, щоб відкрити картку тренера.</i>`;

  const keyboard = [
    [{ text: '👤 Картка тренера', callback_data: `${CONSTANTS.CALLBACK_PREFIXES.PVCH}:${cid}` }],
    [{ text: '📋 Картка закладу', callback_data: `${CONSTANTS.CALLBACKS.VENUES_CARD}:${vid}` }],
    [{ text: '🏢 Мої заклади', callback_data: CONSTANTS.CALLBACKS.VENUES_MENU }]
  ];

  let sent = 0;
  let failed = 0;
  for (const chatId of chatIds) {
    const res = await Helpers.sendKeyboard(chatId, body, keyboard, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    if (res) sent += 1;
    else {
      failed += 1;
      console.error('coachVenueNotify send failed chatId=', chatId);
    }
    await sleep(DELAY_MS);
  }
  console.log(`coachVenueNotify coach=${cid} venue=${vid} sent=${sent} failed=${failed}`);
  return { sent, failed, skipped: false };
}

module.exports = {
  notifyUsersNewCoachAtVenue
};
