import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChartIndicator = 'ema' | 'sma' | 'bb' | 'vwap' | 'rsi' | 'macd' | 'volume';
export type ChartRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX';

interface UiState {
  sidebarOpen: boolean;
  chartRange: ChartRange;
  chartIndicators: ChartIndicator[];
  setSidebar: (open: boolean) => void;
  setChartRange: (r: ChartRange) => void;
  toggleIndicator: (i: ChartIndicator) => void;
}

/** Per-browser UI preferences (non-sensitive). */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      chartRange: '1Y',
      chartIndicators: ['ema', 'volume'],
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setChartRange: (chartRange) => set({ chartRange }),
      toggleIndicator: (i) => set((s) => ({ chartIndicators: s.chartIndicators.includes(i) ? s.chartIndicators.filter((x) => x !== i) : [...s.chartIndicators, i] })),
    }),
    { name: 'nepse-ui', partialize: (s) => ({ chartRange: s.chartRange, chartIndicators: s.chartIndicators }) },
  ),
);
