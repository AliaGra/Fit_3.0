/**
 * User — отримання/створення користувача, міста (через Supabase)
 */
const supabase = require('./supabase');

function getByChatId(chatId) {
  return supabase.getUserByChatId(chatId);
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

module.exports = { getByChatId, getCities, createUser, parseBirthDate, calculateAge };
