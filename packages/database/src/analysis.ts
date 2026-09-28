import type { Prisma, PrismaClient, Stock } from '@prisma/client';
import { computeSnapshot, sanitizeNumbers, type IndicatorSnapshot } from '@nepse/indicators';
import type { MarketRegime, TradingSignal } from '@nepse/shared';
import { defaultRegistry, detectRegime, type RegimeConfig, type RegimeResult } from '@nepse/strategies';
import { loadCandles } from './candles';
import { saveSignal } from './signals';

/** Bars loaded for analysis: enough for EMA200 to converge without loading full history. */
export const ANALYSIS_LOOKBACK = 750;

export interface StockAnalysis {
  stockId: string;
  symbol: string;
  date: Date | null;
  snapshot: Record<string, number | null>;
  regime: RegimeResult;
  signals: TradingSignal[];
}

export async function getRegimeConfig(db: PrismaClient): Promise<Partial<RegimeConfig>> {
  const s = await db.appSetting.findUnique({ where: { key: 'market.regime' } });
  return (s?.value as Partial<RegimeConfig>) ?? {};
}

/** Admin parameter overrides for built-in strategies. */
export async function getStrategyOverrides(db: PrismaClient): Promise<Map<string, Record<string, number>>> {
  const rows = await db.strategyParameter.findMany();
  const m = new Map<string, Record<string, number>>();
  for (const r of rows) m.set(r.strategyId, { ...(m.get(r.strategyId) ?? {}), [r.key]: r.value });
  return m;
}

/**
 * Computes the indicator snapshot, market regime and all active built-in strategy signals for a
 * stock's latest candle. Optionally persists the snapshot and every signal (signal history).
 */
export async function analyzeStock(
  db: PrismaClient,
  stock: Pick<Stock, 'id' | 'symbol'>,
  opts: { persist?: boolean; strategyIds?: string[]; regimeConfig?: Partial<RegimeConfig>; overrides?: Map<string, Record<string, number>> } = {},
): Promise<StockAnalysis> {
  const candles = await loadCandles(db, stock.id, { limit: ANALYSIS_LOOKBACK });
  const lastC = candles[candles.length - 1];
  if (!lastC) return { stockId: stock.id, symbol: stock.symbol, date: null, snapshot: {}, regime: { regime: 'SIDEWAYS', evidence: [] }, signals: [] };
  const snap = sanitizeNumbers(computeSnapshot(candles) as unknown as Record<string, number>);
  const regime = detectRegime(candles, opts.regimeConfig ?? (await getRegimeConfig(db)));
  const active = new Set((await db.strategy.findMany({ where: { isActive: true, isBuiltin: true }, select: { id: true } })).map((s) => s.id));
  const overrides = opts.overrides ?? (await getStrategyOverrides(db));
  const strategies = defaultRegistry.list().filter((s) => (active.size === 0 || active.has(s.id)) && (!opts.strategyIds || opts.strategyIds.includes(s.id)));
  const signals = strategies.map((s) => s.generateSignal(candles, { symbol: stock.symbol, parameters: overrides.get(s.id), marketRegime: regime.regime as MarketRegime }));

  if (opts.persist) {
    await db.technicalIndicator.upsert({
      where: { stockId_date: { stockId: stock.id, date: lastC.date } },
      create: { stockId: stock.id, date: lastC.date, values: { ...snap, regime: regime.regime } as Prisma.InputJsonValue },
      update: { values: { ...snap, regime: regime.regime } as Prisma.InputJsonValue, computedAt: new Date() },
    });
    for (const s of signals) {
      if (s.meta?.insufficientData) continue;
      await saveSignal(db, stock.id, s, snap, overrides.get(s.strategyId));
    }
  }
  return { stockId: stock.id, symbol: stock.symbol, date: lastC.date, snapshot: snap, regime, signals };
}

export type SnapshotValues = Partial<Record<keyof IndicatorSnapshot, number | null>> & { regime?: MarketRegime };

/** Latest stored snapshot per stock (for screener/watchlists/trending without recomputation). */
export async function latestSnapshots(db: PrismaClient): Promise<Map<string, { date: Date; values: SnapshotValues }>> {
  const rows = await db.$queryRaw<{ stock_id: string; date: Date; values: SnapshotValues }[]>`
    SELECT DISTINCT ON (stock_id) stock_id, date, values FROM technical_indicators ORDER BY stock_id, date DESC`;
  return new Map(rows.map((r) => [r.stock_id, { date: r.date, values: r.values }]));
}
