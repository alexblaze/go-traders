import type { Env } from '@nepse/config';
import type { PrismaClient } from '@nepse/database';
import type { MarketDataProvider } from '@nepse/market-data';
import type { Redis } from 'ioredis';
import type { Cache } from './cache';
import type { Queues } from './queues';

/** Explicit dependencies injected into the Fastify app (makes the API testable). */
export interface AppDeps {
  env: Env;
  db: PrismaClient;
  redis: Redis;
  cache: Cache;
  queues: Queues;
  provider: MarketDataProvider;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
