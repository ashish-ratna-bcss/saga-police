import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Lock, Shield } from 'lucide-react';

const resolveTenantTitle = (user) => {
  const candidates = [
    user?.blurasagatitle,
    user?.theme_name,
    user?.organization_name,
    user?.organization,
    user?.tenant_name,
    user?.department,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (typeof document !== 'undefined' && document.title) {
    const head = document.title.split(/[—\-|]/)[0]?.trim();
    if (head && head.toLowerCase() !== 'blura saga') return head;
  }
  return 'Digital Intelligence Platform';
};

const FEED_KPI_STYLE = {
  all: {
    accent: 'from-indigo-500/25 to-indigo-500/0',
    borderColor: 'border-indigo-500/25',
    iconWrap: 'text-indigo-600 dark:text-indigo-400',
  },
  grievance: {
    accent: 'from-amber-500/25 to-amber-500/0',
    borderColor: 'border-amber-500/30',
    iconWrap: 'text-amber-600 dark:text-amber-400',
  },
  suggestion: {
    accent: 'from-violet-500/25 to-violet-500/0',
    borderColor: 'border-violet-500/30',
    iconWrap: 'text-violet-600 dark:text-violet-400',
  },
  criticism: {
    accent: 'from-rose-500/25 to-rose-500/0',
    borderColor: 'border-rose-500/30',
    iconWrap: 'text-rose-600 dark:text-rose-400',
  },
  watched: {
    accent: 'from-sky-500/25 to-sky-500/0',
    borderColor: 'border-sky-500/30',
    iconWrap: 'text-sky-600 dark:text-sky-400',
  },
};

export function GrievanceExecutiveHeader({
  user,
  variant = 'reports',
  scopeLine,
  kpis = [],
  embedded = false,
}) {
  const tenantTitle = useMemo(() => resolveTenantTitle(user), [user]);
  const isReports = variant === 'reports';

  const generatedLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  if (!isReports) {
    const shell = embedded
      ? 'bg-gradient-to-b from-muted/35 via-muted/15 to-transparent'
      : 'rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden';

    return (
      <div className={shell}>
        {scopeLine ? (
          <div className="px-4 py-2.5 border-b border-border/60 bg-card/80">
            <p className="text-xs font-medium text-muted-foreground">{scopeLine}</p>
          </div>
        ) : null}
        {kpis?.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 p-3 sm:p-3.5">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              const style = FEED_KPI_STYLE[kpi.key] || FEED_KPI_STYLE.all;
              return (
                <div
                  key={kpi.key}
                  className={cn(
                    'relative flex flex-col rounded-xl border bg-card px-3 py-3 shadow-xs overflow-hidden',
                    style.borderColor
                  )}
                >
                  <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', style.accent)} />
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-snug">
                      {kpi.label}
                    </span>
                    {Icon ? (
                      <div className={cn('rounded-md bg-muted/50 p-1 shrink-0', style.iconWrap)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                    ) : null}
                  </div>
                  <div className={cn('text-2xl font-black tabular-nums tracking-tight', kpi.valueClass || 'text-foreground')}>
                    {kpi.value}
                  </div>
                  {kpi.hint ? (
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{kpi.hint}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/20 overflow-hidden shadow-lg bg-card">
      <div className="relative bg-slate-900 text-white px-5 sm:px-6 pt-4 pb-3.5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-indigo-300 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200/90">
                Law Enforcement Case Registry
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">{tenantTitle.toUpperCase()}</h2>
            <p className="text-[11px] sm:text-xs text-indigo-100/80 mt-1 font-medium">
              GRIEVANCE MODULE — FORMAL REPORTS &amp; SOCIAL COMPLAINT AUDIT REGISTRY
            </p>
          </div>
          <div className="text-left lg:text-right shrink-0 space-y-0.5">
            <p className="text-[10px] text-slate-400">Generated: {generatedLabel}</p>
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200/90">
              <Lock className="h-3 w-3" />
              RESTRICTED / LAW ENFORCEMENT ONLY
            </p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600" />
      </div>

      {scopeLine ? (
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-border/70">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{scopeLine}</p>
        </div>
      ) : null}

      {kpis?.length > 0 ? (
        <div className="p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 bg-gradient-to-b from-muted/30 to-transparent">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.key}
                className="relative overflow-hidden rounded-xl border border-border/80 bg-card/90 backdrop-blur-sm px-3.5 py-3 shadow-xs"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500/80 to-sky-400/80" />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-snug">
                    {kpi.label}
                  </span>
                  {Icon ? (
                    <div className="rounded-md bg-muted/60 p-1">
                      <Icon className={cn('h-3.5 w-3.5', kpi.iconClass)} />
                    </div>
                  ) : null}
                </div>
                <div className={cn('text-2xl font-black tabular-nums tracking-tight', kpi.valueClass || 'text-foreground')}>
                  {kpi.value}
                </div>
                {kpi.hint ? (
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{kpi.hint}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default GrievanceExecutiveHeader;
