/**
 * Fixed-window limiter, in memory and per server process. It slows abuse of one instance; it is not a
 * distributed limit (documented limitation).
 */
export class FixedWindowRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly maxKeys = 1000,
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    if (this.windows.size >= this.maxKeys) {
      for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
      // Still full of live windows: evict the oldest so memory stays bounded.
      if (this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
    }
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    if (current.count > this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.start + this.windowMs - now) / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
