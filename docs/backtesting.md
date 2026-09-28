# Backtesting methodology

Engine: `packages/backtesting/src/engine.ts` (event-driven, bar by bar). Executed by the
`backtesting` worker queue (`POST /api/v1/backtests`) or synchronously with `?mode=sync`.

## Execution model

For each bar *t* (after an optional `from` date; earlier bars are warm-up history only):

1. **Fill pending order at the open of bar t** (the order was created from bar *t−1*'s signal).
2. **Protective exits intrabar**: stop-loss (% or ATR-multiple set at entry) and take-profit.
   Gaps fill at the open. If both are touched in the same bar, the stop is assumed first (conservative).
3. **Signal** from `strategy.generateSignal(candles[0..t])` — the strategy never sees bar *t+1*.
4. **Mark to market** at the close of bar *t* → equity curve and drawdown.

Alternative `fillMode: "close"` (fill on the signal bar's close) is available but labelled optimistic.
Long-only (NEPSE retail short selling is not available); SELL signals close positions.
Open positions at the end are closed at the last close and flagged `END_OF_DATA`.

## Costs, slippage, liquidity

* **Slippage**: `slippageBps` applied against the trader on every fill.
* **Fees**: `fee_schedules` rows effective on the **trade date** — tiered broker commission, SEBON
  fee, DP charge (per sell) and capital-gains tax on positive realised gains by holding period.
  The seeded schedules are **ILLUSTRATIVE and unverified** — admins must verify them against current
  SEBON/NEPSE/CDSC/IRD notices. A flat `commission` override is available.
* **Position sizing**: `positionSize` × equity, floored to `lotSize`, fees included in the budget.
* **Liquidity**: quantity capped at `maxVolumeParticipation` (default 10%) of the fill bar's volume;
  skipped entries are reported as warnings.

## Metrics

Total return, CAGR (calendar years), max drawdown, Sharpe and Sortino (per-bar returns annualised
with 240 sessions/year, configurable risk-free rate), win rate, profit factor, number of trades,
average trade (% and NPR), average win / loss, maximum consecutive losses, exposure, total fees,
final equity and buy-and-hold return over the same evaluated period. Outputs also include the
equity curve, drawdown curve, trade history (with fee breakdown) and monthly returns.

## Bias controls

| Risk | Control |
|---|---|
| Look-ahead bias | Signal on close, fill next open; strategies receive `candles[0..t]` only; tests assert future candles cannot change past trades/signals |
| Future-data leakage | Rolling S/R excludes the current bar; swing points require confirmation; ML labels embargoed |
| Incorrect ordering / duplicates | `assertBacktestableCandles` rejects unsorted, duplicate or invalid-OHLC data |
| Data snooping / overfitting | Walk-forward optimisation: parameters chosen on each training window, evaluated on the next unseen window |
| Survivorship bias | Delisted/suspended stocks are kept with their history (`status`, `delisted_date`); import them to include them in studies |
| Costs & liquidity | Date-effective fees, slippage, volume participation cap |

Every result carries warnings: historical performance does not guarantee future results;
transaction costs, slippage and liquidity assumptions; missing data; survivorship and look-ahead
bias; parameter overfitting; market regime changes; small samples (< 30 trades).

## Signal outcome analytics

`analyzeSignalOutcomes` records, for each (deduplicated) signal, sign-adjusted forward returns at
5 and 20 sessions and the maximum adverse excursion. `/analytics/signals` aggregates these across
the universe (worker job `signal-performance`). These are historical observations, not forecasts.

## Validation tests

`packages/backtesting/test/backtest.test.ts` uses deterministic datasets to verify entry/exit
prices, slippage, fees, net P&L, equity marking, stops with gaps, liquidity caps, drawdown and
win/loss statistics, date-effective and tiered fees, CGT by holding period, walk-forward windows,
and the look-ahead/ordering/duplicate guards.
