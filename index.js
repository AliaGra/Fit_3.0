/**
 * Точка входу: HTTP-сервер + webhook для Telegram (FIT 3.0 Node)
 */
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

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('FIT 3.0 bot. Webhook: POST /webhook');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

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
    router.route(update).catch((err) => {
      console.error('route error', err.message);
    });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
