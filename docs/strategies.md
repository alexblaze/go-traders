# Strategies

All strategies implement `TradingStrategy` (`packages/strategies/src/types.ts`) and return a
`TradingSignal`: `signal` (BUY / SELL / HOLD candidate), `strength` (0–100 internal score —
**not** a probability), `reasons[]` (indicator, condition, value, threshold, direction),
`indicators` (values used) and optional `meta`. Strategies only see candles up to "now"; a test
verifies that appending altered future candles never changes a past signal.

| id | Name | Logic (defaults, all configurable) |
|---|---|---|
| `ema_crossover` | Moving Average Crossover | BUY when EMA20 crosses above EMA50 within `confirmBars`; SELL on the opposite cross |
| `rsi` | RSI Overbought/Oversold | BUY at RSI(14) ≤ 30, SELL at ≥ 70; strength reduced when against the EMA50 trend |
| `macd` | MACD Crossover | MACD(12,26,9) crossing its signal line; histogram momentum + zero-line context |
| `bollinger` | Bollinger Bands | Reversion mode: lower/upper band touches. Breakout mode: close outside bands with volume, boosted after a squeeze |
| `trend_following` | Trend Following | Price > EMA50, EMA20 > EMA50, ADX > 25 with +DI dominant, MACD > signal, volume ≥ avg — `minConditions` of 5 |
| `momentum` | Momentum | RSI, ROC(12), price vs SMA20 and elevated volume each score −1/0/+1; BUY at score ≥ 3, SELL ≤ −3 |
| `breakout` | Breakout | Close > previous 20-day high with volume > 1.5× average (ATR expansion adds strength); mirror for breakdowns |
| `mean_reversion` | Mean Reversion | z-score beyond ±2σ confirmed by RSI; ATR stop + mean target; down-weighted when ADX > 30. *Assumptions may fail in strong trends.* |
| `multi_indicator_consensus` | Multi-Indicator Consensus | EMA trend, MACD, RSI, ADX, Volume, Breakout → "Signal Score N / 6" (count of agreeing conditions) |
| `ensemble` | Ensemble | Votes of 7 member strategies; BUY/SELL needs ≥ 3 supporters and net ≥ 2; reports supporting/neutral/bearish counts, primary reasons and conflicting factors |

Admins can override default parameters (`PUT /api/v1/admin/strategies/:id/parameters`) and
enable/disable strategies. Users can pass per-run parameters (`POST /strategies/:id/run`, backtests).

## Custom strategies (DSL)

Users build rules in the UI; they are stored as structured JSON validated by zod — **no user code
is executed**. Operands are whitelisted indicator fields (`rsi14`, `ema50`, `bbLower`,
`volumeSma20`, …) with an optional multiplier, or numbers. Comparators: `< <= > >= == crossesAbove crossesBelow`.
Groups nest with `AND`/`OR`.

```json
{
  "name": "Oversold bounce with volume",
  "buy": { "op": "AND", "conditions": [
    { "left": { "field": "rsi14" }, "comparator": "<", "right": { "value": 30 } },
    { "left": { "field": "close" }, "comparator": "<", "right": { "field": "bbLower" } },
    { "left": { "field": "volume" }, "comparator": ">", "right": { "field": "volumeSma20" } }
  ]},
  "sell": { "op": "AND", "conditions": [{ "left": { "field": "rsi14" }, "comparator": ">", "right": { "value": 70 } }] }
}
```

The same DSL powers the screener.

## Adding a strategy

1. Create `packages/strategies/src/builtin/my-strategy.ts` implementing `TradingStrategy`
   (declare `parameters`, `indicatorsUsed`, `assumptions`, `limitations`, `minCandles`).
2. Use `resolveParams`, `buildSignal`, `reason`, `insufficientData` from `base.ts`; return HOLD with
   strength 0 when history is insufficient; include both supporting and conflicting reasons.
3. Register it in `BUILTIN_STRATEGIES` (`registry.ts`) — the seed inserts the DB row on next start.
4. Add unit tests in `packages/strategies/test` (scenario data + the contract tests run automatically).

## Market regime

`detectRegime` classifies STRONG_UPTREND / UPTREND / SIDEWAYS / DOWNTREND / STRONG_DOWNTREND /
HIGH_VOLATILITY from EMA50/EMA200 alignment, ADX(14) (≥ 20 trending, ≥ 30 strong), 20-day
annualised volatility (≥ 45% → high volatility) and, for the market, breadth. Thresholds live in
`app_settings['market.regime']` and are editable by admins.
