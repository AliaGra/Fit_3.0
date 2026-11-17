/**
 * Умови розрахунку тренера з залом (крок 1).
 * Мій профіль → Умови залів → зал з «Де треную» →
 *   indiv/split/trio: % або фікс за сесію;
 *   групові: % від оплат абонементів або фікс за відвідувача.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function moneyLabel(amount, currency) {
  const cur = String(currency || 'UAH').toUpperCase() === 'UAH' ? 'грн' : String(currency || 'UAH');
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)) + ' ' + cur;
}

function formatSessionLine(eco) {
  if (!eco || eco.sessionMode === 'unset') return '• Індив./спліт/тріо: ще не налаштовано';
  if (eco.sessionMode === 'percent') {
    return '• Індив./спліт/тріо: ' + (eco.sessionPercent != null ? eco.sessionPercent + '%' : '—') + ' від суми сесії';
  }
  if (eco.sessionMode === 'fixed') {
    return (
      '• Індив./спліт/тріо: фікс ' +
      moneyLabel(eco.sessionFixedAmount, eco.currency) +
      ' за 1 проведену сесію'
    );
  }
  return '• Індив./спліт/тріо: —';
}

function formatGroupLine(eco) {
  if (!eco || eco.groupMode === 'unset') return '• Групові: ще не налаштовано';
  if (eco.groupMode === 'percent_subs') {
    return (
      '• Групові: ' +
      (eco.groupPercent != null ? eco.groupPercent + '%' : '—') +
      ' від оплат абонементів (місяць start)'
    );
  }
  if (eco.groupMode === 'fixed_per_attendee') {
    return (
      '• Групові: фікс ' +
      moneyLabel(eco.groupFixedPerAttendee, eco.currency) +
      ' × відвідувач на заняття'
    );
  }
  return '• Групові: —';
}

function venueTitle(v) {
  if (!v) return 'Заклад';
  const name = v.nameUa || v.name || 'Заклад';
  const city = v.city ? ', ' + v.city : '';
  return name + city;
}

async function ensureCoach(chatId) {
  const user = await User.getByChatId(chatId);
  if (!user || user.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '❌ Доступ лише для тренера.');
    return null;
  }
  return user;
}

async function showHub(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const venues = (await supabase.getCoachVenuesWhereTeach(chatId)) || [];
  if (!venues.length) {
    await Helpers.sendKeyboard(
      chatId,
      '🏋️ Умови залів\n\n' +
        'Немає закладів у «Де треную».\n\n' +
        'Спочатку додай зал: Головне меню → Клуби, студії → 🏋️ Де треную.',
      [
        [{ text: '🏋️ Відкрити «Де треную»', callback_data: CONSTANTS.CALLBACKS.VENUES_TEACH_HUB }],
        [{ text: '⬅️ Мій профіль', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]
      ]
    );
    return;
  }
  const economics = await supabase.listCoachVenueEconomics(chatId);
  const ecoMap = new Map((economics || []).map((e) => [String(e.venueId), e]));
  let text =
    '🏋️ Умови залів\n\n' +
    'Як зал забирає свою частину з твоїх тренувань у цьому клубі.\n' +
    'Обери заклад:\n';
  const keyboard = [];
  for (const v of venues) {
    const id = String(v.id);
    const eco = ecoMap.get(id);
    const mark =
      eco && (eco.sessionMode !== 'unset' || eco.groupMode !== 'unset') ? '✅ ' : '⬜ ';
    const label = mark + venueTitle(v);
    keyboard.push([
      {
        text: label.length > 64 ? label.slice(0, 61) + '…' : label,
        callback_data: CONSTANTS.CALLBACKS.VECON_VENUE + ':' + id
      }
    ]);
  }
  keyboard.push([{ text: '⬅️ Мій профіль', callback_data: CONSTANTS.CALLBACKS.BACK_TO_PROFILE }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showVenueCard(chatId, venueId) {
  if (!(await ensureCoach(chatId))) return;
  const vid = String(venueId || '');
  if (!vid) return showHub(chatId);
  const venue = await supabase.getVenueById(vid);
  if (!venue) {
    await Helpers.safeSend(chatId, '❌ Заклад не знайдено.');
    return showHub(chatId);
  }
  const teach = (await supabase.getCoachVenuesWhereTeach(chatId)) || [];
  if (!teach.some((v) => String(v.id) === vid)) {
    await Helpers.safeSend(chatId, '⚠️ Цей заклад не в «Де треную». Додай його спочатку.');
    return showHub(chatId);
  }
  await State.update(chatId, { veconVenueId: vid, step: null });
  const eco = await supabase.getCoachVenueEconomics(chatId, vid);
  const text =
    '🏋️ Умови: ' +
    venueTitle(venue) +
    '\n\n' +
    formatSessionLine(eco) +
    '\n' +
    formatGroupLine(eco) +
    '\n\n' +
    'Обери, що налаштувати:';
  const keyboard = [
    [{ text: '👤 Індив. / спліт / тріо', callback_data: CONSTANTS.CALLBACKS.VECON_SESSION_MENU }],
    [{ text: '👥 Групові', callback_data: CONSTANTS.CALLBACKS.VECON_GROUP_MENU }],
    [{ text: '⬅️ До списку залів', callback_data: CONSTANTS.CALLBACKS.VECON_HUB }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showSessionMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const state = (await State.get(chatId)) || {};
  const vid = String(state.veconVenueId || '');
  if (!vid) return showHub(chatId);
  const eco = await supabase.getCoachVenueEconomics(chatId, vid);
  const text =
    '👤 Індивідуальні / спліт / тріо\n\n' +
    'Зал рахується за кожне проведене тренування.\n' +
    'Обери один режим:\n\n' +
    formatSessionLine(eco);
  const keyboard = [
    [{ text: '📊 Відсоток від суми сесії', callback_data: CONSTANTS.CALLBACKS.VECON_SESSION_PERCENT }],
    [{ text: '💵 Фікс за 1 сесію', callback_data: CONSTANTS.CALLBACKS.VECON_SESSION_FIXED }],
    [{ text: '🗑 Скинути', callback_data: CONSTANTS.CALLBACKS.VECON_SESSION_CLEAR }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.VECON_VENUE + ':' + vid }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showGroupMenu(chatId) {
  if (!(await ensureCoach(chatId))) return;
  const state = (await State.get(chatId)) || {};
  const vid = String(state.veconVenueId || '');
  if (!vid) return showHub(chatId);
  const eco = await supabase.getCoachVenueEconomics(chatId, vid);
  const text =
    '👥 Групові\n\n' +
    'Обери один режим розрахунку з залом:\n' +
    '• % від оплат групових абонементів (місяць = start_date)\n' +
    '• фікс × кожен відвідувач на заняття\n\n' +
    formatGroupLine(eco);
  const keyboard = [
    [{ text: '📊 % від оплат абонементів', callback_data: CONSTANTS.CALLBACKS.VECON_GROUP_PERCENT }],
    [{ text: '💵 Фікс за відвідувача', callback_data: CONSTANTS.CALLBACKS.VECON_GROUP_FIXED }],
    [{ text: '🗑 Скинути', callback_data: CONSTANTS.CALLBACKS.VECON_GROUP_CLEAR }],
    [{ text: '⬅️ Назад', callback_data: CONSTANTS.CALLBACKS.VECON_VENUE + ':' + vid }]
  ];
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askSessionValue(chatId, mode) {
  if (!(await ensureCoach(chatId))) return;
  const state = (await State.get(chatId)) || {};
  const vid = String(state.veconVenueId || '');
  if (!vid) return showHub(chatId);
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VECON_SESSION_INPUT,
    veconVenueId: vid,
    veconSessionMode: mode
  });
  const prompt =
    mode === 'percent'
      ? 'Введи відсоток залу від суми сесії (0–100), наприклад: 30'
      : 'Введи фікс у грн за 1 проведену сесію, наприклад: 200';
  await Helpers.sendKeyboard(chatId, prompt, [
    [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.VECON_SESSION_MENU }]
  ]);
}

async function askGroupValue(chatId, mode) {
  if (!(await ensureCoach(chatId))) return;
  const state = (await State.get(chatId)) || {};
  const vid = String(state.veconVenueId || '');
  if (!vid) return showHub(chatId);
  await State.update(chatId, {
    step: CONSTANTS.FSM_STATES.VECON_GROUP_INPUT,
    veconVenueId: vid,
    veconGroupMode: mode
  });
  const prompt =
    mode === 'percent_subs'
      ? 'Введи відсоток залу від оплат групових абонементів (0–100), наприклад: 40'
      : 'Введи фікс у грн за одного відвідувача на заняття, наприклад: 50';
  await Helpers.sendKeyboard(chatId, prompt, [
    [{ text: '❌ Скасувати', callback_data: CONSTANTS.CALLBACKS.VECON_GROUP_MENU }]
  ]);
}

function parsePercent(raw) {
  const n = parseFloat(String(raw || '').replace(',', '.').trim());
  if (Number.isNaN(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function parseMoney(raw) {
  const n = parseFloat(String(raw || '').replace(',', '.').trim());
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData) return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = (parts.slice(1).join(':') || '').trim();
  const CB = CONSTANTS.CALLBACKS;

  if (action === CB.VECON_HUB) {
    await showHub(chatId);
    return true;
  }
  if (action === CB.VECON_VENUE) {
    await showVenueCard(chatId, param);
    return true;
  }
  if (action === CB.VECON_SESSION_MENU) {
    await showSessionMenu(chatId);
    return true;
  }
  if (action === CB.VECON_GROUP_MENU) {
    await showGroupMenu(chatId);
    return true;
  }
  if (action === CB.VECON_SESSION_PERCENT) {
    await askSessionValue(chatId, 'percent');
    return true;
  }
  if (action === CB.VECON_SESSION_FIXED) {
    await askSessionValue(chatId, 'fixed');
    return true;
  }
  if (action === CB.VECON_GROUP_PERCENT) {
    await askGroupValue(chatId, 'percent_subs');
    return true;
  }
  if (action === CB.VECON_GROUP_FIXED) {
    await askGroupValue(chatId, 'fixed_per_attendee');
    return true;
  }
  if (action === CB.VECON_SESSION_CLEAR) {
    const state = (await State.get(chatId)) || {};
    const vid = String(state.veconVenueId || '');
    if (!vid) {
      await showHub(chatId);
      return true;
    }
    const ok = await supabase.upsertCoachVenueEconomics(chatId, vid, { sessionMode: 'unset' });
    await Helpers.safeSend(chatId, ok ? '✅ Режим для індив./спліт/тріо скинуто.' : '❌ Не вдалося зберегти.');
    await showVenueCard(chatId, vid);
    return true;
  }
  if (action === CB.VECON_GROUP_CLEAR) {
    const state = (await State.get(chatId)) || {};
    const vid = String(state.veconVenueId || '');
    if (!vid) {
      await showHub(chatId);
      return true;
    }
    const ok = await supabase.upsertCoachVenueEconomics(chatId, vid, { groupMode: 'unset' });
    await Helpers.safeSend(chatId, ok ? '✅ Режим для групових скинуто.' : '❌ Не вдалося зберегти.');
    await showVenueCard(chatId, vid);
    return true;
  }
  return false;
}

async function handleTextMessage(chatId, text) {
  const state = (await State.get(chatId)) || {};
  const step = state.step;
  if (
    step !== CONSTANTS.FSM_STATES.VECON_SESSION_INPUT &&
    step !== CONSTANTS.FSM_STATES.VECON_GROUP_INPUT
  ) {
    return false;
  }
  if (!(await ensureCoach(chatId))) {
    await State.update(chatId, { step: null });
    return true;
  }
  const vid = String(state.veconVenueId || '');
  if (!vid) {
    await State.update(chatId, { step: null });
    await showHub(chatId);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.VECON_SESSION_INPUT) {
    const mode = String(state.veconSessionMode || '');
    let patch = null;
    if (mode === 'percent') {
      const pct = parsePercent(text);
      if (pct == null) {
        await Helpers.safeSend(chatId, '❌ Введи число від 0 до 100 (наприклад 30).');
        return true;
      }
      patch = { sessionMode: 'percent', sessionPercent: pct };
    } else if (mode === 'fixed') {
      const amt = parseMoney(text);
      if (amt == null) {
        await Helpers.safeSend(chatId, '❌ Введи суму ≥ 0 (наприклад 200).');
        return true;
      }
      patch = { sessionMode: 'fixed', sessionFixedAmount: amt };
    } else {
      await State.update(chatId, { step: null });
      await showSessionMenu(chatId);
      return true;
    }
    const ok = await supabase.upsertCoachVenueEconomics(chatId, vid, patch);
    await State.update(chatId, { step: null, veconSessionMode: null });
    await Helpers.safeSend(chatId, ok ? '✅ Збережено.' : '❌ Не вдалося зберегти. Перевір міграцію coach_venue_economics.');
    await showVenueCard(chatId, vid);
    return true;
  }

  if (step === CONSTANTS.FSM_STATES.VECON_GROUP_INPUT) {
    const mode = String(state.veconGroupMode || '');
    let patch = null;
    if (mode === 'percent_subs') {
      const pct = parsePercent(text);
      if (pct == null) {
        await Helpers.safeSend(chatId, '❌ Введи число від 0 до 100 (наприклад 40).');
        return true;
      }
      patch = { groupMode: 'percent_subs', groupPercent: pct };
    } else if (mode === 'fixed_per_attendee') {
      const amt = parseMoney(text);
      if (amt == null) {
        await Helpers.safeSend(chatId, '❌ Введи суму ≥ 0 (наприклад 50).');
        return true;
      }
      patch = { groupMode: 'fixed_per_attendee', groupFixedPerAttendee: amt };
    } else {
      await State.update(chatId, { step: null });
      await showGroupMenu(chatId);
      return true;
    }
    const ok = await supabase.upsertCoachVenueEconomics(chatId, vid, patch);
    await State.update(chatId, { step: null, veconGroupMode: null });
    await Helpers.safeSend(chatId, ok ? '✅ Збережено.' : '❌ Не вдалося зберегти. Перевір міграцію coach_venue_economics.');
    await showVenueCard(chatId, vid);
    return true;
  }
  return false;
}

module.exports = {
  showHub,
  showVenueCard,
  handleCallback,
  handleTextMessage
};
