import { QUEUE_NAMES } from '@nepse/config';
import { Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Cache } from '../../src/lib/cache';
import { createTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createTestApp()));
afterAll(async () => ctx.close());

describe('redis & bullmq', () => {
  it('cache wraps and invalidates', async () => {
    const cache = new Cache(ctx.redis, 'test:');
    let calls = 0;
    const fn = async () => ++calls;
    expect(await cache.wrap('k', 60, fn)).toBe(1);
    expect(await cache.wrap('k', 60, fn)).toBe(1);
    await cache.invalidate('k');
    expect(await cache.wrap('k', 60, fn)).toBe(2);
  });

  it('processes jobs with retries and exponential backoff', async () => {
    const q = ctx.queues[QUEUE_NAMES.marketScreener];
    let attempts = 0;
    const done = new Promise<number>((resolve) => {
      const w = new Worker(q.name, async () => {
        attempts++;
        if (attempts < 2) throw new Error('transient');
        return 'ok';
      }, { connection: ctx.redis.duplicate() });
      w.on('completed', async () => {
        await w.close();
        resolve(attempts);
      });
    });
    await q.add('retry-test', {}, { attempts: 3, backoff: { type: 'exponential', delay: 50 } });
    expect(await done).toBe(2);
  });
});
