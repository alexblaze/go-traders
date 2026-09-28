import { analyzeSignalOutcomes } from '@nepse/backtesting';
import { analyzeStock, getRegimeConfig, getStrategyOverrides, loadCandles, rebuildDerivedIndex, type Prisma, type PrismaClient } from '@nepse/database';
import { mean } from '@nepse/shared';
import { defaultRegistry } from '@nepse/strategies';
import type { Job } from 'bullmq';
import { logger } from '../logger';

/** Compute snapshots + signals for every active stock's latest candle (idempotent per date). */
export async function generateAll(db: PrismaClient, job: Job): Promise<{ stocks: number; signals: number }> {
  const stocks = await db.stock.findMany({ where: { status: 'ACTIVE' }, select: { id: true, symbol: true } });
  const regimeConfig = await getRegimeConfig(db);
  const overrides = await getStrategyOverrides(db);
  let signals = 0;
  for (let i = 0; i < stocks.length; i++) {
    const t = Date.now();
    const r = await analyzeStock(db, stocks[i], { persist: true, regimeConfig, overrides });
    signals += r.signals.length;
    logger.debug({ jobId: job.id, symbol: stocks[i].symbol, durationMs: Date.now() - t }, 'analysed');
    if (i % 10 === 0) await job.updateProgress(Math.round(((i + 1) / stocks.length) * 100));
  }
  await rebuildDerivedIndex(db);
  await job.updateProgress(100);
  return { stocks: stocks.length, signals };
}

/**
 * Historical signal performance per strategy across the universe (for /analytics/signals).
 * Bounded to the most recent `lookback` bars per stock to keep runtime predictable.
 */
export async function signalPerformance(db: PrismaClient, job: Job, lookback = 500) {
  const stocks = await db.stock.findMany({ where: { status: 'ACTIVE' }, select: { id: true, symbol: true } });
  const strategies = defaultRegistry.list().filter((s) => s.id !== 'ensemble');
  const agg = new Map<string, { signals: number; r5: number[]; r20: number[]; wins: number; decided: number; mae: number[] }>();
  for (let i = 0; i < stocks.length; i++) {
    const candles = await loadCandles(db, stocks[i].id, { limit: lookback });
    for (const s of strategies) {
      const out = analyzeSignalOutcomes(candles, s, stocks[i].symbol, [5, 20]);
      const a = agg.get(s.id) ?? { signals: 0, r5: [], r20: [], wins: 0, decided: 0, mae: [] };
      for (const o of out.outcomes) {
        a.signals++;
        if (o.forwardReturns[5] !== null) a.r5.push(o.forwardReturns[5]!);
        if (o.forwardReturns[20] !== null) {
          a.r20.push(o.forwardReturns[20]!);
          a.decided++;
          if (o.forwardReturns[20]! > 0) a.wins++;
        }
        if (o.maxAdversePct !== null) a.mae.push(o.maxAdversePct);
      }
      agg.set(s.id, a);
    }
    await job.updateProgress(Math.round(((i + 1) / stocks.length) * 100));
  }
  const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const value = {
    label: 'Historical observations only — past signal outcomes do not imply future performance.',
    methodology: `Signals generated bar-by-bar without look-ahead over the last ${lookback} bars per stock; consecutive duplicate signals collapsed. Returns are close-to-close and sign-adjusted (a SELL counts as correct when price fell). Excludes transaction costs.`,
    universe: stocks.length,
    strategies: strategies.map((s) => {
      const a = agg.get(s.id)!;
      return {
        strategyId: s.id, strategyName: s.name, signals: a.signals, avgReturn5d: r2(mean(a.r5)), avgReturn20d: r2(mean(a.r20)),
        winRatePct: a.decided ? r2((a.wins / a.decided) * 100) : null, maxDrawdownPct: a.mae.length ? r2(Math.min(...a.mae)) : null,
        historicalOutcome: a.decided ? `${a.wins}/${a.decided} directionally correct at 20D` : 'insufficient data',
      };
    }),
  };
  await db.appSetting.upsert({ where: { key: 'analytics.signalPerformance' }, create: { key: 'analytics.signalPerformance', value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
  return { strategies: strategies.length, stocks: stocks.length };
}
