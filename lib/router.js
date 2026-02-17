/**
 * Router — маршрутизація update: текст / callback → /start, меню, реєстрація, BACK_TO_MAIN
 */
const { CONSTANTS } = require('./constants');
const Helpers = require('./helpers');
const State = require('./state');
const User = require('./user');
const Menu = require('./menu');
const Registration = require('./registration');
const Coach = require('./coach');
const Profile = require('./profile');
const Schedule = require('./schedule');
const Reports = require('./reports');
const Training = require('./training');
const Library = require('./library');
const MedicalProfile = require('./medicalProfile');
const TrainingPlan = require('./trainingPlan');

async function route(update) {
  let data = null;
  try {
    data = Helpers.extractMessage(update);
    if (!data || !data.chatId) {
      console.log('Router: no chatId');
      return;
    }

    if (data.type === 'text') {
      await handleTextMessage(data.chatId, data.text);
    } else if (data.type === 'callback') {
      if (data.callbackQueryId) {
        Helpers.answerCallback(data.callbackQueryId).catch(() => {});
      }
      await handleCallback(data.chatId, data.callbackData, data.callbackQueryId);
    }
  } catch (error) {
    console.error('Router.route', error.message);
    if (data && data.chatId) {
      const backLabel = (CONSTANTS.EMOJI && CONSTANTS.EMOJI.HOME) ? CONSTANTS.EMOJI.HOME + ' Головне меню' : '🏠 Головне меню';
      const keyboard = [[{ text: backLabel, callback_data: CONSTANTS.CALLBACKS.BACK_TO_MAIN }]];
      await Helpers.sendKeyboard(data.chatId, '❌ Виникла технічна помилка. Спробуй /start або зв\'яжися з підтримкою.', keyboard);
    }
  }
}

async function handleTextMessage(chatId, text) {
  if (Helpers.isCommand({ message: { text } }, 'start')) {
    await State.clear(chatId);
    const user = await User.getByChatId(chatId);
    if (user) {
      await Menu.show(chatId);
    } else {
      await Registration.start(chatId, { force: true });
    }
    return;
  }

  const state = await State.getSafe(chatId);
  if (!state || !state.step) {
    const user = await User.getByChatId(chatId);
    if (!user) {
      await Helpers.safeSend(chatId, '👋 Привіт! Натисни /start щоб почати.');
      return;
    }
    await Menu.show(chatId);
    return;
  }

  const step = state.step;
  if (step && (step.indexOf('reg_') === 0 || step === CONSTANTS.FSM_STATES.REG_ROLE || step === 'WAITING_FOR_START_CHOICE')) {
    const handled = await Registration.handleTextMessage(chatId, text);
    if (handled) return;
    await Helpers.safeSend(chatId, 'Обери варіант кнопкою вище або напиши /start');
    return;
  }
  if (step && (step.indexOf('coach_') === 0 || step.indexOf('pricing_') === 0)) {
    const handled = await Coach.handleTextMessage(chatId, text);
    if (handled) return;
  }
  if (step && (step === CONSTANTS.FSM_STATES.MC_ADD_SEVERITY || step === CONSTANTS.FSM_STATES.MC_ADD_SEVERITY_CUSTOM)) {
    const handled = await MedicalProfile.handleTextMessage(chatId, text);
    if (handled) return;
  }
  if (step && step.indexOf('profile_') === 0) {
    const handled = await Profile.handleTextMessage(chatId, text);
    if (handled) return;
  }
  if (step && step.indexOf('sch_') === 0) {
    const handled = await Schedule.handleTextMessage(chatId, text);
    if (handled) return;
  }
  if (step === CONSTANTS.FSM_STATES.LIBRARY_SEARCH_INPUT) {
    const libraryHandled = await Library.handleTextMessage(chatId, text);
    if (libraryHandled) return;
  }
  if (step === CONSTANTS.FSM_STATES.REPORTS_TRAININGS_INPUT_DAYS) {
    await Reports.sendTrainingReport(chatId, text);
    return;
  }
  if (step === CONSTANTS.FSM_STATES.REPORTS_INCOME_INPUT_DAYS) {
    await Reports.sendIncomeReport(chatId, text);
    return;
  }
  if (step && (step.indexOf('training_') === 0 || step === CONSTANTS.FSM_STATES.TRAINING_GROUP || step === CONSTANTS.FSM_STATES.TRAINING_INPUT_DATA || step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_STUDENTS || step === CONSTANTS.FSM_STATES.TRAINING_COACH_SELECT_TARGET || step === CONSTANTS.FSM_STATES.TRAINING_SEARCH_NAME_INPUT || step === 'training_exercise')) {
    const handled = await Training.handleTextMessage(chatId, text);
    if (handled) return;
    await Helpers.safeSend(chatId, '⚠️ Обери варіант кнопкою або напиши /start.');
    return;
  }
  await State.clear(chatId);
  await Helpers.safeSend(chatId, '⚠️ Щось пішло не так. Почни спочатку: /start');
}

async function handleCallback(chatId, callbackData, callbackQueryId) {
  if (!callbackData || String(callbackData).trim() === '') return;
  const action = String(callbackData).split(':')[0].trim();
  const params = String(callbackData).split(':').slice(1);
  if (action === 'COACH_BOOK') {
    console.log('Router: COACH_BOOK received', { chatId, params: params.join(':'), len: callbackData?.length });
  }

  if (action === CONSTANTS.CALLBACKS.BACK_TO_MAIN) {
    const State = require('./state');
    await State.clear(chatId);
    await Menu.show(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_TRAINING) {
    await Menu.showTrainingSubmenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_SCHEDULE) {
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.LIBRARY_VIEW || action === CONSTANTS.CALLBACKS.LIBRARY_GROUP || action === CONSTANTS.CALLBACKS.LIBRARY_EXERCISE || action === CONSTANTS.CALLBACKS.LIBRARY_SEARCH || action === CONSTANTS.CALLBACKS.LIBRARY_BACK || action === CONSTANTS.CALLBACKS.LIBRARY_TOP) {
    const libraryHandled = await Library.handleCallback(chatId, callbackData);
    if (libraryHandled) return;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_MY_SCHEDULE) {
    console.log('Router: SCH_S_MY_SCHEDULE chatId=' + chatId);
    await Schedule.showStudentMySchedule(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RES || action === CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE) {
    await Schedule.handleCallback(chatId, callbackData);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.SCH_S_RESCHEDULE_PICK || action === CONSTANTS.CALLBACKS.SCH_S_RES_CALENDAR || action === CONSTANTS.CALLBACKS.SCH_S_RES_DAY || action === CONSTANTS.CALLBACKS.SCH_S_RES_CANCEL) {
    await Schedule.handleCallback(chatId, callbackData);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.CANCEL_ACTION) {
    await Menu.show(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.COACH_BOOK) {
    const studentChatId = params.join(':').trim();
    if (studentChatId) {
      try {
        await Schedule.startBookStudent(chatId, studentChatId);
      } catch (err) {
        console.error('COACH_BOOK startBookStudent error', err.message);
        await Helpers.safeSend(chatId, '❌ Помилка завантаження слотів. Спробуй пізніше.');
      }
      return;
    }
  }
  if (action === CONSTANTS.CALLBACKS.REG_NEW) {
    await Registration.showRoleStep(chatId);
    return;
  }
  const regHandled = await Registration.handleCallback(chatId, callbackData);
  if (regHandled) return;

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_PROFILE || action === CONSTANTS.CALLBACK_PREFIXES.MC_ADD || action === CONSTANTS.CALLBACK_PREFIXES.MC_REMOVE || action === CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY || action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_SKIP || action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_OPEN || action === CONSTANTS.CALLBACK_PREFIXES.MC_CONDITION) {
    const mcHandled = await MedicalProfile.handleCallback(chatId, callbackData);
    if (mcHandled) return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW) {
    const planHandled = await TrainingPlan.handleCallback(chatId, callbackData);
    if (planHandled) return;
  }

  const coachHandled = await Coach.handleCallback(chatId, callbackData);
  if (coachHandled) return;

  const profileHandled = await Profile.handleCallback(chatId, callbackData);
  if (profileHandled) return;

  const scheduleHandled = await Schedule.handleCallback(chatId, callbackData);
  if (scheduleHandled) return;

  const trainingHandled = await Training.handleCallback(chatId, callbackData);
  if (trainingHandled) return;

  const reportsHandled = await Reports.handleCallback(chatId, callbackData);
  if (reportsHandled) return;

  if (action === CONSTANTS.CALLBACKS.HISTORY_MENU) {
    await Helpers.safeSend(chatId, '📊 Історія тренувань ще в розробці на новому боті. Скоро буде доступна.');
    await Menu.show(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.TRAINING_START) {
    const userForTraining = await User.getByChatId(chatId);
    if (userForTraining?.role === CONSTANTS.ROLES.COACH) {
      await Training.startSelfTraining(chatId);
    } else {
      await Training.startStudentPlanWorkout(chatId);
    }
    return;
  }

  const user = await User.getByChatId(chatId);
  if (!user) {
    await Registration.start(chatId, { force: true });
    return;
  }
  await Menu.show(chatId);
}

module.exports = { route };
