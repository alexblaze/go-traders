import { describe, expect, it } from 'vitest';
import { MarketCalendar, formatNpt, parseTradingDate, toDateKey } from '../src';

describe('MarketCalendar', () => {
  const cal = new MarketCalendar({ tradingWeekdays: [7, 1, 2, 3, 4], holidays: ['2026-09-29'] });
  it('respects configured weekdays and holidays', () => {
    expect(cal.isTradingDay(parseTradingDate('2026-09-27')!)).toBe(true); // Sunday
    expect(cal.isTradingDay(parseTradingDate('2026-09-26')!)).toBe(false); // Saturday
    expect(cal.isTradingDay(parseTradingDate('2026-10-02')!)).toBe(false); // Friday
    expect(cal.isTradingDay(parseTradingDate('2026-09-29')!)).toBe(false); // holiday
  });
  it('finds missing dates', () => {
    const missing = cal.missingDates([parseTradingDate('2026-09-27')!], parseTradingDate('2026-09-27')!, parseTradingDate('2026-09-30')!);
    expect(missing).toEqual(['2026-09-28', '2026-09-30']);
  });
});

describe('time', () => {
  it('parses strict dates', () => {
    expect(parseTradingDate('2026-01-01')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parseTradingDate('01/01/2026')).toBeNull();
    expect(parseTradingDate('2026-02-30')).toBeNull();
  });
  it('formats Nepal time using tz database (UTC+05:45)', () => {
    expect(formatNpt(new Date('2026-09-28T09:15:00Z'))).toBe('2026-09-28 15:00 NPT');
    expect(toDateKey(new Date('2026-09-28T00:00:00Z'))).toBe('2026-09-28');
  });
});
