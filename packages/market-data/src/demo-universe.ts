import type { Stock } from '@nepse/shared';

/**
 * DEMO universe. Symbols and names are deliberately fictional ("DEMO …") so synthetic
 * prices can never be mistaken for authentic NEPSE history. Sector names mirror NEPSE's
 * published sector classification.
 */
export interface DemoStockSpec {
  symbol: string;
  companyName: string;
  sector: string;
  basePrice: number;
  drift: number;
  volatility: number;
  avgVolume: number;
}

export const DEMO_UNIVERSE: DemoStockSpec[] = [
  { symbol: 'DMCB1', companyName: 'Demo Commercial Bank One Ltd (DEMO DATA)', sector: 'Commercial Banks', basePrice: 520, drift: 0.0003, volatility: 0.014, avgVolume: 120000 },
  { symbol: 'DMCB2', companyName: 'Demo Commercial Bank Two Ltd (DEMO DATA)', sector: 'Commercial Banks', basePrice: 310, drift: 0.0001, volatility: 0.013, avgVolume: 150000 },
  { symbol: 'DMCB3', companyName: 'Demo Commercial Bank Three Ltd (DEMO DATA)', sector: 'Commercial Banks', basePrice: 245, drift: -0.0001, volatility: 0.015, avgVolume: 90000 },
  { symbol: 'DMDB1', companyName: 'Demo Development Bank Ltd (DEMO DATA)', sector: 'Development Banks', basePrice: 380, drift: 0.0002, volatility: 0.018, avgVolume: 60000 },
  { symbol: 'DMDB2', companyName: 'Demo Regional Development Bank (DEMO DATA)', sector: 'Development Banks', basePrice: 290, drift: 0.0000, volatility: 0.02, avgVolume: 45000 },
  { symbol: 'DMHY1', companyName: 'Demo Himalayan Hydropower Ltd (DEMO DATA)', sector: 'Hydro Power', basePrice: 260, drift: 0.0005, volatility: 0.028, avgVolume: 200000 },
  { symbol: 'DMHY2', companyName: 'Demo River Hydro Ltd (DEMO DATA)', sector: 'Hydro Power', basePrice: 180, drift: 0.0002, volatility: 0.03, avgVolume: 250000 },
  { symbol: 'DMHY3', companyName: 'Demo Energy Hydro Ltd (DEMO DATA)', sector: 'Hydro Power', basePrice: 410, drift: -0.0003, volatility: 0.032, avgVolume: 110000 },
  { symbol: 'DMLI1', companyName: 'Demo Life Insurance Ltd (DEMO DATA)', sector: 'Life Insurance', basePrice: 690, drift: 0.0002, volatility: 0.019, avgVolume: 40000 },
  { symbol: 'DMLI2', companyName: 'Demo National Life Insurance (DEMO DATA)', sector: 'Life Insurance', basePrice: 540, drift: 0.0001, volatility: 0.02, avgVolume: 35000 },
  { symbol: 'DMNL1', companyName: 'Demo General Insurance Ltd (DEMO DATA)', sector: 'Non Life Insurance', basePrice: 720, drift: 0.0000, volatility: 0.021, avgVolume: 30000 },
  { symbol: 'DMMF1', companyName: 'Demo Microfinance Laghubitta (DEMO DATA)', sector: 'Microfinance', basePrice: 950, drift: 0.0003, volatility: 0.024, avgVolume: 25000 },
  { symbol: 'DMMF2', companyName: 'Demo Rural Laghubitta (DEMO DATA)', sector: 'Microfinance', basePrice: 1150, drift: -0.0002, volatility: 0.026, avgVolume: 18000 },
  { symbol: 'DMFI1', companyName: 'Demo Finance Ltd (DEMO DATA)', sector: 'Finance', basePrice: 360, drift: 0.0001, volatility: 0.022, avgVolume: 50000 },
  { symbol: 'DMHT1', companyName: 'Demo Hotels & Resorts Ltd (DEMO DATA)', sector: 'Hotels And Tourism', basePrice: 610, drift: 0.0004, volatility: 0.02, avgVolume: 35000 },
  { symbol: 'DMMP1', companyName: 'Demo Manufacturing & Processing Ltd (DEMO DATA)', sector: 'Manufacturing And Processing', basePrice: 880, drift: 0.0003, volatility: 0.018, avgVolume: 20000 },
  { symbol: 'DMIN1', companyName: 'Demo Investment Co Ltd (DEMO DATA)', sector: 'Investment', basePrice: 470, drift: 0.0002, volatility: 0.019, avgVolume: 70000 },
  { symbol: 'DMTR1', companyName: 'Demo Trading Ltd (DEMO DATA)', sector: 'Tradings', basePrice: 1400, drift: 0.0001, volatility: 0.02, avgVolume: 8000 },
];

export function demoStocks(): Stock[] {
  return DEMO_UNIVERSE.map((s) => ({
    symbol: s.symbol,
    companyName: s.companyName,
    sector: s.sector,
    subSector: null,
    listedDate: null,
    sharesOutstanding: null,
    paidUpCapital: null,
    status: 'ACTIVE',
    isDemo: true,
  }));
}
