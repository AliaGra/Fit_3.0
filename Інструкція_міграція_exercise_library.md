# Міграція exercise_library в Supabase

## Крок 1. Перевірити структуру Google Sheets

Лист **ExerciseLibrary**. Колонки (з рядка 3 — дані):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ID | group_level1 | group_level2 | group_level3 | name_ua | name_ru | equipment | active | vid | difficulty | focus_point | common_mistakes | proper_feeling | static_holds | youtube_link | my_channel_link |

Колонки Q–V (медицина та безпека): medical_contraindications (абсолютні заборони), medical_limitations (обмеження з примітками), safe_for (безпечно при цих станах), modifications (як модифікувати), alternatives (альтернативні вправи), safety_notes (загальні примітки безпеки). Додати через міграцію **supabase_migration_exercise_library_medical_safety.sql**.

**I vid:** базова, изоляция, стабилизация, растяжка  
**J difficulty:** высокая, средняя, низкая

ID: N001, N002… (експортується як 1, 2, 3…).  
Якщо group_level3 порожня — в боті показуємо вправу одразу.

---

## Крок 2. Виконати міграцію в Supabase

1. Supabase → **SQL Editor** → New query
2. Скопіювати вміст файлу **supabase_migration_exercise_library.sql**
3. **Run**

---

## Крок 3. Експорт з Google Sheets

1. Відкрити таблицю → **Розширення** → **Apps Script**
2. У Script Properties вказати **SPREADSHEET_ID**
3. У **ExportForSupabase.gs** обрати функцію **runExportToDrive**
4. **Run**
5. У Drive з’явиться папка **FIT_Export_YYYY-MM-DD_HH-mm** з файлом **exercise_library.json**
6. Завантажити папку на комп’ютер

---

## Крок 4. Імпорт у Supabase

Звичайний імпорт (усі таблиці):
```powershell
cd "d:\Fit 3.0 vs2.0"
$env:SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_ANON_KEY = "your_anon_key"
node import-to-supabase.mjs "C:\шлях\до\папки_FIT_Export_..."
```

**Перезалити тільки exercise_library з Google** (таблицю спочатку очистити, потім залити знову):
```powershell
node import-to-supabase.mjs "C:\шлях\до\папки_FIT_Export_YYYY-MM-DD_HH-mm" exercise_library --replace
```
Після цього в таблиці будуть лише дані з поточного експорту (усі 107 вправ, якщо вони є в JSON).

---

## Файли змінено

- `supabase_migration_exercise_library.sql` — міграція
- `Supabase_створення_таблиць_FIT3.sql` — оновлена схема exercise_library
- `ExportForSupabase.gs` — експорт з новою структурою
- `import-to-supabase.mjs` — валідація id
