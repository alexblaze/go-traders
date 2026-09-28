# API endpoint reference

Generated from the live OpenAPI document (`GET /docs/json`). Interactive docs: **http://localhost:4000/docs**.

* Base path: `/api/v1` (health endpoints are at the root).
* 🔒 = requires `Authorization: Bearer <accessToken>`; admin routes additionally require the `ADMIN` role.
* Success envelope: `{ "success": true, "data": ..., "meta"?: {...} }`
* Error envelope: `{ "success": false, "error": { "code": "INVALID_SYMBOL", "message": "..." }, "requestId": "..." }`

## health

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/health` | Liveness probe |  |
| GET | `/metrics` | Prometheus metrics (API latency, queue depth) |  |
| GET | `/ready` | Readiness probe (database + Redis) |  |

## auth

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Log in with email/password |  |
| POST | `/api/v1/auth/logout` | Revoke refresh token family |  |
| GET | `/api/v1/auth/me` | Current user | 🔒 |
| POST | `/api/v1/auth/refresh` | Rotate refresh token and get a new access token |  |
| POST | `/api/v1/auth/register` | Create an account |  |

## users

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me/settings` | Get user settings | 🔒 |
| PUT | `/api/v1/users/me/settings` | Update user settings | 🔒 |

## stocks

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/stocks` | List/search listed stocks with latest price |  |
| GET | `/api/v1/stocks/{symbol}` | Stock details (fundamentals shown as N/A when unavailable) |  |
| GET | `/api/v1/stocks/{symbol}/history` | Historical OHLCV candles |  |
| GET | `/api/v1/stocks/{symbol}/indicators` | Indicator series for charting (e.g. ids=ema,rsi&params={"ema":{"period":50}}) |  |
| GET | `/api/v1/stocks/{symbol}/quality` | Data-quality report (flags, never modifies) |  |
| GET | `/api/v1/stocks/{symbol}/signals` | Latest BUY/SELL/HOLD candidate signals for every strategy, with reasons |  |
| GET | `/api/v1/stocks/{symbol}/signals/history` | Persisted signal history |  |
| GET | `/api/v1/stocks/{symbol}/signals/stats` | Historical outcome statistics of each strategy on this stock |  |

## market

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/market/index` | Index history (official if imported, otherwise derived composite) |  |
| GET | `/api/v1/market/regime` | Market regime classification with evidence |  |
| GET | `/api/v1/market/sectors` | Sector analysis |  |
| GET | `/api/v1/market/summary` | Market dashboard summary (index, turnover, breadth, 52W highs/lows) |  |
| GET | `/api/v1/market/trending` | Stocks ranked by a factual metric (e.g. highest momentum) |  |

## strategies

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/strategies` | List strategies (built-in + your custom strategies) |  |
| POST | `/api/v1/strategies/custom` | Create a custom rule-based strategy (structured JSON DSL — no code execution) | 🔒 |
| DELETE | `/api/v1/strategies/custom/{id}` | Delete one of your custom strategies | 🔒 |
| GET | `/api/v1/strategies/dsl/fields` | Fields and comparators available to the rule DSL |  |
| GET | `/api/v1/strategies/{id}` | Strategy details |  |
| POST | `/api/v1/strategies/{id}/run` | Run a strategy on a stock now (not persisted) |  |

## signals

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/signals` | Latest signals across stocks |  |

## backtests

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/backtests` | Your backtests | 🔒 |
| POST | `/api/v1/backtests` | Queue a backtest (event-driven, next-bar-open fills, Nepal fee schedules) | 🔒 |
| GET | `/api/v1/backtests/compare` | Compare metrics of several backtests | 🔒 |
| DELETE | `/api/v1/backtests/{id}` | Delete a backtest | 🔒 |
| GET | `/api/v1/backtests/{id}` | Backtest result with equity curve, drawdown, trades and warnings | 🔒 |

## portfolio

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/portfolio` | Paper portfolio: cash, positions, P&L | 🔒 |
| GET | `/api/v1/portfolio/broker` | Broker configuration | 🔒 |
| POST | `/api/v1/portfolio/cash` | Add or remove virtual cash | 🔒 |
| GET | `/api/v1/portfolio/orders` | Paper order history | 🔒 |
| POST | `/api/v1/portfolio/orders` | Place a paper (simulated) market order | 🔒 |
| GET | `/api/v1/portfolio/risk/{symbol}` | Risk analysis: ATR/percent stops, targets, R:R and position sizing | 🔒 |

## watchlists

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/watchlists` | Your watchlists with price, RSI, trend and signal | 🔒 |
| POST | `/api/v1/watchlists` | Create a watchlist | 🔒 |
| DELETE | `/api/v1/watchlists/{id}` | Delete a watchlist | 🔒 |
| GET | `/api/v1/watchlists/{id}` | One watchlist | 🔒 |
| PATCH | `/api/v1/watchlists/{id}` | Rename a watchlist | 🔒 |
| POST | `/api/v1/watchlists/{id}/items` | Add a stock | 🔒 |
| DELETE | `/api/v1/watchlists/{id}/items/{symbol}` | Remove a stock | 🔒 |

## alerts

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/alerts` | Your alerts | 🔒 |
| POST | `/api/v1/alerts` | Create an alert (evaluated by the alert worker) | 🔒 |
| DELETE | `/api/v1/alerts/{id}` | Delete an alert | 🔒 |
| PATCH | `/api/v1/alerts/{id}` | Enable/disable or edit an alert | 🔒 |

## notifications

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/notifications` | In-app notifications | 🔒 |
| POST | `/api/v1/notifications/read-all` | Mark all as read | 🔒 |
| POST | `/api/v1/notifications/{id}/read` | Mark as read | 🔒 |

## screener

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/screener/presets` | Example screens |  |
| POST | `/api/v1/screener/run` | Run a screen (filter builder DSL + quick filters) |  |
| GET | `/api/v1/screener/saved` | Your saved screens | 🔒 |
| POST | `/api/v1/screener/saved` | Save a screen | 🔒 |
| DELETE | `/api/v1/screener/saved/{id}` | Delete a saved screen | 🔒 |

## analytics

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/analytics/signals` | Historical signal performance by strategy (computed by the worker) |  |
| POST | `/api/v1/analytics/signals/refresh` | Recompute signal performance analytics | 🔒 |

## export

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/export/backtests/{id}` | Export a backtest | 🔒 |
| GET | `/api/v1/export/portfolio` | Export paper portfolio | 🔒 |
| POST | `/api/v1/export/screener` | Export screener results |  |
| GET | `/api/v1/export/signals` | Export latest signals across stocks |  |
| GET | `/api/v1/export/stocks/{symbol}/signals` | Export signal history for a stock |  |
| GET | `/api/v1/export/watchlists/{id}` | Export a watchlist | 🔒 |

## ai

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/ai/ask` | Ask the AI analyst (answers only from application data) | 🔒 |
| GET | `/api/v1/ai/explain/{symbol}` | AI technical summary for a stock | 🔒 |
| GET | `/api/v1/ai/status` | AI engine configuration |  |

## admin

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/admin/audit` | Audit log | 🔒 |
| GET | `/api/v1/admin/calendar` | Market calendar configuration | 🔒 |
| PUT | `/api/v1/admin/calendar` | Update trading weekdays and holidays | 🔒 |
| GET | `/api/v1/admin/fees` | Fee schedules (public read) |  |
| POST | `/api/v1/admin/fees` | Create fee schedule | 🔒 |
| DELETE | `/api/v1/admin/fees/{id}` | Delete fee schedule | 🔒 |
| PATCH | `/api/v1/admin/fees/{id}` | Update fee schedule | 🔒 |
| GET | `/api/v1/admin/health` | System health overview | 🔒 |
| GET | `/api/v1/admin/imports` | Import history | 🔒 |
| POST | `/api/v1/admin/imports` | Upload CSV and get a validated preview (nothing is written yet) | 🔒 |
| GET | `/api/v1/admin/imports/{id}` | Import status | 🔒 |
| POST | `/api/v1/admin/imports/{id}/commit` | Commit a previewed import (background job for large files) | 🔒 |
| GET | `/api/v1/admin/jobs` | Queue overview and recent job runs | 🔒 |
| GET | `/api/v1/admin/jobs/failed` | Failed jobs | 🔒 |
| POST | `/api/v1/admin/jobs/{queue}/{id}/retry` | Retry a failed job | 🔒 |
| GET | `/api/v1/admin/sectors` | Sectors | 🔒 |
| POST | `/api/v1/admin/sectors` | Create sector | 🔒 |
| DELETE | `/api/v1/admin/sectors/{id}` | Delete an empty sector | 🔒 |
| PATCH | `/api/v1/admin/sectors/{id}` | Rename sector | 🔒 |
| GET | `/api/v1/admin/settings/regime` | Regime methodology | 🔒 |
| PUT | `/api/v1/admin/settings/regime` | Configure regime methodology | 🔒 |
| POST | `/api/v1/admin/signals/generate` | Recompute indicators and signals for all stocks | 🔒 |
| POST | `/api/v1/admin/stocks` | Create a stock | 🔒 |
| PATCH | `/api/v1/admin/stocks/{symbol}` | Update a stock | 🔒 |
| PATCH | `/api/v1/admin/strategies/{id}` | Enable/disable a strategy | 🔒 |
| PUT | `/api/v1/admin/strategies/{id}/parameters` | Set default parameters for a built-in strategy | 🔒 |
| POST | `/api/v1/admin/sync` | Run market-data synchronisation from the configured provider | 🔒 |
| GET | `/api/v1/admin/users` | Users | 🔒 |
