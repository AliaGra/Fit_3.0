/**
 * User — отримання/створення користувача, міста (через Supabase)
 */
const supabase = require('./supabase');

async function getByChatId(chatId) {
  const user = await supabase.getUserByChatId(chatId);
  if (user && user.birthDate) {
    const d = user.birthDate instanceof Date ? user.birthDate : new Date(user.birthDate);
    if (!isNaN(d.getTime())) user.age = calculateAge(d);
  }
  return user;
}

async function getStudentsByCoach(coachChatId) {
  const user = await getByChatId(coachChatId);
  if (!user || user.role !== 'coach') return [];
  return supabase.getStudentsByCoachId(coachChatId);
}

async function getCities() {
  return supabase.getAllCities();
}

function parseBirthDate(dateStr) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function calculateAge(birthDate) {
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

async function createUser(userData) {
  if (!userData.chatId || !userData.role || !userData.firstName) {
    throw new Error('chatId, role, firstName required');
  }
  const existing = await getByChatId(userData.chatId);
  if (existing) throw new Error('User with this ChatID already exists');

  const birthDate = userData.birthDate ? (userData.birthDate instanceof Date ? userData.birthDate : new Date(userData.birthDate)) : null;
  const age = userData.age != null ? userData.age : (birthDate ? calculateAge(birthDate) : null);

  const full = {
    createdAt: new Date(),
    userId: String(userData.chatId),
    chatId: String(userData.chatId),
    firstName: userData.firstName,
    lastName: userData.lastName || '',
    city: userData.city || '',
    role: userData.role,
    gender: userData.gender || '',
    age: age != null ? age : null,
    goal: userData.goal || '',
    coachId: userData.coachId || null,
    birthDate,
    height: null,
    weight: null,
    waist: null,
    hip: null,
    glutes: null,
    arm: null,
    instagram: userData.instagram || '',
    calendarId: userData.calendarId || '',
    experienceStartDate: userData.experienceStartDate != null ? (userData.experienceStartDate instanceof Date ? userData.experienceStartDate : new Date(userData.experienceStartDate)) : null,
    trainingDaysPerWeek: userData.trainingDaysPerWeek != null ? userData.trainingDaysPerWeek : null,
    activePlanId: userData.activePlanId || null
  };
  const ok = await supabase.insertUser(full);
  if (!ok) throw new Error('Failed to insert user');
  return true;
}

const USER_FIELD_MAP = {
  FIRST_NAME: 'firstName',
  LAST_NAME: 'lastName',
  CITY: 'city',
  ROLE: 'role',
  GENDER: 'gender',
  GOAL: 'goal',
  COACH_ID: 'coachId',
  BIRTH_DATE: 'birthDate',
  AGE: 'age',
  HEIGHT: 'height',
  WEIGHT: 'weight',
  WAIST: 'waist',
  HIP: 'hip',
  GLUTES: 'glutes',
  ARM: 'arm',
  INSTAGRAM: 'instagram',
  CALENDAR_ID: 'calendarId'
};

async function updateField(chatId, fieldName, value) {
  const existing = await getByChatId(chatId);
  if (!existing) throw new Error('User not found');
  const key = USER_FIELD_MAP[fieldName];
  if (!key) throw new Error('Invalid field name: ' + fieldName);
  if (fieldName === 'BIRTH_DATE') {
    const birthDateValue = value ? (value instanceof Date ? value : new Date(value)) : null;
    const age = birthDateValue ? calculateAge(birthDateValue) : null;
    const ok = await supabase.updateUser(chatId, { birthDate: birthDateValue, age });
    if (!ok) throw new Error('Failed to update');
    return true;
  }
  const updates = { [key]: value };
  const ok = await supabase.updateUser(chatId, updates);
  if (!ok) throw new Error('Failed to update');
  return true;
}

async function updateMeasurements(chatId, measurements) {
  const existing = await getByChatId(chatId);
  if (!existing) throw new Error('User not found');
  const updates = {};
  if (measurements.weight !== undefined) updates.weight = measurements.weight;
  if (measurements.waist !== undefined) updates.waist = measurements.waist;
  if (measurements.hip !== undefined) updates.hip = measurements.hip;
  if (measurements.glutes !== undefined) updates.glutes = measurements.glutes;
  if (measurements.arm !== undefined) updates.arm = measurements.arm;
  if (Object.keys(updates).length > 0) {
    const ok = await supabase.updateUser(chatId, updates);
    if (!ok) throw new Error('Failed to update user');
  }
  const historyData = {
    chatId: String(chatId),
    date: new Date(),
    height: null,
    weight: measurements.weight,
    waist: measurements.waist,
    hip: measurements.hip,
    glutes: measurements.glutes,
    arm: measurements.arm,
    source: ''
  };
  const ok = await supabase.insertMeasurement(historyData);
  if (!ok) throw new Error('Failed to save measurement history');
  return true;
}

const INVITE_CODE_PATTERN = /^INVITE_[A-Za-z0-9]+$/;
const INVITE_PREFIX = 'INVITE_';
const MAX_INVITE_ATTEMPTS = 5;

function generateInviteCode() {
  const crypto = require('crypto');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return INVITE_PREFIX + suffix;
}

async function activateInvite(inviteCode, realChatId) {
  const code = String(inviteCode).trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(code)) throw new Error('Invalid invite code format');
  const inviteUser = await supabase.findUserByInviteCode(code);
  if (!inviteUser) throw new Error('Invite code not found');
  if (String(inviteUser.chatId) !== String(code)) throw new Error('Invite code already activated');
  const existing = await getByChatId(realChatId);
  if (existing) throw new Error('This Telegram account is already registered');
  const ok = await supabase.replaceInviteWithChatId(code, realChatId);
  if (!ok) throw new Error('Failed to activate invite');
  return true;
}

/** Прив’язати вже зареєстрованого користувача до тренера за інвайт-кодом (без заміни профілю). */
async function linkCoachByInviteCode(realChatId, inviteCode) {
  const code = String(inviteCode).trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(code)) throw new Error('Invalid invite code format');
  const inviteUser = await supabase.findUserByInviteCode(code);
  if (!inviteUser) throw new Error('Invite code not found');
  if (String(inviteUser.chatId) !== String(code)) throw new Error('Invite code already activated');
  const coachId = inviteUser.coachId || '';
  if (!coachId) throw new Error('Invite code has no coach');
  const existing = await getByChatId(realChatId);
  if (!existing) throw new Error('User not found');
  const ok = await supabase.updateUser(realChatId, { coachId: String(coachId), isArchived: false });
  if (!ok) throw new Error('Failed to update coach');
  await supabase.markInviteAsUsed(code);
  await supabase.updateMedicalConditionsChatId(code, realChatId);
  return true;
}

function experienceLevelToStartDate(level) {
  const now = new Date();
  if (level === '0-3') return now;
  if (level === '4-6') return new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
  if (level === '6-12') return new Date(now.getTime() - 181 * 24 * 60 * 60 * 1000);
  if (level === 'more_year') return new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
  return null;
}

async function createStudentByInvite(coachChatId, firstName, lastName, extra = {}) {
  const coach = await getByChatId(coachChatId);
  if (!coach) throw new Error('Coach not found');
  if (coach.role !== 'coach') throw new Error('User is not a coach');
  let inviteCode;
  let attempts = 0;
  while (attempts < MAX_INVITE_ATTEMPTS) {
    inviteCode = generateInviteCode();
    const exists = await supabase.findUserByInviteCode(inviteCode);
    if (!exists) break;
    attempts++;
  }
  if (attempts >= MAX_INVITE_ATTEMPTS) throw new Error('Cannot generate unique invite code');
  const experienceStartDate = extra.experienceLevel != null ? experienceLevelToStartDate(extra.experienceLevel) : (extra.experienceStartDate != null ? extra.experienceStartDate : null);
  const birthDate = extra.birthDate != null ? (extra.birthDate instanceof Date ? extra.birthDate : new Date(extra.birthDate)) : null;
  await createUser({
    chatId: inviteCode,
    role: 'student',
    firstName: firstName || '',
    lastName: lastName || '',
    coachId: String(coachChatId),
    birthDate: birthDate && !isNaN(birthDate.getTime()) ? birthDate : null,
    age: birthDate && !isNaN(birthDate.getTime()) ? calculateAge(birthDate) : (extra.age != null ? extra.age : null),
    gender: extra.gender || '',
    goal: extra.goal || '',
    experienceStartDate,
    trainingDaysPerWeek: extra.trainingDaysPerWeek != null ? extra.trainingDaysPerWeek : null
  });
  const defaultTrainingType = extra.defaultTrainingType || null;
  if (defaultTrainingType) {
    const coachPricing = await supabase.getCoachPricing(coachChatId);
    const pricing = coachPricing
      ? { ...coachPricing, defaultTrainingType }
      : { pricePersonal: '', priceSplit: '', priceTrio: '', currency: 'UAH', defaultTrainingType };
    await supabase.setPricing(coachChatId, inviteCode, pricing);
  }
  const measurements = {};
  if (extra.weight != null && !isNaN(extra.weight)) measurements.weight = extra.weight;
  if (extra.height != null && !isNaN(extra.height)) measurements.height = extra.height;
  if (extra.waist != null && !isNaN(extra.waist)) measurements.waist = extra.waist;
  if (extra.glutes != null && !isNaN(extra.glutes)) measurements.glutes = extra.glutes;
  if (Object.keys(measurements).length > 0) {
    await supabase.updateUser(inviteCode, measurements);
  }
  return inviteCode;
}

module.exports = { getByChatId, getStudentsByCoach, getCities, createUser, parseBirthDate, calculateAge, updateField, updateMeasurements, activateInvite, linkCoachByInviteCode, createStudentByInvite };
