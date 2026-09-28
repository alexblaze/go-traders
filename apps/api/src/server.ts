import { loadEnv } from '@nepse/config';
import { prisma } from '@nepse/database';
import { createProvider } from '@nepse/market-data';
import { Redis } from 'ioredis';
import { buildApp } from './app';
import { Cache } from './lib/cache';
import { createQueues } from './lib/queues';

async function main() {
  const env = loadEnv();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  const queues = createQueues(redis);
  const app = await buildApp({ env, db: prisma, redis, cache: new Cache(redis), queues, provider: createProvider(env) });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await queues.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`API docs at http://localhost:${env.API_PORT}/docs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
