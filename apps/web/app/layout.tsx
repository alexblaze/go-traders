import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'NEPSE Signal Research', template: '%s · NEPSE Signal Research' },
  description: 'Technical analysis, strategy signals, backtesting and paper trading for the Nepal Stock Exchange. Research only — not financial advice.',
};

export const viewport: Viewport = { themeColor: '#0b1220', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
