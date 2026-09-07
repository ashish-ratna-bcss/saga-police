import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  MessageSquare,
  CalendarDays,
  Contact2,
  Wrench,
  BarChart3,
  Bot,
  Users,
  ShieldCheck,
  Settings,
  Activity,
  HelpCircle,
  Circle,
  Globe,
} from 'lucide-react';
import { AlertService } from '@/features/alerts/api/alertService';
import { cn } from '@/lib/utils';

/** Resolve Lucide icon name from API (`item.icon`) */
const ICONS = {
  LayoutDashboard,
  AlertTriangle,
  MessageSquare,
  CalendarDays,
  Contact2,
  Wrench,
  BarChart3,
  Bot,
  Users,
  ShieldCheck,
  Settings,
  Activity,
  HelpCircle,
  Globe,
};

const formatBadgeCount = (n) => {
  if (!n || n < 1) return null;
  if (n > 99) return '99+';
  return String(n);
};

const Sidebar = ({ open, items }) => {
  const location = useLocation();
  const nav = Array.isArray(items) ? items : [];
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await AlertService.getUnread();
      const count = Number(res.data?.count ?? 0);
      setUnreadAlerts(Number.isFinite(count) ? count : 0);
    } catch {
      /* ignore — badge is best-effort */
    }
  }, []);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(() => {
      // WI-02: skip background polls while the tab is hidden.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      refreshUnread();
    }, 30_000);
    const onFocus = () => refreshUnread();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshUnread, location.pathname]);

  return (
    <aside
      className={cn(
        'fixed bottom-0 left-0 top-16 z-40 flex w-[72px] flex-col bg-primary transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
      aria-label="Main navigation"
    >
      <nav className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:none]">
        {nav.map((item) => {
          const href = item.path || item.href;
          if (!href) return null;
          const Icon = ICONS[item.icon] || Circle;
          const label = item.label || item.name;
          const active =
            location.pathname === href || location.pathname.startsWith(`${href}/`);
          const isAlerts = href === '/alerts' || href.startsWith('/alerts/');
          const badge = isAlerts ? formatBadgeCount(unreadAlerts) : null;

          return (
            <Link
              key={href}
              to={href}
              title={badge ? `${label} (${unreadAlerts} new)` : label}
              aria-label={badge ? `${label}, ${unreadAlerts} new` : label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-[hsl(43,96%,58%)]"
                  aria-hidden
                />
              )}
              <span className="relative flex h-5 w-5 items-center justify-center">
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.7} />
                {badge ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[hsl(43,96%,58%)] px-0.5 text-[9px] font-bold leading-none text-primary shadow-sm">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'w-full truncate text-center text-[9px] leading-tight tracking-wide',
                  active ? 'font-semibold text-white' : 'font-medium'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
