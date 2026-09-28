'use client';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/inputs';
import { useDslFields } from '@/hooks/queries';
import type { Comparison, ConditionGroup, Operand } from '@/lib/types';

const COMPARATOR_LABEL: Record<string, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', crossesAbove: 'crosses above', crossesBelow: 'crosses below' };
const isGroup = (c: Comparison | ConditionGroup): c is ConditionGroup => 'op' in c;
export const emptyComparison = (): Comparison => ({ left: { field: 'rsi14' }, comparator: '<', right: { value: 30 } });

function OperandEditor({ value, onChange, fields }: { value: Operand; onChange: (o: Operand) => void; fields: { key: string; label: string }[] }) {
  const isField = 'field' in value;
  return (
    <div className="flex items-center gap-1">
      <Select aria-label="Operand type" value={isField ? 'field' : 'value'} className="w-24" onChange={(e) => onChange(e.target.value === 'field' ? { field: 'close' } : { value: 0 })}>
        <option value="field">Indicator</option>
        <option value="value">Number</option>
      </Select>
      {isField ? (
        <>
          <Select aria-label="Indicator" value={value.field} className="w-48" onChange={(e) => onChange({ ...value, field: e.target.value })}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </Select>
          <span className="text-xs text-muted-foreground">×</span>
          <Input aria-label="Multiplier" type="number" step="0.1" className="w-16" value={value.multiplier ?? 1} onChange={(e) => onChange({ ...value, multiplier: Number(e.target.value) || 1 })} />
        </>
      ) : (
        <Input aria-label="Value" type="number" step="any" className="w-28" value={value.value} onChange={(e) => onChange({ value: Number(e.target.value) })} />
      )}
    </div>
  );
}

/** Visual editor for the structured JSON condition DSL (no code is ever executed). */
export function ConditionBuilder({ value, onChange, depth = 0 }: { value: ConditionGroup; onChange: (g: ConditionGroup) => void; depth?: number }) {
  const fields = useDslFields().data?.fields ?? [];
  const comparators = useDslFields().data?.comparators ?? Object.keys(COMPARATOR_LABEL);
  const update = (i: number, c: Comparison | ConditionGroup) => onChange({ ...value, conditions: value.conditions.map((x, j) => (j === i ? c : x)) });
  const remove = (i: number) => onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) });
  return (
    <div className={depth ? 'rounded-md border border-dashed border-border p-2' : ''}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Match</span>
        <Select aria-label="Group operator" value={value.op} className="w-24" onChange={(e) => onChange({ ...value, op: e.target.value as 'AND' | 'OR' })}>
          <option value="AND">ALL (AND)</option>
          <option value="OR">ANY (OR)</option>
        </Select>
        <span className="text-muted-foreground">of these conditions</span>
      </div>
      <div className="space-y-2">
        {value.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1">
            {i > 0 && <span className="w-10 text-[11px] font-bold text-muted-foreground">{value.op}</span>}
            {isGroup(c) ? (
              <div className="flex-1"><ConditionBuilder value={c} onChange={(g) => update(i, g)} depth={depth + 1} /></div>
            ) : (
              <>
                <OperandEditor value={c.left} fields={fields} onChange={(o) => update(i, { ...c, left: o })} />
                <Select aria-label="Comparator" value={c.comparator} className="w-32" onChange={(e) => update(i, { ...c, comparator: e.target.value })}>
                  {comparators.map((k) => <option key={k} value={k}>{COMPARATOR_LABEL[k] ?? k}</option>)}
                </Select>
                <OperandEditor value={c.right} fields={fields} onChange={(o) => update(i, { ...c, right: o })} />
              </>
            )}
            <Button type="button" variant="ghost" size="icon" aria-label="Remove condition" onClick={() => remove(i)} disabled={value.conditions.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, conditions: [...value.conditions, emptyComparison()] })}><Plus className="h-3 w-3" /> Condition</Button>
        {depth < 2 && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, conditions: [...value.conditions, { op: 'OR', conditions: [emptyComparison()] }] })}><Plus className="h-3 w-3" /> Group</Button>}
      </div>
    </div>
  );
}
