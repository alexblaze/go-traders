import type { OHLCV, ParameterDefinition, StrategyContext, TradingSignal } from '@nepse/shared';

export type StrategyCategory = 'trend' | 'momentum' | 'mean-reversion' | 'volatility' | 'breakout' | 'composite' | 'custom';

/**
 * Strategy plugin contract.
 *
 * `generateSignal` MUST only use the candles it is given (the last candle is "now").
 * The backtester relies on this to avoid look-ahead bias: it passes candles[0..t].
 */
export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
  parameters: ParameterDefinition[];
  indicatorsUsed: string[];
  assumptions: string[];
  limitations: string[];
  /** Minimum candles needed to produce a non-trivial signal with given params. */
  minCandles(params: Record<string, number>): number;
  generateSignal(candles: OHLCV[], context: StrategyContext): TradingSignal;
}

export type { OHLCV, StrategyContext, TradingSignal };
