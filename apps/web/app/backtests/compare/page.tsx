'use client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Callout, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { fmtNum, fmtPct } from '@/lib/format';
import type { BacktestMetrics } from '@/lib/types';

const COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#22d3ee'];
interface Item { id: string; symbol: string; strategyName: string; metrics: BacktestMetrics | null; equityCurve: { date: string; equity: number }[] | null }

function Compare() {
  const ids = useSearchParams().get('ids') ?? '';
  const { data, isLoading, error } = useQuery({ queryKey: ['compare', ids], queryFn: () => api.get<Item[]>('/backtests/compare', { ids }) });
  if (isLoading) return <Skeleton className="h-96" />;
  const items = data ?? [];
  // Normalise equity to 100 at start so strategies with different capital are comparable.
  const byDate = new Map<string, Record<string, number | string>>();
  items.forEach((it, i) => {
    const base = it.equityCurve?.[0]?.equity ?? 1;
    it.equityCurve?.forEach((p) => {
      const row = byDate.get(p.date) ?? { date: p.date };
      row[`s${i}`] = Math.round((p.equity / base) * 10000) / 100;
      byDate.set(p.date, row);
    });
  });
  const series = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows: [string, (m: BacktestMetrics) => string][] = [
    ['Total return', (m) => fmtPct(m.totalReturnPct)], ['Buy & hold', (m) => fmtPct(m.buyAndHoldReturnPct)], ['CAGR', (m) => fmtPct(m.cagrPct)], ['Max drawdown', (m) => fmtPct(-m.maxDrawdownPct)],
    ['Sharpe', (m) => fmtNum(m.sharpeRatio)], ['Sortino', (m) => fmtNum(m.sortinoRatio)], ['Win rate', (m) => fmtPct(m.winRatePct, 1, false)], ['Profit factor', (m) => fmtNum(m.profitFactor)],
    ['Trades', (m) => String(m.numberOfTrades)], ['Avg trade', (m) => fmtPct(m.averageTradePct)], ['Total fees', (m) => fmtNum(m.totalFees)],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Compare backtests" />
      <ErrorText error={error} />
      <Callout tone="warn">Historical comparison only — relative performance on past data does not guarantee future performance.</Callout>
      <Card>
        <CardHeader><CardTitle>Normalised equity (start = 100)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={40} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={['auto', 'auto']} width={50} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Legend />
              {items.map((it, i) => <Line key={it.id} dataKey={`s${i}`} name={`${it.symbol} · ${it.strategyName}`} stroke={COLORS[i % COLORS.length]} dot={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Metric</Th>{items.map((it) => <Th key={it.id} className="text-right">{it.symbol} · {it.strategyName}</Th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label}><Td>{label}</Td>{items.map((it) => <Td key={it.id} className="text-right font-mono">{it.metrics ? f(it.metrics) : 'N/A'}</Td>)}</tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ComparePage() {
  return <RequireAuth><Suspense fallback={<Skeleton className="h-96" />}><Compare /></Suspense></RequireAuth>;
}
