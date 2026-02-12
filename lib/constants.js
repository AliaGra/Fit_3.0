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
  FSM_STATES: Object.freeze({
    WAITING_FOR_START_CHOICE: 'WAITING_FOR_START_CHOICE',
    REG_ROLE: 'reg_role'
  }),
  CALLBACKS: Object.freeze({
    REG_NEW: 'REG_NEW',
    REG_INVITE: 'REG_INVITE',
    REG_ROLE_STUDENT: 'REG_ROLE_STUDENT',
    REG_ROLE_COACH: 'REG_ROLE_COACH',
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
    COACH_PROFILE: 'COACH_PROFILE'
  }),
  EMOJI: Object.freeze({
    BACK: '🔙',
    HOME: '🏠',
    CANCEL: '❌',
    OK: '✅'
  })
});

module.exports = { CONSTANTS, BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_API_URL };
