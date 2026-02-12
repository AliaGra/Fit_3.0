/**
 * constants.gs
 *
 * Центральне сховище всіх констант проекту FIT 3.0
 *
 * КРИТИЧНО: Всі магічні рядки мають бути тут!
 * VETO 3: Заборонено використовувати рядки напряму в коді
 *
 * Версія: 1.1
 * Дата: 05.02.2026
 */

// ========================================
// 🤖 BOT & SPREADSHEET CONFIGURATION
// ========================================

// РЕКОМЕНДОВАНО: токен та ID таблиці зберігати у Script Properties
var BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
var WEB_APP_URL = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL') || null;

var TELEGRAM_API_URL = 'https://api.telegram.org/bot' + BOT_TOKEN + '/';

/**
 * CONSTANTS - головний об'єкт з усіма константами
 *
 * Використання: CONSTANTS.ROLES.STUDENT
 * ❌ НЕ використовувати: "student"
 */
var CONSTANTS = Object.freeze({

  // ========================================
  // ⚙️ БАЗОВА КОНФІГУРАЦІЯ
  // ========================================
  CONFIG: Object.freeze({
    BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_API_URL: TELEGRAM_API_URL,
    SPREADSHEET_ID: SPREADSHEET_ID,
    DEBUG: false,  // увімкнути логування update у Main.doPost (для дебагу)
    WEB_APP_URL: WEB_APP_URL  // fallback URL Web App (Script Properties), якщо getUrl() недоступний
  }),

  // ========================================
  // 📊 НАЗВИ ЛИСТІВ (SHEET NAMES)
  // ========================================
  SHEETS: Object.freeze({
    USERS: 'Users',
    EXERCISE_LIBRARY: 'ExerciseLibrary',
    BOT_TRAINING_DATA: 'BotTrainingData',
    MEASUREMENTS_HISTORY: 'MeasurementsHistory',
    WORKOUT_SCHEDULE: 'WorkoutSchedule',
    PRICING: 'Pricing',
    CITY_LIST: 'CityList',
    TRAINING_PLANS: 'TrainingPlans',
    TRAINING_PLAN_EXERCISES: 'TrainingPlanExercises',
    LOGS: 'Logs'
  }),

  // ========================================
  // 👤 РОЛІ КОРИСТУВАЧІВ (ROLES)
  // ========================================
  ROLES: Object.freeze({
    STUDENT: 'student',
    COACH: 'coach'
  }),

  // ========================================
  // 🚻 СТАТЬ (GENDER)
  // ========================================
  GENDERS: Object.freeze({
    MALE: 'male',
    FEMALE: 'female'
  }),

  // ========================================
  // 🎯 ЦІЛІ (GOALS)
  // ========================================
  GOALS: Object.freeze({
    LOSE: 'lose',   // Схуднути
    GAIN: 'gain',   // Набрати масу
    KEEP: 'keep'    // Підтримувати форму
  }),

  // ========================================
  // 🧱 РЕЖИМИ ТРЕНУВАНЬ (TRAINING MODES)
  // ========================================
  TRAINING_MODES: Object.freeze({
    STUDENT: 'STUDENT',  // Учень тренується сам
    SELF: 'SELF',        // Тренер тренує себе
    COACH: 'COACH'       // Тренер веде учня
  }),

  // ========================================
  // 🧱 ТИПИ ТРЕНУВАНЬ УЧНІВ (COACH GROUP)
  // ========================================
  TRAINING_TYPES: Object.freeze({
    PERSONAL: 'PERSONAL',
    SPLIT: 'SPLIT',
    TRIO: 'TRIO'
  }),

  // ========================================
  // ✅ СТАТУС АКТИВНОСТІ ВПРАВИ (ExerciseLibrary.Active)
  // ========================================
  ACTIVE_STATUS: Object.freeze({
    YES: 'YES',
    NO: 'NO'
  }),

  // ========================================
  // 📅 СТАТУСИ РОЗКЛАДУ (WorkoutSchedule.Status)
  // ========================================
  SCHEDULE_STATUS: Object.freeze({
    AVAILABLE: 'AVAILABLE',   // Вільний слот
    REQUESTED: 'REQUESTED',   // Запит на запис
    BOOKED: 'BOOKED',         // Запис підтверджено
    COMPLETED: 'COMPLETED',   // Тренування завершено
    CANCELED: 'CANCELED'      // Запис скасовано
  }),

  // ========================================
  // 🔄 FSM СТАНИ (FINITE STATE MACHINE STATES)
  // (імена вирівняні з бізнес-логікою + матрицею)
  // ========================================
  FSM_STATES: Object.freeze({

    // --- Реєстрація ---
    WAITING_FOR_START_CHOICE: 'WAITING_FOR_START_CHOICE',
    REG_ROLE: 'reg_role',
    REG_FIRST_NAME: 'reg_first_name',
    REG_FIRST_NAME_DECISION: 'reg_first_name_decision',
    REG_LAST_NAME: 'reg_last_name',
    REG_CITY: 'reg_city',
    REG_GENDER: 'reg_gender',
    REG_GOAL: 'reg_goal',
    REG_BIRTH_DATE: 'reg_birth_date',
    REG_HEIGHT: 'reg_height',
    REG_INSTAGRAM: 'reg_instagram',
    REG_CALENDAR_ID: 'reg_calendar_id',
    REG_INVITE_INPUT: 'reg_invite_input',

    // --- Профіль / заміри ---
    PROFILE_WEIGHT: 'profile_weight',
    PROFILE_WAIST: 'profile_waist',
    PROFILE_HIP: 'profile_hip',
    PROFILE_GLUTES: 'profile_glutes',
    PROFILE_ARM: 'profile_arm',

    PROFILE_EDIT_FIRSTNAME: 'profile_edit_firstname',
    PROFILE_EDIT_LASTNAME: 'profile_edit_lastname',
    PROFILE_EDIT_CITY: 'profile_edit_city',
    PROFILE_EDIT_HEIGHT: 'profile_edit_height',
    PROFILE_EDIT_BIRTHDATE: 'profile_edit_birthdate',

    // --- Тренування (STUDENT / COACH MODE) ---
    TRAINING_GROUP: 'training_group',
    TRAINING_WEIGHT: 'training_weight',
    TRAINING_REPS: 'training_reps',
    TRAINING_SET: 'training_set',
    TRAINING_INPUT_DATA: 'training_input_data',
    TRAINING_SEARCH_NAME_INPUT: 'training_search_name_input',
    TRAINING_CIRCUIT_CHANGE_INPUT: 'training_circuit_change_input',
    TRAINING_CIRCUIT_BUILD: 'training_circuit_build',
    TRAINING_CIRCUIT_EXEC: 'training_circuit_exec',
    TRAINING_COACH_TYPE: 'training_coach_type',
    TRAINING_COACH_SELECT_STUDENTS: 'training_coach_select_students',
    TRAINING_COACH_SELECT_TARGET: 'training_coach_select_target',

    // --- Тренування SELF (SELF MODE) ---
    TRAINING_SELF_GROUP: 'training_self_group',
    TRAINING_SELF_WEIGHT: 'training_self_weight',
    TRAINING_SELF_REPS: 'training_self_reps',
    TRAINING_SELF_SET: 'training_self_set',
    TRAINING_SELF_CIRCUIT_BUILD: 'training_self_circuit_build',
    TRAINING_SELF_CIRCUIT_EXEC: 'training_self_circuit_exec',

    // --- Історія ---
    HISTORY_INPUT_N: 'history_input_n',
    HISTORY_INPUT_COUNT: 'history_input_count',
    VIEWING_HISTORY: 'viewing_history',

    // --- Coach-Student ---
    COACH_ADD_STUDENT_NAME: 'coach_add_student_name',
    COACH_ADD_STUDENT_FIRST_NAME: 'coach_add_student_first_name',
    COACH_ADD_STUDENT_LAST_NAME: 'coach_add_student_last_name',
    COACH_ADD_STUDENT_GENDER: 'coach_add_student_gender',
    COACH_ADD_STUDENT_GOAL: 'coach_add_student_goal',
    COACH_ADD_STUDENT_BIRTH_DATE: 'coach_add_student_birth_date',
    COACH_ADD_STUDENT_CITY: 'coach_add_student_city',

    // --- Звіти тренера (Reports) ---
    REPORTS_MENU: 'reports_menu',
    REPORTS_TRAININGS_INPUT_DAYS: 'reports_trainings_input_days',
    REPORTS_INCOME_STUB: 'reports_income_stub',

    // --- Вартість тренувань (Pricing) ---
    PRICING_TYPE_SELECT: 'pricing_type_select',
    PRICING_INPUT_AMOUNT: 'pricing_input_amount',
    PRICING_SELECT_STUDENT: 'pricing_select_student',

    // --- Schedule FSM ---
    SCH_SELECT_STUDENT: 'sch_select_student',
    SCH_SELECT_NEW_SLOT: 'sch_select_new_slot',
    SCH_WAITING_CONFIRM: 'sch_waiting_confirm'
  }),

  // ========================================
  // 🔘 CALLBACK DATA (НЕ-FSM КОМАНДИ)
  // ========================================
  CALLBACKS: Object.freeze({

    // --- Реєстрація ---
    REG_NEW: 'REG_NEW',
    REG_INVITE: 'REG_INVITE',
    REG_ROLE_STUDENT: 'REG_ROLE_STUDENT',
    REG_ROLE_COACH: 'REG_ROLE_COACH',
    REG_GENDER_MALE: 'REG_GENDER_MALE',
    REG_GENDER_FEMALE: 'REG_GENDER_FEMALE',
    REG_GOAL_LOSE: 'REG_GOAL_LOSE',
    REG_GOAL_GAIN: 'REG_GOAL_GAIN',
    REG_GOAL_KEEP: 'REG_GOAL_KEEP',
    REG_SKIP_LASTNAME: 'REG_SKIP_LASTNAME',
    REG_CONTINUE: 'REG_CONTINUE',
    REG_START_TRAINING: 'REG_START_TRAINING',

    // --- Профіль ---
    PROFILE_VIEW: 'PROFILE_VIEW',
    PROFILE_UPDATE_MEASUREMENTS: 'PROFILE_UPDATE_MEASUREMENTS',
    PROFILE_EDIT_DATA: 'PROFILE_EDIT_DATA',
    PROFILE_EDIT_FIRSTNAME: 'PROFILE_EDIT_FIRSTNAME',
    PROFILE_EDIT_LASTNAME: 'PROFILE_EDIT_LASTNAME',
    PROFILE_EDIT_CITY: 'PROFILE_EDIT_CITY',
    PROFILE_EDIT_HEIGHT: 'PROFILE_EDIT_HEIGHT',
    PROFILE_EDIT_BIRTHDATE: 'PROFILE_EDIT_BIRTHDATE',

    // --- Тренування ---
    TRAINING_START: 'TRAINING_START',
    TRAINING_COACH_START: 'TRAINING_COACH_START',
    TRAINING_COACH_TYPE_PERSONAL: 'TRAINING_COACH_TYPE_PERSONAL',
    TRAINING_COACH_TYPE_SPLIT: 'TRAINING_COACH_TYPE_SPLIT',
    TRAINING_COACH_TYPE_TRIO: 'TRAINING_COACH_TYPE_TRIO',
    TRAINING_COACH_CHOOSE_STUDENT: 'TRAINING_COACH_CHOOSE_STUDENT',
    TRAINING_MODE_SINGLE: 'TRAINING_MODE_SINGLE',
    TRAINING_MODE_CIRCUIT: 'TRAINING_MODE_CIRCUIT',
    TRAINING_FINISH: 'TRAINING_FINISH',
    TRAINING_ADD_SET: 'TRAINING_ADD_SET',
    TRAINING_FINISH_EXERCISE: 'TRAINING_FINISH_EXERCISE',
    TRAINING_CIRCUIT_NEXT_ROUND: 'TRAINING_CIRCUIT_NEXT_ROUND',
    TRAINING_CIRCUIT_CHANGE_EXERCISE: 'TRAINING_CIRCUIT_CHANGE_EXERCISE',
    TRAINING_SEARCH_NAME: 'TRAINING_SEARCH_NAME',
    TRAINING_BACK_TO_GROUP: 'TRAINING_BACK_TO_GROUP',

    // Круговий сет (без параметрів)
    CIRCUIT_START: 'CIRCUIT_START',
    CIRCUIT_FINISH_ROUND: 'CIRCUIT_FINISH_ROUND',

    // --- Тренування SELF ---
    TRAINING_SELF_START: 'TRAINING_SELF_START',
    TRAINING_SELF_MODE_SINGLE: 'TRAINING_SELF_MODE_SINGLE',
    TRAINING_SELF_MODE_CIRCUIT: 'TRAINING_SELF_MODE_CIRCUIT',
    TRAINING_SELF_FINISH: 'TRAINING_SELF_FINISH',

    SELF_CIRCUIT_START: 'SELF_CIRCUIT_START',
    SELF_CIRCUIT_FINISH_ROUND: 'SELF_CIRCUIT_FINISH_ROUND',

    // --- Історія ---
    HISTORY_MENU: 'HISTORY_MENU',
    HISTORY_ALL: 'HISTORY_ALL',
    HISTORY_BY_GROUP: 'HISTORY_BY_GROUP',
    HISTORY_BY_EXERCISE: 'HISTORY_BY_EXERCISE',
    HISTORY_CURRENT: 'HISTORY_CURRENT',
    HISTORY_PREVIOUS: 'HISTORY_PREVIOUS',
    HISTORY_LAST_N: 'HISTORY_LAST_N',
    HISTORY_ITEM: 'HISTORY_ITEM',
    HISTORY_PROGRESS: 'HISTORY_PROGRESS',

    // --- Тренер-Учень ---
    COACH_STUDENTS: 'COACH_STUDENTS',
    COACH_ADD_STUDENT: 'COACH_ADD_STUDENT',
    COACH_PICK_START: 'COACH_PICK_START',

    // --- Розклад (Coach) ---
    SCH_MY_SCHEDULE: 'SCH_MY_SCHEDULE',
    SCH_CONF: 'SCH_CONF',              // SCH_CONF:{slotId}
    SCH_DECLINE: 'SCH_DECLINE',        // SCH_DECLINE:{slotId}
    SCH_CANCEL: 'SCH_CANCEL',          // SCH_CANCEL:{slotId}
    SCH_RESCHEDULE: 'SCH_RESCHEDULE',  // SCH_RESCHEDULE:{slotId}
    SCH_COMPLETE: 'SCH_COMPLETE',      // SCH_COMPLETE:{slotId}
    SCH_BOOK_COACH: 'SCH_BOOK_COACH',  // SCH_BOOK_COACH:{slotId}
    SCH_C_REQ: 'SCH_C_REQ',            // SCH_C_REQ:{eventId}_{studentId}

    // --- Розклад (Student) ---
    SCH_STUDENT_BOOK: 'SCH_STUDENT_BOOK',
    SCH_S_REQ: 'SCH_S_REQ',                    // SCH_S_REQ:{slotId}
    SCH_S_CONFIRM: 'SCH_S_CONFIRM',            // SCH_S_CONFIRM:{slotId}
    SCH_S_DECLINE: 'SCH_S_DECLINE',            // SCH_S_DECLINE:{slotId}
    SCH_S_MY_SCHEDULE: 'SCH_S_MY_SCHEDULE',
    SCH_S_CANCEL_REQ: 'SCH_S_CANCEL_REQ',      // SCH_S_CANCEL_REQ:{slotId}
    SCH_S_RESCHEDULE_REQ: 'SCH_S_RESCHEDULE_REQ', // SCH_S_RESCHEDULE_REQ:{slotId}

    // --- Навігація ---
    BACK_TO_MAIN: 'BACK_TO_MAIN',
    BACK_TO_PROFILE: 'BACK_TO_PROFILE',
    BACK_TO_HISTORY: 'BACK_TO_HISTORY',
    BACK_TO_STUDENTS: 'BACK_TO_STUDENTS',
    CANCEL_ACTION: 'CANCEL_ACTION',

    // --- Бібліотека вправ ---
    LIBRARY_VIEW: 'LIBRARY_VIEW',
    LIBRARY_GROUP: 'LIBRARY_GROUP',      // LIBRARY_GROUP:{groupId}
    LIBRARY_EXERCISE: 'LIBRARY_EXERCISE',// LIBRARY_EXERCISE:{exerciseId}

    // --- Звіти тренера ---
    REPORTS_MENU: 'REPORTS_MENU',
    REPORTS_TRAININGS: 'REPORTS_TRAININGS',
    REPORTS_INCOME: 'REPORTS_INCOME',

    // --- Вартість тренувань (Pricing) ---
    PRICING_MENU: 'PRICING_MENU',
    PRICING_SET_DEFAULT: 'PRICING_SET_DEFAULT',
    PRICING_SET_INDIVIDUAL: 'PRICING_SET_INDIVIDUAL',
    PRICING_CHANGE: 'PRICING_CHANGE',
    PRICING_TYPE_PERSONAL: 'PRICING_TYPE_PERSONAL',
    PRICING_TYPE_SPLIT: 'PRICING_TYPE_SPLIT',
    PRICING_TYPE_TRIO: 'PRICING_TYPE_TRIO'
  }),

  // ========================================
  // 🔤 ПРЕФІКСИ CALLBACK (команда + параметри)
  // ========================================
  CALLBACK_PREFIXES: Object.freeze({

    // Міста
    CITY: 'CITY',                      // CITY:{cityName}

    // Тренування / бібліотека
    GROUP: 'GROUP',                    // GROUP:{groupId}
    EXERCISE: 'EXERCISE',              // EXERCISE:{exerciseId}
    CIRCUIT_ADD: 'CIRCUIT_ADD',        // CIRCUIT_ADD:{exerciseId}
    CIRCUIT_EXERCISE: 'CIRCUIT_EXERCISE', // CIRCUIT_EXERCISE:{index}

    // SELF режим
    SELF_GROUP: 'SELF_GROUP',                  // SELF_GROUP:{groupId}
    SELF_EXERCISE: 'SELF_EXERCISE',            // SELF_EXERCISE:{exerciseId}
    SELF_CIRCUIT_ADD: 'SELF_CIRCUIT_ADD',      // SELF_CIRCUIT_ADD:{exerciseId}
    SELF_CIRCUIT_EXERCISE: 'SELF_CIRCUIT_EXERCISE', // SELF_CIRCUIT_EXERCISE:{index}

    // Історія
    HISTORY_GROUP: 'HISTORY_GROUP',            // HISTORY_GROUP:{groupId}
    HISTORY_EXERCISE: 'HISTORY_EXERCISE',      // HISTORY_EXERCISE:{exerciseId}
    HISTORY_ITEM: 'HISTORY_ITEM',              // HISTORY_ITEM:{idRecords}

    // Тренер-Учень
    VIEW_STUDENT: 'VIEW_STUDENT',              // VIEW_STUDENT:{chatId}
    COACH_TRAIN: 'COACH_TRAIN',                // COACH_TRAIN:{chatId}
    COACH_HISTORY: 'COACH_HISTORY',            // COACH_HISTORY:{chatId}
    COACH_BOOK: 'COACH_BOOK',                  // COACH_BOOK:{chatId}
    COACH_PROFILE: 'COACH_PROFILE',            // COACH_PROFILE:{chatId}
    COACH_PICK: 'COACH_PICK',                  // COACH_PICK:{chatId}
    PRICING_STUDENT: 'PRICING_STUDENT',        // PRICING_STUDENT:{chatId} — індивідуальна вартість для учня
    STUDENT_TRAINING_TYPE: 'STUDENT_TRAINING_TYPE',  // STUDENT_TRAINING_TYPE:{chatId} — відкрити вибір типу тренування
    STUDENT_TYPE_PERSONAL: 'STUDENT_TYPE_PERSONAL',  // STUDENT_TYPE_PERSONAL:{chatId}
    STUDENT_TYPE_SPLIT: 'STUDENT_TYPE_SPLIT',         // STUDENT_TYPE_SPLIT:{chatId}
    STUDENT_TYPE_TRIO: 'STUDENT_TYPE_TRIO',          // STUDENT_TYPE_TRIO:{chatId}

    // Бібліотека вправ
    LIBRARY_GROUP: 'LIBRARY_GROUP',            // LIBRARY_GROUP:{groupName}
    LIBRARY_EXERCISE: 'LIBRARY_EXERCISE'       // LIBRARY_EXERCISE:{exerciseId}
  }),

  // ========================================
  // 💪 М'ЯЗОВІ ГРУПИ (для UI / ExerciseLibrary.GroupName)
  // ========================================
  MUSCLE_GROUPS: Object.freeze([
    'Груди',
    'Спина',
    'Ноги',
    'Плечі',
    'Руки',
    'Прес',
    'Кардіо'
  ]),

  // ========================================
  // 📅 ФОРМАТИ ДАТ (DATE FORMATS)
  // ========================================
  DATE_FORMATS: Object.freeze({
    // Для відображення користувачу
    FULL_TIMESTAMP: 'ДД.ММ.РРРР ГГ:ХХ', // "03.02.2026 14:35"
    DATE_ONLY: 'ДД.ММ.РРРР',            // "03.02.2026"
    TIME_ONLY: 'ГГ:ХХ',                 // "14:35"

    // Регулярні вирази для валідації вводу
    INPUT_DATE_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/, // 15.05.1995
    INPUT_TIME_PATTERN: /^\d{2}:\d{2}$/,

    // Внутрішній формат зберігання в Sheets
    STORAGE: 'Date Object'
  }),

  // ========================================
  // 📍 ІНВАЙТ КОД (INVITE CODE)
  // ========================================
  INVITE: Object.freeze({
    PREFIX: 'INVITE_',
    MAX_ATTEMPTS: 5  // Максимальна кількість спроб генерації унікального коду
  }),

  // ========================================
  // 📊 ІНДЕКСИ КОЛОНОК (COLUMN INDEXES, 0-based: A=0)
  // ========================================
  COLUMNS: Object.freeze({

    USERS: Object.freeze({
      CREATED_AT: 0,     // A
      USER_ID: 1,        // B
      CHAT_ID: 2,        // C
      FIRST_NAME: 3,     // D
      LAST_NAME: 4,      // E
      CITY: 5,           // F
      ROLE: 6,           // G
      GENDER: 7,         // H
      AGE: 8,            // I
      GOAL: 9,           // J
      COACH_ID: 10,      // K
      BIRTH_DATE: 11,    // L
      HEIGHT: 12,        // M
      WEIGHT: 13,        // N
      WAIST: 14,         // O
      HIP: 15,           // P
      GLUTES: 16,        // Q
      ARM: 17,           // R
      INSTAGRAM: 18,     // S
      CALENDAR_ID: 19    // T
    }),

    EXERCISE_LIBRARY: Object.freeze({
      ID: 0,               // A
      GROUP_NAME: 1,       // B
      EXERCISE_NAME: 2,    // C
      EQUIPMENT: 3,        // D
      ACTIVE: 4,           // E
      COMMENT: 5,          // F
      FOCUS_POINT: 6,      // G
      COMMON_MISTAKES: 7,  // H
      PROPER_FEELING: 8,   // I
      STATIC_HOLDS: 9,     // J
      YOUTUBE_LINK: 10,    // K
      MY_CHANNEL_LINK: 11  // L
    }),

    BOT_TRAINING_DATA: Object.freeze({
      ID_RECORDS: 0,   // A
      DATE: 1,         // B
      EXERCISE_ID: 2,  // C
      EXERCISE: 3,     // D
      WEIGHT: 4,       // E
      REPS: 5,         // F
      SET: 6,          // G
      CHAT_ID: 7       // H
    }),

    MEASUREMENTS_HISTORY: Object.freeze({
      CHAT_ID: 0,   // A
      DATE: 1,      // B
      HEIGHT: 2,    // C
      WEIGHT: 3,    // D
      WAIST: 4,     // E
      HIP: 5,       // F
      GLUTES: 6,    // G
      ARM: 7,       // H
      SOURCE: 8     // I
    }),

    WORKOUT_SCHEDULE: Object.freeze({
      ID: 0,             // A
      COACH_ID: 1,       // B
      STUDENT_ID: 2,     // C
      DATE: 3,           // D
      TIME: 4,           // E
      STATUS: 5,         // F
      UPDATED_AT: 6,     // G
      CAL_EVENT_ID: 7,   // H
      PRICE_CHARGED: 8,   // I
      CURRENCY: 9,        // J
      TRAINING_TYPE: 10   // K — PERSONAL | SPLIT | TRIO (заповнюється при COMPLETED)
    }),

    PRICING: Object.freeze({
      COACH_ID: 0,                // A
      STUDENT_ID: 1,              // B (порожньо = тариф за замовчуванням)
      PRICE_PERSONAL: 2,          // C
      PRICE_SPLIT: 3,             // D
      PRICE_TRIO: 4,              // E
      CURRENCY: 5,                // F
      UPDATED_AT: 6,              // G
      DEFAULT_TRAINING_TYPE: 7    // H — тип тренування за замовчуванням для учня (PERSONAL|SPLIT|TRIO)
    }),

    CITY_LIST: Object.freeze({
      CITY_ID: 0,      // A
      CITY_NAME: 1     // B
    }),

    LOGS: Object.freeze({
      TIMESTAMP: 0,  // A
      CONTEXT: 1,    // B
      MESSAGE: 2,    // C
      STACK: 3       // D
    }),

    TRAINING_PLANS: Object.freeze({
      PLAN_ID: 0,      // A
      COACH_ID: 1,     // B
      PLAN_NAME: 2,    // C
      GOAL: 3,         // D
      LEVEL: 4,        // E
      DESCRIPTION: 5,  // F
      IS_ACTIVE: 6     // G
    }),

    TRAINING_PLAN_EXERCISES: Object.freeze({
      PLAN_ID: 0,       // A
      DAY: 1,           // B
      EXERCISE_NAME: 2, // C
      SETS: 3,          // D
      REPS: 4,          // E
      REST_SEC: 5,      // F
      NOTES: 6          // G
    })
  }),

  // ========================================
  // 🔢 ВАЛІДАЦІЯ (VALIDATION LIMITS)
  // ========================================
  VALIDATION: Object.freeze({

    // Ім'я / прізвище
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 30,
    LASTNAME_MIN_LENGTH: 2,
    LASTNAME_MAX_LENGTH: 50,

    // Місто
    CITY_MIN_LENGTH: 2,
    CITY_MAX_LENGTH: 50,

    // Заміри тіла
    HEIGHT_MIN: 100,
    HEIGHT_MAX: 250,
    WEIGHT_MIN: 30,
    WEIGHT_MAX: 300,
    WAIST_MIN: 40,
    WAIST_MAX: 200,
    HIP_MIN: 40,
    HIP_MAX: 200,
    GLUTES_MIN: 40,
    GLUTES_MAX: 200,
    ARM_MIN: 15,
    ARM_MAX: 80,

    // Тренування
    TRAINING_WEIGHT_MIN: 0.5,
    TRAINING_WEIGHT_MAX: 500,
    TRAINING_REPS_MIN: 1,
    TRAINING_REPS_MAX: 999,
    TRAINING_SETS_MIN: 1,
    TRAINING_SETS_MAX: 20,

    // Історія
    HISTORY_N_MIN: 1,
    HISTORY_N_MAX: 100,

    // Рік народження
    BIRTH_YEAR_MIN: 1900,
    BIRTH_YEAR_MAX_OFFSET: 0, // Поточний рік

    // Вартість тренувань (ввід суми в Registration, лист Pricing)
    PRICE_MIN: 0,
    PRICE_MAX: 999999
  }),

  // ========================================
  // 💰 ВАРТІСТЬ ТРЕНУВАНЬ (PRICING)
  // ========================================
  PRICING: Object.freeze({
    DEFAULT_CURRENCY: 'UAH'
  }),

  // ========================================
  // 🗓️ GOOGLE CALENDAR
  // ========================================
  CALENDAR: Object.freeze({
    PREFIX: 'FIT',  // Префікс для подій в Calendar ("FIT: ...")
    DEFAULT_DURATION_MINUTES: 60,
    COLOR_AVAILABLE: '10',   // Зелений
    COLOR_BOOKED: '11',      // Червоний
    COLOR_CONFIRMED: '5'     // Жовтий
  }),

  // ========================================
  // ⏱️ КЕШУВАННЯ (CACHING)
  // ========================================
  CACHE: Object.freeze({
    TTL_USER: 600,       // 10 хвилин
    TTL_EXERCISES: 3600, // 60 хвилин
    TTL_CITIES: 7200,    // 2 години
    TTL_COACH_STUDENTS: 300, // 5 хвилин
    TTL_REG_STEP: 1800,  // 30 хвилин (fallback для FSM реєстрації)
    TTL_REG_RESUME: 86400, // 24 години
    PREFIX_USER: 'USER_',
    PREFIX_EXERCISES: 'EXERCISES_',
    PREFIX_CITIES: 'CITIES_',
    PREFIX_COACH_STUDENTS: 'COACH_STUDENTS_',
    PREFIX_REG_STEP: 'REG_STEP_',
    PREFIX_REG_RESUME: 'REG_RESUME_'
  }),

  // ========================================
  // 📝 ЛОГУВАННЯ (LOGGING LEVELS)
  // ========================================
  LOG_LEVELS: Object.freeze({
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
  }),

  // ========================================
  // 📈 HISTORY MODES
  // ========================================
  HISTORY_MODES: Object.freeze({
    PROGRESS: 'progress'
  }),

  // ========================================
  // 🎨 EMOJI ДЛЯ UI
  // ========================================
  EMOJI: Object.freeze({
    BACK: '🔙',
    HOME: '🏠',
    CANCEL: '❌',
    OK: '✅',

    STUDENT: '🎓',
    COACH: '👨‍🏫',

    TRAINING: '💪',
    PROFILE: '👤',
    HISTORY: '📊',
    SCHEDULE: '📅',
    LIBRARY: '📚',

    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️'
  }),

  // ========================================
  // 🔐 СПЕЦІАЛЬНІ МАРКЕРИ
  // ========================================
  SPECIAL: Object.freeze({
    SELF_STUDENT_ID: 'SELF',  // Маркер self-training тренера
    SEPARATOR: ':',           // Роздільник callback_data
    ADMIN_CHAT_ID: null       // Заповнити реальним ChatID адміна
  })

});

// ========================================
// 🔧 ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ КОНСТАНТ
// ========================================

/**
 * Перевірити чи рядок є інвайт-кодом
 * @param {string} code
 * @return {boolean}
 */
function isInviteCode(code) {
  return code && String(code).indexOf(CONSTANTS.INVITE.PREFIX) === 0;
}

/**
 * Розпарсити callback_data ("ACTION:PARAM1:PARAM2")
 * @param {string} callbackData
 * @return {{action: string, params: string[]}}
 */
function parseCallbackData(callbackData) {
  var parts = String(callbackData).split(CONSTANTS.SPECIAL.SEPARATOR);
  return {
    action: parts[0],
    params: parts.slice(1)
  };
}

/**
 * Побудувати callback_data з параметрами
 * @param {string} action
 * @param {Array<string|number>} params
 * @return {string}
 */
function buildCallbackData(action, params) {
  if (!params || params.length === 0) {
    return action;
  }
  var sep = CONSTANTS.SPECIAL.SEPARATOR;
  return action + sep + params.join(sep);
}
