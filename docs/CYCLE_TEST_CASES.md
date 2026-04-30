# Cycle Logic Test Cases

## Scope

- `regular`, `perimenopause`, `postmenopause`
- Menstrual filtering by deterministic flags
- Symptom-load impact on sets multiplier
- Stale symptom reminder (`> 7 days`)

## Preconditions

1. SQL migrations applied:
   - `supabase_migration_user_cycle_settings.sql`
   - `supabase_migration_cycle_symptoms_and_exercise_flags.sql`
   - `supabase_migration_exercise_cycle_flag_reviewed_backfill.sql`
   - `supabase_migration_cycle_symptom_reminder.sql`
2. `exercise_library` has rows with:
   - `is_inversion = true`
   - `is_high_impact = true`

## Cases

### 1) Regular cycle + menstrual day

- Setup:
  - `reproductive_status = regular`
  - `last_period_start = today`
  - symptom log score low (0..2)
- Expect:
  - phase = menstrual
  - high-impact/inversion exercises excluded
  - sets multiplier from menstrual phase applied

### 2) Perimenopause with long gap

- Setup:
  - `reproductive_status = perimenopause`
  - `last_period_start` older than 45 days
- Expect:
  - phase = perimenopause_support
  - softer load modifiers

### 3) Postmenopause

- Setup:
  - `reproductive_status = postmenopause`
- Expect:
  - linear mode (no cycle-day logic)
  - no menstrual-only restrictions unless symptom overlay raises them

### 4) High symptom load

- Setup:
  - latest symptom log score >= 9
- Expect:
  - sets multiplier reduced (`<= 0.8`)
  - `excludeHighImpact = true`
  - `excludeInversion = true`

### 5) Stale symptom check reminder

- Setup:
  - female student
  - latest symptom log older than 7 days (or absent)
  - `last_symptom_reminder_sent_at` absent or older than 7 days
- Expect:
  - reminder shown in student menu
  - `last_symptom_reminder_sent_at` updated

### 6) Plan notes explain load change

- Setup:
  - generate auto-plan for female with cycle context
- Expect:
  - first exercise note per day contains block:
    - phase
    - symptom-score
    - sets multiplier

