import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ok, pageMeta, PaginationQuery, SymbolParams } from '../../lib/http';
import { RANGES } from '../../lib/ranges';
import { SignalsService } from '../signals/signals.service';
import { StocksService } from './stocks.service';

export default async function stockRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = new StocksService(app.deps);
  const signals = new SignalsService(app.deps);
  const tags = ['stocks'];

  r.get('', {
    schema: {
      tags, summary: 'List/search listed stocks with latest price',
      querystring: PaginationQuery.extend({
        search: z.string().max(50).optional(), sector: z.string().max(100).optional(),
        sort: z.enum(['symbol', 'changePercent', 'volume', 'turnover', 'close']).default('symbol'), order: z.enum(['asc', 'desc']).default('asc'),
      }),
    },
  }, async (req) => {
    const { items, total } = await svc.list(req.query);
    return ok(items, pageMeta(req.query.page, req.query.pageSize, total));
  });

  r.get('/:symbol', { schema: { tags, summary: 'Stock details (fundamentals shown as N/A when unavailable)', params: SymbolParams } }, async (req) => ok(await svc.detail(req.params.symbol)));

  r.get('/:symbol/history', {
    schema: {
      tags, summary: 'Historical OHLCV candles', params: SymbolParams,
      querystring: z.object({ range: z.enum(RANGES).default('1Y'), timeframe: z.enum(['1D', '1W', '1M']).default('1D'), from: z.coerce.date().optional(), to: z.coerce.date().optional() }),
    },
  }, async (req) => ok(await svc.history(req.params.symbol, req.query.range, req.query.timeframe, req.query.from, req.query.to)));

  r.get('/:symbol/indicators', {
    schema: {
      tags, summary: 'Indicator series for charting (e.g. ids=ema,rsi&params={"ema":{"period":50}})', params: SymbolParams,
      querystring: z.object({
        ids: z.string().default('ema,rsi,macd').transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
        range: z.enum(RANGES).default('1Y'),
        params: z.string().optional().transform((s, ctx) => {
          if (!s) return {} as Record<string, Record<string, number>>;
          try {
            return z.record(z.string(), z.record(z.string(), z.number())).parse(JSON.parse(s));
          } catch {
            ctx.addIssue({ code: 'custom', message: 'params must be JSON like {"ema":{"period":50}}' });
            return z.NEVER;
          }
        }),
      }),
    },
  }, async (req) => ok(await svc.indicators(req.params.symbol, req.query.ids, req.query.range, req.query.params)));

  r.get('/:symbol/signals', { schema: { tags, summary: 'Latest BUY/SELL/HOLD candidate signals for every strategy, with reasons', params: SymbolParams } }, async (req) =>
    ok(await signals.latestForStock(req.params.symbol)),
  );

  r.get('/:symbol/signals/history', {
    schema: { tags, summary: 'Persisted signal history', params: SymbolParams, querystring: PaginationQuery.extend({ strategy: z.string().max(64).optional() }) },
  }, async (req) => {
    const { items, total } = await signals.history(req.params.symbol, req.query.strategy, req.query.page, req.query.pageSize);
    return ok(items, pageMeta(req.query.page, req.query.pageSize, total));
  });

  r.get('/:symbol/signals/stats', { schema: { tags, summary: 'Historical outcome statistics of each strategy on this stock', params: SymbolParams } }, async (req) => ok(await signals.stats(req.params.symbol)));

  r.get('/:symbol/quality', { schema: { tags, summary: 'Data-quality report (flags, never modifies)', params: SymbolParams } }, async (req) => ok(await svc.quality(req.params.symbol)));
}
