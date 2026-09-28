'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ConditionBuilder, emptyComparison } from '@/components/builder/condition-builder';
import { PageHeader } from '@/components/layout/require-auth';
import { SignalBadge, StrengthBar, DirectionMark } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/inputs';
import { Badge, Callout, ErrorText, Skeleton } from '@/components/ui/misc';
import { useApiMutation, useStrategies } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { ConditionGroup, Reason, SignalType, StrategyInfo } from '@/lib/types';
import { useAuth } from '@/stores/auth';

function RunStrategy({ s }: { s: StrategyInfo }) {
  const [symbol, setSymbol] = useState('DMCB1');
  const [params, setParams] = useState<Record<string, number>>({});
  const run = useApiMutation(() => api.post<{ signal: { signal: SignalType; strength: number; reasons: Reason[] } }>(`/strategies/${s.id}/run`, { symbol, parameters: params }));
  return (
    <div className="space-y-2">
      {s.parameters.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.parameters.map((p) => (
            <Field key={p.key} label={p.label} hint={p.description}>
              <Input type="number" step={p.step ?? 1} min={p.min} max={p.max} defaultValue={p.value ?? p.default} onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input aria-label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-32" />
        <Button size="sm" onClick={() => run.mutate(undefined)} disabled={run.isPending}>Run on stock</Button>
        <Link href={`/backtests?symbol=${symbol}&strategy=${s.id}`}><Button size="sm" variant="outline">Backtest</Button></Link>
      </div>
      <ErrorText error={run.error} />
      {run.data && (
        <div className="rounded-md border border-border p-2 text-xs">
          <div className="mb-1 flex items-center gap-2"><SignalBadge signal={run.data.signal.signal} /><StrengthBar value={run.data.signal.strength} /></div>
          <ul>{run.data.signal.reasons.map((r, i) => <li key={i}><DirectionMark direction={r.direction} /> {r.condition}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function CustomBuilder() {
  const [name, setName] = useState('');
  const [buy, setBuy] = useState<ConditionGroup>({ op: 'AND', conditions: [emptyComparison(), { left: { field: 'close' }, comparator: '<', right: { field: 'bbLower' } }, { left: { field: 'volume' }, comparator: '>', right: { field: 'volumeSma20' } }] });
  const [sell, setSell] = useState<ConditionGroup>({ op: 'AND', conditions: [{ left: { field: 'rsi14' }, comparator: '>', right: { value: 70 } }] });
  const create = useApiMutation(() => api.post('/strategies/custom', { name, buy, sell }), [['strategies']]);
  return (
    <Card>
      <CardHeader><CardTitle>Strategy builder</CardTitle><CardDescription>IF conditions THEN BUY / SELL candidate. Stored as a structured JSON rule — no user code is executed.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oversold bounce with volume" /></Field>
        <div><div className="mb-1 text-xs font-semibold text-bull">IF … THEN BUY candidate</div><ConditionBuilder value={buy} onChange={setBuy} /></div>
        <div><div className="mb-1 text-xs font-semibold text-bear">IF … THEN SELL candidate</div><ConditionBuilder value={sell} onChange={setSell} /></div>
        <Button onClick={() => create.mutate(undefined)} disabled={!name || create.isPending}>Save strategy</Button>
        <ErrorText error={create.error} />
        {create.isSuccess && <p className="text-xs text-bull">Saved. It now appears in the list and can be backtested.</p>}
      </CardContent>
    </Card>
  );
}

export default function StrategiesPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useStrategies();
  const del = useApiMutation((id: string) => api.del(`/strategies/custom/${id}`), [['strategies']]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Strategies" description="Transparent, rule-based strategies. Every signal shows the conditions that produced it." />
      <Callout>Strategies produce BUY/SELL candidates and HOLD. Strength is an internal score, not a probability. Always review assumptions and limitations.</Callout>
      <ErrorText error={error} />
      {isLoading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{s.name}</CardTitle>
                  <div className="flex gap-1"><Badge>{s.category}</Badge><Badge>{s.timeframe}</Badge>{!s.isActive && <Badge>disabled</Badge>}</div>
                </div>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {s.indicatorsUsed && <div><span className="text-muted-foreground">Indicators:</span> {s.indicatorsUsed.join(', ')}</div>}
                {s.limitations && s.limitations.length > 0 && <div><span className="text-muted-foreground">Limitations:</span> {s.limitations.join(' ')}</div>}
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Close' : 'Parameters & run'}</Button>
                  {!s.isBuiltin && <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}>Delete</Button>}
                </div>
                {open === s.id && <RunStrategy s={s} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {user ? <CustomBuilder /> : <p className="text-sm text-muted-foreground"><Link className="text-primary" href="/login">Log in</Link> to build custom strategies.</p>}
    </div>
  );
}
