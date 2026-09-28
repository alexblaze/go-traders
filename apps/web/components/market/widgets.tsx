'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SignalBadge, StrengthBar } from '@/components/signals/signal-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, ErrorText, Skeleton, Table, Tabs, Td, Th } from '@/components/ui/misc';
import { useSignalFeed, useTrending } from '@/hooks/queries';
import { changeClass, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, sub, className, valueClass }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; valueClass?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', valueClass)}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

const CATEGORIES = [
  { value: 'most_active', label: 'Most active' },
  { value: 'strongest_momentum', label: 'Highest momentum' },
  { value: 'strongest_trend', label: 'Strongest trend' },
  { value: 'highest_volume', label: 'Highest volume' },
  { value: 'top_gainers', label: 'Gainers' },
  { value: 'top_losers', label: 'Decliners' },
] as const;

export function TrendingCard({ limit = 8 }: { limit?: number }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]['value']>('most_active');
  const { data, isLoading, error } = useTrending(cat, limit);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trending stocks</CardTitle>
        <CardDescription>{data?.label ?? 'Ranked by a factual metric'} — not a recommendation.</CardDescription>
        <Tabs value={cat} onChange={setCat} options={[...CATEGORIES]} className="mt-1" />
      </CardHeader>
      <CardContent>
        <ErrorText error={error} />
        {isLoading ? <Skeleton className="h-48" /> : (
          <Table>
            <thead><tr><Th>Symbol</Th><Th className="text-right">Close</Th><Th className="text-right">Chg</Th><Th className="text-right">Turnover</Th><Th className="text-right">ROC12</Th><Th>Ensemble</Th></tr></thead>
            <tbody>
              {data?.items.map((s) => (
                <tr key={s.symbol} className="hover:bg-accent/40">
                  <Td><Link className="font-medium text-primary hover:underline" href={`/stocks/${s.symbol}`}>{s.symbol}</Link></Td>
                  <Td className="text-right font-mono">{fmtNum(s.close)}</Td>
                  <Td className={cn('text-right font-mono', changeClass(s.changePercent))}>{fmtPct(s.changePercent)}</Td>
                  <Td className="text-right font-mono">{fmtNpr(s.turnover)}</Td>
                  <Td className={cn('text-right font-mono', changeClass(s.roc12))}>{fmtPct(s.roc12, 1)}</Td>
                  <Td><SignalBadge signal={s.ensembleSignal} compact /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SignalListCard({ signal, title }: { signal: 'BUY' | 'SELL'; title: string }) {
  const { data, isLoading, error } = useSignalFeed({ signal, strategy: 'ensemble', pageSize: 8 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Ensemble strategy, latest session. Strength is not a probability.</CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorText error={error} />
        {isLoading ? <Skeleton className="h-32" /> : !data?.data.length ? <Empty>No {signal === 'BUY' ? 'bullish' : 'bearish'} ensemble signals on the latest session.</Empty> : (
          <ul className="divide-y divide-border">
            {data.data.map((s) => {
              const meta = (s.meta ?? {}) as { bullishStrategies?: number; neutralStrategies?: number; bearishStrategies?: number };
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/stocks/${s.symbol}`} className="font-medium text-primary hover:underline">{s.symbol}</Link>
                    <div className="text-[11px] text-muted-foreground">{meta.bullishStrategies ?? 0} bullish · {meta.neutralStrategies ?? 0} neutral · {meta.bearishStrategies ?? 0} bearish</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <SignalBadge signal={s.signal} compact />
                    <StrengthBar value={s.strength} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function BreadthBar({ adv, dec, unch }: { adv: number; dec: number; unch: number }) {
  const total = adv + dec + unch || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded" aria-label={`${adv} advancers, ${dec} decliners, ${unch} unchanged`}>
        <div className="bg-bull" style={{ width: `${(adv / total) * 100}%` }} />
        <div className="bg-neutral" style={{ width: `${(unch / total) * 100}%` }} />
        <div className="bg-bear" style={{ width: `${(dec / total) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>▲ {fmtInt(adv)} adv</span><span>■ {fmtInt(unch)} unch</span><span>▼ {fmtInt(dec)} dec</span>
      </div>
    </div>
  );
}
