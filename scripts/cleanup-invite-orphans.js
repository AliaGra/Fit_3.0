/**
 * Одноразова очистка БД: видалити дані по інвайт-кодах, які були видалені з архіву
 * ДО впровадження каскадного видалення (залишились записи users з coach_id = null та пов’язані дані).
 *
 * Запуск: з кореня проєкту, з налаштованим .env (SUPABASE_URL, SUPABASE_ANON_KEY):
 *   node scripts/cleanup-invite-orphans.js
 *
 * Скрипт спочатку показує список chat_id, які будуть видалені; потім питає підтвердження (dry-run без підтвердження).
 */
require('dotenv').config();
const supabase = require('../lib/supabase');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ids = await supabase.getInviteUnlinkedChatIds();
  if (!ids.length) {
    console.log('Немає записів для очистки (інвайти з coach_id = null не знайдено).');
    return;
  }
  console.log('Знайдено інвайт-записів (coach_id = null), які будуть видалені разом із усіма пов’язаними даними:');
  ids.forEach((id) => console.log('  -', id));
  if (dryRun) {
    console.log('\nРежим --dry-run: нічого не видалялось.');
    return;
  }
  console.log('\nВидалення...');
  let ok = 0;
  let err = 0;
  for (const chatId of ids) {
    const success = await supabase.deleteInviteUserAndAllRelatedData(chatId);
    if (success) {
      ok++;
      console.log('  OK:', chatId);
    } else {
      err++;
      console.log('  FAIL:', chatId);
    }
  }
  console.log('\nГотово. Видалено:', ok, 'помилок:', err);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
