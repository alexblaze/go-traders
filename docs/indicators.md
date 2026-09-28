# Indicator engine

`packages/indicators` exposes pure functions returning series aligned with the input (warm-up
positions are `NaN`, serialised as `null`):

* **Trend** — `sma`, `ema` (SMA-seeded), `wma`, `vwap` (rolling or anchored), `macd`, `adx` (Wilder, +DI/−DI), `parabolicSar`
* **Momentum** — `rsi` (Wilder), `stochRsi`, `stochastic`, `williamsR`, `roc`, `cci`
* **Volatility** — `bollinger` (population σ, bandwidth, %B), `atr` (Wilder), `rollingStdev`, `historicalVolatility` (annualised, 240 sessions/yr default)
* **Volume** — `obv`, `volumeSma`, `volumeChange`, `mfi`, `cmf`
* **Levels** — `pivotPoints`, `swingPoints` (confirmed `lookback` bars later), `rollingSupportResistance` (excludes the current bar), `fibonacciRetracement`

`INDICATORS` is a registry of `IndicatorDefinition`s implementing the common interface:

```ts
interface Indicator<TInput, TOutput> {
  name: string;
  calculate(data: TInput, parameters?: Record<string, number>): TOutput;
}
```

`computeSnapshot(candles)` returns the latest values used by signals, screener, watchlists, alerts
and the AI analyst; the worker stores it per stock/date in `technical_indicators`.

## Adding an indicator

1. Implement a pure function in the relevant file (`trend.ts`, `momentum.ts`, …). Never read
   beyond index `i` when computing value `i`.
2. Register it in `registry.ts` with defaults (it then becomes available to
   `GET /api/v1/stocks/:symbol/indicators?ids=...`).
3. Optionally add it to `IndicatorSnapshot` and to `DSL_FIELDS` to expose it in the screener/DSL.
4. Add unit tests with reference values (see `test/indicators.test.ts`, e.g. Wilder RSI reference data).
