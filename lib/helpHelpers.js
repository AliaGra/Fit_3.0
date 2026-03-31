/**
 * Helpers for Help bot: extract updates, operator checks.
 */

function extractMessage(update) {
  if (!update || typeof update !== 'object') return null;
  if (update.message && update.message.chat && update.message.chat.id) {
    return { type: 'text', chatId: String(update.message.chat.id), text: update.message.text || '' };
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

function isHelpOperator(chatId) {
  const op = process.env.HELP_OPERATOR_CHAT_ID != null ? String(process.env.HELP_OPERATOR_CHAT_ID).trim() : '';
  return !!op && String(chatId) === op;
}

module.exports = { extractMessage, isHelpOperator };

