/**
 * User — отримання/створення користувача, міста (через Supabase)
 */
const supabase = require('./supabase');
const Helpers = require('./helpers');
const { calcNEATCoefficient } = require('./activityProfile');
const BodyType = require('./bodyType');

const { CONSTANTS } = require('./constants');

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isCoach(user) {
  return !!user && normalizeRole(user.role) === CONSTANTS.ROLES.COACH;
}

function isStudent(user) {
  return !!user && normalizeRole(user.role) === CONSTANTS.ROLES.STUDENT;
}

function isVenueOwner(user) {
  return !!user && normalizeRole(user.role) === CONSTANTS.ROLES.VENUE_OWNER;
}

async function getByChatId(chatId) {
  const id = String(chatId || '').trim();
  if (!id) return null;

  let user = await supabase.getUserByChatId(id);
  if (!user) {
    const byUserId = await supabase.getUserByUserId(id);
    if (byUserId && String(byUserId.userId) === id) {
      if (String(byUserId.chatId) !== id) {
        await supabase.syncUserChatIdToUserId(id);
        byUserId.chatId = id;
      }
      user = byUserId;
    }
  }
  if (user && user.birthDate) {
    const d = user.birthDate instanceof Date ? user.birthDate : new Date(user.birthDate);
    if (!isNaN(d.getTime())) user.age = calculateAge(d);
  }
  return user;
}

async function getStudentsByCoach(coachChatId) {
  const user = await getByChatId(coachChatId);
  if (!isCoach(user)) return [];
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
    oblast: userData.oblast != null && String(userData.oblast).trim() !== '' ? String(userData.oblast).trim() : '',
    district: userData.district != null && String(userData.district).trim() !== '' ? String(userData.district).trim() : '',
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
    shoulders: null,
    chest: null,
    bodyFatPct: null,
    instagram: userData.instagram || '',
    coachTrainingTypes: Array.isArray(userData.coachTrainingTypes) ? userData.coachTrainingTypes : [],
    coachServiceModes: Array.isArray(userData.coachServiceModes) ? userData.coachServiceModes : [],
    coachGroupTrainingDetails: userData.coachGroupTrainingDetails != null ? String(userData.coachGroupTrainingDetails) : '',
    calendarId: userData.calendarId || '',
    experienceStartDate: userData.experienceStartDate != null ? (userData.experienceStartDate instanceof Date ? userData.experienceStartDate : new Date(userData.experienceStartDate)) : null,
    trainingDaysPerWeek: userData.trainingDaysPerWeek != null ? userData.trainingDaysPerWeek : null,
    activePlanId: userData.activePlanId || null,
    accentZones: Array.isArray(userData.accentZones) ? userData.accentZones : (userData.accentZones ? [].concat(userData.accentZones) : []),
    avoidZones: Array.isArray(userData.avoidZones) ? userData.avoidZones : (userData.avoidZones ? [].concat(userData.avoidZones) : []),
    adsOptIn: userData.adsOptIn !== false
  };
  const ok = await supabase.insertUser(full);
  if (!ok) throw new Error('Failed to insert user');
  return true;
}

/**
 * Оновити профіль активності: jobType, transportType, stepsCategory, dailySteps, extraActivity.
 * activityLevel та neatCoefficient рахуються автоматично.
 */
async function updateActivityProfile(chatId, data) {
  const { level, coefficient } = calcNEATCoefficient({
    jobType: data.jobType,
    transport: data.transportType,
    steps: data.stepsCategory,
    extraActivity: data.extraActivity
  });
  const updates = {
    jobType: data.jobType || null,
    transportType: data.transportType || null,
    stepsCategory: data.stepsCategory || null,
    dailySteps: data.dailySteps != null ? data.dailySteps : null,
    extraActivity: data.extraActivity || null,
    activityLevel: level,
    neatCoefficient: coefficient
  };
  const ok = await supabase.updateUser(chatId, updates);
  if (!ok) throw new Error('Failed to update activity profile');
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
  if (measurements.height !== undefined) updates.height = measurements.height;
  if (measurements.weight !== undefined) updates.weight = measurements.weight;
  if (measurements.waist !== undefined) updates.waist = measurements.waist;
  if (measurements.hip !== undefined) updates.hip = measurements.hip;
  if (measurements.glutes !== undefined) updates.glutes = measurements.glutes;
  if (measurements.arm !== undefined) updates.arm = measurements.arm;
  if (measurements.armFlex !== undefined) updates.armFlex = measurements.armFlex;
  if (measurements.shoulders !== undefined) updates.shoulders = measurements.shoulders;
  if (measurements.chest !== undefined) updates.chest = measurements.chest;
  if (measurements.neck !== undefined) updates.neck = measurements.neck;
  if (measurements.wrist !== undefined) updates.wrist = measurements.wrist;
  if (measurements.bodyFatPct !== undefined) updates.bodyFatPct = measurements.bodyFatPct;
  if (Object.keys(updates).length > 0) {
    const ok = await supabase.updateUser(chatId, updates);
    if (!ok) throw new Error('Failed to update user');
  }
  const historyData = {
    chatId: String(chatId),
    date: new Date(),
    height: measurements.height,
    weight: measurements.weight,
    waist: measurements.waist,
    hip: measurements.hip,
    glutes: measurements.glutes,
    arm: measurements.arm,
    armFlex: measurements.armFlex,
    shoulders: measurements.shoulders,
    chest: measurements.chest,
    neck: measurements.neck,
    wrist: measurements.wrist,
    bodyFatPct: measurements.bodyFatPct,
    source: ''
  };
  const ok = await supabase.insertMeasurement(historyData);
  if (!ok) throw new Error('Failed to save measurement history');

  // Оновлюємо детерміновані поля типу фігури/тілобудови/жиру (п.8: сповіщення тренеру — НЕ робимо тут)
  try {
    const merged = {
      height: existing.height,
      weight: existing.weight,
      waist: existing.waist,
      hip: existing.hip,
      glutes: existing.glutes,
      arm: existing.arm,
      armFlex: existing.armFlex,
      shoulders: existing.shoulders,
      chest: existing.chest,
      neck: existing.neck,
      wrist: existing.wrist,
      fatPctManual: existing.fatPctManual != null ? existing.fatPctManual : existing.bodyFatPct,
      ...updates
    };
    const gender = existing.gender;
    const navy = (merged.neck != null && merged.height != null && merged.waist != null && merged.glutes != null)
      ? BodyType.calcBodyFatPctNavy(gender, merged.height, merged.waist, merged.glutes, merged.neck)
      : null;
    const manual = merged.bodyFatPct != null ? merged.bodyFatPct : (merged.fatPctManual != null ? merged.fatPctManual : null);
    const primaryFat = manual != null ? manual : navy;
    const typeResult = BodyType.classifyBodyType({ ...merged, fatPct: primaryFat }, gender);
    const bodyBuild = merged.wrist != null ? BodyType.getBodyBuild(merged.wrist, gender) : null;
    const typeCode = typeResult && typeResult.type ? typeResult.type : null;
    const source = manual != null ? 'manual' : (navy != null ? 'navy' : null);
    await supabase.updateUser(chatId, {
      bodyType: typeCode,
      bodyBuild: bodyBuild,
      fatPctManual: manual != null ? manual : null,
      fatPctNavy: navy != null ? navy : null,
      fatPctSource: source
    });
  } catch (e) {
    console.error('User.updateMeasurements body type calc', e.message || e);
  }

  // Регенерація AI-аналітики тіла при оновленні замірів
  if (measurements.height != null || measurements.weight != null || measurements.waist != null) {
    try {
      const bodyAnalysisAI = require('./ai/bodyAnalysis');
      // Не блокуємо UX (особливо у тренера): AI може відповідати повільно.
      // Запускаємо регенерацію у фоні — меню/повідомлення відправляються одразу.
      Promise.resolve()
        .then(() => bodyAnalysisAI.generateAndSave(chatId, 'measurement_update', measurements))
        .catch((e) => console.error('User.updateMeasurements AI regen', e.message || e));
    } catch (e) {
      console.error('User.updateMeasurements AI regen', e.message || e);
    }
  }

  // MVP: перерахунок аналізу бажаних параметрів при повних замірах
  const hasMinData = measurements.waist != null && measurements.glutes != null && measurements.shoulders != null;
  if (hasMinData) {
    try {
      // lazy require — уникаємо циклічної залежності user.js → bodyGoals.js → user.js
      const bodyGoalsModule = require('./bodyGoals');
      const goalsRow = await supabase.getBodyGoals(chatId);
      if (goalsRow) {
        const current = await supabase.getLatestMeasurementsForGoals(chatId);
        const analysis = bodyGoalsModule.analyzeGoalsVsCurrentState(goalsRow, existing, current, 'measurement_update');
        const prev = goalsRow.goals_analysis || null;
        const notification = bodyGoalsModule.determineNotificationLevel(prev, analysis);
        const setter = goalsRow.set_by_coach != null ? String(goalsRow.set_by_coach) : null;
        await supabase.upsertBodyGoals(setter, chatId, goalsRow, analysis);

        // п.8 (сповіщення тренеру) реалізуємо пізніше окремо — тут нічого не надсилаємо
      }
    } catch (e) {
      console.error('User.updateMeasurements goals analysis', e.message || e);
    }
  }
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
  if (existing) {
    // Resume: user row already exists but invite code is still active (e.g. abandoned mid-registration).
    if (String(inviteUser.chatId) === String(code)) {
      await supabase.replaceInviteWithChatId(code, realChatId);
      return true;
    }
    throw new Error('This Telegram account is already registered');
  }
  // Рядок з user_id = Telegram вже є, але chat_id інший/null — getByChatId не бачить, replaceInvite дає duplicate key → "Failed to activate invite"
  const byUserId = await supabase.getUserByUserId(String(realChatId));
  if (byUserId && String(byUserId.userId) === String(realChatId) && !String(byUserId.userId).toUpperCase().startsWith('INVITE_')) {
    if (String(byUserId.chatId) !== String(realChatId)) {
      const synced = await supabase.syncUserChatIdToUserId(String(realChatId));
      if (!synced) throw new Error('Failed to sync chat_id for existing account');
    }
    await linkCoachByInviteCode(realChatId, code);
    return true;
  }
  await supabase.replaceInviteWithChatId(code, realChatId);
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
  if (level === 'more_year') return new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
  if (level === '2-plus') return new Date(now.getTime() - 731 * 24 * 60 * 60 * 1000);
  return null;
}

async function createStudentByInvite(coachChatId, firstName, lastName, extra = {}) {
  const coach = await getByChatId(coachChatId);
  if (!coach) throw new Error('Coach not found');
  if (!isCoach(coach)) throw new Error('User is not a coach');
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
  if (extra.shoulders != null && !isNaN(extra.shoulders)) measurements.shoulders = extra.shoulders;
  if (extra.chest != null && !isNaN(extra.chest)) measurements.chest = extra.chest;
  if (extra.bodyFatPct != null && !isNaN(extra.bodyFatPct)) measurements.bodyFatPct = extra.bodyFatPct;
  if (Object.keys(measurements).length > 0) {
    await supabase.updateUser(inviteCode, measurements);
  }
  const zoneUpdates = {};
  if (Array.isArray(extra.accentZones) && extra.accentZones.length > 0) zoneUpdates.accentZones = extra.accentZones;
  else if (extra.accentZones !== undefined) zoneUpdates.accentZones = extra.accentZones === null ? [] : [].concat(extra.accentZones);
  if (extra.avoidZones !== undefined) zoneUpdates.avoidZones = Array.isArray(extra.avoidZones) ? extra.avoidZones : (extra.avoidZones ? [].concat(extra.avoidZones) : []);
  if (Object.keys(zoneUpdates).length > 0) {
    await supabase.updateUser(inviteCode, zoneUpdates);
  }
  const activityUpdates = {};
  if (extra.jobType !== undefined) activityUpdates.jobType = extra.jobType;
  if (extra.transportType !== undefined) activityUpdates.transportType = extra.transportType;
  if (extra.stepsCategory !== undefined) activityUpdates.stepsCategory = extra.stepsCategory;
  if (extra.dailySteps !== undefined) activityUpdates.dailySteps = extra.dailySteps;
  if (extra.extraActivity !== undefined) activityUpdates.extraActivity = extra.extraActivity;
  if (extra.activityLevel !== undefined) activityUpdates.activityLevel = extra.activityLevel;
  if (extra.neatCoefficient !== undefined) activityUpdates.neatCoefficient = extra.neatCoefficient;
  if (Object.keys(activityUpdates).length > 0) {
    await supabase.updateUser(inviteCode, activityUpdates);
  }
  return inviteCode;
}

async function syncTelegramUsername(chatId, username) {
  const normalized = Helpers.normalizeTelegramUsername(username);
  if (!normalized) return false;
  const user = await getByChatId(chatId);
  if (!user) return false;
  if (String(user.telegramUsername || '') === normalized) return true;
  const ok = await supabase.updateUser(chatId, { telegramUsername: normalized });
  return !!ok;
}

module.exports = {
  getByChatId,
  getStudentsByCoach,
  getCities,
  createUser,
  parseBirthDate,
  calculateAge,
  updateField,
  updateMeasurements,
  updateActivityProfile,
  activateInvite,
  linkCoachByInviteCode,
  createStudentByInvite,
  normalizeRole,
  isCoach,
  isStudent,
  isVenueOwner,
  syncTelegramUsername
};
