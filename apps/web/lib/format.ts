/** Display helpers. Times are shown in Nepal time via the IANA tz database (never manual offsets). */
const NPT = 'Asia/Kathmandu';

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  return Math.round(v).toLocaleString('en-US');
}

/** Compact NPR amounts using Nepali lakh/crore grouping. */
export function fmtNpr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtPct(v: number | null | undefined, digits = 2, sign = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return 'N/A';
  const d = typeof v === 'string' ? new Date(v) : v;
  // Trading dates are stored as UTC midnight — format the calendar date in UTC.
  return d.toLocaleDateString('en-CA', { timeZone: 'UTC' });
}

export function fmtDateTimeNpt(v: string | Date | null | undefined): string {
  if (!v) return 'N/A';
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${new Intl.DateTimeFormat('en-CA', { timeZone: NPT, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '')} NPT`;
}

export function changeClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-bull' : 'text-bear';
}
