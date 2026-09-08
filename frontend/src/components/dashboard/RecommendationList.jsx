import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileWarning,
  PauseCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const TYPE_META = {
  alert_high_risk: {
    icon: AlertTriangle,
    tone: 'text-red-600 bg-red-500/10',
    label: 'Alert',
  },
  grievance_escalated: {
    icon: FileWarning,
    tone: 'text-orange-600 bg-orange-500/10',
    label: 'Report',
  },
  event_stale: {
    icon: CalendarClock,
    tone: 'text-amber-600 bg-amber-500/10',
    label: 'Event',
  },
  account_stopped: {
    icon: PauseCircle,
    tone: 'text-slate-600 bg-slate-500/10',
    label: 'Profile',
  },
};

const RecommendationList = ({ items = [], className }) => (
  <section
    className={cn('flex h-full min-h-0 flex-col bg-card border-border', className)}
  >
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Highly recommended</h2>
          <p className="text-[10px] text-muted-foreground">Priority actions</p>
        </div>
      </div>
      <Link
        to="/intelligence-dashboard"
        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
      >
        Reports <ArrowRight className="h-3 w-3" />
      </Link>
    </header>

    {items.length === 0 ? (
      <div className="flex flex-1 items-center justify-center px-3 text-sm text-muted-foreground">
        Nothing urgent for this filter.
      </div>
    ) : (
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {items.map((item) => {
          const meta = TYPE_META[item.type] || TYPE_META.account_stopped;
          const Icon = meta.icon;
          return (
            <li key={item.id}>
              <Link
                to={item.href || '/dashboard'}
                className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    meta.tone
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                  {item.subtitle ? (
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

export default RecommendationList;
