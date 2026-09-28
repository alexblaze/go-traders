'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { BACKTEST_WARNINGS_SHORT } from '@/components/signals/disclaimer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Badge, Callout, Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation, useBacktests, useStrategies } from '@/hooks/queries';
import { api } from '@/lib/api';
import { changeClass, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import type { Backtest } from '@/lib/types';
import { cn } from '@/lib/utils';

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const FormSchema = z.object({
  symbol: z.string().min(1).max(20),
  strategyId: z.string().min(1),
  initialCapital: num(1000, 1e11),
  positionSizePct: num(1, 100),
  slippageBps: num(0, 1000),
  commissionMode: z.enum(['schedule', 'flat']),
  commissionPct: num(0, 10),
  from: z.string().optional(),
  to: z.string().optional(),
  stopLossPct: z.string().optional(),
  takeProfitPct: z.string().optional(),
  atrStopMultiple: z.string().optional(),
  fillMode: z.enum(['nextOpen', 'close']),
  walkForward: z.boolean(),
});
type FormValues = z.infer<typeof FormSchema>;
const optNum = (v?: string) => (v && v.trim() !== '' ? Number(v) : null);

function BacktestForm() {
  const params = useSearchParams();
  const router = useRouter();
  const strategies = useStrategies();
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as never,
    defaultValues: { symbol: params.get('symbol') ?? 'DMCB1', strategyId: params.get('strategy') ?? 'ema_crossover', initialCapital: 1_000_000, positionSizePct: 100, slippageBps: 10, commissionMode: 'schedule', commissionPct: 0.4, fillMode: 'nextOpen', walkForward: false },
  });
  const strategyId = watch('strategyId');
  const strat = strategies.data?.find((s) => s.id === strategyId);
  const create = useApiMutation((v: FormValues) => api.post<Backtest>('/backtests', {
    symbol: v.symbol.toUpperCase(), strategyId: v.strategyId, initialCapital: v.initialCapital, positionSize: v.positionSizePct / 100, slippageBps: v.slippageBps,
    commission: v.commissionMode === 'flat' ? v.commissionPct / 100 : null, from: v.from || undefined, to: v.to || undefined,
    stopLossPct: optNum(v.stopLossPct), takeProfitPct: optNum(v.takeProfitPct), atrStopMultiple: optNum(v.atrStopMultiple), fillMode: v.fillMode,
    parameters: Object.keys(overrides).length ? overrides : undefined,
    walkForward: v.walkForward && strat?.parameters.length ? { grid: Object.fromEntries(strat.parameters.slice(0, 2).map((p) => [p.key, [p.default * 0.5, p.default, p.default * 1.5].map((x) => Math.max(p.min ?? 1, Math.round(x)))])), trainBars: 250, testBars: 60 } : undefined,
  }), [['backtests']]);
  const e = formState.errors;
  return (
    <Card>
      <CardHeader><CardTitle>New backtest</CardTitle><CardDescription>Event-driven: signal on the bar close, fill on the next bar&apos;s open. Fees follow the fee schedule effective on each trade date.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid grid-cols-2 gap-3 md:grid-cols-4" onSubmit={handleSubmit((v) => create.mutate(v, { onSuccess: (bt) => router.push(`/backtests/${bt.id}`) }))}>
          <Field label="Symbol" error={e.symbol?.message}><Input {...register('symbol')} /></Field>
          <Field label="Strategy"><Select {...register('strategyId')}>{strategies.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Initial capital (NPR)" error={e.initialCapital?.message}><Input type="number" {...register('initialCapital')} /></Field>
          <Field label="Position size (% of equity)" error={e.positionSizePct?.message}><Input type="number" {...register('positionSizePct')} /></Field>
          <Field label="Slippage (bps)" error={e.slippageBps?.message}><Input type="number" {...register('slippageBps')} /></Field>
          <Field label="Costs"><Select {...register('commissionMode')}><option value="schedule">Fee schedules (by date)</option><option value="flat">Flat commission %</option></Select></Field>
          <Field label="Flat commission %"><Input type="number" step="0.01" {...register('commissionPct')} disabled={watch('commissionMode') !== 'flat'} /></Field>
          <Field label="Fill"><Select {...register('fillMode')}><option value="nextOpen">Next bar open (realistic)</option><option value="close">Same bar close (optimistic)</option></Select></Field>
          <Field label="From"><Input type="date" {...register('from')} /></Field>
          <Field label="To"><Input type="date" {...register('to')} /></Field>
          <Field label="Stop loss %"><Input type="number" step="0.5" placeholder="none" {...register('stopLossPct')} /></Field>
          <Field label="Take profit %"><Input type="number" step="0.5" placeholder="none" {...register('takeProfitPct')} /></Field>
          <Field label="ATR stop ×"><Input type="number" step="0.5" placeholder="none" {...register('atrStopMultiple')} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" {...register('walkForward')} /> Also run walk-forward optimisation (train 250 / test 60 bars)</label>
          {strat && strat.parameters.length > 0 && (
            <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md border border-border p-2 md:col-span-4 md:grid-cols-4">
              <div className="col-span-2 text-xs font-semibold md:col-span-4">Strategy parameters</div>
              {strat.parameters.map((p) => (
                <Field key={`${strat.id}-${p.key}`} label={p.label}>
                  <Input type="number" step={p.step ?? 1} min={p.min} max={p.max} defaultValue={p.value ?? p.default} onChange={(ev) => setOverrides({ ...overrides, [p.key]: Number(ev.target.value) })} />
                </Field>
              ))}
            </div>
          )}
          <div className="col-span-2 md:col-span-4">
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Submitting…' : 'Run backtest'}</Button>
            <ErrorText error={create.error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BacktestList() {
  const { data, isLoading, error } = useBacktests();
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle>Your backtests</CardTitle><CardDescription>Select two or more to compare.</CardDescription></div>
        {selected.length >= 2 && <Link href={`/backtests/compare?ids=${selected.join(',')}`}><Button size="sm">Compare ({selected.length})</Button></Link>}
      </CardHeader>
      <CardContent className="p-0">
        <ErrorText error={error} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : !data?.data.length ? <Empty>No backtests yet.</Empty> : (
          <Table>
            <thead><tr><Th /><Th>Symbol</Th><Th>Strategy</Th><Th>Status</Th><Th>Period</Th><Th className="text-right">Return</Th><Th className="text-right">Buy&amp;hold</Th><Th className="text-right">Max DD</Th><Th className="text-right">Sharpe</Th><Th className="text-right">Trades</Th></tr></thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={b.id} className="hover:bg-accent/40">
                  <Td><input type="checkbox" aria-label={`Select ${b.id}`} checked={selected.includes(b.id)} disabled={b.status !== 'COMPLETED'} onChange={(e) => setSelected(e.target.checked ? [...selected, b.id] : selected.filter((x) => x !== b.id))} /></Td>
                  <Td><Link className="font-medium text-primary hover:underline" href={`/backtests/${b.id}`}>{b.symbol}</Link></Td>
                  <Td>{b.strategyName}</Td>
                  <Td><Badge>{b.status}</Badge></Td>
                  <Td className="text-xs">{fmtDate(b.from)} → {fmtDate(b.to)}</Td>
                  <Td className={cn('text-right font-mono', changeClass(b.metrics?.totalReturnPct))}>{fmtPct(b.metrics?.totalReturnPct)}</Td>
                  <Td className="text-right font-mono text-muted-foreground">{fmtPct(b.metrics?.buyAndHoldReturnPct)}</Td>
                  <Td className="text-right font-mono text-bear">{fmtPct(b.metrics ? -b.metrics.maxDrawdownPct : null)}</Td>
                  <Td className="text-right font-mono">{fmtNum(b.metrics?.sharpeRatio)}</Td>
                  <Td className="text-right">{b.metrics?.numberOfTrades ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function BacktestsPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <PageHeader title="Backtests" description="Test strategies on historical NEPSE data with Nepal transaction costs." />
        <Callout tone="warn" title="Backtests are historical simulations">
          <ul className="list-disc pl-4">{BACKTEST_WARNINGS_SHORT.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
        <Suspense fallback={<Skeleton className="h-64" />}><BacktestForm /></Suspense>
        <BacktestList />
      </div>
    </RequireAuth>
  );
}
