/**
 * Supabase client та методи доступу до даних (Users, bot_state)
 * API сумісний з викликами з User, State
 */
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./constants');

let _client = null;

function getClient() {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v;
  return new Date(v);
}

function userFromRow(r) {
  if (!r) return null;
  return {
    createdAt: toDate(r.created_at),
    userId: r.user_id || '',
    chatId: String(r.chat_id || ''),
    firstName: r.first_name || '',
    lastName: r.last_name || '',
    city: r.city || '',
    role: r.role || '',
    gender: r.gender || '',
    age: r.age != null ? r.age : null,
    goal: r.goal || '',
    coachId: r.coach_id ? String(r.coach_id) : '',
    birthDate: toDate(r.birth_date),
    height: r.height != null ? r.height : null,
    weight: r.weight != null ? r.weight : null,
    waist: r.waist != null ? r.waist : null,
    hip: r.hip != null ? r.hip : null,
    glutes: r.glutes != null ? r.glutes : null,
    arm: r.arm != null ? r.arm : null,
    instagram: r.instagram || '',
    calendarId: r.calendar_id || '',
    experienceStartDate: r.experience_start_date ? toDate(r.experience_start_date) : null,
    trainingDaysPerWeek: r.training_days_per_week != null ? r.training_days_per_week : null,
    activePlanId: r.active_plan_id || null,
    isArchived: r.is_archived === true
  };
}

function userToRow(u) {
  return {
    created_at: (u.createdAt instanceof Date) ? u.createdAt.toISOString() : (u.createdAt || new Date()).toISOString(),
    user_id: u.userId || u.chatId || '',
    chat_id: String(u.chatId || ''),
    first_name: u.firstName || '',
    last_name: u.lastName || '',
    city: u.city || '',
    role: u.role || '',
    gender: u.gender || '',
    age: u.age != null ? u.age : null,
    goal: u.goal || '',
    coach_id: u.coachId || null,
    birth_date: u.birthDate ? (toDate(u.birthDate).toISOString ? toDate(u.birthDate).toISOString() : u.birthDate) : null,
    height: u.height != null ? u.height : null,
    weight: u.weight != null ? u.weight : null,
    waist: u.waist != null ? u.waist : null,
    hip: u.hip != null ? u.hip : null,
    glutes: u.glutes != null ? u.glutes : null,
    arm: u.arm != null ? u.arm : null,
    instagram: u.instagram || '',
    calendar_id: u.calendarId || '',
    experience_start_date: u.experienceStartDate ? (toDate(u.experienceStartDate).toISOString ? toDate(u.experienceStartDate).toISOString() : u.experienceStartDate) : null,
    training_days_per_week: u.trainingDaysPerWeek != null ? u.trainingDaysPerWeek : null,
    active_plan_id: u.activePlanId || null
  };
}

async function insertUser(userData) {
  try {
    const row = userToRow(userData);
    if (!row.chat_id || !row.first_name || !row.role) throw new Error('Missing required: chatId, firstName, role');
    const { error } = await getClient().from('users').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertUser', e.message);
    return false;
  }
}

async function getAllCities() {
  try {
    const { data: rows, error } = await getClient().from('city_list').select('city_id, city_name');
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({ cityId: r.city_id, cityName: r.city_name || '' }));
  } catch (e) {
    console.error('Supabase getAllCities', e.message);
    return [];
  }
}

async function getUserByChatId(chatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('chat_id', String(chatId))
      .limit(1);
    if (error) throw error;
    if (rows && rows.length) return userFromRow(rows[0]);
    return null;
  } catch (e) {
    console.error('Supabase getUserByChatId', e.message);
    return null;
  }
}

/** Активні медичні стани користувача (user_medical_conditions, is_active = true). Для filterExerciseForUser. */
async function getActiveMedicalConditions(chatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('user_medical_conditions')
      .select('mc_code, severity')
      .eq('chat_id', String(chatId))
      .eq('is_active', true);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({ mc_code: (r.mc_code || '').toString().trim(), severity: (r.severity || '').toString().trim() }));
  } catch (e) {
    console.error('Supabase getActiveMedicalConditions', e.message);
    return [];
  }
}

/** Усі записи user_medical_conditions для користувача (з id для видалення). */
async function getMedicalConditionsList(chatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('user_medical_conditions')
      .select('id, mc_code, severity, notes, is_active')
      .eq('chat_id', String(chatId))
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      id: r.id,
      mc_code: (r.mc_code || '').toString().trim(),
      severity: (r.severity || '').toString().trim(),
      notes: r.notes ? String(r.notes).trim() : null,
      is_active: r.is_active === true
    }));
  } catch (e) {
    console.error('Supabase getMedicalConditionsList', e.message);
    return [];
  }
}

/** Додати медичний стан (MC-код + severity). */
async function insertMedicalCondition(chatId, mcCode, severity, notes) {
  try {
    const { error } = await getClient()
      .from('user_medical_conditions')
      .insert({
        chat_id: String(chatId),
        mc_code: String(mcCode).trim(),
        severity: String(severity || '').trim(),
        notes: notes ? String(notes).trim() : null,
        is_active: true
      });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertMedicalCondition', e.message);
    return false;
  }
}

/** Видалити запис за id. */
async function removeMedicalCondition(id) {
  try {
    const { error } = await getClient()
      .from('user_medical_conditions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase removeMedicalCondition', e.message);
    return false;
  }
}

async function getStudentsByCoachId(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .eq('role', 'student')
      .or('is_archived.eq.false,is_archived.is.null');
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => userFromRow(r));
  } catch (e) {
    console.error('Supabase getStudentsByCoachId', e.message);
    return [];
  }
}

/** Архівовані учні тренера (приховані з основного списку). */
async function getArchivedStudentsByCoachId(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .eq('role', 'student')
      .eq('is_archived', true);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => userFromRow(r));
  } catch (e) {
    console.error('Supabase getArchivedStudentsByCoachId', e.message);
    return [];
  }
}

async function findUserByInviteCode(inviteCode) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('user_id', String(inviteCode))
      .limit(1);
    if (error) throw error;
    if (rows && rows.length) return userFromRow(rows[0]);
    return null;
  } catch (e) {
    console.error('Supabase findUserByInviteCode', e.message);
    return null;
  }
}

/** Позначити інвайт-код як використаний (прив’язка вже зареєстрованого користувача до тренера). */
async function markInviteAsUsed(inviteCode) {
  try {
    const code = String(inviteCode);
    const { error } = await getClient()
      .from('users')
      .update({ chat_id: 'USED_' + code })
      .eq('user_id', code);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase markInviteAsUsed', e.message);
    return false;
  }
}

async function replaceInviteWithChatId(inviteCode, realChatId) {
  try {
    const realId = String(realChatId);
    const code = String(inviteCode);
    const { error: errUsers } = await getClient()
      .from('users')
      .update({ user_id: realId, chat_id: realId })
      .eq('user_id', code);
    if (errUsers) throw errUsers;
    const { error: errSlots } = await getClient()
      .from('workout_schedule')
      .update({ student_id: realId, updated_at: new Date().toISOString() })
      .eq('student_id', code);
    if (errSlots) console.error('Supabase replaceInviteWithChatId workout_schedule', errSlots.message);
    const { error: errTraining } = await getClient()
      .from('bot_training_data')
      .update({ chat_id: realId })
      .eq('chat_id', code);
    if (errTraining) console.error('Supabase replaceInviteWithChatId bot_training_data', errTraining.message);
    return true;
  } catch (e) {
    console.error('Supabase replaceInviteWithChatId', e.message);
    return false;
  }
}

async function updateUser(chatId, updates) {
  try {
    const row = {};
    if (updates.firstName !== undefined) row.first_name = updates.firstName;
    if (updates.lastName !== undefined) row.last_name = updates.lastName;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.role !== undefined) row.role = updates.role;
    if (updates.gender !== undefined) row.gender = updates.gender;
    if (updates.goal !== undefined) row.goal = updates.goal;
    if (updates.coachId !== undefined) row.coach_id = updates.coachId;
    if (updates.birthDate !== undefined) row.birth_date = updates.birthDate ? (toDate(updates.birthDate).toISOString ? toDate(updates.birthDate).toISOString() : updates.birthDate) : null;
    if (updates.age !== undefined) row.age = updates.age;
    if (updates.height !== undefined) row.height = updates.height;
    if (updates.weight !== undefined) row.weight = updates.weight;
    if (updates.waist !== undefined) row.waist = updates.waist;
    if (updates.hip !== undefined) row.hip = updates.hip;
    if (updates.glutes !== undefined) row.glutes = updates.glutes;
    if (updates.arm !== undefined) row.arm = updates.arm;
    if (updates.instagram !== undefined) row.instagram = updates.instagram;
    if (updates.calendarId !== undefined) row.calendar_id = updates.calendarId;
    if (updates.experienceStartDate !== undefined) row.experience_start_date = updates.experienceStartDate ? (toDate(updates.experienceStartDate).toISOString ? toDate(updates.experienceStartDate).toISOString() : updates.experienceStartDate) : null;
    if (updates.trainingDaysPerWeek !== undefined) row.training_days_per_week = updates.trainingDaysPerWeek;
    if (updates.activePlanId !== undefined) row.active_plan_id = updates.activePlanId || null;
    if (updates.isArchived !== undefined) row.is_archived = updates.isArchived === true;
    if (Object.keys(row).length === 0) return true;
    const { error } = await getClient().from('users').update(row).eq('chat_id', String(chatId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateUser', e.message, e.code || '', e.details || '');
    return false;
  }
}

function measurementToRow(m) {
  return {
    chat_id: String(m.chatId || ''),
    date: (m.date instanceof Date) ? m.date.toISOString() : new Date().toISOString(),
    height: m.height != null ? m.height : null,
    weight: m.weight != null ? m.weight : null,
    waist: m.waist != null ? m.waist : null,
    hip: m.hip != null ? m.hip : null,
    glutes: m.glutes != null ? m.glutes : null,
    arm: m.arm != null ? m.arm : null,
    source: m.source || ''
  };
}

async function insertMeasurement(data) {
  try {
    const row = measurementToRow(data);
    const { error } = await getClient().from('measurements_history').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertMeasurement', e.message);
    return false;
  }
}

async function getMeasurementHistory(chatId, limit) {
  try {
    let q = getClient().from('measurements_history').select('*').eq('chat_id', String(chatId)).order('date', { ascending: false });
    if (limit != null && limit > 0) q = q.limit(limit);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      chatId: String(r.chat_id || ''),
      date: toDate(r.date),
      height: r.height != null ? r.height : null,
      weight: r.weight != null ? r.weight : null,
      waist: r.waist != null ? r.waist : null,
      hip: r.hip != null ? r.hip : null,
      glutes: r.glutes != null ? r.glutes : null,
      arm: r.arm != null ? r.arm : null,
      source: r.source || ''
    }));
  } catch (e) {
    console.error('Supabase getMeasurementHistory', e.message);
    return [];
  }
}

// --- bot_state (FSM) ---
async function getStateRow(chatId) {
  const { data, error } = await getClient()
    .from('bot_state')
    .select('data')
    .eq('chat_id', String(chatId))
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function setStateRow(chatId, data) {
  const payload = {
    chat_id: String(chatId),
    data: data || {},
    updated_at: new Date().toISOString()
  };
  const { error } = await getClient()
    .from('bot_state')
    .upsert(payload, { onConflict: 'chat_id' });
  if (error) throw error;
}

async function deleteStateRow(chatId) {
  const { error } = await getClient()
    .from('bot_state')
    .delete()
    .eq('chat_id', String(chatId));
  if (error) throw error;
}

// --- workout_schedule (slots) ---
function slotFromRow(r) {
  if (!r) return null;
  return {
    id: r.id || '',
    coachId: String(r.coach_id || ''),
    studentId: r.student_id ? String(r.student_id) : null,
    date: r.date ? new Date(r.date) : null,
    time: r.time || '',
    status: r.status || 'AVAILABLE',
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
    calEventId: r.cal_event_id || null,
    priceCharged: r.price_charged != null ? parseFloat(r.price_charged) : null,
    currency: (r.currency || '').toString(),
    trainingType: (r.training_type || '').toString()
  };
}

function slotToRow(s) {
  return {
    id: s.id || '',
    coach_id: s.coachId || '',
    student_id: s.studentId || null,
    date: (s.date instanceof Date) ? s.date.toISOString() : (s.date ? new Date(s.date).toISOString() : new Date().toISOString()),
    time: (s.time || '').toString(),
    status: s.status || 'AVAILABLE',
    updated_at: (s.updatedAt instanceof Date) ? s.updatedAt.toISOString() : new Date().toISOString(),
    cal_event_id: s.calEventId || null,
    price_charged: s.priceCharged != null ? s.priceCharged : null,
    currency: (s.currency || '').toString(),
    training_type: (s.trainingType || '').toString()
  };
}

async function insertScheduleSlot(slotData) {
  try {
    const row = slotToRow(slotData);
    if (!row.id || !row.coach_id) throw new Error('id and coachId required');
    const { error } = await getClient().from('workout_schedule').insert(row);
    if (error) throw error;
    return row.id;
  } catch (e) {
    console.error('Supabase insertScheduleSlot', e.message);
    return null;
  }
}

async function getSlotById(slotId) {
  try {
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('*')
      .eq('id', String(slotId))
      .limit(1);
    if (error) throw error;
    if (rows && rows.length) return slotFromRow(rows[0]);
    return null;
  } catch (e) {
    console.error('Supabase getSlotById', e.message);
    return null;
  }
}

async function getSlotsByCoachAndStatus(coachChatId, status) {
  try {
    let q = getClient().from('workout_schedule').select('*').eq('coach_id', String(coachChatId)).order('date', { ascending: true }).order('time', { ascending: true });
    if (status != null && status !== '') q = q.eq('status', status);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => slotFromRow(r));
  } catch (e) {
    console.error('Supabase getSlotsByCoachAndStatus', e.message);
    return [];
  }
}

async function getSlotsByStudentAndStatus(studentChatId, status) {
  try {
    let q = getClient().from('workout_schedule').select('*').eq('student_id', String(studentChatId)).order('date', { ascending: true }).order('time', { ascending: true });
    if (status != null && status !== '') q = q.eq('status', status);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => slotFromRow(r));
  } catch (e) {
    console.error('Supabase getSlotsByStudentAndStatus', e.message);
    return [];
  }
}

async function updateScheduleSlotStatus(slotId, newStatus) {
  try {
    const { error } = await getClient()
      .from('workout_schedule')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', String(slotId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateScheduleSlotStatus', e.message);
    return false;
  }
}

async function updateScheduleSlotStudentId(slotId, studentChatId) {
  try {
    const { error } = await getClient()
      .from('workout_schedule')
      .update({ student_id: studentChatId || null, updated_at: new Date().toISOString() })
      .eq('id', String(slotId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateScheduleSlotStudentId', e.message);
    return false;
  }
}

async function updateScheduleSlotPrice(slotId, priceCharged, currency) {
  try {
    const { error } = await getClient()
      .from('workout_schedule')
      .update({
        price_charged: priceCharged != null ? parseFloat(priceCharged) : null,
        currency: (currency || '').toString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', String(slotId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateScheduleSlotPrice', e.message);
    return false;
  }
}

// --- pricing (таблиця pricing: coach_id, student_id null = тариф за замовчуванням) ---
async function getCoachPricing(coachId) {
  try {
    const { data: rows, error } = await getClient()
      .from('pricing')
      .select('*')
      .eq('coach_id', String(coachId))
      .is('student_id', null)
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      pricePersonal: r.price_personal != null ? parseFloat(r.price_personal) : null,
      priceSplit: r.price_split != null ? parseFloat(r.price_split) : null,
      priceTrio: r.price_trio != null ? parseFloat(r.price_trio) : null,
      currency: (r.currency || '').toString(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      defaultTrainingType: (r.default_training_type || '').toString().trim()
    };
  } catch (e) {
    console.error('Supabase getCoachPricing', e.message);
    return null;
  }
}

async function getStudentPricing(coachId, studentId) {
  try {
    const { data: rows, error } = await getClient()
      .from('pricing')
      .select('*')
      .eq('coach_id', String(coachId))
      .eq('student_id', String(studentId))
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      pricePersonal: r.price_personal != null ? parseFloat(r.price_personal) : null,
      priceSplit: r.price_split != null ? parseFloat(r.price_split) : null,
      priceTrio: r.price_trio != null ? parseFloat(r.price_trio) : null,
      currency: (r.currency || '').toString(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      defaultTrainingType: (r.default_training_type || '').toString().trim()
    };
  } catch (e) {
    console.error('Supabase getStudentPricing', e.message);
    return null;
  }
}

async function getCurrentPrice(coachId, studentId, trainingType) {
  const { CONSTANTS } = require('./constants');
  let row = await getStudentPricing(coachId, studentId);
  if (!row) row = await getCoachPricing(coachId);
  if (!row) return null;
  let price = null;
  if (trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL) price = row.pricePersonal;
  else if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) price = row.priceSplit;
  else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) price = row.priceTrio;
  if (price === null || price === undefined || price === '') return null;
  const num = parseFloat(price);
  if (isNaN(num) || num < 0) return null;
  const defaultCurrency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH';
  return {
    price: num,
    currency: (row.currency || defaultCurrency).toString().trim()
  };
}

async function setPricing(coachId, studentId, data) {
  try {
    coachId = String(coachId);
    studentId = studentId != null && studentId !== '' ? String(studentId) : null;
    const existing = studentId
      ? await getStudentPricing(coachId, studentId)
      : await getCoachPricing(coachId);
    const { CONSTANTS } = require('./constants');
    const defaultCurrency = (CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH';
    const toNum = (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const row = {
      coach_id: coachId,
      student_id: studentId,
      price_personal: toNum(data.pricePersonal),
      price_split: toNum(data.priceSplit),
      price_trio: toNum(data.priceTrio),
      currency: (data.currency || defaultCurrency).toString(),
      updated_at: new Date().toISOString(),
      default_training_type: (data.defaultTrainingType || '').toString()
    };
    if (existing) {
      let q = getClient().from('pricing').update(row).eq('coach_id', coachId);
      if (studentId != null) q = q.eq('student_id', studentId);
      else q = q.is('student_id', null);
      const { error } = await q;
      if (error) throw error;
    } else {
      const { error } = await getClient().from('pricing').insert(row);
      if (error) throw error;
    }
    return true;
  } catch (e) {
    console.error('Supabase setPricing', e.message);
    return false;
  }
}

async function getMaxSlotDateByCoach(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('date')
      .eq('coach_id', String(coachChatId))
      .order('date', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length || !rows[0].date) return null;
    const d = new Date(rows[0].date);
    d.setHours(0, 0, 0, 0);
    return d;
  } catch (e) {
    console.error('Supabase getMaxSlotDateByCoach', e.message);
    return null;
  }
}

async function slotExists(coachChatId, dateStr, timeStr) {
  try {
    const dateStart = dateStr + 'T00:00:00.000Z';
    const dateEnd = dateStr + 'T23:59:59.999Z';
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('id')
      .eq('coach_id', String(coachChatId))
      .eq('time', timeStr)
      .gte('date', dateStart)
      .lte('date', dateEnd)
      .limit(1);
    if (error) throw error;
    return rows && rows.length > 0;
  } catch (e) {
    console.error('Supabase slotExists', e.message);
    return false;
  }
}

async function getCoachScheduleSettings(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('coach_schedule_settings')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      coachId: String(r.coach_id),
      restDays: Array.isArray(r.rest_days) ? r.rest_days : [],
      workoutDurationMin: parseInt(r.workout_duration_min, 10) || 60,
      workStart: (r.work_start || '09:00').toString(),
      workEnd: (r.work_end || '21:00').toString(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : null
    };
  } catch (e) {
    console.error('Supabase getCoachScheduleSettings', e.message);
    return null;
  }
}

async function upsertCoachScheduleSettings(settings) {
  try {
    const row = {
      coach_id: String(settings.coachId),
      rest_days: Array.isArray(settings.restDays) ? settings.restDays : [],
      workout_duration_min: parseInt(settings.workoutDurationMin, 10) || 60,
      work_start: (settings.workStart || '09:00').toString(),
      work_end: (settings.workEnd || '21:00').toString(),
      updated_at: new Date().toISOString()
    };
    const { error } = await getClient()
      .from('coach_schedule_settings')
      .upsert(row, { onConflict: 'coach_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase upsertCoachScheduleSettings', e.message);
    return false;
  }
}

// --- coach_vacation_days (відпустка тренера — цілий день недоступний для учнів) ---
async function getCoachVacationDateKeys(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('coach_vacation_days')
      .select('date')
      .eq('coach_id', String(coachChatId));
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => (r.date || '').toString()).filter(Boolean);
  } catch (e) {
    console.error('Supabase getCoachVacationDateKeys', e.message);
    return [];
  }
}

async function addCoachVacationDay(coachChatId, dateKey) {
  try {
    const { error } = await getClient()
      .from('coach_vacation_days')
      .upsert({ coach_id: String(coachChatId), date: String(dateKey) }, { onConflict: 'coach_id,date' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase addCoachVacationDay', e.message);
    return false;
  }
}

async function removeCoachVacationDay(coachChatId, dateKey) {
  try {
    const { error } = await getClient()
      .from('coach_vacation_days')
      .delete()
      .eq('coach_id', String(coachChatId))
      .eq('date', String(dateKey));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase removeCoachVacationDay', e.message);
    return false;
  }
}

/** Слоти тренера на дату зі статусом BOOKED або REQUESTED (зайняті) */
async function getCoachOccupiedSlotsOnDate(coachChatId, dateKey) {
  try {
    const dateStart = dateKey + 'T00:00:00.000Z';
    const dateEnd = dateKey + 'T23:59:59.999Z';
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .in('status', ['BOOKED', 'REQUESTED'])
      .gte('date', dateStart)
      .lte('date', dateEnd);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => slotFromRow(r));
  } catch (e) {
    console.error('Supabase getCoachOccupiedSlotsOnDate', e.message);
    return [];
  }
}

async function getBookedSlotsInWindow(startDt, endDt) {
  try {
    const dateStart = startDt.toISOString().slice(0, 10);
    const dateEnd = endDt.toISOString().slice(0, 10);
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('*')
      .not('student_id', 'is', null)
      .eq('status', 'BOOKED')
      .gte('date', dateStart)
      .lte('date', dateEnd);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const slots = rows.map((r) => slotFromRow(r));
    const result = [];
    for (const s of slots) {
      const slotDt = slotToDatetime(s.date, s.time);
      if (slotDt >= startDt && slotDt < endDt) result.push(s);
    }
    return result;
  } catch (e) {
    console.error('Supabase getBookedSlotsInWindow', e.message);
    return [];
  }
}

function slotToDatetime(dateObj, timeStr) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const [h = 0, m = 0] = (String(timeStr || '00:00').match(/\d+/g) || []).map(Number);
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

async function wasReminderSent(slotId) {
  try {
    const { data: rows, error } = await getClient()
      .from('reminders_sent')
      .select('slot_id')
      .eq('slot_id', String(slotId))
      .limit(1);
    if (error) throw error;
    return rows && rows.length > 0;
  } catch (e) {
    console.error('Supabase wasReminderSent', e.message);
    return true;
  }
}

async function insertReminderSent(slotId) {
  try {
    const { error } = await getClient()
      .from('reminders_sent')
      .upsert({ slot_id: String(slotId), sent_at: new Date().toISOString() }, { onConflict: 'slot_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertReminderSent', e.message);
    return false;
  }
}

async function getCompletedTrainingsByCoach(coachChatId, daysBack) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);
    const startISO = startDate.toISOString();
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .eq('status', 'COMPLETED')
      .not('student_id', 'is', null)
      .gte('date', startISO)
      .order('date', { ascending: true });
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => slotFromRow(r));
  } catch (e) {
    console.error('Supabase getCompletedTrainingsByCoach', e.message);
    return [];
  }
}

// --- exercise_library ---
// Показуємо всі вправи, крім явно прихованих (active = 'NO')
function activeFilter(q) {
  return q.or('active.is.null,active.neq.NO');
}

/** Унікальні group_level1 для бібліотеки (перший рівень груп) */
async function getTopLevelGroups() {
  try {
    let q = getClient()
      .from('exercise_library')
      .select('group_level1')
      .not('group_level1', 'is', null);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const seen = {};
    const result = [];
    for (const r of rows) {
      const v = (r.group_level1 || '').toString().trim();
      if (v && !seen[v]) {
        seen[v] = true;
        result.push(v);
      }
    }
    return result.sort();
  } catch (e) {
    console.error('Supabase getTopLevelGroups', e.message);
    return [];
  }
}

async function getExercisesByGroup(groupLevel1, groupLevel2, groupLevel3) {
  try {
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru')
      .eq('group_level1', String(groupLevel1 || ''));
    q = activeFilter(q);
    if (groupLevel2 != null && String(groupLevel2).trim() !== '') {
      q = q.eq('group_level2', String(groupLevel2));
    }
    if (groupLevel3 != null && String(groupLevel3).trim() !== '' && groupLevel3 !== '__all__') {
      q = q.eq('group_level3', String(groupLevel3));
    }
    q = q.order('name_ua', { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      id: r.id,
      groupLevel1: r.group_level1 || '',
      groupLevel2: r.group_level2 || '',
      groupLevel3: r.group_level3 || '',
      name: (r.name_ua || r.name_ru || '').toString()
    }));
  } catch (e) {
    console.error('Supabase getExercisesByGroup', e.message);
    return [];
  }
}

async function getSubgroups(groupLevel1, groupLevel2) {
  try {
    const col = groupLevel2 != null && String(groupLevel2).trim() !== '' ? 'group_level3' : 'group_level2';
    let q = getClient()
      .from('exercise_library')
      .select(col)
      .eq('group_level1', String(groupLevel1 || ''));
    if (groupLevel2 != null && String(groupLevel2).trim() !== '') {
      q = q.eq('group_level2', String(groupLevel2));
    }
    q = q.not(col, 'is', null);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const seen = {};
    const result = [];
    for (const r of rows) {
      const v = (r[col] || '').toString().trim();
      if (v && !seen[v]) {
        seen[v] = true;
        result.push(v);
      }
    }
    return result.sort();
  } catch (e) {
    console.error('Supabase getSubgroups', e.message);
    return [];
  }
}

async function getExerciseById(exerciseId) {
  try {
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, name_ua, name_ru')
      .eq('id', parseInt(String(exerciseId), 10))
      .limit(1);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: (r.name_ua || r.name_ru || '').toString()
    };
  } catch (e) {
    console.error('Supabase getExerciseById', e.message);
    return null;
  }
}

/** Тільки vid вправи (для автопрогресії: базова +2.5 кг, ізоляція +1.25 кг). */
async function getExerciseVid(exerciseId) {
  try {
    const { data: rows, error } = await getClient()
      .from('exercise_library')
      .select('vid')
      .eq('id', parseInt(String(exerciseId), 10))
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    return (rows[0].vid || '').toString().trim();
  } catch (e) {
    return null;
  }
}

/** Повна картка вправи для бібліотеки (опис, посилання) */
async function getExerciseDetailById(exerciseId) {
  try {
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, equipment, focus_point, common_mistakes, proper_feeling, static_holds, youtube_link, my_channel_link, vid, difficulty, medical_contraindications, medical_limitations, safe_for, modifications, alternatives, safety_notes')
      .eq('id', parseInt(String(exerciseId), 10))
      .limit(1);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    const name = (r.name_ua || r.name_ru || '').toString();
    const groupPath = [r.group_level1, r.group_level2, r.group_level3].filter(Boolean).join(' → ');
    return {
      id: r.id,
      name,
      groupPath: groupPath || '',
      equipment: (r.equipment || '').toString().trim(),
      focusPoint: (r.focus_point || '').toString().trim(),
      commonMistakes: (r.common_mistakes || '').toString().trim(),
      properFeeling: (r.proper_feeling || '').toString().trim(),
      staticHolds: (r.static_holds || '').toString().trim(),
      youtubeLink: (r.youtube_link || '').toString().trim(),
      myChannelLink: (r.my_channel_link || '').toString().trim(),
      vid: (r.vid || '').toString().trim(),
      difficulty: (r.difficulty || '').toString().trim(),
      medicalContraindications: (r.medical_contraindications || '').toString().trim(),
      medicalLimitations: (r.medical_limitations || '').toString().trim(),
      safeFor: (r.safe_for || '').toString().trim(),
      modifications: (r.modifications || '').toString().trim(),
      alternatives: (r.alternatives || '').toString().trim(),
      safetyNotes: (r.safety_notes || '').toString().trim()
    };
  } catch (e) {
    console.error('Supabase getExerciseDetailById', e.message);
    return null;
  }
}

async function searchExercises(query) {
  try {
    const qStr = String(query || '').trim().slice(0, 50);
    if (qStr.length < 2) return [];
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, name_ua, name_ru')
      .or('name_ua.ilike.%' + qStr + '%,name_ru.ilike.%' + qStr + '%')
      .limit(20);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      id: r.id,
      groupLevel1: r.group_level1 || '',
      name: (r.name_ua || r.name_ru || '').toString()
    }));
  } catch (e) {
    console.error('Supabase searchExercises', e.message);
    return [];
  }
}

// --- bot_training_data ---
async function insertTrainingData(record) {
  try {
    const idRecords = record.idRecords || require('crypto').randomUUID();
    const row = {
      id_records: idRecords,
      date: (record.date instanceof Date ? record.date : new Date()).toISOString(),
      exercise_id: record.exerciseId != null ? record.exerciseId : null,
      exercise: String(record.exercise || ''),
      weight: record.weight != null ? parseFloat(record.weight) : null,
      reps: record.reps != null ? parseInt(record.reps, 10) : null,
      set: record.set != null ? parseInt(record.set, 10) : 1,
      chat_id: String(record.chatId || '')
    };
    const { error } = await getClient().from('bot_training_data').insert(row);
    if (error) throw error;
    return idRecords;
  } catch (e) {
    console.error('Supabase insertTrainingData', e.message);
    return null;
  }
}

/** Записи тренувань за chat_id та діапазон дат (для автопрогресії). */
async function getTrainingDataByChatAndDate(chatId, dateFrom, dateTo) {
  try {
    const fromStr = (dateFrom instanceof Date ? dateFrom : new Date(dateFrom)).toISOString();
    const toStr = (dateTo instanceof Date ? dateTo : new Date(dateTo)).toISOString();
    const { data: rows, error } = await getClient()
      .from('bot_training_data')
      .select('exercise_id, weight, reps, set, date')
      .eq('chat_id', String(chatId))
      .gte('date', fromStr)
      .lte('date', toStr)
      .order('date', { ascending: true });
    if (error) throw error;
    return (rows || []).map((r) => ({
      exerciseId: r.exercise_id,
      weight: r.weight != null ? parseFloat(r.weight) : null,
      reps: r.reps != null ? parseInt(r.reps, 10) : null,
      set: r.set != null ? parseInt(r.set, 10) : 1,
      date: r.date
    }));
  } catch (e) {
    console.error('Supabase getTrainingDataByChatAndDate', e.message);
    return [];
  }
}

/** Підсумок останніх тренувань учня за N днів (для AI-нагадувань). Повертає [{ date, exercise_count, total_weight, best_exercise }, ...]. */
async function getStudentRecentWorkoutsSummary(chatId, days = 30) {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const fromStr = start.toISOString();
    const toStr = end.toISOString();
    const { data: rows, error } = await getClient()
      .from('bot_training_data')
      .select('date, exercise, exercise_id, weight')
      .eq('chat_id', String(chatId))
      .gte('date', fromStr)
      .lte('date', toStr)
      .order('date', { ascending: false });
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const byDate = {};
    for (const r of rows) {
      const dateKey = (r.date && r.date.slice) ? r.date.slice(0, 10) : '';
      if (!dateKey) continue;
      if (!byDate[dateKey]) {
        byDate[dateKey] = { date: dateKey, exercises: new Set(), totalWeight: 0, bestExercise: null, maxWeight: 0 };
      }
      const rec = byDate[dateKey];
      rec.exercises.add(String(r.exercise_id != null ? r.exercise_id : (r.exercise || '')));
      const w = r.weight != null ? parseFloat(r.weight) : 0;
      rec.totalWeight += w;
      if (w > rec.maxWeight && (r.exercise || '').trim()) {
        rec.maxWeight = w;
        rec.bestExercise = (r.exercise || '').trim();
      }
    }
    return Object.keys(byDate)
      .sort()
      .reverse()
      .slice(0, 7)
      .map((k) => {
        const x = byDate[k];
        return {
          date: x.date,
          exercise_count: x.exercises.size,
          total_weight: Math.round(x.totalWeight * 10) / 10,
          best_exercise: x.bestExercise || null
        };
      });
  } catch (e) {
    console.error('Supabase getStudentRecentWorkoutsSummary', e.message);
    return [];
  }
}

/** Оновити рекомендовану вагу вправі плану (автопрогресія). */
async function updatePlanExerciseTargetWeight(planExerciseId, targetWeight) {
  try {
    const { error } = await getClient()
      .from('training_plan_exercises')
      .update({ target_weight: targetWeight != null ? parseFloat(targetWeight) : null })
      .eq('id', planExerciseId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updatePlanExerciseTargetWeight', e.message);
    return false;
  }
}

// --- workout_schedule: find or create slot for coach session ---
async function findOrCreateSlotForCoachSession(coachChatId, studentChatId, startedAt) {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const dateStr = start.toISOString().slice(0, 10);
  const timeStr = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
  try {
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('id, date')
      .eq('coach_id', String(coachChatId))
      .eq('student_id', String(studentChatId))
      .limit(20);
    if (error) throw error;
    if (rows && rows.length) {
      const slot = rows.find((r) => {
        const slotDate = r.date ? String(r.date).slice(0, 10) : '';
        return slotDate === dateStr;
      });
      if (slot) return slot.id;
    }
    const { CONSTANTS } = require('./constants');
    const newId = require('crypto').randomUUID();
    await insertScheduleSlot({
      id: newId,
      coachId: String(coachChatId),
      studentId: String(studentChatId),
      date: new Date(dateStr + 'T' + timeStr + ':00'),
      time: timeStr,
      status: CONSTANTS.SCHEDULE_STATUS.BOOKED,
      trainingType: CONSTANTS.TRAINING_TYPES.PERSONAL
    });
    return newId;
  } catch (e) {
    console.error('Supabase findOrCreateSlotForCoachSession', e.message);
    return null;
  }
}

// --- training_plans (розд. 11.2, 11.3) ---

/** Вправи з бібліотеки за списком group_level2 (для генерації плану). Повертає повні поля для filterExerciseForUser. */
async function getExercisesForPlanByGroupLevel2(groupLevel2List) {
  if (!Array.isArray(groupLevel2List) || groupLevel2List.length === 0) return [];
  try {
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, difficulty, vid, medical_contraindications, medical_limitations, safe_for, modifications')
      .in('group_level2', groupLevel2List);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      id: r.id,
      name: (r.name_ua || r.name_ru || '').toString(),
      groupLevel1: (r.group_level1 || '').toString(),
      groupLevel2: (r.group_level2 || '').toString(),
      groupLevel3: (r.group_level3 || '').toString(),
      difficulty: (r.difficulty || '').toString(),
      vid: (r.vid || '').toString(),
      medicalContraindications: (r.medical_contraindications || '').toString(),
      medicalLimitations: (r.medical_limitations || '').toString(),
      safeFor: (r.safe_for || '').toString(),
      modifications: (r.modifications || '').toString()
    }));
  } catch (e) {
    console.error('Supabase getExercisesForPlanByGroupLevel2', e.message);
    return [];
  }
}

/** Створити план; повертає plan_id (uuid) або null. */
async function insertTrainingPlan(plan) {
  try {
    const row = {
      coach_id: plan.coachId || null,
      student_id: plan.studentId || null,
      plan_name: String(plan.planName || ''),
      goal: String(plan.goal || 'keep'),
      level: String(plan.level || 'beginner'),
      split_scheme: plan.splitScheme || null,
      days_per_week: plan.daysPerWeek != null ? plan.daysPerWeek : null,
      description: plan.description || null,
      is_active: plan.isActive === true,
      is_template: plan.isTemplate === true,
      generation_type: plan.generationType || 'auto'
    };
    const { data: inserted, error } = await getClient().from('training_plans').insert(row).select('plan_id').single();
    if (error) throw error;
    return inserted ? inserted.plan_id : null;
  } catch (e) {
    console.error('Supabase insertTrainingPlan', e.message);
    return null;
  }
}

/** Додати вправу до плану. */
async function insertTrainingPlanExercise(ex) {
  try {
    const row = {
      plan_id: ex.planId,
      exercise_id: ex.exerciseId != null ? ex.exerciseId : null,
      exercise_name: String(ex.exerciseName || ''),
      day_number: ex.dayNumber,
      day_label: ex.dayLabel || null,
      order_in_day: ex.orderInDay != null ? ex.orderInDay : 1,
      sets: ex.sets != null ? ex.sets : null,
      reps: ex.reps || null,
      rest_sec: ex.restSec != null ? ex.restSec : null,
      notes: ex.notes || null,
      medical_status: ex.medicalStatus || 'NEUTRAL',
      progression_type: ex.progressionType || 'weight',
      target_weight: ex.targetWeight != null ? ex.targetWeight : null
    };
    const { error } = await getClient().from('training_plan_exercises').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertTrainingPlanExercise', e.message);
    return false;
  }
}

/** Плани учня (для student_id), від нових до старих. */
async function getPlansByStudent(studentChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('training_plans')
      .select('plan_id, plan_name, goal, level, days_per_week, is_active, generation_type, created_at')
      .eq('student_id', String(studentChatId))
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      planId: r.plan_id,
      planName: r.plan_name || '',
      goal: r.goal || '',
      level: r.level || '',
      daysPerWeek: r.days_per_week,
      isActive: r.is_active === true,
      generationType: r.generation_type || '',
      createdAt: r.created_at ? new Date(r.created_at) : null
    }));
  } catch (e) {
    console.error('Supabase getPlansByStudent', e.message);
    return [];
  }
}

const DEFAULT_REVISION_WEEKS = 6;

/** Встановити активний план учня (інші для цього учня — is_active = false). Встановлює valid_until = now + 6 тижнів для нагадування про ревізію. */
async function setPlanActiveForStudent(planId, studentChatId) {
  try {
    await getClient().from('training_plans').update({ is_active: false }).eq('student_id', String(studentChatId));
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + DEFAULT_REVISION_WEEKS * 7);
    const { error } = await getClient()
      .from('training_plans')
      .update({
        is_active: true,
        valid_until: validUntil.toISOString(),
        revision_reminder_sent_at: null
      })
      .eq('plan_id', planId)
      .eq('student_id', String(studentChatId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase setPlanActiveForStudent', e.message);
    return false;
  }
}

/** Плани, для яких минув термін ревізії (valid_until) і нагадування ще не надсилалось. Для cron ревізії. */
async function getPlansDueForRevision() {
  try {
    const now = new Date().toISOString();
    const { data: rows, error } = await getClient()
      .from('training_plans')
      .select('plan_id, coach_id, student_id, plan_name')
      .eq('is_active', true)
      .not('valid_until', 'is', null)
      .lte('valid_until', now)
      .is('revision_reminder_sent_at', null);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({
      planId: r.plan_id,
      coachId: r.coach_id ? String(r.coach_id) : null,
      studentId: r.student_id ? String(r.student_id) : null,
      planName: r.plan_name || ''
    }));
  } catch (e) {
    console.error('Supabase getPlansDueForRevision', e.message);
    return [];
  }
}

/** Позначити, що нагадування про ревізію плану надіслано. */
async function markPlanRevisionReminderSent(planId) {
  try {
    const { error } = await getClient()
      .from('training_plans')
      .update({ revision_reminder_sent_at: new Date().toISOString() })
      .eq('plan_id', planId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase markPlanRevisionReminderSent', e.message);
    return false;
  }
}

// --- ai_generated_content (AI Integration, Part 1) ---
/** Зберегти запис про AI-згенерований контент (аудит, кеш, вартість). */
async function insertAIGeneratedContent(record) {
  try {
    const row = {
      content_type: String(record.contentType || ''),
      entity_id: String(record.entityId || ''),
      prompt_hash: record.promptHash != null ? String(record.promptHash) : null,
      ai_response: record.aiResponse != null ? record.aiResponse : {},
      tokens_used: record.tokensUsed != null ? parseInt(record.tokensUsed, 10) : null,
      cost_usd: record.costUsd != null ? parseFloat(record.costUsd) : null
    };
    const { error } = await getClient().from('ai_generated_content').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertAIGeneratedContent', e.message);
    return false;
  }
}

/** Отримати останній запис AI за типом та entity (для кешу). */
async function getAIGeneratedByEntity(contentType, entityId) {
  try {
    const { data: rows, error } = await getClient()
      .from('ai_generated_content')
      .select('id, ai_response, created_at')
      .eq('content_type', String(contentType))
      .eq('entity_id', String(entityId))
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      aiResponse: r.ai_response,
      createdAt: r.created_at ? new Date(r.created_at) : null
    };
  } catch (e) {
    console.error('Supabase getAIGeneratedByEntity', e.message);
    return null;
  }
}

/** Видалити план (каскадно видаляться вправи). */
async function deleteTrainingPlan(planId) {
  try {
    const { error } = await getClient().from('training_plans').delete().eq('plan_id', planId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteTrainingPlan', e.message);
    return false;
  }
}

/** Активний план учня (is_active = true) з вправами по днях. Для виконання плану учнем. */
async function getActivePlanForStudent(studentChatId) {
  try {
    const { data: planRows, error: planErr } = await getClient()
      .from('training_plans')
      .select('plan_id, plan_name, student_id, days_per_week, goal, level')
      .eq('student_id', String(studentChatId))
      .eq('is_active', true)
      .limit(1);
    if (planErr || !planRows || !planRows.length) return null;
    const planId = planRows[0].plan_id;
    const plan = await getPlanWithExercises(planId);
    return plan;
  } catch (e) {
    console.error('Supabase getActivePlanForStudent', e.message);
    return null;
  }
}

/** План з вправами по днях (для перегляду). */
async function getPlanWithExercises(planId) {
  try {
    const { data: planRow, error: planErr } = await getClient().from('training_plans').select('*').eq('plan_id', planId).single();
    if (planErr || !planRow) return null;
    const { data: exRows, error: exErr } = await getClient()
      .from('training_plan_exercises')
      .select('*')
      .eq('plan_id', planId)
      .order('day_number', { ascending: true })
      .order('order_in_day', { ascending: true });
    if (exErr) throw exErr;
    const plan = {
      planId: planRow.plan_id,
      studentId: planRow.student_id ? String(planRow.student_id) : null,
      planName: planRow.plan_name,
      goal: planRow.goal,
      level: planRow.level,
      splitScheme: planRow.split_scheme,
      daysPerWeek: planRow.days_per_week,
      isActive: planRow.is_active === true,
      exercises: (exRows || []).map((r) => ({
        id: r.id,
        planExerciseId: r.id,
        exerciseId: r.exercise_id,
        exerciseName: r.exercise_name,
        dayNumber: r.day_number,
        dayLabel: r.day_label,
        orderInDay: r.order_in_day,
        sets: r.sets,
        reps: r.reps,
        restSec: r.rest_sec,
        notes: r.notes,
        medicalStatus: r.medical_status,
        progressionType: r.progression_type || 'weight',
        targetWeight: r.target_weight != null ? parseFloat(r.target_weight) : null
      }))
    };
    return plan;
  } catch (e) {
    console.error('Supabase getPlanWithExercises', e.message);
    return null;
  }
}

module.exports = {
  getClient,
  getUserByChatId,
  getStudentsByCoachId,
  getArchivedStudentsByCoachId,
  findUserByInviteCode,
  markInviteAsUsed,
  replaceInviteWithChatId,
  userFromRow,
  userToRow,
  insertUser,
  updateUser,
  getAllCities,
  insertMeasurement,
  getMeasurementHistory,
  getStateRow,
  setStateRow,
  deleteStateRow,
  slotFromRow,
  slotToRow,
  insertScheduleSlot,
  getSlotById,
  getSlotsByCoachAndStatus,
  getSlotsByStudentAndStatus,
  updateScheduleSlotStatus,
  updateScheduleSlotStudentId,
  updateScheduleSlotPrice,
  getCoachPricing,
  getStudentPricing,
  getCurrentPrice,
  setPricing,
  getCompletedTrainingsByCoach,
  getCoachScheduleSettings,
  upsertCoachScheduleSettings,
  getCoachVacationDateKeys,
  addCoachVacationDay,
  removeCoachVacationDay,
  getCoachOccupiedSlotsOnDate,
  getMaxSlotDateByCoach,
  slotExists,
  getTopLevelGroups,
  getExercisesByGroup,
  getSubgroups,
  getExerciseById,
  getExerciseDetailById,
  searchExercises,
  getActiveMedicalConditions,
  getMedicalConditionsList,
  insertMedicalCondition,
  removeMedicalCondition,
  insertTrainingData,
  getTrainingDataByChatAndDate,
  getStudentRecentWorkoutsSummary,
  updatePlanExerciseTargetWeight,
  getExerciseVid,
  findOrCreateSlotForCoachSession,
  getBookedSlotsInWindow,
  slotToDatetime,
  wasReminderSent,
  insertReminderSent,
  getExercisesForPlanByGroupLevel2,
  insertTrainingPlan,
  insertTrainingPlanExercise,
  getPlansByStudent,
  setPlanActiveForStudent,
  getPlanWithExercises,
  deleteTrainingPlan,
  getActivePlanForStudent,
  getPlansDueForRevision,
  markPlanRevisionReminderSent,
  insertAIGeneratedContent,
  getAIGeneratedByEntity
};
