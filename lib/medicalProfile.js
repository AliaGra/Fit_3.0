/**
 * Медичний профіль — CRUD медичних станів (user_medical_conditions).
 * Вибір за категоріями: таблиця категорій → «Ні» (пропустити) або «Відкрити групу» → список захворювань → ступінь тяжкості.
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const Helpers = require('./helpers');
const User = require('./user');
const supabase = require('./supabase');
const { codeToName, severityToLabel, normalizeCode, MEDICAL_NAMES_UK } = require('./medicalDecode');
const { filterExerciseForUser } = require('./medicalFilter');

const VALID_MC_CODES = Object.keys(MEDICAL_NAMES_UK);

/** Категорії медичних станів (розшифровка для користувача). nameUA — для кнопок (коротко), nameUAFull — для заголовків. */
const MC_CATEGORIES = Object.freeze([
  { id: 'joints', nameUA: 'Суглоби та спина', codes: ['MC001', 'MC002', 'MC003', 'MC015', 'MC016', 'MC019', 'MC020', 'MC021'] },
  { id: 'cardio', nameUA: 'Серце і тиск', codes: ['MC004', 'MC012'] },
  { id: 'metabolic', nameUA: 'Обмін речовин', codes: ['MC005', 'MC018', 'MC025'] },
  { id: 'respiratory', nameUA: 'Дихання', codes: ['MC006'] },
  { id: 'veins', nameUA: 'Вени', codes: ['MC007'] },
  { id: 'bones', nameUA: 'Кістки', codes: ['MC008'] },
  { id: 'pregnancy', nameUA: 'Вагітність і пологи', codes: ['MC009', 'MC010'] },
  { id: 'abdomen', nameUA: 'Живіт і прес', codes: ['MC011', 'MC013', 'MC014'] },
  { id: 'neuro', nameUA: 'Нервова система', codes: ['MC017'] },
  { id: 'eye', nameUA: 'Зір', codes: ['MC022', 'MC023'] },
  { id: 'other', nameUA: 'Інше', codes: ['MC024'] }
]);

function getCategoryById(id) {
  return MC_CATEGORIES.find((c) => c.id === id);
}

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
    text += 'Медичних станів не додано. Натисни «➕ Додати стан» — оберіть категорію, потім захворювання та ступінь тяжкості.';
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

/** Старт додавання стану: показати таблицю категорій. */
async function startAddCondition(chatId, targetChatId) {
  await showCategoryList(chatId, targetChatId);
}

/** Екран вибору категорії: для кожної — «Ні» (пропустити) або «Відкрити групу». */
async function showCategoryList(chatId, targetChatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.MC_PROFILE_VIEW, medicalProfileTarget: targetChatId });

  let text = '🩺 **Оберіть категорію**\n\n';
  text += '• **Ні** — у учня немає станів з цієї категорії (нічого не додаємо).\n';
  text += '• **Відкрити групу** — перейти до списку захворювань та обрати стан і ступінь тяжкості.';

  const keyboard = [];
  for (const cat of MC_CATEGORIES) {
    keyboard.push([
      { text: cat.nameUA + ' — Ні', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_SKIP + ':' + cat.id + ':' + targetChatId },
      { text: cat.nameUA + ' — Відкрити', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_OPEN + ':' + cat.id + ':' + targetChatId }
    ]);
  }
  keyboard.push([{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + targetChatId }]);

  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
}

/** Список захворювань у категорії (розшифровані назви). */
async function showConditionListForCategory(chatId, targetChatId, categoryId) {
  const cat = getCategoryById(categoryId);
  if (!cat) {
    await Helpers.safeSend(chatId, '❌ Категорію не знайдено.');
    await showCategoryList(chatId, targetChatId);
    return;
  }

  await State.set(chatId, { step: CONSTANTS.FSM_STATES.MC_PROFILE_VIEW, medicalProfileTarget: targetChatId });

  let text = '🩺 **' + cat.nameUA + '**\n\nОбери захворювання (далі — ступінь тяжкості):';

  const keyboard = [];
  for (const code of cat.codes) {
    const name = codeToName(code) || code;
    const btnText = name.length > 35 ? name.slice(0, 32) + '…' : name;
    keyboard.push([{ text: btnText, callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_CONDITION + ':' + code + ':' + targetChatId }]);
  }
  keyboard.push([{ text: '🔙 До категорій', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_ADD + ':' + targetChatId }]);

  await Helpers.sendKeyboard(chatId, text, keyboard, { parse_mode: 'Markdown' });
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

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_SKIP && params.length >= 2) {
    const targetChatId = params.slice(1).join(':').trim();
    const categoryId = params[0].trim();
    const cat = getCategoryById(categoryId);
    await Helpers.safeSend(chatId, cat ? 'Ок, категорію «' + cat.nameUA + '» пропущено.' : 'Ок.');
    await showCategoryList(chatId, targetChatId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_OPEN && params.length >= 2) {
    const categoryId = params[0].trim();
    const targetChatId = params.slice(1).join(':').trim();
    await showConditionListForCategory(chatId, targetChatId, categoryId);
    return true;
  }

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_CONDITION && params.length >= 2) {
    const mcCode = params[0].trim();
    const targetChatId = params.slice(1).join(':').trim();
    if (!VALID_MC_CODES.includes(mcCode)) {
      await Helpers.safeSend(chatId, '❌ Невірний код стану.');
      return true;
    }
    await askSeverity(chatId, targetChatId, mcCode);
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
      await checkActivePlanAfterMcChange(targetChatId);
      await Helpers.safeSend(chatId, '✅ Додано: ' + (codeToName(mcCode) || mcCode) + ' — ' + (severityToLabel(severityKey) || severityKey) + '\n\nДодати ще? Оберіть категорію або натисніть Готово.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати (можливо, такий стан вже є у профілі).');
    }
    await showCategoryList(chatId, targetChatId);
    return true;
  }

  return false;
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state) return false;

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
      await checkActivePlanAfterMcChange(targetChatId);
      await Helpers.safeSend(chatId, '✅ Додано: ' + (codeToName(mcCode) || mcCode) + ' — ' + severityRaw + '\n\nДодати ще? Оберіть категорію або натисніть Готово.');
    } else {
      await Helpers.safeSend(chatId, '❌ Не вдалося додати (можливо, такий стан вже є у профілі).');
    }
    await showCategoryList(chatId, targetChatId);
    return true;
  }

  return false;
}

/** Після зміни медичного стану: перевірити активний план учня; при BLOCKED вправах — деактивувати план, лог у plan_adjustments, сповістити тренера (Логіка 9.3, ТЗ 8.4). */
async function checkActivePlanAfterMcChange(targetChatId) {
  try {
    const plan = await supabase.getActivePlanForStudent(targetChatId);
    if (!plan || !plan.planId) return;

    const fullPlan = await supabase.getPlanWithExercises(plan.planId);
    if (!fullPlan || !fullPlan.exercises || !fullPlan.exercises.length) return;

    const userMedConditions = await supabase.getActiveMedicalConditions(targetChatId);
    const blocked = [];

    for (const ex of fullPlan.exercises) {
      const fullEx = await supabase.getExerciseDetailById(ex.exerciseId);
      if (!fullEx) continue;
      const res = filterExerciseForUser(fullEx, userMedConditions);
      if (res.status === 'BLOCKED') blocked.push({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName || 'Вправа' });
    }

    if (blocked.length === 0) return;

    await supabase.deactivatePlan(plan.planId);
    await supabase.insertPlanAdjustment({
      planId: plan.planId,
      newPlanId: null,
      adjustmentType: 'mc_change',
      details: { blockedExercises: blocked.map((b) => b.exerciseId), reason: 'Зміна медичного профілю: в плані є вправи, протипоказані за новими станами.' }
    });

    const student = await User.getByChatId(targetChatId);
    const coachChatId = student && student.coachId ? String(student.coachId) : null;
    if (coachChatId) {
      const names = blocked.map((b) => b.exerciseName).slice(0, 5).join(', ');
      const more = blocked.length > 5 ? ' та інші' : '';
      await Helpers.safeSend(
        coachChatId,
        '⚠️ Медичний профіль учня змінено. У його активному плані є протипоказані вправи: ' + names + more + '.\nПлан деактивовано. Призначте учню новий план або відредагуйте поточний.'
      );
    }
  } catch (e) {
    console.error('medicalProfile checkActivePlanAfterMcChange', e.message, e.stack);
  }
}

module.exports = {
  showMedicalProfile,
  handleCallback,
  handleTextMessage,
  checkActivePlanAfterMcChange,
  MC_CATEGORIES,
  getCategoryById,
  VALID_MC_CODES
};
