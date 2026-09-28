import { QUEUE_NAMES } from '@nepse/config';
import { BacktestRequestSchema, executeBacktest, findStockBySymbol, resolveStrategy, type Prisma } from '@nepse/database';
import { BACKTEST_WARNINGS } from '@nepse/backtesting';
import { AppError } from '@nepse/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { IdParams, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { enqueue } from '../../lib/queues';

export async function loadBacktest(db: FastifyInstance['deps']['db'], id: string, userId: string) {
  const bt = await db.backtest.findUnique({ where: { id }, include: { metrics: true, trades: { orderBy: { entryDate: 'asc' } }, stock: { include: { company: true } }, strategy: true } });
  if (!bt || bt.userId !== userId) throw new AppError('NOT_FOUND', 'Backtest not found');
  return {
    id: bt.id, status: bt.status, progress: bt.progress, error: bt.error, createdAt: bt.createdAt, completedAt: bt.completedAt,
    symbol: bt.stock.symbol, companyName: bt.stock.company.name, isDemo: bt.stock.isDemo, strategyId: bt.strategyId, strategyName: bt.strategy.name,
    config: bt.config, parameters: bt.parameters, from: bt.fromDate, to: bt.toDate, initialCapital: bt.initialCapital,
    metrics: bt.metrics, trades: bt.trades, equityCurve: bt.equityCurve, monthlyReturns: bt.monthlyReturns, signals: bt.signalsLog,
    walkForward: bt.walkForward, warnings: bt.warnings ?? BACKTEST_WARNINGS,
  };
}

export default async function backtestRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, queues } = app.deps;
  const tags = ['backtests'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];

  r.post('', {
    ...auth,
    schema: { tags, summary: 'Queue a backtest (event-driven, next-bar-open fills, Nepal fee schedules)', body: BacktestRequestSchema, querystring: z.object({ mode: z.enum(['async', 'sync']).default('async') }), security },
  }, async (req, reply) => {
    const stock = await findStockBySymbol(db, req.body.symbol);
    await resolveStrategy(db, req.body.strategyId, req.body.parameters, req.user.sub);
    const bt = await db.backtest.create({
      data: {
        userId: req.user.sub, stockId: stock.id, strategyId: req.body.strategyId, initialCapital: req.body.initialCapital,
        config: JSON.parse(JSON.stringify({ ...req.body, symbol: stock.symbol })) as Prisma.InputJsonValue, status: 'QUEUED',
      },
    });
    await audit(db, 'backtest.create', { userId: req.user.sub, entity: 'backtest', entityId: bt.id, metadata: { symbol: stock.symbol, strategy: req.body.strategyId } });
    if (req.query.mode === 'sync') {
      await executeBacktest(db, bt.id);
    } else {
      const jobId = await enqueue(queues, QUEUE_NAMES.backtesting, 'run-backtest', { backtestId: bt.id, userId: req.user.sub, symbol: stock.symbol, strategy: req.body.strategyId });
      await db.backtest.update({ where: { id: bt.id }, data: { jobId } });
    }
    reply.status(req.query.mode === 'sync' ? 201 : 202);
    return ok(await loadBacktest(db, bt.id, req.user.sub));
  });

  r.get('', { ...auth, schema: { tags, summary: 'Your backtests', querystring: PaginationQuery, security } }, async (req) => {
    const where = { userId: req.user.sub };
    const [total, rows] = await Promise.all([
      db.backtest.count({ where }),
      db.backtest.findMany({ where, include: { metrics: true, stock: true, strategy: true }, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize }),
    ]);
    return ok(
      rows.map((b) => ({ id: b.id, status: b.status, progress: b.progress, symbol: b.stock.symbol, strategyId: b.strategyId, strategyName: b.strategy.name, createdAt: b.createdAt, from: b.fromDate, to: b.toDate, metrics: b.metrics, error: b.error })),
      pageMeta(req.query.page, req.query.pageSize, total),
    );
  });

  r.get('/compare', {
    ...auth,
    schema: { tags, summary: 'Compare metrics of several backtests', querystring: z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean).slice(0, 10)) }), security },
  }, async (req) => {
    const list = await Promise.all(req.query.ids.map((id) => loadBacktest(db, id, req.user.sub)));
    return ok(list.map((b) => ({ id: b.id, symbol: b.symbol, strategyId: b.strategyId, strategyName: b.strategyName, from: b.from, to: b.to, metrics: b.metrics, equityCurve: b.equityCurve })), {
      note: 'Historical comparisons only; past performance does not guarantee future results.',
    });
  });

  r.get('/:id', { ...auth, schema: { tags, summary: 'Backtest result with equity curve, drawdown, trades and warnings', params: IdParams, security } }, async (req) =>
    ok(await loadBacktest(db, req.params.id, req.user.sub)),
  );

  r.delete('/:id', { ...auth, schema: { tags, summary: 'Delete a backtest', params: IdParams, security } }, async (req) => {
    await loadBacktest(db, req.params.id, req.user.sub);
    await db.backtest.delete({ where: { id: req.params.id } });
    return ok({ deleted: true });
  });
}
