export class RateLimiter {
  constructor({ windowMs = 3000, max = 5 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  isLimited(key) {
    if (!key) return false;
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];

    const windowStart = now - this.windowMs;
    const activeTimestamps = timestamps.filter(t => t > windowStart);

    if (activeTimestamps.length >= this.max) {
      this.hits.set(key, activeTimestamps);
      return true;
    }

    activeTimestamps.push(now);
    this.hits.set(key, activeTimestamps);
    return false;
  }

  reset(key) {
    this.hits.delete(key);
  }

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

  get size() {
    return this.hits.size;
  }
}
