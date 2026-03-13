/**
 * Звіт: унікальні значення equipment з ExerciseLibrary_v3_medical.xlsx.json.
 * Підсумовує: текст vs коди (EQ_*, BW, ACC_*), які коди відсутні в таблиці equipment.
 * Результат: data/equipment-review.json — для ручного вирівнювання назв.
 *
 * Запуск: node scripts/report-equipment-from-json.js
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

function looksLikeId(val) {
  return /^(EQ_|BW|ACC_)[A-Z0-9_]+$/i.test(String(val).trim());
}

async function main() {
  const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? path.join(process.cwd(), 'data') : path.join(__dirname, '..', 'data');
  const jsonPath = path.join(dataDir, 'ExerciseLibrary_v3_medical.xlsx.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Файл не знайдено:', jsonPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const rows = Array.isArray(data) ? data : (data.exercise_library ?? data.exercises ?? []);
  const byValue = new Map();
  for (const r of rows) {
    const eq = (r.equipment ?? '').toString().trim();
    if (!eq) continue;
    const namePart = eq.split(',')[0].trim();
    if (!byValue.has(eq)) {
      byValue.set(eq, { full: eq, namePart, count: 0 });
    }
    byValue.get(eq).count++;
  }

  const { data: equipmentList, error: eqErr } = await supabase.from('equipment').select('id, name_ua');
  if (eqErr) {
    console.error('Помилка завантаження equipment:', eqErr.message);
    process.exit(1);
  }
  const validIds = new Set((equipmentList || []).map((e) => e.id));

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'ExerciseLibrary_v3_medical.xlsx.json',
    totalUniqueValues: byValue.size,
    equipmentTableIds: Array.from(validIds).sort(),
    values: []
  };

  for (const [full, { namePart, count }] of byValue.entries()) {
    const isId = looksLikeId(namePart);
    const suggestedId = isId ? namePart : null;
    const existsInTable = suggestedId ? validIds.has(suggestedId) : null;
    report.values.push({
      full,
      namePart,
      count,
      format: isId ? 'id' : 'text',
      suggestedEquipmentId: suggestedId,
      existsInTable: isId ? existsInTable : undefined,
      note: isId && !existsInTable ? 'Відсутній в таблиці equipment' : undefined
    });
  }
  report.values.sort((a, b) => (b.count - a.count) || a.full.localeCompare(b.full));

  const outPath = path.join(dataDir, 'equipment-review.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('Звіт записано:', outPath);
  console.log('Унікальних значень:', report.values.length);
  const missing = report.values.filter((v) => v.note && v.note.includes('Відсутній'));
  if (missing.length) {
    console.log('Коди, відсутні в таблиці equipment:', missing.map((v) => v.namePart).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
