/**
 * Імпорт вправ з ExerciseLibrary_v3_medical.xlsx або .xlsx.json у таблицю exercise_library.
 * ТЗ Етап 1 — Нормалізація обладнання.
 *
 * Перед запуском:
 * 1. Виконати міграцію supabase_migration_equipment_etap1.sql (таблиця equipment + колонки equipment_id, attachment).
 * 2. Покласти у data/ файл ExerciseLibrary_v3_medical.xlsx або ExerciseLibrary_v3_medical.xlsx.json.
 * 3. У .env додати SUPABASE_SERVICE_ROLE_KEY (Supabase → Project settings → API).
 * 4. npm install xlsx (якщо ще не встановлено).
 *
 * Запуск: node scripts/import-exercises.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Потрібні змінні: SUPABASE_URL та SUPABASE_SERVICE_ROLE_KEY у .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function mapXlsxRow(r) {
  return {
    id: parseInt(r['id'], 10) || r['id'],
    group_level1: (r['group1'] ?? '').toString().trim() || null,
    group_level2: (r['group2'] ?? '').toString().trim() || null,
    group_level3: (r['group3'] ?? '').toString().trim() || null,
    name_ua: (r['name_ua'] ?? '').toString().trim() || null,
    name_ru: (r['name_ru'] ?? '').toString().trim() || null,
    equipment_id: (r['equipment_id'] ?? '').toString().trim() || null,
    attachment: (r['attachment'] ?? '').toString().trim() || null,
    active: (r['active'] ?? '').toString().toUpperCase() === 'YES' ? 'YES' : null,
    vid: (r['type'] ?? '').toString().trim() || null,
    difficulty: (r['difficulty'] ?? '').toString().trim() || null,
    focus_point: (r['focus_point'] ?? '').toString().trim() || null,
    common_mistakes: (r['common_mistakes'] ?? '').toString().trim() || null,
    proper_feeling: (r['proper_feeling'] ?? '').toString().trim() || null,
    static_holds: (r['static_holds'] ?? '').toString().trim() || null,
    youtube_link: (r['youtube_link'] ?? '').toString().trim() || null,
    my_channel_link: (r['my_channel_link'] ?? '').toString().trim() || null,
    medical_contraindications: (r['medical_contraindications'] ?? '').toString().trim() || null,
    medical_limitations: (r['medical_limitations'] ?? '').toString().trim() || null,
    safe_for: (r['safe_for'] ?? '').toString().trim() || null,
    modifications: (r['modifications'] ?? '').toString().trim() || null,
    alternatives: (r['alternatives'] ?? '').toString().trim() || null,
    safety_notes: (r['safety_notes'] ?? '').toString().trim() || null
  };
}

function mapJsonRow(r) {
  const activeStr = (r.vid ?? r.active ?? '').toString().toUpperCase();
  const attachmentVal = (r.attachment ?? (r.active && activeStr !== 'YES' ? r.active : '')).toString().trim();
  return {
    id: parseInt(r.id, 10) || r.id,
    group_level1: (r.group_level1 ?? '').toString().trim() || null,
    group_level2: (r.group_level2 ?? '').toString().trim() || null,
    group_level3: (r.group_level3 ?? '').toString().trim() || null,
    name_ua: (r.name_ua ?? '').toString().trim() || null,
    name_ru: (r.name_ru ?? '').toString().trim() || null,
    equipment_id: (r.equipment_id ?? '').toString().trim() || null,
    attachment: attachmentVal || null,
    active: activeStr === 'YES' ? 'YES' : null,
    vid: (r.type ?? (r.vid && r.vid !== 'YES' ? r.vid : '')).toString().trim() || null,
    difficulty: (r.difficulty ?? '').toString().trim() || null,
    focus_point: (r.focus_point ?? '').toString().trim() || null,
    common_mistakes: (r.common_mistakes ?? '').toString().trim() || null,
    proper_feeling: (r.proper_feeling ?? '').toString().trim() || null,
    static_holds: (r.static_holds ?? '').toString().trim() || null,
    youtube_link: (r.youtube_link ?? '').toString().trim() || null,
    my_channel_link: (r.my_channel_link ?? '').toString().trim() || null,
    medical_contraindications: (r.medical_contraindications ?? '').toString().trim() || null,
    medical_limitations: (r.medical_limitations ?? '').toString().trim() || null,
    safe_for: (r.safe_for ?? '').toString().trim() || null,
    modifications: (r.modifications ?? '').toString().trim() || null,
    alternatives: (r.alternatives ?? '').toString().trim() || null,
    safety_notes: (r.safety_notes ?? '').toString().trim() || null
  };
}

async function importExercises() {
  const baseName = 'ExerciseLibrary_v3_medical.xlsx';
  const jsonName = baseName + '.json';
  const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? path.join(process.cwd(), 'data') : path.join(__dirname, '..', 'data');
  const xlsxPath = path.join(dataDir, baseName);
  const jsonPath = path.join(dataDir, jsonName);
  if (process.env.DEBUG === '1') console.log('cwd:', process.cwd(), '| xlsx:', xlsxPath, '| json:', jsonPath);

  let exercises = [];

  if (fs.existsSync(xlsxPath)) {
    let wb;
    try {
      wb = XLSX.readFile(xlsxPath);
    } catch (e) {
      console.error('Помилка читання xlsx:', e.message);
      process.exit(1);
    }
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    exercises = rows
      .filter((r) => r['id'] != null && String(r['id']).trim() !== '')
      .map(mapXlsxRow);
    console.log('Джерело: xlsx');
  } else if (fs.existsSync(jsonPath)) {
    let raw;
    try {
      raw = fs.readFileSync(jsonPath, 'utf8');
    } catch (e) {
      console.error('Помилка читання json:', e.message);
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('Помилка парсингу JSON:', e.message);
      process.exit(1);
    }
    const rows = Array.isArray(data) ? data : (data.exercise_library ?? data.exercises ?? []);
    if (!Array.isArray(rows) || !rows.length) {
      console.error('У JSON немає масиву exercise_library або він порожній.');
      process.exit(1);
    }
    exercises = rows
      .filter((r) => r != null && (r.id != null && String(r.id).trim() !== ''))
      .map(mapJsonRow);
    console.log('Джерело: json');
  } else {
    console.error('Файл не знайдено: очікується data/' + baseName + ' або data/' + jsonName);
    console.error('Запускайте з кореня проєкту (де є папка data/).');
    process.exit(1);
  }

  if (!exercises.length) {
    console.error('Немає рядків для імпорту (перевірте заголовки та дані в xlsx/json).');
    process.exit(1);
  }

  console.log('Імпортуємо', exercises.length, 'вправ...');

  const { error } = await supabase.from('exercise_library').upsert(exercises, {
    onConflict: 'id',
    ignoreDuplicates: false
  });

  if (error) {
    console.error('Помилка імпорту:', error.message);
    process.exit(1);
  }

  console.log('Імпорт успішний.');
}

importExercises();
