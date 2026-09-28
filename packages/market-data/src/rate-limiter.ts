/** Simple token-bucket limiter for provider-specific request limits. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {
    this.tokens = perMinute;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60000) * this.perMinute);
    this.last = t;
  }

  /** Milliseconds until a token is available (0 if available now). Consumes a token when 0. */
  tryAcquire(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.perMinute) * 60000);
  }

  async acquire(): Promise<void> {
    for (;;) {
      const wait = this.tryAcquire();
      if (wait === 0) return;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
