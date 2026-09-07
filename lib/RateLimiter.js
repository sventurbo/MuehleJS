/**
 * RateLimiter.js
 * In-memory sliding-window rate limiter.
 * Protects real-time Socket.io and HTTP events from spam, flooding, and DoS attacks.
 */

class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {number} options.max - Maximum number of allowed requests within the window
   */
  constructor({ windowMs = 3000, max = 5 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map(); // key -> Array<number> timestamps
  }

  /**
   * Checks if the given key has exceeded the rate limit.
   * If not, registers the current request timestamp.
   * @param {string} key - Identifier (e.g., socket.id or IP)
   * @returns {boolean} true if the request is rate-limited (blocked), false if allowed
   */
  isLimited(key) {
    if (!key) return false;
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    
    // Retain only timestamps within the current window
    const windowStart = now - this.windowMs;
    const activeTimestamps = timestamps.filter(t => t > windowStart);

    if (activeTimestamps.length >= this.max) {
      this.hits.set(key, activeTimestamps);
      return true; // Limit exceeded!
    }

    activeTimestamps.push(now);
    this.hits.set(key, activeTimestamps);
    return false; // Allowed
  }

  /**
   * Resets rate-limit history for a given key.
   * @param {string} key
   */
  reset(key) {
    this.hits.delete(key);
  }

  /**
   * Prunes expired timestamps across all keys to prevent unbounded memory growth.
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.hits.entries()) {
      const active = timestamps.filter(t => t > windowStart);
      if (active.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, active);
      }
    }
  }

  /**
   * Returns current tracked keys count.
   */
  get size() {
    return this.hits.size;
  }
}

module.exports = { RateLimiter };

