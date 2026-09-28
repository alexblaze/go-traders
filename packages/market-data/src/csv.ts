import { parseTradingDate, toDateKey, type OHLCV } from '@nepse/shared';
import Papa from 'papaparse';

export const REQUIRED_COLUMNS = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume'] as const;
export const OPTIONAL_COLUMNS = ['turnover'] as const;

export interface CsvPriceRow extends OHLCV {
  symbol: string;
  rowNumber: number;
}

export interface CsvIssue {
  row: number;
  field?: string;
  code: 'MISSING_COLUMN' | 'MISSING_VALUE' | 'INVALID_DATE' | 'INVALID_NUMBER' | 'NEGATIVE_VALUE' | 'INVALID_OHLC' | 'DUPLICATE_ROW' | 'UNKNOWN_SYMBOL' | 'ANOMALY' | 'EXISTING_RECORD';
  message: string;
  severity: 'error' | 'warning';
}

export interface CsvParseResult {
  rows: CsvPriceRow[];
  errors: CsvIssue[];
  warnings: CsvIssue[];
  totalRows: number;
  symbols: string[];
  dateRange: { from: string; to: string } | null;
}

export interface CsvValidationOptions {
  /** If provided, symbols outside this set are rejected as INVALID_SYMBOL. */
  knownSymbols?: Set<string>;
  /** Keys "SYMBOL|YYYY-MM-DD" already present in the database. */
  existingKeys?: Set<string>;
  /** Flag daily moves larger than this fraction as anomalies (not modified). */
  anomalyThreshold?: number;
}

/**
 * Parse & validate a price CSV. Invalid rows are excluded with an error; suspicious rows are
 * kept but flagged as warnings. Values are never silently "fixed".
 */
export function parsePriceCsv(text: string, opts: CsvValidationOptions = {}): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  const header = parsed.meta.fields ?? [];
  const missingCols = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length) {
    return { rows: [], errors: missingCols.map((c) => ({ row: 1, field: c, code: 'MISSING_COLUMN', message: `Required column "${c}" is missing`, severity: 'error' })), warnings, totalRows: parsed.data.length, symbols: [], dateRange: null };
  }

  const rows: CsvPriceRow[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const err = (code: CsvIssue['code'], message: string, field?: string) => errors.push({ row: rowNumber, field, code, message, severity: 'error' });
    const symbol = (raw.symbol ?? '').trim().toUpperCase();
    if (!symbol) return err('MISSING_VALUE', 'Symbol is empty', 'symbol');
    if (!/^[A-Z0-9]{1,20}$/.test(symbol)) return err('UNKNOWN_SYMBOL', `Invalid symbol format "${symbol}"`, 'symbol');
    if (opts.knownSymbols && !opts.knownSymbols.has(symbol)) return err('UNKNOWN_SYMBOL', `Symbol "${symbol}" is not a listed stock`, 'symbol');
    const date = parseTradingDate(raw.date ?? '');
    if (!date) return err('INVALID_DATE', `Invalid date "${raw.date ?? ''}" (expected YYYY-MM-DD)`, 'date');

    const nums: Record<string, number> = {};
    for (const f of ['open', 'high', 'low', 'close', 'volume', 'turnover']) {
      const v = (raw[f] ?? '').trim().replace(/,/g, '');
      if (v === '') {
        if (f === 'turnover') continue;
        return err('MISSING_VALUE', `Missing ${f}`, f);
      }
      const n = Number(v);
      if (!Number.isFinite(n)) return err('INVALID_NUMBER', `"${raw[f]}" is not a number`, f);
      if (n < 0) return err('NEGATIVE_VALUE', `${f} cannot be negative`, f);
      nums[f] = n;
    }
    if (nums.open <= 0 || nums.close <= 0 || nums.high <= 0 || nums.low <= 0) return err('NEGATIVE_VALUE', 'Prices must be positive', 'close');
    if (nums.high < Math.max(nums.open, nums.close) || nums.low > Math.min(nums.open, nums.close) || nums.low > nums.high)
      return err('INVALID_OHLC', 'Invalid OHLC: require high ≥ max(open, close) and low ≤ min(open, close)');

    const key = `${symbol}|${toDateKey(date)}`;
    if (seen.has(key)) return err('DUPLICATE_ROW', `Duplicate row for ${symbol} on ${toDateKey(date)}`);
    seen.add(key);
    if (opts.existingKeys?.has(key)) warnings.push({ row: rowNumber, code: 'EXISTING_RECORD', message: `${symbol} ${toDateKey(date)} already exists and will be updated`, severity: 'warning' });

    rows.push({ symbol, date, open: nums.open, high: nums.high, low: nums.low, close: nums.close, volume: nums.volume, turnover: nums.turnover, rowNumber });
  });

  // Anomaly detection across consecutive rows per symbol
  const threshold = opts.anomalyThreshold ?? 0.15;
  const bySymbol = groupBySymbol(rows);
  for (const list of bySymbol.values()) {
    for (let i = 1; i < list.length; i++) {
      const chg = list[i].close / list[i - 1].close - 1;
      if (Math.abs(chg) > threshold) {
        warnings.push({ row: list[i].rowNumber, code: 'ANOMALY', message: `${list[i].symbol}: ${(chg * 100).toFixed(1)}% move vs previous row exceeds ${(threshold * 100).toFixed(0)}% (check for corporate action / data error)`, severity: 'warning' });
      }
    }
  }

  const dates = rows.map((r) => r.date.getTime());
  return {
    rows,
    errors,
    warnings,
    totalRows: parsed.data.length,
    symbols: [...bySymbol.keys()].sort(),
    dateRange: rows.length ? { from: toDateKey(new Date(Math.min(...dates))), to: toDateKey(new Date(Math.max(...dates))) } : null,
  };
}

export function groupBySymbol(rows: CsvPriceRow[]): Map<string, CsvPriceRow[]> {
  const m = new Map<string, CsvPriceRow[]>();
  for (const r of rows) {
    const l = m.get(r.symbol) ?? [];
    l.push(r);
    m.set(r.symbol, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.date.getTime() - b.date.getTime());
  return m;
}

export function toPriceCsv(rows: { symbol: string; date: Date; open: number; high: number; low: number; close: number; volume: number; turnover?: number }[]): string {
  const lines = ['symbol,date,open,high,low,close,volume,turnover'];
  for (const r of rows) lines.push([r.symbol, toDateKey(r.date), r.open, r.high, r.low, r.close, r.volume, r.turnover ?? ''].join(','));
  return lines.join('\n') + '\n';
}
