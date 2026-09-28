import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ok, pageMeta, PaginationQuery } from '../../lib/http';
import { SignalsService } from './signals.service';

export default async function signalRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = new SignalsService(app.deps);
  r.get('/', {
    schema: {
      tags: ['signals'], summary: 'Latest signals across stocks',
      querystring: PaginationQuery.extend({
        signal: z.enum(['BUY', 'SELL', 'HOLD']).optional(), strategy: z.string().max(64).default('ensemble'),
        minStrength: z.coerce.number().min(0).max(100).default(0), sector: z.string().max(100).optional(),
      }),
    },
  }, async (req) => {
    const q = req.query;
    const { items, total, date } = await svc.feed({ signal: q.signal, strategyId: q.strategy, minStrength: q.minStrength, sector: q.sector, page: q.page, pageSize: q.pageSize });
    return ok(items, { ...pageMeta(q.page, q.pageSize, total), date });
  });
}
