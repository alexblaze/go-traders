import { loadEnv, resetEnvCache } from '@nepse/config';
import { prisma } from '@nepse/database';
import { MockProvider } from '@nepse/market-data';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '../../src/app';
import { Cache } from '../../src/lib/cache';
import { createQueues, type Queues } from '../../src/lib/queues';

export interface TestCtx {
  app: FastifyInstance;
  redis: Redis;
  queues: Queues;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestCtx> {
  resetEnvCache();
  const env = loadEnv();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  await redis.flushdb();
  const queues = createQueues(redis);
  const app = await buildApp({ env, db: prisma, redis, cache: new Cache(redis), queues, provider: new MockProvider() });
  await app.ready();
  return {
    app, redis, queues,
    async close() {
      await app.close();
      await queues.close();
      await redis.quit();
    },
  };
}

let counter = 0;
export async function registerUser(app: FastifyInstance, prefix = 'user') {
  const email = `${prefix}${Date.now()}${counter++}@test.local`;
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password: 'Password123', name: 'Tester' } });
  const body = res.json();
  return { email, token: body.data.accessToken as string, refreshToken: body.data.refreshToken as string, userId: body.data.user.id as string };
}

export async function loginAdmin(app: FastifyInstance) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@test.local', password: 'AdminPass123' } });
  return res.json().data.accessToken as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
