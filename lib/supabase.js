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
    teenMode: r.teen_mode === true ? true : (r.teen_mode === false ? false : null),
    confirmedByParent: r.confirmed_by_parent === true ? true : (r.confirmed_by_parent === false ? false : null),
    ageGroup: r.age_group != null ? String(r.age_group) : null,
    height: r.height != null ? r.height : null,
    weight: r.weight != null ? r.weight : null,
    waist: r.waist != null ? r.waist : null,
    hip: r.hip != null ? r.hip : null,
    glutes: r.glutes != null ? r.glutes : null,
    arm: r.arm != null ? r.arm : null,
    shoulders: r.shoulders != null ? r.shoulders : null,
    chest: r.chest != null ? r.chest : null,
    neck: r.neck != null ? r.neck : null,
    wrist: r.wrist != null ? r.wrist : null,
    bodyFatPct: r.body_fat_pct != null ? r.body_fat_pct : null,
    instagram: r.instagram || '',
    calendarId: r.calendar_id || '',
    experienceStartDate: r.experience_start_date ? toDate(r.experience_start_date) : null,
    trainingDaysPerWeek: r.training_days_per_week != null ? r.training_days_per_week : null,
    activePlanId: r.active_plan_id || null,
    isArchived: r.is_archived === true,
    accentZones: Array.isArray(r.accent_zones) ? r.accent_zones : (r.accent_zones ? [].concat(r.accent_zones) : []),
    avoidZones: Array.isArray(r.avoid_zones) ? r.avoid_zones : (r.avoid_zones ? [].concat(r.avoid_zones) : []),
    jobType: r.job_type || null,
    transportType: r.transport_type || null,
    stepsCategory: r.steps_category || null,
    dailySteps: r.daily_steps != null ? r.daily_steps : null,
    extraActivity: r.extra_activity || null,
    activityLevel: r.activity_level || null,
    neatCoefficient: r.neat_coefficient != null ? r.neat_coefficient : null
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
    shoulders: u.shoulders != null ? u.shoulders : null,
    chest: u.chest != null ? u.chest : null,
    neck: u.neck != null ? u.neck : null,
    wrist: u.wrist != null ? u.wrist : null,
    body_fat_pct: u.bodyFatPct != null ? u.bodyFatPct : null,
    instagram: u.instagram || '',
    calendar_id: u.calendarId || '',
    experience_start_date: u.experienceStartDate ? (toDate(u.experienceStartDate).toISOString ? toDate(u.experienceStartDate).toISOString() : u.experienceStartDate) : null,
    training_days_per_week: u.trainingDaysPerWeek != null ? u.trainingDaysPerWeek : null,
    active_plan_id: u.activePlanId || null,
    accent_zones: Array.isArray(u.accentZones) ? u.accentZones : (u.accentZones ? [].concat(u.accentZones) : []),
    avoid_zones: Array.isArray(u.avoidZones) ? u.avoidZones : (u.avoidZones ? [].concat(u.avoidZones) : []),
    job_type: u.jobType || null,
    transport_type: u.transportType || null,
    steps_category: u.stepsCategory || null,
    daily_steps: u.dailySteps != null ? u.dailySteps : null,
    extra_activity: u.extraActivity || null,
    activity_level: u.activityLevel || null,
    neat_coefficient: u.neatCoefficient != null ? u.neatCoefficient : null
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

/** Перенести медичні стани з одного chat_id на інший (при активації інвайту або прив'язці по коду). */
async function updateMedicalConditionsChatId(fromChatId, toChatId) {
  try {
    const from = String(fromChatId);
    const to = String(toChatId);
    if (!from || !to || from === to) return true;
    const { error } = await getClient()
      .from('user_medical_conditions')
      .update({ chat_id: to })
      .eq('chat_id', from);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateMedicalConditionsChatId', e.message);
    return false;
  }
}

async function getStudentsByCoachId(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .or('is_archived.eq.false,is_archived.is.null');
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const filtered = rows.filter((r) => {
      const uid = (r.user_id || '').toString();
      const cid = (r.chat_id || '').toString();
      if (uid.toUpperCase().startsWith('INVITE_') && cid.startsWith('USED_')) return false;
      return true;
    });
    return filtered.map((r) => userFromRow(r));
  } catch (e) {
    console.error('Supabase getStudentsByCoachId', e.message);
    return [];
  }
}

/** Всі активні тренери (для тижневого дайджесту). */
async function getAllCoaches() {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('chat_id, first_name, last_name, role, is_archived')
      .eq('role', 'coach')
      .eq('is_archived', false);
    if (error) throw error;
    return rows || [];
  } catch (e) {
    console.error('Supabase getAllCoaches', e.message);
    return [];
  }
}

/** Архівовані учні тренера (приховані з основного списку). Показує всіх з is_archived=true, включно з role=coach. */
async function getArchivedStudentsByCoachId(coachChatId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .eq('is_archived', true);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const filtered = rows.filter((r) => {
      const uid = (r.user_id || '').toString();
      const cid = (r.chat_id || '').toString();
      if (uid.toUpperCase().startsWith('INVITE_') && cid.startsWith('USED_')) return false;
      return true;
    });
    return filtered.map((r) => userFromRow(r));
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
    await updateMedicalConditionsChatId(code, realId);
    // Оновлюємо entity_id в ai_generated_content (аналітика зберігалась під inviteCode)
    const { error: errAI } = await getClient()
      .from('ai_generated_content')
      .update({ entity_id: realId })
      .eq('entity_id', code);
    if (errAI) console.error('Supabase replaceInviteWithChatId ai_generated_content', errAI.message);
    // Оновлюємо chat_id в user_body_goals (бажані параметри зберігались під inviteCode)
    const { error: errGoals } = await getClient()
      .from('user_body_goals')
      .update({ chat_id: realId })
      .eq('chat_id', code);
    if (errGoals) console.error('Supabase replaceInviteWithChatId user_body_goals', errGoals.message);
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
    if (updates.shoulders !== undefined) row.shoulders = updates.shoulders;
    if (updates.chest !== undefined) row.chest = updates.chest;
    if (updates.neck !== undefined) row.neck = updates.neck;
    if (updates.wrist !== undefined) row.wrist = updates.wrist;
    if (updates.bodyFatPct !== undefined) row.body_fat_pct = updates.bodyFatPct;
    if (updates.instagram !== undefined) row.instagram = updates.instagram;
    if (updates.calendarId !== undefined) row.calendar_id = updates.calendarId;
    if (updates.experienceStartDate !== undefined) row.experience_start_date = updates.experienceStartDate ? (toDate(updates.experienceStartDate).toISOString ? toDate(updates.experienceStartDate).toISOString() : updates.experienceStartDate) : null;
    if (updates.trainingDaysPerWeek !== undefined) row.training_days_per_week = updates.trainingDaysPerWeek;
    if (updates.activePlanId !== undefined) row.active_plan_id = updates.activePlanId || null;
    if (updates.isArchived !== undefined) row.is_archived = updates.isArchived === true;
    if (updates.accentZones !== undefined) row.accent_zones = Array.isArray(updates.accentZones) ? updates.accentZones : (updates.accentZones ? [].concat(updates.accentZones) : []);
    if (updates.avoidZones !== undefined) row.avoid_zones = Array.isArray(updates.avoidZones) ? updates.avoidZones : (updates.avoidZones ? [].concat(updates.avoidZones) : []);
    if (updates.jobType !== undefined) row.job_type = updates.jobType || null;
    if (updates.transportType !== undefined) row.transport_type = updates.transportType || null;
    if (updates.stepsCategory !== undefined) row.steps_category = updates.stepsCategory || null;
    if (updates.dailySteps !== undefined) row.daily_steps = updates.dailySteps != null ? updates.dailySteps : null;
    if (updates.extraActivity !== undefined) row.extra_activity = updates.extraActivity || null;
    if (updates.activityLevel !== undefined) row.activity_level = updates.activityLevel || null;
    if (updates.neatCoefficient !== undefined) row.neat_coefficient = updates.neatCoefficient != null ? updates.neatCoefficient : null;
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
    shoulders: m.shoulders != null ? m.shoulders : null,
    chest: m.chest != null ? m.chest : null,
    neck: m.neck != null ? m.neck : null,
    wrist: m.wrist != null ? m.wrist : null,
    body_fat_pct: m.bodyFatPct != null ? m.bodyFatPct : null,
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
      shoulders: r.shoulders != null ? r.shoulders : null,
      chest: r.chest != null ? r.chest : null,
      neck: r.neck != null ? r.neck : null,
      wrist: r.wrist != null ? r.wrist : null,
      bodyFatPct: r.body_fat_pct != null ? r.body_fat_pct : null,
      source: r.source || ''
    }));
  } catch (e) {
    console.error('Supabase getMeasurementHistory', e.message);
    return [];
  }
}

// --- user_body_goals (бажані параметри тіла) ---
async function upsertBodyGoals(coachId, studentChatId, goals, analysis) {
  try {
    const row = {
      chat_id: String(studentChatId),
      goal_weight: goals.goal_weight != null ? goals.goal_weight : null,
      goal_waist: goals.goal_waist != null ? goals.goal_waist : null,
      goal_hips: goals.goal_hips != null ? goals.goal_hips : null,
      goal_shoulders: goals.goal_shoulders != null ? goals.goal_shoulders : null,
      goal_chest: goals.goal_chest != null ? goals.goal_chest : null,
      set_by_coach: coachId != null ? String(coachId) : null,
      updated_at: new Date().toISOString()
    };
    if (analysis != null) {
      row.goals_analysis = analysis;
      row.analysis_date = new Date().toISOString();
    }
    const { error } = await getClient().from('user_body_goals').upsert(row, { onConflict: 'chat_id' });
    if (error) {
      console.error('Supabase upsertBodyGoals', error.message, error.code, error.details);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('Supabase upsertBodyGoals', e.message);
    return { ok: false, error: e.message };
  }
}

async function getBodyGoals(chatId) {
  try {
    const { data, error } = await getClient()
      .from('user_body_goals')
      .select('*')
      .eq('chat_id', String(chatId))
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Supabase getBodyGoals', e.message);
    return null;
  }
}

async function getLatestMeasurementsForGoals(chatId) {
  try {
    const { data, error } = await getClient()
      .from('measurements_history')
      .select('weight, waist, glutes, shoulders, chest')
      .eq('chat_id', String(chatId))
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Supabase getLatestMeasurementsForGoals', e.message);
    return null;
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

/**
 * Рядок обладнання для картки вправи (ТЗ Етап 1).
 * Якщо є назва з довідника equipment — «name_ua» або «name_ua — attachment», інакше старе поле equipment.
 */
function formatEquipmentDisplay(row) {
  const name = row.equipment_name_ua != null ? String(row.equipment_name_ua).trim() : '';
  const att = (row.attachment != null && String(row.attachment).trim()) ? String(row.attachment).trim() : '';
  if (name) return att ? name + ' — ' + att : name;
  return (row.equipment != null ? String(row.equipment).trim() : '') || '—';
}

/** Повна картка вправи для бібліотеки (опис, посилання). Обладнання: name_ua з equipment або fallback на старе поле. */
async function getExerciseDetailById(exerciseId) {
  try {
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, equipment, equipment_id, attachment, focus_point, common_mistakes, proper_feeling, static_holds, youtube_link, my_channel_link, vid, difficulty, medical_contraindications, medical_limitations, safe_for, modifications, alternatives, safety_notes')
      .eq('id', parseInt(String(exerciseId), 10))
      .limit(1);
    q = activeFilter(q);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return null;
    const r = rows[0];
    let equipment_name_ua = '';
    if (r.equipment_id) {
      const { data: eqRow } = await getClient().from('equipment').select('name_ua').eq('id', String(r.equipment_id).trim()).limit(1).maybeSingle();
      equipment_name_ua = eqRow && eqRow.name_ua ? String(eqRow.name_ua).trim() : '';
    }
    const name = (r.name_ua || r.name_ru || '').toString();
    const groupPath = [r.group_level1, r.group_level2, r.group_level3].filter(Boolean).join(' → ');
    const rowForDisplay = { ...r, equipment_name_ua };
    return {
      id: r.id,
      name,
      groupPath: groupPath || '',
      equipment: (r.equipment || '').toString().trim(),
      equipmentDisplay: formatEquipmentDisplay(rowForDisplay),
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

// --- exercise_aliases (псевдоніми вправ) ---
async function insertAlias(record) {
  try {
    const alias = String(record.alias || '').trim().toLowerCase();
    if (!alias) return null;
    const row = {
      user_id: String(record.user_id || ''),
      exercise_id: parseInt(record.exercise_id, 10),
      alias,
      scope: record.scope === 'coach_shared' ? 'coach_shared' : 'personal'
    };
    const { data, error } = await getClient().from('exercise_aliases').insert(row).select('id').single();
    if (error) throw error;
    return data && data.id ? data.id : null;
  } catch (e) {
    if (e.code === '23505') throw new Error('DUPLICATE');
    console.error('Supabase insertAlias', e.message);
    return null;
  }
}

async function deleteAliasByIdAndUser(aliasId, userId) {
  try {
    const { data, error } = await getClient()
      .from('exercise_aliases')
      .delete()
      .eq('id', aliasId)
      .eq('user_id', String(userId || ''))
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error('Supabase deleteAliasByIdAndUser', e.message);
    return false;
  }
}

/** Пошук псевдонімів для користувача (personal) та coach_shared тренера. Повертає масив { id, alias, scope, exercise_id, name_ua?, name_ru? }. */
async function findAliasesForSearch(userId, coachId, normalizedQuery) {
  try {
    const q = String(normalizedQuery || '').trim().toLowerCase().slice(0, 50);
    if (q.length < 2) return [];
    const client = getClient();
    let rows = [];
    const likePattern = '%' + q + '%';
    const { data: personalRows, error: e1 } = await client
      .from('exercise_aliases')
      .select('id, alias, scope, exercise_id')
      .eq('user_id', String(userId || ''))
      .ilike('alias', likePattern)
      .limit(25);
    if (!e1 && personalRows && personalRows.length) rows = personalRows;
    if (coachId && String(coachId) !== String(userId)) {
      const { data: sharedRows, error: e2 } = await client
        .from('exercise_aliases')
        .select('id, alias, scope, exercise_id')
        .eq('user_id', String(coachId))
        .eq('scope', 'coach_shared')
        .ilike('alias', likePattern)
        .limit(25);
      if (!e2 && sharedRows && sharedRows.length) rows = [...rows, ...sharedRows];
    }
    if (!rows.length) return [];
    const seen = new Set();
    const deduped = rows.filter((r) => {
      if (seen.has(r.exercise_id)) return false;
      seen.add(r.exercise_id);
      return true;
    });
    const ids = deduped.map((r) => r.exercise_id);
    const { data: libRows, error: libErr } = await client
      .from('exercise_library')
      .select('id, name_ua, name_ru, group_level1')
      .in('id', ids);
    if (libErr || !libRows || !libRows.length) return deduped.map((r) => ({ ...r, name: '' }));
    const byId = {};
    libRows.forEach((r) => { byId[r.id] = r; });
    return deduped.map((r) => {
      const ex = byId[r.exercise_id] || {};
      return {
        id: r.id,
        alias: r.alias,
        scope: r.scope,
        exercise_id: r.exercise_id,
        name_ua: ex.name_ua || '',
        name_ru: ex.name_ru || '',
        name: (ex.name_ua || ex.name_ru || '').toString(),
        groupLevel1: ex.group_level1 || ''
      };
    });
  } catch (e) {
    console.error('Supabase findAliasesForSearch', e.message);
    return [];
  }
}

async function getAliasesByUserAndExercise(userId, exerciseId) {
  try {
    const { data: rows, error } = await getClient()
      .from('exercise_aliases')
      .select('id, alias, scope, created_at')
      .eq('user_id', String(userId || ''))
      .eq('exercise_id', parseInt(exerciseId, 10))
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: r.id,
      alias: r.alias,
      scope: r.scope,
      created_at: r.created_at
    }));
  } catch (e) {
    console.error('Supabase getAliasesByUserAndExercise', e.message);
    return [];
  }
}

async function getAllAliasesByUser(userId) {
  try {
    const { data: rows, error } = await getClient()
      .from('exercise_aliases')
      .select('id, alias, scope, exercise_id')
      .eq('user_id', String(userId || ''))
      .order('alias');
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.exercise_id))];
    const { data: libRows } = await getClient().from('exercise_library').select('id, name_ua, name_ru').in('id', ids);
    const byId = {};
    (libRows || []).forEach((r) => { byId[r.id] = r; });
    return rows.map((r) => ({
      id: r.id,
      alias: r.alias,
      scope: r.scope,
      exercise_id: r.exercise_id,
      name_ua: (byId[r.exercise_id] || {}).name_ua || ''
    }));
  } catch (e) {
    console.error('Supabase getAllAliasesByUser', e.message);
    return [];
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

/** Кеш AI-відповідей через таблицю ai_generated_content (без ALTER TABLE). */
async function getAiCache(chatId, contentType, refId) {
  try {
    const entityId = String(chatId) + '_' + String(refId);
    const row = await getAIGeneratedByEntity(contentType, entityId);
    if (!row) return null;
    if (row.createdAt instanceof Date) {
      const ageMs = Date.now() - row.createdAt.getTime();
      const ttlMs = 24 * 60 * 60 * 1000;
      if (ageMs > ttlMs) return null;
    }
    return row.aiResponse != null ? row.aiResponse : null;
  } catch (e) {
    console.error('Supabase getAiCache', e.message);
    return null;
  }
}

async function setAiCache(chatId, contentType, refId, content) {
  try {
    const entityId = String(chatId) + '_' + String(refId);
    await insertAIGeneratedContent({
      contentType,
      entityId,
      aiResponse: content,
      tokensUsed: null,
      costUsd: null
    });
    return true;
  } catch (e) {
    console.error('Supabase setAiCache', e.message);
    return false;
  }
}

/** Останнє тренування по вправі до вказаної дати (для підказки під час тренування). */
async function getLastWorkoutByExercise(chatId, exerciseId, excludeDate) {
  try {
    const exclude = String(excludeDate || '').slice(0, 10);
    if (!exclude) return null;
    const { data: dateRow, error: errDate } = await getClient()
      .from('bot_training_data')
      .select('date')
      .eq('chat_id', String(chatId))
      .eq('exercise_id', exerciseId)
      .lt('date', `${exclude}T00:00:00`)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errDate) throw errDate;
    if (!dateRow || !dateRow.date) return null;
    const lastDate = dateRow.date.slice(0, 10);
    const { data: rows, error: errRows } = await getClient()
      .from('bot_training_data')
      .select('weight, reps, set')
      .eq('chat_id', String(chatId))
      .eq('exercise_id', exerciseId)
      .gte('date', `${lastDate}T00:00:00`)
      .lt('date', `${lastDate}T23:59:59`)
      .order('set', { ascending: true });
    if (errRows) throw errRows;
    const mapped = (rows || []).map((r) => ({
      weight: r.weight != null ? parseFloat(r.weight) : null,
      reps: r.reps != null ? parseInt(r.reps, 10) : null,
      set: r.set != null ? parseInt(r.set, 10) : 1
    }));
    return { date: lastDate, rows: mapped };
  } catch (e) {
    console.error('Supabase getLastWorkoutByExercise', e.message);
    return null;
  }
}

/** Найкращий підхід по вправі за весь час (для підказки «Рекорд»). */
async function getBestSetByExercise(chatId, exerciseId) {
  try {
    const { data, error } = await getClient()
      .from('bot_training_data')
      .select('weight, reps')
      .eq('chat_id', String(chatId))
      .eq('exercise_id', exerciseId)
      .not('weight', 'is', null)
      .order('weight', { ascending: false })
      .order('reps', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      weight: data.weight != null ? parseFloat(data.weight) : null,
      reps: data.reps != null ? parseInt(data.reps, 10) : null
    };
  } catch (e) {
    console.error('Supabase getBestSetByExercise', e.message);
    return null;
  }
}

// --- Історія тренувань (ТЗ_Історія_тренувань_v1_1_FIT3.md) ---

/** Унікальні дати тренувань (по днях) для chatId, від нових до старих. */
async function getWorkoutDates(chatId, limit = 20) {
  try {
    const { data, error } = await getClient()
      .from('bot_training_data')
      .select('date')
      .eq('chat_id', String(chatId))
      .order('date', { ascending: false });
    if (error) throw error;
    const seen = new Set();
    const dates = [];
    for (const row of (data || [])) {
      const day = row.date && row.date.slice ? row.date.slice(0, 10) : '';
      if (!day || seen.has(day)) continue;
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
    return dates;
  } catch (e) {
    console.error('Supabase getWorkoutDates', e.message);
    return [];
  }
}

/** Записи одного тренування за дату (одна дата = один день). Повертає масив з exercise_id, exercise_name (exercise), group_level2. */
async function getWorkoutByDate(chatId, dateStr) {
  try {
    const from = `${dateStr}T00:00:00`;
    const to = `${dateStr}T23:59:59`;
    const { data: rows, error } = await getClient()
      .from('bot_training_data')
      .select('date, exercise_id, exercise, weight, reps, set')
      .eq('chat_id', String(chatId))
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (error) throw error;
    if (!rows || !rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.exercise_id).filter((id) => id != null))];
    let groupByEx = {};
    if (ids.length > 0) {
      const { data: libRows } = await getClient()
        .from('exercise_library')
        .select('id, group_level2')
        .in('id', ids);
      groupByEx = (libRows || []).reduce((acc, r) => {
        acc[r.id] = r.group_level2 || '';
        return acc;
      }, {});
    }
    return rows.map((r) => ({
      date: r.date,
      exercise_id: r.exercise_id,
      exercise_name: (r.exercise || '').trim() || 'Вправа',
      weight: r.weight != null ? parseFloat(r.weight) : null,
      reps: r.reps != null ? parseInt(r.reps, 10) : null,
      set: r.set != null ? parseInt(r.set, 10) : 1,
      exercise_library: { group_level2: groupByEx[r.exercise_id] || '' }
    }));
  } catch (e) {
    console.error('Supabase getWorkoutByDate', e.message);
    return [];
  }
}

/**
 * Найкращий підхід цієї вправи для користувача до вказаної дати (для модуля «Прогресія в історії»).
 * @param {string|number} chatId
 * @param {string|number} exerciseId
 * @param {string} beforeDate - ISO дата/час, наприклад початок дня поточного тренування
 * @returns {Promise<{weight: number, reps: number, date: string}|null>}
 */
async function getLastExercisePerformance(chatId, exerciseId, beforeDate) {
  try {
    const eid = exerciseId != null ? parseInt(exerciseId, 10) : null;
    if (eid == null || isNaN(eid)) return null;
    const { data, error } = await getClient()
      .from('bot_training_data')
      .select('weight, reps, date')
      .eq('chat_id', String(chatId))
      .eq('exercise_id', eid)
      .lt('date', beforeDate)
      .order('date', { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) return null;
    const best = data.reduce((acc, row) => {
      const volume = (row.weight != null ? parseFloat(row.weight) : 0) * (row.reps != null ? parseInt(row.reps, 10) : 0);
      const accVolume = (acc.weight != null ? parseFloat(acc.weight) : 0) * (acc.reps != null ? parseInt(acc.reps, 10) : 0);
      return volume > accVolume ? row : acc;
    });
    return {
      weight: best.weight != null ? parseFloat(best.weight) : 0,
      reps: best.reps != null ? parseInt(best.reps, 10) : 0,
      date: best.date
    };
  } catch (e) {
    console.error('Supabase getLastExercisePerformance', e.message);
    return null;
  }
}

/** Дати тренувань, де були вправи обраної групи (group_level2). */
async function getWorkoutDatesByMuscleGroup(chatId, groupLevel2, limit = 20) {
  try {
    const { data: exRows } = await getClient()
      .from('exercise_library')
      .select('id')
      .eq('group_level2', String(groupLevel2))
      .eq('active', 'YES');
    const exerciseIds = (exRows || []).map((e) => e.id);
    if (!exerciseIds.length) return [];
    const { data, error } = await getClient()
      .from('bot_training_data')
      .select('date')
      .eq('chat_id', String(chatId))
      .in('exercise_id', exerciseIds)
      .order('date', { ascending: false });
    if (error) throw error;
    const seen = new Set();
    const dates = [];
    for (const row of (data || [])) {
      const day = row.date && row.date.slice ? row.date.slice(0, 10) : '';
      if (!day || seen.has(day)) continue;
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
    return dates;
  } catch (e) {
    console.error('Supabase getWorkoutDatesByMuscleGroup', e.message);
    return [];
  }
}

/** Дати тренувань, де була конкретна вправа (exercise_id). */
async function getWorkoutDatesByExercise(chatId, exerciseId, limit = 20) {
  try {
    const { data, error } = await getClient()
      .from('bot_training_data')
      .select('date')
      .eq('chat_id', String(chatId))
      .eq('exercise_id', parseInt(exerciseId, 10))
      .order('date', { ascending: false });
    if (error) throw error;
    const seen = new Set();
    const dates = [];
    for (const row of (data || [])) {
      const day = row.date && row.date.slice ? row.date.slice(0, 10) : '';
      if (!day || seen.has(day)) continue;
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
    return dates;
  } catch (e) {
    console.error('Supabase getWorkoutDatesByExercise', e.message);
    return [];
  }
}

/** Список вправ, які користувач колись виконував (унікальні exercise_id + name). Опційно фільтр по group_level2. */
async function getExercisesTrainedByStudent(chatId, groupLevel2 = null) {
  try {
    const { data: rows, error } = await getClient()
      .from('bot_training_data')
      .select('exercise_id, exercise')
      .eq('chat_id', String(chatId));
    if (error) throw error;
    const seen = new Map();
    for (const row of (rows || [])) {
      if (row.exercise_id != null && !seen.has(row.exercise_id)) {
        seen.set(row.exercise_id, (row.exercise || '').trim() || 'Вправа');
      }
    }
    let exercises = Array.from(seen.entries(), ([id, name]) => ({ id, name }));
    if (groupLevel2) {
      const { data: libRows } = await getClient()
        .from('exercise_library')
        .select('id')
        .eq('group_level2', String(groupLevel2))
        .eq('active', 'YES');
      const allowedIds = new Set((libRows || []).map((e) => e.id));
      exercises = exercises.filter((e) => allowedIds.has(e.id));
    }
    return exercises;
  } catch (e) {
    console.error('Supabase getExercisesTrainedByStudent', e.message);
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
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, difficulty, vid, equipment, medical_contraindications, medical_limitations, safe_for, modifications')
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
      modifications: (r.modifications || '').toString(),
      equipment: (r.equipment || '').toString().toLowerCase()
    }));
  } catch (e) {
    console.error('Supabase getExercisesForPlanByGroupLevel2', e.message);
    return [];
  }
}

/** Тижні ревізії за рівнем (Логіка плану 9.4.2): beginner 10, intermediate 7, advanced 5. */
const REVISION_WEEKS_BY_LEVEL = Object.freeze({ beginner: 10, intermediate: 7, advanced: 5 });

/** Створити план; повертає plan_id (uuid) або null. */
async function insertTrainingPlan(plan) {
  try {
    const level = String(plan.level || 'beginner').toLowerCase();
    const revisionWeeks = plan.revisionWeeks != null
      ? parseInt(plan.revisionWeeks, 10)
      : (REVISION_WEEKS_BY_LEVEL[level] ?? 6);
    const row = {
      coach_id: plan.coachId || null,
      student_id: plan.studentId || null,
      plan_name: String(plan.planName || ''),
      goal: String(plan.goal || 'keep'),
      level,
      split_scheme: plan.splitScheme || null,
      days_per_week: plan.daysPerWeek != null ? plan.daysPerWeek : null,
      description: plan.description || null,
      is_active: plan.isActive === true,
      is_template: plan.isTemplate === true,
      generation_type: plan.generationType || 'auto',
      revision_weeks: revisionWeeks,
      parent_plan_id: plan.parentPlanId || null,
      accent_zones: Array.isArray(plan.accentZones) ? plan.accentZones : [],
      avoid_zones: Array.isArray(plan.avoidZones) ? plan.avoidZones : [],
      split_config: Array.isArray(plan.splitConfig) ? plan.splitConfig : [],
      generation_mode: plan.generationMode || 'simple',
      phase_duration: plan.phaseDuration != null ? parseInt(plan.phaseDuration, 10) : null,
      total_weeks: plan.totalWeeks != null ? parseInt(plan.totalWeeks, 10) : null,
      ai_plan_summary: plan.aiPlanSummary ? String(plan.aiPlanSummary).slice(0, 500) : null,
      created_by_role: plan.createdByRole === 'student' ? 'student' : 'coach'
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

/** ID вправ плану з group_level2 та vid (для Anti-Repeat та ізоляцій). */
async function getPlanExerciseIdsWithVid(planId) {
  if (!planId) return [];
  try {
    const { data: rows, error } = await getClient()
      .from('training_plan_exercises')
      .select('exercise_id')
      .eq('plan_id', planId);
    if (error || !rows || !rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.exercise_id).filter((id) => id != null))];
    if (ids.length === 0) return [];
    const { data: libRows } = await getClient()
      .from('exercise_library')
      .select('id, group_level2, vid')
      .in('id', ids);
    const byId = (libRows || []).reduce((acc, r) => {
      acc[r.id] = { exerciseId: r.id, groupLevel2: (r.group_level2 || '').toString(), vid: (r.vid || '').toString() };
      return acc;
    }, {});
    return rows.map((r) => byId[r.exercise_id] || { exerciseId: r.exercise_id, groupLevel2: '', vid: '' }).filter((x) => x.exerciseId != null);
  } catch (e) {
    console.error('Supabase getPlanExerciseIdsWithVid', e.message);
    return [];
  }
}

/** ID ізоляційних вправ попереднього плану учня (правило Б Anti-Repeat). */
async function getPreviousPlanIsolationExerciseIds(studentChatId) {
  const plans = await getPlansByStudent(studentChatId);
  if (!plans || !plans.length) return [];
  const prevPlanId = plans[0].planId;
  const withVid = await getPlanExerciseIdsWithVid(prevPlanId);
  const vidLower = (v) => (v || '').toLowerCase();
  return withVid
    .filter((x) => /ізол|изол|изоляц|ізоляц/.test(vidLower(x.vid)) && vidLower(x.vid).indexOf('базов') < 0)
    .map((x) => x.exerciseId);
}

/** Кількість появ кожної вправи в планах учня (для зваженого рандому, правило В). */
async function getExerciseUsageCountForStudent(studentChatId) {
  try {
    const { data: planIdRows, error: planErr } = await getClient()
      .from('training_plans')
      .select('plan_id')
      .eq('student_id', String(studentChatId));
    if (planErr || !planIdRows || !planIdRows.length) return {};
    const ids = planIdRows.map((r) => r.plan_id);
    const { data: exRows, error: exErr } = await getClient()
      .from('training_plan_exercises')
      .select('exercise_id')
      .in('plan_id', ids);
    if (exErr || !exRows) return {};
    const count = {};
    for (const r of exRows) {
      const id = r.exercise_id != null ? r.exercise_id : 0;
      count[id] = (count[id] || 0) + 1;
    }
    return count;
  } catch (e) {
    console.error('Supabase getExerciseUsageCountForStudent', e.message);
    return {};
  }
}

/** Встановити активний план учня (інші — is_active = false). valid_until = now + revision_weeks*7, activated_at = now (Логіка плану 9.4.2). */
async function setPlanActiveForStudent(planId, studentChatId) {
  try {
    await getClient().from('training_plans').update({ is_active: false }).eq('student_id', String(studentChatId));
    const { data: planRow, error: fetchErr } = await getClient()
      .from('training_plans')
      .select('revision_weeks, level')
      .eq('plan_id', planId)
      .eq('student_id', String(studentChatId))
      .single();
    if (fetchErr || !planRow) {
      console.error('Supabase setPlanActiveForStudent: plan not found', planId);
      return false;
    }
    const level = (planRow.level || 'beginner').toLowerCase();
    const revisionWeeks = planRow.revision_weeks != null
      ? parseInt(planRow.revision_weeks, 10)
      : (REVISION_WEEKS_BY_LEVEL[level] ?? 6);
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + revisionWeeks * 7);
    const now = new Date().toISOString();
    const { error } = await getClient()
      .from('training_plans')
      .update({
        is_active: true,
        valid_until: validUntil.toISOString(),
        activated_at: now,
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

/** Плани, для яких минув термін ревізії (valid_until) і нагадування ще не надсилалось. Для cron ревізії. Повертає generation_type для гілки auto/manual. */
async function getPlansDueForRevision() {
  try {
    const now = new Date().toISOString();
    const { data: rows, error } = await getClient()
      .from('training_plans')
      .select('plan_id, coach_id, student_id, plan_name, generation_type, revision_weeks')
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
      planName: r.plan_name || '',
      generationType: (r.generation_type || 'manual').toLowerCase(),
      revisionWeeks: r.revision_weeks != null ? parseInt(r.revision_weeks, 10) : null
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

/** Деактивувати план (is_active = false). Для випадку зміни MC з BLOCKED вправами. */
async function deactivatePlan(planId) {
  try {
    const { error } = await getClient()
      .from('training_plans')
      .update({ is_active: false })
      .eq('plan_id', planId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deactivatePlan', e.message);
    return false;
  }
}

/** Записати зміну плану в plan_adjustments (ТЗ 9.4.4, Логіка 9.3). */
async function insertPlanAdjustment(record) {
  try {
    const row = {
      plan_id: record.planId || null,
      new_plan_id: record.newPlanId || null,
      adjustment_type: String(record.adjustmentType || ''),
      details: record.details != null ? record.details : null
    };
    const { error } = await getClient().from('plan_adjustments').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertPlanAdjustment', e.message);
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

/** Видалити одну вправу з плану (за id рядка в training_plan_exercises). */
async function deleteTrainingPlanExercise(planExerciseId) {
  try {
    const { error } = await getClient().from('training_plan_exercises').delete().eq('id', planExerciseId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteTrainingPlanExercise', e.message);
    return false;
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

/**
 * Список chat_id користувачів-інвайтів, які вже відв’язані від тренера (coach_id IS NULL).
 * Це «сиріти» — видалені з архіву до впровадження каскадного видалення. Для одноразової очистки БД.
 */
async function getInviteUnlinkedChatIds() {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('chat_id')
      .like('chat_id', 'INVITE_%')
      .is('coach_id', null);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows.map((r) => String(r.chat_id || '')).filter(Boolean);
  } catch (e) {
    console.error('Supabase getInviteUnlinkedChatIds', e.message);
    return [];
  }
}

/**
 * Видалити неактивований інвайт (INVITE_*) та усі пов’язані дані з системи.
 * Використовується, коли тренер видаляє з архіву учня, який так і не активував код.
 * Видаляє: плани та вправи планів, записи розкладу та reminders_sent, bot_training_data,
 * pricing, user_medical_conditions, measurements_history, bot_state, ai_generated_content (за entity_id = chatId), users.
 */
async function deleteInviteUserAndAllRelatedData(chatId) {
  const id = String(chatId);
  try {
    const plans = await getPlansByStudent(id);
    const planIds = (plans || []).map((p) => p.planId);
    for (const planId of planIds) {
      await getClient().from('training_plan_exercises').delete().eq('plan_id', planId);
      await getClient().from('training_plans').delete().eq('plan_id', planId);
    }
    const { data: slots } = await getClient()
      .from('workout_schedule')
      .select('id')
      .eq('student_id', id);
    const slotIds = (slots || []).map((s) => s.id);
    if (slotIds.length > 0) {
      await getClient().from('reminders_sent').delete().in('slot_id', slotIds);
    }
    await getClient().from('workout_schedule').delete().eq('student_id', id);
    await getClient().from('bot_training_data').delete().eq('chat_id', id);
    await getClient().from('pricing').delete().eq('student_id', id);
    await getClient().from('user_medical_conditions').delete().eq('chat_id', id);
    await getClient().from('measurements_history').delete().eq('chat_id', id);
    await deleteStateRow(id);
    await getClient().from('ai_generated_content').delete().eq('entity_id', id);
    await getClient().from('users').delete().eq('chat_id', id);
    return true;
  } catch (e) {
    console.error('Supabase deleteInviteUserAndAllRelatedData', e.message);
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

/** План з вправами по днях (для перегляду). Для progressive вправи беруться з getPlanWeekDay. */
async function getPlanWithExercises(planId) {
  try {
    const { data: planRow, error: planErr } = await getClient().from('training_plans').select('*').eq('plan_id', planId).single();
    if (planErr || !planRow) return null;
    const isProgressive = (planRow.generation_mode || '').toLowerCase() === 'progressive';
    let exRows = [];
    if (!isProgressive) {
      const { data: exData, error: exErr } = await getClient()
        .from('training_plan_exercises')
        .select('*')
        .eq('plan_id', planId)
        .order('day_number', { ascending: true })
        .order('order_in_day', { ascending: true });
      if (!exErr) exRows = exData || [];
    }
    const plan = {
      planId: planRow.plan_id,
      coachId: planRow.coach_id ? String(planRow.coach_id) : null,
      studentId: planRow.student_id ? String(planRow.student_id) : null,
      planName: planRow.plan_name,
      goal: planRow.goal,
      level: planRow.level,
      splitScheme: planRow.split_scheme,
      daysPerWeek: planRow.days_per_week,
      revisionWeeks: planRow.revision_weeks != null ? parseInt(planRow.revision_weeks, 10) : null,
      isActive: planRow.is_active === true,
      splitConfig: Array.isArray(planRow.split_config) ? planRow.split_config : [],
      generationMode: (planRow.generation_mode || 'simple').toLowerCase(),
      totalWeeks: planRow.total_weeks != null ? parseInt(planRow.total_weeks, 10) : (planRow.revision_weeks != null ? parseInt(planRow.revision_weeks, 10) : null),
      phaseDuration: planRow.phase_duration != null ? parseInt(planRow.phase_duration, 10) : null,
      activatedAt: planRow.activated_at || null,
      createdByRole: planRow.created_by_role || 'coach',
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

// --- training_plan_weeks (прогресивний план, ТЗ 8) ---

/** Пакетний INSERT у training_plan_weeks. */
async function insertTrainingPlanWeeks(rows) {
  if (!Array.isArray(rows) || !rows.length) return true;
  try {
    const client = getClient();
    const dbRows = rows.map((r) => ({
      plan_id: r.plan_id,
      week_number: r.week_number,
      day_number: r.day_number,
      day_label: r.day_label || null,
      phase: r.phase || 'A',
      exercise_id: r.exercise_id != null ? r.exercise_id : null,
      exercise_name: String(r.exercise_name || 'Вправа'),
      sets: r.sets != null ? parseInt(r.sets, 10) : null,
      reps: r.reps != null ? String(r.reps) : null,
      rest_sec: r.rest_sec != null ? parseInt(r.rest_sec, 10) : null,
      order_in_day: r.order_in_day != null ? parseInt(r.order_in_day, 10) : 1,
      notes: r.notes || null,
      ai_reason: r.ai_reason || null,
      medical_status: r.medical_status || 'NEUTRAL',
      target_weight: r.target_weight != null ? parseFloat(r.target_weight) : null
    }));
    const { error } = await client.from('training_plan_weeks').insert(dbRows);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertTrainingPlanWeeks', e.message);
    return false;
  }
}

/** Вправи одного дня одного тижня прогресивного плану. */
async function getPlanWeekDay(planId, weekNumber, dayNumber) {
  try {
    const { data: rows, error } = await getClient()
      .from('training_plan_weeks')
      .select('*')
      .eq('plan_id', planId)
      .eq('week_number', parseInt(weekNumber, 10))
      .eq('day_number', parseInt(dayNumber, 10))
      .order('order_in_day', { ascending: true });
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: r.id,
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      dayNumber: r.day_number,
      dayLabel: r.day_label,
      orderInDay: r.order_in_day,
      sets: r.sets,
      reps: r.reps,
      restSec: r.rest_sec,
      notes: r.notes,
      aiReason: r.ai_reason,
      targetWeight: r.target_weight != null ? parseFloat(r.target_weight) : null
    }));
  } catch (e) {
    console.error('Supabase getPlanWeekDay', e.message);
    return [];
  }
}

/** Оновити target_weight для вправи з заданого тижня (авто-прогресія). */
async function updateProgressivePlanExerciseWeight(planId, exerciseId, targetWeight, fromWeek) {
  try {
    const { error } = await getClient()
      .from('training_plan_weeks')
      .update({ target_weight: targetWeight != null ? parseFloat(targetWeight) : null })
      .eq('plan_id', planId)
      .eq('exercise_id', parseInt(exerciseId, 10))
      .gte('week_number', parseInt(fromWeek, 10));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateProgressivePlanExerciseWeight', e.message);
    return false;
  }
}

/** Оновити одну вправу в training_plan_weeks (редагування тренером). */
async function updatePlanWeekExercise(planId, weekNumber, dayNumber, orderInDay, newExercise) {
  try {
    const { error } = await getClient()
      .from('training_plan_weeks')
      .update({
        exercise_id: newExercise.exerciseId != null ? newExercise.exerciseId : null,
        exercise_name: String(newExercise.exerciseName || 'Вправа')
      })
      .eq('plan_id', planId)
      .eq('week_number', parseInt(weekNumber, 10))
      .eq('day_number', parseInt(dayNumber, 10))
      .eq('order_in_day', parseInt(orderInDay, 10));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updatePlanWeekExercise', e.message);
    return false;
  }
}

// --- gym_subscriptions (абонемент залу: сума, кількість тренувань/безліміт, термін) ---

/** Кількість унікальних днів з тренуваннями у діапазоні [startDate, endDate] (дати як YYYY-MM-DD або Date). */
async function getWorkoutDaysCountInRange(chatId, startDate, endDate) {
  try {
    const start = startDate instanceof Date ? startDate : new Date(String(startDate));
    const end = endDate instanceof Date ? endDate : new Date(String(endDate));
    const fromStr = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).toISOString();
    const toStr = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString();
    const rows = await getTrainingDataByChatAndDate(chatId, fromStr, toStr);
    const seen = new Set();
    for (const r of rows || []) {
      const d = r.date && r.date.slice ? r.date.slice(0, 10) : '';
      if (d) seen.add(d);
    }
    return seen.size;
  } catch (e) {
    console.error('Supabase getWorkoutDaysCountInRange', e.message);
    return 0;
  }
}

function subscriptionFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    chatId: String(r.chat_id || ''),
    amount: r.amount != null ? parseFloat(r.amount) : null,
    isUnlimited: r.is_unlimited === true,
    trainingsCount: r.trainings_count != null ? parseInt(r.trainings_count, 10) : null,
    startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    createdAt: toDate(r.created_at),
    reminderSent3Days: r.reminder_sent_3_days === true,
    reminderSent2Days: r.reminder_sent_2_days === true
  };
}

async function insertGymSubscription(data) {
  try {
    const row = {
      chat_id: String(data.chatId),
      amount: data.amount != null ? parseFloat(data.amount) : null,
      is_unlimited: data.isUnlimited === true,
      trainings_count: data.trainingsCount != null ? parseInt(data.trainingsCount, 10) : null,
      start_date: data.startDate ? String(data.startDate).slice(0, 10) : null,
      end_date: data.endDate ? String(data.endDate).slice(0, 10) : null,
      reminder_sent_3_days: false,
      reminder_sent_2_days: false
    };
    const { data: inserted, error } = await getClient().from('gym_subscriptions').insert(row).select('id').single();
    if (error) throw error;
    return inserted ? inserted.id : null;
  } catch (e) {
    console.error('Supabase insertGymSubscription', e.message);
    return null;
  }
}

/** Активний абонемент: end_date >= сьогодні і (безліміт або використано < trainings_count). */
async function getActiveGymSubscription(chatId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await getClient()
      .from('gym_subscriptions')
      .select('*')
      .eq('chat_id', String(chatId))
      .gte('end_date', today)
      .order('end_date', { ascending: false })
      .limit(10);
    if (error) throw error;
    if (!rows || !rows.length) return null;
    for (const r of rows) {
      const sub = subscriptionFromRow(r);
      if (sub.isUnlimited) return sub;
      const used = await getWorkoutDaysCountInRange(chatId, sub.startDate, sub.endDate);
      if (used < (sub.trainingsCount || 0)) return sub;
    }
    return null;
  } catch (e) {
    console.error('Supabase getActiveGymSubscription', e.message);
    return null;
  }
}

/** Всі абонементи користувача для історії (нові зверху). */
async function getGymSubscriptionsByChatId(chatId, limit = 50) {
  try {
    const { data: rows, error } = await getClient()
      .from('gym_subscriptions')
      .select('*')
      .eq('chat_id', String(chatId))
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map(subscriptionFromRow);
  } catch (e) {
    console.error('Supabase getGymSubscriptionsByChatId', e.message);
    return [];
  }
}

/** Абонементи, у яких end_date = указана дата (YYYY-MM-DD), reminder ще не надсилався для daysBefore. */
async function getGymSubscriptionsForReminder(endDateStr, daysBefore) {
  try {
    const col = daysBefore === 3 ? 'reminder_sent_3_days' : 'reminder_sent_2_days';
    const { data: rows, error } = await getClient()
      .from('gym_subscriptions')
      .select('*')
      .eq('end_date', String(endDateStr).slice(0, 10))
      .eq(col, false);
    if (error) throw error;
    return (rows || []).map(subscriptionFromRow);
  } catch (e) {
    console.error('Supabase getGymSubscriptionsForReminder', e.message);
    return [];
  }
}

async function markGymSubscriptionReminderSent(id, daysBefore) {
  try {
    const col = daysBefore === 3 ? 'reminder_sent_3_days' : 'reminder_sent_2_days';
    const { error } = await getClient().from('gym_subscriptions').update({ [col]: true }).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase markGymSubscriptionReminderSent', e.message);
    return false;
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
  upsertBodyGoals,
  getBodyGoals,
  getLatestMeasurementsForGoals,
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
  insertAlias,
  deleteAliasByIdAndUser,
  findAliasesForSearch,
  getAliasesByUserAndExercise,
  getAllAliasesByUser,
  getActiveMedicalConditions,
  getMedicalConditionsList,
  insertMedicalCondition,
  removeMedicalCondition,
  updateMedicalConditionsChatId,
  insertTrainingData,
  getTrainingDataByChatAndDate,
  getStudentRecentWorkoutsSummary,
  getAiCache,
  setAiCache,
  getLastWorkoutByExercise,
  getBestSetByExercise,
  getAllCoaches,
  getWorkoutDates,
  getWorkoutByDate,
  getLastExercisePerformance,
  getWorkoutDatesByMuscleGroup,
  getWorkoutDatesByExercise,
  getExercisesTrainedByStudent,
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
  insertTrainingPlanWeeks,
  getPlanWeekDay,
  updateProgressivePlanExerciseWeight,
  updatePlanWeekExercise,
  getPlansByStudent,
  setPlanActiveForStudent,
  getPlanWithExercises,
  getPlanExerciseIdsWithVid,
  getPreviousPlanIsolationExerciseIds,
  getExerciseUsageCountForStudent,
  REVISION_WEEKS_BY_LEVEL,
  deleteTrainingPlan,
  deleteTrainingPlanExercise,
  getInviteUnlinkedChatIds,
  deleteInviteUserAndAllRelatedData,
  getActivePlanForStudent,
  getPlansDueForRevision,
  markPlanRevisionReminderSent,
  deactivatePlan,
  insertPlanAdjustment,
  insertAIGeneratedContent,
  getAIGeneratedByEntity,
  getWorkoutDaysCountInRange,
  insertGymSubscription,
  getActiveGymSubscription,
  getGymSubscriptionsByChatId,
  getGymSubscriptionsForReminder,
  markGymSubscriptionReminderSent
};
