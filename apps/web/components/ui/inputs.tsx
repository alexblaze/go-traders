import * as React from 'react';
import { cn } from '@/lib/utils';

const base = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, className)} {...p} />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'pr-8', className)} {...p} />
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'h-auto min-h-[80px] py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-muted-foreground', className)} {...p} />;
}

/** Wraps the control in a <label> so it is programmatically associated (screen readers, getByLabel). */
export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="text-[11px] text-bear">{error}</span>}
    </div>
  );
}
