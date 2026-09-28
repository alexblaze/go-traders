'use client';
import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { PageHeader } from '@/components/layout/require-auth';
import { DataSourceBadge } from '@/components/signals/signal-badge';
import { Disclaimer } from '@/components/signals/disclaimer';
import { AiExplainCard, PaperTradeCard, RiskCard, WatchAlertCard } from '@/components/stock/actions';
import { ChartPanel } from '@/components/stock/chart-panel';
import { HistoricalStatsCard, OverallSignalCard, StrategyBreakdown } from '@/components/stock/signal-panel';
import { StatCard } from '@/components/market/widgets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorText, Skeleton } from '@/components/ui/misc';
import { useStock, useStockSignals } from '@/hooks/queries';
import { changeClass, fmtDate, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = raw.toUpperCase();
  const { data: s, isLoading, error } = useStock(symbol);
  const signals = useStockSignals(symbol);
  if (error) return <ErrorText error={error} />;
  if (isLoading || !s) return <Skeleton className="h-96" />;
  const q = s.quote;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${s.symbol} · ${s.companyName}`}
        description={`${s.sector}${q ? ` · Last session ${fmtDate(q.date)}` : ''} · Status ${s.status}`}
        actions={<><DataSourceBadge source={s.dataSource} /><Link href={`/backtests?symbol=${s.symbol}`}><Button size="sm" variant="outline"><FlaskConical className="h-4 w-4" /> Backtest</Button></Link></>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Price" value={fmtNum(q?.close)} />
        <StatCard label="Daily change" value={fmtPct(q?.changePercent)} valueClass={changeClass(q?.changePercent)} sub={fmtNum(q?.change)} />
        <StatCard label="Volume" value={fmtInt(q?.volume)} sub={`1Y avg ${fmtInt(s.avgVolume1y)}`} />
        <StatCard label="Turnover (NPR)" value={fmtNpr(q?.turnover)} />
        <StatCard label="52W range" value={`${fmtNum(s.low52w, 0)}–${fmtNum(s.high52w, 0)}`} />
        <StatCard label="Paid-up capital" value={String(s.paidUpCapital)} sub="N/A = not available (never estimated)" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ChartPanel symbol={symbol} />
          <StrategyBreakdown symbol={symbol} />
          <HistoricalStatsCard symbol={symbol} />
          <AiExplainCard symbol={symbol} />
        </div>
        <div className="space-y-4">
          <OverallSignalCard symbol={symbol} />
          <PaperTradeCard symbol={symbol} signal={signals.data?.overall?.signal} />
          <RiskCard symbol={symbol} />
          <WatchAlertCard symbol={symbol} />
          <Card>
            <CardHeader><CardTitle>Company</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-muted-foreground">Sub-sector</span><span>{String(s.subSector)}</span>
              <span className="text-muted-foreground">Listed</span><span>{String(s.listedDate).slice(0, 10)}</span>
              <span className="text-muted-foreground">Shares outstanding</span><span>{String(s.sharesOutstanding)}</span>
            </CardContent>
          </Card>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
