# Деплой FIT 3.0 на Railway

## Що потрібно

- Репозиторій у Git (GitHub/GitLab) або завантаження коду через Railway CLI.
- Змінні середовища в Railway (проєкт → Variables).

## Змінні середовища (обовʼязкові)

| Змінна | Опис |
|--------|------|
| `BOT_TOKEN` | Токен бота від @BotFather |
| `SUPABASE_URL` | URL проєкту Supabase (без слеша в кінці) |
| `SUPABASE_ANON_KEY` | Ключ anon (public) Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **Рекомендовано.** Service role для адмін-бота (список «Користувачі», пошук). Без нього при увімкненому RLS список може бути порожнім, хоча в SQL Editor дані є |

## Опційні змінні

| Змінна | Опис |
|--------|------|
| `REMINDER_CRON_SECRET` | Секрет для захисту endpoint `/cron/reminders` та `/cron/plan-revision` (GET з `?secret=...`) |
| `PLAN_REVISION_CRON_SECRET` | Опційно: окремий секрет для `/cron/plan-revision`; якщо не задано — використовується `REMINDER_CRON_SECRET` |
| `REMINDER_HOURS_BEFORE` | За скільки годин до тренування надсилати нагадування (число) |
| `DEBUG` | `1` — додаткове логування |

### Змінні для AI (OpenAI)

Якщо потрібні коментарі тренера в планах, розумні нагадування та аналіз невиконання вправ:

| Змінна | Опис |
|--------|------|
| `OPENAI_API_KEY` | Ключ API OpenAI (sk-...) |
| `AI_ENABLED` | `true` — увімкнути виклики AI (латинськими) |
| `AI_MODEL` | Модель, за замовчуванням `gpt-4o-mini` |
| `AI_MAX_TOKENS` | Макс. токенів відповіді, за замовчуванням 600 |
| `AI_TIMEOUT_MS` | Таймаут запиту (мс), за замовчуванням 10000 |

Перед використанням AI потрібно виконати міграцію `supabase_migration_ai_content.sql` (таблиця `ai_generated_content`). Детально: **Підключення_AI_покроково.md**.

## Кроки деплою

1. У [Railway](https://railway.app) створіть проєкт → **Deploy from GitHub repo** (або завантажте код).
2. У проєкті відкрийте **Variables** і додайте `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Після деплою Railway видасть URL, наприклад: `https://<your-app>.up.railway.app`.
4. Встановіть webhook Telegram:
   ```text
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-app>.up.railway.app/webhook
   ```
   (підставте свій `BOT_TOKEN` і URL сервісу).
5. Якщо використовуєте cron:
   - Нагадування учням: `GET https://<your-app>.up.railway.app/cron/reminders?secret=<REMINDER_CRON_SECRET>`
   - Нагадування тренеру про ревізію плану: `GET https://<your-app>.up.railway.app/cron/plan-revision?secret=<REMINDER_CRON_SECRET>` (або `PLAN_REVISION_CRON_SECRET`)

## Перевірка

- Відкрийте в браузері `https://<your-app>.up.railway.app` — має зʼявитись текст: `FIT 3.0 bot. Webhook: POST /webhook`.
- У логах Railway при старті мають бути рядки: `Env: BOT_TOKEN=ok SUPABASE_URL=ok ...`.

## Структура для деплою

У репозиторії мають бути:

- `index.js` — точка входу
- `package.json` — залежності та `npm start`
- `lib/` — усі модулі (router, schedule, helpers, supabase, constants тощо)
- `railway.json` — опційна конфігурація Railway

Папку `node_modules/` і файл `.env` не комітити (вони в `.gitignore`).

## Cron endpoints (коротко)

- Нагадування учням: `GET https://<your-app>.up.railway.app/cron/reminders?secret=<REMINDER_CRON_SECRET>`
- Нагадування тренеру про ревізію плану: `GET https://<your-app>.up.railway.app/cron/plan-revision?secret=<REMINDER_CRON_SECRET>` (або `PLAN_REVISION_CRON_SECRET`)
- Тижневий AI-дайджест для тренерів: `GET https://<your-app>.up.railway.app/cron/weekly-digest?secret=<REMINDER_CRON_SECRET>` (рекомендований розклад: щопонеділка о 08:00)
