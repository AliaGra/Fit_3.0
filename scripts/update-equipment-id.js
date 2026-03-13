/**
 * Заповнює equipment_id у exercise_library з JSON (поле equipment).
 * Потрібно після імпорту з JSON, де не було колонки equipment_id.
 *
 * Читає data/ExerciseLibrary_v3_medical.xlsx.json, зіставляє equipment (текст до коми)
 * з таблицею equipment.name_ua і оновлює exercise_library.equipment_id.
 *
 * Запуск: node scripts/update-equipment-id.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Потрібні SUPABASE_URL та SUPABASE_SERVICE_ROLE_KEY у .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Варіанти назв з JSON, які не збігаються з equipment.name_ua
const NAME_ALIASES = {
  'Гантелі': 'EQ_DUMBBELL',
  'Гантеля': 'EQ_DUMBBELL',
  'Лава для гіперекстензій (горизонтальна)': 'EQ_HYPEREXT',
  'Лава для гіперекстензій 45°': 'EQ_HYPEREXT',
  'Лава для гіперекстензій 45°, диск або штанга': 'EQ_HYPEREXT',
  'Тренажер для задньої дельти (зворотній Pec Deck)': 'EQ_REAR_DELT_MACHINE',
  'Inter Atletika Iso-Lateral Chest Press (важільний жим від грудей)': 'EQ_INTER_CHEST',
  'Кросовер (нижній блок), манжета': 'EQ_CROSSOVER',
  'Килимок або лава': 'ACC_MAT',
  'Гантелі або власна вага': 'EQ_DUMBBELL',
  'Гантелі або диск': 'EQ_DUMBBELL',
  'Штанга або гантеля': 'EQ_BARBELL',
  'Штанга або гантелі, лава -15-30°': 'EQ_BARBELL',
  'Штанга або EZ-гриф': 'EQ_BARBELL',
  'Гантелі або власна вага': 'EQ_DUMBBELL',
  'Лава, килимок': 'ACC_MAT',
  'Тренажер для згинання однієї ноги': 'EQ_LEG_CURL_LIE',
  'Не існує (помилка в назві)': null
};

let validIds = new Set();

function findEquipmentId(equipmentText, equipmentList, mappingFromFile) {
  if (!equipmentText || typeof equipmentText !== 'string') return null;
  const name = equipmentText.split(',')[0].trim();
  if (!name) return null;
  if (mappingFromFile && mappingFromFile[name] !== undefined) return mappingFromFile[name] || null;
  if (NAME_ALIASES[name] !== undefined) return NAME_ALIASES[name] || null;
  if (/^(EQ_|BW|ACC_)[A-Z0-9_]+$/i.test(name)) return validIds.has(name) ? name : null;
  const exact = equipmentList.find((e) => e.name_ua === name);
  if (exact) return exact.id;
  const byPrefix = equipmentList
    .slice()
    .sort((a, b) => b.name_ua.length - a.name_ua.length)
    .find((e) => name.startsWith(e.name_ua) || e.name_ua.startsWith(name));
  return byPrefix ? byPrefix.id : null;
}

async function main() {
  const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? path.join(process.cwd(), 'data') : path.join(__dirname, '..', 'data');
  const jsonPath = path.join(dataDir, 'ExerciseLibrary_v3_medical.xlsx.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Файл не знайдено:', jsonPath);
    process.exit(1);
  }

  let mappingFromFile = {};
  const mappingPath = path.join(dataDir, 'equipment-mapping.json');
  if (fs.existsSync(mappingPath)) {
    try {
      mappingFromFile = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    } catch (e) {
      console.warn('Не вдалося прочитати equipment-mapping.json:', e.message);
    }
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Помилка парсингу JSON:', e.message);
    process.exit(1);
  }
  const rows = Array.isArray(data) ? data : (data.exercise_library ?? data.exercises ?? []);
  if (!Array.isArray(rows) || !rows.length) {
    console.error('У JSON немає масиву вправ.');
    process.exit(1);
  }

  const { data: equipmentList, error: eqErr } = await supabase.from('equipment').select('id, name_ua');
  if (eqErr) {
    console.error('Помилка завантаження equipment:', eqErr.message);
    process.exit(1);
  }
  if (!equipmentList || !equipmentList.length) {
    console.error('Таблиця equipment порожня. Виконайте міграцію supabase_migration_equipment_etap1.sql');
    process.exit(1);
  }

  validIds = new Set(equipmentList.map((e) => e.id));

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of rows) {
    const id = row.id != null ? parseInt(row.id, 10) : null;
    if (id == null || isNaN(id)) continue;
    const equipmentText = (row.equipment ?? '').toString().trim();
    const equipmentId = findEquipmentId(equipmentText, equipmentList, mappingFromFile);
    if (!equipmentId) {
      if (!equipmentText) skipped++;
      else notFound++;
      continue;
    }
    const { error } = await supabase.from('exercise_library').update({ equipment_id: equipmentId }).eq('id', id);
    if (error) {
      console.error('Помилка оновлення id=%s:', id, error.message);
      continue;
    }
    updated++;
  }

  console.log('Оновлено equipment_id:', updated);
  if (skipped) console.log('Пропущено (немає equipment):', skipped);
  if (notFound) console.log('Не знайдено відповідність у equipment:', notFound);
  console.log('Готово.');
}

main();
