import { describe, expect, it } from 'vitest';
import type { OHLCV } from '@nepse/shared';
import { DEMO_UNIVERSE, generateSyntheticCandles } from '@nepse/market-data';
import { buildFeatures, chronologicalSplit, classificationMetrics, FEATURE_DOCS, FEATURE_NAMES, LogisticRegression, RemoteModel, walkForwardEvaluate, walkForwardSplits } from '../src';

const candles: OHLCV[] = generateSyntheticCandles(DEMO_UNIVERSE[5], { from: new Date('2024-01-01T00:00:00Z'), to: new Date('2026-06-30T00:00:00Z') });

describe('features', () => {
  it('every feature is documented', () => {
    expect(buildFeatures(candles)[0].x).toHaveLength(FEATURE_NAMES.length);
    expect(Object.values(FEATURE_DOCS).every((d) => d.length > 5)).toBe(true);
  });
  it('features do not use future data', () => {
    const full = buildFeatures(candles);
    const tampered = [...candles.slice(0, 300), ...candles.slice(300).map((c) => ({ ...c, close: c.close * 3, high: c.high * 3, low: c.low * 3, open: c.open * 3 }))];
    const partial = buildFeatures(tampered);
    const at = (rows: typeof full, idx: number) => rows.find((r) => r.index === idx)!.x;
    expect(at(partial, 290)).toEqual(at(full, 290));
  });
  it('labels are unknown (null) for the last horizon rows', () => {
    const rows = buildFeatures(candles, { horizon: 5 });
    expect(rows.slice(-5).every((r) => r.y === null)).toBe(true);
  });
});

describe('time-series splits', () => {
  const rows = buildFeatures(candles);
  it('never shuffles and keeps an embargo gap', () => {
    const s = chronologicalSplit(rows, { train: 0.6, validation: 0.2 }, 5);
    const lastTrain = s.train[s.train.length - 1].index;
    const firstVal = s.validation[0].index;
    expect(firstVal - lastTrain).toBeGreaterThan(5);
    expect(s.test[0].index).toBeGreaterThan(s.validation[s.validation.length - 1].index);
    for (const seg of [s.train, s.validation, s.test]) for (let i = 1; i < seg.length; i++) expect(seg[i].index).toBeGreaterThan(seg[i - 1].index);
  });
  it('walk-forward windows move forward in time', () => {
    const w = walkForwardSplits(rows, { initialTrain: 200, testSize: 60 });
    expect(w.length).toBeGreaterThan(2);
    for (const win of w) expect(win.test[0].index).toBeGreaterThan(win.train[win.train.length - 1].index);
  });
});

describe('models', () => {
  it('logistic regression learns a separable signal', () => {
    const X = Array.from({ length: 200 }, (_, i) => [i % 2 ? 1 + Math.random() : -1 - Math.random(), Math.random()]);
    const y = X.map((r) => (r[0] > 0 ? 1 : 0));
    const m = new LogisticRegression();
    m.fit(X, y);
    expect(classificationMetrics(m.predictScore(X), y).accuracy).toBeGreaterThan(0.95);
  });
  it('walk-forward evaluation reports out-of-sample metrics with a calibration table', async () => {
    const r = await walkForwardEvaluate(() => new LogisticRegression({ epochs: 100 }), buildFeatures(candles), { initialTrain: 250, testSize: 60 });
    expect(r.metrics.n).toBeGreaterThan(100);
    expect(r.metrics.calibration).toHaveLength(5);
    expect(r.note).toMatch(/not calibrated/);
  });
  it('remote model adapter validates responses', async () => {
    const fetchImpl = (async (url: string) => new Response(JSON.stringify(url.endsWith('/predict') ? { scores: [0.2] } : { ok: true }))) as unknown as typeof fetch;
    const m = new RemoteModel('xgboost', 'http://ml.local', fetchImpl);
    await m.fit([[1]], [1]);
    await expect(m.predictScore([[1], [2]])).rejects.toThrow(/wrong number/);
  });
});
