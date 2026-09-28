'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ConditionBuilder } from '@/components/builder/condition-builder';
import { PageHeader } from '@/components/layout/require-auth';
import { SignalBadge } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Badge, Empty, ErrorText, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation, useDslFields, useSectors } from '@/hooks/queries';
import { api, download } from '@/lib/api';
import { changeClass, fmtDate, fmtInt, fmtNum, fmtPct } from '@/lib/format';
import type { ConditionGroup } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';

interface ScreenResult { asOf: string | null; total: number; note: string; items: (Record<string, number | string | null | string[]> & { symbol: string; matched: string[] })[] }
interface Screen { filter?: ConditionGroup; sectors?: string[]; minPrice?: number; minVolume?: number; minTurnover?: number; signal?: string; minSignalStrength?: number; sort: string; order: 'asc' | 'desc'; limit: number }

const DEFAULT_FILTER: ConditionGroup = { op: 'AND', conditions: [{ left: { field: 'adx14' }, comparator: '>', right: { value: 25 } }, { left: { field: 'ema20' }, comparator: '>', right: { field: 'ema50' } }] };

export default function ScreenerPage() {
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState<ConditionGroup>(DEFAULT_FILTER);
  const [useFilter, setUseFilter] = useState(true);
  const [sector, setSector] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [signal, setSignal] = useState('');
  const [minStrength, setMinStrength] = useState('');
  const [sort, setSort] = useState('turnover');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [saveName, setSaveName] = useState('');
  const fields = useDslFields();
  const sectors = useSectors('1D');
  const presets = useQuery({ queryKey: ['screener-presets'], queryFn: () => api.get<{ name: string; description: string; screen: { filter: ConditionGroup } }[]>('/screener/presets') });
  const saved = useQuery({ queryKey: ['screener-saved'], queryFn: () => api.get<{ id: string; name: string; definition: Screen }[]>('/screener/saved'), enabled: !!user });
  const screen: Screen = {
    ...(useFilter ? { filter } : {}), ...(sector ? { sectors: [sector] } : {}), ...(minVolume ? { minVolume: Number(minVolume) } : {}),
    ...(signal ? { signal } : {}), ...(minStrength ? { minSignalStrength: Number(minStrength) } : {}), sort, order, limit: 200,
  };
  const run = useApiMutation((s: Screen) => api.post<ScreenResult>('/screener/run', s));
  const save = useApiMutation(() => api.post('/screener/saved', { name: saveName, definition: screen }), [['screener-saved']]);
  const del = useApiMutation((id: string) => api.del(`/screener/saved/${id}`), [['screener-saved']]);
  const load = (s: Screen) => {
    if (s.filter) { setFilter(s.filter); setUseFilter(true); } else setUseFilter(false);
    setSector(s.sectors?.[0] ?? ''); setMinVolume(s.minVolume ? String(s.minVolume) : ''); setSignal(s.signal ?? ''); setMinStrength(s.minSignalStrength ? String(s.minSignalStrength) : '');
    setSort(s.sort ?? 'turnover'); setOrder(s.order ?? 'desc');
    run.mutate({ ...s, limit: 200 });
  };
  const cols = ['close', 'changePercent', 'volume', 'volumeRatio', 'rsi14', 'adx14', 'macdHistogram', 'roc12', 'hv20'];
  return (
    <div className="space-y-4">
      <PageHeader title="Screener" description="Build factual filters on indicator values. Results are not recommendations." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Filter builder</CardTitle><CardDescription>Example: RSI &lt; 30 AND Volume &gt; 20D average AND Price &gt; EMA50</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useFilter} onChange={(e) => setUseFilter(e.target.checked)} /> Use indicator conditions</label>
            {useFilter && <ConditionBuilder value={filter} onChange={setFilter} />}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Field label="Sector"><Select value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All</option>{sectors.data?.sectors.map((s) => <option key={s.sector}>{s.sector}</option>)}</Select></Field>
              <Field label="Min volume"><Input type="number" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} /></Field>
              <Field label="Ensemble signal"><Select value={signal} onChange={(e) => setSignal(e.target.value)}><option value="">Any</option><option value="BUY">BUY</option><option value="SELL">SELL</option><option value="HOLD">HOLD</option></Select></Field>
              <Field label="Min signal strength"><Input type="number" min={0} max={100} value={minStrength} onChange={(e) => setMinStrength(e.target.value)} /></Field>
              <Field label="Sort by"><Select value={sort} onChange={(e) => setSort(e.target.value)}><option value="signalStrength">Signal strength</option>{fields.data?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</Select></Field>
              <Field label="Order"><Select value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}><option value="desc">Descending</option><option value="asc">Ascending</option></Select></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => run.mutate(screen)} disabled={run.isPending}>{run.isPending ? 'Running…' : 'Run screen'}</Button>
              <Button variant="outline" onClick={() => download('/export/screener', { format: 'csv' }, screen)}>Export CSV</Button>
              <Button variant="outline" onClick={() => download('/export/screener', { format: 'json' }, screen)}>JSON</Button>
              <Button variant="outline" onClick={() => download('/export/screener', { format: 'pdf' }, screen)}>PDF</Button>
            </div>
            <ErrorText error={run.error} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Presets</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {presets.data?.map((p) => (
                <button key={p.name} className="w-full rounded-md border border-border p-2 text-left text-xs hover:bg-accent" onClick={() => load({ ...p.screen, sort: 'turnover', order: 'desc', limit: 200 })}>
                  <div className="font-medium">{p.name}</div><div className="text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Saved screens</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!user ? <p className="text-xs text-muted-foreground"><Link className="text-primary" href="/login">Log in</Link> to save screens.</p> : (
                <>
                  <div className="flex gap-2"><Input aria-label="Screen name" placeholder="Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} /><Button size="sm" disabled={!saveName} onClick={() => save.mutate(undefined)}>Save</Button></div>
                  <ErrorText error={save.error} />
                  {saved.data?.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <button className="text-primary hover:underline" onClick={() => load(s.definition)}>{s.name}</button>
                      <button className="text-muted-foreground hover:text-bear" onClick={() => del.mutate(s.id)}>Delete</button>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {run.data && (
        <Card>
          <CardHeader><CardTitle>{run.data.total} matching stocks</CardTitle><CardDescription>{run.data.note} As of {fmtDate(run.data.asOf)}.</CardDescription></CardHeader>
          <CardContent className="p-0">
            {!run.data.items.length ? <Empty>No stocks match.</Empty> : (
              <Table>
                <thead><tr><Th>Symbol</Th><Th>Sector</Th>{cols.map((c) => <Th key={c} className="text-right">{fields.data?.fields.find((f) => f.key === c)?.label ?? c}</Th>)}<Th>Signal</Th><Th className="text-right">Strength</Th></tr></thead>
                <tbody>
                  {run.data.items.map((r) => (
                    <tr key={r.symbol} className="hover:bg-accent/40">
                      <Td><Link className="font-medium text-primary hover:underline" href={`/stocks/${r.symbol}`}>{r.symbol}</Link>{r.isDemo ? <Badge className="ml-1">DEMO</Badge> : null}</Td>
                      <Td className="text-xs text-muted-foreground">{String(r.sector ?? 'N/A')}</Td>
                      {cols.map((c) => <Td key={c} className={cn('text-right font-mono', c === 'changePercent' && changeClass(r[c] as number))}>{c === 'changePercent' ? fmtPct(r[c] as number) : c === 'volume' ? fmtInt(r[c] as number) : fmtNum(r[c] as number)}</Td>)}
                      <Td><SignalBadge signal={r.signal as 'BUY' | 'SELL' | 'HOLD' | null} compact /></Td>
                      <Td className="text-right font-mono">{r.signalStrength ?? 'N/A'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
