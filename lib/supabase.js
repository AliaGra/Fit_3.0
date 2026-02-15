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
    calendarId: r.calendar_id || ''
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
    calendar_id: u.calendarId || ''
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

async function getStudentsByCoachId(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .eq('role', 'student');
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => userFromRow(r));
  } catch (e) {
    console.error('Supabase getStudentsByCoachId', e.message);
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

async function replaceInviteWithChatId(inviteCode, realChatId) {
  try {
    const { error } = await getClient()
      .from('users')
      .update({ user_id: String(realChatId), chat_id: String(realChatId) })
      .eq('user_id', String(inviteCode));
    if (error) throw error;
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
    if (Object.keys(row).length === 0) return true;
    const { error } = await getClient().from('users').update(row).eq('chat_id', String(chatId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateUser', e.message);
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
    const row = {
      coach_id: coachId,
      student_id: studentId,
      price_personal: data.pricePersonal != null ? data.pricePersonal : null,
      price_split: data.priceSplit != null ? data.priceSplit : null,
      price_trio: data.priceTrio != null ? data.priceTrio : null,
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
// Active = "YES" (або null для сумісності з даними без active)
function activeFilter(q) {
  return q.or('active.eq.YES,active.is.null');
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

module.exports = {
  getClient,
  getUserByChatId,
  getStudentsByCoachId,
  findUserByInviteCode,
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
  getMaxSlotDateByCoach,
  slotExists,
  getExercisesByGroup,
  getSubgroups,
  getExerciseById,
  searchExercises,
  insertTrainingData,
  findOrCreateSlotForCoachSession,
  getBookedSlotsInWindow,
  slotToDatetime,
  wasReminderSent,
  insertReminderSent
};
