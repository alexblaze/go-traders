import { DateTime } from 'luxon';

/** Nepal market timezone. All storage is UTC; convert only for display. */
export const NEPAL_TZ = 'Asia/Kathmandu';

/** Parse a YYYY-MM-DD trading date into a UTC-midnight Date. */
export function parseTradingDate(value: string): Date | null {
  const dt = DateTime.fromISO(value.trim(), { zone: 'utc' });
  if (!dt.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return dt.startOf('day').toJSDate();
}

/** Format a Date as YYYY-MM-DD (UTC calendar date). */
export function toDateKey(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toISODate() ?? '';
}

/** Format an instant for Nepal display, e.g. "2026-09-28 15:00 NPT". */
export function formatNpt(date: Date, withTime = true): string {
  const dt = DateTime.fromJSDate(date).setZone(NEPAL_TZ);
  return withTime ? `${dt.toFormat('yyyy-MM-dd HH:mm')} NPT` : dt.toFormat('yyyy-MM-dd');
}

/** Current calendar date in Nepal as a UTC-midnight Date. */
export function todayInNepal(now: Date = new Date()): Date {
  const iso = DateTime.fromJSDate(now).setZone(NEPAL_TZ).toISODate()!;
  return DateTime.fromISO(iso, { zone: 'utc' }).toJSDate();
}

export function addDays(date: Date, days: number): Date {
  return DateTime.fromJSDate(date, { zone: 'utc' }).plus({ days }).toJSDate();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    DateTime.fromJSDate(b, { zone: 'utc' }).diff(DateTime.fromJSDate(a, { zone: 'utc' }), 'days').days,
  );
}

/** ISO weekday in UTC calendar terms: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: Date): number {
  return DateTime.fromJSDate(date, { zone: 'utc' }).weekday;
}

export function monthKey(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyy-MM');
}
