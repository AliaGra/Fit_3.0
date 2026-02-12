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

module.exports = {
  getClient,
  getUserByChatId,
  userFromRow,
  getStateRow,
  setStateRow,
  deleteStateRow
};
