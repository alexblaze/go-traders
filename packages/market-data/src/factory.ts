import type { MarketDataProvider } from './provider';
import { CsvProvider } from './providers/csv';
import { MockProvider } from './providers/mock';
import { NepseProvider } from './providers/nepse';

export interface ProviderConfig {
  MARKET_DATA_PROVIDER: 'csv' | 'mock' | 'nepse';
  MARKET_DATA_CSV_DIR: string;
  NEPSE_API_BASE_URL?: string;
  NEPSE_API_KEY?: string;
  NEPSE_RATE_LIMIT_PER_MINUTE: number;
}

export function createProvider(cfg: ProviderConfig): MarketDataProvider {
  switch (cfg.MARKET_DATA_PROVIDER) {
    case 'mock':
      return new MockProvider();
    case 'nepse':
      return new NepseProvider({ baseUrl: cfg.NEPSE_API_BASE_URL ?? '', apiKey: cfg.NEPSE_API_KEY, rateLimitPerMinute: cfg.NEPSE_RATE_LIMIT_PER_MINUTE });
    case 'csv':
    default:
      return new CsvProvider(cfg.MARKET_DATA_CSV_DIR);
  }
}
