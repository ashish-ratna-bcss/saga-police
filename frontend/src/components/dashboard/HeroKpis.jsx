import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  AlertTriangle,
  MessageSquareWarning,
  CalendarDays,
  FileText,
  EyeOff,
  Radio,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const KPI_DEFS = [
  {
    key: 'accounts_monitoring',
    label: 'Monitoring',
    icon: Radio,
    href: '/social-profiles',
    accent: 'text-emerald-600',
  },
  {
    key: 'high_risk_open',
    label: 'High-risk',
    icon: AlertTriangle,
    href: '/alerts?store=catalog',
    accent: 'text-red-600',
  },
  {
    key: 'unread_alerts',
    label: 'Unread',
    icon: EyeOff,
    href: '/alerts?store=catalog',
    accent: 'text-amber-600',
  },
  {
    key: 'open_grievances',
    label: 'Grievances',
    icon: MessageSquareWarning,
    href: '/grievances',
    accent: 'text-orange-600',
  },
  {
    key: 'events_started',
    label: 'Events',
    icon: CalendarDays,
    href: '/events',
    accent: 'text-sky-600',
  },
  {
    key: 'posts_in_range',
    label: 'Posts',
    icon: FileText,
    href: '/social-profiles',
    accent: 'text-slate-700',
  },
  {
    key: 'accounts_total',
    label: 'Accounts',
    icon: Users,
    href: '/social-profiles',
    accent: 'text-slate-600',
  },
];

/** Full-width metrics strip — 7 equal cells, no side gaps. */
const HeroKpis = ({ kpis = {}, className }) => (
  <div
    className={cn(
      'grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 border-b border-border bg-card',
      'divide-x divide-y xl:divide-y-0 divide-border',
      className
    )}
  >
    {KPI_DEFS.map(({ key, label, icon: Icon, href, accent }) => (
      <Link
        key={key}
        to={href}
        className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors min-w-0"
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', accent)} />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">
            {label}
          </p>
          <p className="text-lg font-bold tabular-nums leading-none">
            {Number(kpis[key] || 0).toLocaleString('en-IN')}
          </p>
        </div>
      </Link>
    ))}
  </div>
);

export default HeroKpis;
