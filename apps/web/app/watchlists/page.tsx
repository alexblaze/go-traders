'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { SignalBadge, StrengthBar } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/inputs';
import { Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation, useWatchlists } from '@/hooks/queries';
import { api, download } from '@/lib/api';
import { changeClass, fmtInt, fmtNum, fmtPct } from '@/lib/format';
import type { Watchlist } from '@/lib/types';
import { cn } from '@/lib/utils';

const SUGGESTED = ['My Watchlist', 'Dividend Watch', 'Momentum', 'Breakout Candidates', 'Banking', 'Hydropower'];

function WatchlistCard({ w }: { w: Watchlist }) {
  const [symbol, setSymbol] = useState('');
  const add = useApiMutation(() => api.post(`/watchlists/${w.id}/items`, { symbol }), [['watchlists']]);
  const remove = useApiMutation((s: string) => api.del(`/watchlists/${w.id}/items/${s}`), [['watchlists']]);
  const del = useApiMutation(() => api.del(`/watchlists/${w.id}`), [['watchlists']]);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>{w.name}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined, { onSuccess: () => setSymbol('') }); }}>
            <Input aria-label="Add symbol" placeholder="Add symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-8 w-28" />
            <Button size="sm" type="submit" variant="secondary">Add</Button>
          </form>
          <Button size="sm" variant="outline" onClick={() => download(`/export/watchlists/${w.id}`, { format: 'csv' })}>CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => confirm(`Delete "${w.name}"?`) && del.mutate(undefined)}>Delete</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ErrorText error={add.error} />
        {!w.items.length ? <Empty>Empty watchlist.</Empty> : (
          <Table>
            <thead><tr><Th>Symbol</Th><Th className="text-right">Price</Th><Th className="text-right">Change</Th><Th className="text-right">Volume</Th><Th className="text-right">RSI</Th><Th>Trend</Th><Th>Signal</Th><Th>Strength</Th><Th /></tr></thead>
            <tbody>{w.items.map((i) => (
              <tr key={i.id}>
                <Td><Link className="font-medium text-primary hover:underline" href={`/stocks/${i.symbol}`}>{i.symbol}</Link></Td>
                <Td className="text-right font-mono">{fmtNum(i.price)}</Td><Td className={cn('text-right font-mono', changeClass(i.changePercent))}>{fmtPct(i.changePercent)}</Td>
                <Td className="text-right font-mono">{fmtInt(i.volume)}</Td><Td className="text-right font-mono">{fmtNum(i.rsi14, 1)}</Td>
                <Td className="text-xs">{i.trend?.replace(/_/g, ' ') ?? 'N/A'}</Td><Td><SignalBadge signal={i.signal} compact /></Td>
                <Td>{i.signalStrength !== null ? <StrengthBar value={i.signalStrength} /> : 'N/A'}</Td>
                <Td><button className="text-xs text-muted-foreground hover:text-bear" onClick={() => remove.mutate(i.symbol)} aria-label={`Remove ${i.symbol}`}>Remove</button></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Inner() {
  const { data, isLoading, error } = useWatchlists();
  const [name, setName] = useState('');
  const create = useApiMutation((n: string) => api.post('/watchlists', { name: n }), [['watchlists']]);
  const existing = new Set(data?.map((w) => w.name));
  return (
    <div className="space-y-4">
      <PageHeader title="Watchlists" description="Track price, RSI, trend and signal strength for stocks you follow." />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(name, { onSuccess: () => setName('') }); }}>
            <Input aria-label="New watchlist name" placeholder="New watchlist name" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            <Button type="submit" disabled={!name}>Create</Button>
          </form>
          {SUGGESTED.filter((s) => !existing.has(s)).map((s) => <Button key={s} size="sm" variant="outline" onClick={() => create.mutate(s)}>+ {s}</Button>)}
          <ErrorText error={create.error ?? error} />
        </CardContent>
      </Card>
      {isLoading ? <Skeleton className="h-40" /> : !data?.length ? <Empty>No watchlists yet.</Empty> : data.map((w) => <WatchlistCard key={w.id} w={w} />)}
    </div>
  );
}

export default function WatchlistsPage() {
  return <RequireAuth><Inner /></RequireAuth>;
}
