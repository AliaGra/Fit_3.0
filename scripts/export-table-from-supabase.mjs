#!/usr/bin/env node
/**
 * Експорт таблиці з Supabase у JSON-файл на комп.
 * Запуск (з кореня проєкту, з заповненим .env):
 *   node scripts/export-table-from-supabase.mjs exercise_library
 *   node scripts/export-table-from-supabase.mjs users
 * Файл зʼявиться: export_<table>.json
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const tableName = process.argv[2];
if (!tableName) {
  console.error('Вкажи назву таблиці: node scripts/export-table-from-supabase.mjs <table_name>');
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) {
  console.error('Потрібні SUPABASE_URL та SUPABASE_ANON_KEY у .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function exportTable() {
  const { data, error } = await supabase.from(tableName).select('*');
  if (error) {
    console.error('Помилка Supabase:', error.message);
    process.exit(1);
  }
  const outPath = join(process.cwd(), `export_${tableName}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Записано ' + (data?.length ?? 0) + ' рядків у ' + outPath);
}

exportTable();
