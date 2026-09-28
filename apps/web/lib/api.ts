import { useAuth, type SessionUser } from '@/stores/auth';

/** All requests go to same-origin /api/v1 (proxied to the Fastify API by Next rewrites). */
export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public details?: unknown) {
    super(message);
  }
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown> & { total?: number; page?: number; pageSize?: number; totalPages?: number };
}

let refreshing: Promise<boolean> | null = null;

/** Exchange the httpOnly refresh cookie for a new access token (deduplicated). */
export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) {
          useAuth.getState().clear();
          return false;
        }
        const body = (await res.json()) as ApiEnvelope<{ accessToken: string; user: SessionUser }>;
        useAuth.getState().setSession(body.data.accessToken, body.data.user);
        return true;
      } catch {
        useAuth.getState().clear();
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const qs = q.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const token = useAuth.getState().accessToken;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    credentials: 'include',
    signal: opts.signal,
    headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Typed request with automatic single retry after a silent token refresh on 401. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  let res = await doFetch(path, opts);
  if (res.status === 401 && useAuth.getState().accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await doFetch(path, opts);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Request failed (${res.status})`, body?.requestId, body?.error?.details);
  }
  return body as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }).then((r) => r.data),
  getWithMeta: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) => request<T>(path, { method: 'POST', body: body ?? {}, query }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }).then((r) => r.data),
};

/** Download an export (CSV/JSON/PDF) with the current credentials. */
export async function download(path: string, query: Record<string, string>, body?: unknown): Promise<void> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(buildUrl(path, query), {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, 'EXPORT_FAILED', 'Export failed');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `export.${query.format ?? 'csv'}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
