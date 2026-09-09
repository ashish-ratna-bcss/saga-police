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
    label: 'Live Monitoring',
    icon: Radio,
    href: '/social-profiles',
    accent: 'text-emerald-500',
    bg: 'bg-emerald-500/10 ring-1 ring-emerald-500/20',
  },
  {
    key: 'high_risk_open',
    label: 'High-risk Threats',
    icon: AlertTriangle,
    href: '/alerts?store=catalog',
    accent: 'text-rose-500',
    bg: 'bg-rose-500/10 ring-1 ring-rose-500/20',
  },
  {
    key: 'unread_alerts',
    label: 'Unread Alerts',
    icon: EyeOff,
    href: '/alerts?store=catalog',
    accent: 'text-amber-500',
    bg: 'bg-amber-500/10 ring-1 ring-amber-500/20',
  },
  {
    key: 'open_grievances',
    label: 'Active Grievances',
    icon: MessageSquareWarning,
    href: '/grievances',
    accent: 'text-orange-500',
    bg: 'bg-orange-500/10 ring-1 ring-orange-500/20',
  },
  {
    key: 'events_started',
    label: 'Live Events',
    icon: CalendarDays,
    href: '/events',
    accent: 'text-sky-500',
    bg: 'bg-sky-500/10 ring-1 ring-sky-500/20',
  },
  {
    key: 'posts_in_range',
    label: 'Captured Posts',
    icon: FileText,
    href: '/social-profiles',
    accent: 'text-indigo-500',
    bg: 'bg-indigo-500/10 ring-1 ring-indigo-500/20',
  },
  {
    key: 'accounts_total',
    label: 'Total Accounts',
    icon: Users,
    href: '/social-profiles',
    accent: 'text-purple-500',
    bg: 'bg-purple-500/10 ring-1 ring-purple-500/20',
  },
];

/** Modern responsive KPI metrics cards */
const HeroKpis = ({ kpis = {}, className }) => (
  <div
    className={cn(
      'grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5 sm:gap-3',
      className
    )}
  >
    {KPI_DEFS.map(({ key, label, icon: Icon, href, accent, bg }) => (
      <Link
        key={key}
        to={href}
        className="group relative flex flex-col justify-between p-3.5 rounded-2xl border border-border/60 bg-card hover:border-primary/50 hover:bg-muted/30 hover:shadow-md transition-all duration-200 min-w-0 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </span>
          <div className={cn('h-7 w-7 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', bg)}>
            <Icon className={cn('h-3.5 w-3.5', accent)} />
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-black tabular-nums tracking-tight text-foreground">
          {Number(kpis[key] || 0).toLocaleString('en-IN')}
        </p>
      </Link>
    ))}
  </div>
);

export default HeroKpis;
