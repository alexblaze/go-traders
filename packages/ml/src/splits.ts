import type { FeatureRow } from './features';

export interface Split {
  train: FeatureRow[];
  validation: FeatureRow[];
  test: FeatureRow[];
}

/**
 * Chronological train / validation / out-of-sample test split. Never shuffles.
 * An embargo of `horizon` rows is dropped between segments so labels (which look `horizon`
 * bars ahead) of one segment cannot overlap the next segment's period.
 */
export function chronologicalSplit(rows: FeatureRow[], fractions = { train: 0.6, validation: 0.2 }, embargo = 5): Split {
  const labeled = rows.filter((r) => r.y !== null);
  const n = labeled.length;
  const tEnd = Math.floor(n * fractions.train);
  const vEnd = Math.floor(n * (fractions.train + fractions.validation));
  return {
    train: labeled.slice(0, Math.max(0, tEnd - embargo)),
    validation: labeled.slice(tEnd, Math.max(tEnd, vEnd - embargo)),
    test: labeled.slice(vEnd),
  };
}

export interface WalkForwardWindow {
  train: FeatureRow[];
  test: FeatureRow[];
}

/** Expanding-window walk-forward splits with an embargo between train and test. */
export function walkForwardSplits(rows: FeatureRow[], opts: { initialTrain: number; testSize: number; embargo?: number }): WalkForwardWindow[] {
  const labeled = rows.filter((r) => r.y !== null);
  const embargo = opts.embargo ?? 5;
  const out: WalkForwardWindow[] = [];
  for (let start = opts.initialTrain; start + opts.testSize <= labeled.length; start += opts.testSize) {
    out.push({ train: labeled.slice(0, Math.max(0, start - embargo)), test: labeled.slice(start, start + opts.testSize) });
  }
  return out;
}
