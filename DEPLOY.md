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

## Опційні змінні

| Змінна | Опис |
|--------|------|
| `REMINDER_CRON_SECRET` | Секрет для захисту endpoint `/cron/reminders` (GET з `?secret=...`) |
| `DEBUG` | `1` — додаткове логування |

## Кроки деплою

1. У [Railway](https://railway.app) створіть проєкт → **Deploy from GitHub repo** (або завантажте код).
2. У проєкті відкрийте **Variables** і додайте `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Після деплою Railway видасть URL, наприклад: `https://<your-app>.up.railway.app`.
4. Встановіть webhook Telegram:
   ```text
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-app>.up.railway.app/webhook
   ```
   (підставте свій `BOT_TOKEN` і URL сервісу).
5. Якщо використовуєте cron для нагадувань — налаштуйте GET-запит на:
   ```text
   https://<your-app>.up.railway.app/cron/reminders?secret=<REMINDER_CRON_SECRET>
   ```

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
