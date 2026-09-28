import { clamp, round, type Direction, type OHLCV, type ParameterDefinition, type SignalReason, type SignalType, type StrategyContext, type TradingSignal } from '@nepse/shared';

export function resolveParams(defs: ParameterDefinition[], overrides?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    let v = overrides?.[d.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) v = d.default;
    if (d.min !== undefined) v = Math.max(d.min, v);
    if (d.max !== undefined) v = Math.min(d.max, v);
    out[d.key] = v;
  }
  return out;
}

export function reason(indicator: string, condition: string, value: number, direction: Direction, threshold?: number): SignalReason {
  const r: SignalReason = { indicator, condition, value: Number.isFinite(value) ? round(value, 4) : NaN, direction };
  if (threshold !== undefined) r.threshold = threshold;
  return r;
}

export function buildSignal(
  strategyId: string,
  candles: OHLCV[],
  ctx: StrategyContext,
  signal: SignalType,
  strength: number,
  reasons: SignalReason[],
  indicators: Record<string, number>,
  meta?: Record<string, unknown>,
): TradingSignal {
  const lastC = candles[candles.length - 1];
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(indicators)) if (Number.isFinite(v)) cleaned[k] = round(v, 4);
  return {
    symbol: ctx.symbol,
    timestamp: lastC?.date ?? new Date(0),
    signal,
    strength: Math.round(clamp(Number.isFinite(strength) ? strength : 0, 0, 100)),
    strategyId,
    price: lastC?.close ?? NaN,
    reasons,
    indicators: cleaned,
    marketRegime: ctx.marketRegime,
    ...(meta ? { meta } : {}),
  };
}

export function insufficientData(strategyId: string, candles: OHLCV[], ctx: StrategyContext, needed: number): TradingSignal {
  return buildSignal(strategyId, candles, ctx, 'HOLD', 0, [
    reason('DATA', `Insufficient history: ${candles.length} of ${needed} candles required`, candles.length, 'NEUTRAL', needed),
  ], {}, { insufficientData: true });
}

/** Did series a cross above b between the previous and the current bar? */
export function crossedAbove(a: number[], b: number[], i = a.length - 1): boolean {
  return i > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i];
}

export function crossedBelow(a: number[], b: number[], i = a.length - 1): boolean {
  return i > 0 && a[i - 1] >= b[i - 1] && a[i] < b[i];
}

/** Bars since the most recent cross (above or below) within `lookback`, or -1. */
export function recentCross(a: number[], b: number[], lookback: number, dir: 'above' | 'below'): number {
  const n = a.length;
  for (let k = 0; k < lookback && n - 1 - k > 0; k++) {
    const i = n - 1 - k;
    if (dir === 'above' ? crossedAbove(a, b, i) : crossedBelow(a, b, i)) return k;
  }
  return -1;
}

export const at = (s: number[], back = 0) => s[s.length - 1 - back];
