/**
 * Медичний профіль — CRUD медичних станів (user_medical_conditions).
 * Логіка складання плану тренувань.md: тренер додає/видаляє MC-коди + severity для учня.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const { codeToName, severityToLabel, normalizeCode, MEDICAL_NAMES_UK } = require('./medicalDecode');

const VALID_MC_CODES = Object.keys(MEDICAL_NAMES_UK);

/** Відкрити екран медичного профілю для targetChatId (учень). Тренер (chatId) переглядає/редагує. */
async function showMedicalProfile(chatId, targetChatId) {
  const coach = await User.getByChatId(chatId);
  if (!coach || coach.role !== CONSTANTS.ROLES.COACH) {
    await Helpers.safeSend(chatId, '⛔ Доступ тільки для тренера.');
    return;
  }
  const student = await User.getByChatId(targetChatId);
  if (!student || String(student.coachId) !== String(chatId)) {
    await Helpers.safeSend(chatId, '❌ Учня не знайдено або доступ заборонено.');
    return;
  }

  const list = await supabase.getMedicalConditionsList(targetChatId);
  const activeList = list.filter((r) => r.is_active);
  const studentName = (student.firstName || '') + ' ' + (student.lastName || '').trim() || 'Учень';

  let text = '🩺 **Медичний профіль: ' + studentName + '**\n\n';
  if (activeList.length === 0) {
    text += 'Медичних станів не додано. Натисни «➕ Додати стан», щоб додати код (MC001–MC025) та ступінь тяжкості.';
  } else {
    text += 'Активні стани:\n';
    for (const row of activeList) {
      const name = codeToName(row.mc_code) || row.mc_code;
      const sevLabel = severityToLabel(row.severity) || row.severity;
      text += '• ' + name + ' — ' + sevLabel + '\n';
    }
  }

  const keyboard = [];
  keyboard.push([{ text: '➕ Додати стан', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_ADD + ':' + targetChatId }]);
  for (const row of activeList) {
    const shortLabel = (codeToName(row.mc_code) || row.mc_code).slice(0, 20) + ' — 🗑';
    keyboard.push([{ text: shortLabel, callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_REMOVE + ':' + row.id + ':' + targetChatId }]);
  }
  keyboard.push([{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + targetChatId }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);

  await State.set(chatId, { step: CONSTANTS.FSM_STATES.MC_PROFILE_VIEW, medicalProfileTarget: targetChatId });
  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Старт додавання стану: запит коду. */
async function startAddCondition(chatId, targetChatId) {
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.MC_ADD_CODE,
    medicalProfileTarget: targetChatId
  });
  await Helpers.safeSend(chatId, '🩺 Введіть код медичного стану (наприклад MC001, MC003):\n\nДопустимі коди: MC001–MC025.');
}

/** Показати вибір severity і зберегти код у state. */
async function askSeverity(chatId, targetChatId, mcCode) {
  await State.set(chatId, {
    step: CONSTANTS.FSM_STATES.MC_ADD_SEVERITY,
    medicalProfileTarget: targetChatId,
    mcAddCode: mcCode
  });
  const keyboard = [
    [{ text: 'Легка (mild)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':mild:' + targetChatId }, { text: 'Помірна (moderate)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':moderate:' + targetChatId }],
    [{ text: 'Тяжка (severe)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':severe:' + targetChatId }],
    [{ text: 'Стадія 1', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':stage1:' + targetChatId }, { text: 'Стадія 2', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':stage2:' + targetChatId }, { text: 'Стадія 3', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':stage3:' + targetChatId }],
    [{ text: 'Гострий (acute)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':acute:' + targetChatId }, { text: 'Хронічна (chronic)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':chronic:' + targetChatId }],
    [{ text: 'Інше (ввести текстом)', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY + ':__other__:' + targetChatId }]
  ];
  const name = codeToName(mcCode) || mcCode;
  await Helpers.sendKeyboard(chatId, '🩺 Обрано: **' + name + '**\n\nОберіть ступінь тяжкості:', keyboard, { parse_mode: 'Markdown' });
}

async function handleCallback(chatId, callbackData) {
  const action = String(callbackData || '').split(':')[0].trim();
  const params = String(callbackData || '').split(':').slice(1);

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_PROFILE && params.length > 0) {
    const targetChatId = params.join(':').trim();
    await showMedicalProfile(chatId, targetChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_ADD && params.length > 0) {
    const targetChatId = params.join(':').trim();
    await startAddCondition(chatId, targetChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_REMOVE && params.length >= 2) {
    const id = params[0].trim();
    const targetChatId = params.slice(1).join(':').trim();
    const coach = await User.getByChatId(chatId);
    if (!coach || coach.role !== CONSTANTS.ROLES.COACH) return false;
    const student = await User.getByChatId(targetChatId);
    if (!student || String(student.coachId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Доступ заборонено.');
      return true;
    }
    const ok = await supabase.removeMedicalCondition(id);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ Медичний стан видалено.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося видалити.');
    }
    await showMedicalProfile(chatId, targetChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY && params.length >= 2) {
    const severityKey = params[0].trim();
    const targetChatId = params.slice(1).join(':').trim();
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.MC_ADD_SEVERITY || state.medicalProfileTarget !== targetChatId) {
      await Helpers.safeSend(chatId, '⚠️ Сесія змінилась. Поверніться до картки учня і відкрийте медичний профіль знову.');
      return true;
    }
    if (severityKey === '__other__') {
      await State.set(chatId, { ...state, step: CONSTANTS.FSM_STATES.MC_ADD_SEVERITY_CUSTOM });
      await Helpers.safeSend(chatId, 'Введіть ступінь тяжкості текстом (наприклад class1, trimester2, type1):');
      return true;
    }
    const mcCode = state.mcAddCode;
    const ok = await supabase.insertMedicalCondition(targetChatId, mcCode, severityKey, null);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ Медичний стан додано: ' + (codeToName(mcCode) || mcCode) + ' — ' + (severityToLabel(severityKey) || severityKey));
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати (можливо, такий стан вже є у профілі).');
    }
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.MC_PROFILE_VIEW });
    await showMedicalProfile(chatId, targetChatId);
    return true;
  }

  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state) return false;

  if (state.step === CONSTANTS.FSM_STATES.MC_ADD_CODE) {
    const targetChatId = state.medicalProfileTarget;
    const raw = String(text || '').trim();
    const code = normalizeCode(raw);
    if (!code || !VALID_MC_CODES.includes(code)) {
      await Helpers.safeSend(chatId, '⚠️ Невірний код. Введіть MC001–MC025 (наприклад MC003):');
      return true;
    }
    await askSeverity(chatId, targetChatId, code);
    return true;
  }

  if (state.step === CONSTANTS.FSM_STATES.MC_ADD_SEVERITY_CUSTOM) {
    const targetChatId = state.medicalProfileTarget;
    const mcCode = state.mcAddCode;
    const severityRaw = String(text || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!severityRaw) {
      await Helpers.safeSend(chatId, 'Введіть ступінь тяжкості (наприклад stage1, chronic):');
      return true;
    }
    const ok = await supabase.insertMedicalCondition(targetChatId, mcCode, severityRaw, null);
    if (ok) {
      await Helpers.safeSend(chatId, '✅ Медичний стан додано: ' + (codeToName(mcCode) || mcCode) + ' — ' + severityRaw);
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати (можливо, такий стан вже є у профілі).');
    }
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.MC_PROFILE_VIEW });
    await showMedicalProfile(chatId, targetChatId);
    return true;
  }

  return false;
}

module.exports = {
  showMedicalProfile,
  handleCallback,
  handleTextMessage
};
