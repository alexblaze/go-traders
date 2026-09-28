import { atr, rollingSupportResistance, sma, volumeSma } from '@nepse/indicators';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'lookback', label: 'Breakout lookback (N days)', default: 20, min: 5, max: 250 },
  { key: 'volumeMultiplier', label: 'Volume multiplier', default: 1.5, min: 1, max: 10, step: 0.1 },
  { key: 'atrPeriod', label: 'ATR period', default: 14, min: 5, max: 50 },
  { key: 'atrExpansion', label: 'ATR expansion vs its 20D avg', default: 1.1, min: 1, max: 3, step: 0.05 },
];

export const breakoutStrategy: TradingStrategy = {
  id: 'breakout',
  name: 'Breakout',
  description: 'BUY candidate when close exceeds the previous N-day high with volume confirmation; SELL candidate on a breakdown below the previous N-day low. ATR expansion adds strength.',
  category: 'breakout',
  parameters: PARAMS,
  indicatorsUsed: ['Rolling high/low', 'Volume SMA', 'ATR'],
  assumptions: ['Moves beyond recent ranges on high volume indicate new demand/supply.'],
  limitations: ['False breakouts are common, especially in thinly traded NEPSE scrips.', 'Circuit limits can distort breakout behaviour.'],
  minCandles: (p) => Math.max(p.lookback, p.atrPeriod + 20, 20) + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const lastC = candles[candles.length - 1];
    const sr = rollingSupportResistance(candles, p.lookback);
    const res = at(sr.resistance);
    const sup = at(sr.support);
    const vAvg = at(volumeSma(candles, 20));
    const volOk = lastC.volume > vAvg * p.volumeMultiplier;
    const a = atr(candles, p.atrPeriod);
    const atrV = at(a);
    const atrAvg = at(sma(a, 20));
    const expanding = atrV > atrAvg * p.atrExpansion;
    const indicators = { resistance: res, support: sup, volumeRatio: lastC.volume / vAvg, atr: atrV, atrRatio: atrV / atrAvg };
    const volReason = reason('Volume', volOk ? `Volume ${(lastC.volume / vAvg).toFixed(2)}× 20D average (confirmation)` : 'No volume confirmation', lastC.volume / vAvg, volOk ? 'BULLISH' : 'NEUTRAL', p.volumeMultiplier);
    const atrReason = reason('ATR', expanding ? 'ATR expanding (range expansion)' : 'ATR not expanding', atrV / atrAvg, 'NEUTRAL', p.atrExpansion);

    if (lastC.close > res) {
      const strength = 45 + (volOk ? 30 : 0) + (expanding ? 15 : 0) + Math.min(10, ((lastC.close - res) / res) * 200);
      return buildSignal(this.id, candles, ctx, volOk ? 'BUY' : 'HOLD', volOk ? strength : 35, [
        reason('Price', `Close above previous ${p.lookback}-day high (resistance breakout)`, lastC.close, 'BULLISH', res),
        volReason, atrReason,
      ], indicators, { breakout: 'RESISTANCE' });
    }
    if (lastC.close < sup) {
      const strength = 45 + (volOk ? 30 : 0) + (expanding ? 15 : 0) + Math.min(10, ((sup - lastC.close) / sup) * 200);
      return buildSignal(this.id, candles, ctx, volOk ? 'SELL' : 'HOLD', volOk ? strength : 35, [
        reason('Price', `Close below previous ${p.lookback}-day low (support breakdown)`, lastC.close, 'BEARISH', sup),
        { ...volReason, direction: volOk ? 'BEARISH' : 'NEUTRAL' }, atrReason,
      ], indicators, { breakout: 'SUPPORT' });
    }
    const distRes = ((res - lastC.close) / lastC.close) * 100;
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.max(0, 25 - distRes * 3), [
      reason('Price', `Inside ${p.lookback}-day range; ${distRes.toFixed(1)}% below resistance`, lastC.close, 'NEUTRAL', res),
      volReason, atrReason,
    ], indicators);
  },
};
