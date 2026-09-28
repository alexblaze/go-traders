'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AlertRow, Backtest, Candle, IndexPoint, MarketSummary, NotificationRow, PaperOrder, Portfolio, SectorRow, Signal, StockDetail, StockRow, StockSignals,
  StrategyInfo, TrendingItem, Watchlist,
} from '@/lib/types';
import { useAuth } from '@/stores/auth';

/** MVP real-time strategy: polling. The API is request/response so SSE/WebSocket can be added later without changes. */
const POLL_MS = 60_000;

export const useMarketSummary = () => useQuery({ queryKey: ['market', 'summary'], queryFn: () => api.get<MarketSummary>('/market/summary'), refetchInterval: POLL_MS });
export const useMarketIndex = (range: string) => useQuery({ queryKey: ['market', 'index', range], queryFn: () => api.get<{ name: string; isDerived: boolean; note?: string; points: IndexPoint[] }>('/market/index', { range }) });
export const useRegime = () => useQuery({ queryKey: ['market', 'regime'], queryFn: () => api.get<{ regime: string; evidence: { metric: string; value: number | null; note: string }[]; basedOn: string; isDerived: boolean; methodology: string }>('/market/regime') });
export const useSectors = (period: string) => useQuery({ queryKey: ['market', 'sectors', period], queryFn: () => api.get<{ asOf: string | null; sectors: SectorRow[] }>('/market/sectors', { period }) });
export const useTrending = (category: string, limit = 10, sector?: string) =>
  useQuery({ queryKey: ['market', 'trending', category, limit, sector], queryFn: () => api.get<{ label: string; items: TrendingItem[]; note: string }>('/market/trending', { category, limit, sector }), refetchInterval: POLL_MS });

export const useStocks = (q: { search?: string; sector?: string; page?: number; pageSize?: number; sort?: string; order?: string }) =>
  useQuery({ queryKey: ['stocks', q], queryFn: () => api.getWithMeta<StockRow[]>('/stocks', q) });
export const useStock = (symbol: string) => useQuery({ queryKey: ['stock', symbol], queryFn: () => api.get<StockDetail>(`/stocks/${symbol}`), refetchInterval: POLL_MS });
export const useHistory = (symbol: string, range: string, timeframe = '1D') =>
  useQuery({ queryKey: ['history', symbol, range, timeframe], queryFn: () => api.get<{ candles: Candle[]; dataSource: string; note?: string }>(`/stocks/${symbol}/history`, { range, timeframe }) });
export const useIndicators = (symbol: string, ids: string[], range: string) =>
  useQuery({
    queryKey: ['indicators', symbol, ids.slice().sort().join(','), range],
    queryFn: () => api.get<{ dates: string[]; series: Record<string, Record<string, (number | null)[]>> }>(`/stocks/${symbol}/indicators`, { ids: ids.join(','), range, params: JSON.stringify({ ema: { period: 20 }, sma: { period: 50 } }) }),
    enabled: ids.length > 0,
  });
export const useStockSignals = (symbol: string) => useQuery({ queryKey: ['signals', symbol], queryFn: () => api.get<StockSignals>(`/stocks/${symbol}/signals`), refetchInterval: POLL_MS });
export const useSignalStats = (symbol: string, enabled: boolean) =>
  useQuery({
    queryKey: ['signals', symbol, 'stats'],
    queryFn: () => api.get<{ strategies: { strategyId: string; strategyName: string; signals: number; averageReturn: Record<string, number | null>; winRatePct: number | null; maxDrawdownPct: number | null }[]; label: string }>(`/stocks/${symbol}/signals/stats`),
    enabled, staleTime: 3600_000,
  });
export const useSignalFeed = (q: { signal?: string; strategy?: string; minStrength?: number; sector?: string; page?: number; pageSize?: number }) =>
  useQuery({ queryKey: ['signal-feed', q], queryFn: () => api.getWithMeta<Signal[]>('/signals', q), refetchInterval: POLL_MS });

export const useStrategies = () => {
  const token = useAuth((s) => s.accessToken);
  return useQuery({ queryKey: ['strategies', !!token], queryFn: () => api.get<StrategyInfo[]>('/strategies') });
};
export const useDslFields = () => useQuery({ queryKey: ['dsl-fields'], queryFn: () => api.get<{ fields: { key: string; label: string }[]; comparators: string[] }>('/strategies/dsl/fields'), staleTime: Infinity });

export const useBacktests = () => useQuery({ queryKey: ['backtests'], queryFn: () => api.getWithMeta<(Omit<Backtest, 'trades'> & { metrics: Backtest['metrics'] })[]>('/backtests', { pageSize: 50 }) });
export const useBacktest = (id: string) =>
  useQuery({
    queryKey: ['backtest', id],
    queryFn: () => api.get<Backtest>(`/backtests/${id}`),
    refetchInterval: (q) => (q.state.data && ['QUEUED', 'RUNNING'].includes(q.state.data.status) ? 1500 : false),
  });

export const usePortfolio = () => useQuery({ queryKey: ['portfolio'], queryFn: () => api.get<Portfolio>('/portfolio'), refetchInterval: POLL_MS });
export const useOrders = () => useQuery({ queryKey: ['portfolio', 'orders'], queryFn: () => api.getWithMeta<PaperOrder[]>('/portfolio/orders', { pageSize: 100 }) });
export const useWatchlists = () => useQuery({ queryKey: ['watchlists'], queryFn: () => api.get<Watchlist[]>('/watchlists'), refetchInterval: POLL_MS });
export const useAlerts = () => useQuery({ queryKey: ['alerts'], queryFn: () => api.get<AlertRow[]>('/alerts') });
export const useNotifications = (enabled: boolean) =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api.getWithMeta<NotificationRow[]>('/notifications', { pageSize: 30 }), refetchInterval: 30_000, enabled });

/** Mutation helper that invalidates the given query keys on success. */
export function useApiMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>, invalidate: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })) });
}
