import { adx, ema, macd, rollingSupportResistance, rsi, volumeSma } from '@nepse/indicators';
import type { Direction } from '@nepse/shared';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'fast', label: 'Fast EMA', default: 20, min: 2, max: 200 },
  { key: 'slow', label: 'Slow EMA', default: 50, min: 5, max: 400 },
  { key: 'adxThreshold', label: 'ADX threshold', default: 25, min: 5, max: 60 },
  { key: 'volumeMultiplier', label: 'Volume vs 20D avg', default: 1.2, min: 0.5, max: 5, step: 0.1 },
  { key: 'breakoutLookback', label: 'Breakout lookback', default: 20, min: 5, max: 250 },
  { key: 'minScore', label: 'Score needed (of 6)', default: 4, min: 1, max: 6, step: 1 },
];

export interface ConsensusComponent {
  name: string;
  indicator: string;
  direction: Direction;
  points: number;
  condition: string;
  value: number;
}

export const multiIndicatorConsensus: TradingStrategy = {
  id: 'multi_indicator_consensus',
  name: 'Multi-Indicator Consensus',
  description: 'Scores six components (EMA trend, MACD, RSI, ADX, Volume, Breakout), +1 each when bullish. Output e.g. "Signal Score 5 / 6". The score is a count of agreeing conditions, NOT a probability of profit.',
  category: 'composite',
  parameters: PARAMS,
  indicatorsUsed: ['EMA', 'MACD', 'RSI', 'ADX', 'Volume SMA', 'Rolling high/low'],
  assumptions: ['Agreement between independent-ish indicators increases signal quality.'],
  limitations: ['Indicators are correlated (mostly price-derived), so agreement overstates independence.', 'Score is not calibrated as a probability.'],
  minCandles: (p) => Math.max(p.slow, 35, p.breakoutLookback + 1, 28) + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const lastC = candles[candles.length - 1];
    const f = at(ema(closes, p.fast));
    const s = at(ema(closes, p.slow));
    const m = macd(closes);
    const r = at(rsi(closes, 14));
    const a = adx(candles, 14);
    const vAvg = at(volumeSma(candles, 20));
    const sr = rollingSupportResistance(candles, p.breakoutLookback);
    const dayUp = lastC.close >= candles[candles.length - 2].close;

    const comps: ConsensusComponent[] = [];
    const add = (name: string, indicator: string, direction: Direction, condition: string, value: number) =>
      comps.push({ name, indicator, direction, condition, value, points: direction === 'BULLISH' ? 1 : direction === 'BEARISH' ? -1 : 0 });

    add('EMA Trend', 'EMA', f > s ? 'BULLISH' : 'BEARISH', `EMA${p.fast} ${f > s ? 'above' : 'below'} EMA${p.slow}`, f - s);
    add('MACD', 'MACD', at(m.macd) > at(m.signal) ? 'BULLISH' : 'BEARISH', `MACD ${at(m.macd) > at(m.signal) ? 'above' : 'below'} signal line`, at(m.histogram));
    add('RSI', 'RSI', r > 50 && r < 70 ? 'BULLISH' : r < 50 && r > 30 ? 'BEARISH' : 'NEUTRAL',
      r >= 70 ? 'RSI overbought (≥70) — not counted' : r <= 30 ? 'RSI oversold (≤30) — not counted' : `RSI ${r > 50 ? 'above' : 'below'} neutral 50`, r);
    const adxV = at(a.adx);
    add('ADX', 'ADX', adxV > p.adxThreshold ? (at(a.plusDI) > at(a.minusDI) ? 'BULLISH' : 'BEARISH') : 'NEUTRAL',
      adxV > p.adxThreshold ? `ADX ${adxV.toFixed(1)} > ${p.adxThreshold} with ${at(a.plusDI) > at(a.minusDI) ? '+DI' : '-DI'} dominant` : `ADX ${adxV.toFixed(1)} ≤ ${p.adxThreshold} (no strong trend)`, adxV);
    const volHigh = lastC.volume > vAvg * p.volumeMultiplier;
    add('Volume', 'Volume', volHigh ? (dayUp ? 'BULLISH' : 'BEARISH') : 'NEUTRAL', volHigh ? `Volume ${(lastC.volume / vAvg).toFixed(2)}× average on ${dayUp ? 'up' : 'down'} day` : 'Volume not above average threshold', lastC.volume / vAvg);
    const res = at(sr.resistance);
    const sup = at(sr.support);
    add('Breakout', 'Price', lastC.close > res ? 'BULLISH' : lastC.close < sup ? 'BEARISH' : 'NEUTRAL',
      lastC.close > res ? `Close above ${p.breakoutLookback}-day high` : lastC.close < sup ? `Close below ${p.breakoutLookback}-day low` : `Within ${p.breakoutLookback}-day range`, lastC.close);

    const bullish = comps.filter((c) => c.direction === 'BULLISH').length;
    const bearish = comps.filter((c) => c.direction === 'BEARISH').length;
    const reasons = comps.map((c) => reason(c.indicator, `${c.name}: ${c.condition}`, c.value, c.direction));
    const indicators = { [`ema${p.fast}`]: f, [`ema${p.slow}`]: s, macd: at(m.macd), macdSignal: at(m.signal), rsi: r, adx: adxV, volumeRatio: lastC.volume / vAvg, resistance: res, support: sup };
    const meta = { score: bullish, bearishScore: bearish, maxScore: comps.length, components: comps, scoreLabel: `${bullish} / ${comps.length}` };

    if (bullish >= p.minScore && bullish > bearish) return buildSignal(this.id, candles, ctx, 'BUY', (bullish / comps.length) * 100 - bearish * 5, reasons, indicators, meta);
    if (bearish >= p.minScore && bearish > bullish) return buildSignal(this.id, candles, ctx, 'SELL', (bearish / comps.length) * 100 - bullish * 5, reasons, indicators, meta);
    return buildSignal(this.id, candles, ctx, 'HOLD', Math.max(bullish, bearish) * 8, reasons, indicators, meta);
  },
};
