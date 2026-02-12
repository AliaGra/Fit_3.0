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
    REG_CALENDAR_ID: 'reg_calendar_id'
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
    TRAINING_START: 'TRAINING_START',
    TRAINING_COACH_START: 'TRAINING_COACH_START',
    COACH_STUDENTS: 'COACH_STUDENTS',
    COACH_PICK_START: 'COACH_PICK_START',
    SCH_MY_SCHEDULE: 'SCH_MY_SCHEDULE',
    SCH_STUDENT_BOOK: 'SCH_STUDENT_BOOK',
    SCH_S_MY_SCHEDULE: 'SCH_S_MY_SCHEDULE',
    HISTORY_MENU: 'HISTORY_MENU',
    REPORTS_MENU: 'REPORTS_MENU',
    LIBRARY_VIEW: 'LIBRARY_VIEW'
  }),
  CALLBACK_PREFIXES: Object.freeze({
    COACH_PROFILE: 'COACH_PROFILE',
    CITY: 'CITY'
  }),
  VALIDATION: Object.freeze({
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 30,
    LASTNAME_MIN_LENGTH: 2,
    LASTNAME_MAX_LENGTH: 50,
    CITY_MIN_LENGTH: 2,
    CITY_MAX_LENGTH: 50,
    AGE_MIN: 12,
    AGE_MAX: 100
  }),
  DATE_FORMATS: Object.freeze({
    INPUT_PATTERN: /^\d{2}\.\d{2}\.\d{4}$/,
    EXAMPLE: '15.05.1995'
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
