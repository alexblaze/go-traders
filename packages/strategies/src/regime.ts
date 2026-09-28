import { adx, ema, historicalVolatility } from '@nepse/indicators';
import { last, type MarketRegime, type OHLCV } from '@nepse/shared';

export interface RegimeConfig {
  fastPeriod: number;
  slowPeriod: number;
  adxPeriod: number;
  strongAdx: number;
  trendAdx: number;
  /** Annualised HV (%) at or above which the regime is HIGH_VOLATILITY. */
  highVolatility: number;
  /** Optional market-breadth (advancers / (advancers + decliners)) thresholds. */
  breadthBullish: number;
  breadthBearish: number;
}

export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  fastPeriod: 50,
  slowPeriod: 200,
  adxPeriod: 14,
  strongAdx: 30,
  trendAdx: 20,
  highVolatility: 45,
  breadthBullish: 0.6,
  breadthBearish: 0.4,
};

export interface RegimeResult {
  regime: MarketRegime;
  evidence: { metric: string; value: number | null; note: string }[];
}

/**
 * Rule-based regime classifier using measurable conditions (moving averages, ADX, HV,
 * optional breadth). Slow period falls back to the available history when short.
 */
export function detectRegime(candles: OHLCV[], cfg: Partial<RegimeConfig> = {}, breadth?: number): RegimeResult {
  const c = { ...DEFAULT_REGIME_CONFIG, ...cfg };
  const closes = candles.map((x) => x.close);
  const price = closes[closes.length - 1];
  const slowP = Math.min(c.slowPeriod, Math.max(c.fastPeriod + 1, closes.length - 1));
  const fast = last(ema(closes, c.fastPeriod));
  const slow = last(ema(closes, slowP));
  const a = last(adx(candles, c.adxPeriod).adx);
  const hv = last(historicalVolatility(closes, 20));
  const evidence: RegimeResult['evidence'] = [
    { metric: `EMA${c.fastPeriod}`, value: fin(fast), note: price > fast ? 'price above' : 'price below' },
    { metric: `EMA${slowP}`, value: fin(slow), note: fast > slow ? 'fast above slow' : 'fast below slow' },
    { metric: 'ADX', value: fin(a), note: a >= c.strongAdx ? 'strong trend' : a >= c.trendAdx ? 'trending' : 'weak trend' },
    { metric: 'HV20 (annualised %)', value: fin(hv), note: hv >= c.highVolatility ? 'elevated' : 'normal' },
  ];
  if (breadth !== undefined) evidence.push({ metric: 'Breadth (adv / (adv+dec))', value: breadth, note: breadth >= c.breadthBullish ? 'broad participation' : breadth <= c.breadthBearish ? 'weak participation' : 'mixed' });

  if (!Number.isFinite(fast)) return { regime: 'SIDEWAYS', evidence: [...evidence, { metric: 'history', value: candles.length, note: 'insufficient history — defaulting to SIDEWAYS' }] };
  if (Number.isFinite(hv) && hv >= c.highVolatility) return { regime: 'HIGH_VOLATILITY', evidence };

  const up = price > fast && (!Number.isFinite(slow) || fast > slow);
  const down = price < fast && (!Number.isFinite(slow) || fast < slow);
  const breadthUp = breadth === undefined || breadth >= c.breadthBearish;
  const breadthDown = breadth === undefined || breadth <= c.breadthBullish;
  if (up && a >= c.strongAdx && breadthUp) return { regime: 'STRONG_UPTREND', evidence };
  if (down && a >= c.strongAdx && breadthDown) return { regime: 'STRONG_DOWNTREND', evidence };
  if (up && a >= c.trendAdx) return { regime: 'UPTREND', evidence };
  if (down && a >= c.trendAdx) return { regime: 'DOWNTREND', evidence };
  return { regime: 'SIDEWAYS', evidence };
}

const fin = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
