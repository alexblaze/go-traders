'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/require-auth';
import { SignalBadge, StrengthBar } from '@/components/signals/signal-badge';
import { Disclaimer } from '@/components/signals/disclaimer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/inputs';
import { Empty, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useSectors, useSignalFeed, useStrategies } from '@/hooks/queries';
import { download } from '@/lib/api';
import { fmtDate, fmtNum } from '@/lib/format';

export default function SignalsPage() {
  const [strategy, setStrategy] = useState('ensemble');
  const [signal, setSignal] = useState('');
  const [minStrength, setMinStrength] = useState(0);
  const [sector, setSector] = useState('');
  const strategies = useStrategies();
  const sectors = useSectors('1D');
  const { data, isLoading, error } = useSignalFeed({ strategy, signal: signal || undefined, minStrength, sector: sector || undefined, pageSize: 100 });
  return (
    <div className="space-y-4">
      <PageHeader title="Signals" description={`Latest candidate signals${data?.meta?.date ? ` for ${fmtDate(String(data.meta.date))}` : ''}.`}
        actions={<><Button size="sm" variant="outline" onClick={() => download('/export/signals', { format: 'csv', strategy, ...(signal ? { signal } : {}) })}>Export CSV</Button><Button size="sm" variant="outline" onClick={() => download('/export/signals', { format: 'pdf', strategy })}>PDF</Button></>} />
      <Card>
        <CardContent className="flex flex-wrap gap-2 p-3">
          <Select aria-label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} className="w-56">{strategies.data?.filter((s) => s.isBuiltin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select aria-label="Signal" value={signal} onChange={(e) => setSignal(e.target.value)} className="w-40"><option value="">All signals</option><option value="BUY">BUY candidates</option><option value="SELL">SELL candidates</option><option value="HOLD">HOLD</option></Select>
          <Select aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} className="w-52"><option value="">All sectors</option>{sectors.data?.sectors.map((s) => <option key={s.sector}>{s.sector}</option>)}</Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Min strength <Input type="number" min={0} max={100} value={minStrength} onChange={(e) => setMinStrength(Number(e.target.value))} className="w-20" /></label>
        </CardContent>
      </Card>
      <ErrorText error={error} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton className="m-4 h-64" /> : !data?.data.length ? <Empty>No signals match these filters.</Empty> : (
            <Table>
              <thead><tr><Th>Symbol</Th><Th>Signal</Th><Th>Strength</Th><Th className="text-right">Price</Th><Th>Regime</Th><Th>Supporting indicators</Th><Th>Date</Th></tr></thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/40">
                    <Td><Link href={`/stocks/${s.symbol}`} className="font-medium text-primary hover:underline">{s.symbol}</Link></Td>
                    <Td><SignalBadge signal={s.signal} /></Td>
                    <Td><StrengthBar value={s.strength} /></Td>
                    <Td className="text-right font-mono">{fmtNum(s.price)}</Td>
                    <Td className="text-xs">{s.marketRegime?.replace(/_/g, ' ')}</Td>
                    <Td className="max-w-[380px] truncate text-xs text-muted-foreground">{s.reasons.filter((r) => r.direction !== 'NEUTRAL').slice(0, 3).map((r) => `${r.direction === 'BULLISH' ? '✓' : '✗'} ${r.condition}`).join(' · ')}</Td>
                    <Td className="text-xs">{fmtDate(s.timestamp)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Disclaimer />
    </div>
  );
}
