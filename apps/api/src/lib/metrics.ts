/** Minimal in-process metrics (API latency + counters) exposed in Prometheus text format. */
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

interface Hist {
  buckets: number[];
  sum: number;
  count: number;
}

const latency = new Map<string, Hist>();
const counters = new Map<string, number>();

export function observeLatency(route: string, method: string, status: number, ms: number) {
  const key = `method="${method}",route="${route}",status="${Math.floor(status / 100)}xx"`;
  let h = latency.get(key);
  if (!h) latency.set(key, (h = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }));
  BUCKETS.forEach((b, i) => {
    if (ms <= b) h!.buckets[i]++;
  });
  h.sum += ms;
  h.count++;
}

export function inc(name: string, labels = '') {
  const k = `${name}{${labels}}`;
  counters.set(k, (counters.get(k) ?? 0) + 1);
}

export function renderMetrics(extra: Record<string, number> = {}): string {
  const lines: string[] = ['# TYPE http_request_duration_ms histogram'];
  for (const [k, h] of latency) {
    BUCKETS.forEach((b, i) => lines.push(`http_request_duration_ms_bucket{${k},le="${b}"} ${h.buckets[i]}`));
    lines.push(`http_request_duration_ms_bucket{${k},le="+Inf"} ${h.count}`);
    lines.push(`http_request_duration_ms_sum{${k}} ${h.sum.toFixed(2)}`);
    lines.push(`http_request_duration_ms_count{${k}} ${h.count}`);
  }
  for (const [k, v] of counters) lines.push(`${k} ${v}`);
  for (const [k, v] of Object.entries(extra)) lines.push(`${k} ${v}`);
  return lines.join('\n') + '\n';
}
