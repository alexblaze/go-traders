'use client';
import { Bell, LogIn, LogOut, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { useNotifications } from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { ADMIN_NAV, BRAND_ICON as Brand, NAV } from './nav';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const user = useAuth((s) => s.user);
  const items = user?.role === 'ADMIN' ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5 p-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm', active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SymbolSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/stocks?search=${encodeURIComponent(q.trim())}`);
      }}
      className="relative w-full max-w-xs"
    >
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
      <Input aria-label="Search stocks" placeholder="Search symbol or company…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
    </form>
  );
}

function NotificationBell() {
  const user = useAuth((s) => s.user);
  const { data } = useNotifications(!!user);
  const unread = Number(data?.meta?.unread ?? 0);
  if (!user) return null;
  return (
    <Link href="/alerts#notifications" aria-label={`Notifications (${unread} unread)`} className="relative rounded-md p-2 hover:bg-accent">
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-bear px-1 text-[10px] font-bold text-white">{unread}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebar } = useUi();
  const { user, clear } = useAuth();
  const router = useRouter();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    clear();
    router.push('/login');
  };
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border md:block">
        <Link href="/" className="flex h-14 items-center gap-2 border-b border-border px-4 font-semibold">
          <Brand className="h-5 w-5 text-primary" /> NEPSE Signals
        </Link>
        <Sidebar />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebar(false)}>
          <aside className="h-full w-64 border-r border-border bg-background" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-border px-4 font-semibold">
              NEPSE Signals
              <button aria-label="Close menu" onClick={() => setSidebar(false)}><X className="h-5 w-5" /></button>
            </div>
            <Sidebar onNavigate={() => setSidebar(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu className="h-5 w-5" /></button>
          <SymbolSearch />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            {user ? (
              <>
                <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
                <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Logout</Button>
              </>
            ) : (
              <Link href="/login"><Button size="sm"><LogIn className="h-4 w-4" /> Login</Button></Link>
            )}
          </div>
        </header>
        <main className="flex-1 p-3 md:p-6">{children}</main>
        <footer className="border-t border-border px-6 py-3 text-[11px] text-muted-foreground">
          Research & decision-support platform. Not financial advice. Past performance and backtests do not guarantee future results. Times shown in Nepal Time (NPT).
        </footer>
      </div>
    </div>
  );
}
