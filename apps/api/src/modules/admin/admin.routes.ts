import { QUEUE_NAMES, type QueueName } from '@nepse/config';
import { commitImport, previewImport, type Prisma } from '@nepse/database';
import { AppError } from '@nepse/shared';
import { defaultRegistry, DEFAULT_REGIME_CONFIG } from '@nepse/strategies';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { IdParams, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { enqueue } from '../../lib/queues';

/** Imports larger than this are committed by the csv-import worker. */
export const SYNC_IMPORT_LIMIT = 5000;

const FeeBody = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['BROKER_COMMISSION', 'SEBON_FEE', 'DP_CHARGE', 'CAPITAL_GAINS_TAX', 'OTHER']),
  rate: z.number().min(0).max(1).default(0),
  fixedAmount: z.number().min(0).default(0),
  appliesTo: z.enum(['BUY', 'SELL', 'BOTH']),
  tiers: z.array(z.object({ upTo: z.number().positive().nullable(), rate: z.number().min(0).max(1) })).nullable().optional(),
  minAmount: z.number().min(0).nullable().optional(),
  holdingDaysMin: z.number().int().min(0).nullable().optional(),
  holdingDaysMax: z.number().int().min(0).nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isVerified: z.boolean().default(false),
  sourceNote: z.string().max(500).optional(),
});

export default async function adminRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, queues, redis, cache } = app.deps;
  const tags = ['admin'];
  const admin = { onRequest: [app.requireAdmin] };
  const security = [{ bearerAuth: [] }];

  // ── Data import ─────────────────────────────────────────────
  r.post('/imports', {
    ...admin,
    bodyLimit: 50 * 1024 * 1024,
    schema: { tags, summary: 'Upload CSV and get a validated preview (nothing is written yet)', body: z.object({ filename: z.string().min(1).max(200), csv: z.string().min(1), createStocks: z.boolean().default(false) }), security },
  }, async (req, reply) => {
    const p = await previewImport(db, req.body.csv, { createStocks: req.body.createStocks });
    const imp = await db.marketDataImport.create({
      data: {
        userId: req.user.sub, filename: req.body.filename, status: 'PREVIEW', totalRows: p.totalRows, validRows: p.rows.length, errorRows: p.errors.length,
        errors: p.errors.slice(0, 1000) as unknown as Prisma.InputJsonValue, warnings: p.warnings.slice(0, 1000) as unknown as Prisma.InputJsonValue,
        payload: req.body.csv, createStocks: req.body.createStocks,
      },
    });
    await audit(db, 'import.preview', { userId: req.user.sub, entity: 'import', entityId: imp.id, metadata: { filename: req.body.filename, rows: p.totalRows } });
    reply.status(201);
    return ok({
      id: imp.id, status: imp.status, filename: imp.filename, totalRows: p.totalRows, validRows: p.rows.length, errorRows: p.errors.length,
      symbols: p.symbols, newSymbols: p.newSymbols, dateRange: p.dateRange, errors: p.errors.slice(0, 200), warnings: p.warnings.slice(0, 200),
      preview: p.rows.slice(0, 50).map(({ rowNumber, ...rest }) => ({ row: rowNumber, ...rest })),
      willRunInBackground: p.rows.length > SYNC_IMPORT_LIMIT,
    });
  });

  r.post('/imports/:id/commit', { ...admin, schema: { tags, summary: 'Commit a previewed import (background job for large files)', params: IdParams, security } }, async (req, reply) => {
    const imp = await db.marketDataImport.findUnique({ where: { id: req.params.id } });
    if (!imp) throw new AppError('NOT_FOUND', 'Import not found');
    if (imp.status !== 'PREVIEW') throw new AppError('CONFLICT', `Import is already ${imp.status}`);
    if (imp.validRows === 0) throw new AppError('VALIDATION_ERROR', 'No valid rows to import');
    await audit(db, 'import.commit', { userId: req.user.sub, entity: 'import', entityId: imp.id });
    if (imp.validRows > SYNC_IMPORT_LIMIT) {
      const jobId = await enqueue(queues, QUEUE_NAMES.csvImport, 'commit-import', { importId: imp.id });
      await db.marketDataImport.update({ where: { id: imp.id }, data: { status: 'QUEUED', jobId } });
      reply.status(202);
      return ok({ id: imp.id, status: 'QUEUED', jobId });
    }
    const result = await commitImport(db, imp.id);
    await cache.invalidate('');
    await enqueue(queues, QUEUE_NAMES.signalGeneration, 'generate-all', { reason: 'import', importId: imp.id });
    return ok({ id: imp.id, status: 'COMPLETED', ...result });
  });

  r.get('/imports', { ...admin, schema: { tags, summary: 'Import history', querystring: PaginationQuery, security } }, async (req) => {
    const [total, rows] = await Promise.all([
      db.marketDataImport.count(),
      db.marketDataImport.findMany({ orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize, omit: { payload: true } }),
    ]);
    return ok(rows, pageMeta(req.query.page, req.query.pageSize, total));
  });

  r.get('/imports/:id', { ...admin, schema: { tags, summary: 'Import status', params: IdParams, security } }, async (req) => {
    const imp = await db.marketDataImport.findUnique({ where: { id: req.params.id }, omit: { payload: true } });
    if (!imp) throw new AppError('NOT_FOUND', 'Import not found');
    return ok(imp);
  });

  // ── Stocks & sectors ─────────────────────────────────────────
  const StockBody = z.object({
    symbol: z.string().regex(/^[A-Za-z0-9]{1,20}$/), companyName: z.string().min(1).max(200), sector: z.string().max(100).nullable().optional(),
    subSector: z.string().max(100).nullable().optional(), listedDate: z.coerce.date().nullable().optional(), sharesOutstanding: z.number().positive().nullable().optional(),
    paidUpCapital: z.number().positive().nullable().optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'DELISTED']).default('ACTIVE'),
  });
  const sectorId = async (name?: string | null) => (name ? (await db.sector.upsert({ where: { name }, create: { name }, update: {} })).id : null);

  r.post('/stocks', { ...admin, schema: { tags, summary: 'Create a stock', body: StockBody, security } }, async (req, reply) => {
    const symbol = req.body.symbol.toUpperCase();
    if (await db.stock.findUnique({ where: { symbol } })) throw new AppError('CONFLICT', 'Symbol already exists');
    const company = await db.company.create({
      data: { name: req.body.companyName, sectorId: await sectorId(req.body.sector), subSector: req.body.subSector, listedDate: req.body.listedDate, sharesOutstanding: req.body.sharesOutstanding, paidUpCapital: req.body.paidUpCapital },
    });
    const stock = await db.stock.create({ data: { symbol, companyId: company.id, status: req.body.status } });
    await audit(db, 'stock.create', { userId: req.user.sub, entity: 'stock', entityId: stock.id });
    reply.status(201);
    return ok(stock);
  });

  r.patch('/stocks/:symbol', { ...admin, schema: { tags, summary: 'Update a stock', params: z.object({ symbol: z.string().max(20) }), body: StockBody.partial().omit({ symbol: true }).extend({ delistedDate: z.coerce.date().nullable().optional() }), security } }, async (req) => {
    const stock = await db.stock.findUnique({ where: { symbol: req.params.symbol.toUpperCase() } });
    if (!stock) throw new AppError('INVALID_SYMBOL', 'The requested stock symbol was not found.');
    const b = req.body;
    await db.company.update({
      where: { id: stock.companyId },
      data: {
        ...(b.companyName ? { name: b.companyName } : {}), ...(b.sector !== undefined ? { sectorId: await sectorId(b.sector) } : {}),
        ...(b.subSector !== undefined ? { subSector: b.subSector } : {}), ...(b.listedDate !== undefined ? { listedDate: b.listedDate } : {}),
        ...(b.sharesOutstanding !== undefined ? { sharesOutstanding: b.sharesOutstanding } : {}), ...(b.paidUpCapital !== undefined ? { paidUpCapital: b.paidUpCapital } : {}),
      },
    });
    const updated = await db.stock.update({ where: { id: stock.id }, data: { ...(b.status ? { status: b.status } : {}), ...(b.delistedDate !== undefined ? { delistedDate: b.delistedDate } : {}) } });
    await audit(db, 'stock.update', { userId: req.user.sub, entity: 'stock', entityId: stock.id, metadata: b as Record<string, unknown> });
    return ok(updated);
  });

  r.get('/sectors', { ...admin, schema: { tags, summary: 'Sectors', security } }, async () => ok(await db.sector.findMany({ include: { _count: { select: { companies: true } } }, orderBy: { name: 'asc' } })));
  r.post('/sectors', { ...admin, schema: { tags, summary: 'Create sector', body: z.object({ name: z.string().min(1).max(100), description: z.string().max(500).optional() }), security } }, async (req, reply) => {
    reply.status(201);
    return ok(await db.sector.create({ data: req.body }));
  });
  r.patch('/sectors/:id', { ...admin, schema: { tags, summary: 'Rename sector', params: z.object({ id: z.coerce.number().int() }), body: z.object({ name: z.string().min(1).max(100).optional(), description: z.string().max(500).optional() }), security } }, async (req) =>
    ok(await db.sector.update({ where: { id: req.params.id }, data: req.body })),
  );
  r.delete('/sectors/:id', { ...admin, schema: { tags, summary: 'Delete an empty sector', params: z.object({ id: z.coerce.number().int() }), security } }, async (req) => {
    if (await db.company.count({ where: { sectorId: req.params.id } })) throw new AppError('CONFLICT', 'Sector still has companies');
    await db.sector.delete({ where: { id: req.params.id } });
    return ok({ deleted: true });
  });

  // ── Jobs & sync ─────────────────────────────────────────────
  r.post('/sync', { ...admin, schema: { tags, summary: 'Run market-data synchronisation from the configured provider', body: z.object({ symbols: z.array(z.string()).optional(), days: z.number().int().min(1).max(3650).default(30) }).optional(), security } }, async (req) => {
    const jobId = await enqueue(queues, QUEUE_NAMES.marketDataSync, 'sync', { ...(req.body ?? {}), requestedBy: req.user.sub });
    return ok({ queued: true, jobId });
  });

  r.post('/signals/generate', { ...admin, schema: { tags, summary: 'Recompute indicators and signals for all stocks', security } }, async () =>
    ok({ queued: true, jobId: await enqueue(queues, QUEUE_NAMES.signalGeneration, 'generate-all', { reason: 'admin' }) }),
  );

  const QueueParam = z.enum(Object.values(QUEUE_NAMES) as [QueueName, ...QueueName[]]);
  r.get('/jobs', { ...admin, schema: { tags, summary: 'Queue overview and recent job runs', security } }, async () => {
    const counts = await Promise.all(Object.values(QUEUE_NAMES).map(async (q) => ({ queue: q, counts: await queues[q].getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed') })));
    const recent = await db.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
    return ok({ queues: counts, recent });
  });

  r.get('/jobs/failed', { ...admin, schema: { tags, summary: 'Failed jobs', querystring: z.object({ queue: QueueParam.optional() }), security } }, async (req) => {
    const names = req.query.queue ? [req.query.queue] : Object.values(QUEUE_NAMES);
    const out = [];
    for (const q of names) {
      for (const j of await queues[q].getFailed(0, 50)) out.push({ queue: q, id: j.id, name: j.name, data: j.data, failedReason: j.failedReason, attemptsMade: j.attemptsMade, timestamp: j.timestamp, finishedOn: j.finishedOn });
    }
    return ok(out);
  });

  r.post('/jobs/:queue/:id/retry', { ...admin, schema: { tags, summary: 'Retry a failed job', params: z.object({ queue: QueueParam, id: z.string() }), security } }, async (req) => {
    const job = await queues[req.params.queue].getJob(req.params.id);
    if (!job) throw new AppError('NOT_FOUND', 'Job not found');
    await job.retry();
    await audit(db, 'job.retry', { userId: req.user.sub, entity: 'job', entityId: `${req.params.queue}:${req.params.id}` });
    return ok({ retried: true });
  });

  // ── Strategy parameters ─────────────────────────────────────
  r.put('/strategies/:id/parameters', { ...admin, schema: { tags, summary: 'Set default parameters for a built-in strategy', params: IdParams, body: z.record(z.string(), z.number()), security } }, async (req) => {
    const s = defaultRegistry.get(req.params.id);
    if (!s) throw new AppError('NOT_FOUND', 'Built-in strategy not found');
    const keys = new Set(s.parameters.map((p) => p.key));
    const bad = Object.keys(req.body).filter((k) => !keys.has(k));
    if (bad.length) throw new AppError('VALIDATION_ERROR', `Unknown parameter(s): ${bad.join(', ')}`);
    for (const [key, value] of Object.entries(req.body)) {
      const def = s.parameters.find((p) => p.key === key)!;
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) throw new AppError('VALIDATION_ERROR', `${key} must be within [${def.min}, ${def.max}]`);
      await db.strategyParameter.upsert({ where: { strategyId_key: { strategyId: s.id, key } }, create: { strategyId: s.id, key, value }, update: { value } });
    }
    await audit(db, 'strategy.parameters', { userId: req.user.sub, entity: 'strategy', entityId: s.id, metadata: req.body });
    return ok(await db.strategyParameter.findMany({ where: { strategyId: s.id } }));
  });

  r.patch('/strategies/:id', { ...admin, schema: { tags, summary: 'Enable/disable a strategy', params: IdParams, body: z.object({ isActive: z.boolean() }), security } }, async (req) =>
    ok(await db.strategy.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } })),
  );

  // ── Fee schedules ───────────────────────────────────────────
  r.get('/fees', { schema: { tags, summary: 'Fee schedules (public read)' } }, async () => ok(await db.feeSchedule.findMany({ orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }] })));
  r.post('/fees', { ...admin, schema: { tags, summary: 'Create fee schedule', body: FeeBody, security } }, async (req, reply) => {
    const row = await db.feeSchedule.create({ data: { ...req.body, tiers: (req.body.tiers ?? undefined) as Prisma.InputJsonValue | undefined } });
    await audit(db, 'fee.create', { userId: req.user.sub, entity: 'fee_schedule', entityId: row.id });
    reply.status(201);
    return ok(row);
  });
  r.patch('/fees/:id', { ...admin, schema: { tags, summary: 'Update fee schedule', params: IdParams, body: FeeBody.partial(), security } }, async (req) => {
    const { tiers, ...rest } = req.body;
    const row = await db.feeSchedule.update({ where: { id: req.params.id }, data: { ...rest, ...(tiers !== undefined ? { tiers: (tiers ?? undefined) as Prisma.InputJsonValue | undefined } : {}) } });
    await audit(db, 'fee.update', { userId: req.user.sub, entity: 'fee_schedule', entityId: row.id });
    return ok(row);
  });
  r.delete('/fees/:id', { ...admin, schema: { tags, summary: 'Delete fee schedule', params: IdParams, security } }, async (req) => {
    await db.feeSchedule.delete({ where: { id: req.params.id } });
    await audit(db, 'fee.delete', { userId: req.user.sub, entity: 'fee_schedule', entityId: req.params.id });
    return ok({ deleted: true });
  });

  // ── Calendar & settings ─────────────────────────────────────
  r.get('/calendar', { ...admin, schema: { tags, summary: 'Market calendar configuration', security } }, async () => {
    const s = await db.appSetting.findUnique({ where: { key: 'market.calendar' } });
    return ok({ config: s?.value ?? null, holidays: await db.marketHoliday.findMany({ orderBy: { date: 'asc' } }) });
  });
  r.put('/calendar', {
    ...admin,
    schema: { tags, summary: 'Update trading weekdays and holidays', body: z.object({ tradingWeekdays: z.array(z.number().int().min(1).max(7)).min(1), holidays: z.array(z.object({ date: z.coerce.date(), description: z.string().max(200), isSpecialSession: z.boolean().default(false) })).default([]) }), security },
  }, async (req) => {
    await db.appSetting.upsert({ where: { key: 'market.calendar' }, create: { key: 'market.calendar', value: { tradingWeekdays: req.body.tradingWeekdays, holidays: [] } }, update: { value: { tradingWeekdays: req.body.tradingWeekdays, holidays: [] } } });
    await db.$transaction([db.marketHoliday.deleteMany(), db.marketHoliday.createMany({ data: req.body.holidays })]);
    return ok({ updated: true });
  });
  r.get('/settings/regime', { ...admin, schema: { tags, summary: 'Regime methodology', security } }, async () =>
    ok((await db.appSetting.findUnique({ where: { key: 'market.regime' } }))?.value ?? DEFAULT_REGIME_CONFIG),
  );
  r.put('/settings/regime', {
    ...admin,
    schema: { tags, summary: 'Configure regime methodology', body: z.object({ fastPeriod: z.number().int().min(5).max(200), slowPeriod: z.number().int().min(20).max(400), adxPeriod: z.number().int().min(5).max(50), strongAdx: z.number().min(5).max(80), trendAdx: z.number().min(5).max(80), highVolatility: z.number().min(5).max(200), breadthBullish: z.number().min(0).max(1), breadthBearish: z.number().min(0).max(1) }).partial(), security },
  }, async (req) => {
    const cur = ((await db.appSetting.findUnique({ where: { key: 'market.regime' } }))?.value ?? DEFAULT_REGIME_CONFIG) as object;
    const value = { ...cur, ...req.body };
    await db.appSetting.upsert({ where: { key: 'market.regime' }, create: { key: 'market.regime', value }, update: { value } });
    return ok(value);
  });

  // ── Health & audit ──────────────────────────────────────────
  r.get('/health', { ...admin, schema: { tags, summary: 'System health overview', security } }, async () => {
    const t0 = Date.now();
    const dbOk = await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const dbMs = Date.now() - t0;
    const t1 = Date.now();
    const redisOk = await redis.ping().then((p) => p === 'PONG').catch(() => false);
    const [stocks, prices, signals, users, lastPrice, failedJobs] = await Promise.all([
      db.stock.count(), db.dailyPrice.count(), db.signal.count(), db.user.count(), db.dailyPrice.aggregate({ _max: { date: true } }),
      db.jobRun.count({ where: { status: 'FAILED', startedAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);
    return ok({
      database: { ok: dbOk, latencyMs: dbMs }, redis: { ok: redisOk, latencyMs: Date.now() - t1 },
      counts: { stocks, prices, signals, users }, latestPriceDate: lastPrice._max.date, failedJobs24h: failedJobs,
      process: { uptimeSeconds: Math.round(process.uptime()), rssMb: Math.round(process.memoryUsage().rss / 1048576), node: process.version },
    });
  });

  r.get('/audit', { ...admin, schema: { tags, summary: 'Audit log', querystring: PaginationQuery.extend({ action: z.string().max(100).optional() }), security } }, async (req) => {
    const where = req.query.action ? { action: req.query.action } : {};
    const [total, rows] = await Promise.all([db.auditLog.count({ where }), db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize })]);
    return ok(rows, pageMeta(req.query.page, req.query.pageSize, total));
  });

  r.get('/users', { ...admin, schema: { tags, summary: 'Users', querystring: PaginationQuery, security } }, async (req) => {
    const [total, rows] = await Promise.all([
      db.user.count(),
      db.user.findMany({ include: { role: true }, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize }),
    ]);
    return ok(rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role.name, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })), pageMeta(req.query.page, req.query.pageSize, total));
  });
}
