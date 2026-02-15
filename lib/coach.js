/**
 * Coach — Мої учні (список, профіль учня), Тренування учнів (заглушка).
 * Callback: COACH_STUDENTS, VIEW_STUDENT:id, COACH_ADD_STUDENT, TRAINING_COACH_START, COACH_TRAIN:id, COACH_HISTORY:id, COACH_BOOK:id
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');

function getGoalText(goal) {
  if (!goal) return 'не вказано';
  if (goal === CONSTANTS.GOALS.LOSE) return 'Схуднути';
  if (goal === CONSTANTS.GOALS.GAIN) return 'Набрати масу';
  if (goal === CONSTANTS.GOALS.KEEP) return 'Підтримувати форму';
  return goal;
}

async function showStudentsList(chatId) {
  try {
    const me = await User.getByChatId(chatId);
    if (!me || me.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '👥 Список учнів доступний тільки тренерам.');
      return;
    }
    const students = await User.getStudentsByCoach(chatId);
    if (!students || students.length === 0) {
      const keyboard = [
        [{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }],
        [{ text: CONSTANTS.EMOJI.HOME + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
      ];
      await Helpers.sendKeyboard(chatId, '📋 У тебе поки немає учнів.\n\nДодай першого учня:', keyboard);
      return;
    }
    const keyboard = [];
    for (const student of students) {
      const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
      const isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
      const status = isInvite ? '⏳ Очікує' : '✅ Активний';
      keyboard.push([{ text: name + ' (' + status + ')', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + student.chatId }]);
    }
    keyboard.push([{ text: '💰 Вартість тренувань', callback_data: CONSTANTS.CALLBACKS.PRICING_MENU }]);
    keyboard.push([{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Назад', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    await Helpers.sendKeyboard(chatId, '👥 Твої учні (' + students.length + '):\n\nОбери учня або дію:', keyboard);
  } catch (err) {
    console.error('Coach.showStudentsList', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження списку учнів.');
  }
}

async function showStudentProfile(chatId, studentChatId) {
  try {
    const student = await User.getByChatId(studentChatId);
    if (!student) {
      await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
      return;
    }
    if (String(student.coachId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '⛔ Доступ заборонено.');
      return;
    }
    let message = '👤 **Профіль учня**\n\n';
    message += "Ім'я: " + (student.firstName || '') + ' ' + (student.lastName || '') + '\n';
    message += 'Місто: ' + (student.city || 'не вказано') + '\n';
    message += 'Стать: ' + (student.gender === CONSTANTS.GENDERS.MALE ? 'Чоловік' : student.gender === CONSTANTS.GENDERS.FEMALE ? 'Жінка' : 'не вказано') + '\n';
    message += 'Вік: ' + (student.age != null ? student.age : 'не вказано') + ' років\n';
    message += 'Мета: ' + getGoalText(student.goal) + '\n';
    const experienceLabel = Helpers.getExperienceStatusLabel(student);
    message += '📅 **Досвід:** ' + experienceLabel + '\n\n';
    if (student.height) message += '📏 Зріст: ' + student.height + ' см\n';
    if (student.weight) message += '⚖️ Вага: ' + student.weight + ' кг\n';
    let pricing = await supabase.getStudentPricing(chatId, studentChatId);
    if (!pricing) pricing = await supabase.getCoachPricing(chatId);
    if (pricing) {
      message += '\n💰 **Вартість тренувань:**\n';
      const cur = (pricing.currency || 'UAH').toString();
      if (pricing.pricePersonal != null && pricing.pricePersonal !== '') message += '• Персональна: ' + pricing.pricePersonal + ' ' + cur + '\n';
      if (pricing.priceSplit != null && pricing.priceSplit !== '') message += '• Спліт: ' + pricing.priceSplit + ' ' + cur + '\n';
      if (pricing.priceTrio != null && pricing.priceTrio !== '') message += '• Тріо: ' + pricing.priceTrio + ' ' + cur + '\n';
      if (pricing.defaultTrainingType) {
        const typeLabel = pricing.defaultTrainingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'Персональна' : (pricing.defaultTrainingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'Спліт' : 'Тріо');
        message += '🎯 **Тип за замовчуванням:** ' + typeLabel + '\n';
      }
    }
    const isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
    if (isInvite) {
      message += '\n⏳ Статус: Очікує активації\nКод для копіювання — у повідомленні нижче 👇';
    } else {
      message += '\n✅ Статус: Активний';
    }
    const kbd = [
      [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN + ':' + studentChatId }],
      [{ text: '🎯 Тип тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE + ':' + studentChatId }, { text: '💰 Вартість', callback_data: CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT + ':' + studentChatId }],
      [{ text: '📅 Досвід', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE + ':' + studentChatId }],
      [{ text: '📊 Історія', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY + ':' + studentChatId }, { text: '📅 Записати', callback_data: CONSTANTS.CALLBACKS.COACH_BOOK + ':' + studentChatId }],
      [{ text: '🔙 До списку', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]
    ];
    await Helpers.sendKeyboard(chatId, message, kbd);
    if (isInvite && student.userId) {
      await Helpers.safeSend(chatId, student.userId);
    }
  } catch (err) {
    console.error('Coach.showStudentProfile', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження профілю.');
  }
}

async function showPricingMenu(chatId) {
  const keyboard = [
    [{ text: '📋 Тариф за замовчуванням', callback_data: CONSTANTS.CALLBACKS.PRICING_SET_DEFAULT }],
    [{ text: '👤 Індивідуально для учня', callback_data: CONSTANTS.CALLBACKS.PRICING_SET_INDIVIDUAL }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]
  ];
  await Helpers.sendKeyboard(chatId, '💰 **Вартість тренувань**\n\nОбери, що налаштувати:', keyboard, { parse_mode: 'Markdown' });
}

async function showPricingTypeSelect(chatId, studentChatId) {
  const keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_TRIO }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: studentChatId ? CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId : CONSTANTS.CALLBACKS.COACH_STUDENTS }]
  ];
  await Helpers.sendKeyboard(chatId, '💰 Обери вид тренування для введення вартості:', keyboard);
}

async function showPricingStudentSelect(chatId) {
  const students = await User.getStudentsByCoach(chatId);
  if (!students || students.length === 0) {
    await Helpers.safeSend(chatId, '📋 У тебе поки немає учнів.');
    await showStudentsList(chatId);
    return;
  }
  const keyboard = students.map((s) => [{ text: (s.firstName || '') + ' ' + (s.lastName ? ' ' + s.lastName : '').trim(), callback_data: CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT + ':' + s.chatId }]);
  keyboard.push([{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]);
  await Helpers.sendKeyboard(chatId, '💰 Обери учня для індивідуальної вартості:', keyboard);
}

async function handlePricingAmountInput(chatId, text) {
  const state = await State.get(chatId) || {};
  const amount = parseInt(String(text).trim().replace(/\s/g, ''), 10);
  if (isNaN(amount)) {
    await Helpers.safeSend(chatId, '⚠️ Введіть ціле число.');
    return;
  }
  const minP = CONSTANTS.VALIDATION.PRICE_MIN != null ? CONSTANTS.VALIDATION.PRICE_MIN : 0;
  const maxP = CONSTANTS.VALIDATION.PRICE_MAX != null ? CONSTANTS.VALIDATION.PRICE_MAX : 999999;
  if (amount < minP) {
    await Helpers.safeSend(chatId, '⚠️ Мінімум: ' + minP + ' грн.');
    return;
  }
  if (amount > maxP) {
    await Helpers.safeSend(chatId, '⚠️ Сума занадто велика. Максимум: ' + maxP);
    return;
  }
  const pricingType = state.pricingType || CONSTANTS.TRAINING_TYPES.PERSONAL;
  const pricingStudentId = state.pricingStudentId != null ? String(state.pricingStudentId) : '';
  const currency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) ? CONSTANTS.PRICING.DEFAULT_CURRENCY : 'UAH';
  let current = pricingStudentId ? await supabase.getStudentPricing(chatId, pricingStudentId) : await supabase.getCoachPricing(chatId);
  if (!current) current = { pricePersonal: '', priceSplit: '', priceTrio: '', currency };
  if (pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL) current.pricePersonal = amount;
  else if (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT) current.priceSplit = amount;
  else current.priceTrio = amount;
  const ok = await supabase.setPricing(chatId, pricingStudentId || null, current);
  await State.clear(chatId);
  const typeName = pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'персональної' : (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'спліт' : 'тріо');
  if (ok) {
    await Helpers.safeSend(chatId, '✅ Вартість ' + typeName + ' встановлено: ' + amount + ' ' + currency);
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  await showStudentsList(chatId);
}

async function showStudentTrainingTypeSelect(chatId, studentChatId) {
  const keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_PERSONAL + ':' + studentChatId }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_SPLIT + ':' + studentChatId }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_TRIO + ':' + studentChatId }],
    [{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Обери тип тренування за замовчуванням для цього учня:', keyboard);
}

async function saveDefaultTrainingType(chatId, studentChatId, trainingType) {
  let current = await supabase.getStudentPricing(chatId, studentChatId);
  if (!current) current = await supabase.getCoachPricing(chatId);
  if (!current) current = { pricePersonal: '', priceSplit: '', priceTrio: '', currency: (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH' };
  current.defaultTrainingType = trainingType;
  await supabase.setPricing(chatId, studentChatId, current);
  const label = trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'Персональна' : (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'Спліт' : 'Тріо');
  await Helpers.safeSend(chatId, '✅ Тип тренування за замовчуванням встановлено: ' + label);
  await showStudentProfile(chatId, studentChatId);
}

async function showStudentExperienceSelect(chatId, studentChatId) {
  const keyboard = [
    [{ text: '0-3 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_0_3 + ':' + studentChatId }],
    [{ text: '4-6 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_4_6 + ':' + studentChatId }],
    [{ text: '6-12 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_6_12 + ':' + studentChatId }],
    [{ text: 'Більше року', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_MORE_YEAR + ':' + studentChatId }],
    [{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '📅 Встановити рівень досвіду учня. Від обраної дати статус буде оновлюватися автоматично; після 366 днів від реєстрації — «Більше року».', keyboard);
}

async function setStudentExperience(chatId, studentChatId, level) {
  const now = new Date();
  let experienceStartDate;
  let label;
  if (level === '0-3') {
    experienceStartDate = now;
    label = '0-3 м-ців';
  } else if (level === '4-6') {
    experienceStartDate = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
    label = '4-6 м-ців';
  } else if (level === '6-12') {
    experienceStartDate = new Date(now.getTime() - 181 * 24 * 60 * 60 * 1000);
    label = '6-12 м-ців';
  } else {
    experienceStartDate = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
    label = 'Більше року';
  }
  const ok = await supabase.updateUser(studentChatId, { experienceStartDate });
  if (ok) {
    await Helpers.safeSend(chatId, '✅ Досвід учня встановлено: ' + label + '. Статус буде оновлюватися автоматично.');
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  await showStudentProfile(chatId, studentChatId);
}

async function handleCallback(chatId, callbackData) {
  if (!callbackData || String(callbackData).trim() === '') return false;
  const parts = String(callbackData).split(':');
  const action = parts[0].trim();
  const param = parts.slice(1).join(':').trim();

  if (action === CONSTANTS.CALLBACKS.COACH_STUDENTS) {
    await showStudentsList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_MENU) {
    await showPricingMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_SET_DEFAULT || action === CONSTANTS.CALLBACKS.PRICING_CHANGE) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_TYPE_SELECT, pricingStudentId: '' });
    await showPricingTypeSelect(chatId, null);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_SET_INDIVIDUAL) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_SELECT_STUDENT });
    await showPricingStudentSelect(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_PERSONAL) {
    await State.set(chatId, { ...(await State.get(chatId)), pricingType: CONSTANTS.TRAINING_TYPES.PERSONAL, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    await Helpers.safeSend(chatId, '💰 Введіть вартість персональної тренування (ціле число, грн):');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_SPLIT) {
    await State.set(chatId, { ...(await State.get(chatId)), pricingType: CONSTANTS.TRAINING_TYPES.SPLIT, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    await Helpers.safeSend(chatId, '💰 Введіть вартість тренування спліт (ціле число, грн):');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.PRICING_TYPE_TRIO) {
    await State.set(chatId, { ...(await State.get(chatId)), pricingType: CONSTANTS.TRAINING_TYPES.TRIO, step: CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT });
    await Helpers.safeSend(chatId, '💰 Введіть вартість тренування тріо (ціле число, грн):');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT && param) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_TYPE_SELECT, pricingStudentId: param.trim() });
    await showPricingTypeSelect(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE && param) {
    await showStudentTrainingTypeSelect(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_PERSONAL && param) {
    await saveDefaultTrainingType(chatId, param.trim(), CONSTANTS.TRAINING_TYPES.PERSONAL);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_SPLIT && param) {
    await saveDefaultTrainingType(chatId, param.trim(), CONSTANTS.TRAINING_TYPES.SPLIT);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_TYPE_TRIO && param) {
    await saveDefaultTrainingType(chatId, param.trim(), CONSTANTS.TRAINING_TYPES.TRIO);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE && param) {
    await showStudentExperienceSelect(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_0_3 && param) {
    await setStudentExperience(chatId, param.trim(), '0-3');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_4_6 && param) {
    await setStudentExperience(chatId, param.trim(), '4-6');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_6_12 && param) {
    await setStudentExperience(chatId, param.trim(), '6-12');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE_MORE_YEAR && param) {
    await setStudentExperience(chatId, param.trim(), 'more_year');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_START) {
    const Training = require('./training');
    await Training.startCoachTrainingFlow(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_ADD_STUDENT) {
    await askStudentName(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT && param) {
    await showStudentProfile(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN && param) {
    const Training = require('./training');
    await Training.startCoachTrainingForStudent(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY && param) {
    await Helpers.safeSend(chatId, '📊 Історія тренувань учня ще в розробці на новому боті.');
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_BOOK && param) {
    const Schedule = require('./schedule');
    await Schedule.startBookStudent(chatId, param.trim());
    return true;
  }
  return false;
}

async function askStudentName(chatId) {
  await State.set(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_NAME });
  await Helpers.safeSend(chatId, "➕ Додавання нового учня\n\nВведи ім'я та прізвище учня одним повідомленням:\n\nФормат: Ім'я Прізвище\nПриклад: Марія Коваль");
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  if (state.step === CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT) {
    await handlePricingAmountInput(chatId, text);
    return true;
  }
  if (state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_NAME) return false;
  const fullName = String(text).trim();
  const parts = fullName.split(/\s+/);
  if (parts.length < 2) {
    await Helpers.safeSend(chatId, "⚠️ Введи ім'я та прізвище учня одним повідомленням.\n\nФормат: Ім'я Прізвище\nПриклад: Марія Коваль\n\nСпробуй ще раз:");
    return true;
  }
  const first = parts[0];
  const last = parts.slice(1).join(' ');
  try {
    const inviteCode = await User.createStudentByInvite(chatId, first, last);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, "✅ Учня створено!\n\nПередай йому цей код доступу:\n" + inviteCode + "\n\nКоли він введе його у боті (У мене є код), його профіль автоматично прив'яжеться до тебе.");
    await showStudentsList(chatId);
  } catch (err) {
    console.error('Coach.createStudentByInvite', err.message);
    await Helpers.safeSend(chatId, "❌ Помилка створення учня:\n" + err.message + "\n\nСпробуй ще раз.");
  }
  return true;
}

module.exports = { showStudentsList, showStudentProfile, handleCallback, handleTextMessage, askStudentName, getGoalText };
