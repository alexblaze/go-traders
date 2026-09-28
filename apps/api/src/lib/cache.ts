import type { Redis } from 'ioredis';

/** JSON cache on Redis. Failures degrade to cache-miss so Redis outages never break reads. */
export class Cache {
  constructor(private readonly redis: Redis, private readonly prefix = 'nepse:cache:') {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await this.redis.get(this.prefix + key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* ignore */
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const v = await fn();
    await this.set(key, v, ttlSeconds);
    return v;
  }

  /** Invalidate by prefix pattern (e.g. after an import). */
  async invalidate(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}${pattern}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.redis.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }
}
