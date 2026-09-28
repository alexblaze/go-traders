import type { FastifyInstance } from 'fastify';
import { renderMetrics } from '../../lib/metrics';

export default async function healthRoutes(app: FastifyInstance) {
  const { db, redis, queues } = app.deps;

  app.get('/health', { schema: { tags: ['health'], summary: 'Liveness probe' } }, async () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() }));

  app.get('/ready', { schema: { tags: ['health'], summary: 'Readiness probe (database + Redis)' } }, async (_req, reply) => {
    const check = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        await fn();
        return { ok: true, latencyMs: Date.now() - t };
      } catch (e) {
        return { ok: false, latencyMs: Date.now() - t, error: (e as Error).message };
      }
    };
    const [database, cache] = await Promise.all([check(() => db.$queryRaw`SELECT 1`), check(() => redis.ping())]);
    const ready = database.ok && cache.ok;
    reply.status(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'not_ready', checks: { database, redis: cache } };
  });

  app.get('/metrics', { schema: { tags: ['health'], summary: 'Prometheus metrics (API latency, queue depth)' } }, async (_req, reply) => {
    const extra: Record<string, number> = {};
    for (const [name, q] of Object.entries(queues)) {
      if (typeof q === 'function') continue;
      try {
        const c = await q.getJobCounts('waiting', 'active', 'failed');
        for (const [k, v] of Object.entries(c)) extra[`bullmq_jobs{queue="${name}",state="${k}"}`] = v;
      } catch {
        /* redis down */
      }
    }
    reply.type('text/plain; version=0.0.4');
    return renderMetrics(extra);
  });
}
