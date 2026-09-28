'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { StatCard } from '@/components/market/widgets';
import { SignalBadge } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Badge, Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation, useOrders, usePortfolio } from '@/hooks/queries';
import { api, download } from '@/lib/api';
import { changeClass, fmtDateTimeNpt, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

function OrderTicket() {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState('10');
  const [reason, setReason] = useState('');
  const m = useApiMutation(() => api.post<{ filledPrice: number; fees: { total: number }; realizedPnl: number | null }>('/portfolio/orders', { symbol: symbol.toUpperCase(), side, quantity: Number(qty), reason: reason || undefined }), [['portfolio'], ['portfolio', 'orders']]);
  return (
    <Card>
      <CardHeader><CardTitle>Order ticket</CardTitle><CardDescription>Market order filled at latest close ± slippage.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
          <Field label="Symbol"><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} required /></Field>
          <Field label="Side"><Select value={side} onChange={(e) => setSide(e.target.value as 'BUY' | 'SELL')}><option>BUY</option><option>SELL</option></Select></Field>
          <Field label="Quantity"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required /></Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button className="col-span-2" type="submit" variant={side === 'BUY' ? 'bull' : 'bear'} disabled={m.isPending}>{side === 'BUY' ? 'Buy' : 'Sell'} (paper)</Button>
        </form>
        <ErrorText error={m.error} />
        {m.data && <p className="mt-2 text-xs text-bull">Filled at {fmtNum(m.data.filledPrice)}; fees NPR {fmtNum(m.data.fees.total)}{m.data.realizedPnl !== null ? `; realized P&L NPR ${fmtNum(m.data.realizedPnl)}` : ''}.</p>}
      </CardContent>
    </Card>
  );
}

function CashCard() {
  const [amount, setAmount] = useState('100000');
  const m = useApiMutation((type: 'DEPOSIT' | 'WITHDRAWAL') => api.post('/portfolio/cash', { type, amount: Number(amount) }), [['portfolio']]);
  return (
    <Card>
      <CardHeader><CardTitle>Virtual cash</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Input aria-label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-36" />
        <Button size="sm" variant="secondary" onClick={() => m.mutate('DEPOSIT')}>Add cash</Button>
        <Button size="sm" variant="outline" onClick={() => m.mutate('WITHDRAWAL')}>Remove cash</Button>
        <ErrorText error={m.error} />
      </CardContent>
    </Card>
  );
}

function PortfolioInner() {
  const { data: p, isLoading, error } = usePortfolio();
  const orders = useOrders();
  if (isLoading || !p) return <><ErrorText error={error} /><Skeleton className="h-96" /></>;
  return (
    <div className="space-y-4">
      <PageHeader title="Paper trading" description={p.note}
        actions={<><Badge>Broker: PAPER</Badge>{['csv', 'pdf'].map((f) => <Button key={f} size="sm" variant="outline" onClick={() => download('/export/portfolio', { format: f })}>{f.toUpperCase()}</Button>)}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Equity" value={`NPR ${fmtNpr(p.equity)}`} />
        <StatCard label="Cash" value={`NPR ${fmtNpr(p.cash)}`} />
        <StatCard label="Market value" value={`NPR ${fmtNpr(p.marketValue)}`} sub={`Exposure ${fmtPct(p.exposurePct, 1, false)}`} />
        <StatCard label="Unrealized P&L" value={fmtNpr(p.unrealizedPnl)} valueClass={changeClass(p.unrealizedPnl)} />
        <StatCard label="Realized P&L" value={fmtNpr(p.realizedPnl)} valueClass={changeClass(p.realizedPnl)} />
        <StatCard label="Total return" value={fmtPct(p.totalReturnPct)} valueClass={changeClass(p.totalReturnPct)} sub={`on NPR ${fmtNpr(p.initialCash + p.netDeposits)} contributed`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Positions</CardTitle></CardHeader>
          <CardContent className="p-0">
            {!p.positions.length ? <Empty>No open positions. Open a stock page to paper trade from its signals.</Empty> : (
              <Table>
                <thead><tr><Th>Symbol</Th><Th className="text-right">Qty</Th><Th className="text-right">Avg entry</Th><Th className="text-right">Price</Th><Th className="text-right">Value</Th><Th className="text-right">Unrealized</Th><Th className="text-right">Weight</Th></tr></thead>
                <tbody>{p.positions.map((x) => (
                  <tr key={x.symbol}>
                    <Td><Link className="font-medium text-primary hover:underline" href={`/stocks/${x.symbol}`}>{x.symbol}</Link></Td>
                    <Td className="text-right">{fmtInt(x.quantity)}</Td><Td className="text-right font-mono">{fmtNum(x.averageCost)}</Td><Td className="text-right font-mono">{fmtNum(x.marketPrice)}</Td>
                    <Td className="text-right font-mono">{fmtNpr(x.marketValue)}</Td>
                    <Td className={cn('text-right font-mono', changeClass(x.unrealizedPnl))}>{fmtNpr(x.unrealizedPnl)} ({fmtPct(x.unrealizedPnlPct)})</Td>
                    <Td className="text-right">{fmtPct(x.weightPct, 1, false)}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4"><OrderTicket /><CashCard /></div>
      </div>
      <Card>
        <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!orders.data?.data.length ? <Empty>No orders yet.</Empty> : (
            <Table>
              <thead><tr><Th>Time</Th><Th>Symbol</Th><Th>Side</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Fees</Th><Th className="text-right">Realized</Th><Th>Status</Th><Th>Strategy / signal</Th><Th>Reason</Th></tr></thead>
              <tbody>{orders.data.data.map((o) => (
                <tr key={o.id}>
                  <Td className="text-xs">{fmtDateTimeNpt(o.timestamp)}</Td><Td>{o.symbol}</Td>
                  <Td className={o.side === 'BUY' ? 'text-bull' : 'text-bear'}>{o.side}</Td><Td className="text-right">{fmtInt(o.quantity)}</Td>
                  <Td className="text-right font-mono">{fmtNum(o.price)}</Td><Td className="text-right font-mono">{fmtNum(o.fees)}</Td>
                  <Td className={cn('text-right font-mono', changeClass(o.realizedPnl))}>{o.realizedPnl !== null ? fmtNum(o.realizedPnl) : '—'}</Td>
                  <Td><Badge>{o.status}</Badge></Td>
                  <Td className="text-xs">{o.strategyId ?? '—'} {o.signal && <SignalBadge signal={o.signal} compact />}</Td>
                  <Td className="max-w-[240px] truncate text-xs text-muted-foreground">{o.reason}</Td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortfolioPage() {
  return <RequireAuth><PortfolioInner /></RequireAuth>;
}
