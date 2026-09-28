import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ok } from '../../lib/http';
import { RANGES } from '../../lib/ranges';
import { MarketService, TRENDING_CATEGORIES } from './market.service';

export default async function marketRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = new MarketService(app.deps);
  const tags = ['market'];

  r.get('/summary', { schema: { tags, summary: 'Market dashboard summary (index, turnover, breadth, 52W highs/lows)' } }, async () => ok(await svc.summary()));
  r.get('/index', { schema: { tags, summary: 'Index history (official if imported, otherwise derived composite)', querystring: z.object({ range: z.enum(RANGES).default('1Y') }) } }, async (req) =>
    ok(await svc.index(req.query.range)),
  );
  r.get('/regime', { schema: { tags, summary: 'Market regime classification with evidence' } }, async () => ok(await svc.regime()));
  r.get('/sectors', { schema: { tags, summary: 'Sector analysis', querystring: z.object({ period: z.enum(['1D', '1W', '1M', '3M']).default('1D') }) } }, async (req) =>
    ok(await svc.sectors(req.query.period)),
  );
  r.get('/trending', {
    schema: {
      tags, summary: 'Stocks ranked by a factual metric (e.g. highest momentum)',
      querystring: z.object({ category: z.enum(TRENDING_CATEGORIES).default('most_active'), limit: z.coerce.number().int().min(1).max(100).default(10), sector: z.string().max(100).optional() }),
    },
  }, async (req) => ok(await svc.trending(req.query.category, req.query.limit, req.query.sector)));
}
