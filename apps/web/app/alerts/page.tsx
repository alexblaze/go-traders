'use client';
import { useState } from 'react';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Badge, Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useAlerts, useApiMutation, useNotifications } from '@/hooks/queries';
import { api } from '@/lib/api';
import { fmtDateTimeNpt } from '@/lib/format';

const TYPES: Record<string, string> = {
  PRICE_ABOVE: 'Price crosses above X', PRICE_BELOW: 'Price crosses below X', RSI_BELOW: 'RSI < X', RSI_ABOVE: 'RSI > X',
  EMA_CROSSOVER_BULLISH: 'EMA20 crosses above EMA50', EMA_CROSSOVER_BEARISH: 'EMA20 crosses below EMA50', MACD_CROSSOVER_BULLISH: 'MACD bullish crossover',
  MACD_CROSSOVER_BEARISH: 'MACD bearish crossover', VOLUME_ABOVE: 'Volume > X', BREAKOUT: 'Breakout detected', BUY_SIGNAL: 'BUY signal generated (min strength X)', SELL_SIGNAL: 'SELL signal generated (min strength X)',
};
const NEEDS = ['PRICE_ABOVE', 'PRICE_BELOW', 'RSI_BELOW', 'RSI_ABOVE', 'VOLUME_ABOVE'];

function Inner() {
  const alerts = useAlerts();
  const notes = useNotifications(true);
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('BUY_SIGNAL');
  const [threshold, setThreshold] = useState('');
  const [email, setEmail] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const create = useApiMutation(() => api.post('/alerts', { symbol: symbol.toUpperCase(), type, threshold: threshold ? Number(threshold) : null, channels: email ? ['IN_APP', 'EMAIL'] : ['IN_APP'], repeat }), [['alerts']]);
  const toggle = useApiMutation((a: { id: string; isActive: boolean }) => api.patch(`/alerts/${a.id}`, { isActive: a.isActive }), [['alerts']]);
  const del = useApiMutation((id: string) => api.del(`/alerts/${id}`), [['alerts']]);
  const readAll = useApiMutation(() => api.post('/notifications/read-all'), [['notifications']]);
  return (
    <div className="space-y-4">
      <PageHeader title="Alerts" description="Alerts are evaluated by the background alert worker after each session's signals are generated." />
      <Card>
        <CardHeader><CardTitle>New alert</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-2 gap-2 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
            <Field label="Symbol"><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} required /></Field>
            <div className="col-span-2"><Field label="Condition"><Select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></div>
            <Field label={NEEDS.includes(type) ? 'Threshold (required)' : 'Threshold (optional)'}><Input type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} required={NEEDS.includes(type)} /></Field>
            <div className="flex flex-col justify-end gap-1 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also email</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat</label>
            </div>
            <div className="flex items-end"><Button type="submit" disabled={create.isPending}>Create</Button></div>
          </form>
          <ErrorText error={create.error} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your alerts</CardTitle></CardHeader>
        <CardContent className="p-0">
          {alerts.isLoading ? <Skeleton className="m-4 h-24" /> : !alerts.data?.length ? <Empty>No alerts.</Empty> : (
            <Table>
              <thead><tr><Th>Symbol</Th><Th>Condition</Th><Th>Threshold</Th><Th>Channels</Th><Th>Status</Th><Th>Last triggered</Th><Th /></tr></thead>
              <tbody>{alerts.data.map((a) => (
                <tr key={a.id}>
                  <Td>{a.symbol}</Td><Td>{TYPES[a.type] ?? a.type}</Td><Td>{a.threshold ?? '—'}</Td><Td className="text-xs">{a.channels.join(', ')}</Td>
                  <Td><Badge>{a.isActive ? 'Active' : 'Paused'}</Badge>{a.repeat && <Badge className="ml-1">repeat</Badge>}</Td>
                  <Td className="text-xs">{a.lastTriggeredAt ? fmtDateTimeNpt(a.lastTriggeredAt) : 'never'}</Td>
                  <Td className="space-x-2 text-xs">
                    <button className="text-primary" onClick={() => toggle.mutate({ id: a.id, isActive: !a.isActive })}>{a.isActive ? 'Pause' : 'Resume'}</button>
                    <button className="text-muted-foreground hover:text-bear" onClick={() => del.mutate(a.id)}>Delete</button>
                  </Td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card id="notifications">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Notifications</CardTitle><CardDescription>{Number(notes.data?.meta?.unread ?? 0)} unread</CardDescription></div>
          <Button size="sm" variant="outline" onClick={() => readAll.mutate(undefined)}>Mark all read</Button>
        </CardHeader>
        <CardContent>
          {!notes.data?.data.length ? <Empty>No notifications yet.</Empty> : (
            <ul className="divide-y divide-border">
              {notes.data.data.map((n) => (
                <li key={n.id} className="py-2">
                  <div className="flex items-center gap-2 text-sm font-medium">{!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-label="unread" />}{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.body}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDateTimeNpt(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AlertsPage() {
  return <RequireAuth><Inner /></RequireAuth>;
}
