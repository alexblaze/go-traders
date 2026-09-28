import { bollinger, volumeSma } from '@nepse/indicators';
import { at, buildSignal, insufficientData, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';

const PARAMS = [
  { key: 'period', label: 'Period', default: 20, min: 5, max: 200 },
  { key: 'stdDev', label: 'Std deviations', default: 2, min: 0.5, max: 4, step: 0.1 },
  { key: 'mode', label: 'Mode (0 = reversion, 1 = breakout)', default: 0, min: 0, max: 1, step: 1 },
  { key: 'squeezeLookback', label: 'Squeeze lookback', default: 120, min: 20, max: 500 },
  { key: 'volumeMultiplier', label: 'Breakout volume multiplier', default: 1.5, min: 1, max: 5, step: 0.1 },
];

export const bollingerStrategy: TradingStrategy = {
  id: 'bollinger',
  name: 'Bollinger Bands',
  description: 'Reversion mode: lower-band touch = BUY candidate, upper-band touch = SELL candidate. Breakout mode: close outside the bands with volume, especially after a volatility squeeze.',
  category: 'volatility',
  parameters: PARAMS,
  indicatorsUsed: ['Bollinger Bands', 'Volume SMA'],
  assumptions: ['Reversion mode: prices tend to revert toward the moving average.', 'Breakout mode: volatility expansions after squeezes tend to continue.'],
  limitations: ['Band touches are not signals by themselves in trending markets.', 'Squeeze direction is not known in advance.'],
  minCandles: (p) => p.period + 2,
  generateSignal(candles, ctx) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const need = this.minCandles(p);
    if (candles.length < need) return insufficientData(this.id, candles, ctx, need);
    const closes = candles.map((c) => c.close);
    const bb = bollinger(closes, p.period, p.stdDev);
    const c = at(closes);
    const up = at(bb.upper);
    const lo = at(bb.lower);
    const bw = at(bb.bandwidth);
    const hist = bb.bandwidth.slice(-p.squeezeLookback).filter(Number.isFinite);
    const squeeze = hist.length >= 20 && bw <= Math.min(...hist.slice(0, -1)) * 1.05;
    const recentSqueeze = hist.length >= 25 && Math.min(...hist.slice(-6, -1)) <= Math.min(...hist.slice(0, -6)) * 1.05;
    const vol = at(volumeSma(candles, 20));
    const volOk = candles[candles.length - 1].volume > vol * p.volumeMultiplier;
    const indicators = { upper: up, middle: at(bb.middle), lower: lo, bandwidth: bw, percentB: at(bb.percentB) };
    const squeezeReason = reason('Bollinger', squeeze ? 'Volatility squeeze: bandwidth near lookback low' : 'No volatility squeeze', bw, 'NEUTRAL');

    if (p.mode >= 1) {
      if (c > up) {
        return buildSignal(this.id, candles, ctx, 'BUY', 55 + (volOk ? 20 : 0) + (recentSqueeze ? 15 : 0), [
          reason('Bollinger', 'Close broke above upper band', c, 'BULLISH', up),
          reason('Volume', volOk ? 'Breakout confirmed by above-average volume' : 'Breakout lacks volume confirmation', candles[candles.length - 1].volume, volOk ? 'BULLISH' : 'NEUTRAL', vol * p.volumeMultiplier),
          squeezeReason,
        ], indicators);
      }
      if (c < lo) {
        return buildSignal(this.id, candles, ctx, 'SELL', 55 + (volOk ? 20 : 0) + (recentSqueeze ? 15 : 0), [
          reason('Bollinger', 'Close broke below lower band', c, 'BEARISH', lo),
          reason('Volume', volOk ? 'Breakdown confirmed by above-average volume' : 'Breakdown lacks volume confirmation', candles[candles.length - 1].volume, volOk ? 'BEARISH' : 'NEUTRAL', vol * p.volumeMultiplier),
          squeezeReason,
        ], indicators);
      }
    } else {
      if (c <= lo) {
        return buildSignal(this.id, candles, ctx, 'BUY', 55 + Math.min(30, (lo - c) / (up - lo || 1) * 100), [
          reason('Bollinger', 'Price touching/below lower band (stretched to downside)', c, 'BULLISH', lo),
          squeezeReason,
        ], indicators);
      }
      if (c >= up) {
        return buildSignal(this.id, candles, ctx, 'SELL', 55 + Math.min(30, (c - up) / (up - lo || 1) * 100), [
          reason('Bollinger', 'Price touching/above upper band (stretched to upside)', c, 'BEARISH', up),
          squeezeReason,
        ], indicators);
      }
    }
    const pb = at(bb.percentB);
    return buildSignal(this.id, candles, ctx, 'HOLD', squeeze ? 30 : 10, [
      reason('Bollinger', `Price inside bands (%B ${(pb * 100).toFixed(0)}%)`, pb, pb > 0.5 ? 'BULLISH' : pb < 0.5 ? 'BEARISH' : 'NEUTRAL'),
      squeezeReason,
    ], indicators);
  },
};
