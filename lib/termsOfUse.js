/**
 * Умови користування — інформативний екран за роллю (головне меню).
 */
const { CONSTANTS } = require('./constants');
const User = require('./user');
const Helpers = require('./helpers');

const INTRO =
  '<b>1.</b> На період тестування платформи всі послуги надаються безоплатно.';

const VENUE_OWNER_BODY =
  '\n\n<b>Роль: Власник закладу</b>\n\n' +
  '<b>2.</b> Після завершення тестування та прийняття умов оферти:\n\n' +
  '<b>2.1. Безоплатно:</b>\n' +
  '• Розміщення інформації про заклад на платформі\n' +
  '• Зміна/додавання інформації про заклад на платформі\n\n' +
  '<b>2.2. Платні послуги</b> (за підпискою або разовою оплатою):\n' +
  '• Розсилка оголошень активним відвідувачам вашого спортивного закладу.\n' +
  '• Розсилка оголошень «сплячим» користувачам платформи (повернення клієнтів).\n' +
  '• Гео-розсилка оголошень усім користувачам платформи у вашому населеному пункті (залучення нових клієнтів).\n' +
  '• Пріоритетне відображення закладу в пошуку для користувачів (ТОП-видача).\n' +
  '• Онлайн-розклад та автоматичний запис на тренування (з автоматичним контролем вільних місць).\n' +
  '• Система обліку відвідуваності та аналітика завантаженості залу.';

const OTHER_ROLE_TAIL =
  '\n\n<i>Деталі умов для вашої ролі після тестового періоду — в оферті платформи ' +
  '(меню «Зв’язок з розробником» → Читати оферту).</i>';

function buildTermsHtml(role) {
  let body = INTRO;
  if (role === CONSTANTS.ROLES.VENUE_OWNER) body += VENUE_OWNER_BODY;
  else body += OTHER_ROLE_TAIL;
  return '📜 <b>Умови користування</b>\n\n' + body;
}

async function showTermsOfUse(chatId) {
  const user = await User.getByChatId(chatId);
  const role = user && user.role ? user.role : '';
  const text = buildTermsHtml(role);
  const keyboard = [[{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'HTML' });
}

module.exports = {
  buildTermsHtml,
  showTermsOfUse
};
