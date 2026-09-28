import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import DashboardPage from '@/app/page';
import BacktestDetailPage from '@/app/backtests/[id]/page';
import PortfolioPage from '@/app/portfolio/page';
import ScreenerPage from '@/app/screener/page';
import StockPage from '@/app/stocks/[symbol]/page';
import { useAuth } from '@/stores/auth';
import { reason, signal, summary } from './fixtures';
import { loginAs, mockApi, renderPage, resolvedParams } from './utils';

beforeEach(() => useAuth.setState({ accessToken: null, user: null, initialized: true }));

describe('Dashboard', () => {
  it('shows market cards, DEMO labelling, derived-index disclaimer and signal lists', async () => {
    mockApi({
      '/api/v1/market/summary': summary,
      '/api/v1/market/index': { name: 'Derived Equal-Weight Index', isDerived: true, note: 'NOT the official NEPSE index.', points: [] },
      '/api/v1/market/regime': { regime: 'UPTREND', evidence: [], basedOn: 'x', isDerived: true, methodology: 'rules' },
      '/api/v1/market/sectors': { asOf: null, sectors: [] },
      '/api/v1/market/trending': { label: 'Most active (by turnover)', note: '', items: [{ symbol: 'DMCB1', companyName: 'x', sector: null, isDemo: true, close: 505, changePercent: 1.2, volume: 1, turnover: 1e8, rsi14: 50, roc12: 2, adx14: 20, volumeRatio: 1, ensembleSignal: 'BUY', ensembleStrength: 70, bullishStrategies: 5, bearishStrategies: 1 }] },
      '/api/v1/signals': (u: URL) => (u.searchParams.get('signal') === 'BUY' ? [signal('ensemble', 'BUY', { meta: { bullishStrategies: 6, neutralStrategies: 2, bearishStrategies: 1 } })] : []),
    });
    renderPage(<DashboardPage />);
    expect(await screen.findByText('1,078.35')).toBeInTheDocument();
    expect(screen.getByText('Not the official NEPSE index')).toBeInTheDocument();
    expect(screen.getByText('Data Source: DEMO DATA')).toBeInTheDocument();
    expect(screen.getByText('-0.16%')).toHaveClass('text-bear');
    expect(await screen.findByText('6 bullish · 2 neutral · 1 bearish')).toBeInTheDocument();
    expect(screen.getByText('No bearish ensemble signals on the latest session.')).toBeInTheDocument();
    expect(screen.getAllByText('BUY').length).toBeGreaterThan(0); // text label, not colour only
  });
});

describe('Stock page', () => {
  it('renders header, chart, overall signal with agreement and expandable strategy reasons', async () => {
    const ens = signal('ensemble', 'BUY', { meta: { primaryReasons: ['EMA trend positive'], conflictingFactors: ['RSI elevated'] } });
    mockApi({
      '/api/v1/stocks/DMCB1': { symbol: 'DMCB1', companyName: 'Demo Bank', sector: 'Commercial Banks', subSector: 'N/A', listedDate: 'N/A', sharesOutstanding: 'N/A', paidUpCapital: 'N/A', status: 'ACTIVE', isDemo: true, dataSource: 'DEMO', quote: { date: '2026-09-24', open: 500, high: 510, low: 495, close: 505, volume: 120000, turnover: 6e7, change: 5, changePercent: 1, previousClose: 500 }, high52w: 600, low52w: 400, avgVolume1y: 100000 },
      '/api/v1/stocks/DMCB1/signals': { symbol: 'DMCB1', date: '2026-09-24', marketRegime: 'UPTREND', overall: ens, consensus: signal('multi_indicator_consensus', 'BUY', { meta: { scoreLabel: '5 / 6' } }), agreement: { bullish: 6, neutral: 2, bearish: 1, total: 9 }, strategies: [ens, signal('macd', 'BUY', { strategyName: 'MACD Crossover', reasons: [reason('MACD crossed above signal line (bullish crossover)', 'BULLISH')] })], dataSource: 'DEMO', disclaimer: '' },
      '/api/v1/stocks/DMCB1/history': { candles: [{ date: '2026-09-24', open: 1, high: 2, low: 1, close: 2, volume: 1 }], dataSource: 'DEMO' },
      '/api/v1/stocks/DMCB1/indicators': { dates: [], series: {} },
      '/api/v1/stocks/DMCB1/signals/history': [],
    });
    renderPage(<StockPage params={resolvedParams({ symbol: 'dmcb1' })} />);
    expect(await screen.findByText('DMCB1 · Demo Bank')).toBeInTheDocument();
    expect(await screen.findByTestId('candle-chart')).toBeInTheDocument();
    expect(await screen.findByText('▲ 6 bullish')).toBeInTheDocument();
    expect(screen.getByText('5 / 6')).toBeInTheDocument();
    expect(screen.getByText(/EMA trend positive/)).toBeInTheDocument();
    expect(screen.getAllByRole('meter', { name: 'Signal strength' })[0]).toHaveAttribute('aria-valuenow', '78');
    fireEvent.click(screen.getByText('MACD Crossover'));
    expect(await screen.findByText('Why this signal')).toBeInTheDocument();
    expect(screen.getByText('Lagging.')).toBeInTheDocument();
    expect(screen.getAllByText('Log in').length).toBeGreaterThan(0); // paper trade & AI require login
  });
});

describe('Screener', () => {
  it('builds a DSL filter and shows results', async () => {
    const calls = mockApi({
      '/api/v1/strategies/dsl/fields': { fields: [{ key: 'rsi14', label: 'RSI 14' }, { key: 'adx14', label: 'ADX 14' }, { key: 'ema20', label: 'EMA 20' }, { key: 'ema50', label: 'EMA 50' }, { key: 'close', label: 'Price (close)' }], comparators: ['<', '>'] },
      '/api/v1/market/sectors': { asOf: null, sectors: [] },
      '/api/v1/screener/presets': [{ name: 'Strong trend', description: 'ADX > 25', screen: { filter: { op: 'AND', conditions: [] } } }],
      'POST /api/v1/screener/run': { asOf: '2026-09-24', total: 1, note: 'not recommendations', items: [{ symbol: 'DMHY1', sector: 'Hydro', matched: [], signal: 'SELL', signalStrength: 65, close: 140 }] },
    });
    renderPage(<ScreenerPage />);
    await screen.findByText('Strong trend');
    fireEvent.click(screen.getByRole('button', { name: 'Condition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run screen' }));
    expect(await screen.findByText('1 matching stocks')).toBeInTheDocument();
    const run = calls.find((c) => c.method === 'POST');
    expect((run!.body as { filter: { conditions: unknown[] } }).filter.conditions).toHaveLength(3);
    expect(screen.getByText('DMHY1')).toBeInTheDocument();
  });
});

describe('Backtest result', () => {
  it('shows metrics, curves, trades and warnings', async () => {
    loginAs();
    mockApi({
      '/api/v1/backtests/b1': {
        id: 'b1', status: 'COMPLETED', progress: 100, error: null, createdAt: '2026-09-24T00:00:00Z', completedAt: '2026-09-24T00:00:00Z', symbol: 'DMHY1', companyName: 'x', isDemo: true,
        strategyId: 'macd', strategyName: 'MACD Crossover', config: {}, parameters: {}, from: '2024-01-01', to: '2026-09-24', initialCapital: 1e6,
        metrics: { totalReturnPct: 12.5, cagrPct: 4.4, maxDrawdownPct: 18.2, sharpeRatio: 0.7, sortinoRatio: 1.1, winRatePct: 45, profitFactor: 1.3, numberOfTrades: 2, averageTradePct: 3, averageTradePnl: 1000, averageWinningTradePct: 9, averageLosingTradePct: -4, maxConsecutiveLosses: 1, exposurePct: 50, totalFees: 1234, finalEquity: 1125000, buyAndHoldReturnPct: 20 },
        trades: [{ id: 't1', entryDate: '2025-01-02', entryPrice: 100, exitDate: '2025-02-02', exitPrice: 110, quantity: 100, grossPnl: 1000, fees: 50, netPnl: 950, returnPct: 9.5, holdingDays: 31, exitReason: 'SIGNAL' }],
        equityCurve: [{ date: '2025-01-01', equity: 1e6, drawdownPct: 0 }], monthlyReturns: [], signals: [], walkForward: null,
        warnings: ['Historical performance does not guarantee future results.', 'Survivorship bias: the tested universe may exclude delisted companies.'],
      },
    });
    renderPage(<BacktestDetailPage params={resolvedParams({ id: 'b1' })} />);
    expect(await screen.findByText('+12.50%')).toBeInTheDocument();
    expect(screen.getByText('Buy & hold +20.00%')).toBeInTheDocument();
    expect(screen.getByTestId('drawdown-chart')).toBeInTheDocument();
    expect(screen.getByText('Trade history')).toBeInTheDocument();
    expect(screen.getByText(/Survivorship bias/)).toBeInTheDocument();
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument();
  });
});

describe('Paper portfolio', () => {
  it('shows P&L and submits an order', async () => {
    loginAs();
    const calls = mockApi({
      '/api/v1/portfolio': { id: 'p', name: 'Paper', cash: 900000, initialCash: 1e6, netDeposits: 0, invested: 100000, marketValue: 110000, equity: 1010000, unrealizedPnl: 10000, realizedPnl: -500, totalReturnPct: 1, exposurePct: 10.9, note: 'Simulated portfolio.', positions: [{ symbol: 'DMCB1', quantity: 200, averageCost: 500, marketPrice: 550, marketValue: 110000, unrealizedPnl: 10000, unrealizedPnlPct: 10, realizedPnl: 0, weightPct: 10.9 }] },
      '/api/v1/portfolio/orders': [],
      'POST /api/v1/portfolio/orders': { status: 'FILLED', filledPrice: 551, fees: { total: 12.5 }, realizedPnl: null },
    });
    renderPage(<PortfolioPage />);
    expect(await screen.findByText('Simulated portfolio.')).toBeInTheDocument();
    const positions = screen.getByText('Positions').closest('div')!.parentElement!;
    expect(within(positions).getByText('DMCB1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'dmcb1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy (paper)' }));
    await waitFor(() => expect(screen.getByText(/Filled at 551.00/)).toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST');
    expect(post!.body).toMatchObject({ symbol: 'DMCB1', side: 'BUY', quantity: 10 });
    expect(post!.url.pathname).toBe('/api/v1/portfolio/orders');
  });
});
