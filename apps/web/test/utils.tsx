import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Suspense } from 'react';
import { vi } from 'vitest';
import { useAuth } from '@/stores/auth';

export type Routes = Record<string, unknown | ((url: URL, init?: RequestInit) => unknown)>;

/** Mock fetch: match by pathname (prefix `METHOD ` optional); responses wrapped in the API envelope. */
export function mockApi(routes: Routes) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => k === `${method} ${url.pathname}`) ?? Object.keys(routes).find((k) => k === url.pathname);
    if (!key) return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `unmocked ${method} ${url.pathname}` } }), { status: 404 });
    const r = routes[key];
    const data = typeof r === 'function' ? (r as (u: URL, i?: RequestInit) => unknown)(url, init) : r;
    return new Response(JSON.stringify({ success: true, data, meta: { total: Array.isArray(data) ? data.length : 0, unread: 0 } }), { status: 200 });
  }));
  return calls;
}

export function loginAs(role: 'USER' | 'ADMIN' = 'USER') {
  useAuth.setState({ accessToken: 'token', user: { id: 'u1', email: 'a@b.c', name: null, role }, initialized: true });
}

export function renderPage(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Suspense fallback={<div>loading</div>}>{ui}</Suspense></QueryClientProvider>);
}

/** A promise React's `use()` treats as already fulfilled (status/value fields), avoiding a suspended render in tests. */
export function resolvedParams<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}
