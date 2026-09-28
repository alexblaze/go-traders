import type { OHLCV } from '@nepse/shared';
import type { TradingStrategy } from '@nepse/strategies';
import { runBacktest } from './engine';
import type { BacktestConfig, BacktestMetrics } from './types';

export interface WalkForwardOptions {
  /** Candidate values per parameter. Cartesian product is capped at `maxCombinations`. */
  grid: Record<string, number[]>;
  trainBars: number;
  testBars: number;
  objective?: 'sharpeRatio' | 'totalReturnPct';
  maxCombinations?: number;
}

export interface WalkForwardFold {
  fold: number;
  trainFrom: Date;
  trainTo: Date;
  testFrom: Date;
  testTo: Date;
  bestParameters: Record<string, number>;
  inSampleScore: number;
  outOfSample: BacktestMetrics;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  combinedOutOfSampleReturnPct: number;
  averageOutOfSampleSharpe: number;
  note: string;
}

export function parameterCombinations(grid: Record<string, number[]>, max = 50): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const [k, vals] of Object.entries(grid)) {
    combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [k]: v })));
    if (combos.length > max) combos = combos.slice(0, max);
  }
  return combos;
}

/**
 * Walk-forward optimisation: parameters are selected on each training window only and then
 * evaluated on the following, unseen test window. Test windows never overlap training data
 * used for the same fold, preventing data snooping on the evaluation period.
 */
export function walkForward(candles: OHLCV[], strategy: TradingStrategy, base: BacktestConfig, opts: WalkForwardOptions): WalkForwardResult {
  const objective = opts.objective ?? 'sharpeRatio';
  const combos = parameterCombinations(opts.grid, opts.maxCombinations);
  const folds: WalkForwardFold[] = [];
  for (let start = 0, fold = 1; start + opts.trainBars + opts.testBars <= candles.length; start += opts.testBars, fold++) {
    const train = candles.slice(0, start + opts.trainBars);
    const trainFrom = candles[start].date;
    const trainTo = candles[start + opts.trainBars - 1].date;
    let best = combos[0];
    let bestScore = -Infinity;
    for (const params of combos) {
      const r = runBacktest(train, strategy, { ...base, strategyParameters: { ...base.strategyParameters, ...params }, startDate: trainFrom, endDate: undefined });
      const score = r.metrics[objective];
      if (score > bestScore) {
        bestScore = score;
        best = params;
      }
    }
    const testEnd = start + opts.trainBars + opts.testBars;
    const testFrom = candles[start + opts.trainBars].date;
    const oos = runBacktest(candles.slice(0, testEnd), strategy, { ...base, strategyParameters: { ...base.strategyParameters, ...best }, startDate: testFrom });
    folds.push({ fold, trainFrom, trainTo, testFrom, testTo: candles[testEnd - 1].date, bestParameters: best, inSampleScore: bestScore, outOfSample: oos.metrics });
  }
  const combined = folds.reduce((acc, f) => acc * (1 + f.outOfSample.totalReturnPct / 100), 1);
  return {
    folds,
    combinedOutOfSampleReturnPct: Math.round((combined - 1) * 10000) / 100,
    averageOutOfSampleSharpe: folds.length ? Math.round((folds.reduce((a, f) => a + f.outOfSample.sharpeRatio, 0) / folds.length) * 10000) / 10000 : 0,
    note: 'Out-of-sample results are historical observations only and do not guarantee future performance.',
  };
}
