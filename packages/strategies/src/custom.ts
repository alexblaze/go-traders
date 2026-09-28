import { buildSignal, reason } from './base';
import { evaluateOnCandles, type CustomStrategyDefinition } from './dsl';
import type { TradingStrategy } from './types';

/** Build a strategy plugin from a validated DSL definition. No user code is executed. */
export function createCustomStrategy(id: string, def: CustomStrategyDefinition): TradingStrategy {
  return {
    id,
    name: def.name,
    description: def.description ?? 'User-defined rule-based strategy.',
    category: 'custom',
    parameters: [],
    indicatorsUsed: ['User-selected (DSL)'],
    assumptions: ['Defined by the user.'],
    limitations: ['User-defined rules have not been validated; backtest before relying on them.'],
    minCandles: () => 30,
    generateSignal(candles, ctx) {
      const buy = evaluateOnCandles(def.buy, candles);
      const sell = def.sell ? evaluateOnCandles(def.sell, candles) : undefined;
      const toReasons = (t: typeof buy.trace, dir: 'BULLISH' | 'BEARISH') =>
        t.map((x) => reason('Rule', `${x.passed ? '✓' : '✗'} ${x.description}`, x.left ?? NaN, x.passed ? dir : 'NEUTRAL', x.right ?? undefined));
      const passRatio = (t: typeof buy.trace) => (t.length ? t.filter((x) => x.passed).length / t.length : 0);
      const indicators = { close: buy.snapshot.close, rsi14: buy.snapshot.rsi14, ema50: buy.snapshot.ema50 };
      if (buy.passed && !sell?.passed) return buildSignal(id, candles, ctx, 'BUY', 70, toReasons(buy.trace, 'BULLISH'), indicators);
      if (sell?.passed && !buy.passed) return buildSignal(id, candles, ctx, 'SELL', 70, toReasons(sell.trace, 'BEARISH'), indicators);
      return buildSignal(id, candles, ctx, 'HOLD', Math.max(passRatio(buy.trace), sell ? passRatio(sell.trace) : 0) * 40, [
        ...toReasons(buy.trace, 'BULLISH'),
        ...(sell ? toReasons(sell.trace, 'BEARISH') : []),
      ], indicators);
    },
  };
}
