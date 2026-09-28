# Database ERD

PostgreSQL schema managed by Prisma (`packages/database/prisma/schema.prisma`,
migrations in `packages/database/prisma/migrations`). Core relationships:

```mermaid
erDiagram
    roles ||--o{ users : has
    users ||--o{ refresh_tokens : owns
    users ||--o{ portfolios : owns
    users ||--o{ watchlists : owns
    users ||--o{ alerts : owns
    users ||--o{ notifications : receives
    users ||--o{ backtests : runs
    users ||--o{ saved_screens : saves
    users ||--o{ strategies : "custom (DSL)"
    users ||--o{ market_data_imports : uploads
    users ||--o{ audit_logs : "acts in"
    sectors ||--o{ companies : groups
    companies ||--|| stocks : lists
    stocks ||--o{ daily_prices : "OHLCV (unique stock_id,date)"
    stocks ||--o{ corporate_actions : has
    stocks ||--o{ technical_indicators : "snapshot per date"
    stocks ||--o{ signals : receives
    strategies ||--o{ strategy_parameters : configures
    strategies ||--o{ signals : generates
    signals ||--o{ signal_components : "explained by"
    strategies ||--o{ backtests : tested
    stocks ||--o{ backtests : "tested on"
    backtests ||--o{ backtest_trades : contains
    backtests ||--|| backtest_metrics : summarised
    portfolios ||--o{ portfolio_positions : holds
    portfolios ||--o{ paper_orders : records
    portfolios ||--o{ cash_transactions : records
    watchlists ||--o{ watchlist_items : contains
    stocks ||--o{ watchlist_items : "watched in"
    alerts ||--o{ notifications : triggers
```

Standalone tables: `market_indices` (official or derived index series, unique `name,date`),
`fee_schedules` (effective-dated, tiered, CGT holding periods, `is_verified`), `job_runs`
(BullMQ execution history), `market_holidays`, `app_settings` (calendar, regime methodology,
analytics results).

## Indexing highlights

| Table | Index / constraint | Purpose |
|---|---|---|
| `daily_prices` | `UNIQUE (stock_id, date)`, `INDEX (date)` | the (symbol, date) access path; idempotent imports |
| `technical_indicators` | `UNIQUE (stock_id, date)` | latest-snapshot lookups (`DISTINCT ON`) |
| `signals` | `UNIQUE (stock_id, strategy_id, timestamp)`, `(timestamp)`, `(strategy_id, timestamp)`, `(signal, timestamp)` | signal history + feeds |
| `refresh_tokens` | `UNIQUE (token_hash)`, `(family_id)` | rotation + reuse detection |
| `job_runs` | `UNIQUE (queue, job_id)`, `(queue, status)` | admin job views |
| `audit_logs` | `(user_id, created_at)`, `(action)` | audit queries |

Refresh tokens are stored as SHA-256 hashes; passwords as bcrypt (cost 12).
