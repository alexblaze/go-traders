import { roc, rsi, sma, volumeSma } from '@nepse/indicators';
import type { SignalReason } from '@nepse/shared';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'rsiPeriod', label: 'RSI period', default: 14, min: 2, max: 50 },
  { key: 'rocPeriod', label: 'ROC period', default: 12, min: 2, max: 100 },
  { key: 'momentumPeriod', label: 'Price momentum lookback', default: 20, min: 5, max: 200 },
  { key: 'rocThreshold', label: 'ROC threshold %', default: 3, min: 0, max: 50, step: 0.5 },
  { key: 'volumeMultiplier', label: 'Volume vs 20D avg', default: 1.2, min: 0.5, max: 5, step: 0.1 },
  { key: 'scoreThreshold', label: 'Score needed (of 4)', default: 3, min: 1, max: 4, step: 1 },
];

export const momentumStrategy: TradingStrategy = {
  id: 'momentum',
  name: 'Momentum',
  description: 'Scores RSI, ROC, volume and price momentum from -4 to +4. Bullish at or above the score threshold, bearish at or below its negative.',
  category: 'momentum',
  parameters: PARAMS,
  indicatorsUsed: ['RSI', 'ROC', 'SMA', 'Volume SMA'],
  assumptions: ['Assets with recent strong relative momentum tend to continue in the short term.'],
  limitations: ['Momentum can reverse sharply; extended momentum raises reversal risk.'],
  minCandles: (p) => Math.max(p.rsiPeriod, p.rocPeriod, p.momentumPeriod, 20) + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const r = at(rsi(closes, p.rsiPeriod));
    const rc = at(roc(closes, p.rocPeriod));
    const smaM = at(sma(closes, p.momentumPeriod));
    const price = at(closes);
    const vAvg = at(volumeSma(candles, 20));
    const vol = candles[candles.length - 1].volume;
    const priceChange = at(closes, 0) - at(closes, 1);

    const components: { name: string; score: number; r: SignalReason }[] = [];
    const rs = r > 55 ? 1 : r < 45 ? -1 : 0;
    components.push({ name: 'RSI', score: rs, r: reason('RSI', rs > 0 ? 'RSI above 55 (positive momentum)' : rs < 0 ? 'RSI below 45 (negative momentum)' : 'RSI neutral (45–55)', r, rs > 0 ? 'BULLISH' : rs < 0 ? 'BEARISH' : 'NEUTRAL') });
    const rcs = rc > p.rocThreshold ? 1 : rc < -p.rocThreshold ? -1 : 0;
    components.push({ name: 'ROC', score: rcs, r: reason('ROC', `ROC(${p.rocPeriod}) ${rc.toFixed(2)}% vs ±${p.rocThreshold}%`, rc, rcs > 0 ? 'BULLISH' : rcs < 0 ? 'BEARISH' : 'NEUTRAL', p.rocThreshold) });
    const pm = price > smaM ? 1 : price < smaM ? -1 : 0;
    components.push({ name: 'Price momentum', score: pm, r: reason('SMA', `Price ${pm > 0 ? 'above' : 'below'} SMA${p.momentumPeriod}`, price, pm > 0 ? 'BULLISH' : 'BEARISH', smaM) });
    const vs = vol > vAvg * p.volumeMultiplier ? (priceChange >= 0 ? 1 : -1) : 0;
    components.push({ name: 'Volume', score: vs, r: reason('Volume', vs === 0 ? 'Volume not elevated' : `Elevated volume on ${priceChange >= 0 ? 'up' : 'down'} day`, vol / vAvg, vs > 0 ? 'BULLISH' : vs < 0 ? 'BEARISH' : 'NEUTRAL', p.volumeMultiplier) });

    const score = components.reduce((a, c) => a + c.score, 0);
    const indicators = { rsi: r, roc: rc, [`sma${p.momentumPeriod}`]: smaM, volumeRatio: vol / vAvg, score };
    const meta = { score, maxScore: 4, components: components.map((c) => ({ name: c.name, score: c.score })), direction: score >= p.scoreThreshold ? 'bullish' : score <= -p.scoreThreshold ? 'bearish' : 'neutral' };
    const reasons = components.map((c) => c.r);
    if (r > 75) reasons.push(reason('RSI', 'Momentum may be extended (RSI > 75)', r, 'BEARISH', 75));
    if (r < 25) reasons.push(reason('RSI', 'Momentum may be exhausted to downside (RSI < 25)', r, 'BULLISH', 25));

    if (score >= p.scoreThreshold) return buildSignal(this.id, candles, ctx, 'BUY', 40 + score * 15, reasons, indicators, meta);
    if (score <= -p.scoreThreshold) return buildSignal(this.id, candles, ctx, 'SELL', 40 + -score * 15, reasons, indicators, meta);
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.abs(score) * 10, reasons, indicators, meta);
  },
};
