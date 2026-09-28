import { ArrowDownRight, ArrowUpRight, MinusCircle } from 'lucide-react';
import type { Direction, SignalType } from '@/lib/types';
import { cn } from '@/lib/utils';

const LABEL: Record<SignalType, string> = { BUY: 'BUY candidate', SELL: 'SELL candidate', HOLD: 'HOLD / No clear signal' };

/** Signal badge: uses icon + text + colour so meaning never relies on colour alone. */
export function SignalBadge({ signal, compact = false, className }: { signal: SignalType | null | undefined; compact?: boolean; className?: string }) {
  if (!signal) return <span className="text-xs text-muted-foreground">N/A</span>;
  const Icon = signal === 'BUY' ? ArrowUpRight : signal === 'SELL' ? ArrowDownRight : MinusCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
        signal === 'BUY' && 'border-bull/50 bg-bull/10 text-bull',
        signal === 'SELL' && 'border-bear/50 bg-bear/10 text-bear',
        signal === 'HOLD' && 'border-neutral/50 bg-neutral/10 text-neutral',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? signal : LABEL[signal]}
    </span>
  );
}

export function DirectionMark({ direction }: { direction: Direction }) {
  if (direction === 'BULLISH') return <span className="font-bold text-bull" aria-label="supports bullish">✓</span>;
  if (direction === 'BEARISH') return <span className="font-bold text-bear" aria-label="supports bearish">✗</span>;
  return <span className="text-neutral" aria-label="neutral">•</span>;
}

/** Text + bar. The number is an internal strength score, not a probability. */
export function StrengthBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('flex items-center gap-2', className)} title="Internal signal-strength metric (0–100). Not a probability of profit.">
      <div className="h-2 w-24 overflow-hidden rounded bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label="Signal strength">
        <div className="h-full bg-primary" style={{ width: `${v}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums">{v}</span>
    </div>
  );
}

export function DataSourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const demo = source.startsWith('DEMO') || source === 'MOCK';
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', demo ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-500' : 'border-primary/50 text-primary')}>
      Data Source: {demo ? `${source} DATA` : source}
    </span>
  );
}
