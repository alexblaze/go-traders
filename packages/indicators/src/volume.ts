import type { OHLCV } from '@nepse/shared';
import { sma, typicalPrice } from './trend';
import { assertPeriod, nanSeries, rollingSum, type Series } from './util';

export function obv(candles: OHLCV[]): Series {
  const out = nanSeries(candles.length);
  if (candles.length === 0) return out;
  out[0] = 0;
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    out[i] = out[i - 1] + (d > 0 ? candles[i].volume : d < 0 ? -candles[i].volume : 0);
  }
  return out;
}

export function volumeSma(candles: OHLCV[], period = 20): Series {
  return sma(candles.map((c) => c.volume), period);
}

/** Percent change of volume vs previous candle. */
export function volumeChange(candles: OHLCV[]): Series {
  return candles.map((c, i) =>
    i === 0 || candles[i - 1].volume === 0 ? NaN : ((c.volume - candles[i - 1].volume) / candles[i - 1].volume) * 100,
  );
}

export function mfi(candles: OHLCV[], period = 14): Series {
  assertPeriod(period);
  const n = candles.length;
  const out = nanSeries(n);
  const tp = candles.map(typicalPrice);
  const pos = nanSeries(n);
  const neg = nanSeries(n);
  for (let i = 1; i < n; i++) {
    const flow = tp[i] * candles[i].volume;
    pos[i] = tp[i] > tp[i - 1] ? flow : 0;
    neg[i] = tp[i] < tp[i - 1] ? flow : 0;
  }
  const sp = rollingSum(pos, period);
  const sn = rollingSum(neg, period);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(sp[i])) continue;
    out[i] = sn[i] === 0 ? (sp[i] === 0 ? 50 : 100) : 100 - 100 / (1 + sp[i] / sn[i]);
  }
  return out;
}

/** Chaikin Money Flow. */
export function cmf(candles: OHLCV[], period = 20): Series {
  const mfv = candles.map((c) => {
    const r = c.high - c.low;
    return r === 0 ? 0 : (((c.close - c.low) - (c.high - c.close)) / r) * c.volume;
  });
  const sMfv = rollingSum(mfv, period);
  const sVol = rollingSum(candles.map((c) => c.volume), period);
  return sMfv.map((v, i) => (Number.isFinite(v) && sVol[i] > 0 ? v / sVol[i] : NaN));
}
