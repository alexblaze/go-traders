'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Callout, ErrorText, Table, Td, Th } from '@/components/ui/misc';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { fmtDateTimeNpt, fmtInt } from '@/lib/format';

interface Issue { row: number; field?: string; code: string; message: string }
interface Preview {
  id: string; totalRows: number; validRows: number; errorRows: number; symbols: string[]; newSymbols: string[]; dateRange: { from: string; to: string } | null;
  errors: Issue[]; warnings: Issue[]; preview: { row: number; symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover?: number }[]; willRunInBackground: boolean;
}

export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [createStocks, setCreateStocks] = useState(false);
  const history = useQuery({ queryKey: ['imports'], queryFn: () => api.get<{ id: string; filename: string; status: string; totalRows: number; insertedRows: number; updatedRows: number; errorRows: number; createdAt: string; error: string | null }[]>('/admin/imports'), refetchInterval: 5000 });
  const preview = useApiMutation(async () => api.post<Preview>('/admin/imports', { filename: file!.name, csv: await file!.text(), createStocks }), [['imports']]);
  const commit = useApiMutation((id: string) => api.post<{ status: string; inserted?: number; updated?: number }>(`/admin/imports/${id}/commit`), [['imports'], ['market'], ['stocks']]);
  const p = preview.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Import NEPSE historical CSV</CardTitle>
          <CardDescription>Format: <code>symbol,date,open,high,low,close,volume,turnover</code> (dates YYYY-MM-DD). Rows for NEPSE/SENSITIVE/FLOAT are stored as index values. Nothing is written until you commit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input aria-label="CSV file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={createStocks} onChange={(e) => setCreateStocks(e.target.checked)} /> Create stocks for unknown symbols (otherwise they are rejected)</label>
          <Button onClick={() => preview.mutate(undefined)} disabled={!file || preview.isPending}>{preview.isPending ? 'Validating…' : 'Validate & preview'}</Button>
          <ErrorText error={preview.error} />
        </CardContent>
      </Card>
      {p && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>{fmtInt(p.totalRows)} rows · {fmtInt(p.validRows)} valid · {fmtInt(p.errorRows)} errors · {p.symbols.length} symbols{p.dateRange ? ` · ${p.dateRange.from} → ${p.dateRange.to}` : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.newSymbols.length > 0 && <Callout tone="warn">New symbols will be created: {p.newSymbols.join(', ')}</Callout>}
            {p.errors.length > 0 && (
              <Callout tone="error" title={`${p.errors.length} invalid rows (excluded)`}>
                <ul className="max-h-40 overflow-auto">{p.errors.map((e, i) => <li key={i}>Row {e.row}{e.field ? ` [${e.field}]` : ''}: {e.code} — {e.message}</li>)}</ul>
              </Callout>
            )}
            {p.warnings.length > 0 && (
              <Callout tone="warn" title={`${p.warnings.length} warnings (kept, flagged — not modified)`}>
                <ul className="max-h-40 overflow-auto">{p.warnings.map((e, i) => <li key={i}>Row {e.row}: {e.code} — {e.message}</li>)}</ul>
              </Callout>
            )}
            <Table>
              <thead><tr><Th>Row</Th><Th>Symbol</Th><Th>Date</Th><Th className="text-right">Open</Th><Th className="text-right">High</Th><Th className="text-right">Low</Th><Th className="text-right">Close</Th><Th className="text-right">Volume</Th></tr></thead>
              <tbody>{p.preview.slice(0, 20).map((r) => <tr key={r.row}><Td>{r.row}</Td><Td>{r.symbol}</Td><Td>{r.date.slice(0, 10)}</Td><Td className="text-right">{r.open}</Td><Td className="text-right">{r.high}</Td><Td className="text-right">{r.low}</Td><Td className="text-right">{r.close}</Td><Td className="text-right">{fmtInt(r.volume)}</Td></tr>)}</tbody>
            </Table>
            <Button onClick={() => commit.mutate(p.id)} disabled={p.validRows === 0 || commit.isPending || commit.isSuccess}>
              Commit {fmtInt(p.validRows)} rows{p.willRunInBackground ? ' (background job)' : ''}
            </Button>
            <ErrorText error={commit.error} />
            {commit.data && <p className="text-xs text-bull">Import {commit.data.status}{commit.data.inserted !== undefined ? `: ${commit.data.inserted} inserted, ${commit.data.updated} updated` : ''}. Signals will be regenerated by the worker.</p>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Import history</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>File</Th><Th>Status</Th><Th className="text-right">Rows</Th><Th className="text-right">Inserted</Th><Th className="text-right">Updated</Th><Th className="text-right">Errors</Th><Th>Created</Th></tr></thead>
            <tbody>{history.data?.map((h) => <tr key={h.id}><Td>{h.filename}</Td><Td><Badge>{h.status}</Badge>{h.error && <span className="ml-1 text-xs text-bear">{h.error}</span>}</Td><Td className="text-right">{h.totalRows}</Td><Td className="text-right">{h.insertedRows}</Td><Td className="text-right">{h.updatedRows}</Td><Td className="text-right">{h.errorRows}</Td><Td className="text-xs">{fmtDateTimeNpt(h.createdAt)}</Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
