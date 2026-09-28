'use client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { DirectionMark, SignalBadge, StrengthBar } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useSignalStats, useStockSignals } from '@/hooks/queries';
import { fmtDate, fmtDateTimeNpt, fmtNum, fmtPct } from '@/lib/format';
import type { Signal } from '@/lib/types';

export function OverallSignalCard({ symbol }: { symbol: string }) {
  const { data, isLoading, error } = useStockSignals(symbol);
  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <ErrorText error={error} />;
  const o = data?.overall;
  if (!o) return <Empty>No signals yet.</Empty>;
  const meta = (o.meta ?? {}) as { primaryReasons?: string[]; conflictingFactors?: string[] };
  const consensus = data?.consensus?.meta as { scoreLabel?: string } | undefined;
  return (
    <Card>
      <CardHeader>
        <CardDescription>Ensemble signal · {o.timeframe} · candle {fmtDate(o.timestamp)}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-base"><SignalBadge signal={o.signal} className="text-sm" /></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div><div className="mb-1 text-xs text-muted-foreground">Signal strength</div><StrengthBar value={o.strength} /></div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Strategy agreement</div>
          <div className="flex gap-3 text-xs">
            <span className="text-bull">▲ {data!.agreement.bullish} bullish</span>
            <span className="text-neutral">■ {data!.agreement.neutral} neutral</span>
            <span className="text-bear">▼ {data!.agreement.bearish} bearish</span>
          </div>
          {consensus?.scoreLabel && <div className="mt-1 text-xs text-muted-foreground">Multi-indicator consensus score: <b>{consensus.scoreLabel}</b> (count of agreeing conditions, not a probability)</div>}
        </div>
        {!!meta.primaryReasons?.length && (
          <div><div className="text-xs text-muted-foreground">Primary reasons</div><ul className="text-xs">{meta.primaryReasons.map((r) => <li key={r}><DirectionMark direction={o.signal === 'SELL' ? 'BEARISH' : 'BULLISH'} /> {r}</li>)}</ul></div>
        )}
        {!!meta.conflictingFactors?.length && (
          <div><div className="text-xs text-muted-foreground">Conflicting factors</div><ul className="text-xs">{meta.conflictingFactors.slice(0, 5).map((r) => <li key={r}><DirectionMark direction={o.signal === 'SELL' ? 'BULLISH' : 'BEARISH'} /> {r}</li>)}</ul></div>
        )}
        <div className="text-[11px] text-muted-foreground">Regime: {o.marketRegime?.replace(/_/g, ' ') ?? 'N/A'} · Generated {fmtDateTimeNpt(o.generatedAt)}</div>
      </CardContent>
    </Card>
  );
}

function StrategyDetail({ s }: { s: Signal }) {
  return (
    <div className="grid gap-3 p-3 text-xs md:grid-cols-3">
      <div>
        <div className="mb-1 font-semibold">Why this signal</div>
        <ul className="space-y-0.5">
          {s.reasons.map((r, i) => (
            <li key={i}><DirectionMark direction={r.direction} /> {r.condition}{r.value !== null ? ` (${fmtNum(r.value)}${r.threshold !== null ? ` vs ${fmtNum(r.threshold)}` : ''})` : ''}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 font-semibold">Indicators & parameters</div>
        <div className="text-muted-foreground">Uses: {s.indicatorsUsed.join(', ')}</div>
        <div className="text-muted-foreground">Parameters: {s.parameters && Object.keys(s.parameters).length ? Object.entries(s.parameters).map(([k, v]) => `${k}=${v}`).join(', ') : 'defaults'}</div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          {Object.entries(s.indicatorSnapshot).filter(([k]) => k.startsWith('strategy.')).slice(0, 8).map(([k, v]) => `${k.slice(9)}=${fmtNum(v)}`).join(' · ')}
        </div>
      </div>
      <div>
        <div className="mb-1 font-semibold">Assumptions & limitations</div>
        <ul className="list-disc pl-4 text-muted-foreground">{[...s.assumptions, ...s.limitations].map((a) => <li key={a}>{a}</li>)}</ul>
      </div>
    </div>
  );
}

export function StrategyBreakdown({ symbol }: { symbol: string }) {
  const { data, isLoading } = useStockSignals(symbol);
  const [open, setOpen] = useState<string | null>(null);
  if (isLoading) return <Skeleton className="h-64" />;
  const list = data?.strategies.filter((s) => s.strategyId !== 'ensemble') ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy breakdown</CardTitle>
        <CardDescription>Each strategy&apos;s candidate signal and the conditions behind it. Click a row for details.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <thead><tr><Th /><Th>Strategy</Th><Th>Signal</Th><Th>Strength</Th><Th>Key reason</Th></tr></thead>
          <tbody>
            {list.map((s) => (
              <Fragment key={s.strategyId}>
                <tr className="cursor-pointer hover:bg-accent/40" onClick={() => setOpen(open === s.strategyId ? null : s.strategyId)} aria-expanded={open === s.strategyId}>
                  <Td>{open === s.strategyId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Td>
                  <Td className="font-medium">{s.strategyName}</Td>
                  <Td><SignalBadge signal={s.signal} compact /></Td>
                  <Td><StrengthBar value={s.strength} /></Td>
                  <Td className="max-w-[360px] truncate text-xs text-muted-foreground">{s.reasons[0]?.condition}</Td>
                </tr>
                {open === s.strategyId && <tr><td colSpan={5} className="bg-muted/30"><StrategyDetail s={s} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function HistoricalStatsCard({ symbol }: { symbol: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isFetching, error } = useSignalStats(symbol, enabled);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical signal statistics</CardTitle>
        <CardDescription>What happened after each strategy&apos;s past signals on this stock — historical observation only.</CardDescription>
      </CardHeader>
      <CardContent>
        {!enabled ? <Button size="sm" variant="secondary" onClick={() => setEnabled(true)}>Compute statistics</Button> : isFetching && !data ? <Skeleton className="h-40" /> : (
          <>
            <ErrorText error={error} />
            <Table>
              <thead><tr><Th>Strategy</Th><Th className="text-right">Signals</Th><Th className="text-right">Avg 5D</Th><Th className="text-right">Avg 20D</Th><Th className="text-right">Hit rate</Th><Th className="text-right">Worst adverse</Th></tr></thead>
              <tbody>
                {data?.strategies.map((s) => (
                  <tr key={s.strategyId}>
                    <Td>{s.strategyName}</Td><Td className="text-right">{s.signals}</Td>
                    <Td className="text-right font-mono">{fmtPct(s.averageReturn['5'])}</Td><Td className="text-right font-mono">{fmtPct(s.averageReturn['20'])}</Td>
                    <Td className="text-right font-mono">{fmtPct(s.winRatePct, 1, false)}</Td><Td className="text-right font-mono">{fmtPct(s.maxDrawdownPct)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2 text-[11px] text-muted-foreground">{data?.label} Returns are sign-adjusted (SELL signals count as correct when price fell) and exclude costs.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
