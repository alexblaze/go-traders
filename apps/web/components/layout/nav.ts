import { Activity, Bell, BarChart3, Bot, Briefcase, Eye, FlaskConical, Gauge, LayoutDashboard, LineChart, ListFilter, Settings, Shield, Sigma, Zap } from 'lucide-react';

export const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/market', label: 'Market', icon: Activity },
  { href: '/stocks', label: 'Stocks', icon: LineChart },
  { href: '/screener', label: 'Screener', icon: ListFilter },
  { href: '/strategies', label: 'Strategies', icon: Sigma },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/backtests', label: 'Backtests', icon: FlaskConical },
  { href: '/portfolio', label: 'Paper Trading', icon: Briefcase },
  { href: '/watchlists', label: 'Watchlists', icon: Eye },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/analytics/signals', label: 'Signal Analytics', icon: BarChart3 },
  { href: '/ai', label: 'AI Analyst', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export const ADMIN_NAV = { href: '/admin', label: 'Admin', icon: Shield };
export const BRAND_ICON = Gauge;
