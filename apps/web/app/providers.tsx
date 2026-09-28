'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, refreshSession } from '@/lib/api';
import { useAuth } from '@/stores/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  useEffect(() => {
    // Restore the session from the httpOnly refresh cookie on first load.
    if (!useAuth.getState().initialized) void refreshSession().finally(() => useAuth.getState().markInitialized());
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
