import { addDays, isoWeekday, toDateKey } from './time';

/**
 * Configurable market calendar. We never assume every weekday is a trading day:
 * the weekly trading days and the holiday list are data, not code.
 *
 * NEPSE has historically traded Sunday–Thursday; this is only a default and can be
 * overridden from configuration / the database.
 */
export interface MarketCalendarConfig {
  /** ISO weekdays that are regular trading days (1=Mon .. 7=Sun). */
  tradingWeekdays: number[];
  /** Explicit closures (YYYY-MM-DD). */
  holidays: string[];
  /** Explicit extra sessions on otherwise non-trading days (YYYY-MM-DD). */
  specialSessions?: string[];
}

export const DEFAULT_NEPSE_CALENDAR: MarketCalendarConfig = {
  tradingWeekdays: [7, 1, 2, 3, 4],
  holidays: [],
  specialSessions: [],
};

export class MarketCalendar {
  private readonly weekdays: Set<number>;
  private readonly holidays: Set<string>;
  private readonly special: Set<string>;

  constructor(config: MarketCalendarConfig = DEFAULT_NEPSE_CALENDAR) {
    this.weekdays = new Set(config.tradingWeekdays);
    this.holidays = new Set(config.holidays);
    this.special = new Set(config.specialSessions ?? []);
  }

  isTradingDay(date: Date): boolean {
    const key = toDateKey(date);
    if (this.special.has(key)) return true;
    if (this.holidays.has(key)) return false;
    return this.weekdays.has(isoWeekday(date));
  }

  /** Trading days in [from, to], inclusive. */
  tradingDays(from: Date, to: Date): Date[] {
    const out: Date[] = [];
    for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
      if (this.isTradingDay(d)) out.push(d);
    }
    return out;
  }

  nextTradingDay(date: Date): Date {
    let d = addDays(date, 1);
    for (let i = 0; i < 366 && !this.isTradingDay(d); i++) d = addDays(d, 1);
    return d;
  }

  /** Expected trading days missing from a set of observed dates. */
  missingDates(observed: Date[], from: Date, to: Date): string[] {
    const seen = new Set(observed.map(toDateKey));
    return this.tradingDays(from, to)
      .map(toDateKey)
      .filter((k) => !seen.has(k));
  }
}
