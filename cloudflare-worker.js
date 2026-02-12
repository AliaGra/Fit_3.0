/**
 * Cloudflare Worker proxy for Telegram → GAS Web App.
 *
 * 1) Deploy this Worker.
 * 2) Set GAS Script Properties:
 *    PROXY_URL = https://<your-worker>.workers.dev
 * 3) Run GAS function: setWebhookViaProxy
 *
 * This proxy accepts Telegram webhook POST, forwards to GAS /exec,
 * follows redirects, and returns 200 OK to Telegram.
 */

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzSsTsOc4kd72_CWoxqO33X-RI0K7OMMzm0V2MVsHUDEl471q4FXqt8WI7BprYopSZy/exec';

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    const body = await request.text();

    const resp = await fetch(GAS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      redirect: 'follow'
    });

    return new Response('ok', { status: 200 });
  }
};
