/**
 * AI Client — OpenAI API (GPT-4o mini), перевірка увімкнення, таймаут, fallback.
 * Частина 1: інфраструктура AI (AI_Integration_FIT3_Implementation_Plan.md).
 */
const OpenAI = require('openai');

const AI_ENABLED = process.env.AI_ENABLED === 'true';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '600', 10) || 600;
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '10000', 10) || 10000;

let _client = null;

function getClient() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY || '';
  if (!key.trim()) return null;
  _client = new OpenAI({ apiKey: key.trim() });
  return _client;
}

/** Чи дозволено викликати AI (ключ є і AI_ENABLED=true). */
function isEnabled() {
  const enabled = AI_ENABLED && !!getClient();
  if (process.env.DEBUG === '1' && !enabled) {
    const key = process.env.OPENAI_API_KEY || '';
    console.log('[aiClient] isEnabled=false: AI_ENABLED=' + AI_ENABLED + ', hasKey=' + !!key.trim() + ', keyLength=' + key.length);
  }
  return enabled;
}

/**
 * Виклик chat completions з таймаутом.
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens?: number, temperature?: number, responseFormat?: { type: string } }} options
 * @returns {{ content: string, usage?: { total_tokens?: number } } | null}
 */
async function chatCompletion(messages, options = {}) {
  if (!isEnabled()) return null;

  const client = getClient();
  const maxTokens = options.maxTokens != null ? options.maxTokens : AI_MAX_TOKENS;
  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: options.temperature != null ? options.temperature : 0.7
  };
  if (options.responseFormat) body.response_format = options.responseFormat;

  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : AI_TIMEOUT_MS;

  try {
    const completionPromise = client.chat.completions.create(body);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs);
    });
    const response = await Promise.race([completionPromise, timeoutPromise]);

    const choice = response.choices && response.choices[0];
    const content = choice && choice.message && typeof choice.message.content === 'string'
      ? choice.message.content.trim()
      : null;
    const usage = response.usage || null;

    if (!content) return null;
    return { content, usage };
  } catch (e) {
    console.error('aiClient.chatCompletion', e.message || e);
    if (process.env.DEBUG === '1') {
      console.log('[aiClient] Error details:', e.code || 'no code', e.status || 'no status');
    }
    return null;
  }
}

/**
 * Безпечний виклик AI-функції з fallback.
 * @param {() => Promise<any>} aiFn
 * @param {any} fallback
 * @returns {Promise<any>}
 */
async function safeCall(aiFn, fallback = null) {
  try {
    const result = await aiFn();
    return result !== undefined && result !== null ? result : fallback;
  } catch (e) {
    console.error('aiClient.safeCall', e.message || e);
    return fallback;
  }
}

/**
 * Орієнтовна вартість у USD (GPT-4o mini: $0.15/1M input, $0.60/1M output).
 */
function estimateCostUsd(inputTokens, outputTokens) {
  const inCost = (inputTokens || 0) / 1e6 * 0.15;
  const outCost = (outputTokens || 0) / 1e6 * 0.6;
  return Math.round((inCost + outCost) * 1e6) / 1e6;
}

module.exports = {
  isEnabled,
  chatCompletion,
  safeCall,
  estimateCostUsd,
  AI_MODEL,
  AI_MAX_TOKENS
};
