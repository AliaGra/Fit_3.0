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
const Alias = require('./alias');
const History = require('./history');
const Subscription = require('./subscription');
const Venues = require('./venues');

async function route(update) {
  let data = null;
  try {
    data = Helpers.extractMessage(update);
    if (!data || !data.chatId) {
      console.log('Router: no chatId');
      return;
    }

    // Blocked users: stop all interactions
    try {
      const u = await User.getByChatId(data.chatId);
      if (u && u.isBlocked === true) {
        await Helpers.safeSend(data.chatId, 'Ваш доступ до платформи призупинено.\nЗверніться до підтримки: https://t.me/FitHad_helpbot');
        return;
      }
    } catch (e) {
      console.error('Router: is_blocked check failed', e.message);
    }

    if (data.type === 'location') {
      const handled = await Venues.handleLocationMessage(data.chatId, data.location);
      if (!handled) {
        await Helpers.safeSend(data.chatId, 'Щоб надіслати геолокацію, відкрий: Головне меню → Клуби, студії → Пошук поруч.');
      }
    } else if (data.type === 'text') {
      await handleTextMessage(data.chatId, data.text);
    } else if (data.type === 'file') {
      await handleFileMessage(data.chatId, data.file);
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

async function handleFileMessage(chatId, file) {
  const state = await State.getSafe(chatId);
  if (state && state.step && (state.step.indexOf('reg_') === 0 || state.step === CONSTANTS.FSM_STATES.REG_ROLE || state.step === 'WAITING_FOR_START_CHOICE')) {
    const handled = await Registration.handleFileMessage(chatId, file);
    if (handled) return;
    await Helpers.safeSend(chatId, '⚠️ Зараз це неочікуваний файл. Спробуй слідувати підказкам або напиши /start.');
    return;
  }
  if (state && state.step && state.step.indexOf('profile_') === 0) {
    const handled = await Profile.handleFileMessage(chatId, file);
    if (handled) return;
    await Helpers.safeSend(chatId, '⚠️ Зараз це неочікуваний файл. Спробуй слідувати підказкам або повернись у профіль.');
    return;
  }
  await Helpers.safeSend(chatId, '⚠️ Файл отримано, але зараз немає активного кроку для його обробки. Напиши /start.');
}

async function handleTextMessage(chatId, text) {
  if (Helpers.isCommand({ message: { text } }, 'start')) {
    const raw = String(text || '').trim();
    const startMatch = raw.match(/^\/start(?:@\S+)?\s+(\S+)/i);
    const startPayload = startMatch ? startMatch[1] : '';
    await State.clear(chatId);
    const user = await User.getByChatId(chatId);
    if (startPayload && startPayload.indexOf('pvch_') === 0) {
      const coachId = startPayload.slice(5).trim();
      if (user && coachId) {
        const Coach = require('./coach');
        await Coach.showPublicVenueCoachCard(chatId, coachId);
        return;
      }
    }
    if (startPayload && startPayload.indexOf('venue_') === 0) {
      const venueId = startPayload.slice(6).trim();
      if (user && venueId) {
        const opened = await Venues.openLinkedVenueCardFromDeepLink(chatId, venueId);
        if (opened) return;
      }
    }
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
  if (step === CONSTANTS.FSM_STATES.VENUE_TEXT_SEARCH) {
    const handled = await Venues.handleTextMessage(chatId, text);
    if (handled) return;
  }
  if (step === CONSTANTS.FSM_STATES.REG_VENUE_OFFER) {
    await Helpers.safeSend(chatId, 'Обери варіант кнопкою вище.');
    return;
  }
  if (step && (step.indexOf('reg_') === 0 || step === CONSTANTS.FSM_STATES.REG_ROLE || step === 'WAITING_FOR_START_CHOICE')) {
    const handled = await Registration.handleTextMessage(chatId, text);
    if (handled) return;
    await Helpers.safeSend(chatId, 'Обери варіант кнопкою вище або напиши /start');
    return;
  }
  if (step && (step.indexOf('coach_') === 0 || step.indexOf('invite_') === 0 || step.indexOf('pricing_') === 0)) {
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
  if (step === CONSTANTS.FSM_STATES.ALIAS_INPUT_TEXT) {
    const aliasHandled = await Alias.handleTextInput(chatId, text);
    if (aliasHandled) return;
  }
  if (step === CONSTANTS.FSM_STATES.LIBRARY_SEARCH_INPUT) {
    const libraryHandled = await Library.handleTextMessage(chatId, text);
    if (libraryHandled) return;
  }
  if (step === CONSTANTS.FSM_STATES.HIST_COUNT_INPUT) {
    const result = History.validateHistCount(text);
    if (!result.valid) {
      await Helpers.safeSend(chatId, 'Введіть число від 1 до 100:');
      return;
    }
    const state = await State.get(chatId);
    const dates = await History.loadDatesForCurrentFilter(state, result.value);
    await State.update(chatId, { histDates: dates, histCurrentIndex: 0, histDetailOrigin: 'list', step: CONSTANTS.FSM_STATES.HIST_LIST });
    await History.showHistoryList(chatId);
    return;
  }
  if (step === CONSTANTS.FSM_STATES.PLAN_SET_NAME || step === CONSTANTS.FSM_STATES.PLAN_SEARCH_INPUT) {
    const planHandled = await TrainingPlan.handleTextMessage(chatId, text);
    if (planHandled) return;
  }
  if (step === CONSTANTS.FSM_STATES.REPORTS_TRAININGS_INPUT_DAYS) {
    await Reports.sendTrainingReport(chatId, text);
    return;
  }
  if (step === CONSTANTS.FSM_STATES.REPORTS_INCOME_INPUT_DAYS) {
    await Reports.sendIncomeReport(chatId, text);
    return;
  }
  if (step && (step === CONSTANTS.FSM_STATES.SUB_ADD_AMOUNT || step === CONSTANTS.FSM_STATES.SUB_ADD_COUNT || step === CONSTANTS.FSM_STATES.SUB_ADD_START || step === CONSTANTS.FSM_STATES.SUB_ADD_END)) {
    const subHandled = await Subscription.handleTextMessage(chatId, text);
    if (subHandled) return;
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
  if (
    action === CONSTANTS.CALLBACKS.VENUES_MENU ||
    action === CONSTANTS.CALLBACKS.VENUES_GEO ||
    action === CONSTANTS.CALLBACKS.VENUES_TEXT ||
    action === CONSTANTS.CALLBACKS.VENUES_ORG ||
    action === CONSTANTS.CALLBACKS.VENUES_RADIUS ||
    action === CONSTANTS.CALLBACKS.VENUES_PICK ||
    action === CONSTANTS.CALLBACKS.VENUES_CARD ||
    action === CONSTANTS.CALLBACKS.VENUES_SEARCH_NEW ||
    action === CONSTANTS.CALLBACKS.REG_VENUE_OPEN ||
    action === CONSTANTS.CALLBACKS.REG_VENUE_SKIP ||
    action === CONSTANTS.CALLBACKS.PROFILE_COACH_VENUES
  ) {
    await Venues.handleCallback(chatId, action, params);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_TRAINING) {
    await Menu.showTrainingSubmenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.DEV_CONTACT_MENU) {
    await Menu.showDeveloperContactMenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.DEV_CONTACT_OFFER) {
    await Menu.sendOfferText(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.AI_ANALYTICS) {
    const bodyAnalysisAI = require('./ai/bodyAnalysis');
    // Завжди показуємо актуальний текст (не кеш), бо промпти/логіка можуть змінюватись,
    // а також користувач очікує "оновити" при натисканні кнопки.
    await bodyAnalysisAI.sendFullAnalysis(chatId, chatId, '🤖 AI-аналітика тіла', true, { fromCoach: false });
    return;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_SCHEDULE) {
    await Menu.showScheduleSubmenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.MENU_SUBSCRIPTION) {
    await Subscription.showMenu(chatId);
    return;
  }
  if (action === CONSTANTS.CALLBACKS.SUB_ADD || action === CONSTANTS.CALLBACKS.SUB_HISTORY || action === CONSTANTS.CALLBACKS.SUB_TYPE_UNLIMITED || action === CONSTANTS.CALLBACKS.SUB_TYPE_FIXED || action === 'SUB_BACK') {
    const subHandled = await Subscription.handleCallback(chatId, callbackData);
    if (subHandled) return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_ADD || action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_SCOPE || action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_LIST || action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL || action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_DEL_CONFIRM || action === CONSTANTS.CALLBACK_PREFIXES.ALIAS_BACK) {
    const aliasHandled = await Alias.handleCallback(chatId, callbackData);
    if (aliasHandled) return;
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
    await Registration.handleCallback(chatId, callbackData);
    return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.INVITE_ACCENT_TGL || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_ACCENT_NXT || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_ACCENT_BCK || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_AVD_TGL || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_AVD_SKP || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_AVD_NXT || action === CONSTANTS.CALLBACK_PREFIXES.INVITE_AVD_BCK) {
    const coachHandled = await Coach.handleCallback(chatId, callbackData);
    if (coachHandled) return;
  }
  const regHandled = await Registration.handleCallback(chatId, callbackData);
  if (regHandled) return;

  if (action === CONSTANTS.CALLBACK_PREFIXES.MC_PROFILE || action === CONSTANTS.CALLBACK_PREFIXES.MC_ADD || action === CONSTANTS.CALLBACK_PREFIXES.MC_REMOVE || action === CONSTANTS.CALLBACK_PREFIXES.MC_SEVERITY || action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_SKIP || action === CONSTANTS.CALLBACK_PREFIXES.MC_CATEGORY_OPEN || action === CONSTANTS.CALLBACK_PREFIXES.MC_CONDITION) {
    const mcHandled = await MedicalProfile.handleCallback(chatId, callbackData);
    if (mcHandled) return;
  }
  if (action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LIST || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_NEW || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_MANUAL || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AUTO_COUNT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GENERATE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GOAL || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_LEVEL || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_BACK || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_DEFAULT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_INPUT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_REVISION_WEEKS || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DAYS || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACTIVATE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EDIT_DAY || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SEARCH || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_GROUP || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_EXERCISE_ADD || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_VIEW_EXERCISE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_BACK_TO_PLAN || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_DELETE_EXERCISE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_START || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_TOGGLE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_NEXT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_ACCENT_BACK || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_TOGGLE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_SKIP || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_NEXT || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_BACK || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_AVOID_DISABLED || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_CONFIRM || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SPLIT_BACK || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_PHASE_DUR || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_CONFIRM || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_CAND_REPLACE || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_PRESET || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_CUSTOM || action === CONSTANTS.CALLBACK_PREFIXES.PLAN_SETS_BACK) {
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
    const user = await User.getByChatId(chatId);
    const origin = user && user.role === CONSTANTS.ROLES.COACH ? 'coach_own' : 'self';
    await History.showHistoryMenu(chatId, chatId, origin);
    return;
  }
  if (action.startsWith('HIST_')) {
    const histHandled = await History.handleCallback(chatId, callbackData);
    if (histHandled) return;
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
