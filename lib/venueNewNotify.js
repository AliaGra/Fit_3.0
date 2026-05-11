/**
 * Розсилка в основний бот: усі користувачі (без фільтра за role), у яких city у профілі збігається
 * з city закладу символ-у-символ, отримують повідомлення про новий заклад.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const supabase = require('./supabase');

const DELAY_MS = 70;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function amenitySummaryUa(facets, maxLen = 160) {
  const list = (facets || [])
    .filter((f) => f && f.facetKind === 'amenity' && (f.labelUa || f.code))
    .map((f) => String(f.labelUa || f.code || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!list.length) return '';
  let s = list.join(', ');
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}

/**
 * @param {string} venueId
 * @returns {Promise<{ sent: number, failed: number, skipped: boolean }>}
 */
async function notifyUsersNewVenue(venueId) {
  if (String(process.env.VENUE_NEW_NOTIFY_DISABLED || '').trim() === '1') {
    return { sent: 0, failed: 0, skipped: true };
  }
  const vid = String(venueId || '').trim();
  if (!vid) return { sent: 0, failed: 0, skipped: true };

  const venue = await supabase.getVenueById(vid);
  if (!venue || !venue.isActive || !String(venue.city || '').trim()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const chatIds = await supabase.listUserChatIdsForVenueLocationNotify({
    oblast: venue.oblast,
    city: venue.city,
    district: venue.district
  });
  if (!chatIds.length) {
    return { sent: 0, failed: 0, skipped: false };
  }

  let orgLabel = '';
  try {
    const orgDir = await supabase.getVenueDirectoryCodes('organization');
    const map = new Map(orgDir.map((x) => [x.code, x.labelUa]));
    orgLabel = map.get(String(venue.organizationType || '').trim()) || '';
  } catch (_) {
    orgLabel = '';
  }

  const distVenue = String(venue.district || '').trim();
  const cityLine = [
    Helpers.escapeHtml(String(venue.city || '').trim()),
    Helpers.escapeHtml(String(venue.oblast || '').trim()),
    distVenue ? `район: ${Helpers.escapeHtml(distVenue)}` : ''
  ]
    .filter(Boolean)
    .join(', ');
  const addr = String(venue.address || '').trim();
  const addrLine = addr ? `📍 ${Helpers.escapeHtml(addr)}` : '';
  const orgLine = orgLabel ? `🏷 ${Helpers.escapeHtml(orgLabel)}` : '';
  const amen = amenitySummaryUa(venue.facets);
  const amenLine = amen ? `✨ ${Helpers.escapeHtml(amen)}` : '';

  let mapsLine = '';
  const lat = venue.latitude;
  const lng = venue.longitude;
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    const url = googleMapsLink(lat, lng);
    mapsLine = `🗺 <a href="${Helpers.htmlHrefAttr(url)}">На карті</a>`;
  }

  const deep = Helpers.publicVenuePageLink(vid);
  const deepLine =
    deep ? `\n\n🔗 <a href="${Helpers.htmlHrefAttr(deep)}">Відкрити в Telegram</a>` : '';

  const body =
    `🏢 <b>Новий заклад у твоєму місті</b>\n\n` +
    `<b>${Helpers.escapeHtml(String(venue.nameUa || '').trim() || 'Заклад')}</b>\n` +
    [orgLine, addrLine, cityLine ? `📌 ${cityLine}` : '', amenLine, mapsLine].filter(Boolean).join('\n') +
    deepLine +
    `\n\n<i>Натисни кнопку нижче, щоб відкрити картку закладу.</i>`;

  const keyboard = [
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
      console.error('venueNewNotify send failed chatId=', chatId);
    }
    await sleep(DELAY_MS);
  }
  console.log(`venueNewNotify venue=${vid} city=${venue.city} sent=${sent} failed=${failed}`);
  return { sent, failed, skipped: false };
}

module.exports = {
  notifyUsersNewVenue
};
