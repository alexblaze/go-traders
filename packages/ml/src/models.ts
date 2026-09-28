/** A binary classifier over feature vectors. Implementations must not see test data during fit. */
export interface Model {
  readonly name: string;
  fit(X: number[][], y: number[]): Promise<void> | void;
  /** Raw model scores in [0,1]. NOT calibrated probabilities unless explicitly calibrated. */
  predictScore(X: number[][]): Promise<number[]> | number[];
}

/** Z-score scaler fitted on training data only. */
export class StandardScaler {
  mean: number[] = [];
  std: number[] = [];
  fit(X: number[][]): this {
    const d = X[0]?.length ?? 0;
    this.mean = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / X.length);
    this.std = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - this.mean[j]) ** 2, 0) / X.length) || 1);
    return this;
  }
  transform(X: number[][]): number[][] {
    return X.map((r) => r.map((v, j) => (v - this.mean[j]) / this.std[j]));
  }
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

/** L2-regularised logistic regression (batch gradient descent). Baseline model. */
export class LogisticRegression implements Model {
  readonly name = 'logistic_regression';
  weights: number[] = [];
  bias = 0;
  private scaler = new StandardScaler();

  constructor(private readonly opts: { learningRate?: number; epochs?: number; l2?: number } = {}) {}

  fit(Xraw: number[][], y: number[]): void {
    const X = this.scaler.fit(Xraw).transform(Xraw);
    const n = X.length;
    const d = X[0]?.length ?? 0;
    const lr = this.opts.learningRate ?? 0.1;
    const l2 = this.opts.l2 ?? 0.01;
    this.weights = new Array(d).fill(0);
    this.bias = 0;
    for (let epoch = 0; epoch < (this.opts.epochs ?? 300); epoch++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        const err = sigmoid(X[i].reduce((a, v, j) => a + v * this.weights[j], this.bias)) - y[i];
        for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
        gb += err;
      }
      for (let j = 0; j < d; j++) this.weights[j] -= lr * (gw[j] / n + l2 * this.weights[j]);
      this.bias -= lr * (gb / n);
    }
  }

  predictScore(Xraw: number[][]): number[] {
    return this.scaler.transform(Xraw).map((r) => sigmoid(r.reduce((a, v, j) => a + v * this.weights[j], this.bias)));
  }
}

/**
 * Adapter for models served elsewhere (e.g. a Python service running Random Forest, XGBoost,
 * LightGBM, LSTM or temporal models). Contract:
 *   POST {baseUrl}/fit      { model, X, y }        -> { ok: true }
 *   POST {baseUrl}/predict  { model, X }           -> { scores: number[] }
 */
export class RemoteModel implements Model {
  constructor(readonly name: 'random_forest' | 'xgboost' | 'lightgbm' | 'lstm' | 'temporal' | string, private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Remote model ${this.name} ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async fit(X: number[][], y: number[]): Promise<void> {
    await this.post('/fit', { model: this.name, X, y });
  }

  async predictScore(X: number[][]): Promise<number[]> {
    const { scores } = await this.post<{ scores: number[] }>('/predict', { model: this.name, X });
    if (scores.length !== X.length) throw new Error('Remote model returned wrong number of scores');
    return scores;
  }
}
