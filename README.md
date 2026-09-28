# NEPSE Trading Signal & Research Platform

A full-stack research and decision-support platform for the **Nepal Stock Exchange (NEPSE)**:
technical indicators, ten explainable trading strategies, BUY / SELL / HOLD **candidate** signals,
an event-driven backtester with Nepal transaction costs, paper trading, watchlists, alerts, a
screener, market/sector analytics and an AI analyst that answers only from the platform's data.

> **Not financial advice.** Signals are technical-analysis outputs based on available data and do
> not guarantee future performance. *Signal strength* is an internal 0–100 score, **not** a
> probability of profit. Backtests are historical simulations. Live trading is not implemented
> (`LIVE_TRADING_ENABLED=false`).

![Stack](https://img.shields.io/badge/stack-Next.js%20·%20Fastify%20·%20PostgreSQL%20·%20Redis%20·%20BullMQ-blue)

## Contents

- [Quick start (Docker)](#quick-start-docker)
- [Requirements](#requirements)
- [Local development](#local-development)
- [Database, migrations and seed](#database-migrations-and-seed)
- [Market data, providers and CSV import](#market-data-providers-and-csv-import)
- [Features](#features)
- [Strategy and indicator development](#strategy-and-indicator-development)
- [Backtesting methodology](#backtesting-methodology)
- [AI analyst](#ai-analyst)
- [Testing](#testing)
- [Security](#security)
- [Production deployment](#production-deployment)
- [Documentation index](#documentation-index)

## Quick start (Docker)

```bash
git clone https://github.com/alexblaze/go-traders.git
cd go-traders
cp .env.example .env        # then set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, ADMIN_PASSWORD
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |
| Swagger / OpenAPI | http://localhost:4000/docs |
| Health / readiness / metrics | `/health`, `/ready`, `/metrics` on the API |

On first start the API applies migrations and seeds roles, the admin user (`ADMIN_EMAIL` /
`ADMIN_PASSWORD`), strategies, **illustrative (unverified)** fee schedules, calendar/regime settings
and a clearly labelled **DEMO DATA** universe (18 fictional `DM*` stocks, 3 years of synthetic
prices). The worker then computes indicators and signals.

Walkthrough: register → Dashboard → open a trending stock → toggle chart indicators → review the
strategy breakdown → **Backtest** → paper trade → add to a watchlist / create an alert → run the
Screener → ask the AI analyst. Log in as the admin to import real NEPSE CSV data (**Admin → Data import**).

## Requirements

- Docker 24+ with Compose v2 (for the containerised stack), **or**
- Node.js 22, pnpm 10 (`corepack enable`), PostgreSQL 16, Redis 7 for local development.

## Local development

```bash
corepack enable
pnpm install                       # also runs `prisma generate`
cp .env.example .env               # point DATABASE_URL / REDIS_URL at your local services
pnpm db:migrate                    # prisma migrate deploy
pnpm db:seed                       # idempotent; set SEED_DEMO_DATA=false to skip demo data
pnpm dev:api                       # http://localhost:4000 (tsx watch)
pnpm dev:worker                    # BullMQ workers + schedulers
pnpm dev:web                       # http://localhost:3000 (proxies /api/v1 to the API)
```

Useful scripts: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`,
`pnpm --filter @nepse/scripts demo-data` (regenerate `data/sample`).

### Project structure

```
apps/
  web/        Next.js 15 (App Router) · Tailwind · TanStack Query · Zustand · lightweight-charts · Recharts
  api/        Fastify 5 · zod · OpenAPI · JWT/refresh · rate limiting · modules/* (routes → services)
  worker/     BullMQ processors and cron schedulers
packages/
  shared/     domain types, errors, UTC/NPT time, market calendar
  config/     validated environment, queue names
  indicators/ indicator engine (trend, momentum, volatility, volume, levels)
  strategies/ strategy plugins, ensemble/consensus, regime detection, condition DSL
  backtesting/event-driven engine, fees, metrics, walk-forward, signal outcomes
  market-data/providers (CSV, mock, NEPSE HTTP), CSV validation, data quality, demo data
  database/   Prisma schema + migrations, seed, shared data services
  ml/         optional ML research module (features, time-series CV, models)
data/sample/  DEMO DATA CSVs · docker/ · scripts/ · docs/
```

## Database, migrations and seed

- Schema: `packages/database/prisma/schema.prisma` — users/roles/refresh tokens, sectors,
  companies, stocks, daily prices (unique `stock_id, date`), market indices, corporate actions,
  technical indicators, strategies/parameters, signals/components, backtests/trades/metrics,
  portfolios/positions/paper orders/cash, watchlists, alerts, notifications, saved screens,
  imports, fee schedules, job runs, audit logs, holidays, app settings. See [docs/erd.md](docs/erd.md).
- Create a migration after changing the schema: `pnpm db:migrate:dev --name <change>`.
- Apply migrations: `pnpm db:migrate` (the API container does this on start).
- Seed: `pnpm db:seed` (idempotent). Demo data is marked `is_demo` / source `DEMO`.

## Market data, providers and CSV import

The app talks to data vendors only through `MarketDataProvider` (`getSymbols`, `getQuote`,
`getHistoricalPrices`, `getMarketSummary`). Implementations: **CsvProvider** (default, fully
offline), **MockProvider** (synthetic) and **NepseProvider** (schema-validated HTTP adapter for a
licensed vendor or your own gateway, with rate limiting). Select with `MARKET_DATA_PROVIDER`.

CSV import format:

```csv
symbol,date,open,high,low,close,volume,turnover
NABIL,2026-01-01,500,510,495,505,120000,60600000
```

Imports are validated (dates, numbers, OHLC consistency, duplicates, unknown symbols, missing
values), previewed before commit, flagged (not modified) for anomalies, committed idempotently, and
run as background jobs when large. `NEPSE`/`SENSITIVE`/`FLOAT` rows are stored as index series.
Details: [docs/market-data.md](docs/market-data.md).

## Features

| Area | Highlights |
|---|---|
| Dashboard | Index (official if imported, else a labelled derived composite), daily change, turnover, volume, advancers/decliners/unchanged, 52W highs/lows, breadth, index/volume/advance-decline charts, trending stocks, bullish/bearish signals, sector performance |
| Stock page `/stocks/[symbol]` | Header (price, change, volume, turnover), candlestick chart 1D–MAX, EMA/SMA/Bollinger/VWAP/RSI/MACD/Volume toggles, signal markers, overall signal + strength + strategy agreement, per-strategy reasons/assumptions/limitations, historical signal stats, risk tools, paper trade, watchlist/alert, AI summary |
| Indicators | SMA, EMA, WMA, VWAP, MACD, ADX, Parabolic SAR, RSI, Stoch RSI, Stochastic, Williams %R, ROC, CCI, Bollinger, ATR, StdDev, HV, OBV, Volume SMA/change, MFI, CMF, pivots, swings, rolling S/R, Fibonacci |
| Strategies | EMA crossover, RSI, MACD, Bollinger, Trend following, Momentum, Breakout, Mean reversion, Multi-indicator consensus ("N / 6"), Ensemble; custom JSON-DSL strategies |
| Signals | Persisted history with indicator snapshot + regime; feed with filters; exports |
| Backtesting | Event-driven, next-open fills, slippage, lot size, liquidity cap, stops/targets, date-effective Nepal fee schedules, full metric set, equity/drawdown/monthly, trade log, walk-forward, comparison |
| Paper trading | `BrokerAdapter` → `PaperBroker`; cash add/remove, positions, average cost, realised/unrealised P&L, total return; order log with strategy/signal/reason; risk-limit checks |
| Screener | Visual AND/OR builder over indicator fields (with multipliers and crosses), quick filters, sort, presets, saved screens, CSV/JSON/PDF export |
| Alerts | Price cross, RSI thresholds, EMA/MACD crossovers, volume, breakout, BUY/SELL signals → in-app + email (adapters ready for Telegram/SMS/Push) |
| Analytics | Sector analysis (sortable), market regime with evidence, signal-performance analysis (5D/20D returns, win rate, drawdown — historical observations) |
| Admin | CSV import, stocks/sectors, data sync, queues/failed jobs/retry, strategy parameters, fee schedules, system health, audit log |
| Exports | CSV / JSON / PDF for backtests, signals, watchlists, portfolio, market scans |

## Strategy and indicator development

- Add a strategy: implement `TradingStrategy`, register it in `BUILTIN_STRATEGIES`, add tests —
  see [docs/strategies.md](docs/strategies.md).
- Add an indicator: pure function + registry entry (+ optional snapshot/DSL field) —
  see [docs/indicators.md](docs/indicators.md).

## Backtesting methodology

Signals are generated on bar close using only data up to that bar; orders fill at the next bar's
open with slippage; fees come from the schedule effective on each trade date; liquidity is capped
by volume participation. Unsorted/duplicate/invalid data is rejected. Walk-forward optimisation
separates parameter selection from evaluation. Every result lists the relevant warnings
(historical results ≠ future results, costs, slippage, liquidity, missing data, survivorship,
look-ahead, overfitting, regime change). Full description: [docs/backtesting.md](docs/backtesting.md).

## AI analyst

The analyst receives a structured JSON context (observed prices, calculated indicators, strategy
signals, consensus, support/resistance, regime, cached historical stats or backtest metrics) and
answers in fixed sections: Summary, Observed Data, Indicators, Strategy Signals, Historical Context,
Risk Factors, Uncertainty, Data Timestamp.

- `AI_PROVIDER=template` (default): deterministic rule-based analyst, no external calls.
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`: Claude (`AI_MODEL`, default `claude-opus-5-5`)
  with a system prompt that forbids inventing data, adaptive thinking, server-side refusal
  fallbacks, and automatic fallback to the template analyst on errors.

## Testing

```bash
pnpm test               # unit tests (indicators, strategies, backtesting, market data, ML, API units) + web tests
pnpm test:integration   # API + PostgreSQL + Redis + BullMQ (needs TEST_DATABASE_URL / TEST_REDIS_URL)
pnpm test:web           # frontend: dashboard, stock page, screener, backtest, portfolio
```

Integration tests migrate a fresh, uniquely named Postgres schema per run (default database
`postgresql://nepse:nepse@localhost:5432/nepse_test`, Redis db 15) and drop only that schema
afterwards. Coverage includes Wilder RSI reference values, band/ADX math, strategy contracts and
look-ahead checks, deterministic backtest validation (entry/exit, fees, slippage, P&L, drawdown,
equity curve, ordering/duplicate guards), CSV validation, auth (rotation, reuse detection, roles),
imports, paper trading, exports, BullMQ retries.

## Security

JWT access tokens (15 min, in memory in the browser) + opaque refresh tokens (httpOnly, SameSite=Strict
cookie, hashed in DB, rotated, family revocation on reuse); bcrypt password hashing; role-based
authorization (USER/ADMIN); zod validation on every input; Prisma parameterised queries; helmet
security headers + CSP; strict CORS; Redis-backed rate limiting (100 req/min/user default,
stricter on credential and AI endpoints, provider-specific limits for market data); audit log;
log redaction of secrets; XSS-safe rendering (no raw HTML, CSV formula-injection escaping);
secrets only from the environment and never sent to the frontend.

## Production deployment

Containerised API, web and worker images; managed PostgreSQL and Redis; stateless horizontal
scaling; backups, Redis persistence, logging, monitoring and secret management are covered in
[docs/deployment.md](docs/deployment.md).

## Documentation index

- [docs/architecture.md](docs/architecture.md) — architecture diagram, request & signal pipeline, time handling
- [docs/erd.md](docs/erd.md) — database ERD and indexes
- [docs/api.md](docs/api.md) — API endpoint list (generated from OpenAPI)
- [docs/strategies.md](docs/strategies.md) — strategy documentation, DSL, adding strategies
- [docs/indicators.md](docs/indicators.md) — indicator engine
- [docs/backtesting.md](docs/backtesting.md) — backtesting methodology
- [docs/market-data.md](docs/market-data.md) — providers, CSV import, data quality, demo data
- [docs/ml.md](docs/ml.md) — optional ML module
- [docs/deployment.md](docs/deployment.md) — production deployment

## License

MIT — see [LICENSE](LICENSE).
