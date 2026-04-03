/**
 * Helpers for Admin bot: extract updates, safety checks.
 */

function extractMessage(update) {
  if (!update || typeof update !== 'object') return null;
  if (update.message && update.message.chat && update.message.chat.id) {
    const chatId = String(update.message.chat.id);
    if (update.message.location && update.message.location.latitude != null && update.message.location.longitude != null) {
      return {
        type: 'location',
        chatId,
        latitude: update.message.location.latitude,
        longitude: update.message.location.longitude
      };
    }
    return { type: 'text', chatId, text: update.message.text || '' };
  }
  if (update.callback_query && update.callback_query.message && update.callback_query.message.chat && update.callback_query.message.chat.id) {
    return {
      type: 'callback',
      chatId: String(update.callback_query.message.chat.id),
      callbackData: update.callback_query.data || '',
      callbackQueryId: update.callback_query.id || ''
    };
  }
  return null;
}

function isAdminChat(chatId) {
  const adminId = process.env.ADMIN_CHAT_ID != null ? String(process.env.ADMIN_CHAT_ID).trim() : '';
  return !!adminId && String(chatId) === adminId;
}

module.exports = { extractMessage, isAdminChat };
