'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Callout, ErrorText, Skeleton } from '@/components/ui/misc';
import { useApiMutation, useStrategies } from '@/hooks/queries';
import { api } from '@/lib/api';

interface Settings {
  defaultTimeframe: string; defaultStrategy: string; commissionOverride: number | null; slippageBps: number;
  signalThresholds: { minStrength: number }; notifications: { inApp: boolean; email: boolean };
  risk: { maxPositionPct: number; maxExposurePct: number; stopLossPct: number; takeProfitPct: number; atrStopMultiple: number; riskRewardRatio: number };
  chart: { indicators: string[]; showVolume: boolean };
}

function Inner() {
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/users/me/settings') });
  const strategies = useStrategies();
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  const save = useApiMutation((v: Settings) => api.put<Settings>('/users/me/settings', v), [['settings'], ['risk']]);
  if (isLoading || !s) return <Skeleton className="h-96" />;
  const setRisk = (k: keyof Settings['risk'], v: number) => setS({ ...s, risk: { ...s.risk, [k]: v } });
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader><CardTitle>Defaults</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Default chart range"><Select value={s.defaultTimeframe} onChange={(e) => setS({ ...s, defaultTimeframe: e.target.value })}>{['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Default strategy"><Select value={s.defaultStrategy} onChange={(e) => setS({ ...s, defaultStrategy: e.target.value })}>{strategies.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Commission override (fraction)" hint="Empty = use fee schedules"><Input type="number" step="0.0001" value={s.commissionOverride ?? ''} onChange={(e) => setS({ ...s, commissionOverride: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Slippage (bps)"><Input type="number" value={s.slippageBps} onChange={(e) => setS({ ...s, slippageBps: Number(e.target.value) })} /></Field>
          <Field label="Min signal strength to highlight"><Input type="number" min={0} max={100} value={s.signalThresholds.minStrength} onChange={(e) => setS({ ...s, signalThresholds: { minStrength: Number(e.target.value) } })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.notifications.inApp} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, inApp: e.target.checked } })} /> In-app notifications</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.notifications.email} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, email: e.target.checked } })} /> Email notifications</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.chart.showVolume} onChange={(e) => setS({ ...s, chart: { ...s.chart, showVolume: e.target.checked } })} /> Show volume on charts</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Risk limits & tools</CardTitle><CardDescription>Used by paper trading checks and the risk calculator.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Max position size (% of equity)"><Input type="number" value={s.risk.maxPositionPct} onChange={(e) => setRisk('maxPositionPct', Number(e.target.value))} /></Field>
            <Field label="Max portfolio exposure (%)"><Input type="number" value={s.risk.maxExposurePct} onChange={(e) => setRisk('maxExposurePct', Number(e.target.value))} /></Field>
            <Field label="Stop-loss level (%)"><Input type="number" step="0.5" value={s.risk.stopLossPct} onChange={(e) => setRisk('stopLossPct', Number(e.target.value))} /></Field>
            <Field label="Take-profit level (%)"><Input type="number" step="0.5" value={s.risk.takeProfitPct} onChange={(e) => setRisk('takeProfitPct', Number(e.target.value))} /></Field>
            <Field label="ATR stop multiple"><Input type="number" step="0.5" value={s.risk.atrStopMultiple} onChange={(e) => setRisk('atrStopMultiple', Number(e.target.value))} /></Field>
            <Field label="Risk/reward ratio"><Input type="number" step="0.5" value={s.risk.riskRewardRatio} onChange={(e) => setRisk('riskRewardRatio', Number(e.target.value))} /></Field>
          </div>
          <Callout>Risk settings are analysis tools, not guaranteed protection against losses. Stops may gap or fail to fill (e.g. circuit limits, illiquidity).</Callout>
        </CardContent>
      </Card>
      <Button onClick={() => save.mutate(s)} disabled={save.isPending}>Save settings</Button>
      {save.isSuccess && <span className="ml-2 text-xs text-bull">Saved.</span>}
      <ErrorText error={save.error} />
    </div>
  );
}

export default function SettingsPage() {
  return <RequireAuth><Inner /></RequireAuth>;
}
