import { bollingerStrategy } from './builtin/bollinger';
import { breakoutStrategy } from './builtin/breakout';
import { multiIndicatorConsensus } from './builtin/consensus';
import { emaCrossover } from './builtin/ema-crossover';
import { ensembleStrategy } from './builtin/ensemble';
import { macdStrategy } from './builtin/macd';
import { meanReversion } from './builtin/mean-reversion';
import { momentumStrategy } from './builtin/momentum';
import { rsiStrategy } from './builtin/rsi';
import { trendFollowing } from './builtin/trend-following';
import type { TradingStrategy } from './types';

/** Built-in strategies. Add a new strategy by implementing TradingStrategy and registering it here. */
export const BUILTIN_STRATEGIES: TradingStrategy[] = [
  emaCrossover,
  rsiStrategy,
  macdStrategy,
  bollingerStrategy,
  trendFollowing,
  momentumStrategy,
  breakoutStrategy,
  meanReversion,
  multiIndicatorConsensus,
  ensembleStrategy,
];

export class StrategyRegistry {
  private readonly strategies = new Map<string, TradingStrategy>();

  constructor(initial: TradingStrategy[] = BUILTIN_STRATEGIES) {
    initial.forEach((s) => this.register(s));
  }

  register(strategy: TradingStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  get(id: string): TradingStrategy | undefined {
    return this.strategies.get(id);
  }

  list(): TradingStrategy[] {
    return [...this.strategies.values()];
  }
}

export const defaultRegistry = new StrategyRegistry();

/** Serializable description (for API/UI). */
export function describeStrategy(s: TradingStrategy) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    parameters: s.parameters,
    indicatorsUsed: s.indicatorsUsed,
    assumptions: s.assumptions,
    limitations: s.limitations,
  };
}
