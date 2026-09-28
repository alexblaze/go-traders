'use client';
import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, type IChartApi, type LineData, type SeriesMarker, type Time,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { Candle, SignalType } from '@/lib/types';
import type { ChartIndicator } from '@/stores/ui';

export interface IndicatorData {
  dates: string[];
  series: Record<string, Record<string, (number | null)[]>>;
}

interface Props {
  candles: Candle[];
  indicators?: IndicatorData;
  enabled: ChartIndicator[];
  markers?: { date: string; signal: SignalType }[];
  height?: number;
}

const css = (v: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(v).trim()})`;

function line(dates: string[], values: (number | null)[] | undefined): LineData<Time>[] {
  if (!values) return [];
  const out: LineData<Time>[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ time: dates[i] as Time, value: v });
  });
  return out;
}

/** Interactive candlestick chart (TradingView lightweight-charts) with overlay and pane indicators. */
export function CandleChart({ candles, indicators, enabled, markers = [], height = 440 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || candles.length === 0) return;
    const bull = css('--bull');
    const bear = css('--bear');
    const chart = createChart(ref.current, {
      autoSize: true,
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--muted-foreground'), panes: { separatorColor: css('--border') } },
      grid: { vertLines: { color: css('--border') }, horzLines: { color: css('--border') } },
      rightPriceScale: { borderColor: css('--border') },
      timeScale: { borderColor: css('--border') },
      crosshair: { mode: 0 },
      // Explicit locale: navigator.language can be an invalid BCP-47 tag (e.g. 'en-US@posix') and crash Intl.
      localization: { locale: 'en-US' },
    });
    chartRef.current = chart;
    const price = chart.addSeries(CandlestickSeries, { upColor: bull, downColor: bear, wickUpColor: bull, wickDownColor: bear, borderVisible: false });
    price.setData(candles.map((c) => ({ time: c.date.slice(0, 10) as Time, open: c.open, high: c.high, low: c.low, close: c.close })));

    const d = indicators?.dates ?? [];
    const s = indicators?.series ?? {};
    if (enabled.includes('ema')) chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'EMA20', priceLineVisible: false }).setData(line(d, s.ema?.ema));
    if (enabled.includes('sma')) chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1, title: 'SMA50', priceLineVisible: false }).setData(line(d, s.sma?.sma));
    if (enabled.includes('vwap')) chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 1, lineStyle: 2, title: 'VWAP', priceLineVisible: false }).setData(line(d, s.vwap?.vwap));
    if (enabled.includes('bb')) {
      for (const [k, c] of [['upper', '#64748b'], ['middle', '#475569'], ['lower', '#64748b']] as const)
        chart.addSeries(LineSeries, { color: c, lineWidth: 1, lineStyle: k === 'middle' ? 2 : 0, priceLineVisible: false, lastValueVisible: false }).setData(line(d, s.bb?.[k]));
    }
    if (enabled.includes('volume')) {
      const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(candles.map((c, i) => ({ time: c.date.slice(0, 10) as Time, value: c.volume, color: i > 0 && c.close < candles[i - 1].close ? `${bear.replace('hsl', 'hsla').replace(')', ', 0.45)')}` : `${bull.replace('hsl', 'hsla').replace(')', ', 0.45)')}` })));
    }
    let pane = 1;
    if (enabled.includes('rsi') && s.rsi) {
      const r = chart.addSeries(LineSeries, { color: '#e879f9', lineWidth: 1, title: 'RSI14', priceLineVisible: false }, pane);
      r.setData(line(d, s.rsi.rsi));
      r.createPriceLine({ price: 70, color: bear, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '70' });
      r.createPriceLine({ price: 30, color: bull, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '30' });
      pane++;
    }
    if (enabled.includes('macd') && s.macd) {
      chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane).setData(
        line(d, s.macd.histogram).map((p) => ({ ...p, color: p.value >= 0 ? bull : bear })),
      );
      chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1, title: 'MACD', priceLineVisible: false }, pane).setData(line(d, s.macd.macd));
      chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, title: 'Signal', priceLineVisible: false }, pane).setData(line(d, s.macd.signal));
      pane++;
    }
    const panes = chart.panes();
    panes.forEach((p, i) => i > 0 && p.setHeight(110));

    const first = candles[0].date.slice(0, 10);
    const m: SeriesMarker<Time>[] = markers
      .filter((x) => x.signal !== 'HOLD' && x.date.slice(0, 10) >= first)
      .map((x) => ({ time: x.date.slice(0, 10) as Time, position: x.signal === 'BUY' ? 'belowBar' : 'aboveBar', color: x.signal === 'BUY' ? bull : bear, shape: x.signal === 'BUY' ? 'arrowUp' : 'arrowDown', text: x.signal }));
    if (m.length) createSeriesMarkers(price, m);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, indicators, enabled, markers, height]);

  return <div ref={ref} className="w-full" style={{ height: height + (enabled.includes('rsi') ? 110 : 0) + (enabled.includes('macd') ? 110 : 0) }} data-testid="candle-chart" />;
}
