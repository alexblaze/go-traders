'use client';
import { useState } from 'react';
import { ImportPanel } from '@/components/admin/import-panel';
import { FeesPanel, HealthPanel, JobsPanel, StocksAdminPanel, StrategyParamsPanel } from '@/components/admin/ops-panels';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { Tabs } from '@/components/ui/misc';

type Tab = 'import' | 'jobs' | 'stocks' | 'strategies' | 'fees' | 'health';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('import');
  return (
    <RequireAuth admin>
      <div className="space-y-4">
        <PageHeader title="Admin" description="Data import, synchronisation, job queues, strategy parameters, fee schedules and system health." />
        <Tabs value={tab} onChange={setTab} options={[{ value: 'import', label: 'Data import' }, { value: 'jobs', label: 'Jobs & sync' }, { value: 'stocks', label: 'Stocks & sectors' }, { value: 'strategies', label: 'Strategy parameters' }, { value: 'fees', label: 'Fee schedules' }, { value: 'health', label: 'System health' }]} />
        {tab === 'import' && <ImportPanel />}
        {tab === 'jobs' && <JobsPanel />}
        {tab === 'stocks' && <StocksAdminPanel />}
        {tab === 'strategies' && <StrategyParamsPanel />}
        {tab === 'fees' && <FeesPanel />}
        {tab === 'health' && <HealthPanel />}
      </div>
    </RequireAuth>
  );
}
