import { findStockBySymbol, loadCandles } from '@nepse/database';
import { computeSnapshot, fibonacciRetracement, pivotPoints, sanitizeNumbers } from '@nepse/indicators';
import { formatNpt } from '@nepse/shared';
import type { AppDeps } from '../../lib/context';
import { loadBacktest } from '../backtests/backtests.routes';
import { MarketService } from '../market/market.service';
import { SignalsService } from '../signals/signals.service';

/** Structured, verifiable facts the AI is allowed to use. Nothing else. */
export interface StockContext {
  kind: 'stock';
  symbol: string;
  companyName: string;
  sector: string | null;
  dataSource: string;
  isDemo: boolean;
  dataTimestamp: string;
  observed: Record<string, number | null>;
  indicators: Record<string, number | null>;
  previousIndicators: Record<string, number | null>;
  levels: { support20: number | null; resistance20: number | null; pivots: Record<string, number> | null; fibonacci: Record<string, number> | null; high52w: number | null; low52w: number | null };
  marketRegime: string | null;
  stockRegime: string | null;
  strategySignals: { strategy: string; signal: string; strength: number; reasons: { direction: string; condition: string }[] }[];
  consensus: { bullish: number; neutral: number; bearish: number };
  ensemble: { signal: string; strength: number; primaryReasons: string[]; conflictingFactors: string[] } | null;
  historicalStats: { strategy: string; signals: number; avgReturn5d: number | null; avgReturn20d: number | null; winRatePct: number | null }[] | null;
}

export interface BacktestContext {
  kind: 'backtest';
  id: string;
  symbol: string;
  strategy: string;
  period: { from: string | null; to: string | null };
  metrics: Record<string, unknown> | null;
  tradeCount: number;
  exitReasons: Record<string, number>;
  warnings: string[];
  dataTimestamp: string;
}

const pick = (o: Record<string, number | null>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

export async function buildStockContext(deps: AppDeps, symbol: string): Promise<StockContext> {
  const stock = await findStockBySymbol(deps.db, symbol);
  const candles = await loadCandles(deps.db, stock.id, { limit: 750 });
  const snap = sanitizeNumbers(computeSnapshot(candles) as unknown as Record<string, number>);
  const prev = candles.length > 1 ? sanitizeNumbers(computeSnapshot(candles.slice(0, -1)) as unknown as Record<string, number>) : {};
  const signals = await new SignalsService(deps).latestForStock(stock.symbol);
  const regime = await new MarketService(deps).regime().catch(() => null);
  const cachedStats = await deps.cache.get<{ strategies: { strategyId: string; signals: number; averageReturn: Record<string, number | null>; winRatePct: number | null }[] }>(
    `sigstats:${stock.symbol}:${candles[candles.length - 1]?.date.toISOString().slice(0, 10) ?? 'none'}`,
  );
  const lastC = candles[candles.length - 1];
  const fib = fibonacciRetracement(candles, 120);
  const ens = signals.overall;
  const ensMeta = (ens?.meta ?? {}) as { primaryReasons?: string[]; conflictingFactors?: string[] };
  return {
    kind: 'stock',
    symbol: stock.symbol,
    companyName: stock.company.name,
    sector: stock.company.sector?.name ?? null,
    dataSource: stock.isDemo ? 'DEMO (synthetic)' : stock.dataSource,
    isDemo: stock.isDemo,
    dataTimestamp: lastC ? `${formatNpt(lastC.date, false)} (end-of-day candle, NPT)` : 'no data',
    observed: pick(snap, ['close', 'prevClose', 'changePercent', 'volume', 'turnover', 'volumeSma20', 'volumeRatio']),
    indicators: pick(snap, ['ema20', 'ema50', 'ema200', 'sma50', 'rsi14', 'macd', 'macdSignal', 'macdHistogram', 'adx14', 'plusDI', 'minusDI', 'bbUpper', 'bbMiddle', 'bbLower', 'atr14', 'atrPercent', 'hv20', 'roc12', 'mfi14', 'cmf20']),
    previousIndicators: pick(prev, ['close', 'ema20', 'ema50', 'rsi14', 'macd', 'macdSignal', 'adx14', 'volumeRatio']),
    levels: {
      support20: snap.support20, resistance20: snap.resistance20,
      pivots: candles.length > 1 ? (pivotPoints(candles[candles.length - 2]) as unknown as Record<string, number>) : null,
      fibonacci: fib ? fib.levels : null, high52w: snap.high52w, low52w: snap.low52w,
    },
    marketRegime: regime?.regime ?? null,
    stockRegime: ens?.marketRegime ?? null,
    strategySignals: signals.strategies.filter((s) => s.strategyId !== 'ensemble').map((s) => ({ strategy: s.strategyName, signal: s.signal, strength: s.strength, reasons: s.reasons.slice(0, 4).map((r) => ({ direction: r.direction, condition: r.condition })) })),
    consensus: { bullish: signals.agreement?.bullish ?? 0, neutral: signals.agreement?.neutral ?? 0, bearish: signals.agreement?.bearish ?? 0 },
    ensemble: ens ? { signal: ens.signal, strength: ens.strength, primaryReasons: ensMeta.primaryReasons ?? [], conflictingFactors: ensMeta.conflictingFactors ?? [] } : null,
    historicalStats: cachedStats
      ? cachedStats.strategies.map((s) => ({ strategy: s.strategyId, signals: s.signals, avgReturn5d: s.averageReturn['5'] ?? null, avgReturn20d: s.averageReturn['20'] ?? null, winRatePct: s.winRatePct }))
      : null,
  };
}

export async function buildBacktestContext(deps: AppDeps, id: string, userId: string): Promise<BacktestContext> {
  const bt = await loadBacktest(deps.db, id, userId);
  const exitReasons: Record<string, number> = {};
  bt.trades.forEach((t) => (exitReasons[t.exitReason] = (exitReasons[t.exitReason] ?? 0) + 1));
  const { id: _i, backtestId: _b, ...metrics } = (bt.metrics ?? {}) as Record<string, unknown>;
  return {
    kind: 'backtest', id: bt.id, symbol: bt.symbol, strategy: bt.strategyName,
    period: { from: bt.from?.toISOString().slice(0, 10) ?? null, to: bt.to?.toISOString().slice(0, 10) ?? null },
    metrics: bt.metrics ? metrics : null, tradeCount: bt.trades.length, exitReasons, warnings: bt.warnings as string[],
    dataTimestamp: bt.completedAt ? formatNpt(bt.completedAt) : 'not completed',
  };
}
