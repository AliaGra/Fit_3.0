/**
 * Точка входу: HTTP-сервер + webhook для Telegram (FIT 3.0 Node)
 */
require('dotenv').config();
const http = require('http');
const PORT = process.env.PORT || 3000;

const MAX_DEDUPE = 5000;
const seenUpdates = new Set();
let dedupeQueue = [];

function dedupe(updateId) {
  if (updateId == null) return false;
  const key = 'UPD_' + String(updateId);
  if (seenUpdates.has(key)) return true;
  seenUpdates.add(key);
  dedupeQueue.push(key);
  if (dedupeQueue.length > MAX_DEDUPE) {
    const toRemove = dedupeQueue.splice(0, Math.floor(MAX_DEDUPE / 2));
    toRemove.forEach((k) => seenUpdates.delete(k));
  }
  return false;
}

const router = require('./lib/router');
const adminBot = require('./lib/adminBot');

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    const url = req.url || '';
    if (url.startsWith('/cron/reminders')) {
      const secret = process.env.REMINDER_CRON_SECRET || '';
      const qs = url.includes('?') ? url.split('?')[1] : '';
      const q = qs ? new URLSearchParams(qs) : null;
      if (!secret || (q && q.get('secret') === secret)) {
        const Reminders = require('./lib/reminders');
        Reminders.sendReminders()
          .then((r) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, sent: r.sent }));
          })
          .catch((err) => {
            console.error('cron/reminders', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      }
      return;
    }
    if (url.startsWith('/cron/weekly-digest')) {
      const secret = process.env.REMINDER_CRON_SECRET || '';
      const qs = url.includes('?') ? url.split('?')[1] : '';
      const q = qs ? new URLSearchParams(qs) : null;
      if (!secret || (q && q.get('secret') === secret)) {
        const WeeklyDigest = require('./lib/weeklyDigest');
        WeeklyDigest.sendWeeklyDigests()
          .then((r) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, sent: r.sent }));
          })
          .catch((err) => {
            console.error('cron/weekly-digest', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      }
      return;
    }
    if (url.startsWith('/cron/plan-revision')) {
      const secret = process.env.REMINDER_CRON_SECRET || process.env.PLAN_REVISION_CRON_SECRET || '';
      const qs = url.includes('?') ? url.split('?')[1] : '';
      const q = qs ? new URLSearchParams(qs) : null;
      if (!secret || (q && q.get('secret') === secret)) {
        const PlanRevisionReminders = require('./lib/planRevisionReminders');
        PlanRevisionReminders.sendPlanRevisionReminders()
          .then((r) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, sent: r.sent }));
          })
          .catch((err) => {
            console.error('cron/plan-revision', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      }
      return;
    }
    if (url.startsWith('/cron/subscription-reminders')) {
      const secret = process.env.REMINDER_CRON_SECRET || '';
      const qs = url.includes('?') ? url.split('?')[1] : '';
      const q = qs ? new URLSearchParams(qs) : null;
      if (!secret || (q && q.get('secret') === secret)) {
        const SubscriptionReminders = require('./lib/subscriptionReminders');
        SubscriptionReminders.sendSubscriptionReminders()
          .then((r) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, sent: r.sent }));
          })
          .catch((err) => {
            console.error('cron/subscription-reminders', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('FIT 3.0 bot. Webhook: POST /webhook');
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/webhook' && req.url !== '/admin_webhook')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const isAdminWebhook = req.url === '/admin_webhook';
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let update = null;
    try {
      update = body ? JSON.parse(body) : null;
    } catch (_) {}
    if (!update || typeof update !== 'object') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    const updateId = update.update_id;
    if (dedupe(updateId)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    console.log('Webhook received update_id=' + updateId);
    const handler = isAdminWebhook ? adminBot.route : router.route;
    handler(update).catch((err) => {
      console.error(isAdminWebhook ? 'admin route error' : 'route error', err.message);
    });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
  const hasBot = !!process.env.BOT_TOKEN;
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_ANON_KEY;
  const railwayEnv = typeof process.env.RAILWAY_ENVIRONMENT !== 'undefined';
  console.log('Env: BOT_TOKEN=' + (hasBot ? 'ok' : 'MISSING') + ' SUPABASE_URL=' + (hasSupabaseUrl ? 'ok' : 'MISSING') + ' SUPABASE_ANON_KEY=' + (hasSupabaseKey ? 'ok' : 'MISSING') + ' RAILWAY_ENV=' + (railwayEnv ? 'yes' : 'no'));
  if (!hasBot || !hasSupabaseUrl || !hasSupabaseKey) {
    console.error('Set BOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY in Railway → Fit_3.0 → Variables, then Redeploy');
  }
});
