/**
 * Імпорт даних з папки FIT_Export (JSON-файли) у Supabase.
 * Змінні середовища: SUPABASE_URL, SUPABASE_ANON_KEY (або з .env через dotenv).
 *
 * Запуск (з папки проєкту):
 *   set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
 *   set SUPABASE_ANON_KEY=your_anon_key
 *   node import-to-supabase.mjs "C:\path\to\FIT_Export_YYYY-MM-DD_HH-mm"
 *
 * Перезалити тільки exercise_library з Google (спочатку очистити таблицю):
 *   node import-to-supabase.mjs "C:\path\to\FIT_Export_..." exercise_library --replace
 *
 * Файли в папці: city_list.json, users.json, exercise_library.json, ...
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Потрібно задати SUPABASE_URL та SUPABASE_ANON_KEY (змінні середовища).');
  process.exit(1);
}

const folderPath = process.argv[2];
const onlyTable = process.argv[3]; // опційно: імпортувати тільки цю таблицю (напр. exercise_library)
const replaceMode = process.argv[4] === '--replace'; // для exercise_library: спочатку очистити таблицю
if (!folderPath) {
  console.error('Вкажіть шлях до папки FIT_Export: node import-to-supabase.mjs "C:\\path\\to\\FIT_Export_..." [exercise_library] [--replace]');
  process.exit(1);
}

if (!existsSync(folderPath)) {
  console.error('Папка не знайдена:', folderPath);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLES = [
  'city_list',
  'users',
  'exercise_library',
  'training_plans',
  'training_plan_exercises',
  'pricing',
  'workout_schedule',
  'measurements_history',
  'bot_training_data',
  'logs'
];

const BATCH_SIZE = 100;

function loadJson(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    const key = TABLES.find(t => data[t] !== undefined);
    if (key) return data[key];
    return Object.values(data)[0] || [];
  }
  return [];
}

async function insertBatch(table, rows) {
  if (!rows || rows.length === 0) return { count: 0 };
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
  return { count: rows.length };
}

async function truncateExerciseLibrary() {
  const { error } = await supabase.from('exercise_library').delete().gte('id', 0);
  if (error) throw error;
  console.log('  [очищено] exercise_library');
}

function transformExerciseLibrary(rows) {
  const hasOldFormat = rows.length > 0 && (rows[0].group_name != null || rows[0].exercise_name != null) && rows[0].name_ua == null;
  if (!hasOldFormat) return rows;
  return rows.map((r, i) => ({
    id: r.id != null && !Number.isNaN(Number(r.id)) ? Number(r.id) : i + 1,
    group_level1: r.group_level1 ?? r.group_name ?? '',
    group_level2: r.group_level2 ?? '',
    group_level3: r.group_level3 ?? '',
    name_ua: r.name_ua ?? r.exercise_name ?? '',
    name_ru: r.name_ru ?? r.comment ?? '',
    equipment: r.equipment ?? '',
    active: (r.active != null && String(r.active).trim() !== '') ? String(r.active).trim() : 'YES',
    focus_point: r.focus_point ?? '',
    common_mistakes: r.common_mistakes ?? '',
    proper_feeling: r.proper_feeling ?? '',
    static_holds: r.static_holds ?? '',
    youtube_link: r.youtube_link ?? '',
    my_channel_link: r.my_channel_link ?? '',
    vid: r.vid ?? '',
    difficulty: r.difficulty ?? '',
    medical_contraindications: r.medical_contraindications ?? r.MedicalContraindications ?? '',
    medical_limitations: r.medical_limitations ?? r.MedicalLimitations ?? '',
    safe_for: r.safe_for ?? r.SafeFor ?? '',
    modifications: r.modifications ?? r.Modifications ?? '',
    alternatives: r.alternatives ?? r.Alternatives ?? '',
    safety_notes: r.safety_notes ?? r.SafetyNotes ?? ''
  }));
}

async function importTable(tableName, options = {}) {
  const filePath = join(folderPath, tableName + '.json');
  if (!existsSync(filePath)) {
    console.log(`  [пропущено] файл не знайдено: ${tableName}.json`);
    return 0;
  }
  if (tableName === 'exercise_library' && options.replace) {
    await truncateExerciseLibrary();
  }
  let rows = loadJson(filePath);
  if (tableName === 'exercise_library') {
    rows = transformExerciseLibrary(rows);
    rows = rows.filter((r) => r.id != null && r.id !== '' && !Number.isNaN(Number(r.id)));
    if (rows.length === 0) {
      console.log(`  [пусто] ${tableName}.json — немає записів з валідним id`);
      return 0;
    }
  }
  if (rows.length === 0) {
    console.log(`  [пусто] ${tableName}.json — 0 записів`);
    return 0;
  }
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await insertBatch(tableName, batch);
    total += batch.length;
  }
  console.log(`  [OK] ${tableName}: ${total} записів`);
  return total;
}

async function main() {
  const tablesToImport = onlyTable ? [onlyTable] : TABLES;
  const replaceExerciseLibrary = onlyTable === 'exercise_library' && replaceMode;
  if (onlyTable) console.log('Імпорт тільки таблиці:', onlyTable, replaceExerciseLibrary ? '(перезалив)' : '');
  console.log('Імпорт з папки:', folderPath);
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('---');
  for (const table of tablesToImport) {
    try {
      await importTable(table, { replace: table === 'exercise_library' && replaceMode });
    } catch (err) {
      console.error(`  [ПОМИЛКА] ${table}:`, err.message);
      throw err;
    }
  }
  console.log('---');
  console.log('Готово.');
}

main().catch(() => process.exit(1));
