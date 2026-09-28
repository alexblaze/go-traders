'use client';
import { useState } from 'react';
import { AdvanceDeclineChart, LineSeriesChart, SignedBarChart } from '@/components/charts/simple-charts';
import { PageHeader } from '@/components/layout/require-auth';
import { BreadthBar, StatCard, TrendingCard } from '@/components/market/widgets';
import { DataSourceBadge } from '@/components/signals/signal-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Table, Tabs, Td, Th } from '@/components/ui/misc';
import { useMarketIndex, useMarketSummary, useRegime, useSectors } from '@/hooks/queries';
import { changeClass, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';
import type { SectorRow } from '@/lib/types';
import { cn } from '@/lib/utils';

type Range = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'MAX';
type Period = '1D' | '1W' | '1M' | '3M';

export default function MarketPage() {
  const [range, setRange] = useState<Range>('1Y');
  const [period, setPeriod] = useState<Period>('1D');
  const [sort, setSort] = useState<keyof SectorRow>('averageReturnPct');
  const [desc, setDesc] = useState(true);
  const index = useMarketIndex(range);
  const summary = useMarketSummary();
  const regime = useRegime();
  const sectors = useSectors(period);
  const pts = (index.data?.points ?? []).map((p) => ({ ...p, date: p.date.slice(0, 10), breadth: p.advancers !== null && p.decliners !== null && p.advancers + p.decliners > 0 ? Math.round((p.advancers / (p.advancers + p.decliners)) * 100) : null }));
  const rows = [...(sectors.data?.sectors ?? [])].sort((a, b) => {
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return (av < bv ? -1 : av > bv ? 1 : 0) * (desc ? -1 : 1);
  });
  const th = (k: keyof SectorRow, label: string) => (
    <Th className="cursor-pointer text-right first:text-left" aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'} onClick={() => { setDesc(sort === k ? !desc : true); setSort(k); }}>
      {label}{sort === k ? (desc ? ' ▼' : ' ▲') : ''}
    </Th>
  );
  const t = summary.data?.totals;
  return (
    <div className="space-y-4">
      <PageHeader title="Market" description="Index, breadth, regime and sector analysis." actions={<DataSourceBadge source={summary.data?.dataSource} />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Advancers" value={fmtInt(t?.advancers)} valueClass="text-bull" />
        <StatCard label="Decliners" value={fmtInt(t?.decliners)} valueClass="text-bear" />
        <StatCard label="Unchanged" value={fmtInt(t?.unchanged)} />
        <StatCard label="A/D ratio" value={fmtNum(t?.advanceDeclineRatio)} sub={t ? <BreadthBar adv={t.advancers} dec={t.decliners} unch={t.unchanged} /> : null} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div><CardTitle>{index.data?.name}</CardTitle><CardDescription>{index.data?.note}</CardDescription></div>
            <Tabs value={range} onChange={setRange} options={(['1M', '3M', '6M', '1Y', '3Y', 'MAX'] as Range[]).map((r) => ({ value: r, label: r }))} />
          </CardHeader>
          <CardContent>
            {index.isLoading ? <Skeleton className="h-72" /> : <LineSeriesChart data={pts} x="date" y="value" name="Index" area height={280} />}
            <div className="mt-3 text-xs font-medium text-muted-foreground">Market breadth (% advancers)</div>
            <LineSeriesChart data={pts} x="date" y="breadth" name="Breadth %" height={140} color="hsl(var(--neutral))" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Market regime: {regime.data?.regime.replace(/_/g, ' ') ?? '…'}</CardTitle><CardDescription>{regime.data?.methodology}</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <thead><tr><Th>Metric</Th><Th className="text-right">Value</Th><Th>Reading</Th></tr></thead>
              <tbody>{regime.data?.evidence.map((e) => <tr key={e.metric}><Td>{e.metric}</Td><Td className="text-right font-mono">{fmtNum(e.value)}</Td><Td className="text-xs text-muted-foreground">{e.note}</Td></tr>)}</tbody>
            </Table>
            <div className="mt-4 text-xs font-medium text-muted-foreground">Advance / decline (last 40 sessions)</div>
            <AdvanceDeclineChart data={pts.slice(-40).map((p) => ({ date: p.date.slice(5), advancers: p.advancers, decliners: p.decliners }))} height={160} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Sector analysis</CardTitle><CardDescription>Sectors from the imported market-data universe. Click headers to sort.</CardDescription></div>
          <Tabs value={period} onChange={setPeriod} options={(['1D', '1W', '1M', '3M'] as Period[]).map((r) => ({ value: r, label: r }))} />
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <Table>
            <thead><tr>{th('sector', 'Sector')}{th('companies', 'Cos')}{th('averageReturnPct', 'Avg ret')}{th('medianReturnPct', 'Median')}{th('volume', 'Volume')}{th('turnover', 'Turnover')}{th('bullishSignals', 'Bull sig')}{th('bearishSignals', 'Bear sig')}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sector}>
                  <Td>{r.sector}</Td><Td className="text-right">{r.companies}</Td>
                  <Td className={cn('text-right font-mono', changeClass(r.averageReturnPct))}>{fmtPct(r.averageReturnPct)}</Td>
                  <Td className={cn('text-right font-mono', changeClass(r.medianReturnPct))}>{fmtPct(r.medianReturnPct)}</Td>
                  <Td className="text-right font-mono">{fmtNpr(r.volume)}</Td><Td className="text-right font-mono">{fmtNpr(r.turnover)}</Td>
                  <Td className="text-right text-bull">{r.bullishSignals}</Td><Td className="text-right text-bear">{r.bearishSignals}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <SignedBarChart data={rows.map((r) => ({ sector: r.sector, ret: r.averageReturnPct ?? 0 }))} x="sector" y="ret" unit="%" layout="vertical" height={Math.max(220, rows.length * 28)} />
        </CardContent>
      </Card>
      <TrendingCard limit={15} />
    </div>
  );
}
