import { adx, ema, macd, volumeSma } from '@nepse/indicators';
import type { SignalReason } from '@nepse/shared';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'fast', label: 'Fast EMA', default: 20, min: 2, max: 200 },
  { key: 'slow', label: 'Slow EMA', default: 50, min: 5, max: 400 },
  { key: 'adxPeriod', label: 'ADX period', default: 14, min: 5, max: 50 },
  { key: 'adxThreshold', label: 'ADX threshold', default: 25, min: 5, max: 60 },
  { key: 'volumeMultiplier', label: 'Volume vs 20D avg', default: 1.0, min: 0, max: 5, step: 0.1 },
  { key: 'minConditions', label: 'Conditions required (of 5)', default: 4, min: 1, max: 5, step: 1 },
];

export const trendFollowing: TradingStrategy = {
  id: 'trend_following',
  name: 'Trend Following',
  description: 'Combines EMA alignment, ADX trend strength, MACD and volume. Bullish when price > slow EMA, fast EMA > slow EMA, ADX > threshold and MACD bullish.',
  category: 'trend',
  parameters: PARAMS,
  indicatorsUsed: ['EMA', 'ADX', 'MACD', 'Volume SMA'],
  assumptions: ['Established trends with strong ADX tend to persist.'],
  limitations: ['Late entries near trend exhaustion; losses at trend reversals.'],
  minCandles: (p) => Math.max(p.slow, 2 * p.adxPeriod, 35) + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const price = at(closes);
    const f = at(ema(closes, p.fast));
    const s = at(ema(closes, p.slow));
    const a = adx(candles, p.adxPeriod);
    const adxV = at(a.adx);
    const m = macd(closes);
    const macdBull = at(m.macd) > at(m.signal);
    const vAvg = at(volumeSma(candles, 20));
    const vol = candles[candles.length - 1].volume;
    const volOk = vol >= vAvg * p.volumeMultiplier;
    const strong = adxV > p.adxThreshold;

    const bull = [price > s, f > s, strong && at(a.plusDI) > at(a.minusDI), macdBull, volOk];
    const bear = [price < s, f < s, strong && at(a.minusDI) > at(a.plusDI), !macdBull, volOk];
    const bullCount = bull.filter(Boolean).length;
    const bearCount = bear.filter(Boolean).length;

    const reasons: SignalReason[] = [
      reason('EMA', `Price ${price > s ? 'above' : 'below'} EMA${p.slow}`, price, price > s ? 'BULLISH' : 'BEARISH', s),
      reason('EMA', `EMA${p.fast} ${f > s ? 'above' : 'below'} EMA${p.slow}`, f, f > s ? 'BULLISH' : 'BEARISH', s),
      reason('ADX', strong ? `ADX above ${p.adxThreshold} (trending; ${at(a.plusDI) > at(a.minusDI) ? '+DI' : '-DI'} dominant)` : `ADX below ${p.adxThreshold} (weak/no trend)`, adxV,
        strong ? (at(a.plusDI) > at(a.minusDI) ? 'BULLISH' : 'BEARISH') : 'NEUTRAL', p.adxThreshold),
      reason('MACD', `MACD ${macdBull ? 'above' : 'below'} signal line`, at(m.macd), macdBull ? 'BULLISH' : 'BEARISH', at(m.signal)),
      reason('Volume', volOk ? 'Volume at/above required multiple of 20D average' : 'Volume below required multiple of 20D average', vol, volOk ? 'NEUTRAL' : 'NEUTRAL', vAvg * p.volumeMultiplier),
    ];
    const indicators = { [`ema${p.fast}`]: f, [`ema${p.slow}`]: s, adx: adxV, plusDI: at(a.plusDI), minusDI: at(a.minusDI), macd: at(m.macd), macdSignal: at(m.signal), volumeRatio: vol / vAvg };
    const meta = { bullishConditions: bullCount, bearishConditions: bearCount, totalConditions: 5 };

    if (bullCount >= p.minConditions && price > s && f > s) {
      return buildSignal(this.id, candles, ctx, 'BUY', (bullCount / 5) * 80 + Math.min(20, (adxV - p.adxThreshold) / 2), reasons, indicators, meta);
    }
    if (bearCount >= p.minConditions && price < s && f < s) {
      return buildSignal(this.id, candles, ctx, 'SELL', (bearCount / 5) * 80 + Math.min(20, (adxV - p.adxThreshold) / 2), reasons, indicators, meta);
    }
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.max(bullCount, bearCount) * 8, reasons, indicators, meta);
  },
};
