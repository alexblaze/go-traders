import type { FeatureRow } from './features';
import type { Model } from './models';
import { walkForwardSplits } from './splits';

export interface ClassificationMetrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  logLoss: number;
  baseRate: number;
  /** Reliability table: mean score vs observed frequency per bucket. */
  calibration: { bucket: string; count: number; meanScore: number; observedRate: number }[];
}

export function classificationMetrics(scores: number[], y: number[], threshold = 0.5): ClassificationMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0, ll = 0;
  scores.forEach((s, i) => {
    const pred = s >= threshold ? 1 : 0;
    if (pred && y[i]) tp++; else if (pred) fp++; else if (y[i]) fn++; else tn++;
    const p = Math.min(1 - 1e-9, Math.max(1e-9, s));
    ll += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
  });
  const n = scores.length || 1;
  const buckets = Array.from({ length: 5 }, (_, b) => {
    const idx = scores.map((s, i) => [s, i] as const).filter(([s]) => s >= b / 5 && (b === 4 ? s <= 1 : s < (b + 1) / 5));
    return {
      bucket: `${(b * 0.2).toFixed(1)}–${((b + 1) * 0.2).toFixed(1)}`, count: idx.length,
      meanScore: idx.length ? idx.reduce((a, [s]) => a + s, 0) / idx.length : NaN,
      observedRate: idx.length ? idx.reduce((a, [, i]) => a + y[i], 0) / idx.length : NaN,
    };
  });
  return {
    n: scores.length, accuracy: (tp + tn) / n, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0,
    logLoss: ll / n, baseRate: y.reduce((a, v) => a + v, 0) / n, calibration: buckets,
  };
}

/**
 * Walk-forward evaluation: re-fit on each expanding training window, score the next unseen
 * window, and aggregate only out-of-sample predictions.
 */
export async function walkForwardEvaluate(makeModel: () => Model, rows: FeatureRow[], opts: { initialTrain: number; testSize: number; embargo?: number }) {
  const scores: number[] = [];
  const labels: number[] = [];
  const windows = walkForwardSplits(rows, opts);
  for (const w of windows) {
    const m = makeModel();
    await m.fit(w.train.map((r) => r.x), w.train.map((r) => r.y as number));
    scores.push(...(await m.predictScore(w.test.map((r) => r.x))));
    labels.push(...w.test.map((r) => r.y as number));
  }
  return { windows: windows.length, metrics: classificationMetrics(scores, labels), note: 'Out-of-sample walk-forward results. Scores are not calibrated probabilities unless the calibration table shows they match observed rates.' };
}
