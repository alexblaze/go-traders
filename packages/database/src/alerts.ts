import type { Alert, AlertType } from '@prisma/client';

export interface AlertInputs {
  cur: Record<string, number | null | undefined>;
  prev?: Record<string, number | null | undefined>;
  /** Latest signals by strategy id for the evaluated date. */
  signals: { strategyId: string; signal: 'BUY' | 'SELL' | 'HOLD'; strength: number }[];
}

export interface AlertEvaluation {
  triggered: boolean;
  message: string;
}

export const ALERT_NEEDS_THRESHOLD: AlertType[] = ['PRICE_ABOVE', 'PRICE_BELOW', 'RSI_BELOW', 'RSI_ABOVE', 'VOLUME_ABOVE'];

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const crossed = (a0: number | null, b0: number | null, a1: number | null, b1: number | null, up: boolean) =>
  a0 !== null && b0 !== null && a1 !== null && b1 !== null && (up ? a0 <= b0 && a1 > b1 : a0 >= b0 && a1 < b1);

/** Pure alert evaluation against indicator snapshots — shared by the worker and tests. */
export function evaluateAlert(alert: Pick<Alert, 'type' | 'threshold' | 'strategyId'>, { cur, prev, signals }: AlertInputs): AlertEvaluation {
  const t = alert.threshold ?? NaN;
  const close = n(cur.close);
  const prevClose = n(prev?.close ?? cur.prevClose);
  switch (alert.type) {
    case 'PRICE_ABOVE':
      return { triggered: close !== null && close > t && (prevClose === null || prevClose <= t), message: `Price crossed above ${t} (close ${close})` };
    case 'PRICE_BELOW':
      return { triggered: close !== null && close < t && (prevClose === null || prevClose >= t), message: `Price crossed below ${t} (close ${close})` };
    case 'RSI_BELOW':
      return { triggered: n(cur.rsi14) !== null && n(cur.rsi14)! < t, message: `RSI(14) ${n(cur.rsi14)?.toFixed(1)} is below ${t}` };
    case 'RSI_ABOVE':
      return { triggered: n(cur.rsi14) !== null && n(cur.rsi14)! > t, message: `RSI(14) ${n(cur.rsi14)?.toFixed(1)} is above ${t}` };
    case 'VOLUME_ABOVE':
      return { triggered: n(cur.volume) !== null && n(cur.volume)! > t, message: `Volume ${n(cur.volume)} exceeded ${t}` };
    case 'EMA_CROSSOVER_BULLISH':
      return { triggered: crossed(n(prev?.ema20), n(prev?.ema50), n(cur.ema20), n(cur.ema50), true), message: 'EMA20 crossed above EMA50' };
    case 'EMA_CROSSOVER_BEARISH':
      return { triggered: crossed(n(prev?.ema20), n(prev?.ema50), n(cur.ema20), n(cur.ema50), false), message: 'EMA20 crossed below EMA50' };
    case 'MACD_CROSSOVER_BULLISH':
      return { triggered: crossed(n(prev?.macd), n(prev?.macdSignal), n(cur.macd), n(cur.macdSignal), true), message: 'MACD crossed above its signal line' };
    case 'MACD_CROSSOVER_BEARISH':
      return { triggered: crossed(n(prev?.macd), n(prev?.macdSignal), n(cur.macd), n(cur.macdSignal), false), message: 'MACD crossed below its signal line' };
    case 'BREAKOUT': {
      const b = signals.find((s) => s.strategyId === 'breakout');
      return { triggered: b?.signal === 'BUY' || b?.signal === 'SELL', message: `Breakout strategy: ${b?.signal === 'SELL' ? 'support breakdown' : 'resistance breakout'} detected` };
    }
    case 'BUY_SIGNAL':
    case 'SELL_SIGNAL': {
      const want = alert.type === 'BUY_SIGNAL' ? 'BUY' : 'SELL';
      const s = signals.find((x) => x.strategyId === (alert.strategyId ?? 'ensemble'));
      const minStrength = Number.isFinite(t) ? t : 0;
      return { triggered: s?.signal === want && s.strength >= minStrength, message: `${alert.strategyId ?? 'ensemble'} generated a ${want} candidate signal (strength ${s?.strength ?? 0})` };
    }
    default:
      return { triggered: false, message: '' };
  }
}
