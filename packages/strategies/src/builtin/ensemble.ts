import type { OHLCV, ParameterDefinition, SignalReason, StrategyContext, TradingSignal } from '@nepse/shared';
import { buildSignal, reason, resolveParams } from '../base';
import type { TradingStrategy } from '../types';
import { bollingerStrategy } from './bollinger';
import { breakoutStrategy } from './breakout';
import { emaCrossover } from './ema-crossover';
import { macdStrategy } from './macd';
import { momentumStrategy } from './momentum';
import { rsiStrategy } from './rsi';
import { trendFollowing } from './trend-following';

export const ENSEMBLE_MEMBERS: TradingStrategy[] = [emaCrossover, rsiStrategy, macdStrategy, bollingerStrategy, momentumStrategy, breakoutStrategy, trendFollowing];

const PARAMS: ParameterDefinition[] = [
  { key: 'minSupport', label: 'Min agreeing strategies', default: 3, min: 1, max: 7, step: 1 },
  { key: 'minNet', label: 'Min net (bullish − bearish)', default: 2, min: 1, max: 7, step: 1 },
];

export interface EnsembleMemberResult {
  strategyId: string;
  name: string;
  signal: TradingSignal['signal'];
  strength: number;
  reasons: SignalReason[];
}

export const ensembleStrategy: TradingStrategy = {
  id: 'ensemble',
  name: 'Ensemble',
  description: 'Runs EMA Crossover, RSI, MACD, Bollinger, Momentum, Breakout and Trend strategies and aggregates their votes. Strength is an internal signal-strength metric, NOT a probability of future returns.',
  category: 'composite',
  parameters: PARAMS,
  indicatorsUsed: ['All member strategy indicators'],
  assumptions: ['Diverse strategies agreeing reduces the impact of any single strategy’s false signals.'],
  limitations: ['Member strategies share price inputs, so votes are not independent.', 'Mixed regimes produce many HOLDs.'],
  minCandles: () => Math.max(...ENSEMBLE_MEMBERS.map((m) => m.minCandles(resolveParams(m.parameters)))),
  generateSignal(candles: OHLCV[], ctx: StrategyContext) {
    const p = resolveParams(PARAMS, ctx.parameters);
    const results: EnsembleMemberResult[] = ENSEMBLE_MEMBERS.map((m) => {
      const s = m.generateSignal(candles, { ...ctx, parameters: undefined });
      return { strategyId: m.id, name: m.name, signal: s.signal, strength: s.strength, reasons: s.reasons };
    });
    const buys = results.filter((r) => r.signal === 'BUY');
    const sells = results.filter((r) => r.signal === 'SELL');
    const holds = results.filter((r) => r.signal === 'HOLD');
    const net = buys.length - sells.length;
    const total = results.length;
    const avg = (xs: EnsembleMemberResult[]) => (xs.length ? xs.reduce((a, x) => a + x.strength, 0) / xs.length : 0);

    let signal: TradingSignal['signal'] = 'HOLD';
    let strength = 0;
    if (buys.length >= p.minSupport && net >= p.minNet) {
      signal = 'BUY';
      strength = (buys.length / total) * 60 + avg(buys) * 0.4 - sells.length * 5;
    } else if (sells.length >= p.minSupport && -net >= p.minNet) {
      signal = 'SELL';
      strength = (sells.length / total) * 60 + avg(sells) * 0.4 - buys.length * 5;
    } else {
      strength = (Math.max(buys.length, sells.length) / total) * 40;
    }

    const reasons = results.map((r) =>
      reason(r.name, `${r.name}: ${r.signal}${r.reasons[0] ? ` — ${r.reasons[0].condition}` : ''}`, r.strength, r.signal === 'BUY' ? 'BULLISH' : r.signal === 'SELL' ? 'BEARISH' : 'NEUTRAL'),
    );
    const sideReasons = signal === 'SELL' ? sells : buys;
    const opposing = signal === 'SELL' ? buys : sells;
    const primaryReasons = sideReasons.flatMap((r) => r.reasons.filter((x) => x.direction === (signal === 'SELL' ? 'BEARISH' : 'BULLISH')).slice(0, 1).map((x) => x.condition));
    const conflictingFactors = [...opposing, ...holds].flatMap((r) => r.reasons.filter((x) => x.direction === (signal === 'SELL' ? 'BULLISH' : 'BEARISH')).slice(0, 1).map((x) => x.condition));

    return buildSignal(this.id, candles, ctx, signal, strength, reasons, { bullishVotes: buys.length, bearishVotes: sells.length, neutralVotes: holds.length }, {
      supportingStrategies: signal === 'SELL' ? sells.length : buys.length,
      bullishStrategies: buys.length,
      neutralStrategies: holds.length,
      bearishStrategies: sells.length,
      members: results,
      primaryReasons,
      conflictingFactors,
    });
  },
};
