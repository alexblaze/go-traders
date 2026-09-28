import { ema, rsi } from '@nepse/indicators';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'period', label: 'RSI period', default: 14, min: 2, max: 100 },
  { key: 'oversold', label: 'Oversold threshold', default: 30, min: 1, max: 50 },
  { key: 'overbought', label: 'Overbought threshold', default: 70, min: 50, max: 99 },
  { key: 'trendPeriod', label: 'Trend filter EMA', default: 50, min: 5, max: 400, description: 'Signals against this EMA trend get reduced strength.' },
];

export const rsiStrategy: TradingStrategy = {
  id: 'rsi',
  name: 'RSI Overbought/Oversold',
  description: 'BUY candidate when RSI is at/below the oversold level, SELL candidate at/above overbought. A trend filter reduces strength of counter-trend signals.',
  category: 'momentum',
  parameters: PARAMS,
  indicatorsUsed: ['RSI', 'EMA'],
  assumptions: ['Extreme RSI readings tend to revert in range-bound conditions.'],
  limitations: ['RSI alone is not definitive — it can stay overbought/oversold for long periods in strong trends.'],
  minCandles: (p) => Math.max(p.period + 2, p.trendPeriod),
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const r = rsi(closes, p.period);
    const cur = at(r);
    const prev = at(r, 1);
    const trend = at(ema(closes, p.trendPeriod));
    const price = at(closes);
    const uptrend = price > trend;
    const indicators = { rsi: cur, [`ema${p.trendPeriod}`]: trend };
    const trendReason = reason('EMA', `Price ${uptrend ? 'above' : 'below'} EMA${p.trendPeriod} (trend context)`, price, uptrend ? 'BULLISH' : 'BEARISH', trend);

    if (cur <= p.oversold) {
      const depth = (p.oversold - cur) / p.oversold;
      const strength = 50 + depth * 60 + (cur > prev ? 10 : 0) - (uptrend ? 0 : 15);
      return buildSignal(this.id, candles, ctx, 'BUY', strength, [
        reason('RSI', `RSI(${p.period}) at or below oversold`, cur, 'BULLISH', p.oversold),
        ...(cur > prev ? [reason('RSI', 'RSI turning up', cur - prev, 'BULLISH')] : []),
        trendReason,
      ], indicators);
    }
    if (cur >= p.overbought) {
      const depth = (cur - p.overbought) / (100 - p.overbought);
      const strength = 50 + depth * 60 + (cur < prev ? 10 : 0) - (uptrend ? 15 : 0);
      return buildSignal(this.id, candles, ctx, 'SELL', strength, [
        reason('RSI', `RSI(${p.period}) at or above overbought`, cur, 'BEARISH', p.overbought),
        ...(cur < prev ? [reason('RSI', 'RSI turning down', cur - prev, 'BEARISH')] : []),
        trendReason,
      ], indicators);
    }
    const dir = cur > 55 ? 'BULLISH' : cur < 45 ? 'BEARISH' : 'NEUTRAL';
    return buildSignal(this.id, candles, ctx, 'HOLD', 10 + Math.abs(cur - 50) / 2, [
      reason('RSI', `RSI(${p.period}) inside neutral zone (${p.oversold}–${p.overbought})`, cur, dir),
      trendReason,
    ], indicators);
  },
};
