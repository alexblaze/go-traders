import { adx, atr, bollinger, rsi, rollingStdev, sma } from '@nepse/indicators';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'period', label: 'Lookback period', default: 20, min: 5, max: 200 },
  { key: 'zThreshold', label: 'Z-score threshold', default: 2, min: 0.5, max: 4, step: 0.1 },
  { key: 'rsiPeriod', label: 'RSI period', default: 14, min: 2, max: 50 },
  { key: 'rsiLow', label: 'RSI low', default: 35, min: 5, max: 50 },
  { key: 'rsiHigh', label: 'RSI high', default: 65, min: 50, max: 95 },
  { key: 'atrStopMultiple', label: 'ATR stop multiple', default: 2, min: 0.5, max: 6, step: 0.5 },
  { key: 'maxAdx', label: 'Max ADX (trend filter)', default: 30, min: 10, max: 80 },
];

export const meanReversion: TradingStrategy = {
  id: 'mean_reversion',
  name: 'Mean Reversion',
  description: 'Flags statistically unusual deviations from recent behaviour: close z-score beyond ±threshold with RSI confirmation and Bollinger context. Suggests an ATR-based stop.',
  category: 'mean-reversion',
  parameters: PARAMS,
  indicatorsUsed: ['SMA', 'Std Dev (z-score)', 'Bollinger Bands', 'RSI', 'ATR', 'ADX'],
  assumptions: ['Prices oscillate around a recent mean and extreme deviations tend to partially revert.'],
  limitations: [
    'Mean-reversion assumptions may fail during strong trends — oversold can become more oversold.',
    'Signals against a strong ADX trend are down-weighted but still risky.',
  ],
  minCandles: (p) => Math.max(p.period, p.rsiPeriod, 28) + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const price = at(closes);
    const mean = at(sma(closes, p.period));
    const sd = at(rollingStdev(closes, p.period));
    const z = sd === 0 ? 0 : (price - mean) / sd;
    const r = at(rsi(closes, p.rsiPeriod));
    const bb = bollinger(closes, p.period, p.zThreshold);
    const a = at(atr(candles, 14));
    const trendAdx = at(adx(candles, 14).adx);
    const trending = trendAdx > p.maxAdx;
    const indicators = { zScore: z, mean, rsi: r, atr: a, adx: trendAdx, bbLower: at(bb.lower), bbUpper: at(bb.upper) };
    const adxReason = reason('ADX', trending ? `Strong trend (ADX > ${p.maxAdx}) — reversion is riskier` : 'No strong trend; reversion conditions more typical', trendAdx, trending ? 'BEARISH' : 'NEUTRAL', p.maxAdx);

    if (z <= -p.zThreshold && r <= p.rsiLow) {
      return buildSignal(this.id, candles, ctx, 'BUY', 50 + Math.min(30, (-z - p.zThreshold) * 20 + (p.rsiLow - r)) - (trending ? 25 : 0), [
        reason('Z-score', `Close ${(-z).toFixed(2)} std devs below ${p.period}-day mean`, z, 'BULLISH', -p.zThreshold),
        reason('RSI', `RSI at/below ${p.rsiLow}`, r, 'BULLISH', p.rsiLow),
        adxReason,
      ], indicators, { suggestedStop: price - a * p.atrStopMultiple, target: mean });
    }
    if (z >= p.zThreshold && r >= p.rsiHigh) {
      return buildSignal(this.id, candles, ctx, 'SELL', 50 + Math.min(30, (z - p.zThreshold) * 20 + (r - p.rsiHigh)) - (trending ? 25 : 0), [
        reason('Z-score', `Close ${z.toFixed(2)} std devs above ${p.period}-day mean`, z, 'BEARISH', p.zThreshold),
        reason('RSI', `RSI at/above ${p.rsiHigh}`, r, 'BEARISH', p.rsiHigh),
        { ...adxReason, direction: trending ? 'BULLISH' : 'NEUTRAL' },
      ], indicators, { suggestedStop: price + a * p.atrStopMultiple, target: mean });
    }
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.min(40, Math.abs(z) * 15), [
      reason('Z-score', `Deviation from mean within ±${p.zThreshold} σ or not confirmed by RSI`, z, 'NEUTRAL', p.zThreshold),
      reason('RSI', 'RSI context', r, r < 50 ? 'BULLISH' : 'BEARISH'),
      adxReason,
    ], indicators);
  },
};
