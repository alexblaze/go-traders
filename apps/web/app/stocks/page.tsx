'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PageHeader } from '@/components/layout/require-auth';
import { DataSourceBadge } from '@/components/signals/signal-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/inputs';
import { Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useSectors, useStocks } from '@/hooks/queries';
import { changeClass, fmtInt, fmtNpr, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

type SortKey = 'symbol' | 'changePercent' | 'volume' | 'turnover' | 'close';

function StocksInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [sector, setSector] = useState('');
  const [sort, setSort] = useState<SortKey>('symbol');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const q = { search: params.get('search') ?? undefined, sector: sector || undefined, sort, order, page, pageSize: 50 };
  const { data, isLoading, error } = useStocks(q);
  const sectors = useSectors('1D');
  const header = (key: SortKey, label: string, right = false) => (
    <Th className={cn('cursor-pointer select-none', right && 'text-right')} aria-sort={sort === key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => { setOrder(sort === key && order === 'desc' ? 'asc' : 'desc'); setSort(key); }}>
      {label}{sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
    </Th>
  );
  const total = Number(data?.meta?.total ?? 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Stocks" description="Search listed companies and open technical analysis." />
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); router.push(`/stocks?search=${encodeURIComponent(search)}`); }}>
            <Input aria-label="Search" placeholder="Symbol or company" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <Select aria-label="Sector" value={sector} onChange={(e) => { setSector(e.target.value); setPage(1); }} className="w-56">
            <option value="">All sectors</option>
            {sectors.data?.sectors.map((s) => <option key={s.sector} value={s.sector}>{s.sector}</option>)}
          </Select>
        </CardContent>
      </Card>
      <ErrorText error={error} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton className="m-4 h-64" /> : !data?.data.length ? <Empty>No stocks found.</Empty> : (
            <Table>
              <thead><tr>{header('symbol', 'Symbol')}<Th>Company</Th><Th>Sector</Th>{header('close', 'Close', true)}{header('changePercent', 'Change', true)}{header('volume', 'Volume', true)}{header('turnover', 'Turnover', true)}<Th className="text-right">RSI</Th><Th>Trend</Th><Th>Source</Th></tr></thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.symbol} className="hover:bg-accent/40">
                    <Td><Link href={`/stocks/${s.symbol}`} className="font-medium text-primary hover:underline">{s.symbol}</Link></Td>
                    <Td className="max-w-[260px] truncate">{s.companyName}</Td>
                    <Td className="text-muted-foreground">{s.sector ?? 'N/A'}</Td>
                    <Td className="text-right font-mono">{fmtNum(s.close)}</Td>
                    <Td className={cn('text-right font-mono', changeClass(s.changePercent))}>{fmtPct(s.changePercent)}</Td>
                    <Td className="text-right font-mono">{fmtInt(s.volume)}</Td>
                    <Td className="text-right font-mono">{fmtNpr(s.turnover)}</Td>
                    <Td className="text-right font-mono">{fmtNum(s.rsi14, 1)}</Td>
                    <Td className="text-xs">{s.regime?.replace(/_/g, ' ') ?? 'N/A'}</Td>
                    <Td><DataSourceBadge source={s.isDemo ? 'DEMO' : s.dataSource} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      {total > 50 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} / {Math.ceil(total / 50)}</span>
          <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

export default function StocksPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><StocksInner /></Suspense>;
}
