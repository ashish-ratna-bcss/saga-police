import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle, MessageSquare, CalendarDays, Contact2,
  Wrench, BarChart3, Bot, Users, ShieldCheck, Settings, Activity, HelpCircle, Circle,
} from 'lucide-react';
import { AlertService } from '@/features/alerts/api/alertService';

/** Resolve Lucide icon name from API (`item.icon`) */
const ICONS = {
  LayoutDashboard, AlertTriangle, MessageSquare, CalendarDays, Contact2,
  Wrench, BarChart3, Bot, Users, ShieldCheck, Settings, Activity, HelpCircle,
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
    const timer = setInterval(refreshUnread, 30_000);
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshUnread, location.pathname]);

  return (
    <aside
      className={`fixed bottom-0 left-0 top-16 z-40 flex w-16 flex-col items-center bg-primary transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Main navigation"
    >
      <nav className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
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
              className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/45 hover:bg-white/10 hover:text-white/85'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-[hsl(43,96%,58%)]" />
              )}
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.7} />
              {badge ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(43,96%,58%)] px-1 text-[10px] font-bold leading-none text-primary shadow-sm">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
