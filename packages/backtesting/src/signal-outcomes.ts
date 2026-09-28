import { mean, type OHLCV, type SignalType } from '@nepse/shared';
import type { TradingStrategy } from '@nepse/strategies';

export interface SignalOutcome {
  date: Date;
  signal: Exclude<SignalType, 'HOLD'>;
  strength: number;
  price: number;
  /** Forward returns (%) keyed by horizon; null when not enough future data exists yet. */
  forwardReturns: Record<number, number | null>;
  /** Maximum adverse excursion (%) within the longest horizon. */
  maxAdversePct: number | null;
}

export interface SignalOutcomeSummary {
  strategyId: string;
  signals: number;
  buySignals: number;
  sellSignals: number;
  averageReturn: Record<number, number | null>;
  /** % of signals whose direction matched the forward return at the primary horizon. */
  winRatePct: number | null;
  maxDrawdownPct: number | null;
  outcomes: SignalOutcome[];
  label: string;
}

/**
 * Historical observation of what happened after each signal. For SELL signals a *negative*
 * forward price move counts as directionally correct (returns are sign-adjusted).
 */
export function analyzeSignalOutcomes(
  candles: OHLCV[],
  strategy: TradingStrategy,
  symbol: string,
  horizons: number[] = [5, 20],
  parameters?: Record<string, number>,
  dedupe = true,
): SignalOutcomeSummary {
  const outcomes: SignalOutcome[] = [];
  let lastSignal: SignalType = 'HOLD';
  const maxH = Math.max(...horizons);
  for (let i = 0; i < candles.length; i++) {
    const s = strategy.generateSignal(candles.slice(0, i + 1), { symbol, parameters });
    if (s.signal === 'HOLD') {
      lastSignal = 'HOLD';
      continue;
    }
    if (dedupe && s.signal === lastSignal) continue;
    lastSignal = s.signal;
    const px = candles[i].close;
    const dir = s.signal === 'BUY' ? 1 : -1;
    const fr: Record<number, number | null> = {};
    for (const h of horizons) fr[h] = i + h < candles.length ? dir * ((candles[i + h].close / px - 1) * 100) : null;
    let mae: number | null = null;
    if (i + 1 < candles.length) {
      const w = candles.slice(i + 1, i + 1 + maxH);
      mae = dir === 1 ? Math.min(0, ...w.map((c) => (c.low / px - 1) * 100)) : Math.min(0, ...w.map((c) => (px / c.high - 1) * 100));
    }
    outcomes.push({ date: candles[i].date, signal: s.signal, strength: s.strength, price: px, forwardReturns: fr, maxAdversePct: mae });
  }
  const primary = horizons[horizons.length - 1];
  const withPrimary = outcomes.filter((o) => o.forwardReturns[primary] !== null);
  const avg: Record<number, number | null> = {};
  for (const h of horizons) {
    const v = outcomes.map((o) => o.forwardReturns[h]).filter((x): x is number => x !== null);
    avg[h] = v.length ? Math.round(mean(v) * 100) / 100 : null;
  }
  const maes = outcomes.map((o) => o.maxAdversePct).filter((x): x is number => x !== null);
  return {
    strategyId: strategy.id,
    signals: outcomes.length,
    buySignals: outcomes.filter((o) => o.signal === 'BUY').length,
    sellSignals: outcomes.filter((o) => o.signal === 'SELL').length,
    averageReturn: avg,
    winRatePct: withPrimary.length ? Math.round((withPrimary.filter((o) => (o.forwardReturns[primary] ?? 0) > 0).length / withPrimary.length) * 10000) / 100 : null,
    maxDrawdownPct: maes.length ? Math.round(Math.min(...maes) * 100) / 100 : null,
    outcomes,
    label: 'Historical observation only — past signal outcomes do not imply future performance.',
  };
}
