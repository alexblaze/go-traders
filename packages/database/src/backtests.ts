import type { Prisma, PrismaClient } from '@prisma/client';
import { BACKTEST_WARNINGS, flatCommission, runBacktest, walkForward, type BacktestConfig } from '@nepse/backtesting';
import { AppError } from '@nepse/shared';
import { z } from 'zod';
import { loadCandles } from './candles';
import { loadFeeSchedules } from './fees';
import { resolveStrategy } from './strategies';

export const BacktestRequestSchema = z.object({
  symbol: z.string().min(1).max(20),
  strategyId: z.string().min(1).max(64),
  initialCapital: z.number().positive().max(1e12).default(1_000_000),
  /** Flat commission override (fraction). When omitted, the DB fee schedules are applied by trade date. */
  commission: z.number().min(0).max(0.1).nullable().default(null),
  slippageBps: z.number().min(0).max(1000).default(10),
  /** Fraction of equity per position (0–1]. */
  positionSize: z.number().gt(0).max(1).default(1),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  parameters: z.record(z.string(), z.number()).optional(),
  stopLossPct: z.number().min(0.1).max(90).nullable().default(null),
  takeProfitPct: z.number().min(0.1).max(1000).nullable().default(null),
  atrStopMultiple: z.number().min(0.1).max(20).nullable().default(null),
  fillMode: z.enum(['nextOpen', 'close']).default('nextOpen'),
  lotSize: z.number().int().min(1).max(1000).default(1),
  maxVolumeParticipation: z.number().gt(0).max(1).default(0.1),
  walkForward: z
    .object({ grid: z.record(z.string(), z.array(z.number()).min(1).max(10)), trainBars: z.number().int().min(60), testBars: z.number().int().min(20) })
    .optional(),
});
export type BacktestRequest = z.infer<typeof BacktestRequestSchema>;

/** Load, run and persist a queued backtest. Shared by the worker and the API's sync mode. */
export async function executeBacktest(db: PrismaClient, backtestId: string, onProgress?: (pct: number) => Promise<void> | void): Promise<void> {
  const bt = await db.backtest.findUnique({ where: { id: backtestId }, include: { stock: true } });
  if (!bt) throw new AppError('NOT_FOUND', 'Backtest not found');
  await db.backtest.update({ where: { id: bt.id }, data: { status: 'RUNNING', progress: 5 } });
  try {
    const req = BacktestRequestSchema.parse(bt.config);
    const { strategy, parameters } = await resolveStrategy(db, bt.strategyId, req.parameters, bt.userId);
    const candles = await loadCandles(db, bt.stockId, { to: req.to });
    if (candles.length < 30) throw new AppError('INSUFFICIENT_DATA', `Only ${candles.length} candles available for ${bt.stock.symbol}`);
    await onProgress?.(15);
    const feeSchedules = req.commission !== null ? flatCommission(req.commission) : await loadFeeSchedules(db);
    const config: BacktestConfig = {
      symbol: bt.stock.symbol, initialCapital: req.initialCapital, positionSize: req.positionSize, slippageBps: req.slippageBps, feeSchedules,
      fillMode: req.fillMode, lotSize: req.lotSize, maxVolumeParticipation: req.maxVolumeParticipation, stopLossPct: req.stopLossPct,
      takeProfitPct: req.takeProfitPct, atrStopMultiple: req.atrStopMultiple, strategyParameters: parameters, startDate: req.from, endDate: req.to,
    };
    const result = runBacktest(candles, strategy, config);
    await onProgress?.(70);
    const wf = req.walkForward ? walkForward(candles, strategy, { ...config, startDate: undefined }, req.walkForward) : null;
    await onProgress?.(90);
    const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
    await db.$transaction([
      db.backtestTrade.deleteMany({ where: { backtestId: bt.id } }),
      db.backtestTrade.createMany({
        data: result.trades.map((t) => ({
          backtestId: bt.id, entryDate: t.entryDate, entryPrice: t.entryPrice, exitDate: t.exitDate, exitPrice: t.exitPrice, quantity: t.quantity,
          grossPnl: t.grossPnl, fees: t.fees, netPnl: t.netPnl, returnPct: t.returnPct, holdingDays: t.holdingDays, exitReason: t.exitReason, feeLines: json(t.feeLines),
        })),
      }),
      db.backtestMetric.upsert({ where: { backtestId: bt.id }, create: { backtestId: bt.id, ...result.metrics }, update: result.metrics }),
      db.backtest.update({
        where: { id: bt.id },
        data: {
          status: 'COMPLETED', progress: 100, completedAt: new Date(), parameters: json(parameters),
          fromDate: result.period.from, toDate: result.period.to,
          equityCurve: json(result.equityCurve.map((p) => ({ date: p.date.toISOString().slice(0, 10), equity: p.equity, drawdownPct: p.drawdownPct, cash: p.cash, positionValue: p.positionValue }))),
          monthlyReturns: json(result.monthlyReturns), signalsLog: json(result.signals), warnings: json(result.warnings), walkForward: wf ? json(wf) : undefined,
          error: null,
        },
      }),
    ]);
  } catch (e) {
    await db.backtest.update({ where: { id: bt.id }, data: { status: 'FAILED', error: (e as Error).message, warnings: BACKTEST_WARNINGS as unknown as Prisma.InputJsonValue } });
    throw e;
  }
}
