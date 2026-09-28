import { ALERT_NEEDS_THRESHOLD } from '@nepse/database';
import { AppError } from '@nepse/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParams, ok } from '../../lib/http';

export const ALERT_TYPES = [
  'PRICE_ABOVE', 'PRICE_BELOW', 'RSI_BELOW', 'RSI_ABOVE', 'EMA_CROSSOVER_BULLISH', 'EMA_CROSSOVER_BEARISH',
  'MACD_CROSSOVER_BULLISH', 'MACD_CROSSOVER_BEARISH', 'VOLUME_ABOVE', 'BREAKOUT', 'BUY_SIGNAL', 'SELL_SIGNAL',
] as const;

const AlertBody = z
  .object({
    symbol: z.string().min(1).max(20),
    type: z.enum(ALERT_TYPES),
    threshold: z.number().finite().nullable().optional(),
    strategyId: z.string().max(64).optional(),
    channels: z.array(z.enum(['IN_APP', 'EMAIL'])).min(1).default(['IN_APP']),
    repeat: z.boolean().default(false),
    note: z.string().max(200).optional(),
  })
  .refine((b) => !ALERT_NEEDS_THRESHOLD.includes(b.type) || typeof b.threshold === 'number', { message: 'threshold is required for this alert type', path: ['threshold'] });

export default async function alertRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = app.deps;
  const tags = ['alerts'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];
  const present = (a: Awaited<ReturnType<typeof db.alert.findFirstOrThrow>> & { stock: { symbol: string } }) => ({
    id: a.id, symbol: a.stock.symbol, type: a.type, threshold: a.threshold, strategyId: a.strategyId, channels: a.channels, isActive: a.isActive,
    repeat: a.repeat, note: a.note, lastTriggeredAt: a.lastTriggeredAt, createdAt: a.createdAt,
  });

  r.get('/', { ...auth, schema: { tags, summary: 'Your alerts', security } }, async (req) =>
    ok((await db.alert.findMany({ where: { userId: req.user.sub }, include: { stock: true }, orderBy: { createdAt: 'desc' } })).map(present)),
  );

  r.post('/', { ...auth, schema: { tags, summary: 'Create an alert (evaluated by the alert worker)', body: AlertBody, security } }, async (req, reply) => {
    const stock = await db.stock.findUnique({ where: { symbol: req.body.symbol.toUpperCase() } });
    if (!stock) throw new AppError('INVALID_SYMBOL', 'The requested stock symbol was not found.');
    if ((await db.alert.count({ where: { userId: req.user.sub, isActive: true } })) >= 200) throw new AppError('VALIDATION_ERROR', 'Active alert limit (200) reached');
    const a = await db.alert.create({
      data: { userId: req.user.sub, stockId: stock.id, type: req.body.type, threshold: req.body.threshold ?? null, strategyId: req.body.strategyId, channels: req.body.channels, repeat: req.body.repeat, note: req.body.note },
      include: { stock: true },
    });
    reply.status(201);
    return ok(present(a));
  });

  r.patch('/:id', { ...auth, schema: { tags, summary: 'Enable/disable or edit an alert', params: IdParams, body: z.object({ isActive: z.boolean().optional(), threshold: z.number().finite().nullable().optional(), repeat: z.boolean().optional(), note: z.string().max(200).optional() }), security } }, async (req) => {
    const a = await db.alert.findUnique({ where: { id: req.params.id } });
    if (!a || a.userId !== req.user.sub) throw new AppError('NOT_FOUND', 'Alert not found');
    return ok(present(await db.alert.update({ where: { id: a.id }, data: req.body, include: { stock: true } })));
  });

  r.delete('/:id', { ...auth, schema: { tags, summary: 'Delete an alert', params: IdParams, security } }, async (req) => {
    const a = await db.alert.findUnique({ where: { id: req.params.id } });
    if (!a || a.userId !== req.user.sub) throw new AppError('NOT_FOUND', 'Alert not found');
    await db.alert.delete({ where: { id: a.id } });
    return ok({ deleted: true });
  });
}
