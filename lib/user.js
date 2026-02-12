/**
 * User — отримання/створення користувача, міста (через Supabase)
 */
const supabase = require('./supabase');

function getByChatId(chatId) {
  return supabase.getUserByChatId(chatId);
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
    calendarId: userData.calendarId || ''
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

module.exports = { getByChatId, getStudentsByCoach, getCities, createUser, parseBirthDate, calculateAge, updateField, updateMeasurements };
