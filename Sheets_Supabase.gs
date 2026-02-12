/**
 * Sheets_Supabase.gs
 *
 * Адаптер доступу до Supabase (REST API) замість Google Sheets.
 * Реалізує той самий публічний API, що й об'єкт Sheets, щоб інші модулі
 * (User, Registration, Schedule, Training, Main, Helpers) працювали без змін.
 *
 * Script Properties: SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * Версія: 1.0 | 11.02.2026
 */

var _SUPABASE_URL = null;
var _SUPABASE_KEY = null;

function _getSupabaseConfig() {
  if (_SUPABASE_URL && _SUPABASE_KEY) return { url: _SUPABASE_URL, key: _SUPABASE_KEY };
  var props = PropertiesService.getScriptProperties();
  _SUPABASE_URL = (props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  _SUPABASE_KEY = props.getProperty('SUPABASE_ANON_KEY') || '';
  return { url: _SUPABASE_URL, key: _SUPABASE_KEY };
}

function _supabaseFetch(method, path, body, prefer) {
  var cfg = _getSupabaseConfig();
  if (!cfg.url || !cfg.key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in Script Properties');
  var opts = {
    method: method,
    headers: {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  if (prefer) opts.headers['Prefer'] = prefer;
  if (body != null && (method === 'POST' || method === 'PATCH')) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(cfg.url + path, opts);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code >= 400) throw new Error('Supabase ' + code + ': ' + (text || method + ' ' + path));
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return text; }
}

function _supabaseGet(table, query) {
  var q = query || {};
  var parts = [];
  for (var k in q) if (q.hasOwnProperty(k)) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(q[k]));
  var path = '/rest/v1/' + table + (parts.length ? '?' + parts.join('&') : '');
  return _supabaseFetch('GET', path);
}

function _supabasePost(table, body, prefer) {
  return _supabaseFetch('POST', '/rest/v1/' + table, body, prefer || 'return=representation');
}

function _supabasePatch(table, query, body) {
  var parts = [];
  for (var k in query) if (query.hasOwnProperty(k)) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
  var path = '/rest/v1/' + table + '?' + parts.join('&');
  return _supabaseFetch('PATCH', path, body);
}

function _supabaseDelete(table, query) {
  var parts = [];
  for (var k in query) if (query.hasOwnProperty(k)) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
  var path = '/rest/v1/' + table + '?' + parts.join('&');
  return _supabaseFetch('DELETE', path);
}

function _toDate(v) {
  if (v instanceof Date) return v;
  if (v === null || v === undefined || v === '') return null;
  return new Date(v);
}

function _userFromRow(r) {
  if (!r) return null;
  return {
    createdAt: _toDate(r.created_at) || new Date(),
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
    birthDate: _toDate(r.birth_date),
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

function _userToRow(u) {
  return {
    created_at: (u.createdAt instanceof Date) ? u.createdAt.toISOString() : (u.createdAt || new Date().toISOString()),
    user_id: u.userId || '',
    chat_id: u.chatId || '',
    first_name: u.firstName || '',
    last_name: u.lastName || '',
    city: u.city || '',
    role: u.role || '',
    gender: u.gender || '',
    age: u.age != null ? u.age : null,
    goal: u.goal || '',
    coach_id: u.coachId || null,
    birth_date: u.birthDate ? (_toDate(u.birthDate).toISOString ? _toDate(u.birthDate).toISOString() : u.birthDate) : null,
    height: u.height,
    weight: u.weight,
    waist: u.waist,
    hip: u.hip,
    glutes: u.glutes,
    arm: u.arm,
    instagram: u.instagram || '',
    calendar_id: u.calendarId || ''
  };
}

function _exerciseFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    groupName: r.group_name || '',
    exerciseName: r.exercise_name || '',
    equipment: r.equipment || '',
    active: r.active || (typeof CONSTANTS !== 'undefined' && CONSTANTS.ACTIVE_STATUS ? CONSTANTS.ACTIVE_STATUS.YES : 'YES'),
    comment: r.comment || '',
    focusPoint: r.focus_point || '',
    commonMistakes: r.common_mistakes || '',
    properFeeling: r.proper_feeling || '',
    staticHolds: r.static_holds || '',
    youtubeLink: r.youtube_link || '',
    myChannelLink: r.my_channel_link || ''
  };
}

function _slotFromRow(r) {
  if (!r) return null;
  var trainingType = (r.training_type || '').toString().trim();
  if (typeof CONSTANTS !== 'undefined' && CONSTANTS.TRAINING_TYPES && trainingType !== CONSTANTS.TRAINING_TYPES.PERSONAL && trainingType !== CONSTANTS.TRAINING_TYPES.SPLIT && trainingType !== CONSTANTS.TRAINING_TYPES.TRIO) trainingType = '';
  return {
    id: r.id || '',
    coachId: String(r.coach_id || ''),
    studentId: r.student_id ? String(r.student_id) : '',
    date: _toDate(r.date) || new Date(),
    time: r.time || '',
    status: r.status || (typeof CONSTANTS !== 'undefined' && CONSTANTS.SCHEDULE_STATUS ? CONSTANTS.SCHEDULE_STATUS.AVAILABLE : 'AVAILABLE'),
    updatedAt: _toDate(r.updated_at) || new Date(),
    calEventId: r.cal_event_id || '',
    priceCharged: r.price_charged != null ? parseFloat(r.price_charged) : null,
    currency: (r.currency || '').toString().trim() || '',
    trainingType: trainingType
  };
}

function _slotToRow(s) {
  var defStatus = (typeof CONSTANTS !== 'undefined' && CONSTANTS.SCHEDULE_STATUS) ? CONSTANTS.SCHEDULE_STATUS.AVAILABLE : 'AVAILABLE';
  return {
    id: s.id || '',
    coach_id: s.coachId || '',
    student_id: s.studentId || null,
    date: (s.date instanceof Date) ? s.date.toISOString() : (s.date || new Date()).toISOString(),
    time: s.time || '',
    status: s.status || defStatus,
    updated_at: (s.updatedAt instanceof Date) ? s.updatedAt.toISOString() : new Date().toISOString(),
    cal_event_id: s.calEventId || null,
    price_charged: s.priceCharged != null ? s.priceCharged : null,
    currency: (s.currency || '').toString(),
    training_type: (s.trainingType || '').toString()
  };
}

function _trainingFromRow(r) {
  if (!r) return null;
  return {
    idRecords: r.id_records,
    date: _toDate(r.date) || new Date(),
    exerciseId: r.exercise_id,
    exercise: r.exercise || '',
    weight: r.weight != null ? r.weight : null,
    reps: r.reps != null ? r.reps : null,
    set: r['set'] != null ? r['set'] : null,
    chatId: String(r.chat_id || '')
  };
}

function _trainingToRow(t) {
  var row = {
    id_records: t.idRecords || '',
    date: (t.date instanceof Date) ? t.date.toISOString() : (t.date ? new Date(t.date).toISOString() : new Date().toISOString()),
    exercise_id: t.exerciseId != null ? t.exerciseId : null,
    exercise: t.exercise || '',
    weight: t.weight,
    reps: t.reps,
    chat_id: t.chatId || ''
  };
  row['set'] = t.set != null ? t.set : null;
  return row;
}

function _measurementFromRow(r) {
  if (!r) return null;
  return {
    chatId: String(r.chat_id || ''),
    date: _toDate(r.date) || new Date(),
    height: r.height,
    weight: r.weight,
    waist: r.waist,
    hip: r.hip,
    glutes: r.glutes,
    arm: r.arm,
    source: r.source || ''
  };
}

function _measurementToRow(m) {
  return {
    chat_id: m.chatId || '',
    date: (m.date instanceof Date) ? m.date.toISOString() : new Date(m.date).toISOString(),
    height: m.height,
    weight: m.weight,
    waist: m.waist,
    hip: m.hip,
    glutes: m.glutes,
    arm: m.arm,
    source: m.source || ''
  };
}

// --- USERS ---
function getUserByChatId(chatId) {
  try {
    chatId = String(chatId);
    var rows = _supabaseGet('users', { 'chat_id': 'eq.' + chatId, 'limit': '1' });
    if (rows && rows.length) return _userFromRow(rows[0]);
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getUserByChatId', e.message);
    return null;
  }
}

function getUsersByRole(role) {
  try {
    if (!role) return [];
    var rows = _supabaseGet('users', { 'role': 'eq.' + role });
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _userFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getUsersByRole', e.message);
    return [];
  }
}

function insertUser(userData) {
  try {
    var row = _userToRow(userData);
    if (!row.chat_id || !row.first_name || !row.role) throw new Error('Missing required fields: chatId, firstName, role');
    _supabasePost('users', row);
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.insertUser', e.message);
    return false;
  }
}

function updateUser(chatId, updates) {
  try {
    chatId = String(chatId);
    var row = {};
    if (updates.firstName !== undefined) row.first_name = updates.firstName;
    if (updates.lastName !== undefined) row.last_name = updates.lastName;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.role !== undefined) row.role = updates.role;
    if (updates.gender !== undefined) row.gender = updates.gender;
    if (updates.goal !== undefined) row.goal = updates.goal;
    if (updates.coachId !== undefined) row.coach_id = updates.coachId;
    if (updates.birthDate !== undefined) row.birth_date = updates.birthDate ? (_toDate(updates.birthDate).toISOString ? _toDate(updates.birthDate).toISOString() : updates.birthDate) : null;
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
    _supabasePatch('users', { 'chat_id': 'eq.' + chatId }, row);
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateUser', e.message);
    return false;
  }
}

function findUserByInviteCode(inviteCode) {
  try {
    var rows = _supabaseGet('users', { 'user_id': 'eq.' + encodeURIComponent(String(inviteCode)), 'limit': '1' });
    if (rows && rows.length) return _userFromRow(rows[0]);
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.findUserByInviteCode', e.message);
    return null;
  }
}

function replaceInviteWithChatId(inviteCode, realChatId) {
  try {
    _supabasePatch('users', { 'user_id': 'eq.' + encodeURIComponent(String(inviteCode)) }, { user_id: String(realChatId), chat_id: String(realChatId) });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.replaceInviteWithChatId', e.message);
    return false;
  }
}

function getStudentsByCoachId(coachChatId) {
  try {
    var rows = _supabaseGet('users', { 'coach_id': 'eq.' + String(coachChatId), 'role': 'eq.student' });
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _userFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getStudentsByCoachId', e.message);
    return [];
  }
}

// --- EXERCISE LIBRARY ---
function getAllExercises() {
  try {
    var rows = _supabaseGet('exercise_library');
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _exerciseFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getAllExercises', e.message);
    return [];
  }
}

function getExercisesByGroup(groupName) {
  try {
    var rows = _supabaseGet('exercise_library', { 'group_name': 'eq.' + encodeURIComponent(String(groupName)) });
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _exerciseFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getExercisesByGroup', e.message);
    return [];
  }
}

function getExerciseById(exerciseId) {
  try {
    var rows = _supabaseGet('exercise_library', { 'id': 'eq.' + exerciseId, 'limit': '1' });
    if (rows && rows.length) return _exerciseFromRow(rows[0]);
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getExerciseById', e.message);
    return null;
  }
}

// --- BOT TRAINING DATA ---
function insertTraining(trainingData) {
  try {
    var row = _trainingToRow(trainingData);
    _supabasePost('bot_training_data', row);
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.insertTraining', e.message);
    return false;
  }
}

function getTrainingHistory(chatId, filters) {
  try {
    chatId = String(chatId);
    var rows = _supabaseGet('bot_training_data', { 'chat_id': 'eq.' + chatId, 'order': 'date.desc' });
    if (!rows || !rows.length) return [];
    var result = rows.map(function(r) { return _trainingFromRow(r); });
    filters = filters || {};
    if (filters.fromDate || filters.toDate) {
      var from = filters.fromDate ? new Date(filters.fromDate) : null;
      var to = filters.toDate ? new Date(filters.toDate) : null;
      result = result.filter(function(item) {
        var d = item.date instanceof Date ? item.date : new Date(item.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return result;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getTrainingHistory', e.message);
    return [];
  }
}

function getLastTraining(chatId) {
  var history = getTrainingHistory(chatId);
  return history.length ? history[0] : null;
}

// --- MEASUREMENTS ---
function insertMeasurement(measurementData) {
  try {
    var row = _measurementToRow(measurementData);
    _supabasePost('measurements_history', row);
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.insertMeasurement', e.message);
    return false;
  }
}

function getMeasurementHistory(chatId) {
  try {
    chatId = String(chatId);
    var rows = _supabaseGet('measurements_history', { 'chat_id': 'eq.' + chatId, 'order': 'date.desc' });
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _measurementFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getMeasurementHistory', e.message);
    return [];
  }
}

function getLastMeasurement(chatId) {
  var history = getMeasurementHistory(chatId);
  return history.length ? history[0] : null;
}

// --- WORKOUT SCHEDULE ---
function insertScheduleSlot(slotData) {
  try {
    var data = slotData || {};
    if (!data.id) data.id = Utilities.getUuid();
    var row = _slotToRow(data);
    _supabasePost('workout_schedule', row);
    return data.id;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.insertScheduleSlot', e.message);
    return false;
  }
}

function findSlotByCoachStudentAndDateTime(coachChatId, studentChatId, dateTime) {
  try {
    var d = dateTime instanceof Date ? dateTime : new Date(dateTime);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var rows = _supabaseGet('workout_schedule', {
      'coach_id': 'eq.' + String(coachChatId),
      'student_id': 'eq.' + String(studentChatId),
      'limit': '10'
    });
    if (!rows || !rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var slotDate = r.date ? (r.date.slice ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10)) : '';
      if (slotDate === dateStr) return _slotFromRow(r);
    }
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.findSlotByCoachStudentAndDateTime', e.message);
    return null;
  }
}

function updateScheduleSlotStatus(id, newStatus) {
  try {
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(id)) }, { status: newStatus, updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotStatus', e.message);
    return false;
  }
}

function updateScheduleSlotPrice(slotId, priceCharged, currency) {
  try {
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)) }, { price_charged: priceCharged, currency: currency || '', updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotPrice', e.message);
    return false;
  }
}

function updateScheduleSlotTrainingType(slotId, trainingType) {
  try {
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)) }, { training_type: trainingType || '', updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotTrainingType', e.message);
    return false;
  }
}

function updateScheduleSlotStudentId(slotId, studentChatId) {
  try {
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)) }, { student_id: studentChatId || null, updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotStudentId', e.message);
    return false;
  }
}

function updateScheduleSlotDateTime(slotId, date, time) {
  try {
    var d = date instanceof Date ? date : new Date(date);
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)) }, { date: d.toISOString(), time: time || '', updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotDateTime', e.message);
    return false;
  }
}

function updateScheduleSlotCalEventId(slotId, eventId) {
  try {
    _supabasePatch('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)) }, { cal_event_id: eventId || null, updated_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.updateScheduleSlotCalEventId', e.message);
    return false;
  }
}

function getSlotsByCoachAndStatus(coachChatId, status) {
  try {
    var q = { 'coach_id': 'eq.' + String(coachChatId) };
    if (status != null && status !== '') q['status'] = 'eq.' + status;
    var rows = _supabaseGet('workout_schedule', q);
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _slotFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getSlotsByCoachAndStatus', e.message);
    return [];
  }
}

function getSlotById(slotId) {
  try {
    var rows = _supabaseGet('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(slotId)), 'limit': '1' });
    if (rows && rows.length) return _slotFromRow(rows[0]);
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getSlotById', e.message);
    return null;
  }
}

function getSlotsByStudentAndStatus(studentChatId, status) {
  try {
    var q = { 'student_id': 'eq.' + String(studentChatId) };
    if (status != null && status !== '') q['status'] = 'eq.' + status;
    var rows = _supabaseGet('workout_schedule', q);
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return _slotFromRow(r); });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getSlotsByStudentAndStatus', e.message);
    return [];
  }
}

function deleteScheduleSlot(id) {
  try {
    _supabaseDelete('workout_schedule', { 'id': 'eq.' + encodeURIComponent(String(id)) });
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.deleteScheduleSlot', e.message);
    return false;
  }
}

// --- PRICING ---
function getCoachPricing(coachId) {
  try {
    var rows = _supabaseGet('pricing', { 'coach_id': 'eq.' + String(coachId), 'student_id': 'is.null', 'limit': '1' });
    if (rows && rows.length) {
      var r = rows[0];
      return { pricePersonal: r.price_personal, priceSplit: r.price_split, priceTrio: r.price_trio, currency: (r.currency || '').toString(), updatedAt: _toDate(r.updated_at), defaultTrainingType: (r.default_training_type || '').toString().trim() };
    }
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getCoachPricing', e.message);
    return null;
  }
}

function getStudentPricing(coachId, studentId) {
  try {
    var rows = _supabaseGet('pricing', { 'coach_id': 'eq.' + String(coachId), 'student_id': 'eq.' + String(studentId), 'limit': '1' });
    if (rows && rows.length) {
      var r = rows[0];
      return { pricePersonal: r.price_personal, priceSplit: r.price_split, priceTrio: r.price_trio, currency: (r.currency || '').toString(), updatedAt: _toDate(r.updated_at), defaultTrainingType: (r.default_training_type || '').toString().trim() };
    }
    return null;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getStudentPricing', e.message);
    return null;
  }
}

function getCurrentPrice(coachId, studentId, trainingType) {
  var row = getStudentPricing(coachId, studentId);
  if (!row) row = getCoachPricing(coachId);
  if (!row) return null;
  var price = null;
  if (typeof CONSTANTS !== 'undefined' && CONSTANTS.TRAINING_TYPES) {
    if (trainingType === CONSTANTS.TRAINING_TYPES.PERSONAL) price = row.pricePersonal;
    else if (trainingType === CONSTANTS.TRAINING_TYPES.SPLIT) price = row.priceSplit;
    else if (trainingType === CONSTANTS.TRAINING_TYPES.TRIO) price = row.priceTrio;
  }
  if (price === null || price === undefined || price === '') return null;
  var num = parseFloat(price);
  if (isNaN(num) || num < 0) return null;
  return { price: num, currency: (row.currency || (typeof CONSTANTS !== 'undefined' && CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString().trim() };
}

function setPricing(coachId, studentId, data) {
  try {
    coachId = String(coachId);
    studentId = studentId != null ? String(studentId) : '';
    var existing = studentId ? getStudentPricing(coachId, studentId) : getCoachPricing(coachId);
    var now = new Date().toISOString();
    var body = {
      coach_id: coachId,
      student_id: studentId || null,
      price_personal: data.pricePersonal != null ? data.pricePersonal : null,
      price_split: data.priceSplit != null ? data.priceSplit : null,
      price_trio: data.priceTrio != null ? data.priceTrio : null,
      currency: (data.currency || (typeof CONSTANTS !== 'undefined' && CONSTANTS.PRICING && CONSTANTS.PRICING.DEFAULT_CURRENCY) || 'UAH').toString(),
      updated_at: now,
      default_training_type: (data.defaultTrainingType || '').toString()
    };
    if (existing) {
      var q = { 'coach_id': 'eq.' + coachId };
      q['student_id'] = studentId ? ('eq.' + studentId) : 'is.null';
      _supabasePatch('pricing', q, body);
    } else {
      _supabasePost('pricing', body);
    }
    return true;
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.setPricing', e.message);
    return false;
  }
}

// --- CITY LIST ---
function getAllCities() {
  try {
    var rows = _supabaseGet('city_list');
    if (!rows || !rows.length) return [];
    return rows.map(function(r) { return { cityId: r.city_id, cityName: r.city_name || '' }; });
  } catch (e) {
    if (typeof insertLog === 'function') insertLog(new Date().toISOString(), (typeof CONSTANTS !== 'undefined' && CONSTANTS.LOG_LEVELS ? CONSTANTS.LOG_LEVELS.ERROR : 'ERROR'), 'Supabase.getAllCities', e.message);
    return [];
  }
}

// --- LOGS ---
function insertLog(timestamp, level, module, message) {
  try {
    _supabasePost('logs', { timestamp: timestamp || new Date().toISOString(), context: module || '', message: (message || '').toString().slice(0, 1000), stack: '' }, 'return=minimal');
    return true;
  } catch (e) {
    Logger.log('Supabase.insertLog failed: ' + (e && e.message));
    return false;
  }
}

// Експорт того ж API, що й Sheets. Щоб бот використовував Supabase замість Google Sheets:
// 1) Додайте цей файл Sheets_Supabase.gs у проєкт.
// 2) У Script Properties вкажіть SUPABASE_URL та SUPABASE_ANON_KEY.
// 3) У файлі sheets.gs закоментуйте або видаліть рядок «var Sheets = { ... };» в кінці файлу,
//    щоб глобальним був саме цей об'єкт Sheets з Sheets_Supabase.gs.
var Sheets = {
  getUserByChatId: getUserByChatId,
  getUsersByRole: getUsersByRole,
  insertUser: insertUser,
  updateUser: updateUser,
  findUserByInviteCode: findUserByInviteCode,
  replaceInviteWithChatId: replaceInviteWithChatId,
  getStudentsByCoachId: getStudentsByCoachId,
  getAllExercises: getAllExercises,
  getExercisesByGroup: getExercisesByGroup,
  getExerciseById: getExerciseById,
  insertTraining: insertTraining,
  getTrainingHistory: getTrainingHistory,
  getLastTraining: getLastTraining,
  insertMeasurement: insertMeasurement,
  getMeasurementHistory: getMeasurementHistory,
  getLastMeasurement: getLastMeasurement,
  insertScheduleSlot: insertScheduleSlot,
  findSlotByCoachStudentAndDateTime: findSlotByCoachStudentAndDateTime,
  updateScheduleSlotStatus: updateScheduleSlotStatus,
  updateScheduleSlotPrice: updateScheduleSlotPrice,
  updateScheduleSlotTrainingType: updateScheduleSlotTrainingType,
  updateScheduleSlotStudentId: updateScheduleSlotStudentId,
  updateScheduleSlotDateTime: updateScheduleSlotDateTime,
  updateScheduleSlotCalEventId: updateScheduleSlotCalEventId,
  getSlotsByCoachAndStatus: getSlotsByCoachAndStatus,
  getSlotById: getSlotById,
  getSlotsByStudentAndStatus: getSlotsByStudentAndStatus,
  deleteScheduleSlot: deleteScheduleSlot,
  getCoachPricing: getCoachPricing,
  getStudentPricing: getStudentPricing,
  getCurrentPrice: getCurrentPrice,
  setPricing: setPricing,
  getAllCities: getAllCities,
  insertLog: insertLog
};
