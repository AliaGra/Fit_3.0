/**
 * Тренер ↔ власник закладу: заявка адміну + перемикання меню.
 * role лишається coach; доступ власника через venue_managers.
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');

async function coachHasVenueOwnerAccess(chatId) {
  const venueId = await supabase.getVenueIdForManager(chatId);
  return !!venueId;
}

async function showApplyHub(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ лише для тренера.');
    return;
  }
  if (await coachHasVenueOwnerAccess(chatId)) {
    await Helpers.sendKeyboard(
      chatId,
      '✅ У тебе вже є доступ власника закладу.\n\nМожеш перейти в меню власника.',
      [
        [{ text: '🏢 Меню власника', callback_data: CONSTANTS.CALLBACKS.MENU_OWNER_PANEL }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Меню тренера', callback_data: CONSTANTS.CALLBACKS.MENU_COACH_PANEL }]
      ]
    );
    return;
  }
  const pending = await supabase.getPendingVenueOwnerRequestForCoach(chatId);
  if (pending) {
    await Helpers.sendKeyboard(
      chatId,
      '⏳ Заявка на роль власника вже на модерації.\n\nОчікуй рішення адміна.',
      [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
    );
    return;
  }
  const venues = (await supabase.getCoachVenuesWhereTeach(chatId)) || [];
  if (!venues.length) {
    await Helpers.sendKeyboard(
      chatId,
      'Щоб подати заявку «Я власник», спочатку додай заклад у «Де треную» (профіль).\n\n' +
        'Після цього обереш заклад зі списку і надішлеш заявку адміну.',
      [
        [{ text: '🏢 Де треную', callback_data: CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ]
    );
    return;
  }
  const keyboard = venues.map((v) => {
    let label = '🏢 ' + (v.nameUa || v.city || 'Заклад');
    if (label.length > 64) label = label.slice(0, 61) + '…';
    return [{ text: label, callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_OWNER_VEN + ':' + v.id }];
  });
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  await Helpers.sendKeyboard(
    chatId,
    '🏢 Підключити роль власника\n\nОбери заклад, яким володієш (зі списку «де треную»). Заявка піде адміну на підтвердження.',
    keyboard
  );
}

async function submitRequest(chatId, venueId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ лише для тренера.');
    return;
  }
  if (await coachHasVenueOwnerAccess(chatId)) {
    await Helpers.safeSend(chatId, '✅ Доступ власника вже є.');
    return;
  }
  const pending = await supabase.getPendingVenueOwnerRequestForCoach(chatId);
  if (pending) {
    await Helpers.safeSend(chatId, '⏳ У тебе вже є заявка на модерації.');
    return;
  }
  const vid = String(venueId || '').trim();
  const venues = (await supabase.getCoachVenuesWhereTeach(chatId)) || [];
  const venue = venues.find((v) => String(v.id) === vid);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Цей заклад не в твоєму списку «де треную».');
    await showApplyHub(chatId);
    return;
  }
  const req = await supabase.createVenueOwnerRequest(chatId, vid);
  if (!req) {
    await Helpers.safeSend(chatId, '❌ Не вдалося надіслати заявку. Спробуй пізніше.');
    return;
  }
  await notifyAdminNewOwnerRequest(req, user, venue);
  await Helpers.sendKeyboard(
    chatId,
    '✅ Заявку надіслано адміну.\n\nЗаклад: ' + (venue.nameUa || '') + '\nПісля підтвердження зʼявиться перемикач «Меню власника».',
    [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]]
  );
}

async function notifyAdminNewOwnerRequest(req, coach, venue) {
  const adminId = process.env.ADMIN_CHAT_ID != null ? String(process.env.ADMIN_CHAT_ID).trim() : '';
  if (!adminId || !req) return;
  try {
    const AdminTelegram = require('./adminTelegram');
    const coachForLink = coach && coach.chatId ? coach : Object.assign({}, coach || {}, { chatId: req.coachChatId });
    const name = (((coachForLink.firstName) || '') + ' ' + ((coachForLink.lastName) || '')).trim() || req.coachChatId;
    const vname = (venue && venue.nameUa) || req.venueId || '—';
    const tgUrl = Helpers.telegramDirectMessageUrl(coachForLink);
    const tgUsername = Helpers.normalizeTelegramUsername(coachForLink.telegramUsername);
    let tgLine = 'Telegram: невідомо';
    if (tgUsername) tgLine = 'Telegram: @' + tgUsername + (tgUrl ? '\n' + tgUrl : '');
    else if (tgUrl) tgLine = 'Telegram: ' + tgUrl;
    const keyboard = [
      [{ text: '✅ Схвалити', callback_data: 'ADM_OWNREQ_OK:' + req.id }],
      [{ text: '❌ Відхилити', callback_data: 'ADM_OWNREQ_NO:' + req.id }]
    ];
    const tgBtn = Helpers.telegramContactButton('💬 Написати тренеру в Telegram', coachForLink);
    if (tgBtn) keyboard.push([tgBtn]);
    keyboard.push([{ text: '📋 Черга заявок', callback_data: 'ADM_OWNREQ' }]);
    await AdminTelegram.sendKeyboard(
      adminId,
      '🏢 Заявка тренера на роль власника\n\n' +
        'Тренер: ' +
        name +
        ' (' +
        req.coachChatId +
        ')\n' +
        tgLine +
        '\n' +
        'Заклад: ' +
        vname +
        '\n' +
        'venue_id: ' +
        (req.venueId || '—'),
      keyboard
    );
  } catch (e) {
    console.error('CoachOwnerLink.notifyAdmin', e.message);
  }
}

async function switchToOwnerPanel(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Перемикання доступне тренеру з доступом власника.');
    return;
  }
  if (!(await coachHasVenueOwnerAccess(chatId))) {
    await Helpers.safeSend(chatId, '❌ Спочатку потрібне підтвердження заявки адміном.');
    await showApplyHub(chatId);
    return;
  }
  await supabase.updateUser(chatId, { activeMenuMode: 'venue_owner' });
  const VenueOwner = require('./venueOwner');
  const fresh = await User.getByChatId(chatId);
  await VenueOwner.showVenueOwnerMenu(chatId, fresh || user, { dualCoach: true });
}

async function switchToCoachPanel(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    const Menu = require('./menu');
    await Menu.show(chatId, { force: true });
    return;
  }
  await supabase.updateUser(chatId, { activeMenuMode: 'coach' });
  const Menu = require('./menu');
  await Menu.showCoachMenu(chatId, await User.getByChatId(chatId) || user);
}

async function handleCallback(chatId, callbackData) {
  const parts = String(callbackData || '').split(':');
  const action = parts[0];
  const param = parts.slice(1).join(':');
  if (action === CONSTANTS.CALLBACKS.COACH_OWNER_APPLY) {
    await showApplyHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_OWNER_VEN && param) {
    await submitRequest(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_OWNER_PANEL) {
    await switchToOwnerPanel(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_COACH_PANEL) {
    await switchToCoachPanel(chatId);
    return true;
  }
  return false;
}

module.exports = {
  coachHasVenueOwnerAccess,
  showApplyHub,
  switchToOwnerPanel,
  switchToCoachPanel,
  handleCallback
};
