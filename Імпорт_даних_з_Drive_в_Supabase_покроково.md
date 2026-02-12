# Перенесення даних з папки FIT_Export (Google Drive) у Supabase — покроково

Таблиці в Supabase вже створені. Далі — як заповнити їх даними з папки експорту.

---

## Крок 1. Завантажити папку FIT_Export на комп’ютер

1. Відкрийте **Google Drive** (drive.google.com).
2. Знайдіть папку **FIT_Export_YYYY-MM-DD_HH-mm** (та, що з’явилась після запуску `runExportToDrive`).
3. Клацніть по папці правою кнопкою → **Завантажити** (Download).  
   Або відкрийте папку, виділіть усі файли (Ctrl+A), ПКМ → **Завантажити**.
4. На комп’ютері з’явиться архів (ZIP) або папка з файлами. Якщо ZIP — розархівуйте її. Потрібна папка, де лежать файли:
   - `city_list.json`
   - `users.json`
   - `exercise_library.json`
   - `training_plans.json`
   - `training_plan_exercises.json`
   - `pricing.json`
   - `workout_schedule.json`
   - `measurements_history.json`
   - `bot_training_data.json`
   - (опційно) `logs.json`

Запам’ятайте шлях до цієї папки, наприклад:  
`C:\Users\Admin\Downloads\FIT_Export_2026-02-06_12-30`  
або  
`D:\Fit 3.0 vs2.0\FIT_Export_2026-02-06_12-30`

---

## Крок 2. Встановити Node.js (якщо ще немає)

Скрипт імпорту написаний на Node.js.

1. Відкрийте [nodejs.org](https://nodejs.org).
2. Завантажте **LTS**-версію і встановіть (за замовчуванням — «Next» до кінця).
3. Перевірте: відкрийте **Командний рядок** (cmd) або **PowerShell** і введіть:
   ```bash
   node -v
   ```
   Має з’явитись номер версії (наприклад `v20.10.0`).

---

## Крок 3. Підготувати папку проєкту і скрипт імпорту

**Де шукати скрипт:** файл **import-to-supabase.mjs** має лежати в **локальній папці проєкту** (там само, де Main.gs, ExportForSupabase.gs, інструкції .md). На **Google Drive** його немає — на Диску лише папка FIT_Export з JSON-файлами.

1. Відкрийте на комп’ютері папку проєкту **Fit 3.0 vs2.0** (де лежать файли .gs і .md).
2. Якщо файла **import-to-supabase.mjs** немає — створіть його вручну (див. блок нижче «Якщо файлу import-to-supabase.mjs немає»).
3. Відкрийте у цій же папці **Командний рядок** або PowerShell:
   - у Провіднику: перейти в папку проєкту, у адресному рядку ввести `cmd` або `powershell` і Enter;
   - або: `cd "D:\Fit 3.0 vs2.0"` (шлях підставте свій).

---

### Якщо файлу import-to-supabase.mjs немає

Створіть у папці проєкту **Fit 3.0 vs2.0** новий файл з ім’ям **import-to-supabase.mjs** (без інших розширень). Відкрийте його у редакторі (Блокнот, VS Code, Cursor тощо) і вставте туди **весь** код нижче. Збережіть файл.

```javascript
/**
 * Імпорт даних з папки FIT_Export (JSON-файли) у Supabase.
 * Запуск: set SUPABASE_URL=... & set SUPABASE_ANON_KEY=... & node import-to-supabase.mjs "шлях_до_папки_FIT_Export"
 */
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
if (!folderPath) {
  console.error('Вкажіть шлях до папки FIT_Export: node import-to-supabase.mjs "C:\\path\\to\\FIT_Export_..."');
  process.exit(1);
}

if (!existsSync(folderPath)) {
  console.error('Папка не знайдена:', folderPath);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLES = [
  'city_list', 'users', 'exercise_library', 'training_plans', 'training_plan_exercises',
  'pricing', 'workout_schedule', 'measurements_history', 'bot_training_data', 'logs'
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

async function importTable(tableName) {
  const filePath = join(folderPath, tableName + '.json');
  if (!existsSync(filePath)) {
    console.log(`  [пропущено] файл не знайдено: ${tableName}.json`);
    return 0;
  }
  const rows = loadJson(filePath);
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
  console.log('Імпорт з папки:', folderPath);
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('---');
  for (const table of TABLES) {
    try {
      await importTable(table);
    } catch (err) {
      console.error(`  [ПОМИЛКА] ${table}:`, err.message);
      throw err;
    }
  }
  console.log('---');
  console.log('Готово.');
}

main().catch(() => process.exit(1));
```

Після збереження файлу переходьте до кроку 4.

---

## Як відкрити командний рядок саме в папці проєкту (диск D)

Потрібно, щоб у вікні командного рядка «поточна папка» була ваша папка проєкту, наприклад `D:\Fit 3.0 vs2.0`. Один із способів:

**Спосіб 1 — через Провідник (найпростіший)**  
1. Відкрийте **Провідник** (Win+E або іконка папки).  
2. Перейдіть на диск **D:** і відкрийте папку проєкту **Fit 3.0 vs2.0** (подвійний клік).  
3. Клацніть **один раз по адресному рядку** вгорі (де написано `D:\Fit 3.0 vs2.0`). Шлях виділиться.  
4. Напишіть туди **cmd** і натисніть **Enter**.  
5. Відкриється вікно **Командний рядок**, і вже буде відкрито саме цю папку.  
   Перевірте: у вікні має бути щось на кшталт `D:\Fit 3.0 vs2.0>` — це і є «командний рядок у папці проєкту».

**Спосіб 2 — відкрити cmd і перейти в папку**  
1. Натисніть **Win+R**, введіть **cmd**, натисніть Enter (відкриється командний рядок).  
2. Введіть по черзі і після кожної рядка натискайте Enter:  
   - `D:`  
   - `cd "Fit 3.0 vs2.0"`  
   (Якщо папка на D в іншому місці, наприклад `D:\Projects\Fit 3.0 vs2.0`, то: `cd "D:\Projects\Fit 3.0 vs2.0"`.)  
3. Знову має з’явитись рядок типу `D:\Fit 3.0 vs2.0>`.

Далі усі команди (крок 4 і 5) вводьте в **цьому ж вікні** командного рядка.

---

## Крок 4. Встановити залежність і задати ключі Supabase

У тому вікні командного рядка, де ви бачите шлях на кшталт `D:\Fit 3.0 vs2.0>`, виконайте по черзі:

**4.1. Один раз створити package.json і встановити клієнт Supabase:**
```bash
npm init -y
npm install @supabase/supabase-js
```

**4.2. Задати URL і ключ Supabase** (замість значень підставте свої з Supabase → Project Settings → API):

**Windows (cmd):**
```bash
set SUPABASE_URL=https://ВАШ_PROJECT_REF.supabase.co
set SUPABASE_ANON_KEY=ваш_anon_ключ_з_Supabase
```

**Windows (PowerShell):**
```powershell
$env:SUPABASE_URL="https://ВАШ_PROJECT_REF.supabase.co"
$env:SUPABASE_ANON_KEY="ваш_anon_ключ_з_Supabase"
```

**Приклад:** якщо Project URL = `https://abcdefgh.supabase.co`, а anon key = `eyJhbGc...`, то:
```bash
set SUPABASE_URL=https://abcdefgh.supabase.co
set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Крок 5. Запустити скрипт імпорту

У тому ж вікні командного рядка (де вже задані SUPABASE_URL і SUPABASE_ANON_KEY) виконайте:

```bash
node import-to-supabase.mjs "ШЛЯХ_ДО_ПАПКИ_FIT_Export"
```

**Приклад**, якщо папка експорту лежить на робочому столі:
```bash
node import-to-supabase.mjs "C:\Users\Admin\Desktop\FIT_Export_2026-02-06_12-30"
```

**Приклад**, якщо папка лежить у проєкті:
```bash
node import-to-supabase.mjs "D:\Fit 3.0 vs2.0\FIT_Export_2026-02-06_12-30"
```

Скрипт:
- читає по черзі файли з папки в потрібному порядку (city_list → users → … → bot_training_data → logs);
- вставляє дані в Supabase пачками (по 100 записів);
- виводить у консоль, яку таблицю імпортує і скільки рядків додано.

Якщо з’явиться помилка — скрипт покаже її текст; можна скопіювати і перевірити (наприклад, чи правильні URL і ключ, чи всі таблиці створені).

---

## Крок 6. Перевірити дані в Supabase

1. Відкрийте Supabase → **Table Editor**.
2. Виберіть таблиці по черзі: **users**, **exercise_library**, **workout_schedule** тощо.
3. Переконайтесь, що з’явились рядки і поля заповнені.

Після цього міграцію з папки FIT_Export у Supabase можна вважати завершеною.

---

## Якщо не хочете використовувати Node.js (альтернатива)

- **Через Supabase Dashboard:** Table Editor → вибрати таблицю → **Insert** → **Import data from CSV**. Файли з експорту — JSON, тому їх потрібно спочатку перетворити в CSV (наприклад, онлайн-конвертером або скриптом). Назви колонок у CSV мають збігатися з полями в JSON (snake_case).
- **Через curl:** для кожної таблиці виконати один або кілька POST-запитів з тілом з відповідного .json файлу (файл має містити масив об’єктів). Зручніше автоматизувати скриптом — тому рекомендовано варіант з **import-to-supabase.mjs**.

Версія: 1.0 | 06.02.2026
