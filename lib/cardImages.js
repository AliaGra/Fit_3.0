/**
 * Зображення на публічних картках:
 * тренер — фото або лого; клієнт — фото; заклад — лого.
 * На картці показуємо зменшене (макс. ~640px по довшій стороні).
 */
const sharp = require('sharp');
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const telegram = require('./telegram');
const supabase = require('./supabase');

/** Макс. довша сторона фото/лого на публічній картці (px). */
const CARD_IMAGE_MAX_SIDE = 640;

function kindLabel(kind) {
  return kind === 'logo' ? 'логотип' : 'фото';
}

async function resizeForCard(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return null;
  try {
    return await sharp(buffer)
      .rotate()
      .resize({
        width: CARD_IMAGE_MAX_SIDE,
        height: CARD_IMAGE_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    console.error('cardImages.resizeForCard', e.message);
    return null;
  }
}

/** Обирає зі списку розмірів Telegram найближчий до CARD_IMAGE_MAX_SIDE (не найбільший). */
function pickCardPhotoFileId(file) {
  const photos = file && Array.isArray(file.photos) ? file.photos : [];
  if (!photos.length) return file && file.fileId ? String(file.fileId) : '';
  const under = photos.filter((p) => Math.max(p.width || 0, p.height || 0) <= CARD_IMAGE_MAX_SIDE + 80);
  const pool = under.length ? under : photos;
  const p = pool[pool.length - 1];
  return p && p.fileId ? String(p.fileId) : String(file.fileId || '');
}

/**
 * Завантажити → зменшити → надіслати як фото.
 * Повертає новий file_id (або '' якщо не вдалось).
 */
async function sendResizedCardPhoto(chatId, sourceFileId, options = {}) {
  const src = String(sourceFileId || '').trim();
  if (!src) return '';
  const raw = await telegram.downloadFile(src);
  if (!raw) {
    const fallback = await Helpers.safeSendPhoto(chatId, src, options);
    return fallback ? src : '';
  }
  const resized = (await resizeForCard(raw)) || raw;
  const msg = await telegram.sendPhotoBuffer(chatId, resized, 'card.jpg', options);
  if (!msg) {
    const fallback = await Helpers.safeSendPhoto(chatId, src, options);
    return fallback ? src : '';
  }
  return telegram.largestPhotoFileId(msg) || src;
}

async function sendCardImageIfAny(viewerChatId, fileId) {
  const id = fileId != null ? String(fileId).trim() : '';
  if (!id) return false;
  const sentId = await sendResizedCardPhoto(viewerChatId, id);
  return !!sentId;
}

async function sendUserCardImage(viewerChatId, user) {
  if (!user || !user.cardImageFileId) return false;
  return sendCardImageIfAny(viewerChatId, user.cardImageFileId);
}

async function sendVenueLogo(viewerChatId, venue) {
  if (!venue || !venue.logoFileId) return false;
  return sendCardImageIfAny(viewerChatId, venue.logoFileId);
}

/**
 * Нормалізує завантажене зображення для збереження на картці:
 * бере середній розмір Telegram (якщо photo) → resize → новий file_id.
 */
async function normalizeAndStoreCardImage(chatId, file) {
  const picked = pickCardPhotoFileId(file) || String((file && file.fileId) || '').trim();
  if (!picked) return '';
  const raw = await telegram.downloadFile(picked);
  if (!raw) return picked;
  const resized = (await resizeForCard(raw)) || raw;
  const msg = await telegram.sendPhotoBuffer(chatId, resized, 'card.jpg', { disable_notification: true });
  if (!msg) return picked;
  const newId = telegram.largestPhotoFileId(msg);
  if (msg.message_id) {
    telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
  }
  return newId || picked;
}

async function showUserCardImageHub(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user) {
    await Helpers.safeSend(chatId, '❌ Профіль не знайдено.');
    return;
  }
  const role = String(user.role || '').toLowerCase();
  const isCoach = role === CONSTANTS.ROLES.COACH;
  const isStudent = role === CONSTANTS.ROLES.STUDENT;
  if (!isCoach && !isStudent) {
    await Helpers.safeSend(chatId, '❌ Цей розділ для тренера або клієнта.');
    return;
  }
  const title = isCoach ? '🖼 Фото/логотип профілю' : '🖼 Фото для публічної картки';
  const has = !!(user.cardImageFileId && String(user.cardImageFileId).trim());
  let text = title + '\n\n';
  if (has) {
    text +=
      'Зараз: ' +
      kindLabel(user.cardImageKind || 'photo') +
      '.\nПоказати, замінити або видалити.';
  } else if (isCoach) {
    text +=
      'Додай фото або логотип для публічної картки тренера.\n' +
      'Одне зображення; нове замінить попереднє.';
  } else {
    text += 'Додай фото для публічної картки.\nОдне зображення; нове замінить попереднє.';
  }
  const keyboard = [];
  if (has) {
    keyboard.push([{ text: '👁 Показати', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_VIEW }]);
    keyboard.push([{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_DEL }]);
  }
  if (isCoach) {
    keyboard.push([
      { text: '📷 Додати/замінити фото або логотип', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_ADD_PHOTO }
    ]);
  } else {
    keyboard.push([{ text: '📷 Додати/замінити фото', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_ADD_PHOTO }]);
  }
  if (isCoach) {
    keyboard.push([{ text: '⬅️ До публічних даних', callback_data: CONSTANTS.CALLBACKS.PROFILE_PUBLIC_DATA }]);
  } else {
    keyboard.push([{ text: '⬅️ До профілю', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  }
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  if (has) await sendUserCardImage(chatId, user);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askUserCardImageUpload(chatId, kind) {
  const user = await User.getByChatId(chatId);
  if (!user) return;
  const role = String(user.role || '').toLowerCase();
  const k = kind === 'logo' ? 'logo' : 'photo';
  if (k === 'logo' && role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Логотип доступний лише тренеру.');
    return;
  }
  if (role !== CONSTANTS.ROLES.COACH && role !== CONSTANTS.ROLES.STUDENT) return;
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.CARD_IMAGE_UPLOAD,
    cardImageKind: k,
    cardImageTarget: 'user'
  });
  const hint =
    role === CONSTANTS.ROLES.COACH
      ? 'Надішли фото або логотип як зображення (краще стиснуте фото з галереї, не величезний файл).'
      : k === 'logo'
        ? 'Надішли логотип як фото (або зображення файлом).'
        : 'Надішли фото (краще з галереї).';
  await Helpers.sendKeyboard(
    chatId,
    hint +
      '\n\nНа публічній картці зображення автоматично зменшується (до ~' +
      CARD_IMAGE_MAX_SIDE +
      ' px), щоб не займало весь екран.',
    [[{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.CARD_IMG_HUB }]]
  );
}

async function clearUserCardImage(chatId) {
  const ok = await supabase.updateUser(chatId, { cardImageFileId: null, cardImageKind: null });
  await Helpers.safeSend(chatId, ok ? '✅ Зображення видалено з картки.' : '❌ Не вдалося видалити.');
  await showUserCardImageHub(chatId);
}

async function viewUserCardImage(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || !user.cardImageFileId) {
    await Helpers.safeSend(chatId, 'Поки немає зображення.');
    await showUserCardImageHub(chatId);
    return;
  }
  await sendUserCardImage(chatId, user);
  await showUserCardImageHub(chatId);
}

async function showVenueLogoHub(chatId) {
  const venueId = await supabase.getVenueIdForManager(chatId);
  if (!venueId) {
    await Helpers.safeSend(chatId, '❌ Заклад не привʼязано. Звернись до адміна.');
    return;
  }
  const venue = await supabase.getVenueById(venueId);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return;
  }
  const has = !!(venue.logoFileId && String(venue.logoFileId).trim());
  let text = '🏷 Логотип закладу\n\n';
  text += has
    ? 'Логотип уже додано. Можеш показати, замінити або видалити.'
    : 'Додай логотип закладу для публічної картки клубу.';
  const keyboard = [];
  if (has) {
    keyboard.push([{ text: '👁 Показати', callback_data: CONSTANTS.CALLBACKS.VENUE_LOGO_VIEW }]);
    keyboard.push([{ text: '🗑 Видалити', callback_data: CONSTANTS.CALLBACKS.VENUE_LOGO_DEL }]);
  }
  keyboard.push([{ text: '🏷 Додати / замінити логотип', callback_data: CONSTANTS.CALLBACKS.VENUE_LOGO_ADD }]);
  keyboard.push([{ text: '🔙 До закладу', callback_data: CONSTANTS.CALLBACKS.VO_HUB }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
  if (has) await sendVenueLogo(chatId, venue);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askVenueLogoUpload(chatId) {
  const venueId = await supabase.getVenueIdForManager(chatId);
  if (!venueId) {
    await Helpers.safeSend(chatId, '❌ Заклад не привʼязано.');
    return;
  }
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.CARD_IMAGE_UPLOAD,
    cardImageKind: 'logo',
    cardImageTarget: 'venue',
    cardImageVenueId: String(venueId)
  });
  await Helpers.sendKeyboard(chatId, 'Надішли логотип закладу як фото (або зображення файлом).', [
    [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.VENUE_LOGO_HUB }]
  ]);
}

async function clearVenueLogo(chatId) {
  const venueId = await supabase.getVenueIdForManager(chatId);
  if (!venueId) {
    await Helpers.safeSend(chatId, '❌ Заклад не привʼязано.');
    return;
  }
  const ok = await supabase.updateVenueByManager(chatId, venueId, { logoFileId: null });
  await Helpers.safeSend(chatId, ok ? '✅ Логотип видалено.' : '❌ Не вдалося видалити.');
  await showVenueLogoHub(chatId);
}

async function viewVenueLogo(chatId) {
  const venueId = await supabase.getVenueIdForManager(chatId);
  const venue = venueId ? await supabase.getVenueById(venueId) : null;
  if (!venue || !venue.logoFileId) {
    await Helpers.safeSend(chatId, 'Поки немає логотипу.');
    await showVenueLogoHub(chatId);
    return;
  }
  await sendVenueLogo(chatId, venue);
  await showVenueLogoHub(chatId);
}

async function handleFileMessage(chatId, file) {
  const state = await State.get(chatId);
  if (!state || state.step !== CONSTANTS.FSM_STATES.CARD_IMAGE_UPLOAD) return false;
  if (!file || !file.fileId) {
    await Helpers.safeSend(chatId, '⚠️ Надішли зображення як фото або файл.');
    return true;
  }
  const target = state.cardImageTarget === 'venue' ? 'venue' : 'user';
  const kind = state.cardImageKind === 'logo' ? 'logo' : 'photo';
  await Helpers.safeSend(chatId, '⏳ Оптимізую зображення для картки…');
  const fileId = await normalizeAndStoreCardImage(chatId, file);
  if (!fileId) {
    await Helpers.safeSend(chatId, '⚠️ Не вдалося обробити зображення. Надішли ще раз як фото.');
    return true;
  }

  if (target === 'venue') {
    const venueId = String(state.cardImageVenueId || '').trim();
    if (!venueId) {
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '❌ Сесія збилась. Відкрий розділ логотипу ще раз.');
      return true;
    }
    const ok = await supabase.updateVenueByManager(chatId, venueId, { logoFileId: fileId });
    await State.clear(chatId);
    if (!ok) {
      await Helpers.safeSend(chatId, '❌ Не вдалося зберегти логотип.');
      await showVenueLogoHub(chatId);
      return true;
    }
    await Helpers.safeSend(chatId, '✅ Логотип закладу збережено.');
    await showVenueLogoHub(chatId);
    return true;
  }

  const user = await User.getByChatId(chatId);
  if (!user) {
    await State.clear(chatId);
    return true;
  }
  const role = String(user.role || '').toLowerCase();
  if (role === CONSTANTS.ROLES.STUDENT) {
    // client: photo only
  } else if (role === CONSTANTS.ROLES.COACH) {
    // ok
  } else {
    await State.clear(chatId);
    await Helpers.safeSend(chatId, '❌ Немає доступу.');
    return true;
  }
  const saveKind = role === CONSTANTS.ROLES.STUDENT ? 'photo' : kind;
  const ok = await supabase.updateUser(chatId, { cardImageFileId: fileId, cardImageKind: saveKind });
  await State.clear(chatId);
  if (!ok) {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти зображення.');
    await showUserCardImageHub(chatId);
    return true;
  }
  await Helpers.safeSend(chatId, '✅ ' + (saveKind === 'logo' ? 'Логотип' : 'Фото') + ' збережено на картці (зменшено для зручного перегляду).');
  await showUserCardImageHub(chatId);
  return true;
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  if (action === CONSTANTS.CALLBACKS.CARD_IMG_HUB) {
    await showUserCardImageHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.CARD_IMG_ADD_PHOTO) {
    await askUserCardImageUpload(chatId, 'photo');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.CARD_IMG_ADD_LOGO) {
    await askUserCardImageUpload(chatId, 'logo');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.CARD_IMG_VIEW) {
    await viewUserCardImage(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.CARD_IMG_DEL) {
    await clearUserCardImage(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VENUE_LOGO_HUB) {
    await showVenueLogoHub(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VENUE_LOGO_ADD) {
    await askVenueLogoUpload(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VENUE_LOGO_VIEW) {
    await viewVenueLogo(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.VENUE_LOGO_DEL) {
    await clearVenueLogo(chatId);
    return true;
  }
  return false;
}

module.exports = {
  sendUserCardImage,
  sendVenueLogo,
  showUserCardImageHub,
  showVenueLogoHub,
  handleCallback,
  handleFileMessage
};
