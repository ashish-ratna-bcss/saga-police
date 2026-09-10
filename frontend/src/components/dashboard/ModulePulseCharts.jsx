import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { ArrowRight, AlertTriangle, MessageSquareWarning, Globe, CalendarDays } from 'lucide-react';
import { PlatformBrandIcon } from '../PlatformBrandIcon';
import { cn } from '../../lib/utils';

const RISK_COLORS = {
  critical: '#7f1d1d',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  unknown: '#94a3b8',
};

const PLATFORM_COLORS = {
  x: '#111827',
  twitter: '#111827',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E4405F',
  telegram: '#229ED9',
  whatsapp: '#25D366',
};

const mapToSlices = (obj = {}, colorMap = {}) =>
  Object.entries(obj)
    .filter(([, v]) => Number(v) > 0)
    .map(([name, value]) => ({
      name,
      value: Number(value),
      color: colorMap[name] || colorMap[String(name).toLowerCase()] || '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

const CompactPie = ({ data }) => {
  if (!data.length) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center text-[10px] text-muted-foreground">
        —
      </div>
    );
  }
  return (
    <div className="h-14 w-14 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={16} outerRadius={26} paddingAngle={1}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip formatter={(value, name) => [Number(value).toLocaleString('en-IN'), name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const ChipLegend = ({ data }) => (
  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
    {data.slice(0, 5).map((d) => (
      <span key={d.name} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
        <span className="capitalize">{d.name}</span>
        <span className="font-semibold tabular-nums text-foreground">{d.value}</span>
      </span>
    ))}
  </div>
);

const Panel = ({ className, children }) => (
  <section className={cn('flex flex-col rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden min-h-[220px]', className)}>{children}</section>
);

/** Bottom ops row: alerts | grievances | platforms | events — equal columns, full width. */
const ModulePulseCharts = ({
  alerts,
  grievances,
  platforms = [],
  events,
  className,
}) => {
  const riskSlices = useMemo(() => mapToSlices(alerts?.by_risk, RISK_COLORS), [alerts]);
  const alertPlatSlices = useMemo(
    () => mapToSlices(alerts?.by_platform, PLATFORM_COLORS),
    [alerts]
  );
  const grievSlices = useMemo(
    () =>
      mapToSlices(grievances?.by_workflow, {
        pending: '#f59e0b',
        in_progress: '#3b82f6',
        escalated: '#ef4444',
        resolved: '#10b981',
        closed: '#6366f1',
        received: '#64748b',
        new: '#94a3b8',
      }),
    [grievances]
  );
  const reports = grievances?.reports || {};
  const eventItems = events?.items || [];

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4',
        className
      )}
    >
      <Panel>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Alerts</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {Number(alerts?.total || 0).toLocaleString('en-IN')} in range
              </p>
            </div>
          </div>
          <Link
            to="/alerts?store=catalog"
            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        <div className="flex min-h-0 flex-1 items-center gap-3 overflow-auto px-3 py-2">
          <CompactPie data={riskSlices} />
          <div className="min-w-0 space-y-1.5">
            <ChipLegend data={riskSlices} />
            {alertPlatSlices.length > 0 ? <ChipLegend data={alertPlatSlices} /> : null}
          </div>
        </div>
      </Panel>

      <Panel>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <MessageSquareWarning className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Grievances</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {Number(grievances?.total || 0).toLocaleString('en-IN')} active
              </p>
            </div>
          </div>
          <Link
            to="/grievances"
            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        <div className="flex min-h-0 flex-1 items-center gap-3 overflow-auto px-3 py-2">
          <CompactPie data={grievSlices} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <ChipLegend data={grievSlices} />
            <div className="flex gap-3 text-[10px]">
              <span>
                Reports <b className="tabular-nums">{reports.total || 0}</b>
              </span>
              <span>
                Pending{' '}
                <b className="tabular-nums text-amber-600">{reports.sent_to_intermediary || 0}</b>
              </span>
              <span>
                Closed <b className="tabular-nums text-emerald-600">{reports.closed || 0}</b>
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Platforms</p>
              <p className="text-[10px] text-muted-foreground">Catalog accounts</p>
            </div>
          </div>
          <Link
            to="/social-profiles"
            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            Profiles <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        {platforms.length === 0 ? (
          <p className="flex flex-1 items-center px-3 text-[11px] text-muted-foreground">
            No platforms configured yet
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
            {platforms.map((p) => (
              <li key={p.slug} className="flex items-center gap-2 py-1 text-sm">
                <PlatformBrandIcon platform={p.slug} className="h-3.5 w-3.5" />
                <span className="flex-1 truncate text-xs font-medium">{p.name || p.slug}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {p.monitoring} live
                </span>
                <span className="w-6 text-right text-xs font-bold tabular-nums">{p.accounts}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Live events</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {events?.started || 0} started · {events?.total || 0} total
              </p>
            </div>
          </div>
          <Link
            to="/events"
            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        {eventItems.length === 0 ? (
          <p className="flex flex-1 items-center px-3 text-[11px] text-muted-foreground">
            No live events.{' '}
            <Link to="/events" className="ml-1 text-primary hover:underline">
              Start one
            </Link>
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {eventItems.slice(0, 6).map((ev) => (
              <li key={ev.id}>
                <Link
                  to={`/events?id=${ev.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{ev.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {(ev.platforms || []).join(', ') || '—'} · every{' '}
                      {ev.polling_interval_minutes || 60}m
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                    {ev.media_count || 0}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default ModulePulseCharts;
