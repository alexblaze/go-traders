'use client';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Callout, ErrorText, Skeleton, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { changeClass, fmtDateTimeNpt, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';

interface Perf {
  status: 'READY' | 'PENDING'; updatedAt?: string; label: string; methodology?: string; universe?: number;
  strategies: { strategyId: string; strategyName: string; signals: number; avgReturn5d: number | null; avgReturn20d: number | null; winRatePct: number | null; maxDrawdownPct: number | null; historicalOutcome: string }[];
}

export default function SignalAnalyticsPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ['analytics', 'signals'], queryFn: () => api.get<Perf>('/analytics/signals'), refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 5000 : false) });
  const refresh = useApiMutation(() => api.post('/analytics/signals/refresh'), [['analytics', 'signals']]);
  return (
    <div className="space-y-4">
      <PageHeader title="Signal performance analysis" description="How each strategy's past signals behaved across the stock universe."
        actions={user ? <Button size="sm" variant="outline" onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending}>Recompute</Button> : null} />
      <Callout tone="warn" title="Historical observations only">{data?.label ?? 'Past signal outcomes do not imply future performance.'}</Callout>
      <ErrorText error={error} />
      <Card>
        <CardHeader>
          <CardTitle>By strategy</CardTitle>
          <CardDescription>{data?.methodology} {data?.updatedAt ? `Updated ${fmtDateTimeNpt(data.updatedAt)} · ${data.universe} stocks.` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || data?.status === 'PENDING' ? <Skeleton className="h-64" /> : (
            <Table>
              <thead><tr><Th>Strategy</Th><Th className="text-right">Signals</Th><Th>Historical outcome</Th><Th className="text-right">Avg return after 5D</Th><Th className="text-right">Avg return after 20D</Th><Th className="text-right">Win rate (20D)</Th><Th className="text-right">Max drawdown</Th></tr></thead>
              <tbody>
                {data?.strategies.map((s) => (
                  <tr key={s.strategyId}>
                    <Td className="font-medium">{s.strategyName}</Td><Td className="text-right">{s.signals}</Td><Td className="text-xs text-muted-foreground">{s.historicalOutcome}</Td>
                    <Td className={cn('text-right font-mono', changeClass(s.avgReturn5d))}>{fmtPct(s.avgReturn5d)}</Td>
                    <Td className={cn('text-right font-mono', changeClass(s.avgReturn20d))}>{fmtPct(s.avgReturn20d)}</Td>
                    <Td className="text-right font-mono">{fmtPct(s.winRatePct, 1, false)}</Td>
                    <Td className="text-right font-mono text-bear">{fmtPct(s.maxDrawdownPct)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
