import { QUEUE_NAMES } from '@nepse/config';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ok } from '../../lib/http';
import { enqueue } from '../../lib/queues';

export const SIGNAL_PERFORMANCE_KEY = 'analytics.signalPerformance';

export default async function analyticsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, queues } = app.deps;
  const tags = ['analytics'];

  r.get('/signals', { schema: { tags, summary: 'Historical signal performance by strategy (computed by the worker)' } }, async () => {
    const row = await db.appSetting.findUnique({ where: { key: SIGNAL_PERFORMANCE_KEY } });
    if (!row) {
      await enqueue(queues, QUEUE_NAMES.signalGeneration, 'signal-performance', {}, { jobId: `signal-performance-${new Date().toISOString().slice(0, 10)}` });
      return ok({ status: 'PENDING', strategies: [], label: 'Computing historical signal outcomes — refresh in a minute.' });
    }
    return ok({ status: 'READY', updatedAt: row.updatedAt, ...(row.value as object) });
  });

  r.post('/signals/refresh', { onRequest: [app.authenticate], schema: { tags, summary: 'Recompute signal performance analytics', security: [{ bearerAuth: [] }] } }, async () => {
    const jobId = await enqueue(queues, QUEUE_NAMES.signalGeneration, 'signal-performance', {});
    return ok({ queued: true, jobId });
  });
}
