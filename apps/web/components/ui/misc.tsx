import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium', className)} {...p} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function Callout({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'error'; title?: string; children: React.ReactNode; className?: string }) {
  const tones = { info: 'border-primary/40 bg-primary/5', warn: 'border-yellow-500/40 bg-yellow-500/5', error: 'border-bear/50 bg-bear/5' };
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={cn('rounded-md border p-3 text-xs', tones[tone], className)}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-md bg-muted p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded px-2.5 py-1 text-xs font-medium transition-colors', value === o.value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...p} />
    </div>
  );
}
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('whitespace-nowrap border-b border-border px-2 py-2 text-left text-xs font-medium text-muted-foreground', className)} {...p} />;
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('whitespace-nowrap border-b border-border/50 px-2 py-1.5', className)} {...p} />;

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-xs text-bear">{(error as Error).message}</p>;
}
