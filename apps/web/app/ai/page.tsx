'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader, RequireAuth } from '@/components/layout/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Markdown } from '@/components/ui/markdown';
import { Badge, Callout, ErrorText, Skeleton } from '@/components/ui/misc';
import { useApiMutation, useBacktests, useStrategies } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { AiAnswer } from '@/lib/types';

const EXAMPLES = [
  'Why is this stock showing a bullish signal?',
  'Which indicators currently support this signal?',
  'What changed compared with yesterday?',
  'What risks are visible in the current technical setup?',
];

function Inner() {
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<{ engine: string; model: string | null; note: string }>('/ai/status') });
  const backtests = useBacktests();
  const strategies = useStrategies();
  const [mode, setMode] = useState<'stock' | 'backtest' | 'compare'>('stock');
  const [symbol, setSymbol] = useState('DMCB1');
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [backtestId, setBacktestId] = useState('');
  const [a, setA] = useState('ema_crossover');
  const [b, setB] = useState('macd');
  const [history, setHistory] = useState<{ q: string; r: AiAnswer }[]>([]);
  const ask = useApiMutation(() =>
    api.post<AiAnswer>('/ai/ask', mode === 'backtest' ? { question: question || 'Explain this backtest.', backtestId } : mode === 'compare' ? { question: question || 'Compare these two strategies historically.', symbol, compareStrategies: [a, b] } : { question, symbol }),
  );
  return (
    <div className="space-y-4">
      <PageHeader title="AI market analyst" description="Answers are generated only from structured application data (prices, indicators, signals, backtests)." actions={status.data && <Badge>{status.data.engine === 'claude' ? `Claude · ${status.data.model}` : 'Rule-based engine'}</Badge>} />
      <Callout>{status.data?.note} The analyst separates observed data, calculated indicators, interpretation and uncertainty. It is not financial advice.</Callout>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Ask</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="About"><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="stock">A stock</option><option value="backtest">One of my backtests</option><option value="compare">Compare two strategies on a stock</option></Select></Field>
            {mode !== 'backtest' && <Field label="Symbol"><Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></Field>}
            {mode === 'backtest' && (
              <Field label="Backtest"><Select value={backtestId} onChange={(e) => setBacktestId(e.target.value)}><option value="">Select…</option>{backtests.data?.data.filter((x) => x.status === 'COMPLETED').map((x) => <option key={x.id} value={x.id}>{x.symbol} · {x.strategyName}</option>)}</Select></Field>
            )}
            {mode === 'compare' && (
              <div className="grid grid-cols-2 gap-2">
                {[[a, setA], [b, setB]].map(([v, set], i) => (
                  <Field key={i} label={`Strategy ${i + 1}`}><Select value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value)}>{strategies.data?.filter((s) => s.isBuiltin && s.id !== 'ensemble').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                ))}
              </div>
            )}
            <Field label="Question"><Textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} /></Field>
            <div className="flex flex-wrap gap-1">{EXAMPLES.map((q) => <button key={q} className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent" onClick={() => setQuestion(q)}>{q}</button>)}</div>
            <Button onClick={() => ask.mutate(undefined, { onSuccess: (r) => setHistory([{ q: question, r }, ...history]) })} disabled={ask.isPending || (mode === 'backtest' && !backtestId)}>
              {ask.isPending ? 'Analysing…' : 'Ask analyst'}
            </Button>
            <ErrorText error={ask.error} />
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {ask.isPending && <Skeleton className="h-64" />}
          {history.map((h, i) => (
            <Card key={i}>
              <CardHeader><CardTitle>{h.q}</CardTitle><CardDescription>{h.r.engine === 'claude' ? `Claude (${h.r.model})` : 'Rule-based analyst'}{h.r.note ? ` · ${h.r.note}` : ''}</CardDescription></CardHeader>
              <CardContent><Markdown text={h.r.answer} /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AiPage() {
  return <RequireAuth><Inner /></RequireAuth>;
}
