import { ema } from '@nepse/indicators';
import { at, buildSignal, insufficientData, reason, recentCross, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'fast', label: 'Fast EMA', default: 20, min: 2, max: 200, step: 1 },
  { key: 'slow', label: 'Slow EMA', default: 50, min: 3, max: 400, step: 1 },
  { key: 'confirmBars', label: 'Crossover recency (bars)', default: 1, min: 1, max: 10, step: 1, description: 'A crossover within this many bars counts as a fresh signal.' },
];

export const emaCrossover: TradingStrategy = {
  id: 'ema_crossover',
  name: 'Moving Average Crossover',
  description: 'BUY candidate when the fast EMA crosses above the slow EMA; SELL candidate when it crosses below.',
  category: 'trend',
  parameters: PARAMS,
  indicatorsUsed: ['EMA'],
  assumptions: ['Trends persist long enough after a crossover to be exploitable.'],
  limitations: ['Lagging: crossovers occur after a move has started.', 'Generates whipsaws in sideways markets.'],
  minCandles: (p) => p.slow + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const f = ema(closes, p.fast);
    const s = ema(closes, p.slow);
    const fv = at(f);
    const sv = at(s);
    const spreadPct = ((fv - sv) / sv) * 100;
    const up = recentCross(f, s, p.confirmBars, 'above');
    const down = recentCross(f, s, p.confirmBars, 'below');
    const indicators = { [`ema${p.fast}`]: fv, [`ema${p.slow}`]: sv, spreadPct };
    const priceVsSlow = reason('EMA', `Price ${at(closes) > sv ? 'above' : 'below'} EMA${p.slow}`, at(closes), at(closes) > sv ? 'BULLISH' : 'BEARISH', sv);

    if (up >= 0) {
      const strength = 55 + Math.min(30, Math.abs(spreadPct) * 10) + (p.confirmBars - up) * (15 / p.confirmBars);
      return buildSignal(this.id, candles, ctx, 'BUY', strength, [
        reason('EMA', `EMA${p.fast} crossed above EMA${p.slow} ${up === 0 ? 'on the latest bar' : `${up} bar(s) ago`}`, fv, 'BULLISH', sv),
        priceVsSlow,
      ], indicators);
    }
    if (down >= 0) {
      const strength = 55 + Math.min(30, Math.abs(spreadPct) * 10) + (p.confirmBars - down) * (15 / p.confirmBars);
      return buildSignal(this.id, candles, ctx, 'SELL', strength, [
        reason('EMA', `EMA${p.fast} crossed below EMA${p.slow} ${down === 0 ? 'on the latest bar' : `${down} bar(s) ago`}`, fv, 'BEARISH', sv),
        priceVsSlow,
      ], indicators);
    }
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.min(40, Math.abs(spreadPct) * 5), [
      reason('EMA', `No fresh crossover; EMA${p.fast} is ${fv > sv ? 'above' : 'below'} EMA${p.slow}`, fv, fv > sv ? 'BULLISH' : 'BEARISH', sv),
      priceVsSlow,
    ], indicators);
  },
};
