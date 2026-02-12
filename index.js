/**
 * Мінімальний HTTP-сервер для Railway.
 * Слухає PORT, відповідає 200 — щоб деплой не падав.
 * Пізніше тут буде webhook для Telegram.
 */
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
