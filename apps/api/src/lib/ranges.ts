import { addDays } from '@nepse/shared';

export const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'] as const;
export type Range = (typeof RANGES)[number];

/** Calendar-day lookback for a chart range (data is end-of-day; 1D = latest session). */
export function rangeStart(range: Range, latest: Date): Date | undefined {
  const days: Record<Range, number | undefined> = { '1D': 0, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '3Y': 1096, '5Y': 1827, MAX: undefined };
  const d = days[range];
  return d === undefined ? undefined : addDays(latest, -d);
}
