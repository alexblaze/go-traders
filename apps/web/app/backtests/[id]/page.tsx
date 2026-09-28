'use client';
import { useQuery } from '@tanstack/react-query';
import { use, useState } from 'react';
import { DrawdownChart, LineSeriesChart, SignedBarChart } from '@/components/charts/simple-charts';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { StatCard } from '@/components/market/widgets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/ui/markdown';
import { Badge, Callout, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useBacktest } from '@/hooks/queries';
import { api, download } from '@/lib/api';
import { changeClass, fmtDate, fmtDateTimeNpt, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';
import type { AiAnswer } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function BacktestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: b, isLoading, error } = useBacktest(id);
  const [explain, setExplain] = useState(false);
  const ai = useQuery({ queryKey: ['ai-backtest', id], queryFn: () => api.post<AiAnswer>('/ai/ask', { backtestId: id, question: 'Explain this backtest.' }), enabled: explain });
  return (
    <RequireAuth>
      {isLoading || !b ? <><ErrorText error={error} /><Skeleton className="h-96" /></> : (
        <div className="space-y-4">
          <PageHeader
            title={`${b.symbol} · ${b.strategyName}`}
            description={`${fmtDate(b.from)} → ${fmtDate(b.to)} · Created ${fmtDateTimeNpt(b.createdAt)}`}
            actions={<>
              <Badge>{b.status}</Badge>{b.isDemo && <Badge className="border-yellow-500 text-yellow-500">DEMO DATA</Badge>}
              {b.status === 'COMPLETED' && ['csv', 'json', 'pdf'].map((f) => <Button key={f} size="sm" variant="outline" onClick={() => download(`/export/backtests/${b.id}`, { format: f })}>{f.toUpperCase()}</Button>)}
            </>}
          />
          {b.status === 'FAILED' && <Callout tone="error" title="Backtest failed">{b.error}</Callout>}
          {['QUEUED', 'RUNNING'].includes(b.status) && (
            <Card><CardContent className="p-4">
              <div className="mb-2 text-sm">{b.status === 'QUEUED' ? 'Queued — waiting for a worker…' : 'Running…'} {b.progress}%</div>
              <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${b.progress}%` }} /></div>
            </CardContent></Card>
          )}
          {b.metrics && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <StatCard label="Total return" value={fmtPct(b.metrics.totalReturnPct)} valueClass={changeClass(b.metrics.totalReturnPct)} sub={`Buy & hold ${fmtPct(b.metrics.buyAndHoldReturnPct)}`} />
                <StatCard label="CAGR" value={fmtPct(b.metrics.cagrPct)} valueClass={changeClass(b.metrics.cagrPct)} />
                <StatCard label="Max drawdown" value={fmtPct(-b.metrics.maxDrawdownPct)} valueClass="text-bear" />
                <StatCard label="Sharpe / Sortino" value={`${fmtNum(b.metrics.sharpeRatio)} / ${fmtNum(b.metrics.sortinoRatio)}`} />
                <StatCard label="Win rate" value={fmtPct(b.metrics.winRatePct, 1, false)} sub={`Profit factor ${fmtNum(b.metrics.profitFactor)}`} />
                <StatCard label="Trades" value={fmtInt(b.metrics.numberOfTrades)} sub={`Max consecutive losses ${b.metrics.maxConsecutiveLosses}`} />
                <StatCard label="Average trade" value={fmtPct(b.metrics.averageTradePct)} valueClass={changeClass(b.metrics.averageTradePct)} sub={`NPR ${fmtNpr(b.metrics.averageTradePnl)}`} />
                <StatCard label="Avg win / avg loss" value={`${fmtPct(b.metrics.averageWinningTradePct)} / ${fmtPct(b.metrics.averageLosingTradePct)}`} />
                <StatCard label="Exposure" value={fmtPct(b.metrics.exposurePct, 1, false)} />
                <StatCard label="Total fees" value={`NPR ${fmtNpr(b.metrics.totalFees)}`} />
                <StatCard label="Final equity" value={`NPR ${fmtNpr(b.metrics.finalEquity)}`} sub={`from ${fmtNpr(b.initialCapital)}`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle>Equity curve</CardTitle></CardHeader><CardContent><LineSeriesChart data={b.equityCurve ?? []} x="date" y="equity" name="Equity" area height={260} /></CardContent></Card>
                <Card><CardHeader><CardTitle>Drawdown</CardTitle></CardHeader><CardContent><DrawdownChart data={b.equityCurve ?? []} height={260} /></CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle>Monthly returns</CardTitle></CardHeader><CardContent><SignedBarChart data={(b.monthlyReturns ?? []).map((m) => ({ ...m }))} x="month" y="returnPct" unit="%" height={220} /></CardContent></Card>
              <Card>
                <CardHeader><CardTitle>Trade history</CardTitle><CardDescription>Fees include broker commission, SEBON fee, DP charge and CGT per the effective schedule.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <thead><tr><Th>Entry</Th><Th className="text-right">Entry px</Th><Th>Exit</Th><Th className="text-right">Exit px</Th><Th className="text-right">Qty</Th><Th className="text-right">Gross P&amp;L</Th><Th className="text-right">Fees</Th><Th className="text-right">Net P&amp;L</Th><Th className="text-right">Return</Th><Th className="text-right">Days</Th><Th>Exit reason</Th></tr></thead>
                    <tbody>
                      {b.trades.map((t) => (
                        <tr key={t.id}>
                          <Td>{fmtDate(t.entryDate)}</Td><Td className="text-right font-mono">{fmtNum(t.entryPrice)}</Td><Td>{fmtDate(t.exitDate)}</Td><Td className="text-right font-mono">{fmtNum(t.exitPrice)}</Td>
                          <Td className="text-right">{fmtInt(t.quantity)}</Td><Td className={cn('text-right font-mono', changeClass(t.grossPnl))}>{fmtNum(t.grossPnl)}</Td><Td className="text-right font-mono">{fmtNum(t.fees)}</Td>
                          <Td className={cn('text-right font-mono', changeClass(t.netPnl))}>{fmtNum(t.netPnl)}</Td><Td className={cn('text-right font-mono', changeClass(t.returnPct))}>{fmtPct(t.returnPct)}</Td>
                          <Td className="text-right">{t.holdingDays}</Td><Td className="text-xs">{t.exitReason}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </CardContent>
              </Card>
              {b.walkForward != null && <WalkForward data={b.walkForward as WalkForwardData} />}
              <Card>
                <CardHeader><CardTitle>AI explanation</CardTitle></CardHeader>
                <CardContent>{!explain ? <Button size="sm" onClick={() => setExplain(true)}>Explain this backtest</Button> : ai.isLoading ? <Skeleton className="h-40" /> : <><ErrorText error={ai.error} />{ai.data && <Markdown text={ai.data.answer} />}</>}</CardContent>
              </Card>
            </>
          )}
          <Callout tone="warn" title="Backtest limitations"><ul className="list-disc pl-4">{b.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>
        </div>
      )}
    </RequireAuth>
  );
}

interface WalkForwardData { folds: { fold: number; testFrom: string; testTo: string; bestParameters: Record<string, number>; outOfSample: { totalReturnPct: number; sharpeRatio: number; numberOfTrades: number } }[]; combinedOutOfSampleReturnPct: number; averageOutOfSampleSharpe: number; note: string }

function WalkForward({ data }: { data: WalkForwardData }) {
  return (
    <Card>
      <CardHeader><CardTitle>Walk-forward (out-of-sample)</CardTitle><CardDescription>Combined OOS return {fmtPct(data.combinedOutOfSampleReturnPct)} · average OOS Sharpe {fmtNum(data.averageOutOfSampleSharpe)}. {data.note}</CardDescription></CardHeader>
      <CardContent className="p-0">
        <Table>
          <thead><tr><Th>Fold</Th><Th>Test window</Th><Th>Parameters chosen in-sample</Th><Th className="text-right">OOS return</Th><Th className="text-right">OOS Sharpe</Th><Th className="text-right">Trades</Th></tr></thead>
          <tbody>{data.folds.map((f) => (
            <tr key={f.fold}><Td>{f.fold}</Td><Td>{fmtDate(f.testFrom)} → {fmtDate(f.testTo)}</Td><Td className="font-mono text-xs">{Object.entries(f.bestParameters).map(([k, v]) => `${k}=${v}`).join(', ')}</Td>
              <Td className={cn('text-right font-mono', changeClass(f.outOfSample.totalReturnPct))}>{fmtPct(f.outOfSample.totalReturnPct)}</Td><Td className="text-right font-mono">{fmtNum(f.outOfSample.sharpeRatio)}</Td><Td className="text-right">{f.outOfSample.numberOfTrades}</Td></tr>
          ))}</tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
