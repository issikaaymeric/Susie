/**
 * Thin HTTP wrapper around the backend API. Every request:
 *  - attaches the install token (never the Mistral key — that lives server-side)
 *  - accepts an AbortSignal so callers can cancel in-flight requests
 *  - times out defensively so a hung request never blocks the UI indefinitely
 *  - retries transient upstream failures (502/503/504) with backoff, since
 *    those usually mean the AI provider hiccuped, not that the request was bad
 */
class ApiClient {
  /**
   * @param {{ baseUrl: string, installToken: string, timeoutMs?: number, maxRetries?: number }} options
   */
  constructor({ baseUrl, installToken, timeoutMs = 15000, maxRetries = 2 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    // this.installToken = installToken;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  /**
   * @param {string} token
   */
  // setInstallToken(token) {
  //   this.installToken = token;
  // }

  /**
   * Parses a backend error response into a clear, user-facing message.
   * Falls back gracefully if the body isn't the structured JSON we expect.
   *
   * @param {number} status
   * @param {string} rawBody
   * @returns {Error}
   */
  parseErrorBody(status, rawBody) {
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }

    if (parsed?.error === 'AI_PROVIDER_ERROR') {
      const err = new Error('The AI provider is temporarily unavailable. Please try again in a moment.');
      err.code = 'AI_PROVIDER_ERROR';
      err.status = status;
      return err;
    }

    if (parsed?.message) {
      const err = new Error(parsed.message);
      err.code = parsed.code ?? parsed.error;
      err.status = status;
      return err;
    }

    const err = new Error(`Backend error ${status}: ${rawBody || 'no response body'}`);
    err.status = status;
    return err;
  }

  /**
   * @param {number} status
   * @returns {boolean}
   */
  isRetryableStatus(status) {
    return status === 502 || status === 503 || status === 504;
  }

  /**
   * @param {string} path
   * @param {object} body
   * @param {AbortSignal} [externalSignal]
   * @returns {Promise<any>}
   */
  async post(path, body, externalSignal) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (externalSignal?.aborted) {
        throw new Error('Cancelled by caller');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), this.timeoutMs);

      // Bridge an external (VS Code CancellationToken-derived) signal to this
      // request's AbortController, so a user cancelling mid-typing kills the
      // network call immediately rather than letting it complete uselessly.
      const onExternalAbort = () => controller.abort(new Error('Cancelled by caller'));
      if (externalSignal) {
        externalSignal.addEventListener('abort', onExternalAbort);
      }

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const err = this.parseErrorBody(response.status, errorBody);

          if (this.isRetryableStatus(response.status) && attempt < this.maxRetries) {
            lastError = err;
            const backoffMs = 500 * 2 ** attempt;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw err;
        }

        return await response.json();
      } catch (err) {
        if (err.name === 'AbortError') {
          throw err;
        }
        if (attempt >= this.maxRetries) {
          throw err;
        }
        lastError = err;
      } finally {
        clearTimeout(timeout);
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }
      }
    }

    throw lastError;
  }

  /**
   * @param {string} code
   * @param {string} language
   * @param {AbortSignal} [signal]
   */
  codeBreakdown(code, language, signal) {
    return this.post('/api/code-breakdown', { code, language }, signal);
  }

  /**
   * @param {string} code
   * @param {string} language
   * @param {AbortSignal} [signal]
   */
  codeCorrection(code, language, signal) {
    return this.post('/api/code-correction', { code, language }, signal);
  }

  /**
   * @param {string} codePrefix
   * @param {string} language
   * @param {AbortSignal} [signal]
   */
  autocomplete(codePrefix, language, signal) {
    return this.post('/api/autocomplete', { codePrefix, language }, signal);
  }

  /**
   * @param {{ role: 'user' | 'assistant', content: string }[]} messages
   * @param {AbortSignal} [signal]
   */
  chat(messages, signal) {
    return this.post('/api/chatbot', { messages }, signal);
  }
}

module.exports = { ApiClient };