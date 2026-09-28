'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />;
const tooltipStyle = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }, labelStyle: { color: 'hsl(var(--muted-foreground))' } };

export function LineSeriesChart({ data, x, y, height = 240, color = 'hsl(var(--primary))', name, area = false }: { data: object[]; x: string; y: string; height?: number; color?: string; name?: string; area?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {area ? (
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          {grid}
          <XAxis dataKey={x} {...axis} minTickGap={40} tickFormatter={(v: string) => String(v).slice(0, 10)} />
          <YAxis {...axis} width={60} domain={['auto', 'auto']} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey={y} name={name ?? y} stroke={color} fill={color} fillOpacity={0.15} dot={false} isAnimationActive={false} />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          {grid}
          <XAxis dataKey={x} {...axis} minTickGap={40} tickFormatter={(v: string) => String(v).slice(0, 10)} />
          <YAxis {...axis} width={60} domain={['auto', 'auto']} />
          <Tooltip {...tooltipStyle} />
          <Line type="monotone" dataKey={y} name={name ?? y} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

/** Drawdown shown as negative area below zero. */
export function DrawdownChart({ data, height = 180 }: { data: { date: string; drawdownPct: number }[]; height?: number }) {
  const d = data.map((p) => ({ date: p.date, drawdown: -p.drawdownPct }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={d} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={40} />
        <YAxis {...axis} width={50} unit="%" />
        <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toFixed(2)}%`} />
        <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="hsl(var(--bear))" fill="hsl(var(--bear))" fillOpacity={0.25} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Signed bars (green positive / red negative). Labels carry the sign so colour is not the only cue. */
export function SignedBarChart({ data, x, y, height = 240, unit = '', layout = 'horizontal' }: { data: Record<string, unknown>[]; x: string; y: string; height?: number; unit?: string; layout?: 'horizontal' | 'vertical' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ left: layout === 'vertical' ? 80 : 0, right: 8, top: 8, bottom: 0 }}>
        {grid}
        {layout === 'vertical' ? (
          <>
            <XAxis type="number" {...axis} unit={unit} />
            <YAxis type="category" dataKey={x} {...axis} width={140} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} minTickGap={10} />
            <YAxis {...axis} width={50} unit={unit} />
          </>
        )}
        <Tooltip {...tooltipStyle} />
        <ReferenceLine {...(layout === 'vertical' ? { x: 0 } : { y: 0 })} stroke="hsl(var(--muted-foreground))" />
        <Bar dataKey={y} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={Number(d[y]) >= 0 ? 'hsl(var(--bull))' : 'hsl(var(--bear))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AdvanceDeclineChart({ data, height = 200 }: { data: { date: string; advancers: number | null; decliners: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} minTickGap={40} />
        <YAxis {...axis} width={30} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="advancers" name="Advancers" stackId="a" fill="hsl(var(--bull))" isAnimationActive={false} />
        <Bar dataKey="decliners" name="Decliners" stackId="a" fill="hsl(var(--bear))" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
