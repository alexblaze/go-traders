'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Markdown } from '@/components/ui/markdown';
import { Badge, Callout, ErrorText, Skeleton } from '@/components/ui/misc';
import { useApiMutation, useWatchlists } from '@/hooks/queries';
import { api } from '@/lib/api';
import { fmtInt, fmtNpr, fmtNum } from '@/lib/format';
import type { AiAnswer } from '@/lib/types';
import { useAuth } from '@/stores/auth';

const OrderSchema = z.object({ side: z.enum(['BUY', 'SELL']), quantity: z.coerce.number().int().positive('Quantity must be positive'), reason: z.string().max(500).optional() });

export function PaperTradeCard({ symbol, signal }: { symbol: string; signal?: 'BUY' | 'SELL' | 'HOLD' }) {
  const user = useAuth((s) => s.user);
  const { register, handleSubmit, formState, reset } = useForm({ resolver: zodResolver(OrderSchema), defaultValues: { side: 'BUY' as const, quantity: 10, reason: '' } });
  const m = useApiMutation((v: z.infer<typeof OrderSchema>) => api.post<{ status: string; filledPrice: number; fees: { total: number } }>('/portfolio/orders', { ...v, symbol, strategyId: 'ensemble', signal }), [['portfolio'], ['portfolio', 'orders']]);
  return (
    <Card>
      <CardHeader><CardTitle>Paper trade</CardTitle><CardDescription>Simulated order at the latest close + slippage. No real money.</CardDescription></CardHeader>
      <CardContent>
        {!user ? <p className="text-xs text-muted-foreground"><Link className="text-primary" href="/login">Log in</Link> to paper trade.</p> : (
          <form className="grid grid-cols-2 gap-2" onSubmit={handleSubmit((v) => m.mutate(v, { onSuccess: () => reset({ side: v.side, quantity: v.quantity, reason: '' }) }))}>
            <Field label="Side"><Select {...register('side')}><option value="BUY">Buy</option><option value="SELL">Sell</option></Select></Field>
            <Field label="Quantity" error={formState.errors.quantity?.message}><Input type="number" min={1} {...register('quantity')} /></Field>
            <div className="col-span-2"><Field label="Reason (optional)"><Input placeholder="Why this trade?" {...register('reason')} /></Field></div>
            <Button type="submit" className="col-span-2" disabled={m.isPending}>Submit paper order</Button>
            <div className="col-span-2">
              <ErrorText error={m.error} />
              {m.data && <p className="text-xs text-bull">Filled at {fmtNum(m.data.filledPrice)} (fees NPR {fmtNum(m.data.fees.total)}). <Link className="underline" href="/portfolio">View portfolio</Link></p>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function WatchAlertCard({ symbol }: { symbol: string }) {
  const user = useAuth((s) => s.user);
  const lists = useWatchlists();
  const [listId, setListId] = useState('');
  const [alertType, setAlertType] = useState('BUY_SIGNAL');
  const [threshold, setThreshold] = useState('');
  const add = useApiMutation(() => api.post(`/watchlists/${listId || lists.data?.[0]?.id}/items`, { symbol }), [['watchlists']]);
  const create = useApiMutation(() => api.post('/watchlists', { name: 'My Watchlist', symbols: [symbol] }), [['watchlists']]);
  const alert = useApiMutation(() => api.post('/alerts', { symbol, type: alertType, threshold: threshold ? Number(threshold) : null, channels: ['IN_APP'] }), [['alerts']]);
  if (!user) return null;
  const needsThreshold = ['PRICE_ABOVE', 'PRICE_BELOW', 'RSI_BELOW', 'RSI_ABOVE', 'VOLUME_ABOVE'].includes(alertType);
  return (
    <Card>
      <CardHeader><CardTitle>Watch & alert</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {lists.data?.length ? (
            <>
              <Select aria-label="Watchlist" value={listId} onChange={(e) => setListId(e.target.value)}>{lists.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
              <Button size="sm" variant="secondary" onClick={() => add.mutate(undefined)} disabled={add.isPending}>Add</Button>
            </>
          ) : <Button size="sm" variant="secondary" onClick={() => create.mutate(undefined)}>Create &quot;My Watchlist&quot; with {symbol}</Button>}
        </div>
        {add.isSuccess && <p className="text-xs text-bull">Added to watchlist.</p>}
        <ErrorText error={add.error ?? create.error} />
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Alert type" value={alertType} onChange={(e) => setAlertType(e.target.value)} className="w-48">
            {['BUY_SIGNAL', 'SELL_SIGNAL', 'PRICE_ABOVE', 'PRICE_BELOW', 'RSI_BELOW', 'RSI_ABOVE', 'EMA_CROSSOVER_BULLISH', 'EMA_CROSSOVER_BEARISH', 'MACD_CROSSOVER_BULLISH', 'MACD_CROSSOVER_BEARISH', 'VOLUME_ABOVE', 'BREAKOUT'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>)}
          </Select>
          {needsThreshold && <Input aria-label="Threshold" type="number" placeholder="Threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-28" />}
          <Button size="sm" variant="secondary" onClick={() => alert.mutate(undefined)} disabled={alert.isPending || (needsThreshold && !threshold)}>Create alert</Button>
        </div>
        {alert.isSuccess && <p className="text-xs text-bull">Alert created. <Link className="underline" href="/alerts">Manage alerts</Link></p>}
        <ErrorText error={alert.error} />
      </CardContent>
    </Card>
  );
}

interface RiskData {
  entryReference: number; atr14: number | null;
  stops: { percentStop: number; atrStop: number | null; suggestedStop: number };
  targets: { riskRewardTarget: number; percentTarget: number; riskRewardRatio: number };
  positionSizing: { riskBudget: number; riskPerShare: number; suggestedShares: number; sharesByRisk: number; sharesByMaxPosition: number };
  disclaimer: string;
}

export function RiskCard({ symbol }: { symbol: string }) {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ['risk', symbol], queryFn: () => api.get<RiskData>(`/portfolio/risk/${symbol}`), enabled: !!user });
  if (!user) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Risk tools</CardTitle><CardDescription>Based on your risk settings (1% risk per trade).</CardDescription></CardHeader>
      <CardContent className="text-xs">
        <ErrorText error={error} />
        {isLoading || !data ? <Skeleton className="h-24" /> : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Reference price</span><span className="font-mono">{fmtNum(data.entryReference)}</span>
            <span className="text-muted-foreground">ATR(14)</span><span className="font-mono">{fmtNum(data.atr14)}</span>
            <span className="text-muted-foreground">% stop / ATR stop</span><span className="font-mono">{fmtNum(data.stops.percentStop)} / {fmtNum(data.stops.atrStop)}</span>
            <span className="text-muted-foreground">Suggested stop</span><span className="font-mono text-bear">{fmtNum(data.stops.suggestedStop)}</span>
            <span className="text-muted-foreground">Target ({data.targets.riskRewardRatio}R)</span><span className="font-mono text-bull">{fmtNum(data.targets.riskRewardTarget)}</span>
            <span className="text-muted-foreground">Risk budget</span><span className="font-mono">NPR {fmtNpr(data.positionSizing.riskBudget)}</span>
            <span className="text-muted-foreground">Suggested shares</span><span className="font-mono">{fmtInt(data.positionSizing.suggestedShares)}</span>
          </div>
        )}
        {data && <p className="mt-2 text-[11px] text-muted-foreground">{data.disclaimer}</p>}
      </CardContent>
    </Card>
  );
}

export function AiExplainCard({ symbol }: { symbol: string }) {
  const user = useAuth((s) => s.user);
  const [enabled, setEnabled] = useState(false);
  const { data, isFetching, error } = useQuery({ queryKey: ['ai-explain', symbol], queryFn: () => api.get<AiAnswer>(`/ai/explain/${symbol}`), enabled: enabled && !!user, staleTime: 600_000 });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle>AI technical summary</CardTitle><CardDescription>Generated only from the data shown on this page.</CardDescription></div>
        {data && <Badge>{data.engine === 'claude' ? `Claude (${data.model})` : 'Rule-based'}</Badge>}
      </CardHeader>
      <CardContent>
        {!user ? <p className="text-xs text-muted-foreground"><Link className="text-primary" href="/login">Log in</Link> to use the AI analyst.</p>
          : !enabled ? <Button size="sm" onClick={() => setEnabled(true)}>Explain this setup</Button>
          : isFetching && !data ? <Skeleton className="h-48" /> : (
            <>
              <ErrorText error={error} />
              {data?.note && <Callout className="mb-2">{data.note}</Callout>}
              {data && <Markdown text={data.answer} />}
            </>
          )}
      </CardContent>
    </Card>
  );
}
