import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// Canvas/SVG chart libraries are not meaningful in jsdom — replace with light stubs.
vi.mock('@/components/charts/candle-chart', () => ({ CandleChart: () => <div data-testid="candle-chart" /> }));
vi.mock('@/components/charts/simple-charts', () => ({
  LineSeriesChart: () => <div data-testid="line-chart" />,
  DrawdownChart: () => <div data-testid="drawdown-chart" />,
  SignedBarChart: () => <div data-testid="bar-chart" />,
  AdvanceDeclineChart: () => <div data-testid="ad-chart" />,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
