/**
 * Coach — Мої учні (список, профіль учня), Тренування учнів (заглушка).
 * Callback: COACH_STUDENTS, VIEW_STUDENT:id, COACH_ADD_STUDENT, TRAINING_COACH_START, COACH_TRAIN:id, COACH_HISTORY:id, COACH_BOOK:id
 */
const { CONSTANTS } = require('./constants');
const State = require('./state');
const User = require('./user');
const Helpers = require('./helpers');

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
    message += 'Мета: ' + getGoalText(student.goal) + '\n\n';
    if (student.height) message += '📏 Зріст: ' + student.height + ' см\n';
    if (student.weight) message += '⚖️ Вага: ' + student.weight + ' кг\n';
    const isInvite = student.userId && String(student.userId).indexOf('INVITE_') === 0;
    if (isInvite) {
      message += '\n⏳ Статус: Очікує активації\nКод: `' + (student.userId || '') + '`';
    } else {
      message += '\n✅ Статус: Активний';
    }
    const kbd = [
      [{ text: '💪 Почати тренування', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_TRAIN + ':' + studentChatId }],
      [{ text: '📊 Історія', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY + ':' + studentChatId }, { text: '📅 Записати', callback_data: CONSTANTS.CALLBACK_PREFIXES.COACH_BOOK + ':' + studentChatId }],
      [{ text: '🔙 До списку', callback_data: CONSTANTS.CALLBACKS.COACH_STUDENTS }]
    ];
    await Helpers.sendKeyboard(chatId, message, kbd);
  } catch (err) {
    console.error('Coach.showStudentProfile', err.message);
    await Helpers.safeSend(chatId, '❌ Помилка завантаження профілю.');
  }
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
  if (action === CONSTANTS.CALLBACKS.TRAINING_COACH_START) {
    await Helpers.safeSend(chatId, '💪 Модуль «Тренування учнів» ще переноситься на новий бот. Використовуй «Мої учні» → обрати учня → «Почати тренування», коли модуль буде готовий.');
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
    await Helpers.safeSend(chatId, '💪 Почати тренування для цього учня — модуль тренувань ще переноситься. Скоро.');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_HISTORY && param) {
    await Helpers.safeSend(chatId, '📊 Історія тренувань учня ще в розробці на новому боті.');
    return true;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.COACH_BOOK && param) {
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
