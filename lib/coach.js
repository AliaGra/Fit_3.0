/**
 * Coach — Мої учні (список, профіль учня), Тренування учнів (заглушка).
 * Callback: COACH_STUDENTS, VIEW_STUDENT:id, COACH_ADD_STUDENT, TRAINING_COACH_START, COACH_TRAIN:id, COACH_HISTORY:id, COACH_BOOK:id
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');
const supabase = require('./supabase');
const { MC_CATEGORIES, getCategoryById, VALID_MC_CODES } = require('./medicalProfile');
const { codeToName } = require('./medicalDecode');

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
        [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
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
    keyboard.push([{ text: '➕ Додати учня', callback_data: CONSTANTS.CALLBACKS.COACH_ADD_STUDENT }]);
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
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
    message += '📅 **Досвід:** ' + experienceLabel + '\n';
    const daysLabel = student.trainingDaysPerWeek != null ? student.trainingDaysPerWeek + ' дн./тиж.' : 'не вказано';
    message += '📆 **Тренувань на тиждень:** ' + daysLabel + '\n';
    if (student.activePlanId) {
      message += '🎯 **Активний план:** призначено\n';
    }
    message += '\n';
    if (student.height) message += '📏 Зріст: ' + student.height + ' см\n';
    if (student.weight) message += '⚖️ Вага: ' + student.weight + ' кг\n';
    let pricing = await supabase.getStudentPricing(chatId, studentChatId);
    if (!pricing) pricing = await supabase.getCoachPricing(chatId);
    const trainingType = (pricing && pricing.defaultTrainingType) ? pricing.defaultTrainingType : CONSTANTS.TRAINING_TYPES.PERSONAL;
    const typeLabel = trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'Персональна' : (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'Спліт' : 'Тріо');
    const currentPrice = await supabase.getCurrentPrice(chatId, studentChatId, trainingType);
    if (currentPrice && currentPrice.price != null) {
      message += '\n💰 **Вартість тренування:** ' + typeLabel + ' — ' + currentPrice.price + ' ' + (currentPrice.currency || 'UAH') + '\n';
    } else if (pricing) {
      message += '\n💰 **Вартість тренування:** не вказано\n';
    }
    const isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
    if (isInvite) {
      message += '\n⏳ Статус: Очікує активації\nКод для копіювання — у повідомленні нижче 👇';
    } else {
      message += '\n✅ Статус: Активний';
    }
    const kbd = [
      [{ text: '📅 Записати', callback_data: CONSTANTS.CALLBACKS.COACH_BOOK + ':' + studentChatId }, { text: '📋 План тренувань', callback_data: CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST + ':' + studentChatId }],
      [{ text: '📊 Історія тренувань', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY + ':' + studentChatId }],
      [{ text: '📆 Кількість днів тренування в неділю', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS + ':' + studentChatId }],
      [{ text: '💰 Індівідуальний тариф', callback_data: CONSTANTS.CALLBACK_PREFIXES.PRICING_STUDENT + ':' + studentChatId }, { text: '🎯 Тип тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_TRAINING_TYPE + ':' + studentChatId }],
      [{ text: '📅 Досвід', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_EXPERIENCE + ':' + studentChatId }, { text: '🩺 Медичний профіль', callback_data: CONSTANTS.CALLBACK_PREFIXES.MC_PROFILE + ':' + studentChatId }],
      [{ text: '📦 Архівувати профіль', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_ARCHIVE_STUDENT + ':' + studentChatId }],
      [{ text: '🔙 До списку', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
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

async function showArchivedList(chatId) {
  try {
    const me = await User.getByChatId(chatId);
    if (!me || me.role !== CONSTANTS.ROLES.COACH) {
      await Helpers.safeSend(chatId, '📦 Архів доступний тільки тренерам.');
      return;
    }
    const students = await supabase.getArchivedStudentsByCoachId(chatId);
    const keyboard = [];
    for (const student of students) {
      const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
      keyboard.push([{ text: name, callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_ARCHIVED_STUDENT + ':' + student.chatId }]);
    }
    keyboard.push([{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]);
    if (students.length === 0) {
      await Helpers.sendKeyboard(chatId, '📦 **Архів учнів**\n\nТут з\'являться учні, яких ти архівував. Поки порожньо.', keyboard, { parse_mode: 'Markdown' });
    } else {
      await Helpers.sendKeyboard(chatId, '📦 **Архів учнів** (' + students.length + '):\n\nОбери учня:', keyboard, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('Coach.showArchivedList', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження архіву.');
  }
}

async function archiveStudent(chatId, studentChatId) {
  try {
    const student = await User.getByChatId(studentChatId);
    if (!student || String(student.coachId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
      return;
    }
    await supabase.updateUser(studentChatId, { isArchived: true });
    const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
    await Helpers.safeSend(chatId, '✅ Профіль учня **' + name + '** архівовано. Він більше не відображатиметься в списку «Мої учні». Усі дані збережено. Переглянути можна в «Архів учнів».', { parse_mode: 'Markdown' });
    await showStudentsList(chatId);
  } catch (err) {
    console.error('Coach.archiveStudent', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка архівування.');
  }
}

async function showArchivedStudentCard(chatId, studentChatId) {
  try {
    const student = await User.getByChatId(studentChatId);
    if (!student || String(student.coachId) !== String(chatId) || !student.isArchived) {
      await Helpers.safeSend(chatId, '❌ Учня не знайдено в архіві.');
      await showArchivedList(chatId);
      return;
    }
    const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
    const keyboard = [
      [{ text: '✅ Активувати профіль', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_ACTIVATE_STUDENT + ':' + studentChatId }],
      [{ text: '🗑 Видалити профіль', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_DELETE_STUDENT + ':' + studentChatId }],
      [{ text: '🔙 До архіву', callback_data: CONSTANTS.CALLBACKS.COACH_ARCHIVE_MENU }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(chatId, '📦 **Архів:** ' + name + '\n\nОбери дію:', keyboard, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Coach.showArchivedStudentCard', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка.');
    await showArchivedList(chatId);
  }
}

async function activateArchivedStudent(chatId, studentChatId) {
  try {
    const student = await User.getByChatId(studentChatId);
    if (!student || String(student.coachId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
      await showArchivedList(chatId);
      return;
    }
    await supabase.updateUser(studentChatId, { isArchived: false });
    const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
    await Helpers.safeSend(chatId, '✅ Профіль учня **' + name + '** активовано. Він знову з\'явиться в списку «Мої учні».', { parse_mode: 'Markdown' });
    await showArchivedList(chatId);
  } catch (err) {
    console.error('Coach.activateArchivedStudent', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка.');
    await showArchivedList(chatId);
  }
}

async function deleteArchivedStudent(chatId, studentChatId) {
  try {
    const student = await User.getByChatId(studentChatId);
    if (!student || String(student.coachId) !== String(chatId)) {
      await Helpers.safeSend(chatId, '❌ Учня не знайдено.');
      await showArchivedList(chatId);
      return;
    }
    const name = (student.firstName || '') + ' ' + (student.lastName || '').trim();
    const isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
    if (isInvite) {
      const ok = await supabase.deleteInviteUserAndAllRelatedData(studentChatId);
      if (!ok) {
        await Helpers.safeSend(chatId, '❌ Помилка видалення даних.');
        await showArchivedList(chatId);
        return;
      }
      await Helpers.safeSend(chatId, '✅ Профіль **' + name + '** (неактивований інвайт) та усі пов’язані дані (тренування, записи в розкладі, плани тощо) видалено з системи.', { parse_mode: 'Markdown' });
    } else {
      await supabase.updateUser(studentChatId, { coachId: null, isArchived: false });
      await Helpers.safeSend(chatId, '✅ Учень **' + name + '** видалено з твого списку. Його профіль більше не прив\'язаний до тебе (дані учня збережено).', { parse_mode: 'Markdown' });
    }
    await showArchivedList(chatId);
  } catch (err) {
    console.error('Coach.deleteArchivedStudent', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка.');
    await showArchivedList(chatId);
  }
}

/** Меню «Мій тренер» для учня та тренера: інфо про тренера (якщо є), Пошук тренера, Ввести інвайт код. */
async function showMyCoachMenu(chatId) {
  try {
    const user = await User.getByChatId(chatId);
    if (!user) {
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    let text = '👨‍🏫 Мій тренер\n\n';
    const coachId = user.coachId || '';
    if (coachId) {
      const coach = await User.getByChatId(coachId);
      if (coach) {
        const name = ((coach.firstName || '') + ' ' + (coach.lastName || '').trim()).trim() || 'Тренер';
        text += "Ім'я: " + name + '\n';
        text += 'Місто: ' + (coach.city || 'не вказано') + '\n';
        if (coach.instagram) text += 'Instagram: ' + coach.instagram + '\n';
        text += '\n';
      }
    }
    const keyboard = [
      [{ text: '🔍 Пошук тренера', callback_data: CONSTANTS.CALLBACKS.COACH_PICK_START }],
      [{ text: '🎟️ Ввести інвайт код', callback_data: CONSTANTS.CALLBACKS.COACH_INVITE_INPUT }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(chatId, text || '👨‍🏫 Мій тренер\n\nОбери дію:', keyboard);
  } catch (err) {
    console.error('Coach.showMyCoachMenu', err.message);
    const Menu = require('./menu');
    await Menu.show(chatId);
  }
}

async function showCoachProfileToStudent(chatId, coachId) {
  try {
    const student = await User.getByChatId(chatId);
    if (!student || student.role !== CONSTANTS.ROLES.STUDENT) {
      await Helpers.safeSend(chatId, '❌ Доступ тільки для учнів.');
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    if (String(student.coachId) !== String(coachId)) {
      await Helpers.safeSend(chatId, '❌ Це не твій тренер.');
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    const coach = await User.getByChatId(coachId);
    if (!coach) {
      await Helpers.safeSend(chatId, '❌ Тренера не знайдено.');
      const Menu = require('./menu');
      await Menu.show(chatId);
      return;
    }
    const name = ((coach.firstName || '') + ' ' + (coach.lastName || '').trim()).trim() || 'Тренер';
    let text = '👨‍🏫 Мій тренер\n\n';
    text += "Ім'я: " + name + '\n';
    text += 'Місто: ' + (coach.city || 'не вказано') + '\n';
    if (coach.instagram) text += 'Instagram: ' + coach.instagram + '\n';
    const keyboard = [
      [{ text: '🔍 Пошук тренера', callback_data: CONSTANTS.CALLBACKS.COACH_PICK_START }],
      [{ text: '🎟️ Ввести інвайт код', callback_data: CONSTANTS.CALLBACKS.COACH_INVITE_INPUT }],
      [{ text: CONSTANTS.EMOJI.HOME + ' Головне меню', callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]
    ];
    await Helpers.sendKeyboard(chatId, text, keyboard);
  } catch (err) {
    console.error('Coach.showCoachProfileToStudent', err.message);
    const Menu = require('./menu');
    await Menu.show(chatId);
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
  const state = await State.get(chatId) || {};
  const returnToProfile = !!state.returnToProfile;
  const backCallback = returnToProfile
    ? CONSTANTS.CALLBACKS.BACK_TO_PROFILE
    : (studentChatId ? CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId : CONSTANTS.CALLBACKS.COACH_STUDENTS);
  const keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACKS.PRICING_TYPE_TRIO }],
    [{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: backCallback }]
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
  const pricingStudentId = state.pricingStudentId != null ? String(state.pricingStudentId) : '';
  const isIndividual = pricingStudentId.length > 0;
  const minP = isIndividual ? 10 : (CONSTANTS.VALIDATION.PRICE_MIN != null ? CONSTANTS.VALIDATION.PRICE_MIN : 0);
  const maxP = isIndividual ? 9999 : (CONSTANTS.VALIDATION.PRICE_MAX != null ? CONSTANTS.VALIDATION.PRICE_MAX : 999999);
  if (amount < minP) {
    await Helpers.safeSend(chatId, isIndividual ? '⚠️ Введіть суму від 10 до 9999 грн (2–4 цифри).' : '⚠️ Мінімум: ' + minP + ' грн.');
    return;
  }
  if (amount > maxP) {
    await Helpers.safeSend(chatId, isIndividual ? '⚠️ Введіть суму від 10 до 9999 грн (2–4 цифри).' : '⚠️ Сума занадто велика. Максимум: ' + maxP);
    return;
  }
  const pricingType = state.pricingType || CONSTANTS.TRAINING_TYPES.PERSONAL;
  const currency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) ? CONSTANTS.PRICING.DEFAULT_CURRENCY : 'UAH';
  let current = pricingStudentId ? await supabase.getStudentPricing(chatId, pricingStudentId) : await supabase.getCoachPricing(chatId);
  if (!current) current = { pricePersonal: '', priceSplit: '', priceTrio: '', currency };
  if (pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL) current.pricePersonal = amount;
  else if (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT) current.priceSplit = amount;
  else current.priceTrio = amount;
  const returnToProfile = !!state.returnToProfile;
  const ok = await supabase.setPricing(chatId, pricingStudentId || null, current);
  await State.clear(chatId);
  const typeName = pricingType === CONSTANTS.TRAINING_TYPES.PERSONAL ? 'персональної' : (pricingType === CONSTANTS.TRAINING_TYPES.SPLIT ? 'спліт' : 'тріо');
  if (ok) {
    await Helpers.safeSend(chatId, '✅ Вартість ' + typeName + ' встановлено: ' + amount + ' ' + currency);
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося зберегти. Спробуй ще раз.');
  }
  if (returnToProfile) {
    const Profile = require('./profile');
    await Profile.show(chatId);
  } else {
    await showStudentsList(chatId);
  }
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

async function showStudentTrainingDaysSelect(chatId, studentChatId) {
  const keyboard = [
    [{ text: '2 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS + ':2:' + studentChatId }, { text: '3 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS + ':3:' + studentChatId }],
    [{ text: '4 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS + ':4:' + studentChatId }, { text: '5 днів', callback_data: CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS + ':5:' + studentChatId }],
    [{ text: '🔙 До картки учня', callback_data: CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT + ':' + studentChatId }]
  ];
  await Helpers.sendKeyboard(chatId, '📆 Скільки тренувальних днів на тиждень у учня?', keyboard);
}

async function setStudentTrainingDays(chatId, studentChatId, days) {
  const ok = await supabase.updateUser(studentChatId, { trainingDaysPerWeek: days });
  if (ok) {
    await Helpers.safeSend(chatId, '✅ Тренувальних днів на тиждень встановлено: ' + days + '.');
  } else {
    await Helpers.safeSend(chatId, '❌ Не вдалося оновити.');
  }
  await showStudentProfile(chatId, studentChatId);
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
  if (action === CONSTANTS.CALLBACKS.PROFILE_PRICING) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.PRICING_TYPE_SELECT, pricingStudentId: '', returnToProfile: true });
    await showPricingTypeSelect(chatId, null);
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
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_GENDER && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_GENDER) return false;
    await State.update(chatId, { inviteGender: param.trim() });
    await askStudentGoal(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_GOAL && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_GOAL) return false;
    await State.update(chatId, { inviteGoal: param.trim() });
    await askStudentExperience(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_EXP && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_EXPERIENCE) return false;
    await State.update(chatId, { inviteExperienceLevel: param.trim() });
    await askStudentTrainingTypeForInvite(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_TYPE && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_TRAINING_TYPE) return false;
    await State.update(chatId, { inviteDefaultTrainingType: param.trim() });
    await askStudentTrainingDays(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_DAYS && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_DAYS) return false;
    const days = parseInt(String(param).trim(), 10);
    if (days < 2 || days > 5) {
      await Helpers.safeSend(chatId, '⚠️ Оберіть кількість днів (2–5).');
      return true;
    }
    await State.update(chatId, { inviteTrainingDays: days });
    await askStudentMedicalChoice(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SKIP) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MEDICAL_CHOICE) return false;
    const days = state.inviteTrainingDays != null ? state.inviteTrainingDays : 3;
    await finishCreateStudentByInvite(chatId, state, days, []);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_FILL) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MEDICAL_CHOICE) return false;
    await State.update(chatId, { inviteMedicalConditions: [], step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY });
    await showInviteMedicalCategoryList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_DONE) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY) return false;
    const days = state.inviteTrainingDays != null ? state.inviteTrainingDays : 3;
    const conditions = Array.isArray(state.inviteMedicalConditions) ? state.inviteMedicalConditions : [];
    await finishCreateStudentByInvite(chatId, state, days, conditions);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_SKIP && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY) return false;
    const cat = getCategoryById(param.trim());
    if (cat) await Helpers.safeSend(chatId, 'Ок, категорію «' + cat.nameUA + '» пропущено.');
    await showInviteMedicalCategoryList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_OPEN && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY) return false;
    await showInviteConditionList(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_COND && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY) return false;
    const mcCode = param.trim();
    if (!VALID_MC_CODES.includes(mcCode)) {
      await Helpers.safeSend(chatId, '❌ Невірний код стану.');
      await showInviteMedicalCategoryList(chatId);
      return true;
    }
    await State.update(chatId, { mcAddCode: mcCode, step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_SEVERITY });
    await askInviteSeverity(chatId, mcCode);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV && param) {
    const state = await State.get(chatId);
    if (!state || state.step !== CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_SEVERITY) return false;
    const severityKey = param.trim();
    if (severityKey === '__other__') {
      await Helpers.safeSend(chatId, 'У реєстрації учня можна обрати лише ступінь з кнопок. Інше можна додати пізніше в картці учня.');
      await askInviteSeverity(chatId, state.mcAddCode);
      return true;
    }
    const conditions = Array.isArray(state.inviteMedicalConditions) ? state.inviteMedicalConditions.slice() : [];
    conditions.push({ mc_code: state.mcAddCode, severity: severityKey });
    await State.update(chatId, { inviteMedicalConditions: conditions, step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY });
    await Helpers.safeSend(chatId, '✅ Додано. Можна обрати ще стани з цієї групи або натиснути «До груп».');
    const categoryId = state.inviteMcCategoryId || (() => { const c = MC_CATEGORIES.find((cat) => cat.codes && cat.codes.includes(state.mcAddCode)); return c ? c.id : null; })();
    if (categoryId) await showInviteConditionList(chatId, categoryId);
    else await showInviteMedicalCategoryList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_BACK) {
    const state = await State.get(chatId);
    if (!state) return false;
    await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY });
    await showInviteMedicalCategoryList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VIEW_STUDENT && param) {
    await showStudentProfile(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_ARCHIVE_MENU) {
    await showArchivedList(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_ARCHIVE_STUDENT && param) {
    await archiveStudent(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.VIEW_ARCHIVED_STUDENT && param) {
    await showArchivedStudentCard(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_ACTIVATE_STUDENT && param) {
    await activateArchivedStudent(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_DELETE_STUDENT && param) {
    await deleteArchivedStudent(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.STUDENT_DAYS && param) {
    const parts = String(param).split(':');
    if (parts.length >= 2) {
      const days = parseInt(parts[0], 10);
      const studentChatId = parts.slice(1).join(':');
      if (days >= 2 && days <= 5) {
        await setStudentTrainingDays(chatId, studentChatId, days);
      }
    } else {
      await showStudentTrainingDaysSelect(chatId, param);
    }
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU) {
    await showMyCoachMenu(chatId);
    return true;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_INVITE_INPUT) {
    await State.set(chatId, { step: CONSTANTS.FSM_STATES.COACH_INVITE_INPUT });
    const keyboard = [[{ text: CONSTANTS.EMOJI.BACK + ' Назад', callback_data: CONSTANTS.CALLBACKS.COACH_MY_COACH_MENU }]];
    await Helpers.sendKeyboard(chatId, '🎟️ Введи інвайт-код, який надав тренер:\n\nПриклад: INVITE_A3F7', keyboard);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_PROFILE && param) {
    await showCoachProfileToStudent(chatId, param.trim());
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN && param) {
    const Training = require('./training');
    await Training.startCoachTrainingForStudent(chatId, param);
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY && param) {
    const History = require('./history');
    await History.showHistoryMenu(chatId, param.trim(), 'coach_student');
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

async function askStudentBirthDate(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_AGE });
  const example = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '15.05.2000';
  await Helpers.safeSend(chatId, "📅 Введіть дату народження учня:\n\nФормат: ДД.ММ.РРРР\nПриклад: " + example);
}

async function askStudentGender(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_GENDER });
  const keyboard = [
    [{ text: 'Чоловік', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_GENDER + ':' + CONSTANTS.GENDERS.MALE }],
    [{ text: 'Жінка', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_GENDER + ':' + CONSTANTS.GENDERS.FEMALE }]
  ];
  await Helpers.sendKeyboard(chatId, 'Оберіть стать учня:', keyboard);
}

async function askStudentGoal(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_GOAL });
  const keyboard = [
    [{ text: 'Схуднути', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_GOAL + ':' + CONSTANTS.GOALS.LOSE }],
    [{ text: 'Набрати масу', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_GOAL + ':' + CONSTANTS.GOALS.GAIN }],
    [{ text: 'Підтримувати форму', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_GOAL + ':' + CONSTANTS.GOALS.KEEP }]
  ];
  await Helpers.sendKeyboard(chatId, '🎯 Оберіть ціль учня:', keyboard);
}

async function askStudentExperience(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_EXPERIENCE });
  const keyboard = [
    [{ text: '0-3 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_EXP + ':0-3' }],
    [{ text: '4-6 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_EXP + ':4-6' }],
    [{ text: '6-12 м-ців', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_EXP + ':6-12' }],
    [{ text: 'Більше року', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_EXP + ':more_year' }]
  ];
  await Helpers.sendKeyboard(chatId, '📅 Оберіть рівень досвіду учня:', keyboard);
}

async function askStudentTrainingTypeForInvite(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_TRAINING_TYPE });
  const keyboard = [
    [{ text: 'Персональна', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_TYPE + ':' + CONSTANTS.TRAINING_TYPES.PERSONAL }],
    [{ text: 'Спліт (2)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_TYPE + ':' + CONSTANTS.TRAINING_TYPES.SPLIT }],
    [{ text: 'Тріо (3)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_TYPE + ':' + CONSTANTS.TRAINING_TYPES.TRIO }]
  ];
  await Helpers.sendKeyboard(chatId, '💪 Оберіть вид тренування за замовчуванням для учня:', keyboard);
}

async function askStudentTrainingDays(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_DAYS });
  const keyboard = [
    [{ text: '2 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_DAYS + ':2' }, { text: '3 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_DAYS + ':3' }],
    [{ text: '4 дні', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_DAYS + ':4' }, { text: '5 днів', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_DAYS + ':5' }]
  ];
  await Helpers.sendKeyboard(chatId, '📆 Скільки днів на тиждень учень планує тренуватися?\n\n💡 Якщо учень змінить кількість днів тренування на тиждень — оновіть ці дані в картці учня.', keyboard);
}

async function askStudentMedicalChoice(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MEDICAL_CHOICE });
  const keyboard = [
    [{ text: 'Пропустити (додати пізніше з картки учня)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SKIP }],
    [{ text: '🩺 Заповнити медичний профіль зараз', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_FILL }]
  ];
  await Helpers.sendKeyboard(chatId, '🩺 Медичний профіль учня\n\nЧи є обмеження за станом здоров\'я? Можна заповнити зараз (категорії та ступінь тяжкості) або пропустити і додати пізніше в картці учня.', keyboard);
}

async function showInviteMedicalCategoryList(chatId) {
  await State.update(chatId, { step: CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_MC_CATEGORY });
  let text = '🩺 Оберіть категорію\n\n• Ні — у учня немає станів з цієї категорії.\n• Відкрити — обрати захворювання та ступінь тяжкості.\n\n';
  const state = await State.get(chatId);
  const conditions = Array.isArray(state.inviteMedicalConditions) ? state.inviteMedicalConditions : [];
  if (conditions.length > 0) {
    text += 'Додано: ' + conditions.length + ' стан(ів). ';
  }
  text += 'Коли закінчите — натисніть «Готово».';
  const keyboard = [];
  for (const cat of MC_CATEGORIES) {
    keyboard.push([
      { text: cat.nameUA + ' — Ні', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_SKIP + ':' + cat.id },
      { text: cat.nameUA + ' — Відкрити', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_OPEN + ':' + cat.id }
    ]);
  }
  keyboard.push([{ text: '✅ Готово', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_DONE }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function showInviteConditionList(chatId, categoryId) {
  const cat = getCategoryById(categoryId);
  if (!cat) {
    await Helpers.safeSend(chatId, '❌ Категорію не знайдено.');
    await showInviteMedicalCategoryList(chatId);
    return;
  }
  await State.update(chatId, { inviteMcCategoryId: categoryId });
  const state = await State.get(chatId);
  const conditions = Array.isArray(state.inviteMedicalConditions) ? state.inviteMedicalConditions : [];
  const alreadySelected = new Set(conditions.map((c) => (c && c.mc_code ? String(c.mc_code).trim() : '')).filter(Boolean));
  const codesToShow = cat.codes.filter((code) => !alreadySelected.has(code));

  let text = '🩺 ' + cat.nameUA + '\n\nОбери захворювання (далі — ступінь тяжкості). Вже додані не показуються.';
  const keyboard = [];
  for (const code of codesToShow) {
    const name = codeToName(code) || code;
    const btnText = name.length > 35 ? name.slice(0, 32) + '…' : name;
    keyboard.push([{ text: btnText, callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_COND + ':' + code }]);
  }
  if (codesToShow.length === 0) {
    text = '🩺 ' + cat.nameUA + '\n\nУсі стани з цієї категорії вже додано. Натисніть «До груп», щоб повернутися до вибору категорій.';
  }
  keyboard.push([{ text: '🔙 До груп', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_CAT_BACK }]);
  await Helpers.sendKeyboard(chatId, text, keyboard);
}

async function askInviteSeverity(chatId, mcCode) {
  const name = codeToName(mcCode) || mcCode;
  const keyboard = [
    [{ text: 'Легка (mild)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':mild' }, { text: 'Помірна (moderate)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':moderate' }],
    [{ text: 'Тяжка (severe)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':severe' }],
    [{ text: 'Стадія 1', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':stage1' }, { text: 'Стадія 2', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':stage2' }, { text: 'Стадія 3', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':stage3' }],
    [{ text: 'Гострий (acute)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':acute' }, { text: 'Хронічна (chronic)', callback_data: CONSTANTS.CALLBACK_PREFIXES.INVITE_MC_SEV + ':chronic' }]
  ];
  await Helpers.sendKeyboard(chatId, '🩺 Обрано: ' + name + '\n\nОберіть ступінь тяжкості:', keyboard);
}

async function finishCreateStudentByInvite(chatId, state, days, conditions) {
  const first = state.inviteFirstName || '';
  const last = state.inviteLastName || '';
  const birthDate = state.inviteBirthDate ? (state.inviteBirthDate instanceof Date ? state.inviteBirthDate : new Date(state.inviteBirthDate)) : null;
  const gender = state.inviteGender || '';
  const goal = state.inviteGoal || '';
  const experienceLevel = state.inviteExperienceLevel || '';
  const defaultTrainingType = state.inviteDefaultTrainingType || '';
  try {
    const inviteCode = await User.createStudentByInvite(chatId, first, last, { birthDate: birthDate && !isNaN(birthDate.getTime()) ? birthDate : null, gender, goal, experienceLevel, defaultTrainingType, trainingDaysPerWeek: days });
    for (const c of conditions) {
      if (c && c.mc_code) await supabase.insertMedicalCondition(inviteCode, c.mc_code, c.severity || '', null);
    }
    await State.clear(chatId);
    await Helpers.safeSend(chatId, "✅ Учня створено!\n\nПередай йому цей код доступу:\n" + inviteCode + "\n\nКоли він введе його у боті (У мене є код), його профіль автоматично прив'яжеться до тебе. Вартість підтягнута до обраного виду тренування." + (conditions.length > 0 ? '\n\nМедичний профіль заповнено (' + conditions.length + ' станів).' : ''));
    await showStudentsList(chatId);
  } catch (err) {
    console.error('Coach.finishCreateStudentByInvite', err.message);
    await State.clear(chatId);
    await Helpers.safeSend(chatId, "❌ Помилка створення учня:\n" + err.message + "\n\nСпробуй ще раз.");
    await showStudentsList(chatId);
  }
}

async function handleTextMessage(chatId, text) {
  const state = await State.get(chatId);
  if (!state || !state.step) return false;
  if (state.step === CONSTANTS.FSM_STATES.COACH_INVITE_INPUT) {
    const code = String(text).trim().toUpperCase();
    if (!/^INVITE_[A-Za-z0-9]+$/.test(code)) {
      await Helpers.safeSend(chatId, '⚠️ Невірний формат коду. Код має починатися з INVITE_\nПриклад: INVITE_A3F7\n\nСпробуй ще раз:');
      return true;
    }
    try {
      await User.linkCoachByInviteCode(chatId, code);
      await State.clear(chatId);
      await Helpers.safeSend(chatId, '✅ Код прийнято! Тренер прив’язано до твого профілю.');
      await showMyCoachMenu(chatId);
    } catch (err) {
      await Helpers.safeSend(chatId, '❌ ' + (err.message || 'Код недійсний або вже використано. Спробуй ще раз або натисни [Назад].'));
    }
    return true;
  }
  if (state.step === CONSTANTS.FSM_STATES.PRICING_INPUT_AMOUNT) {
    await handlePricingAmountInput(chatId, text);
    return true;
  }
  if (state.step === CONSTANTS.FSM_STATES.COACH_ADD_STUDENT_AGE) {
    const dateText = String(text).trim();
    const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!datePattern.test(dateText)) {
      const ex = (CONSTANTS.DATE_FORMATS && CONSTANTS.DATE_FORMATS.EXAMPLE) || '15.05.2000';
      await Helpers.safeSend(chatId, '⚠️ Невірний формат. Очікується ДД.ММ.РРРР\n\nПриклад: ' + ex);
      return true;
    }
    const birthDate = User.parseBirthDate(dateText);
    if (!birthDate) {
      await Helpers.safeSend(chatId, '⚠️ Некоректна дата. Спробуй ще раз.');
      return true;
    }
    const age = User.calculateAge(birthDate);
    const ageMin = 10;
    const ageMax = 100;
    if (age == null || age < ageMin || age > ageMax) {
      await Helpers.safeSend(chatId, '⚠️ Вік має бути від ' + ageMin + ' до ' + ageMax + ' років. Перевір дату.');
      return true;
    }
    await State.update(chatId, { inviteBirthDate: birthDate.toISOString ? birthDate.toISOString() : birthDate });
    await askStudentGender(chatId);
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
  await State.update(chatId, { inviteFirstName: first, inviteLastName: last });
  await askStudentBirthDate(chatId);
  return true;
}

module.exports = { showStudentsList, showStudentProfile, handleCallback, handleTextMessage, askStudentName, getGoalText };
