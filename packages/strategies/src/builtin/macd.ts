import { macd } from '@nepse/indicators';
import { at, buildSignal, crossedAbove, crossedBelow, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'fast', label: 'Fast EMA', default: 12, min: 2, max: 100 },
  { key: 'slow', label: 'Slow EMA', default: 26, min: 3, max: 200 },
  { key: 'signal', label: 'Signal EMA', default: 9, min: 2, max: 50 },
];

export const macdStrategy: TradingStrategy = {
  id: 'macd',
  name: 'MACD Crossover',
  description: 'Detects bullish/bearish MACD-signal crossovers and histogram momentum.',
  category: 'trend',
  parameters: PARAMS,
  indicatorsUsed: ['MACD'],
  assumptions: ['Crossovers of the MACD line and its signal reflect shifts in momentum.'],
  limitations: ['Lagging indicator; prone to false signals in choppy markets.'],
  minCandles: (p) => p.slow + p.signal + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const m = macd(closes, p.fast, p.slow, p.signal);
    const h = at(m.histogram);
    const hPrev = at(m.histogram, 1);
    const rising = h > hPrev;
    const norm = Math.abs(h) / at(closes) * 1000;
    const indicators = { macd: at(m.macd), signal: at(m.signal), histogram: h };
    const histReason = reason('MACD', `Histogram ${rising ? 'rising' : 'falling'} (${h >= 0 ? 'positive' : 'negative'})`, h, rising ? 'BULLISH' : 'BEARISH');
    const zeroReason = reason('MACD', `MACD line ${at(m.macd) >= 0 ? 'above' : 'below'} zero`, at(m.macd), at(m.macd) >= 0 ? 'BULLISH' : 'BEARISH', 0);

    if (crossedAbove(m.macd, m.signal)) {
      return buildSignal(this.id, candles, ctx, 'BUY', 60 + Math.min(20, norm * 5) + (at(m.macd) < 0 ? 5 : 10), [
        reason('MACD', 'MACD crossed above signal line (bullish crossover)', at(m.macd), 'BULLISH', at(m.signal)),
        zeroReason,
      ], indicators);
    }
    if (crossedBelow(m.macd, m.signal)) {
      return buildSignal(this.id, candles, ctx, 'SELL', 60 + Math.min(20, norm * 5) + (at(m.macd) > 0 ? 5 : 10), [
        reason('MACD', 'MACD crossed below signal line (bearish crossover)', at(m.macd), 'BEARISH', at(m.signal)),
        zeroReason,
      ], indicators);
    }
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.min(40, 10 + norm * 5), [
      reason('MACD', `No crossover; MACD ${at(m.macd) > at(m.signal) ? 'above' : 'below'} signal line`, at(m.macd), at(m.macd) > at(m.signal) ? 'BULLISH' : 'BEARISH', at(m.signal)),
      histReason,
      zeroReason,
    ], indicators);
  },
};
