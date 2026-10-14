// rate_limiter.js
// Token-bucket limiter shared across all Mistral calls. Ensures we never
// exceed the provider's rate limit even when multiple documents/services
// fire requests concurrently — bursts get queued and smoothed out instead
// of all hitting the API at once and coming back as 429s.
export class RateLimiter {
  /**
   * @param {{ maxPerInterval: number, intervalMs: number }} options
   */
  constructor({ maxPerInterval, intervalMs }) {
    this.maxPerInterval = maxPerInterval;
    this.intervalMs = intervalMs;
    this.queue = [];
    this.timestamps = [];
    this.draining = false;
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    if (this.draining) return;
    this.draining = true;

    const tick = () => {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.intervalMs);

      while (this.queue.length && this.timestamps.length < this.maxPerInterval) {
        const { fn, resolve, reject } = this.queue.shift();
        this.timestamps.push(Date.now());
        fn().then(resolve, reject);
      }

      if (this.queue.length) {
        setTimeout(tick, 100);
      } else {
        this.draining = false;
      }
    };

    tick();
  }
}