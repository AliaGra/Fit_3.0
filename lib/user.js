/**
 * User — отримання користувача по chatId (через Supabase)
 */
const supabase = require('./supabase');

function getByChatId(chatId) {
  return supabase.getUserByChatId(chatId);
}

module.exports = { getByChatId };
