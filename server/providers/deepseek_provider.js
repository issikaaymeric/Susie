import { RateLimiter } from './rate_limiter.js';

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error('DEEPSEEK_API_KEY is not set. Load it from your secrets manager before starting the server.');
}

const API_URL = 'https://api.deepseek.com/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY;
export const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 1024;

const limiter = new RateLimiter({ maxPerInterval: 3, intervalMs: 1000 });

const MAX_429_RETRIES = 2;

/**
 * @param {unknown} err
 * @returns {number | null} status code if this looks like an HTTP error, else null
 */
function getStatusCode(err) {
  return typeof err?.statusCode === 'number' ? err.statusCode : null;
}

/**
 * @param {unknown} err
 * @returns {number} milliseconds to wait before retrying
 */
function getRetryDelayMs(err) {
  const retryAfterHeader = err?.headers?.get?.('retry-after') ?? err?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
    const retryAt = Date.parse(retryAfterHeader);
    if (!Number.isNaN(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }
  return 1000;
}

/**
 * Single entry point for all DeepSeek calls. Feature services depend on this
 * function so provider details remain isolated from the application.
 *
 * All calls are funneled through a shared rate limiter so bursts across
 * services (autocomplete, chat, breakdown, correction) can't collectively
 * exceed the configured request rate and trigger 429s. A 429 that still
 * slips through gets a couple of short retries before
 * bubbling up.
 *
 * @param {{ system: string, user: string }} prompt
 * @param {{ model?: string, maxTokens?: number }} [options]
 * @returns {Promise<object>} Parsed JSON response body.
 */
export async function complete(prompt, options = {}) {
  const { model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = options;

  let attempt = 0;

  while (true) {
    try {
      const response = await limiter.schedule(() =>
        fetch(API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
        })
      );

      if (!response.ok) {
        const error = new Error(`DEEPSEEK_HTTP_ERROR: ${response.status}`);
        error.statusCode = response.status;
        error.headers = response.headers;
        throw error;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('DEEPSEEK_EMPTY_RESPONSE');
      }

      try {
        return JSON.parse(content);
      } catch (err) {
        throw new Error(`DEEPSEEK_INVALID_JSON: ${err.message}`);
      }
    } catch (err) {
      const status = getStatusCode(err);

      if (status === 429 && attempt < MAX_429_RETRIES) {
        attempt += 1;
        const delayMs = getRetryDelayMs(err);
        console.warn(`[deepseek-provider] 429 rate limited, retry ${attempt}/${MAX_429_RETRIES} in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    }
  }
}