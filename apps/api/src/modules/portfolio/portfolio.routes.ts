import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { ok, pageMeta, PaginationQuery, SymbolParams } from '../../lib/http';
import { LiveBrokerPlaceholder } from './broker';
import { PortfolioService } from './portfolio.service';

export const OrderBody = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive().max(10_000_000),
  type: z.literal('MARKET').default('MARKET'),
  strategyId: z.string().max(64).optional(),
  signal: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
  reason: z.string().max(500).optional(),
  broker: z.enum(['PAPER', 'LIVE']).default('PAPER'),
});

export default async function portfolioRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = new PortfolioService(app.deps);
  const { db, env } = app.deps;
  const tags = ['portfolio'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];

  r.get('/', { ...auth, schema: { tags, summary: 'Paper portfolio: cash, positions, P&L', security } }, async (req) => ok(await svc.summary(req.user.sub)));

  r.get('/orders', { ...auth, schema: { tags, summary: 'Paper order history', querystring: PaginationQuery, security } }, async (req) => {
    const { items, total } = await svc.orders(req.user.sub, req.query.page, req.query.pageSize);
    return ok(items, pageMeta(req.query.page, req.query.pageSize, total));
  });

  r.post('/orders', { ...auth, schema: { tags, summary: 'Place a paper (simulated) market order', body: OrderBody, security } }, async (req, reply) => {
    const { broker, ...order } = req.body;
    if (broker === 'LIVE') await new LiveBrokerPlaceholder(env.LIVE_TRADING_ENABLED).placeOrder();
    const result = await svc.order(req.user.sub, order);
    await audit(db, 'paper_order.create', { userId: req.user.sub, entity: 'paper_order', entityId: result.orderId, metadata: { symbol: order.symbol, side: order.side, quantity: order.quantity } });
    reply.status(201);
    return ok({ ...result, portfolio: await svc.summary(req.user.sub) });
  });

  r.post('/cash', {
    ...auth,
    schema: { tags, summary: 'Add or remove virtual cash', body: z.object({ type: z.enum(['DEPOSIT', 'WITHDRAWAL']), amount: z.number().positive().max(1e12), note: z.string().max(200).optional() }), security },
  }, async (req) => ok(await svc.cash(req.user.sub, req.body.type, req.body.amount, req.body.note)));

  r.get('/risk/:symbol', {
    ...auth,
    schema: { tags, summary: 'Risk analysis: ATR/percent stops, targets, R:R and position sizing', params: SymbolParams, querystring: z.object({ riskPerTradePct: z.coerce.number().min(0.1).max(10).default(1) }), security },
  }, async (req) => ok(await svc.risk(req.user.sub, req.params.symbol, req.query.riskPerTradePct)));

  r.get('/broker', { ...auth, schema: { tags, summary: 'Broker configuration', security } }, async () =>
    ok({ active: 'PAPER', liveTradingEnabled: env.LIVE_TRADING_ENABLED, note: 'Live trading is not implemented. It requires LIVE_TRADING_ENABLED=true and a verified, legally appropriate broker API adapter.' }),
  );
}
