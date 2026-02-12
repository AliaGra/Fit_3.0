/**
 * Константи для Node.js бота FIT 3.0 (з env, без PropertiesService)
 */
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const TELEGRAM_API_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}/` : '';

const CONSTANTS = Object.freeze({
  CONFIG: Object.freeze({
    BOT_TOKEN,
    TELEGRAM_API_URL,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    DEBUG: process.env.DEBUG === '1'
  }),
  ROLES: Object.freeze({ STUDENT: 'student', COACH: 'coach' }),
  GENDERS: Object.freeze({ MALE: 'male', FEMALE: 'female' }),
  GOALS: Object.freeze({ LOSE: 'lose', GAIN: 'gain', KEEP: 'keep' }),
  FSM_STATES: Object.freeze({
    WAITING_FOR_START_CHOICE: 'WAITING_FOR_START_CHOICE',
    REG_ROLE: 'reg_role',
    REG_FIRST_NAME: 'reg_first_name',
    REG_FIRST_NAME_DECISION: 'reg_first_name_decision',
    REG_LAST_NAME: 'reg_last_name',
    REG_GENDER: 'reg_gender',
    REG_GOAL: 'reg_goal',
    REG_BIRTH_DATE: 'reg_birth_date',
    REG_CITY: 'reg_city',
    REG_INSTAGRAM: 'reg_instagram',
    REG_CALENDAR_ID: 'reg_calendar_id',
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
    REG_INVITE_INPUT: 'reg_invite_input',
    COACH_ADD_STUDENT_NAME: 'coach_add_student_name',
    SCH_ADD_SLOT_DATE: 'sch_add_slot_date',
    SCH_ADD_SLOT_TIME: 'sch_add_slot_time',
    SCH_SELECT_STUDENT: 'sch_select_student',
    SCH_BOOK_STUDENT: 'sch_book_student',
    REPORTS_TRAININGS_INPUT_DAYS: 'reports_trainings_input_days'
  }),
  SCHEDULE_STATUS: Object.freeze({
    AVAILABLE: 'AVAILABLE',
    REQUESTED: 'REQUESTED',
    BOOKED: 'BOOKED',
    COMPLETED: 'COMPLETED',
    CANCELED: 'CANCELED'
  }),
  INVITE: Object.freeze({
    PREFIX: 'INVITE_',
    MAX_ATTEMPTS: 5
  }),
  CALLBACKS: Object.freeze({
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
    BACK_TO_MAIN: 'BACK_TO_MAIN',
    CANCEL_ACTION: 'CANCEL_ACTION',
    PROFILE_VIEW: 'PROFILE_VIEW',
    PROFILE_UPDATE_MEASUREMENTS: 'PROFILE_UPDATE_MEASUREMENTS',
    PROFILE_EDIT_DATA: 'PROFILE_EDIT_DATA',
    PROFILE_EDIT_FIRSTNAME: 'PROFILE_EDIT_FIRSTNAME',
    PROFILE_EDIT_LASTNAME: 'PROFILE_EDIT_LASTNAME',
    PROFILE_EDIT_CITY: 'PROFILE_EDIT_CITY',
    PROFILE_EDIT_HEIGHT: 'PROFILE_EDIT_HEIGHT',
    PROFILE_EDIT_BIRTHDATE: 'PROFILE_EDIT_BIRTHDATE',
    BACK_TO_PROFILE: 'BACK_TO_PROFILE',
    TRAINING_START: 'TRAINING_START',
    TRAINING_COACH_START: 'TRAINING_COACH_START',
    COACH_STUDENTS: 'COACH_STUDENTS',
    COACH_ADD_STUDENT: 'COACH_ADD_STUDENT',
    COACH_PICK_START: 'COACH_PICK_START',
    SCH_MY_SCHEDULE: 'SCH_MY_SCHEDULE',
    SCH_MY_SLOTS: 'SCH_MY_SLOTS',
    SCH_ADD_SLOT: 'SCH_ADD_SLOT',
    SCH_STUDENT_BOOK: 'SCH_STUDENT_BOOK',
    SCH_S_MY_SCHEDULE: 'SCH_S_MY_SCHEDULE',
    SCH_S_REQ: 'SCH_S_REQ',
    SCH_C_REQ: 'SCH_C_REQ',
    SCH_CONF: 'SCH_CONF',
    SCH_DECLINE: 'SCH_DECLINE',
    SCH_CANCEL: 'SCH_CANCEL',
    SCH_COMPLETE: 'SCH_COMPLETE',
    SCH_BOOK_FOR: 'SCH_BOOK_FOR',
    HISTORY_MENU: 'HISTORY_MENU',
    REPORTS_MENU: 'REPORTS_MENU',
    REPORTS_TRAININGS: 'REPORTS_TRAININGS',
    REPORTS_INCOME: 'REPORTS_INCOME',
    LIBRARY_VIEW: 'LIBRARY_VIEW'
  }),
  CALLBACK_PREFIXES: Object.freeze({
    COACH_PROFILE: 'COACH_PROFILE',
    CITY: 'CITY',
    VIEW_STUDENT: 'VIEW_STUDENT',
    COACH_TRAIN: 'COACH_TRAIN',
    COACH_HISTORY: 'COACH_HISTORY',
    COACH_BOOK: 'COACH_BOOK',
    STUDENT_TRAINING_TYPE: 'STUDENT_TRAINING_TYPE'
  }),
  VALIDATION: Object.freeze({
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 30,
    LASTNAME_MIN_LENGTH: 2,
    LASTNAME_MAX_LENGTH: 50,
    CITY_MIN_LENGTH: 2,
    CITY_MAX_LENGTH: 50,
    AGE_MIN: 12,
    AGE_MAX: 100,
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
    ARM_MAX: 80
  }),
  DATE_FORMATS: Object.freeze({
    INPUT_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/,
    EXAMPLE: '15.05.1995'
  }),
  SCHEDULE_FORMATS: Object.freeze({
    DATE_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/,
    DATE_EXAMPLE: '10.02.2026',
    TIME_PATTERN: /^([01]?\d|2[0-3]):([0-5]\d)$/,
    TIME_EXAMPLE: '15:00'
  }),
  REG_PATTERNS: Object.freeze({
    INSTAGRAM_URL: /^https?:\/\/(www\.)?instagram\.com\/[^\s/]+\/?(\?.*)?$/i,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }),
  EMOJI: Object.freeze({
    BACK: '🔙',
    HOME: '🏠',
    CANCEL: '❌',
    OK: '✅'
  })
});

module.exports = { CONSTANTS, BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_API_URL };
