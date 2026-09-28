import { latestSnapshots } from '@nepse/database';
import { AppError } from '@nepse/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ensureAnalysis } from '../../lib/analysis';
import { IdParams, ok } from '../../lib/http';

export async function watchlistView(app: FastifyInstance, userId: string, id?: string) {
  const { db } = app.deps;
  await ensureAnalysis(app.deps);
  const lists = await db.watchlist.findMany({ where: { userId, ...(id ? { id } : {}) }, include: { items: { include: { stock: { include: { company: true } } }, orderBy: { addedAt: 'asc' } } }, orderBy: { createdAt: 'asc' } });
  if (id && !lists.length) throw new AppError('NOT_FOUND', 'Watchlist not found');
  const snaps = await latestSnapshots(db);
  const stockIds = lists.flatMap((l) => l.items.map((i) => i.stockId));
  const latestEns = stockIds.length
    ? await db.$queryRaw<{ stock_id: string; signal: string; strength: number; timestamp: Date }[]>`
        SELECT DISTINCT ON (stock_id) stock_id, signal, strength, timestamp FROM signals WHERE strategy_id = 'ensemble' AND stock_id = ANY(${stockIds}) ORDER BY stock_id, timestamp DESC`
    : [];
  const ens = new Map(latestEns.map((e) => [e.stock_id, e]));
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    createdAt: l.createdAt,
    items: l.items.map((i) => {
      const s = snaps.get(i.stockId)?.values;
      const e = ens.get(i.stockId);
      return {
        id: i.id, symbol: i.stock.symbol, companyName: i.stock.company.name, isDemo: i.stock.isDemo, note: i.note,
        price: s?.close ?? null, changePercent: s?.changePercent ?? null, volume: s?.volume ?? null, rsi14: s?.rsi14 ?? null,
        trend: s?.regime ?? null, signal: e?.signal ?? null, signalStrength: e?.strength ?? null, signalDate: e?.timestamp ?? null,
      };
    }),
  }));
}

export default async function watchlistRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = app.deps;
  const tags = ['watchlists'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];
  const own = async (id: string, userId: string) => {
    const w = await db.watchlist.findUnique({ where: { id } });
    if (!w || w.userId !== userId) throw new AppError('NOT_FOUND', 'Watchlist not found');
    return w;
  };

  r.get('', { ...auth, schema: { tags, summary: 'Your watchlists with price, RSI, trend and signal', security } }, async (req) => ok(await watchlistView(app, req.user.sub)));

  r.post('', { ...auth, schema: { tags, summary: 'Create a watchlist', body: z.object({ name: z.string().min(1).max(60), symbols: z.array(z.string().max(20)).max(200).optional() }), security } }, async (req, reply) => {
    if (await db.watchlist.findUnique({ where: { userId_name: { userId: req.user.sub, name: req.body.name } } })) throw new AppError('CONFLICT', 'A watchlist with this name already exists');
    const stocks = req.body.symbols?.length ? await db.stock.findMany({ where: { symbol: { in: req.body.symbols.map((s) => s.toUpperCase()) } } }) : [];
    const w = await db.watchlist.create({ data: { userId: req.user.sub, name: req.body.name, items: { create: stocks.map((s) => ({ stockId: s.id })) } } });
    reply.status(201);
    return ok((await watchlistView(app, req.user.sub, w.id))[0]);
  });

  r.get('/:id', { ...auth, schema: { tags, summary: 'One watchlist', params: IdParams, security } }, async (req) => {
    await own(req.params.id, req.user.sub);
    return ok((await watchlistView(app, req.user.sub, req.params.id))[0]);
  });

  r.patch('/:id', { ...auth, schema: { tags, summary: 'Rename a watchlist', params: IdParams, body: z.object({ name: z.string().min(1).max(60) }), security } }, async (req) => {
    await own(req.params.id, req.user.sub);
    await db.watchlist.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    return ok((await watchlistView(app, req.user.sub, req.params.id))[0]);
  });

  r.delete('/:id', { ...auth, schema: { tags, summary: 'Delete a watchlist', params: IdParams, security } }, async (req) => {
    await own(req.params.id, req.user.sub);
    await db.watchlist.delete({ where: { id: req.params.id } });
    return ok({ deleted: true });
  });

  r.post('/:id/items', { ...auth, schema: { tags, summary: 'Add a stock', params: IdParams, body: z.object({ symbol: z.string().min(1).max(20), note: z.string().max(200).optional() }), security } }, async (req, reply) => {
    await own(req.params.id, req.user.sub);
    const stock = await db.stock.findUnique({ where: { symbol: req.body.symbol.toUpperCase() } });
    if (!stock) throw new AppError('INVALID_SYMBOL', 'The requested stock symbol was not found.');
    await db.watchlistItem.upsert({ where: { watchlistId_stockId: { watchlistId: req.params.id, stockId: stock.id } }, create: { watchlistId: req.params.id, stockId: stock.id, note: req.body.note }, update: { note: req.body.note } });
    reply.status(201);
    return ok((await watchlistView(app, req.user.sub, req.params.id))[0]);
  });

  r.delete('/:id/items/:symbol', { ...auth, schema: { tags, summary: 'Remove a stock', params: z.object({ id: z.string(), symbol: z.string().max(20) }), security } }, async (req) => {
    await own(req.params.id, req.user.sub);
    const stock = await db.stock.findUnique({ where: { symbol: req.params.symbol.toUpperCase() } });
    if (stock) await db.watchlistItem.deleteMany({ where: { watchlistId: req.params.id, stockId: stock.id } });
    return ok((await watchlistView(app, req.user.sub, req.params.id))[0]);
  });
}
