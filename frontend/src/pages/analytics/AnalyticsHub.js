import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, AlertTriangle, MessageSquare, CalendarDays, Contact2, Loader2, RefreshCw,
  ArrowUpDown, Search, ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { analyticsHubApi } from '../../api';
import { Card, CardContent } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';

/* Same platform colors as UnifiedReportsAnalyticsPanel.jsx, for visual consistency. */
const PLATFORM_COLORS = {
  x: '#000000', twitter: '#000000', youtube: '#FF0000', facebook: '#1877F2',
  instagram: '#E4405F', telegram: '#229ED9', unknown: '#94a3b8',
};
const RISK_COLORS = { critical: '#ef4444', high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const SENTIMENT_COLORS = { positive: '#22c55e', neutral: '#94a3b8', negative: '#ef4444' };
// Stance is a separate judgment from sentiment (author's position toward the
// tenant, not the post's overall tone) — kept as its own color map so the two
// charts are never visually implied to be the same metric. Keys match the
// Sentiment API's STANCE_LABELS (Support|Oppose|Neutral|Unclear), lowercased.
const STANCE_COLORS = { support: '#22c55e', oppose: '#ef4444', neutral: '#94a3b8', unclear: '#f59e0b' };
const STATUS_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'];

const colorFor = (key, map, fallback, idx = 0) =>
  map[String(key || '').toLowerCase()] || fallback[idx % fallback.length] || '#94a3b8';

const RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const TABS = [
  { value: 'all', label: 'All', icon: BarChart3 },
  { value: 'events', label: 'Events', icon: CalendarDays },
  { value: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { value: 'grievances', label: 'Grievances', icon: MessageSquare },
  { value: 'profiles', label: 'Profiles', icon: Contact2 },
];

const StatTile = ({ label, value, accent = 'text-foreground', onClick, hint }) => {
  const inner = (
    <CardContent className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value ?? '—'}
      </p>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </CardContent>
  );
  if (!onClick) return <Card>{inner}</Card>;
  return (
    <button type="button" onClick={onClick} className="text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full cursor-pointer hover:border-primary/40">{inner}</Card>
    </button>
  );
};

const formatWhen = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

const EmptyModuleCta = ({ title, body, to, cta }) => (
  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    {to ? (
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to={to}>{cta}</Link>
      </Button>
    ) : null}
  </div>
);

const EmptyChartNote = () => (
  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
    No data in this range
  </div>
);

const TrendChart = ({ data, dataKeys, colorMap, height = 220 }) => {
  const hasData = Array.isArray(data) && data.some((d) => d.total > 0);
  return (
    <div style={{ height }}>
      {!hasData ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelFormatter={(v) => v}
            />
            {(dataKeys || ['total']).map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId={dataKeys?.length > 1 ? '1' : undefined}
                stroke={colorMap ? colorFor(key, colorMap, STATUS_COLORS, i) : STATUS_COLORS[i % STATUS_COLORS.length]}
                fill={colorMap ? colorFor(key, colorMap, STATUS_COLORS, i) : STATUS_COLORS[i % STATUS_COLORS.length]}
                fillOpacity={0.18}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const BreakdownPie = ({ breakdown, colorMap, fallbackColors = STATUS_COLORS, height = 200 }) => {
  const data = Object.entries(breakdown || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
  return (
    <div style={{ height }}>
      {!data.length ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={colorFor(entry.name, colorMap || {}, fallbackColors, i)} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const BreakdownBar = ({ breakdown, colorMap, fallbackColors = STATUS_COLORS, height = 200 }) => {
  const data = Object.entries(breakdown || {}).map(([name, value]) => ({ name, value }));
  return (
    <div style={{ height }}>
      {!data.some((d) => d.value > 0) ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={colorFor(entry.name, colorMap || {}, fallbackColors, i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const SectionCard = ({ title, children }) => (
  <Card>
    <CardContent className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </CardContent>
  </Card>
);

/* ── All tab ── */
const AllTab = ({ data, onGoTab }) => {
  if (!data) return null;
  const { kpis = {}, alerts = {}, grievances = {}, events = {}, platforms = [], top_profiles = [] } = data;
  const noActivity =
    !(kpis.posts_in_range > 0) &&
    !(kpis.unread_alerts > 0) &&
    !(kpis.accounts_total > 0);

  return (
    <div className="space-y-4">
      {noActivity ? (
        <EmptyModuleCta
          title="Nothing to show yet"
          body="Add monitored profiles and start fetching posts to populate analytics."
          to="/social-profiles"
          cta="Go to Profiles"
        />
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Accounts" value={kpis.accounts_total} onClick={() => onGoTab?.('profiles')} hint="Open Profiles" />
        <StatTile label="High risk open" value={kpis.high_risk_open} accent="text-red-600" onClick={() => onGoTab?.('alerts')} hint="Open Alerts" />
        <StatTile label="Open grievances" value={kpis.open_grievances} accent="text-amber-600" onClick={() => onGoTab?.('grievances')} hint="Open Grievances" />
        <StatTile label="Events started" value={kpis.events_started} onClick={() => onGoTab?.('events')} hint="Open Events" />
        <StatTile label="Unread alerts" value={kpis.unread_alerts} onClick={() => onGoTab?.('alerts')} />
        <StatTile label="Posts in range" value={kpis.posts_in_range} onClick={() => onGoTab?.('profiles')} />
        <StatTile label="Accounts monitoring" value={kpis.accounts_monitoring} onClick={() => onGoTab?.('profiles')} />
        <StatTile label="Accounts active" value={kpis.accounts_active} onClick={() => onGoTab?.('profiles')} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard title="Alerts by risk">
          <BreakdownPie breakdown={alerts.by_risk} colorMap={RISK_COLORS} />
        </SectionCard>
        <SectionCard title="Grievances by workflow status">
          <BreakdownPie breakdown={grievances.by_workflow} />
        </SectionCard>
        <SectionCard title="Accounts by platform">
          <BreakdownBar
            breakdown={platforms.reduce((acc, p) => ({ ...acc, [p.slug]: p.accounts }), {})}
            colorMap={PLATFORM_COLORS}
          />
        </SectionCard>
      </div>
      <SectionCard title="Top profiles in range">
        {!top_profiles?.length ? (
          <p className="text-xs text-muted-foreground">No profile activity in this range.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {top_profiles.map((p) => (
              <li key={`${p.account_id}-${p.platform}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  {p.account_id ? (
                    <Link
                      to={`/social-profiles/${p.account_id}`}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {p.display_name || p.handle}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">{p.display_name || p.handle}</span>
                  )}
                  <p className="truncate text-[11px] text-muted-foreground">
                    @{p.handle} · {p.platform} · {p.monitoring_status || '—'}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {p.posts?.toLocaleString?.('en-IN') ?? p.posts} posts
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title={`Events currently monitoring (${events.started ?? 0} of ${events.total ?? 0})`}>
        {!events.items?.length ? (
          <EmptyModuleCta
            title="No events currently started"
            body="Start an event to discover content across platforms."
            to="/events"
            cta="Open Events"
          />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {events.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <Link to="/events" className="truncate font-medium hover:underline">{e.name}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">{e.media_count} items</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

/* ── Events tab ── */
const EventsTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total events" value={data.total} />
        <StatTile
          label="Started"
          value={data.by_status?.started || 0}
          accent="text-emerald-600"
        />
        <StatTile
          label="Stopped"
          value={data.by_status?.stopped || 0}
          accent="text-muted-foreground"
        />
        <StatTile
          label="Content discovered (range)"
          value={data.trend?.reduce((s, d) => s + d.total, 0) || 0}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard title="By status">
          <BreakdownPie breakdown={data.by_status} />
        </SectionCard>
        <SectionCard title="By origin">
          <BreakdownPie breakdown={data.by_origin} />
        </SectionCard>
      </div>
      <SectionCard title="Content discovered by platform (all-time)">
        <BreakdownBar breakdown={data.content_by_platform} colorMap={PLATFORM_COLORS} />
      </SectionCard>
      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard title="Raw sentiment (analyzed content, all-time)">
          <BreakdownPie breakdown={data.by_sentiment} colorMap={SENTIMENT_COLORS} />
        </SectionCard>
        <SectionCard title="Stance toward tenant (analyzed content, all-time)">
          <BreakdownPie breakdown={data.by_stance} colorMap={STANCE_COLORS} />
        </SectionCard>
      </div>
      <SectionCard title="Content discovered per day">
        <TrendChart data={data.trend} />
      </SectionCard>
    </div>
  );
};

/* ── Alerts tab ── */
const AlertsTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total alerts" value={data.total} />
        <StatTile label="High / critical" value={(data.by_risk?.high || 0) + (data.by_risk?.critical || 0)} accent="text-red-600" />
        <StatTile label="Medium risk" value={data.by_risk?.medium || 0} accent="text-amber-600" />
        <StatTile label="Active" value={data.by_status?.active || 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard title="By risk level">
          <BreakdownPie breakdown={data.by_risk} colorMap={RISK_COLORS} />
        </SectionCard>
        <SectionCard title="By platform">
          <BreakdownPie breakdown={data.by_platform} colorMap={PLATFORM_COLORS} />
        </SectionCard>
        <SectionCard title="By status">
          <BreakdownBar breakdown={data.by_status} />
        </SectionCard>
      </div>
      <SectionCard title="Workflow activity per day (acknowledged / escalated / resolved / false positive)">
        <TrendChart
          data={data.trend}
          dataKeys={['acknowledged', 'escalated', 'resolved', 'false_positive']}
        />
      </SectionCard>
    </div>
  );
};

/* ── Grievances tab ── */
const GrievancesTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total grievances" value={data.total} />
        <StatTile label="Received" value={data.by_workflow?.received || 0} />
        <StatTile label="Escalated" value={data.by_workflow?.escalated || 0} accent="text-amber-600" />
        <StatTile label="Reports sent" value={data.reports?.total || 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard title="By workflow status">
          <BreakdownPie breakdown={data.by_workflow} />
        </SectionCard>
        <SectionCard title="By platform">
          <BreakdownPie breakdown={data.by_platform} colorMap={PLATFORM_COLORS} />
        </SectionCard>
        <SectionCard title="By classification">
          <BreakdownBar breakdown={data.by_classification} />
        </SectionCard>
      </div>
      <SectionCard title="Grievances detected per day">
        <TrendChart data={data.trend} />
      </SectionCard>
    </div>
  );
};

/* ── Profiles tab ── */
const PROFILE_SORT_KEYS = {
  name: (a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')),
  posts_fetched: (a, b) => (a.posts_fetched || 0) - (b.posts_fetched || 0),
  alerts_count: (a, b) => (a.alerts_count || 0) - (b.alerts_count || 0),
  alerts_open: (a, b) => (a.alerts_open || 0) - (b.alerts_open || 0),
  last_fetched_at: (a, b) =>
    new Date(a.last_fetched_at || 0).getTime() - new Date(b.last_fetched_at || 0).getTime(),
  monitoring: (a, b) => String(a.monitoring || '').localeCompare(String(b.monitoring || '')),
};

const ProfilesTab = ({ data }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('posts_fetched');
  const [sortDir, setSortDir] = useState('desc');

  const rows = useMemo(() => {
    const list = Array.isArray(data?.profiles) ? data.profiles : [];
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((p) => {
          const hay = [
            p.display_name,
            ...(p.handles || []),
            ...(p.platforms || []),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        });
    const cmp = PROFILE_SORT_KEYS[sortKey] || PROFILE_SORT_KEYS.posts_fetched;
    return [...filtered].sort((a, b) => {
      const base = cmp(a, b);
      return sortDir === 'asc' ? base : -base;
    });
  }, [data?.profiles, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (!data) return null;

  const SortBtn = ({ col, label }) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
    >
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === col ? 'text-primary' : 'opacity-40')} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Monitored accounts" value={data.total} />
        <StatTile label="Active" value={data.active} accent="text-emerald-600" />
        <StatTile label="Paused" value={data.paused} accent="text-muted-foreground" />
        <StatTile
          label="High content relevance"
          value={data.risk_distribution?.high || 0}
          accent="text-amber-600"
          hint="Based on post risk + virality, not alert count"
        />
      </div>

      <SectionCard title="Per profile (selected range)">
        {!data.profiles?.length ? (
          <EmptyModuleCta
            title="No profiles yet"
            body="Add social profiles and start monitoring to see posts fetched and alerts per profile."
            to="/social-profiles"
            cta="Add profiles"
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, handle, platform…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {rows.length} of {data.profiles.length} profiles
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2"><SortBtn col="name" label="Profile" /></th>
                    <th className="px-3 py-2"><SortBtn col="posts_fetched" label="Posts fetched" /></th>
                    <th className="px-3 py-2"><SortBtn col="alerts_count" label="Alerts" /></th>
                    <th className="px-3 py-2"><SortBtn col="alerts_open" label="Open / high" /></th>
                    <th className="px-3 py-2"><SortBtn col="last_fetched_at" label="Last fetch" /></th>
                    <th className="px-3 py-2"><SortBtn col="monitoring" label="Monitoring" /></th>
                    <th className="px-3 py-2 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No profiles match this search.
                      </td>
                    </tr>
                  ) : (
                    rows.map((p) => (
                      <tr
                        key={p.profile_id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/social-profiles/${p.account_id || p.profile_id}`)}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{p.display_name || 'Untitled'}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {(p.platforms || []).join(', ') || '—'}
                            {p.handles?.[0] ? ` · @${p.handles[0]}` : ''}
                            {p.accounts_count > 1 ? ` · ${p.accounts_count} accounts` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {p.posts_fetched?.toLocaleString?.('en-IN') ?? p.posts_fetched}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            / {p.posts_total?.toLocaleString?.('en-IN') ?? p.posts_total} total
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{p.alerts_count}</td>
                        <td className="px-3 py-2 tabular-nums">
                          <span>{p.alerts_open}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={p.alerts_high ? 'text-red-600 font-semibold' : ''}>
                            {p.alerts_high}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatWhen(p.last_fetched_at)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                              p.monitoring === 'started'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-border bg-muted text-muted-foreground'
                            )}
                          >
                            {p.monitoring || 'stopped'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard title="Accounts by platform">
          <BreakdownPie breakdown={data.byPlatform} colorMap={PLATFORM_COLORS} />
        </SectionCard>
        <SectionCard title="Content volume by platform (range)">
          <BreakdownBar breakdown={data.content_by_platform} colorMap={PLATFORM_COLORS} />
        </SectionCard>
        <SectionCard title="Content relevance distribution">
          <BreakdownPie breakdown={data.risk_distribution} colorMap={RISK_COLORS} />
        </SectionCard>
      </div>
      <SectionCard title="Posts collected per day">
        <TrendChart data={data.trend} />
      </SectionCard>
    </div>
  );
};

const TAB_LOADERS = {
  all: analyticsHubApi.overview,
  events: analyticsHubApi.events,
  alerts: analyticsHubApi.alerts,
  grievances: analyticsHubApi.grievances,
  profiles: analyticsHubApi.profiles,
};

const AnalyticsHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TAB_LOADERS[searchParams.get('tab')] ? searchParams.get('tab') : 'all';
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [dataByTab, setDataByTab] = useState({});

  const load = useCallback(async (tab, currentRange) => {
    setLoading(true);
    try {
      const res = await TAB_LOADERS[tab]({ range: currentRange });
      setDataByTab((prev) => ({ ...prev, [tab]: res.data }));
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to load ${tab} analytics`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeTab, range);
  }, [activeTab, range, load]);

  const setTab = useCallback((value) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', value);
    return next;
  }, { replace: true }), [setSearchParams]);

  const currentData = dataByTab[activeTab];

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'events': return <EventsTab data={currentData} />;
      case 'alerts': return <AlertsTab data={currentData} />;
      case 'grievances': return <GrievancesTab data={currentData} />;
      case 'profiles': return <ProfilesTab data={currentData} />;
      default: return <AllTab data={currentData} onGoTab={setTab} />;
    }
  }, [activeTab, currentData, setTab]);

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-4 overflow-y-auto">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl">Analytics</h1>
            <p className="text-sm text-muted-foreground">Complete analytics across Events, Alerts, Grievances, and Profiles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => load(activeTab, range)}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1">
        {loading && !currentData ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : (
          tabContent
        )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
