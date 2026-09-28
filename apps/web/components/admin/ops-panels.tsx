'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Badge, Callout, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation, useStrategies } from '@/hooks/queries';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTimeNpt, fmtInt } from '@/lib/format';

export function JobsPanel() {
  const jobs = useQuery({ queryKey: ['admin-jobs'], queryFn: () => api.get<{ queues: { queue: string; counts: Record<string, number> }[]; recent: { id: string; queue: string; name: string; status: string; durationMs: number | null; error: string | null; startedAt: string }[] }>('/admin/jobs'), refetchInterval: 5000 });
  const failed = useQuery({ queryKey: ['admin-failed'], queryFn: () => api.get<{ queue: string; id: string; name: string; failedReason: string; attemptsMade: number }[]>('/admin/jobs/failed'), refetchInterval: 10000 });
  const retry = useApiMutation((j: { queue: string; id: string }) => api.post(`/admin/jobs/${j.queue}/${j.id}/retry`), [['admin-failed'], ['admin-jobs']]);
  const gen = useApiMutation(() => api.post('/admin/signals/generate'), [['admin-jobs']]);
  const sync = useApiMutation(() => api.post('/admin/sync', { days: 30 }), [['admin-jobs']]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => gen.mutate(undefined)}>Regenerate indicators & signals</Button>
        <Button size="sm" variant="outline" onClick={() => sync.mutate(undefined)}>Run data synchronisation</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Queues</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Queue</Th><Th className="text-right">Waiting</Th><Th className="text-right">Active</Th><Th className="text-right">Delayed</Th><Th className="text-right">Completed</Th><Th className="text-right">Failed</Th></tr></thead>
            <tbody>{jobs.data?.queues.map((q) => <tr key={q.queue}><Td>{q.queue}</Td>{['waiting', 'active', 'delayed', 'completed', 'failed'].map((k) => <Td key={k} className={`text-right ${k === 'failed' && q.counts[k] ? 'text-bear' : ''}`}>{q.counts[k] ?? 0}</Td>)}</tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Failed jobs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!failed.data?.length ? <p className="p-4 text-sm text-muted-foreground">No failed jobs.</p> : (
            <Table>
              <thead><tr><Th>Queue</Th><Th>Job</Th><Th>Attempts</Th><Th>Reason</Th><Th /></tr></thead>
              <tbody>{failed.data.map((j) => <tr key={`${j.queue}:${j.id}`}><Td>{j.queue}</Td><Td>{j.name} #{j.id}</Td><Td>{j.attemptsMade}</Td><Td className="max-w-[400px] truncate text-xs text-bear">{j.failedReason}</Td><Td><Button size="sm" variant="outline" onClick={() => retry.mutate(j)}>Retry</Button></Td></tr>)}</tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent job runs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Started</Th><Th>Queue</Th><Th>Job</Th><Th>Status</Th><Th className="text-right">Duration</Th><Th>Error</Th></tr></thead>
            <tbody>{jobs.data?.recent.map((r) => <tr key={r.id}><Td className="text-xs">{fmtDateTimeNpt(r.startedAt)}</Td><Td>{r.queue}</Td><Td>{r.name}</Td><Td><Badge>{r.status}</Badge></Td><Td className="text-right">{r.durationMs !== null ? `${fmtInt(r.durationMs)} ms` : '—'}</Td><Td className="max-w-[300px] truncate text-xs text-bear">{r.error}</Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface Fee { id: string; name: string; type: string; rate: number; fixedAmount: number; appliesTo: string; tiers: { upTo: number | null; rate: number }[] | null; minAmount: number | null; holdingDaysMin: number | null; holdingDaysMax: number | null; effectiveFrom: string; effectiveTo: string | null; isVerified: boolean; sourceNote: string | null }

export function FeesPanel() {
  const fees = useQuery({ queryKey: ['fees'], queryFn: () => api.get<Fee[]>('/admin/fees') });
  const [form, setForm] = useState({ name: '', type: 'BROKER_COMMISSION', rate: '0', fixedAmount: '0', appliesTo: 'BOTH', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', sourceNote: '' });
  const create = useApiMutation(() => api.post('/admin/fees', { ...form, rate: Number(form.rate), fixedAmount: Number(form.fixedAmount), effectiveTo: form.effectiveTo || null, isVerified: false }), [['fees']]);
  const verify = useApiMutation((f: Fee) => api.patch(`/admin/fees/${f.id}`, { isVerified: !f.isVerified }), [['fees']]);
  const del = useApiMutation((id: string) => api.del(`/admin/fees/${id}`), [['fees']]);
  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Callout tone="warn" title="Verify all rates">Fee rates must be verified against current SEBON / NEPSE / CDSC / IRD notices. Seeded schedules are ILLUSTRATIVE and marked unverified. The backtester applies the schedule effective on each trade date.</Callout>
      <Card>
        <CardHeader><CardTitle>Fee schedules</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Name</Th><Th>Type</Th><Th>Applies</Th><Th className="text-right">Rate</Th><Th className="text-right">Fixed</Th><Th>Tiers / holding</Th><Th>Effective</Th><Th>Verified</Th><Th /></tr></thead>
            <tbody>{fees.data?.map((f) => (
              <tr key={f.id}>
                <Td>{f.name}</Td><Td className="text-xs">{f.type}</Td><Td>{f.appliesTo}</Td><Td className="text-right font-mono">{(f.rate * 100).toFixed(4)}%</Td><Td className="text-right">{f.fixedAmount}</Td>
                <Td className="text-xs">{f.tiers?.map((t) => `≤${t.upTo ?? '∞'}: ${(t.rate * 100).toFixed(2)}%`).join('; ')}{f.holdingDaysMin !== null || f.holdingDaysMax !== null ? `held ${f.holdingDaysMin ?? 0}–${f.holdingDaysMax ?? '∞'}d` : ''}</Td>
                <Td className="text-xs">{fmtDate(f.effectiveFrom)} → {f.effectiveTo ? fmtDate(f.effectiveTo) : 'open'}</Td>
                <Td><button onClick={() => verify.mutate(f)}><Badge className={f.isVerified ? 'border-bull text-bull' : 'border-yellow-500 text-yellow-500'}>{f.isVerified ? 'verified' : 'unverified'}</Badge></button></Td>
                <Td><button className="text-xs text-muted-foreground hover:text-bear" onClick={() => del.mutate(f.id)}>Delete</button></Td>
              </tr>
            ))}</tbody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Add fee schedule</CardTitle><CardDescription>Rate as a fraction (0.0036 = 0.36%).</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Name"><Input value={form.name} onChange={upd('name')} /></Field>
          <Field label="Type"><Select value={form.type} onChange={upd('type')}>{['BROKER_COMMISSION', 'SEBON_FEE', 'DP_CHARGE', 'CAPITAL_GAINS_TAX', 'OTHER'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Rate"><Input type="number" step="0.00001" value={form.rate} onChange={upd('rate')} /></Field>
          <Field label="Fixed amount"><Input type="number" value={form.fixedAmount} onChange={upd('fixedAmount')} /></Field>
          <Field label="Applies to"><Select value={form.appliesTo} onChange={upd('appliesTo')}><option>BOTH</option><option>BUY</option><option>SELL</option></Select></Field>
          <Field label="Effective from"><Input type="date" value={form.effectiveFrom} onChange={upd('effectiveFrom')} /></Field>
          <Field label="Effective to"><Input type="date" value={form.effectiveTo} onChange={upd('effectiveTo')} /></Field>
          <Field label="Source note"><Input value={form.sourceNote} onChange={upd('sourceNote')} placeholder="Notice reference" /></Field>
          <Button className="col-span-2" onClick={() => create.mutate(undefined)} disabled={!form.name}>Add schedule</Button>
          <ErrorText error={create.error} />
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategyParamsPanel() {
  const strategies = useStrategies();
  const [id, setId] = useState('rsi');
  const [vals, setVals] = useState<Record<string, number>>({});
  const s = strategies.data?.find((x) => x.id === id);
  const save = useApiMutation(() => api.put(`/admin/strategies/${id}/parameters`, vals), [['strategies']]);
  const toggle = useApiMutation(() => api.patch(`/admin/strategies/${id}`, { isActive: !s?.isActive }), [['strategies']]);
  return (
    <Card>
      <CardHeader><CardTitle>Strategy parameters</CardTitle><CardDescription>Defaults used for scheduled signal generation. Changing them affects all users&apos; signals from the next run.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select value={id} onChange={(e) => { setId(e.target.value); setVals({}); }} className="w-64">{strategies.data?.filter((x) => x.isBuiltin).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          {s && <Button size="sm" variant="outline" onClick={() => toggle.mutate(undefined)}>{s.isActive ? 'Disable' : 'Enable'}</Button>}
        </div>
        {!s ? <Skeleton className="h-20" /> : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {s.parameters.map((p) => (
              <Field key={`${id}-${p.key}`} label={`${p.label} [${p.min ?? '−∞'}, ${p.max ?? '∞'}]`}>
                <Input type="number" step={p.step ?? 1} defaultValue={p.value ?? p.default} onChange={(e) => setVals({ ...vals, [p.key]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
        )}
        <Button onClick={() => save.mutate(undefined)} disabled={!Object.keys(vals).length}>Save parameters</Button>
        <ErrorText error={save.error ?? toggle.error} />
        {save.isSuccess && <span className="ml-2 text-xs text-bull">Saved.</span>}
      </CardContent>
    </Card>
  );
}

export function HealthPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-health'], queryFn: () => api.get<{ database: { ok: boolean; latencyMs: number }; redis: { ok: boolean; latencyMs: number }; counts: Record<string, number>; latestPriceDate: string | null; failedJobs24h: number; process: Record<string, string | number> }>('/admin/health'), refetchInterval: 10000 });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  const ok = (b: boolean) => <Badge className={b ? 'border-bull text-bull' : 'border-bear text-bear'}>{b ? 'OK' : 'DOWN'}</Badge>;
  return (
    <Card>
      <CardHeader><CardTitle>System health</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div>PostgreSQL {ok(data.database.ok)} <span className="text-xs text-muted-foreground">{data.database.latencyMs} ms</span></div>
        <div>Redis {ok(data.redis.ok)} <span className="text-xs text-muted-foreground">{data.redis.latencyMs} ms</span></div>
        <div>Latest price date: {fmtDate(data.latestPriceDate)}</div>
        <div>Failed jobs (24h): <span className={data.failedJobs24h ? 'text-bear' : ''}>{data.failedJobs24h}</span></div>
        {Object.entries(data.counts).map(([k, v]) => <div key={k} className="text-xs text-muted-foreground">{k}: {fmtInt(v)}</div>)}
        {Object.entries(data.process).map(([k, v]) => <div key={k} className="text-xs text-muted-foreground">{k}: {v}</div>)}
      </CardContent>
    </Card>
  );
}

export function StocksAdminPanel() {
  const [form, setForm] = useState({ symbol: '', companyName: '', sector: '' });
  const [edit, setEdit] = useState({ symbol: '', status: 'SUSPENDED' });
  const create = useApiMutation(() => api.post('/admin/stocks', { ...form, sector: form.sector || null }), [['stocks']]);
  const update = useApiMutation(() => api.patch(`/admin/stocks/${edit.symbol}`, { status: edit.status }), [['stocks']]);
  const sectors = useQuery({ queryKey: ['admin-sectors'], queryFn: () => api.get<{ id: number; name: string; _count: { companies: number } }[]>('/admin/sectors') });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Add stock</CardTitle><CardDescription>Fundamentals left empty display as N/A.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Field label="Symbol"><Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} /></Field>
          <Field label="Company name"><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
          <Field label="Sector"><Input list="sector-list" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /><datalist id="sector-list">{sectors.data?.map((s) => <option key={s.id} value={s.name} />)}</datalist></Field>
          <Button onClick={() => create.mutate(undefined)} disabled={!form.symbol || !form.companyName}>Create</Button>
          <ErrorText error={create.error} />
          {create.isSuccess && <p className="text-xs text-bull">Created.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change listing status</CardTitle><CardDescription>Delisted stocks stay in history (reduces survivorship bias).</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Field label="Symbol"><Input value={edit.symbol} onChange={(e) => setEdit({ ...edit, symbol: e.target.value.toUpperCase() })} /></Field>
          <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>ACTIVE</option><option>SUSPENDED</option><option>DELISTED</option></Select></Field>
          <Button onClick={() => update.mutate(undefined)} disabled={!edit.symbol}>Update</Button>
          <ErrorText error={update.error} />
          {update.isSuccess && <p className="text-xs text-bull">Updated.</p>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Sectors</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{sectors.data?.map((s) => <Badge key={s.id}>{s.name} ({s._count.companies})</Badge>)}</CardContent>
      </Card>
    </div>
  );
}
