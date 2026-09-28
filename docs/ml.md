# Machine-learning module (optional)

`packages/ml` provides the scaffolding to research ML signals **without** leaking future data.
It is not wired into live signals by default; ML output must never be displayed as a probability
unless it has been calibrated and documented as such.

## Features (`FEATURE_DOCS`)

All features at row *t* use only candles up to *t*:

| Feature | Definition |
|---|---|
| ret1 / ret5 / ret20 | log returns over 1 / 5 / 20 sessions |
| rsi14 | RSI(14) / 100 |
| macdHistNorm | MACD histogram / close |
| adx14 | ADX(14) / 100 |
| diSpread | (+DI − −DI) / 100 |
| emaSpread | (EMA20 − EMA50) / EMA50 |
| priceVsEma50 | (close − EMA50) / EMA50 |
| bbPercentB | Bollinger %B |
| atrPct | ATR(14) / close |
| hv20 | 20-day annualised volatility / 100 |
| volumeRatio | log(volume / 20-day average volume) |
| roc12 | ROC(12) / 100 |

Label: `1` if the close-to-close return over the next `horizon` sessions exceeds `threshold`.
The last `horizon` rows have unknown labels and are excluded.

## Validation

* `chronologicalSplit` — train / validation / out-of-sample test in time order, **never shuffled**,
  with an embargo of `horizon` rows between segments (labels cannot overlap the next segment).
* `walkForwardSplits` / `walkForwardEvaluate` — expanding-window re-fitting; only out-of-sample
  predictions are scored.
* Scalers are fitted on training data only.
* `classificationMetrics` reports accuracy, precision, recall, log-loss, base rate and a calibration
  table (mean score vs observed frequency per bucket).
* Survivorship bias: build datasets from all stocks including delisted ones (they remain in the DB).
* Data snooping: tune hyper-parameters on validation, report the test segment once.

## Models

* `LogisticRegression` — dependency-free baseline.
* `RemoteModel` — adapter for Random Forest, XGBoost, LightGBM, LSTM or temporal models served by
  a separate (e.g. Python) service implementing `POST /fit` and `POST /predict`.

Tests (`packages/ml/test`) assert no look-ahead in features, no shuffling, embargo gaps, and
walk-forward ordering.
