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

function safeJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [];
}

function safeJsonObject(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return null;
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
    oblast: r.oblast != null && String(r.oblast).trim() !== '' ? String(r.oblast).trim() : '',
    district: r.district != null && String(r.district).trim() !== '' ? String(r.district).trim() : '',
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
    armFlex: r.arm_flex != null ? r.arm_flex : null,
    shoulders: r.shoulders != null ? r.shoulders : null,
    chest: r.chest != null ? r.chest : null,
    neck: r.neck != null ? r.neck : null,
    wrist: r.wrist != null ? r.wrist : null,
    bodyFatPct: r.fat_pct_manual != null ? r.fat_pct_manual : (r.body_fat_pct != null ? r.body_fat_pct : null),
    bodyType: r.body_type != null ? String(r.body_type) : null,
    bodyBuild: r.body_build != null ? String(r.body_build) : null,
    fatPctManual: r.fat_pct_manual != null ? r.fat_pct_manual : null,
    fatPctNavy: r.fat_pct_navy != null ? r.fat_pct_navy : null,
    fatPctSource: r.fat_pct_source != null ? String(r.fat_pct_source) : null,
    instagram: r.instagram || '',
    coachTrainingTypes: Array.isArray(r.coach_training_types)
      ? r.coach_training_types.map((x) => String(x))
      : (r.coach_training_types ? [].concat(r.coach_training_types).map((x) => String(x)) : []),
    coachGroupTrainingDetails: r.coach_group_training_details != null ? String(r.coach_group_training_details) : '',
    calendarId: r.calendar_id || '',
    experienceStartDate: r.experience_start_date ? toDate(r.experience_start_date) : null,
    trainingDaysPerWeek: r.training_days_per_week != null ? r.training_days_per_week : null,
    activePlanId: r.active_plan_id || null,
    isArchived: r.is_archived === true,
    isBlocked: r.is_blocked === true,
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
    oblast: u.oblast != null && String(u.oblast).trim() !== '' ? String(u.oblast).trim() : null,
    district: u.district != null && String(u.district).trim() !== '' ? String(u.district).trim() : null,
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
    arm_flex: u.armFlex != null ? u.armFlex : null,
    shoulders: u.shoulders != null ? u.shoulders : null,
    chest: u.chest != null ? u.chest : null,
    neck: u.neck != null ? u.neck : null,
    wrist: u.wrist != null ? u.wrist : null,
    body_fat_pct: u.bodyFatPct != null ? u.bodyFatPct : null,
    body_type: u.bodyType != null ? String(u.bodyType) : null,
    body_build: u.bodyBuild != null ? String(u.bodyBuild) : null,
    fat_pct_manual: u.fatPctManual != null ? u.fatPctManual : (u.bodyFatPct != null ? u.bodyFatPct : null),
    fat_pct_navy: u.fatPctNavy != null ? u.fatPctNavy : null,
    fat_pct_source: u.fatPctSource != null ? String(u.fatPctSource) : null,
    instagram: u.instagram || '',
    coach_training_types: Array.isArray(u.coachTrainingTypes)
      ? u.coachTrainingTypes.map((x) => String(x))
      : (u.coachTrainingTypes ? [].concat(u.coachTrainingTypes).map((x) => String(x)) : []),
    coach_group_training_details:
      u.coachGroupTrainingDetails != null && String(u.coachGroupTrainingDetails).trim() !== ''
        ? String(u.coachGroupTrainingDetails)
        : null,
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

// --- city_list: oblast/city search (for UI autocomplete) ---
async function searchOblasts(prefix, limit = 12) {
  try {
    const q = String(prefix || '').trim();
    if (q.length < 2) return [];
    const { data: rows, error } = await getClient()
      .from('city_list')
      .select('oblast')
      .ilike('oblast', q + '%')
      .order('oblast', { ascending: true })
      .limit(Math.max(1, Math.min(50, parseInt(limit, 10) || 12)));
    if (error) throw error;
    const list = (rows || [])
      .map((r) => (r && r.oblast != null ? String(r.oblast).trim() : ''))
      .filter(Boolean);
    // dedupe while preserving order
    const seen = new Set();
    const out = [];
    for (const o of list) {
      const key = o.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error('Supabase searchOblasts', e.message);
    return [];
  }
}

async function searchCitiesInOblast(oblast, prefix, limit = 12) {
  try {
    const ob = String(oblast || '').trim();
    const q = String(prefix || '').trim();
    if (!ob) return [];
    if (q.length < 3) return [];
    const { data: rows, error } = await getClient()
      .from('city_list')
      .select('city_name')
      .eq('oblast', ob)
      .ilike('city_name', q + '%')
      .order('city_name', { ascending: true })
      .limit(Math.max(1, Math.min(50, parseInt(limit, 10) || 12)));
    if (error) throw error;
    const list = (rows || [])
      .map((r) => (r && r.city_name != null ? String(r.city_name).trim() : ''))
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const c of list) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error('Supabase searchCitiesInOblast', e.message);
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

/** Рядок users за первинним ключем user_id (на відміну від getUserByChatId — лише chat_id). */
async function getUserByUserId(userId) {
  try {
    const { data: rows, error } = await getClient()
      .from('users')
      .select('*')
      .eq('user_id', String(userId))
      .limit(1);
    if (error) throw error;
    if (rows && rows.length) return userFromRow(rows[0]);
    return null;
  } catch (e) {
    console.error('Supabase getUserByUserId', e.message);
    return null;
  }
}

/** Вирівняти chat_id до user_id для рядка з неконсистентними id (інакше getByChatId не знаходить, а replaceInvite дає duplicate key). */
async function syncUserChatIdToUserId(userId) {
  try {
    const id = String(userId);
    const { error } = await getClient().from('users').update({ chat_id: id }).eq('user_id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase syncUserChatIdToUserId', e.message);
    return false;
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

/** Знайти користувача за будь-яким варіантом ідентифікатора: chat_id або user_id.
 *  Покриває кейси INVITE_XXXX, USED_INVITE_XXXX та звичайний Telegram chat_id. */
async function findUserByAnyId(rawId) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  const variants = new Set([id, id.toUpperCase(), id.toLowerCase(), normalizeStudentIdForMatch(id)]);
  if (!id.toUpperCase().startsWith('INVITE_') && /^[A-F0-9]{4,}$/i.test(id)) {
    variants.add('INVITE_' + id.toUpperCase());
  }
  try {
    for (const v of variants) {
      if (!v) continue;
      const { data: rowsChat, error: errChat } = await getClient()
        .from('users')
        .select('*')
        .eq('chat_id', v)
        .limit(1);
      if (errChat) throw errChat;
      if (rowsChat && rowsChat.length) return userFromRow(rowsChat[0]);
    }
    for (const v of variants) {
      if (!v) continue;
      const { data: rowsUser, error: errUser } = await getClient()
        .from('users')
        .select('*')
        .eq('user_id', v)
        .limit(1);
      if (errUser) throw errUser;
      if (rowsUser && rowsUser.length) return userFromRow(rowsUser[0]);
    }
    return null;
  } catch (e) {
    console.error('Supabase findUserByAnyId', e.message);
    return null;
  }
}

/**
 * Нормалізація ідентифікатора учня для порівняння (регістр, префікс USED_).
 * Приклад: USED_INVITE_AB12 і INVITE_AB12 → однаковий ключ.
 */
function normalizeStudentIdForMatch(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  let u = s.toUpperCase();
  if (u.startsWith('USED_')) {
    s = s.slice(5);
    u = s.toUpperCase();
  }
  return u;
}

/** Заготовка інвайту в users (user_id INVITE_*), у т.ч. після активації (chat_id USED_INVITE_*). */
function isInviteTechnicalUserRow(r) {
  const uid = String((r && (r.user_id != null ? r.user_id : r.userId)) || '').trim();
  return uid.toUpperCase().startsWith('INVITE_');
}

/** Запит users для адмін-бота: лише реальні акаунти (без INVITE_* / USED_INVITE_* заготовок). */
function adminRealUsersQuery() {
  return getClient().from('users').not('user_id', 'ilike', 'INVITE_%');
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
  const realId = String(realChatId);
  const code = String(inviteCode);

  // ВАЖЛИВО: через FK `user_body_goals.chat_id -> users.chat_id` не можна
  // одразу міняти `users.chat_id` з inviteCode на realId (спершу треба перенести залежні рядки).
  // Тому: 1) створюємо real-користувача (як копію invite-рядка),
  // 2) переносимо залежні таблиці на realId,
  // 3) позначаємо invite як використаний.

  const inviteUser = await getUserByUserId(code);
  if (!inviteUser) throw new Error('Invite code not found');

  const existing = await getUserByChatId(realId);
  const activatedAt = new Date();
  if (!existing) {
    const inserted = await insertUser({
      ...inviteUser,
      // вставляємо нового користувача, не чіпаючи invite-рядок (щоб FK не зламався)
      userId: realId,
      chatId: realId,
      // Свіжий created_at — інакше в адмінці «Користувачі» сортування ховає нових (дата з INVITE_*).
      createdAt: activatedAt
    });
    if (!inserted) throw new Error('Failed to create real user for invite activation');
  } else {
    await touchUserInviteRegistrationStarted(realId, activatedAt);
  }

  // Переносимо залежні дані
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

  try {
    await updateMedicalConditionsChatId(code, realId);
  } catch (e) {
    console.error('Supabase replaceInviteWithChatId medical', e.message);
  }

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

  // Pricing теж могло зберігати student_id під inviteCode
  try {
    if (inviteUser.coachId) {
      const { error: errPricing } = await getClient()
        .from('pricing')
        .update({ student_id: realId })
        .eq('coach_id', String(inviteUser.coachId))
        .eq('student_id', code);
      if (errPricing) console.error('Supabase replaceInviteWithChatId pricing', errPricing.message);
    }
  } catch (e) {
    console.error('Supabase replaceInviteWithChatId pricing', e.message);
  }

  await markInviteAsUsed(code);
  return true;
}

async function updateUser(chatId, updates) {
  try {
    const row = {};
    if (updates.firstName !== undefined) row.first_name = updates.firstName;
    if (updates.lastName !== undefined) row.last_name = updates.lastName;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.oblast !== undefined) {
      const o = updates.oblast != null && String(updates.oblast).trim() !== '' ? String(updates.oblast).trim() : null;
      row.oblast = o;
    }
    if (updates.district !== undefined) {
      const di = updates.district != null && String(updates.district).trim() !== '' ? String(updates.district).trim() : null;
      row.district = di;
    }
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
    if (updates.armFlex !== undefined) row.arm_flex = updates.armFlex;
    if (updates.shoulders !== undefined) row.shoulders = updates.shoulders;
    if (updates.chest !== undefined) row.chest = updates.chest;
    if (updates.neck !== undefined) row.neck = updates.neck;
    if (updates.wrist !== undefined) row.wrist = updates.wrist;
    if (updates.bodyFatPct !== undefined) {
      row.body_fat_pct = updates.bodyFatPct; // backward-compat
      row.fat_pct_manual = updates.bodyFatPct;
      row.fat_pct_source = updates.bodyFatPct != null ? 'manual' : null;
    }
    if (updates.bodyType !== undefined) row.body_type = updates.bodyType;
    if (updates.bodyBuild !== undefined) row.body_build = updates.bodyBuild;
    if (updates.fatPctManual !== undefined) row.fat_pct_manual = updates.fatPctManual;
    if (updates.fatPctNavy !== undefined) row.fat_pct_navy = updates.fatPctNavy;
    if (updates.fatPctSource !== undefined) row.fat_pct_source = updates.fatPctSource;
    if (updates.instagram !== undefined) row.instagram = updates.instagram;
    if (updates.coachTrainingTypes !== undefined) {
      row.coach_training_types = Array.isArray(updates.coachTrainingTypes)
        ? updates.coachTrainingTypes.map((x) => String(x))
        : (updates.coachTrainingTypes ? [].concat(updates.coachTrainingTypes).map((x) => String(x)) : []);
    }
    if (updates.coachGroupTrainingDetails !== undefined) {
      const raw = updates.coachGroupTrainingDetails;
      row.coach_group_training_details =
        raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw).trim();
    }
    if (updates.calendarId !== undefined) row.calendar_id = updates.calendarId;
    if (updates.experienceStartDate !== undefined) row.experience_start_date = updates.experienceStartDate ? (toDate(updates.experienceStartDate).toISOString ? toDate(updates.experienceStartDate).toISOString() : updates.experienceStartDate) : null;
    if (updates.trainingDaysPerWeek !== undefined) row.training_days_per_week = updates.trainingDaysPerWeek;
    if (updates.activePlanId !== undefined) row.active_plan_id = updates.activePlanId || null;
    if (updates.isArchived !== undefined) row.is_archived = updates.isArchived === true;
    if (updates.isBlocked !== undefined) row.is_blocked = updates.isBlocked === true;
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin helpers
// ─────────────────────────────────────────────────────────────────────────────

async function adminInsertLog(row) {
  try {
    const payload = {
      admin_chat_id: String(row.adminChatId || ''),
      action: String(row.action || ''),
      target_user_chat_id: row.targetUserChatId != null ? String(row.targetUserChatId) : null,
      target_invite_code: row.targetInviteCode != null ? String(row.targetInviteCode) : null,
      payload_json: row.payloadJson != null ? row.payloadJson : null
    };
    if (!payload.admin_chat_id || !payload.action) throw new Error('admin_chat_id and action required');
    const { error } = await getClient().from('admin_log').insert(payload);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase adminInsertLog', e.message);
    return false;
  }
}

async function adminGetLastLogs(limit = 20) {
  try {
    const n = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const { data: rows, error } = await getClient()
      .from('admin_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(n);
    if (error) throw error;
    return rows || [];
  } catch (e) {
    console.error('Supabase adminGetLastLogs', e.message);
    return [];
  }
}

/** Підняти користувача вгору списку адмінки після старту invite-реєстрації. */
async function touchUserInviteRegistrationStarted(chatId, at) {
  const id = String(chatId || '').trim();
  if (!id) return false;
  const when = at instanceof Date ? at : new Date(at || Date.now());
  try {
    const { error } = await getClient()
      .from('users')
      .update({ created_at: when.toISOString() })
      .eq('chat_id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase touchUserInviteRegistrationStarted', e.message);
    return false;
  }
}

const ADMIN_USER_LIST_FIELDS = 'chat_id, first_name, last_name, role, coach_id, created_at, is_archived, is_blocked';

function mapAdminUserRows(rows) {
  return (rows || []).filter((r) => !isInviteTechnicalUserRow(r)).map((r) => userFromRow(r));
}

/** Усі реальні users з bot_state.inviteOnboarding (для першої сторінки адмінки). */
async function adminFetchUsersInInviteRegistration() {
  try {
    let stateRows = null;
    const { data: d1, error: e1 } = await getClient().from('bot_state').select('chat_id, data').contains('data', { inviteOnboarding: true });
    if (!e1) stateRows = d1;
    else {
      const { data: d2, error: e2 } = await getClient()
        .from('bot_state')
        .select('chat_id, data')
        .order('updated_at', { ascending: false })
        .limit(800);
      if (e2) throw e2;
      stateRows = (d2 || []).filter((row) => {
        const st = safeJsonObject(row.data) || row.data;
        return st && st.inviteOnboarding === true;
      });
    }
    const ids = [...new Set((stateRows || []).map((r) => String(r.chat_id || '')).filter(Boolean))];
    if (!ids.length) return [];
    const { data: rows, error } = await adminRealUsersQuery().select(ADMIN_USER_LIST_FIELDS).in('chat_id', ids);
    if (error) throw error;
    return mapAdminUserRows(rows).map((u) => ({ ...u, registrationInProgress: true }));
  } catch (e) {
    console.error('Supabase adminFetchUsersInInviteRegistration', e.message);
    return [];
  }
}

/** chat_id з незавершеною invite-реєстрацією (bot_state.data.inviteOnboarding). */
async function adminGetInviteOnboardingChatIds(chatIds) {
  const out = new Set();
  const ids = [...new Set((chatIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return out;
  try {
    const { data, error } = await getClient().from('bot_state').select('chat_id, data').in('chat_id', ids);
    if (error) throw error;
    for (const row of data || []) {
      const st = safeJsonObject(row.data) || row.data;
      if (st && st.inviteOnboarding === true) out.add(String(row.chat_id));
    }
  } catch (e) {
    console.error('Supabase adminGetInviteOnboardingChatIds', e.message);
  }
  return out;
}

async function adminUserRegistrationInProgress(chatId) {
  const set = await adminGetInviteOnboardingChatIds([chatId]);
  return set.has(String(chatId));
}

async function adminGetUsersPage(offset = 0, limit = 20) {
  try {
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));

    if (off === 0) {
      const inReg = await adminFetchUsersInInviteRegistration();
      const pinnedIds = new Set(inReg.map((u) => String(u.chatId)));
      const need = Math.max(0, lim - inReg.length);
      let rest = [];
      if (need > 0) {
        const { data: rows, error } = await adminRealUsersQuery()
          .select(ADMIN_USER_LIST_FIELDS)
          .order('created_at', { ascending: false })
          .limit(Math.max(need * 4, 40));
        if (error) throw error;
        rest = mapAdminUserRows(rows)
          .filter((u) => !pinnedIds.has(String(u.chatId)))
          .slice(0, need);
      }
      const merged = [...inReg, ...rest];
      const flags = await adminGetInviteOnboardingChatIds(merged.map((u) => u.chatId));
      return merged.map((u) => ({
        ...u,
        registrationInProgress: pinnedIds.has(String(u.chatId)) || flags.has(String(u.chatId))
      }));
    }

    const pinned = await adminFetchUsersInInviteRegistration();
    const exclude = new Set(pinned.map((u) => String(u.chatId)));
    const fetchN = Math.min(off + lim + exclude.size + 10, 500);
    const { data: rows, error } = await adminRealUsersQuery()
      .select(ADMIN_USER_LIST_FIELDS)
      .order('created_at', { ascending: false })
      .limit(fetchN);
    if (error) throw error;
    const filtered = mapAdminUserRows(rows).filter((u) => !exclude.has(String(u.chatId)));
    const users = filtered.slice(off, off + lim);
    const inProgress = await adminGetInviteOnboardingChatIds(users.map((u) => u.chatId));
    return users.map((u) => ({
      ...u,
      registrationInProgress: inProgress.has(String(u.chatId))
    }));
  } catch (e) {
    console.error('Supabase adminGetUsersPage', e.message);
    return [];
  }
}

async function adminGetUserByChatId(chatId) {
  return getUserByChatId(chatId);
}

async function adminCountUsers() {
  try {
    const { count, error } = await adminRealUsersQuery().select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Supabase adminCountUsers', e.message);
    return 0;
  }
}

async function adminCountUsersByRole(role) {
  try {
    const { count, error } = await adminRealUsersQuery()
      .select('*', { count: 'exact', head: true })
      .eq('role', String(role));
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Supabase adminCountUsersByRole', e.message);
    return 0;
  }
}

async function adminCountSoloStudents() {
  try {
    const { count, error } = await adminRealUsersQuery()
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student')
      .or('coach_id.is.null,coach_id.eq.');
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Supabase adminCountSoloStudents', e.message);
    return 0;
  }
}

async function adminCountBlockedUsers() {
  try {
    const { count, error } = await adminRealUsersQuery()
      .select('*', { count: 'exact', head: true })
      .eq('is_blocked', true);
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Supabase adminCountBlockedUsers', e.message);
    return 0;
  }
}

async function adminGetActiveInvites(offset = 0, limit = 50) {
  try {
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
    const { data: rows, error } = await getClient()
      .from('users')
      .select('user_id, chat_id, coach_id, created_at, first_name, last_name')
      .like('chat_id', 'INVITE_%')
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Active invite = not activated = chat_id == user_id == INVITE_XXXX
    const filtered = (rows || []).filter((r) => String(r.chat_id || '') === String(r.user_id || ''));
    return filtered.slice(off, off + lim).map((r) => ({
      chatId: String(r.chat_id || ''),
      coachId: r.coach_id ? String(r.coach_id) : null,
      createdAt: toDate(r.created_at),
      firstName: r.first_name || '',
      lastName: r.last_name || ''
    }));
  } catch (e) {
    console.error('Supabase adminGetActiveInvites', e.message);
    return [];
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
    arm_flex: m.armFlex != null ? m.armFlex : null,
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
      armFlex: r.arm_flex != null ? r.arm_flex : null,
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
      goal_arm: goals.goal_arm != null ? goals.goal_arm : null,
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

function cycleSettingsFromRow(r) {
  if (!r) return null;
  return {
    chatId: String(r.chat_id || ''),
    reproductiveStatus: r.reproductive_status != null ? String(r.reproductive_status) : 'unspecified',
    avgCycleLengthDays: r.avg_cycle_length_days != null ? r.avg_cycle_length_days : null,
    avgBleedingDays: r.avg_bleeding_days != null ? r.avg_bleeding_days : null,
    lastPeriodStart: r.last_period_start || null,
    lastPeriodUserEntered: r.last_period_user_entered === true,
    lastSymptomReminderSentAt: r.last_symptom_reminder_sent_at ? toDate(r.last_symptom_reminder_sent_at) : null,
    updatedAt: r.updated_at ? toDate(r.updated_at) : null
  };
}

async function upsertUserCycleSettings(chatId, payload = {}) {
  try {
    const row = {
      chat_id: String(chatId),
      reproductive_status: payload.reproductiveStatus || payload.reproductive_status || 'unspecified',
      avg_cycle_length_days:
        payload.avgCycleLengthDays != null ? payload.avgCycleLengthDays : payload.avg_cycle_length_days ?? null,
      avg_bleeding_days:
        payload.avgBleedingDays != null ? payload.avgBleedingDays : payload.avg_bleeding_days ?? null,
      last_period_start: payload.lastPeriodStart != null
        ? String(payload.lastPeriodStart).slice(0, 10)
        : (payload.last_period_start != null ? String(payload.last_period_start).slice(0, 10) : null),
      last_period_user_entered: payload.lastPeriodUserEntered === true || payload.last_period_user_entered === true,
      last_symptom_reminder_sent_at:
        payload.lastSymptomReminderSentAt != null
          ? (payload.lastSymptomReminderSentAt instanceof Date
            ? payload.lastSymptomReminderSentAt.toISOString()
            : String(payload.lastSymptomReminderSentAt))
          : (payload.last_symptom_reminder_sent_at != null
            ? String(payload.last_symptom_reminder_sent_at)
            : null),
      updated_at: new Date().toISOString()
    };
    if (row.reproductive_status === 'menopause' || row.reproductive_status === 'menopause_confirmed' || row.reproductive_status === 'postmenopause') {
      row.avg_cycle_length_days = null;
      row.avg_bleeding_days = null;
    }
    const { error } = await getClient().from('user_cycle_settings').upsert(row, { onConflict: 'chat_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase upsertUserCycleSettings', e.message);
    return false;
  }
}

async function markCycleSymptomReminderSent(chatId, when = new Date()) {
  try {
    const iso = when instanceof Date ? when.toISOString() : new Date(when).toISOString();
    const { error } = await getClient()
      .from('user_cycle_settings')
      .update({ last_symptom_reminder_sent_at: iso, updated_at: new Date().toISOString() })
      .eq('chat_id', String(chatId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase markCycleSymptomReminderSent', e.message);
    return false;
  }
}

async function getUserCycleSettings(chatId) {
  try {
    const { data, error } = await getClient()
      .from('user_cycle_settings')
      .select('*')
      .eq('chat_id', String(chatId))
      .maybeSingle();
    if (error) throw error;
    return cycleSettingsFromRow(data);
  } catch (e) {
    console.error('Supabase getUserCycleSettings', e.message);
    return null;
  }
}

async function insertCycleEventLog(chatId, ev = {}) {
  try {
    const row = {
      chat_id: String(chatId),
      event_type: ev.eventType || ev.event_type || 'period_start',
      event_date: ev.eventDate || ev.event_date
        ? String(ev.eventDate || ev.event_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      intensity: ev.intensity != null ? String(ev.intensity) : null,
      symptoms: ev.symptoms != null && typeof ev.symptoms === 'object' ? ev.symptoms : null,
      source: ev.source != null ? String(ev.source) : null
    };
    const { error } = await getClient().from('cycle_event_logs').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertCycleEventLog', e.message);
    return false;
  }
}

async function listCycleEventLogs(chatId, limit = 24) {
  try {
    let q = getClient()
      .from('cycle_event_logs')
      .select('event_type, event_date, intensity, symptoms, source, created_at')
      .eq('chat_id', String(chatId))
      .order('event_date', { ascending: false });
    if (limit != null && limit > 0) q = q.limit(limit);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map((r) => ({
      eventType: r.event_type || '',
      eventDate: r.event_date || null,
      intensity: r.intensity || null,
      symptoms: r.symptoms || null,
      source: r.source || null,
      createdAt: r.created_at ? toDate(r.created_at) : null
    }));
  } catch (e) {
    console.error('Supabase listCycleEventLogs', e.message);
    return [];
  }
}

async function insertCycleSymptomLog(chatId, payload = {}) {
  try {
    const row = {
      chat_id: String(chatId),
      log_date: payload.logDate ? String(payload.logDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      hot_flashes: payload.hotFlashes != null ? payload.hotFlashes : 0,
      sleep_quality: payload.sleepQuality != null ? payload.sleepQuality : 0,
      fatigue: payload.fatigue != null ? payload.fatigue : 0,
      joint_pain: payload.jointPain != null ? payload.jointPain : 0,
      mood_stress: payload.moodStress != null ? payload.moodStress : null,
      recovery_score: payload.recoveryScore != null ? payload.recoveryScore : null,
      note: payload.note != null ? String(payload.note) : null,
      source: payload.source != null ? String(payload.source) : null
    };
    const { error } = await getClient().from('cycle_symptom_logs').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase insertCycleSymptomLog', e.message);
    return false;
  }
}

async function getLatestCycleSymptomLog(chatId) {
  try {
    const { data, error } = await getClient()
      .from('cycle_symptom_logs')
      .select('*')
      .eq('chat_id', String(chatId))
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      logDate: data.log_date || null,
      hotFlashes: data.hot_flashes != null ? data.hot_flashes : 0,
      sleepQuality: data.sleep_quality != null ? data.sleep_quality : 0,
      fatigue: data.fatigue != null ? data.fatigue : 0,
      jointPain: data.joint_pain != null ? data.joint_pain : 0,
      moodStress: data.mood_stress != null ? data.mood_stress : null,
      recoveryScore: data.recovery_score != null ? data.recovery_score : null,
      note: data.note || null,
      source: data.source || null,
      createdAt: data.created_at ? toDate(data.created_at) : null
    };
  } catch (e) {
    console.error('Supabase getLatestCycleSymptomLog', e.message);
    return null;
  }
}

async function adminGetExerciseCycleFlagSummary() {
  try {
    const { data: rows, error } = await getClient()
      .from('exercise_library')
      .select('id, is_inversion, is_high_impact, cycle_flags_reviewed');
    if (error) throw error;
    const arr = rows || [];
    let inversion = 0;
    let highImpact = 0;
    let flaggedAny = 0;
    let reviewed = 0;
    for (const r of arr) {
      const inv = r.is_inversion === true;
      const hi = r.is_high_impact === true;
      const rv = r.cycle_flags_reviewed === true;
      if (inv) inversion++;
      if (hi) highImpact++;
       if (rv) reviewed++;
      if (inv || hi) flaggedAny++;
    }
    return {
      total: arr.length,
      inversion,
      highImpact,
      flaggedAny,
      reviewed,
      unflagged: Math.max(0, arr.length - reviewed)
    };
  } catch (e) {
    console.error('Supabase adminGetExerciseCycleFlagSummary', e.message);
    return { total: 0, inversion: 0, highImpact: 0, flaggedAny: 0, reviewed: 0, unflagged: 0 };
  }
}

async function adminGetExerciseCycleFlagList(kind = 'all', offset = 0, limit = 20) {
  try {
    const k = String(kind || 'all').trim();
    let q = getClient()
      .from('exercise_library')
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, is_inversion, is_high_impact, cycle_flags_reviewed')
      .order('id', { ascending: true })
      .range(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit) - 1);
    if (k === 'inversion') q = q.eq('is_inversion', true);
    else if (k === 'high_impact') q = q.eq('is_high_impact', true);
    else if (k === 'unflagged') q = q.eq('cycle_flags_reviewed', false);
    else if (k === 'menstrual_blocked') q = q.or('is_inversion.eq.true,is_high_impact.eq.true');
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: r.id,
      groupLevel1: r.group_level1 || '',
      groupLevel2: r.group_level2 || '',
      groupLevel3: r.group_level3 || '',
      nameUa: r.name_ua || '',
      nameRu: r.name_ru || '',
      isInversion: r.is_inversion === true,
      isHighImpact: r.is_high_impact === true,
      cycleFlagsReviewed: r.cycle_flags_reviewed === true
    }));
  } catch (e) {
    console.error('Supabase adminGetExerciseCycleFlagList', e.message);
    return [];
  }
}

async function adminSetExerciseCycleFlags(exerciseId, payload = {}) {
  try {
    const id = Number(exerciseId);
    if (!isFinite(id)) return false;
    const updates = {};
    if (payload.isInversion !== undefined) updates.is_inversion = payload.isInversion === true;
    if (payload.isHighImpact !== undefined) updates.is_high_impact = payload.isHighImpact === true;
    if (payload.cycleFlagsReviewed !== undefined) updates.cycle_flags_reviewed = payload.cycleFlagsReviewed === true;
    if (!Object.keys(updates).length) return false;
    const { error } = await getClient().from('exercise_library').update(updates).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase adminSetExerciseCycleFlags', e.message);
    return false;
  }
}

async function getLatestMeasurementsForGoals(chatId) {
  try {
    const { data, error } = await getClient()
      .from('measurements_history')
      .select('weight, waist, glutes, shoulders, chest, arm, neck, wrist')
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
/** Узгоджуємо з CONSTANTS.SCHEDULE_STATUS (Postgres enum/text інколи повертає інший регістр). */
function normalizeScheduleStatus(raw) {
  if (raw == null || raw === '') return 'AVAILABLE';
  const u = String(raw).trim().toUpperCase();
  const allowed = new Set(['AVAILABLE', 'RESERVED', 'REQUESTED', 'BOOKED', 'COMPLETED', 'CANCELED']);
  return allowed.has(u) ? u : 'AVAILABLE';
}

function slotFromRow(r) {
  if (!r) return null;
  const rawSid = r.student_id != null && String(r.student_id).trim() !== '' ? String(r.student_id).trim() : null;
  const camelSid = r.studentId != null && String(r.studentId).trim() !== '' ? String(r.studentId).trim() : null;
  const studentId = rawSid || camelSid || null;
  return {
    id: r.id || '',
    coachId: String(r.coach_id || ''),
    studentId,
    date: r.date ? new Date(r.date) : null,
    time: r.time || '',
    status: normalizeScheduleStatus(r.status),
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
    calEventId: r.cal_event_id || null,
    priceCharged: r.price_charged != null ? parseFloat(r.price_charged) : null,
    currency: (r.currency || '').toString(),
    trainingType: (r.training_type || '').toString(),
    /** Старий слот при запиті переносу (тренер → учень); інакше null */
    rescheduleFromSlotId: r.reschedule_from_slot_id ? String(r.reschedule_from_slot_id) : null
  };
}

function slotToRow(s) {
  const row = {
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
  if (s.rescheduleFromSlotId !== undefined) {
    row.reschedule_from_slot_id = s.rescheduleFromSlotId || null;
  }
  return row;
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
    const q = getClient()
      .from('workout_schedule')
      .select('*')
      .eq('coach_id', String(coachChatId))
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    let mapped = rows.map((r) => slotFromRow(r));
    /** Фільтр у JS: .eq('status', 'AVAILABLE') не знаходить рядок, якщо в БД інший регістр/формат enum. */
    if (status != null && status !== '') {
      mapped = mapped.filter((s) => s.status === status);
    }
    return mapped;
  } catch (e) {
    console.error('Supabase getSlotsByCoachAndStatus', e.message);
    return [];
  }
}

async function getSlotsByStudentAndStatus(studentChatId, status) {
  try {
    const q = getClient()
      .from('workout_schedule')
      .select('*')
      .eq('student_id', String(studentChatId))
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return [];
    let mapped = rows.map((r) => slotFromRow(r));
    if (status != null && status !== '') {
      mapped = mapped.filter((s) => s.status === status);
    }
    return mapped;
  } catch (e) {
    console.error('Supabase getSlotsByStudentAndStatus', e.message);
    return [];
  }
}

/** Кожні N зафіксованих тренувань → зсув experience_start_date на ~1 міс. назад (більше досвіду). */
const EXPERIENCE_TRAINING_MILESTONE = 8;
const EXPERIENCE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Запис однієї зафіксованої тренування (дедуплікація по chat_id + event_key).
 * Джерела: завершений слот розкладу, завершене вільне тренування, день плану без прив’язки до слота.
 * @param {string|number} chatId
 * @param {string} dedupeKey напр. slot:<uuid> або free:<...>
 */
async function recordExperienceTrainingSession(chatId, dedupeKey) {
  const cid = String(chatId || '').trim();
  const key = String(dedupeKey || '').trim().slice(0, 500);
  if (!cid || !key) return { inserted: false };

  try {
    const { error } = await getClient().from('experience_training_session_events').insert({ chat_id: cid, event_key: key });
    if (error) {
      if (error.code === '23505') return { inserted: false };
      throw error;
    }
  } catch (e) {
    const code = e && e.code;
    const msg = e && e.message ? String(e.message) : '';
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) return { inserted: false };
    if (msg.includes('does not exist') && msg.includes('experience_training_session_events')) {
      console.error('recordExperienceTrainingSession: run supabase_migration_experience_training_sessions.sql');
      return { inserted: false };
    }
    console.error('recordExperienceTrainingSession', msg);
    return { inserted: false };
  }

  let total = 0;
  try {
    const { count, error: cErr } = await getClient()
      .from('experience_training_session_events')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', cid);
    if (cErr) throw cErr;
    total = typeof count === 'number' ? count : 0;
  } catch (e) {
    console.error('recordExperienceTrainingSession count', e.message);
    return { inserted: true, total: null };
  }

  if (total > 0 && total % EXPERIENCE_TRAINING_MILESTONE === 0) {
    await applyExperienceMonthRewardFromTraining(cid, total);
  }
  return { inserted: true, total };
}

async function applyExperienceMonthRewardFromTraining(chatId, milestoneTotal) {
  try {
    const user = await getUserByChatId(chatId);
    if (!user) return;
    const anchor = user.experienceStartDate || user.createdAt || new Date();
    const a = anchor instanceof Date ? anchor : new Date(anchor);
    if (isNaN(a.getTime())) return;
    const newExp = new Date(a.getTime() - EXPERIENCE_MONTH_MS);
    const ok = await updateUser(chatId, { experienceStartDate: newExp });
    if (!ok) return;
    const Helpers = require('./helpers');
    await Helpers.safeSend(
      chatId,
      '📈 +1 місяць досвіду за регулярні тренування.\n\n' +
        'Зафіксовано ' +
        milestoneTotal +
        ' тренувань: кожні 8 зафіксованих тренувань (запис у розклад / «завершити тренування») додають один місяць до досвіду для AI та планів.'
    );
  } catch (e) {
    console.error('applyExperienceMonthRewardFromTraining', e.message);
  }
}

async function updateScheduleSlotStatus(slotId, newStatus) {
  const want = normalizeScheduleStatus(newStatus);
  let prior = null;
  try {
    prior = await getSlotById(slotId);
  } catch (e) {
    console.error('Supabase updateScheduleSlotStatus getSlotById', e.message);
  }
  try {
    const { error } = await getClient()
      .from('workout_schedule')
      .update({ status: want, updated_at: new Date().toISOString() })
      .eq('id', String(slotId));
    if (error) throw error;
    if (want === 'COMPLETED' && prior && normalizeScheduleStatus(prior.status) !== 'COMPLETED' && prior.studentId) {
      const sid = String(prior.studentId);
      setImmediate(() => {
        recordExperienceTrainingSession(sid, 'slot:' + String(slotId)).catch((err) =>
          console.error('recordExperienceTrainingSession slot', err.message)
        );
      });
    }
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

/** Статус AVAILABLE + student_id null (і скидання reschedule_from, якщо колонка є). Fallback — без reschedule_from або два кроки. */
async function releaseScheduleSlotToAvailable(slotId) {
  const id = String(slotId);
  const payloadFull = {
    status: 'AVAILABLE',
    student_id: null,
    reschedule_from_slot_id: null,
    updated_at: new Date().toISOString()
  };
  const payloadMinimal = {
    status: 'AVAILABLE',
    student_id: null,
    updated_at: new Date().toISOString()
  };
  try {
    const { error } = await getClient().from('workout_schedule').update(payloadFull).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase releaseScheduleSlotToAvailable (full)', e.message);
  }
  try {
    const { error } = await getClient().from('workout_schedule').update(payloadMinimal).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase releaseScheduleSlotToAvailable (minimal)', e.message);
  }
  try {
    const ok1 = await updateScheduleSlotStatus(id, 'AVAILABLE');
    const ok2 = await updateScheduleSlotStudentId(id, null);
    return !!(ok1 && ok2);
  } catch (e) {
    console.error('Supabase releaseScheduleSlotToAvailable (split)', e.message);
    return false;
  }
}

/** Зв'язок переносу: новий слот «йде» від старого (тільки для флоу тренер → учень). null — скинути. */
async function updateScheduleSlotRescheduleFrom(slotId, fromSlotIdOrNull) {
  try {
    const { error } = await getClient()
      .from('workout_schedule')
      .update({
        reschedule_from_slot_id: fromSlotIdOrNull ? String(fromSlotIdOrNull) : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(slotId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateScheduleSlotRescheduleFrom', e.message);
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

/** ГГ:ХХ для порівняння (9:00 і 09:00 — один слот). */
function normalizeWorkoutScheduleTime(t) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return String(t || '').trim();
  return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
}

async function slotExists(coachChatId, dateStr, timeStr) {
  try {
    const want = normalizeWorkoutScheduleTime(timeStr);
    const dateStart = dateStr + 'T00:00:00.000Z';
    const dateEnd = dateStr + 'T23:59:59.999Z';
    const { data: rows, error } = await getClient()
      .from('workout_schedule')
      .select('id,time')
      .eq('coach_id', String(coachChatId))
      .gte('date', dateStart)
      .lte('date', dateEnd);
    if (error) throw error;
    return (rows || []).some((r) => normalizeWorkoutScheduleTime(r.time) === want);
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
    let workHoursByWeekday = null;
    const rawWh = r.work_hours_by_weekday;
    if (rawWh != null && typeof rawWh === 'object' && !Array.isArray(rawWh)) {
      workHoursByWeekday = {};
      for (const k of Object.keys(rawWh)) {
        const entry = rawWh[k];
        if (entry && entry.start != null && entry.end != null) {
          workHoursByWeekday[String(k)] = { start: String(entry.start), end: String(entry.end) };
        }
      }
      if (Object.keys(workHoursByWeekday).length === 0) workHoursByWeekday = null;
    }
    return {
      coachId: String(r.coach_id),
      restDays: Array.isArray(r.rest_days) ? r.rest_days : [],
      workoutDurationMin: parseInt(r.workout_duration_min, 10) || 60,
      workStart: (r.work_start || '09:00').toString(),
      workEnd: (r.work_end || '21:00').toString(),
      workHoursByWeekday,
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
      work_hours_by_weekday:
        settings.workHoursByWeekday != null && typeof settings.workHoursByWeekday === 'object'
          ? settings.workHoursByWeekday
          : null,
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
      .gte('date', dateStart)
      .lte('date', dateEnd);
    if (error) throw error;
    if (!rows || !rows.length) return [];
    return rows
      .map((r) => slotFromRow(r))
      .filter((s) => s.status === 'BOOKED' || s.status === 'REQUESTED');
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

function customExerciseFromRow(r) {
  if (!r) return null;
  return {
    id: String(r.id || ''),
    ownerChatId: String(r.owner_chat_id || ''),
    name: String(r.name_ua || '').trim() || 'Вправа',
    sourceExerciseId: r.source_exercise_id != null ? r.source_exercise_id : null,
    groupLevel1: r.group_level1 ? String(r.group_level1).trim() : '',
    groupLevel2: r.group_level2 ? String(r.group_level2).trim() : '',
    groupLevel3: r.group_level3 ? String(r.group_level3).trim() : '',
    coachMedicalNote: r.coach_medical_note ? String(r.coach_medical_note).trim() : '',
    videoUrl: r.video_url ? String(r.video_url).trim() : '',
    isActive: r.is_active !== false,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at)
  };
}

async function insertUserCustomExercise(row = {}) {
  try {
    const owner = String(row.ownerChatId || '').trim();
    const name = String(row.nameUa || row.name || '').trim();
    if (!owner || name.length < 2) return null;
    const payload = {
      owner_chat_id: owner,
      name_ua: name,
      source_exercise_id: row.sourceExerciseId != null ? row.sourceExerciseId : null,
      group_level1: row.groupLevel1 ? String(row.groupLevel1).trim() : null,
      group_level2: row.groupLevel2 ? String(row.groupLevel2).trim() : null,
      group_level3: row.groupLevel3 ? String(row.groupLevel3).trim() : null,
      coach_medical_note: row.coachMedicalNote ? String(row.coachMedicalNote).trim() : null,
      video_url: row.videoUrl ? String(row.videoUrl).trim() : null,
      is_active: true,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await getClient()
      .from('user_custom_exercises')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data && data.id ? String(data.id) : null;
  } catch (e) {
    console.error('Supabase insertUserCustomExercise', e.message);
    return null;
  }
}

async function getUserCustomExerciseById(ownerChatId, id) {
  try {
    const owner = String(ownerChatId || '').trim();
    const eid = String(id || '').trim();
    if (!owner || !eid) return null;
    const { data: rows, error } = await getClient()
      .from('user_custom_exercises')
      .select('*')
      .eq('owner_chat_id', owner)
      .eq('id', eid)
      .eq('is_active', true)
      .limit(1);
    if (error) throw error;
    return rows && rows.length ? customExerciseFromRow(rows[0]) : null;
  } catch (e) {
    console.error('Supabase getUserCustomExerciseById', e.message);
    return null;
  }
}

async function listUserCustomExercisesByGroup(ownerChatId, groupLevel1, groupLevel2, groupLevel3) {
  try {
    const owner = String(ownerChatId || '').trim();
    if (!owner) return [];
    let q = getClient()
      .from('user_custom_exercises')
      .select('id, name_ua, group_level1, group_level2, group_level3')
      .eq('owner_chat_id', owner)
      .eq('is_active', true)
      .order('name_ua', { ascending: true });
    if (groupLevel1 != null && String(groupLevel1).trim() !== '') {
      q = q.eq('group_level1', String(groupLevel1).trim());
    }
    if (groupLevel2 != null && String(groupLevel2).trim() !== '' && groupLevel2 !== '__all__') {
      q = q.eq('group_level2', String(groupLevel2).trim());
    }
    if (groupLevel3 != null && String(groupLevel3).trim() !== '' && groupLevel3 !== '__all__') {
      q = q.eq('group_level3', String(groupLevel3).trim());
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: String(r.id),
      name: String(r.name_ua || '').trim() || 'Вправа',
      groupLevel1: r.group_level1 || '',
      groupLevel2: r.group_level2 || '',
      groupLevel3: r.group_level3 || '',
      isCustom: true
    }));
  } catch (e) {
    console.error('Supabase listUserCustomExercisesByGroup', e.message);
    return [];
  }
}

async function listAllUserCustomExercises(ownerChatId, limit = 200) {
  try {
    const owner = String(ownerChatId || '').trim();
    if (!owner) return [];
    const { data: rows, error } = await getClient()
      .from('user_custom_exercises')
      .select('id, name_ua, group_level1, group_level2, group_level3')
      .eq('owner_chat_id', owner)
      .eq('is_active', true)
      .order('name_ua', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: String(r.id),
      name: String(r.name_ua || '').trim() || 'Вправа',
      groupLevel1: r.group_level1 || '',
      groupLevel2: r.group_level2 || '',
      groupLevel3: r.group_level3 || '',
      isCustom: true
    }));
  } catch (e) {
    console.error('Supabase listAllUserCustomExercises', e.message);
    return [];
  }
}

async function getUserCustomExerciseSubgroups(ownerChatId, groupLevel1, groupLevel2) {
  try {
    const owner = String(ownerChatId || '').trim();
    if (!owner || !groupLevel1) return [];
    const col = groupLevel2 != null && String(groupLevel2).trim() !== '' ? 'group_level3' : 'group_level2';
    let q = getClient()
      .from('user_custom_exercises')
      .select(col)
      .eq('owner_chat_id', owner)
      .eq('is_active', true)
      .eq('group_level1', String(groupLevel1).trim());
    if (groupLevel2 != null && String(groupLevel2).trim() !== '') {
      q = q.eq('group_level2', String(groupLevel2).trim());
    }
    q = q.not(col, 'is', null);
    const { data: rows, error } = await q;
    if (error) throw error;
    const seen = {};
    const result = [];
    for (const r of rows || []) {
      const v = (r[col] || '').toString().trim();
      if (v && !seen[v]) {
        seen[v] = true;
        result.push(v);
      }
    }
    return result.sort();
  } catch (e) {
    console.error('Supabase getUserCustomExerciseSubgroups', e.message);
    return [];
  }
}

async function searchUserCustomExercises(ownerChatId, query, limit = 25) {
  try {
    const owner = String(ownerChatId || '').trim();
    const q = String(query || '').trim();
    if (!owner || q.length < 2) return [];
    const { data: rows, error } = await getClient()
      .from('user_custom_exercises')
      .select('id, name_ua, group_level1, group_level2, group_level3')
      .eq('owner_chat_id', owner)
      .eq('is_active', true)
      .ilike('name_ua', '%' + q + '%')
      .order('name_ua', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: String(r.id),
      name: String(r.name_ua || '').trim() || 'Вправа',
      groupLevel1: r.group_level1 || '',
      groupLevel2: r.group_level2 || '',
      groupLevel3: r.group_level3 || '',
      isCustom: true
    }));
  } catch (e) {
    console.error('Supabase searchUserCustomExercises', e.message);
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
      .select('id, group_level1, group_level2, group_level3, name_ua, name_ru, difficulty, vid, equipment, medical_contraindications, medical_limitations, safe_for, modifications, is_inversion, is_high_impact')
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
      equipment: (r.equipment || '').toString().toLowerCase(),
      isInversion: r.is_inversion === true,
      isHighImpact: r.is_high_impact === true
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
      custom_exercise_id: ex.customExerciseId != null ? String(ex.customExerciseId) : null,
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
 * pricing, user_medical_conditions, measurements_history, user_venues, bot_state,
 * ai_generated_content (за entity_id = chatId), users.
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
    await getClient().from('user_body_goals').delete().eq('chat_id', id);
    await getClient().from('user_venues').delete().eq('user_chat_id', id);
    await getClient().from('user_custom_exercises').delete().eq('owner_chat_id', id);
    await getClient().from('experience_training_session_events').delete().eq('chat_id', id);
    await deleteStateRow(id);
    await getClient().from('ai_generated_content').delete().eq('entity_id', id);
    await getClient().from('users').delete().eq('chat_id', id);
    return true;
  } catch (e) {
    console.error('Supabase deleteInviteUserAndAllRelatedData', e.message);
    return false;
  }
}

// --- support_requests (FitHad_helpbot) ---
async function supportCreateRequest({ topic, userChatId, userRole, techJson }) {
  try {
    const row = {
      topic: String(topic || ''),
      status: 'open',
      user_chat_id: String(userChatId || ''),
      user_role: userRole != null ? String(userRole) : null,
      tech_json: techJson != null ? techJson : null,
      thread_json: [],
      updated_at: new Date().toISOString()
    };
    const { data, error } = await getClient().from('support_requests').insert(row).select('id').single();
    if (error) throw error;
    return data && data.id ? String(data.id) : null;
  } catch (e) {
    console.error('Supabase supportCreateRequest', e.message);
    return null;
  }
}

async function supportGetRequestById(id) {
  try {
    const { data, error } = await getClient().from('support_requests').select('*').eq('id', String(id)).single();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('Supabase supportGetRequestById', e.message);
    return null;
  }
}

async function supportGetOpenRequests(offset = 0, limit = 20) {
  try {
    const { data, error } = await getClient()
      .from('support_requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.max(1, limit) - 1);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Supabase supportGetOpenRequests', e.message);
    return [];
  }
}

async function supportMergeTechJson(requestId, patch) {
  const id = String(requestId || '');
  if (!id || !patch || typeof patch !== 'object') return false;
  try {
    const existing = await supportGetRequestById(id);
    if (!existing) return false;
    const tech = existing.tech_json && typeof existing.tech_json === 'object' ? { ...existing.tech_json } : {};
    Object.assign(tech, patch);
    const { error } = await getClient()
      .from('support_requests')
      .update({ tech_json: tech, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase supportMergeTechJson', e.message);
    return false;
  }
}

async function supportAppendMessage(requestId, { from, text, operatorChatId }) {
  const id = String(requestId || '');
  try {
    const existing = await supportGetRequestById(id);
    if (!existing) return false;
    const thread = safeJsonArray(existing.thread_json);
    thread.push({ from: String(from || 'user'), text: String(text || ''), at: new Date().toISOString() });
    const patch = {
      thread_json: thread,
      updated_at: new Date().toISOString()
    };
    if (String(from) === 'user') patch.last_user_message = String(text || '');
    else {
      patch.last_operator_message = String(text || '');
      patch.operator_chat_id = operatorChatId != null ? String(operatorChatId) : existing.operator_chat_id;
    }
    const { error } = await getClient().from('support_requests').update(patch).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase supportAppendMessage', e.message);
    return false;
  }
}

async function supportCloseRequest(requestId, { closedBy, operatorChatId } = {}) {
  const id = String(requestId || '');
  try {
    const patch = {
      status: 'closed',
      updated_at: new Date().toISOString(),
      closed_at: new Date().toISOString()
    };
    if (operatorChatId != null) patch.operator_chat_id = String(operatorChatId);
    const { error } = await getClient().from('support_requests').update(patch).eq('id', id);
    if (error) throw error;
    // optional audit (reuse admin_log)
    try {
      if (operatorChatId != null) {
        await adminInsertLog({
          adminChatId: String(operatorChatId),
          action: 'support_close',
          payloadJson: { requestId: id, closedBy: closedBy || null }
        });
      }
    } catch (_) {}
    return true;
  } catch (e) {
    console.error('Supabase supportCloseRequest', e.message);
    return false;
  }
}

async function supportGenerateUniversalInvite({ operatorChatId, prefill } = {}) {
  const crypto = require('crypto');
  const MAX_ATTEMPTS = 8;
  const pf = prefill && typeof prefill === 'object' ? prefill : null;
  const pfFirst = pf && pf.firstName != null ? String(pf.firstName).trim() : '';
  const pfLast = pf && pf.lastName != null ? String(pf.lastName).trim() : '';
  const pfCity = pf && pf.city != null ? String(pf.city).trim() : '';
  const pfOblast = pf && pf.oblast != null ? String(pf.oblast).trim() : '';
  const usePrefillName = pfFirst.length >= 2 && pfLast.length >= 2;
  try {
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = 'INVITE_' + suffix;
      const exists = await getUserByUserId(code);
      if (!exists) {
        const ok = await insertUser({
          chatId: code,
          userId: code,
          role: 'student',
          firstName: usePrefillName ? pfFirst : 'Інвайт',
          lastName: usePrefillName ? pfLast : '',
          city: pfCity || '',
          oblast: pfOblast || null,
          coachId: null,
          createdAt: new Date()
        });
        if (!ok) throw new Error('Failed to insert invite user row');
        if (operatorChatId != null) {
          try {
            await adminInsertLog({
              adminChatId: String(operatorChatId),
              action: 'support_invite_generate',
              targetInviteCode: code,
              payloadJson: usePrefillName ? { prefill: true, city: pfCity || null } : {}
            });
          } catch (_) {}
        }
        return code;
      }
      attempts++;
    }
    return null;
  } catch (e) {
    console.error('Supabase supportGenerateUniversalInvite', e.message);
    return null;
  }
}

/**
 * Admin: delete a student account.
 * - Frees coach slots (does NOT delete slots): BOOKED/REQUESTED slots with student_id=chatId → AVAILABLE + student_id=null
 * - Deletes student's personal data tables.
 */
async function adminDeleteStudentCascade(chatId) {
  const id = String(chatId);
  try {
    // Free schedule slots and cleanup reminders
    const { data: slots, error: slotsErr } = await getClient()
      .from('workout_schedule')
      .select('id')
      .eq('student_id', id);
    if (slotsErr) throw slotsErr;
    const slotIds = (slots || []).map((s) => String(s.id)).filter(Boolean);
    if (slotIds.length > 0) {
      await getClient().from('reminders_sent').delete().in('slot_id', slotIds);
      for (const slotId of slotIds) {
        await releaseScheduleSlotToAvailable(slotId);
      }
    }

    // Plans (student_id)
    const plans = await getPlansByStudent(id);
    const planIds = (plans || []).map((p) => p.planId);
    for (const planId of planIds) {
      await getClient().from('training_plan_exercises').delete().eq('plan_id', planId);
      await getClient().from('training_plans').delete().eq('plan_id', planId);
    }

    // Personal tables
    await getClient().from('bot_training_data').delete().eq('chat_id', id);
    await getClient().from('pricing').delete().eq('student_id', id);
    await getClient().from('user_medical_conditions').delete().eq('chat_id', id);
    await getClient().from('measurements_history').delete().eq('chat_id', id);
    await getClient().from('user_body_goals').delete().eq('chat_id', id);
    await getClient().from('user_venues').delete().eq('user_chat_id', id);
    await getClient().from('user_custom_exercises').delete().eq('owner_chat_id', id);
    await getClient().from('experience_training_session_events').delete().eq('chat_id', id);
    await deleteStateRow(id);
    await getClient().from('ai_generated_content').delete().eq('entity_id', id);

    // Delete user row
    await getClient().from('users').delete().eq('chat_id', id);
    return true;
  } catch (e) {
    console.error('Supabase adminDeleteStudentCascade', e.message);
    return false;
  }
}

/**
 * Admin: delete a coach account.
 * - Detaches students (coach_id=null)
 * - Deletes coach slots/invites/pricing/settings/vacations and coach personal tables.
 */
async function adminDeleteCoachCascade(chatId) {
  const id = String(chatId);
  try {
    // Detach students
    const students = await getStudentsByCoachId(id);
    for (const s of students || []) {
      await updateUser(String(s.chatId), { coachId: null });
    }

    // Delete unused/used invite rows created by coach (they are in users with user_id like INVITE_% and coach_id = coach)
    const { data: inviteRows, error: invErr } = await getClient()
      .from('users')
      .select('user_id')
      .eq('coach_id', id)
      .like('user_id', 'INVITE_%');
    if (invErr) throw invErr;
    for (const r of inviteRows || []) {
      const code = String(r.user_id || '');
      if (!code) continue;
      // try delete by possible chat_id variants
      await deleteInviteUserAndAllRelatedData(code);
      await deleteInviteUserAndAllRelatedData('USED_' + code);
    }

    // Delete coach schedule slots + reminders
    const { data: coachSlots, error: coachSlotsErr } = await getClient()
      .from('workout_schedule')
      .select('id')
      .eq('coach_id', id);
    if (coachSlotsErr) throw coachSlotsErr;
    const coachSlotIds = (coachSlots || []).map((s) => String(s.id)).filter(Boolean);
    if (coachSlotIds.length > 0) {
      await getClient().from('reminders_sent').delete().in('slot_id', coachSlotIds);
    }
    await getClient().from('workout_schedule').delete().eq('coach_id', id);

    // Delete coach pricing rows (default + per-student)
    await getClient().from('pricing').delete().eq('coach_id', id);

    // Delete coach settings / vacations
    await getClient().from('coach_schedule_settings').delete().eq('coach_id', id);
    await getClient().from('coach_vacation_days').delete().eq('coach_id', id);
    await getClient().from('coach_venues').delete().eq('coach_chat_id', id);

    // Coach personal tables (self training etc.)
    await getClient().from('bot_training_data').delete().eq('chat_id', id);
    await getClient().from('user_medical_conditions').delete().eq('chat_id', id);
    await getClient().from('measurements_history').delete().eq('chat_id', id);
    await getClient().from('user_body_goals').delete().eq('chat_id', id);
    await deleteStateRow(id);
    await getClient().from('ai_generated_content').delete().eq('entity_id', id);

    // Finally delete coach user row
    await getClient().from('users').delete().eq('chat_id', id);
    return true;
  } catch (e) {
    console.error('Supabase adminDeleteCoachCascade', e.message);
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
        customExerciseId: r.custom_exercise_id ? String(r.custom_exercise_id) : null,
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

// --- venues (довідник закладів) ---
const translitUa = require('./translitUa').translitUa;

function venueFromRow(r, facetsRows) {
  if (!r) return null;
  const raw = facetsRows || r.venue_facets || [];
  const facets = raw.map((f) => ({
    facetKind: f.facet_kind || f.facetKind,
    code: f.code || '',
    labelUa: f.label_ua != null && String(f.label_ua).trim() !== '' ? String(f.label_ua).trim() : null
  }));
  return {
    id: r.id,
    nameUa: r.name_ua || '',
    oblast: r.oblast || '',
    city: r.city || '',
    address: r.address || '',
    district: r.district != null && String(r.district).trim() !== '' ? String(r.district).trim() : '',
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    telegramUrl: r.telegram_url || '',
    instagramUrl: r.instagram_url || '',
    phone: r.phone || '',
    organizationType: r.organization_type || '',
    isActive: r.is_active !== false,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
    createdByOperatorChatId: r.created_by_operator_chat_id || '',
    facets
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function venueMatchesNameQuery(nameUa, queryRaw) {
  const q = String(queryRaw || '').trim();
  if (!q) return true;
  const nu = String(nameUa || '').toLowerCase();
  if (nu.indexOf(q.toLowerCase()) >= 0) return true;
  const tName = translitUa(nameUa);
  const tQ = translitUa(q);
  if (!tQ) return true;
  return tName.indexOf(tQ) >= 0;
}

function venueMatchesFacetFilters(venue, { studioCodes = [], sectionCodes = [], groupClassCodes = [] } = {}) {
  const byKind = (kind, codes) => {
    if (!codes || !codes.length) return true;
    const set = new Set((venue.facets || []).filter((f) => f.facetKind === kind).map((f) => f.code));
    return codes.some((c) => set.has(c));
  };
  return (
    byKind('studio', studioCodes) &&
    byKind('section', sectionCodes) &&
    byKind('group_class', groupClassCodes)
  );
}

async function getVenueDirectoryCodes(kind = null) {
  try {
    let q = getClient().from('venue_directory_codes').select('kind, code, label_ua').order('kind').order('label_ua');
    if (kind) q = q.eq('kind', String(kind));
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map((r) => ({
      kind: r.kind,
      code: r.code,
      labelUa: r.label_ua || ''
    }));
  } catch (e) {
    console.error('Supabase getVenueDirectoryCodes', e.message);
    return [];
  }
}

async function insertVenueRow(row, facetRows) {
  const { data: inserted, error } = await getClient().from('venues').insert(row).select('id').single();
  if (error) throw error;
  const vid = inserted && inserted.id;
  if (!vid) return null;
  if (facetRows && facetRows.length) {
    const rowsIns = facetRows.map((f) => {
      const row = { venue_id: vid, facet_kind: f.facetKind, code: f.code };
      if (f.labelUa != null && String(f.labelUa).trim() !== '') row.label_ua = String(f.labelUa).trim();
      return row;
    });
    const { error: e2 } = await getClient().from('venue_facets').insert(rowsIns);
    if (e2) throw e2;
  }
  return vid;
}

/**
 * @param {object} p
 * @param {string} p.nameUa
 * @param {string} p.oblast
 * @param {string} p.city
 * @param {string} [p.address]
 * @param {string} [p.district]
 * @param {number} p.latitude
 * @param {number} p.longitude
 * @param {string} [p.telegramUrl]
 * @param {string} [p.instagramUrl]
 * @param {string} p.organizationType
 * @param {string} [p.createdByOperatorChatId]
 * @param {{ facetKind: string, code: string, labelUa?: string }[]} [p.facets]
 */
async function insertVenue(p = {}) {
  try {
    const row = {
      name_ua: String(p.nameUa || '').trim(),
      oblast: String(p.oblast || '').trim(),
      city: String(p.city || '').trim(),
      address: p.address != null && String(p.address).trim() !== '' ? String(p.address).trim() : null,
      district: p.district != null && String(p.district).trim() !== '' ? String(p.district).trim() : null,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      telegram_url: p.telegramUrl ? String(p.telegramUrl).trim() : null,
      instagram_url: p.instagramUrl ? String(p.instagramUrl).trim() : null,
      phone: p.phone ? String(p.phone).trim() : null,
      organization_type: String(p.organizationType || '').trim(),
      is_active: true,
      created_by_operator_chat_id: p.createdByOperatorChatId ? String(p.createdByOperatorChatId) : null,
      updated_at: new Date().toISOString()
    };
    if (!row.name_ua || !row.oblast || !row.city || Number.isNaN(row.latitude) || Number.isNaN(row.longitude) || !row.organization_type) {
      return null;
    }
    const facetRows = (p.facets || [])
      .filter((f) => f && f.code && f.facetKind)
      .map((f) => {
        const o = { facetKind: f.facetKind, code: String(f.code) };
        if (f.labelUa != null && String(f.labelUa).trim() !== '') o.labelUa = String(f.labelUa).trim();
        return o;
      });
    return await insertVenueRow(row, facetRows);
  } catch (e) {
    console.error('Supabase insertVenue', e.message);
    return null;
  }
}

async function updateVenue(venueId, patch = {}) {
  try {
    const row = { updated_at: new Date().toISOString() };
    if (patch.nameUa !== undefined) row.name_ua = String(patch.nameUa).trim();
    if (patch.oblast !== undefined) row.oblast = String(patch.oblast).trim();
    if (patch.city !== undefined) row.city = String(patch.city).trim();
    if (patch.address !== undefined) row.address = patch.address ? String(patch.address).trim() : null;
    if (patch.district !== undefined) row.district = patch.district ? String(patch.district).trim() : null;
    if (patch.latitude !== undefined) row.latitude = Number(patch.latitude);
    if (patch.longitude !== undefined) row.longitude = Number(patch.longitude);
    if (patch.telegramUrl !== undefined) row.telegram_url = patch.telegramUrl ? String(patch.telegramUrl).trim() : null;
    if (patch.instagramUrl !== undefined) row.instagram_url = patch.instagramUrl ? String(patch.instagramUrl).trim() : null;
    if (patch.phone !== undefined) row.phone = patch.phone ? String(patch.phone).trim() : null;
    if (patch.organizationType !== undefined) row.organization_type = String(patch.organizationType).trim();
    if (patch.isActive !== undefined) row.is_active = !!patch.isActive;
    const { error } = await getClient().from('venues').update(row).eq('id', String(venueId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase updateVenue', e.message);
    return false;
  }
}

async function replaceVenueFacets(venueId, facets = []) {
  try {
    const vid = String(venueId);
    const { error: delErr } = await getClient().from('venue_facets').delete().eq('venue_id', vid);
    if (delErr) throw delErr;
    const rows = facets
      .filter((f) => f && f.code && f.facetKind)
      .map((f) => {
        const row = { venue_id: vid, facet_kind: String(f.facetKind), code: String(f.code) };
        if (f.labelUa != null && String(f.labelUa).trim() !== '') row.label_ua = String(f.labelUa).trim();
        return row;
      });
    if (!rows.length) return true;
    const { error } = await getClient().from('venue_facets').insert(rows);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase replaceVenueFacets', e.message);
    return false;
  }
}

async function getVenueById(venueId) {
  try {
    const { data: r, error } = await getClient()
      .from('venues')
      .select('*, venue_facets ( facet_kind, code, label_ua )')
      .eq('id', String(venueId))
      .maybeSingle();
    if (error) throw error;
    if (!r) return null;
    const facets = (r.venue_facets || []).map((f) => ({
      facet_kind: f.facet_kind,
      code: f.code,
      label_ua: f.label_ua
    }));
    return venueFromRow(r, facets);
  } catch (e) {
    console.error('Supabase getVenueById', e.message);
    return null;
  }
}

async function listVenuesForAdmin(limit = 50) {
  try {
    const { data: rows, error } = await getClient()
      .from('venues')
      .select('*, venue_facets ( facet_kind, code, label_ua )')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map((r) => venueFromRow(r, r.venue_facets));
  } catch (e) {
    console.error('Supabase listVenuesForAdmin', e.message);
    return [];
  }
}

async function deleteVenueCascade(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return false;
    const { error } = await getClient().from('venues').delete().eq('id', vid);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteVenueCascade', e.message);
    return false;
  }
}

// --- venue hours (working time) ---
function venueHourFromRow(r) {
  if (!r) return null;
  return {
    venueId: r.venue_id,
    weekday: r.weekday != null ? Number(r.weekday) : null,
    isClosed: r.is_closed === true,
    timeOpen: r.time_open != null ? String(r.time_open) : null,
    timeClose: r.time_close != null ? String(r.time_close) : null,
    updatedAt: toDate(r.updated_at),
    createdAt: toDate(r.created_at)
  };
}

async function getVenueHours(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data: rows, error } = await getClient()
      .from('venue_hours')
      .select('*')
      .eq('venue_id', vid)
      .order('weekday', { ascending: true });
    if (error) throw error;
    return (rows || []).map(venueHourFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase getVenueHours', e.message);
    return [];
  }
}

async function upsertVenueHours(venueId, hours = []) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return false;
    const rows = (hours || [])
      .filter((h) => h && h.weekday != null)
      .map((h) => ({
        venue_id: vid,
        weekday: Number(h.weekday),
        is_closed: !!h.isClosed,
        time_open: h.isClosed ? null : (h.timeOpen ? String(h.timeOpen) : null),
        time_close: h.isClosed ? null : (h.timeClose ? String(h.timeClose) : null),
        updated_at: new Date().toISOString()
      }));
    if (!rows.length) return true;
    const { error } = await getClient().from('venue_hours').upsert(rows, { onConflict: 'venue_id,weekday' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase upsertVenueHours', e.message);
    return false;
  }
}

// --- venue schedule (group classes timetable) ---
function venueScheduleFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    venueId: r.venue_id,
    weekday: r.weekday != null ? Number(r.weekday) : null,
    timeStart: r.time_start != null ? String(r.time_start) : null,
    timeEnd: r.time_end != null ? String(r.time_end) : null,
    title: r.title != null ? String(r.title) : null,
    groupClassCode: r.group_class_code != null ? String(r.group_class_code) : null,
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: toDate(r.created_at)
  };
}

async function listVenueSchedule(venueId, limit = 200) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data: rows, error } = await getClient()
      .from('venue_schedule')
      .select('*')
      .eq('venue_id', vid)
      .order('weekday', { ascending: true })
      .order('time_start', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map(venueScheduleFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase listVenueSchedule', e.message);
    return [];
  }
}

async function addVenueScheduleItem(p = {}) {
  try {
    const vid = String(p.venueId || '').trim();
    if (!vid) return null;
    const row = {
      venue_id: vid,
      weekday: Number(p.weekday),
      time_start: p.timeStart != null && String(p.timeStart).trim() !== '' ? String(p.timeStart) : null,
      time_end: p.timeEnd != null && String(p.timeEnd).trim() !== '' ? String(p.timeEnd) : null,
      title: p.title != null && String(p.title).trim() !== '' ? String(p.title).trim() : null,
      group_class_code: p.groupClassCode != null && String(p.groupClassCode).trim() !== '' ? String(p.groupClassCode).trim() : null,
      notes: p.notes != null && String(p.notes).trim() !== '' ? String(p.notes).trim() : null
    };
    if (!row.weekday || row.weekday < 1 || row.weekday > 7) return null;
    const { data: inserted, error } = await getClient().from('venue_schedule').insert(row).select('*').single();
    if (error) throw error;
    return venueScheduleFromRow(inserted);
  } catch (e) {
    console.error('Supabase addVenueScheduleItem', e.message);
    return null;
  }
}

async function deleteVenueScheduleItem(venueId, scheduleId) {
  try {
    const vid = String(venueId || '').trim();
    const sid = String(scheduleId || '').trim();
    if (!vid || !sid) return false;
    const { error } = await getClient().from('venue_schedule').delete().eq('id', sid).eq('venue_id', vid);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteVenueScheduleItem', e.message);
    return false;
  }
}

function venueGroupClassPriceFromRow(r) {
  if (!r) return null;
  return {
    id: String(r.id),
    venueId: String(r.venue_id),
    groupClassCode: String(r.group_class_code || ''),
    price: r.price != null ? parseFloat(r.price) : 0,
    currency: (r.currency || 'UAH').toString(),
    labelUa: r.label_ua != null ? String(r.label_ua).trim() : null,
    sortOrder: Number(r.sort_order) || 0,
    isActive: !!r.is_active
  };
}

function venueGymMembershipOfferFromRow(r) {
  if (!r) return null;
  return {
    id: String(r.id),
    venueId: String(r.venue_id),
    labelUa: String(r.label_ua || ''),
    trainingsPerMonth: r.trainings_per_month != null ? Number(r.trainings_per_month) : null,
    isUnlimited: !!r.is_unlimited,
    price: r.price != null ? parseFloat(r.price) : 0,
    currency: (r.currency || 'UAH').toString(),
    billingPeriod: (r.billing_period || 'month').toString(),
    sortOrder: Number(r.sort_order) || 0,
    isActive: !!r.is_active
  };
}

function venueAncillaryServiceFromRow(r) {
  if (!r) return null;
  return {
    id: String(r.id),
    venueId: String(r.venue_id),
    serviceCode: String(r.service_code || ''),
    labelUa: String(r.label_ua || ''),
    price: r.price != null ? parseFloat(r.price) : 0,
    currency: (r.currency || 'UAH').toString(),
    unit: (r.unit || 'one_time').toString(),
    sortOrder: Number(r.sort_order) || 0,
    isActive: !!r.is_active
  };
}

/** Інформативні ціни групових у закладі (venue_group_class_prices). */
async function listVenueGroupClassPrices(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data, error } = await getClient()
      .from('venue_group_class_prices')
      .select('*')
      .eq('venue_id', vid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('group_class_code', { ascending: true });
    if (error) throw error;
    return (data || []).map(venueGroupClassPriceFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase listVenueGroupClassPrices', e.message);
    return [];
  }
}

async function upsertVenueGroupClassPrice(venueId, payload = {}) {
  try {
    const vid = String(venueId || '').trim();
    const code = String(payload.groupClassCode || '').trim();
    if (!vid || !code) return null;
    const price = payload.price != null ? Number(payload.price) : NaN;
    if (Number.isNaN(price) || price < 0) return null;
    const currency = (payload.currency || 'UAH').toString().trim() || 'UAH';
    const labelUa = payload.labelUa != null && String(payload.labelUa).trim() !== '' ? String(payload.labelUa).trim() : null;
    const row = {
      venue_id: vid,
      group_class_code: code,
      price,
      currency,
      label_ua: labelUa,
      updated_at: new Date().toISOString(),
      is_active: true
    };
    const { data, error } = await getClient()
      .from('venue_group_class_prices')
      .upsert(row, { onConflict: 'venue_id,group_class_code' })
      .select('*')
      .single();
    if (error) throw error;
    return venueGroupClassPriceFromRow(data);
  } catch (e) {
    console.error('Supabase upsertVenueGroupClassPrice', e.message);
    return null;
  }
}

/** Повертає venue_id рядка ціни (для відновлення чернетки адмінки після видалення). */
async function getVenueIdForPricingRow(table, rowId) {
  const id = String(rowId || '').trim();
  if (!id || !table) return '';
  try {
    const { data, error } = await getClient().from(table).select('venue_id').eq('id', id).maybeSingle();
    if (error) throw error;
    return data && data.venue_id ? String(data.venue_id) : '';
  } catch (e) {
    console.error('Supabase getVenueIdForPricingRow', e.message);
    return '';
  }
}

async function deleteVenueGroupClassPrice(rowId) {
  try {
    const id = String(rowId || '').trim();
    if (!id) return false;
    const { error } = await getClient().from('venue_group_class_prices').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteVenueGroupClassPrice', e.message);
    return false;
  }
}

async function listVenueGymMembershipOffers(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data, error } = await getClient()
      .from('venue_gym_membership_offers')
      .select('*')
      .eq('venue_id', vid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('price', { ascending: true });
    if (error) throw error;
    return (data || []).map(venueGymMembershipOfferFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase listVenueGymMembershipOffers', e.message);
    return [];
  }
}

async function insertVenueGymMembershipOffer(venueId, payload = {}) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return null;
    const labelUa = String(payload.labelUa || '').trim();
    if (!labelUa) return null;
    const isUnlimited = !!payload.isUnlimited;
    let tpm = payload.trainingsPerMonth != null ? Number(payload.trainingsPerMonth) : null;
    if (isUnlimited) tpm = null;
    else if (!tpm || tpm < 1) return null;
    const price = payload.price != null ? Number(payload.price) : NaN;
    if (Number.isNaN(price) || price < 0) return null;
    const currency = (payload.currency || 'UAH').toString().trim() || 'UAH';
    const row = {
      venue_id: vid,
      label_ua: labelUa,
      trainings_per_month: tpm,
      is_unlimited: isUnlimited,
      price,
      currency,
      billing_period: 'month',
      updated_at: new Date().toISOString(),
      is_active: true
    };
    const { data, error } = await getClient().from('venue_gym_membership_offers').insert(row).select('*').single();
    if (error) throw error;
    return venueGymMembershipOfferFromRow(data);
  } catch (e) {
    console.error('Supabase insertVenueGymMembershipOffer', e.message);
    return null;
  }
}

async function deleteVenueGymMembershipOffer(rowId) {
  try {
    const id = String(rowId || '').trim();
    if (!id) return false;
    const { error } = await getClient().from('venue_gym_membership_offers').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteVenueGymMembershipOffer', e.message);
    return false;
  }
}

async function listVenueAncillaryServices(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data, error } = await getClient()
      .from('venue_ancillary_services')
      .select('*')
      .eq('venue_id', vid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('service_code', { ascending: true });
    if (error) throw error;
    return (data || []).map(venueAncillaryServiceFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase listVenueAncillaryServices', e.message);
    return [];
  }
}

async function upsertVenueAncillaryService(venueId, payload = {}) {
  try {
    const vid = String(venueId || '').trim();
    const serviceCode = String(payload.serviceCode || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!vid || !serviceCode) return null;
    const labelUa = String(payload.labelUa || '').trim();
    if (!labelUa) return null;
    const price = payload.price != null ? Number(payload.price) : NaN;
    if (Number.isNaN(price) || price < 0) return null;
    const currency = (payload.currency || 'UAH').toString().trim() || 'UAH';
    const unit = ['one_time', 'per_visit', 'per_month'].includes(payload.unit) ? payload.unit : 'one_time';
    const row = {
      venue_id: vid,
      service_code: serviceCode,
      label_ua: labelUa,
      price,
      currency,
      unit,
      updated_at: new Date().toISOString(),
      is_active: true
    };
    const { data, error } = await getClient()
      .from('venue_ancillary_services')
      .upsert(row, { onConflict: 'venue_id,service_code' })
      .select('*')
      .single();
    if (error) throw error;
    return venueAncillaryServiceFromRow(data);
  } catch (e) {
    console.error('Supabase upsertVenueAncillaryService', e.message);
    return null;
  }
}

async function deleteVenueAncillaryService(rowId) {
  try {
    const id = String(rowId || '').trim();
    if (!id) return false;
    const { error } = await getClient().from('venue_ancillary_services').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteVenueAncillaryService', e.message);
    return false;
  }
}

/**
 * Пошук закладів (базові фільтри + фасети в памʼяті; назва — ILIKE + трансліт).
 */
async function searchVenues({
  oblast = '',
  city = '',
  nameQuery = '',
  organizationType = '',
  studioCodes = [],
  sectionCodes = [],
  groupClassCodes = [],
  centerLat = null,
  centerLon = null,
  radiusKm = null,
  limit = 40
} = {}) {
  try {
    let q = getClient().from('venues').select('*, venue_facets ( facet_kind, code, label_ua )').eq('is_active', true);
    if (oblast && String(oblast).trim()) q = q.eq('oblast', String(oblast).trim());
    if (city && String(city).trim()) q = q.eq('city', String(city).trim());
    if (organizationType && String(organizationType).trim()) q = q.eq('organization_type', String(organizationType).trim());
    if (centerLat != null && centerLon != null && radiusKm != null && radiusKm > 0) {
      const pad = Number(radiusKm) / 111.0;
      const lat = Number(centerLat);
      const lng = Number(centerLon);
      const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      const padLng = Number(radiusKm) / (111.0 * cos);
      q = q
        .gte('latitude', lat - pad)
        .lte('latitude', lat + pad)
        .gte('longitude', lng - padLng)
        .lte('longitude', lng + padLng);
    }
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    let list = (rows || []).map((r) => venueFromRow(r, r.venue_facets));
    list = list.filter((v) => venueMatchesFacetFilters(v, { studioCodes, sectionCodes, groupClassCodes }));
    if (nameQuery && String(nameQuery).trim()) {
      list = list.filter((v) => venueMatchesNameQuery(v.nameUa, nameQuery));
    }
    if (centerLat != null && centerLon != null && radiusKm != null && radiusKm > 0) {
      const rkm = Number(radiusKm);
      list = list.filter((v) => haversineKm(centerLat, centerLon, v.latitude, v.longitude) <= rkm);
      list.forEach((v) => {
        v.distanceKm = haversineKm(centerLat, centerLon, v.latitude, v.longitude);
      });
      list.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    }
    if (limit && list.length > limit) list = list.slice(0, limit);
    return list;
  } catch (e) {
    console.error('Supabase searchVenues', e.message);
    return [];
  }
}

async function linkCoachVenue(coachChatId, venueId, isPrimary = false) {
  try {
    const row = {
      coach_chat_id: String(coachChatId),
      venue_id: String(venueId),
      is_primary: !!isPrimary
    };
    const { error } = await getClient().from('coach_venues').upsert(row, { onConflict: 'coach_chat_id,venue_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase linkCoachVenue', e.message);
    return false;
  }
}

async function unlinkCoachVenue(coachChatId, venueId) {
  try {
    const { error } = await getClient()
      .from('coach_venues')
      .delete()
      .eq('coach_chat_id', String(coachChatId))
      .eq('venue_id', String(venueId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase unlinkCoachVenue', e.message);
    return false;
  }
}

async function getCoachVenues(coachChatId) {
  try {
    const { data: links, error } = await getClient().from('coach_venues').select('venue_id, is_primary').eq('coach_chat_id', String(coachChatId));
    if (error) throw error;
    const ids = (links || []).map((l) => l.venue_id);
    if (!ids.length) return [];
    const { data: rows, error: e2 } = await getClient().from('venues').select('*').in('id', ids);
    if (e2) throw e2;
    const prim = new Map((links || []).map((l) => [String(l.venue_id), !!l.is_primary]));
    return (rows || []).map((r) => {
      const v = venueFromRow(r, []);
      v.isPrimary = prim.get(String(r.id)) || false;
      return v;
    });
  } catch (e) {
    console.error('Supabase getCoachVenues', e.message);
    return [];
  }
}

async function listCoachGroupClasses(coachChatId, venueId = null) {
  try {
    const coach = String(coachChatId || '').trim();
    if (!coach) return [];
    let q = getClient()
      .from('coach_group_classes')
      .select('coach_chat_id, venue_id, group_class_code, label_ua, created_at')
      .eq('coach_chat_id', coach)
      .order('created_at', { ascending: true });
    if (venueId != null && String(venueId).trim() !== '') q = q.eq('venue_id', String(venueId).trim());
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map((r) => ({
      coachChatId: String(r.coach_chat_id || ''),
      venueId: String(r.venue_id || ''),
      groupClassCode: String(r.group_class_code || ''),
      labelUa: r.label_ua != null && String(r.label_ua).trim() !== '' ? String(r.label_ua).trim() : null,
      createdAt: toDate(r.created_at)
    }));
  } catch (e) {
    console.error('Supabase listCoachGroupClasses', e.message);
    return [];
  }
}

async function replaceCoachGroupClasses(coachChatId, venueId, items = []) {
  try {
    const coach = String(coachChatId || '').trim();
    const vid = String(venueId || '').trim();
    if (!coach || !vid) return false;
    const { error: delErr } = await getClient()
      .from('coach_group_classes')
      .delete()
      .eq('coach_chat_id', coach)
      .eq('venue_id', vid);
    if (delErr) throw delErr;
    const clean = (items || [])
      .filter((x) => x && x.groupClassCode != null && String(x.groupClassCode).trim() !== '')
      .map((x) => ({
        coach_chat_id: coach,
        venue_id: vid,
        group_class_code: String(x.groupClassCode).trim(),
        label_ua: x.labelUa != null && String(x.labelUa).trim() !== '' ? String(x.labelUa).trim() : null
      }));
    if (clean.length) {
      const { error: insErr } = await getClient().from('coach_group_classes').insert(clean);
      if (insErr) throw insErr;
    }
    return true;
  } catch (e) {
    console.error('Supabase replaceCoachGroupClasses', e.message);
    return false;
  }
}

function coachGroupScheduleFromRow(r) {
  if (!r) return null;
  return {
    id: String(r.id || ''),
    coachChatId: String(r.coach_chat_id || ''),
    venueId: String(r.venue_id || ''),
    groupClassCode: String(r.group_class_code || ''),
    weekday: r.weekday != null ? Number(r.weekday) : null,
    timeStart: r.time_start != null ? String(r.time_start) : null,
    timeEnd: r.time_end != null ? String(r.time_end) : null,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at)
  };
}

async function listCoachGroupSchedule(coachChatId, venueId = null, groupClassCode = null) {
  try {
    const coach = String(coachChatId || '').trim();
    if (!coach) return [];
    let q = getClient()
      .from('coach_group_schedule')
      .select('*')
      .eq('coach_chat_id', coach)
      .order('weekday', { ascending: true })
      .order('time_start', { ascending: true });
    if (venueId != null && String(venueId).trim() !== '') q = q.eq('venue_id', String(venueId).trim());
    if (groupClassCode != null && String(groupClassCode).trim() !== '') q = q.eq('group_class_code', String(groupClassCode).trim());
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows || []).map(coachGroupScheduleFromRow).filter(Boolean);
  } catch (e) {
    console.error('Supabase listCoachGroupSchedule', e.message);
    return [];
  }
}

async function addCoachGroupScheduleItem(p = {}) {
  try {
    const row = {
      coach_chat_id: String(p.coachChatId || '').trim(),
      venue_id: String(p.venueId || '').trim(),
      group_class_code: String(p.groupClassCode || '').trim(),
      weekday: Number(p.weekday),
      time_start: String(p.timeStart || '').trim(),
      time_end: String(p.timeEnd || '').trim(),
      updated_at: new Date().toISOString()
    };
    if (!row.coach_chat_id || !row.venue_id || !row.group_class_code || !row.time_start || !row.time_end) return false;
    if (!Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7) return false;
    const { error } = await getClient().from('coach_group_schedule').insert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase addCoachGroupScheduleItem', e.message);
    return false;
  }
}

async function deleteCoachGroupScheduleItem(coachChatId, scheduleId) {
  try {
    const coach = String(coachChatId || '').trim();
    const sid = String(scheduleId || '').trim();
    if (!coach || !sid) return false;
    const { error } = await getClient()
      .from('coach_group_schedule')
      .delete()
      .eq('id', sid)
      .eq('coach_chat_id', coach);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteCoachGroupScheduleItem', e.message);
    return false;
  }
}

async function clearCoachGroupSchedule(coachChatId, venueId = null, groupClassCode = null) {
  try {
    const coach = String(coachChatId || '').trim();
    if (!coach) return false;
    let q = getClient().from('coach_group_schedule').delete().eq('coach_chat_id', coach);
    if (venueId != null && String(venueId).trim() !== '') q = q.eq('venue_id', String(venueId).trim());
    if (groupClassCode != null && String(groupClassCode).trim() !== '') q = q.eq('group_class_code', String(groupClassCode).trim());
    const { error } = await q;
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase clearCoachGroupSchedule', e.message);
    return false;
  }
}

async function listVenueCoaches(venueId) {
  try {
    const vid = String(venueId || '').trim();
    if (!vid) return [];
    const { data: links, error } = await getClient()
      .from('coach_venues')
      .select('coach_chat_id, is_primary')
      .eq('venue_id', vid);
    if (error) throw error;
    const ids = (links || []).map((x) => String(x.coach_chat_id || '')).filter(Boolean);
    if (!ids.length) return [];
    const { data: users, error: e2 } = await getClient()
      .from('users')
      .select('chat_id, first_name, last_name, instagram, role, coach_training_types')
      .in('chat_id', ids);
    if (e2) throw e2;
    const isPrimary = new Map((links || []).map((x) => [String(x.coach_chat_id), !!x.is_primary]));
    return (users || [])
      .filter((u) => String(u.role || '') === 'coach')
      .map((u) => ({
        chatId: String(u.chat_id || ''),
        firstName: String(u.first_name || ''),
        lastName: String(u.last_name || ''),
        instagram: String(u.instagram || ''),
        coachTrainingTypes: Array.isArray(u.coach_training_types)
          ? u.coach_training_types.map((x) => String(x))
          : (u.coach_training_types ? [].concat(u.coach_training_types).map((x) => String(x)) : []),
        isPrimary: isPrimary.get(String(u.chat_id || '')) === true
      }));
  } catch (e) {
    console.error('Supabase listVenueCoaches', e.message);
    return [];
  }
}

/** Чи прив’язаний тренер хоча б до одного закладу (для публічної картки з каталогу). */
async function coachHasVenueListing(coachChatId) {
  try {
    const id = String(coachChatId || '').trim();
    if (!id) return false;
    const { data, error } = await getClient()
      .from('coach_venues')
      .select('venue_id')
      .eq('coach_chat_id', id)
      .limit(1);
    if (error) throw error;
    return !!(data && data.length);
  } catch (e) {
    console.error('Supabase coachHasVenueListing', e.message);
    return false;
  }
}

async function setUserPrimaryVenue(userChatId, venueId) {
  try {
    const uid = String(userChatId);
    const vid = String(venueId);
    await getClient().from('user_venues').delete().eq('user_chat_id', uid);
    const { error } = await getClient().from('user_venues').insert({ user_chat_id: uid, venue_id: vid, is_primary: true });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase setUserPrimaryVenue', e.message);
    return false;
  }
}

async function setUserVenues(userChatId, venueIds) {
  try {
    const uid = String(userChatId || '').trim();
    if (!uid) return false;
    const ids = Array.isArray(venueIds)
      ? [...new Set(venueIds.map((x) => String(x || '').trim()).filter(Boolean))]
      : [];
    await getClient().from('user_venues').delete().eq('user_chat_id', uid);
    if (!ids.length) return true;
    const rows = ids.map((vid, idx) => ({
      user_chat_id: uid,
      venue_id: vid,
      is_primary: idx === 0
    }));
    const { error } = await getClient().from('user_venues').insert(rows);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase setUserVenues', e.message);
    return false;
  }
}

async function clearUserVenues(userChatId) {
  try {
    const { error } = await getClient().from('user_venues').delete().eq('user_chat_id', String(userChatId));
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase clearUserVenues', e.message);
    return false;
  }
}

async function getUserVenues(userChatId) {
  try {
    const { data: links, error } = await getClient().from('user_venues').select('venue_id, is_primary').eq('user_chat_id', String(userChatId));
    if (error) throw error;
    const ids = (links || []).map((l) => l.venue_id);
    if (!ids.length) return [];
    const { data: rows, error: e2 } = await getClient().from('venues').select('*').in('id', ids);
    if (e2) throw e2;
    const prim = new Map((links || []).map((l) => [String(l.venue_id), !!l.is_primary]));
    return (rows || []).map((r) => {
      const v = venueFromRow(r, []);
      v.isPrimary = prim.get(String(r.id)) || false;
      return v;
    });
  } catch (e) {
    console.error('Supabase getUserVenues', e.message);
    return [];
  }
}

async function countVenuesInCity(oblast, city) {
  try {
    const { count, error } = await getClient()
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('oblast', String(oblast || '').trim())
      .eq('city', String(city || '').trim());
    if (error) throw error;
    return typeof count === 'number' ? count : 0;
  } catch (e) {
    console.error('Supabase countVenuesInCity', e.message);
    return 0;
  }
}

/**
 * chat_id для сповіщень про новий заклад: збіг області + населеного пункту з карткою закладу;
 * якщо в закладі вказано район — отримують ті, у кого район збігається або район не вказано (весь НП).
 * Якщо в закладі району немає — усі з цим oblast+city. Роль не фільтрується.
 */
async function listUserChatIdsForVenueLocationNotify({ oblast, city, district } = {}) {
  const ob = String(oblast || '').trim();
  const ci = String(city || '').trim();
  if (!ob || !ci) return [];
  const distV = String(district || '').trim();
  try {
    const { data, error } = await getClient()
      .from('users')
      .select('chat_id, oblast, district')
      .eq('city', ci)
      .not('chat_id', 'like', 'INVITE_%')
      .or('is_blocked.is.null,is_blocked.eq.false')
      .limit(3000);
    if (error) throw error;
    const out = [];
    const seen = new Set();
    for (const r of data || []) {
      const id = String(r.chat_id || '').trim();
      if (!id || seen.has(id)) continue;
      if (!/^-?\d+$/.test(id)) continue;
      const uo = String(r.oblast || '').trim();
      if (uo !== ob) continue;
      const ud = String(r.district || '').trim();
      if (distV) {
        if (ud && ud !== distV) continue;
      }
      seen.add(id);
      out.push(id);
    }
    return out;
  } catch (e) {
    console.error('Supabase listUserChatIdsForVenueLocationNotify', e.message);
    return [];
  }
}

/**
 * Користувачі з «Мої заклади» (user_venues), у яких обрано цей заклад.
 * Виключає excludeChatId (наприклад, самого тренера). Лише numeric chat_id, не заблоковані.
 */
async function listUserChatIdsLinkedToVenue(venueId, excludeChatId = '') {
  const vid = String(venueId || '').trim();
  const ex = String(excludeChatId || '').trim();
  if (!vid) return [];
  try {
    const { data: links, error } = await getClient()
      .from('user_venues')
      .select('user_chat_id')
      .eq('venue_id', vid)
      .limit(5000);
    if (error) throw error;
    const raw = [
      ...new Set((links || []).map((r) => String(r.user_chat_id || '').trim()).filter(Boolean))
    ];
    const candidates = raw.filter(
      (id) => id !== ex && /^-?\d+$/.test(id) && !String(id).startsWith('INVITE_')
    );
    if (!candidates.length) return [];
    const { data: users, error: e2 } = await getClient()
      .from('users')
      .select('chat_id')
      .in('chat_id', candidates)
      .or('is_blocked.is.null,is_blocked.eq.false');
    if (e2) throw e2;
    const out = [];
    const seen = new Set();
    for (const r of users || []) {
      const id = String(r.chat_id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  } catch (e) {
    console.error('Supabase listUserChatIdsLinkedToVenue', e.message);
    return [];
  }
}

// --- coach_documents (документи освіти тренера) ---

async function insertCoachDocument({ coachChatId, fileId, fileUniqueId, fileType, mimeType, fileName } = {}) {
  try {
    const row = {
      coach_chat_id: String(coachChatId || ''),
      telegram_file_id: String(fileId || ''),
      telegram_file_unique_id: fileUniqueId ? String(fileUniqueId) : null,
      file_type: String(fileType || 'document'),
      mime_type: mimeType ? String(mimeType) : null,
      file_name: fileName ? String(fileName) : null
    };
    if (!row.coach_chat_id || !row.telegram_file_id) return null;
    const { data: inserted, error } = await getClient().from('coach_documents').insert(row).select('id').single();
    if (error) throw error;
    return inserted ? inserted.id : null;
  } catch (e) {
    console.error('Supabase insertCoachDocument', e.message);
    return null;
  }
}

async function getCoachDocuments(coachChatId, limit = 20) {
  try {
    const { data: rows, error } = await getClient()
      .from('coach_documents')
      .select('*')
      .eq('coach_chat_id', String(coachChatId))
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (rows || []).map((r) => ({
      id: r.id,
      coachChatId: String(r.coach_chat_id || ''),
      fileId: String(r.telegram_file_id || ''),
      fileUniqueId: r.telegram_file_unique_id ? String(r.telegram_file_unique_id) : null,
      fileType: String(r.file_type || 'document'),
      mimeType: r.mime_type ? String(r.mime_type) : null,
      fileName: r.file_name ? String(r.file_name) : null,
      createdAt: toDate(r.created_at)
    }));
  } catch (e) {
    console.error('Supabase getCoachDocuments', e.message);
    return [];
  }
}

async function countCoachDocuments(coachChatId) {
  try {
    const { count, error } = await getClient()
      .from('coach_documents')
      .select('id', { count: 'exact', head: true })
      .eq('coach_chat_id', String(coachChatId));
    if (error) throw error;
    return count != null ? count : 0;
  } catch (e) {
    console.error('Supabase countCoachDocuments', e.message);
    return 0;
  }
}

async function deleteCoachDocument(coachChatId, docId) {
  try {
    const coach = String(coachChatId || '').trim();
    const id = String(docId || '').trim();
    if (!coach || !id) return false;
    const { error } = await getClient()
      .from('coach_documents')
      .delete()
      .eq('id', id)
      .eq('coach_chat_id', coach);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase deleteCoachDocument', e.message);
    return false;
  }
}

module.exports = {
  getClient,
  getUserByChatId,
  getUserByUserId,
  syncUserChatIdToUserId,
  getStudentsByCoachId,
  getArchivedStudentsByCoachId,
  findUserByInviteCode,
  findUserByAnyId,
  markInviteAsUsed,
  replaceInviteWithChatId,
  userFromRow,
  userToRow,
  insertUser,
  updateUser,
  getAllCities,
  searchOblasts,
  searchCitiesInOblast,
  insertMeasurement,
  getMeasurementHistory,
  upsertBodyGoals,
  getBodyGoals,
  upsertUserCycleSettings,
  getUserCycleSettings,
  markCycleSymptomReminderSent,
  insertCycleEventLog,
  listCycleEventLogs,
  insertCycleSymptomLog,
  getLatestCycleSymptomLog,
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
  recordExperienceTrainingSession,
  updateScheduleSlotStudentId,
  releaseScheduleSlotToAvailable,
  updateScheduleSlotRescheduleFrom,
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
  insertUserCustomExercise,
  getUserCustomExerciseById,
  listUserCustomExercisesByGroup,
  listAllUserCustomExercises,
  getUserCustomExerciseSubgroups,
  searchUserCustomExercises,
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
  adminDeleteStudentCascade,
  adminDeleteCoachCascade,
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
  markGymSubscriptionReminderSent,

  // --- venues (довідник закладів) ---
  getVenueDirectoryCodes,
  insertVenue,
  updateVenue,
  replaceVenueFacets,
  getVenueById,
  listVenuesForAdmin,
  deleteVenueCascade,
  getVenueHours,
  upsertVenueHours,
  listVenueSchedule,
  addVenueScheduleItem,
  deleteVenueScheduleItem,
  listVenueGroupClassPrices,
  upsertVenueGroupClassPrice,
  getVenueIdForPricingRow,
  deleteVenueGroupClassPrice,
  listVenueGymMembershipOffers,
  insertVenueGymMembershipOffer,
  deleteVenueGymMembershipOffer,
  listVenueAncillaryServices,
  upsertVenueAncillaryService,
  deleteVenueAncillaryService,
  searchVenues,
  linkCoachVenue,
  unlinkCoachVenue,
  getCoachVenues,
  listCoachGroupClasses,
  replaceCoachGroupClasses,
  listCoachGroupSchedule,
  addCoachGroupScheduleItem,
  deleteCoachGroupScheduleItem,
  clearCoachGroupSchedule,
  listVenueCoaches,
  coachHasVenueListing,
  setUserPrimaryVenue,
  setUserVenues,
  clearUserVenues,
  getUserVenues,
  countVenuesInCity,
  listUserChatIdsForVenueLocationNotify,
  listUserChatIdsLinkedToVenue,

  // --- coach documents ---
  insertCoachDocument,
  getCoachDocuments,
  countCoachDocuments,
  deleteCoachDocument,

  // --- admin helpers ---
  adminInsertLog,
  adminGetLastLogs,
  adminGetUsersPage,
  adminGetInviteOnboardingChatIds,
  adminUserRegistrationInProgress,
  touchUserInviteRegistrationStarted,
  adminFetchUsersInInviteRegistration,
  adminGetUserByChatId,
  adminCountUsers,
  adminCountUsersByRole,
  adminCountSoloStudents,
  adminCountBlockedUsers,
  adminGetActiveInvites,
  adminGetExerciseCycleFlagSummary,
  adminGetExerciseCycleFlagList,
  adminSetExerciseCycleFlags,

  // --- support (help bot) ---
  supportCreateRequest,
  supportGetRequestById,
  supportGetOpenRequests,
  supportMergeTechJson,
  supportAppendMessage,
  supportCloseRequest,
  supportGenerateUniversalInvite
};
