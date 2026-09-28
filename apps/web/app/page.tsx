'use client';
import Link from 'next/link';
import { AdvanceDeclineChart, LineSeriesChart, SignedBarChart } from '@/components/charts/simple-charts';
import { PageHeader } from '@/components/layout/require-auth';
import { BreadthBar, SignalListCard, StatCard, TrendingCard } from '@/components/market/widgets';
import { DataSourceBadge } from '@/components/signals/signal-badge';
import { Disclaimer } from '@/components/signals/disclaimer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Callout, ErrorText, Skeleton } from '@/components/ui/misc';
import { useMarketIndex, useMarketSummary, useRegime, useSectors } from '@/hooks/queries';
import { changeClass, fmtDate, fmtNpr, fmtNum, fmtPct } from '@/lib/format';

export default function DashboardPage() {
  const summary = useMarketSummary();
  const index = useMarketIndex('1Y');
  const regime = useRegime();
  const sectors = useSectors('1D');
  const s = summary.data;
  const t = s?.totals;
  const points = index.data?.points ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market Dashboard"
        description={s?.asOf ? `Latest session: ${fmtDate(s.asOf)} (end-of-day data)` : 'Loading latest session…'}
        actions={<><DataSourceBadge source={s?.dataSource} />{regime.data && <Badge title={regime.data.methodology}>Regime: {regime.data.regime.replace(/_/g, ' ')}</Badge>}</>}
      />
      <ErrorText error={summary.error} />
      {s?.dataSource === 'DEMO' && (
        <Callout tone="warn" title="DEMO DATA">All prices shown are synthetic demo data for development. Import real NEPSE CSV data from Admin → Data Import.</Callout>
      )}

      {summary.isLoading ? <Skeleton className="h-24" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={s?.index?.isDerived ? 'Composite index (derived)' : 'NEPSE Index'} value={fmtNum(s?.index?.value)} sub={s?.index?.isDerived ? 'Not the official NEPSE index' : undefined} />
          <StatCard label="Daily change" value={fmtPct(s?.index?.changePercent)} valueClass={changeClass(s?.index?.changePercent)} sub={fmtNum(s?.index?.change)} />
          <StatCard label="Total turnover (NPR)" value={fmtNpr(t?.turnover)} />
          <StatCard label="Total volume" value={fmtNpr(t?.volume)} sub={`${t?.stocksTraded ?? 0} stocks traded`} />
          <StatCard label="52W highs / lows" value={`${t?.high52w ?? 0} / ${t?.low52w ?? 0}`} />
          <Card>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Market breadth</div>
              <div className="mb-1 mt-1 font-mono text-lg font-semibold">{t?.breadth !== null && t?.breadth !== undefined ? `${(t.breadth * 100).toFixed(0)}%` : 'N/A'}</div>
              {t && <BreadthBar adv={t.advancers} dec={t.decliners} unch={t.unchanged} />}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{index.data?.name ?? 'Index'}</CardTitle>
            <CardDescription>{index.data?.note}</CardDescription>
          </CardHeader>
          <CardContent>{index.isLoading ? <Skeleton className="h-60" /> : <LineSeriesChart data={points.map((p) => ({ ...p, date: p.date.slice(0, 10) }))} x="date" y="value" name="Index" area />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Advance / decline (3M)</CardTitle><CardDescription>Stocks up vs down each session</CardDescription></CardHeader>
          <CardContent>
            <AdvanceDeclineChart data={points.slice(-63).map((p) => ({ date: p.date.slice(5, 10), advancers: p.advancers, decliners: p.decliners }))} height={240} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TrendingCard /></div>
        <Card>
          <CardHeader><CardTitle>Volume (3M)</CardTitle></CardHeader>
          <CardContent><LineSeriesChart data={points.slice(-63).map((p) => ({ date: p.date.slice(0, 10), volume: p.volume ?? 0 }))} x="date" y="volume" name="Volume" area height={240} color="hsl(var(--neutral))" /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SignalListCard signal="BUY" title="Bullish signals" />
        <SignalListCard signal="SELL" title="Bearish signals" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sector performance (1D)</CardTitle>
          <CardDescription>Average daily return by sector. <Link className="text-primary hover:underline" href="/market">Full sector analysis →</Link></CardDescription>
        </CardHeader>
        <CardContent>
          {sectors.isLoading ? <Skeleton className="h-60" /> : (
            <SignedBarChart data={(sectors.data?.sectors ?? []).map((x) => ({ sector: x.sector, avg: x.averageReturnPct ?? 0 })).sort((a, b) => b.avg - a.avg)} x="sector" y="avg" unit="%" layout="vertical" height={Math.max(200, (sectors.data?.sectors.length ?? 0) * 28)} />
          )}
        </CardContent>
      </Card>
      <Disclaimer />
    </div>
  );
}
