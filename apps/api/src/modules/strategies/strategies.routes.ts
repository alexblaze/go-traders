import { findStockBySymbol, loadCandles, resolveStrategy, type Prisma } from '@nepse/database';
import { computeSnapshot, sanitizeNumbers } from '@nepse/indicators';
import { AppError, DISCLAIMER } from '@nepse/shared';
import { COMPARATORS, CustomStrategyDefinitionSchema, defaultRegistry, describeStrategy, DSL_FIELDS, FIELD_LABELS } from '@nepse/strategies';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { IdParams, ok } from '../../lib/http';

export default async function strategyRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = app.deps;
  const tags = ['strategies'];
  const optionalUser = async (req: { jwtVerify: () => Promise<unknown>; user?: { sub: string } }) => {
    try {
      await req.jwtVerify();
    } catch {
      /* anonymous */
    }
  };

  r.get('/', { onRequest: [optionalUser], schema: { tags, summary: 'List strategies (built-in + your custom strategies)' } }, async (req) => {
    const rows = await db.strategy.findMany({ where: { OR: [{ isBuiltin: true }, ...(req.user ? [{ ownerId: req.user.sub }] : [])] }, include: { parameters: true }, orderBy: { createdAt: 'asc' } });
    return ok(rows.map((row) => {
      const b = defaultRegistry.get(row.id);
      const overrides = Object.fromEntries(row.parameters.map((p) => [p.key, p.value]));
      return b
        ? { ...describeStrategy(b), isBuiltin: true, isActive: row.isActive, parameters: b.parameters.map((p) => ({ ...p, value: overrides[p.key] ?? p.default })), timeframe: '1D' }
        : { id: row.id, name: row.name, description: row.description, category: 'custom', isBuiltin: false, isActive: row.isActive, definition: row.definition, parameters: [], timeframe: '1D' };
    }));
  });

  r.get('/dsl/fields', { schema: { tags, summary: 'Fields and comparators available to the rule DSL' } }, async () =>
    ok({ fields: DSL_FIELDS.map((f) => ({ key: f, label: FIELD_LABELS[f] })), comparators: COMPARATORS, groupOperators: ['AND', 'OR'] }),
  );

  r.get('/:id', { onRequest: [optionalUser], schema: { tags, summary: 'Strategy details', params: IdParams } }, async (req) => {
    const { strategy, parameters } = await resolveStrategy(db, req.params.id, undefined, req.user?.sub);
    return ok({ ...describeStrategy(strategy), effectiveParameters: parameters, timeframe: '1D' });
  });

  r.post('/:id/run', {
    onRequest: [optionalUser],
    schema: { tags, summary: 'Run a strategy on a stock now (not persisted)', params: IdParams, body: z.object({ symbol: z.string().min(1).max(20), parameters: z.record(z.string(), z.number()).optional() }) },
  }, async (req) => {
    const stock = await findStockBySymbol(db, req.body.symbol);
    const { strategy, parameters } = await resolveStrategy(db, req.params.id, req.body.parameters, req.user?.sub);
    const candles = await loadCandles(db, stock.id, { limit: 750 });
    if (!candles.length) throw new AppError('INSUFFICIENT_DATA', 'No price history for this stock.');
    const signal = strategy.generateSignal(candles, { symbol: stock.symbol, parameters });
    return ok({ signal, parameters, snapshot: sanitizeNumbers(computeSnapshot(candles) as unknown as Record<string, number>), strategy: describeStrategy(strategy), disclaimer: DISCLAIMER });
  });

  r.post('/custom', {
    onRequest: [app.authenticate],
    schema: { tags, summary: 'Create a custom rule-based strategy (structured JSON DSL — no code execution)', body: CustomStrategyDefinitionSchema, security: [{ bearerAuth: [] }] },
  }, async (req, reply) => {
    const id = `custom_${randomUUID().slice(0, 8)}`;
    const row = await db.strategy.create({
      data: { id, name: req.body.name, description: req.body.description ?? 'User-defined rule-based strategy', category: 'custom', isBuiltin: false, ownerId: req.user.sub, definition: req.body as unknown as Prisma.InputJsonValue },
    });
    await audit(db, 'strategy.create', { userId: req.user.sub, entity: 'strategy', entityId: id });
    reply.status(201);
    return ok(row);
  });

  r.delete('/custom/:id', { onRequest: [app.authenticate], schema: { tags, summary: 'Delete one of your custom strategies', params: IdParams, security: [{ bearerAuth: [] }] } }, async (req) => {
    const row = await db.strategy.findUnique({ where: { id: req.params.id } });
    if (!row || row.isBuiltin || row.ownerId !== req.user.sub) throw new AppError('NOT_FOUND', 'Custom strategy not found');
    await db.strategy.delete({ where: { id: row.id } });
    return ok({ deleted: true });
  });
}
