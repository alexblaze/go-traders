'use client';
import { useQuery } from '@tanstack/react-query';
import { CandleChart } from '@/components/charts/candle-chart';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Callout, ErrorText, Skeleton, Tabs } from '@/components/ui/misc';
import { useHistory, useIndicators } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { Signal } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useUi, type ChartIndicator, type ChartRange } from '@/stores/ui';

const RANGES: ChartRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];
const TOGGLES: { id: ChartIndicator; label: string }[] = [
  { id: 'ema', label: 'EMA 20' }, { id: 'sma', label: 'SMA 50' }, { id: 'bb', label: 'Bollinger' }, { id: 'vwap', label: 'VWAP' },
  { id: 'rsi', label: 'RSI' }, { id: 'macd', label: 'MACD' }, { id: 'volume', label: 'Volume' },
];

export function ChartPanel({ symbol }: { symbol: string }) {
  const { chartRange, setChartRange, chartIndicators, toggleIndicator } = useUi();
  const history = useHistory(symbol, chartRange);
  const serverIds = chartIndicators.filter((i) => i !== 'volume');
  const ind = useIndicators(symbol, serverIds, chartRange);
  const markers = useQuery({
    queryKey: ['signal-markers', symbol],
    queryFn: () => api.get<Signal[]>(`/stocks/${symbol}/signals/history`, { strategy: 'ensemble', pageSize: 200 }),
  });
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <Tabs value={chartRange} onChange={setChartRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Indicators">
          {TOGGLES.map((t) => (
            <button key={t.id} aria-pressed={chartIndicators.includes(t.id)} onClick={() => toggleIndicator(t.id)}
              className={cn('rounded border px-2 py-0.5 text-xs', chartIndicators.includes(t.id) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ErrorText error={history.error ?? ind.error} />
        {history.isLoading ? <Skeleton className="h-[440px]" /> : history.data?.candles.length ? (
          <>
            <CandleChart candles={history.data.candles} indicators={ind.data} enabled={chartIndicators} markers={(markers.data ?? []).map((s) => ({ date: s.timestamp, signal: s.signal }))} />
            {chartRange === '1D' && <Callout className="mt-2">End-of-day data: the 1D range shows the latest session only.</Callout>}
            <p className="mt-2 text-[11px] text-muted-foreground">Arrows mark persisted ensemble BUY/SELL candidate signals.</p>
          </>
        ) : <p className="text-sm text-muted-foreground">No price history available.</p>}
      </CardContent>
    </Card>
  );
}
