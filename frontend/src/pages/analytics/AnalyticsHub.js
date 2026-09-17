import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, AlertTriangle, MessageSquare, CalendarDays, Contact2, Loader2, RefreshCw,
  ArrowUpDown, Search, ExternalLink, Download, Shield, Activity, Radio,
  Sparkles, TrendingUp, Layers, CheckCircle2, ArrowRight, Eye, FileText, Check, AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { analyticsHubApi } from '../../api';
import { Card, CardContent } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import {
  AllPlatformsLogo,
  XBrandLogo,
  YoutubeBrandLogo,
  FacebookBrandLogo,
  InstagramBrandLogo,
  TelegramBrandLogo,
} from '../../components/PlatformBrandIcon';

import { usePagePlatforms } from '../../hooks/usePagePlatforms';

/* Platform styling and colors */
const PLATFORM_COLORS = {
  x: '#000000',
  twitter: '#000000',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E4405F',
  telegram: '#229ED9',
  unknown: '#94a3b8',
};

const getPlatformIcon = (slug) => {
  const s = String(slug || '').toLowerCase();
  if (s === 'x' || s === 'twitter') return XBrandLogo;
  if (s === 'facebook' || s === 'fb') return FacebookBrandLogo;
  if (s === 'youtube') return YoutubeBrandLogo;
  if (s === 'instagram') return InstagramBrandLogo;
  if (s === 'telegram') return TelegramBrandLogo;
  return Activity;
};

const getPlatformLabel = (slug) => {
  const s = String(slug || '').toLowerCase();
  if (!s || s === 'all') return 'All Platforms';
  if (s === 'x' || s === 'twitter') return 'X / Twitter';
  if (s === 'facebook') return 'Facebook';
  if (s === 'youtube') return 'YouTube';
  if (s === 'instagram') return 'Instagram';
  if (s === 'telegram') return 'Telegram';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const RISK_COLORS = {
  critical: '#ef4444',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e'
};

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  neutral: '#94a3b8',
  negative: '#ef4444'
};

const STANCE_COLORS = {
  support: '#22c55e',
  oppose: '#ef4444',
  neutral: '#94a3b8',
  unclear: '#f59e0b'
};

const STATUS_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#94a3b8'];

const colorFor = (key, map, fallback = STATUS_COLORS, idx = 0) =>
  (map && map[String(key || '').toLowerCase()]) ||
  (map && map[String(key || '').toUpperCase()]) ||
  fallback[idx % fallback.length] ||
  '#94a3b8';

const RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

const TABS = [
  { value: 'all', label: 'Executive Overview', icon: BarChart3 },
  { value: 'alerts', label: 'Threat Alerts & Risk', icon: AlertTriangle },
  { value: 'grievances', label: 'Citizen Grievances', icon: MessageSquare },
  { value: 'profiles', label: 'Target Profiles', icon: Contact2 },
  { value: 'events', label: 'Monitored Events', icon: CalendarDays },
];

const formatWhen = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const EmptyModuleCta = ({ title, body, to, cta }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center shadow-xs">
    <p className="text-sm font-bold text-foreground">{title}</p>
    <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">{body}</p>
    {to ? (
      <Button asChild variant="outline" size="sm" className="mt-3 font-semibold text-xs">
        <Link to={to}>{cta} <ArrowRight className="h-3 w-3 ml-1" /></Link>
      </Button>
    ) : null}
  </div>
);

const EmptyChartNote = () => (
  <div className="flex h-full min-h-[140px] items-center justify-center text-xs text-muted-foreground bg-muted/10 rounded-lg">
    No data recorded for this timeframe
  </div>
);

/* Enhanced Area Trend Chart */
const TrendChart = ({ data, dataKeys, colorMap, height = 230 }) => {
  const hasData = Array.isArray(data) && data.some((d) => d.total > 0 || (dataKeys && dataKeys.some(k => d[k] > 0)));
  return (
    <div style={{ height }} className="w-full">
      {!hasData ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {(dataKeys || ['total']).map((key, i) => {
                const col = colorMap ? colorFor(key, colorMap, STATUS_COLORS, i) : STATUS_COLORS[i % STATUS_COLORS.length];
                return (
                  <linearGradient key={`grad-${key}`} id={`area-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={col} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={col} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} stroke="#94a3b8" />
            <RechartsTooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'var(--popover, #fff)', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              labelFormatter={(v) => `Date: ${v}`}
            />
            {(dataKeys || ['total']).map((key, i) => {
              const col = colorMap ? colorFor(key, colorMap, STATUS_COLORS, i) : STATUS_COLORS[i % STATUS_COLORS.length];
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId={dataKeys?.length > 1 ? '1' : undefined}
                  stroke={col}
                  strokeWidth={2}
                  fill={`url(#area-grad-${key})`}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

/* Enhanced Donut Chart with Center Summary */
const BreakdownPie = ({ breakdown, colorMap, fallbackColors = STATUS_COLORS, height = 230 }) => {
  const data = Object.entries(breakdown || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div style={{ height }} className="relative w-full">
      {!data.length ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              stroke="transparent"
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={colorFor(entry.name, colorMap || {}, fallbackColors, i)} />
              ))}
            </Pie>
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              formatter={(value, entry) => (
                <span className="text-foreground text-xs capitalize font-medium">
                  {value} ({entry.payload.value})
                </span>
              )}
            />
            <RechartsTooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'var(--popover, #fff)', border: '1px solid var(--border, #e2e8f0)' }}
              formatter={(val, name) => [`${val} (${((val / (total || 1)) * 100).toFixed(1)}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

/* Enhanced Bar Chart */
const BreakdownBar = ({ breakdown, colorMap, fallbackColors = STATUS_COLORS, height = 230 }) => {
  const data = Object.entries(breakdown || {}).map(([name, value]) => ({ name, value }));
  return (
    <div style={{ height }} className="w-full">
      {!data.some((d) => d.value > 0) ? (
        <EmptyChartNote />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} stroke="#94a3b8" />
            <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'var(--popover, #fff)', border: '1px solid var(--border, #e2e8f0)' }} />
            <Bar dataKey="value" radius={[5, 5, 0, 0]}>
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

/* Unified Section Card */
const SectionCard = ({ title, subtitle, badge, action, children }) => (
  <Card className="border-border bg-card rounded-xl shadow-xs overflow-hidden">
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3.5 border-b border-border/60 pb-2.5">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        {action}
      </div>
      {children}
    </CardContent>
  </Card>
);

/* ── 1. Executive Overview Tab ── */
const AllTab = ({ data, onGoTab }) => {
  if (!data) return null;
  const { kpis = {}, alerts = {}, grievances = {}, events = {}, platforms = [], top_profiles = [] } = data;
  const noActivity =
    !(kpis.posts_in_range > 0) &&
    !(kpis.unread_alerts > 0) &&
    !(kpis.accounts_total > 0);

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {noActivity && (
        <EmptyModuleCta
          title="No telemetry recorded yet"
          body="Add target accounts and start monitoring channels to stream live intelligence telemetry."
          to="/social-profiles"
          cta="Go to Target Profiles"
        />
      )}

      {/* 4 Interactive Quick Action Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onGoTab?.('profiles')}
          className="text-left p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Target Profiles</span>
            <Contact2 className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-foreground mt-1.5">
            {kpis.accounts_total || 0}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>{kpis.accounts_monitoring || 0} active stream</span>
            <span className="text-primary font-semibold group-hover:underline">View →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onGoTab?.('alerts')}
          className="text-left p-3.5 rounded-xl border border-border bg-card hover:border-red-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>High Risk Threats</span>
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-1.5">
            {kpis.high_risk_open || 0}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>{kpis.unread_alerts || 0} unread alerts</span>
            <span className="text-red-500 font-semibold group-hover:underline">Triage →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onGoTab?.('grievances')}
          className="text-left p-3.5 rounded-xl border border-border bg-card hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Citizen Grievances</span>
            <MessageSquare className="h-3.5 w-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1.5">
            {kpis.open_grievances || 0}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>Pending redressal</span>
            <span className="text-amber-600 font-semibold group-hover:underline">Resolve →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onGoTab?.('events')}
          className="text-left p-3.5 rounded-xl border border-border bg-card hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Monitored Events</span>
            <CalendarDays className="h-3.5 w-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-1.5">
            {kpis.events_started || 0}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>{events.total || 0} total events</span>
            <span className="text-emerald-600 font-semibold group-hover:underline">Track →</span>
          </div>
        </button>
      </div>

      {/* 3-Column Chart Distribution Matrix */}
      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-3">
        <SectionCard title="Threat Alerts by Risk Level" subtitle="Severity breakdown of active incidents">
          <BreakdownPie breakdown={alerts.by_risk} colorMap={RISK_COLORS} height={210} />
        </SectionCard>

        <SectionCard title="Grievances Workflow Funnel" subtitle="Resolution pipeline of detected issues">
          <BreakdownPie breakdown={grievances.by_workflow} height={210} />
        </SectionCard>

        <SectionCard title="Accounts by Platform" subtitle="Target coverage across active networks">
          <BreakdownBar
            breakdown={platforms.reduce((acc, p) => ({ ...acc, [p.slug]: p.accounts }), {})}
            colorMap={PLATFORM_COLORS}
            height={210}
          />
        </SectionCard>
      </div>

      {/* 2-Column Split: Top Profiles Leaderboard + Active Incidents */}
      <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
        <SectionCard
          title="High Activity Target Profiles"
          subtitle="Profiles generating highest volume in selected range"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary font-semibold" onClick={() => onGoTab?.('profiles')}>
              View All Profiles <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          }
        >
          {!top_profiles?.length ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No profile activity in this timeframe.</p>
          ) : (
            <div className="space-y-2">
              {top_profiles.slice(0, 5).map((p) => (
                <div
                  key={`${p.account_id}-${p.platform}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/social-profiles/${p.account_id}`}
                      className="font-semibold text-xs text-foreground hover:text-primary hover:underline truncate block"
                    >
                      {p.display_name || p.handle}
                    </Link>
                    <p className="text-[11px] text-muted-foreground truncate">
                      @{p.handle} · <span className="capitalize font-medium">{p.platform}</span> · {p.monitoring_status || 'started'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      {p.posts?.toLocaleString?.('en-IN') ?? p.posts}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">posts</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Active Monitored Events (${events.started ?? 0} Active)`}
          subtitle="Real-time multi-network narrative monitors"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary font-semibold" onClick={() => onGoTab?.('events')}>
              Open Events <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          }
        >
          {!events.items?.length ? (
            <EmptyModuleCta
              title="No live events currently active"
              body="Launch an event probe to track breaking topics across social platforms."
              to="/events"
              cta="Create Event Probe"
            />
          ) : (
            <div className="space-y-2">
              {events.items.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <Link to="/events" className="font-semibold text-xs text-foreground hover:text-primary hover:underline truncate block">
                      {e.name}
                    </Link>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Active Stream Interrogation
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                    {e.media_count} items
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

/* ── 2. Threat Alerts Tab ── */
const AlertsTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Ingested Alerts</p>
          <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{data.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Across all platforms</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Critical & High Risk</p>
          <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-1">
            {(data.by_risk?.high || 0) + (data.by_risk?.critical || 0)}
          </p>
          <p className="text-[10px] text-red-500 mt-0.5">Priority triage required</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Medium Severity</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {data.by_risk?.medium || 0}
          </p>
          <p className="text-[10px] text-amber-500 mt-0.5">Monitored incidents</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active / Pending Triage</p>
          <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-1">
            {data.by_status?.active || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Awaiting resolution</p>
        </div>
      </div>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-3">
        <SectionCard title="Threat Alerts by Risk Level" subtitle="Severity distribution">
          <BreakdownPie breakdown={data.by_risk} colorMap={RISK_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Alerts by Origin Network" subtitle="Source platform distribution">
          <BreakdownPie breakdown={data.by_platform} colorMap={PLATFORM_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Workflow Triage Status" subtitle="Status of alert processing">
          <BreakdownBar breakdown={data.by_status} height={210} />
        </SectionCard>
      </div>

      <SectionCard
        title="Triage & Workflow Activity Timeline"
        subtitle="Daily volume of acknowledged, escalated, resolved, and false positive alerts"
      >
        <TrendChart
          data={data.trend}
          dataKeys={['acknowledged', 'escalated', 'resolved', 'false_positive']}
          height={240}
        />
      </SectionCard>
    </div>
  );
};

/* ── 3. Grievances Tab ── */
const GrievancesTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Grievances</p>
          <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{data.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Citizens issues detected</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Newly Received</p>
          <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-1">
            {data.by_workflow?.received || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Awaiting initial review</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Escalated to Police</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {data.by_workflow?.escalated || 0}
          </p>
          <p className="text-[10px] text-amber-500 mt-0.5">Official action pending</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reports Dispatched</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {data.reports?.total || 0}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Automated dossiers sent</p>
        </div>
      </div>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-3">
        <SectionCard title="Workflow Resolution Status" subtitle="Pipeline progression">
          <BreakdownPie breakdown={data.by_workflow} height={210} />
        </SectionCard>
        <SectionCard title="Grievance Source Platform" subtitle="Origin channels">
          <BreakdownPie breakdown={data.by_platform} colorMap={PLATFORM_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Category Classification" subtitle="Crime & issue taxonomy">
          <BreakdownBar breakdown={data.by_classification} height={210} />
        </SectionCard>
      </div>

      <SectionCard title="Grievance Detection Velocity" subtitle="Daily citizen complaints detected across platforms">
        <TrendChart data={data.trend} height={240} />
      </SectionCard>
    </div>
  );
};

/* ── 4. Target Profiles Tab ── */
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
      className="inline-flex items-center gap-1 font-semibold hover:text-foreground cursor-pointer"
    >
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === col ? 'text-primary' : 'opacity-40')} />
    </button>
  );

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monitored Accounts</p>
          <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{data.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Target persona accounts</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Telemetry</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {data.active || 0}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Real-time scraping</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paused / Inactive</p>
          <p className="text-2xl font-bold tabular-nums text-muted-foreground mt-1">
            {data.paused || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Monitoring stopped</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">High Content Relevance</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {data.risk_distribution?.high || 0}
          </p>
          <p className="text-[10px] text-amber-500 mt-0.5">Virality & threat score</p>
        </div>
      </div>

      {/* Target Accounts Activity Table */}
      <SectionCard
        title="Persona Activity & Alert Breakdown"
        subtitle="Individual profile ingestion volume, alert levels, and sync frequency"
      >
        {!data.profiles?.length ? (
          <EmptyModuleCta
            title="No monitored profiles registered"
            body="Enroll suspect accounts to populate comprehensive profile analytics."
            to="/social-profiles"
            cta="Add Target Profiles"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter name, handle, platform…"
                  className="h-8 pl-8 text-xs bg-background"
                />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">
                Showing {rows.length} of {data.profiles.length} profiles
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  <tr>
                    <th className="px-3 py-2.5"><SortBtn col="name" label="Persona / Profile" /></th>
                    <th className="px-3 py-2.5"><SortBtn col="posts_fetched" label="Posts Ingested" /></th>
                    <th className="px-3 py-2.5"><SortBtn col="alerts_count" label="Alerts" /></th>
                    <th className="px-3 py-2.5"><SortBtn col="alerts_open" label="Open / High" /></th>
                    <th className="px-3 py-2.5"><SortBtn col="last_fetched_at" label="Last Fetch" /></th>
                    <th className="px-3 py-2.5"><SortBtn col="monitoring" label="Monitoring" /></th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No profiles matched your filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((p) => (
                      <tr
                        key={p.profile_id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => navigate(`/social-profiles/${p.account_id || p.profile_id}`)}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-foreground text-xs">{p.display_name || 'Untitled'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(p.platforms || []).join(', ') || '—'}
                            {p.handles?.[0] ? ` · @${p.handles[0]}` : ''}
                            {p.accounts_count > 1 ? ` · ${p.accounts_count} channels` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <span className="font-semibold">{p.posts_fetched?.toLocaleString?.('en-IN') ?? p.posts_fetched}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            / {p.posts_total?.toLocaleString?.('en-IN') ?? p.posts_total}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">{p.alerts_count}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <span>{p.alerts_open}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={p.alerts_high ? 'text-red-600 font-bold' : ''}>
                            {p.alerts_high}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {formatWhen(p.last_fetched_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold capitalize',
                              p.monitoring === 'started'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-border bg-muted text-muted-foreground'
                            )}
                          >
                            {p.monitoring || 'stopped'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-3">
        <SectionCard title="Accounts by Platform" subtitle="Platform network distribution">
          <BreakdownPie breakdown={data.byPlatform} colorMap={PLATFORM_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Content Volume by Platform" subtitle="Ingestion rate per network">
          <BreakdownBar breakdown={data.content_by_platform} colorMap={PLATFORM_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Content Relevance Distribution" subtitle="Risk & virality scoring">
          <BreakdownPie breakdown={data.risk_distribution} colorMap={RISK_COLORS} height={210} />
        </SectionCard>
      </div>

      <SectionCard title="Daily Post Ingestion Velocity" subtitle="Timeline of items collected across all target personas">
        <TrendChart data={data.trend} height={240} />
      </SectionCard>
    </div>
  );
};

/* ── 5. Events & Narrative Tab ── */
const EventsTab = ({ data }) => {
  if (!data) return null;
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Event Monitors</p>
          <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{data.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Campaigns & probes</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Probing</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {data.by_status?.started || 0}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Live interrogation</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Archived Probes</p>
          <p className="text-2xl font-bold tabular-nums text-muted-foreground mt-1">
            {data.by_status?.stopped || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Historical events</p>
        </div>
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discovered Media Items</p>
          <p className="text-2xl font-bold tabular-nums text-primary mt-1">
            {data.trend?.reduce((s, d) => s + d.total, 0) || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">In selected range</p>
        </div>
      </div>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2">
        <SectionCard title="Events by Status" subtitle="Active vs stopped tracking">
          <BreakdownPie breakdown={data.by_status} height={210} />
        </SectionCard>
        <SectionCard title="Event Origin" subtitle="Manual setup vs automated detection">
          <BreakdownPie breakdown={data.by_origin} height={210} />
        </SectionCard>
      </div>

      <SectionCard title="Discovered Content by Platform" subtitle="Volume of media collected per network">
        <BreakdownBar breakdown={data.content_by_platform} colorMap={PLATFORM_COLORS} height={210} />
      </SectionCard>

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2">
        <SectionCard title="AI Narrative Sentiment Breakdown" subtitle="Tone analysis of analyzed event media">
          <BreakdownPie breakdown={data.by_sentiment} colorMap={SENTIMENT_COLORS} height={210} />
        </SectionCard>
        <SectionCard title="Stance Toward Authority" subtitle="Public position toward administration">
          <BreakdownPie breakdown={data.by_stance} colorMap={STANCE_COLORS} height={210} />
        </SectionCard>
      </div>

      <SectionCard title="Event Content Discovery Velocity" subtitle="Daily rate of media items unearthed across platforms">
        <TrendChart data={data.trend} height={240} />
      </SectionCard>
    </div>
  );
};

const TAB_LOADERS = {
  all: analyticsHubApi.overview,
  alerts: analyticsHubApi.alerts,
  grievances: analyticsHubApi.grievances,
  profiles: analyticsHubApi.profiles,
  events: analyticsHubApi.events,
};

const AnalyticsHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TAB_LOADERS[searchParams.get('tab')] ? searchParams.get('tab') : 'all';
  const [range, setRange] = useState('30d');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [dataByTab, setDataByTab] = useState({});

  const { slugs: configuredSlugs = [] } = usePagePlatforms();

  useEffect(() => {
    if (platform !== 'all' && configuredSlugs.length > 0 && !configuredSlugs.includes(platform)) {
      setPlatform('all');
    }
  }, [configuredSlugs, platform]);

  const load = useCallback(async (tab, currentRange, currentPlatform) => {
    setLoading(true);
    try {
      const params = { range: currentRange };
      if (currentPlatform && currentPlatform !== 'all') {
        params.platform = currentPlatform;
      }
      const res = await TAB_LOADERS[tab](params);
      setDataByTab((prev) => ({ ...prev, [tab]: res.data }));
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to load ${tab} analytics`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeTab, range, platform);
  }, [activeTab, range, platform, load]);

  const setTab = useCallback((value) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', value);
    return next;
  }, { replace: true }), [setSearchParams]);

  const currentData = dataByTab[activeTab];

  /* Export to PDF */
  const exportToPDF = useCallback(() => {
    if (!currentData) return;
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Cyber Intelligence Platform — Analytics Dossier', 14, 20);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`, 14, 28);
      doc.text(`Scope: ${activeTab.toUpperCase()} | Timeframe: ${range.toUpperCase()} | Platform: ${platform.toUpperCase()}`, 14, 34);

      if (activeTab === 'all' && currentData.kpis) {
        autoTable(doc, {
          startY: 42,
          head: [['Metric', 'Value']],
          body: [
            ['Total Monitored Profiles', String(currentData.kpis.accounts_total || 0)],
            ['Active Monitoring Streams', String(currentData.kpis.accounts_monitoring || 0)],
            ['High / Critical Open Threats', String(currentData.kpis.high_risk_open || 0)],
            ['Unread Threat Alerts', String(currentData.kpis.unread_alerts || 0)],
            ['Open Citizen Grievances', String(currentData.kpis.open_grievances || 0)],
            ['Active Event Probes', String(currentData.kpis.events_started || 0)],
            ['Posts Ingested in Range', String(currentData.kpis.posts_in_range || 0)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59] },
        });
      } else if (activeTab === 'profiles' && Array.isArray(currentData.profiles)) {
        autoTable(doc, {
          startY: 42,
          head: [['Profile / Handle', 'Platforms', 'Posts Fetched', 'Alerts', 'Monitoring']],
          body: currentData.profiles.slice(0, 30).map((p) => [
            p.display_name || p.handle || '—',
            (p.platforms || []).join(', '),
            String(p.posts_fetched || 0),
            String(p.alerts_count || 0),
            p.monitoring || 'started'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59] },
        });
      }

      doc.save(`analytics-dossier-${activeTab}-${range}.pdf`);
      toast.success('Analytics PDF dossier exported');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  }, [currentData, activeTab, range, platform]);

  /* Export to Excel */
  const exportToExcel = useCallback(() => {
    if (!currentData) return;
    try {
      const wb = XLSX.utils.book_new();
      if (activeTab === 'profiles' && Array.isArray(currentData.profiles)) {
        const ws = XLSX.utils.json_to_sheet(currentData.profiles);
        XLSX.utils.book_append_sheet(wb, ws, 'Profiles Analytics');
      } else {
        const rows = [
          { Metric: 'Active Tab', Value: activeTab },
          { Metric: 'Range', Value: range },
          { Metric: 'Platform', Value: platform },
          { Metric: 'Exported At', Value: new Date().toISOString() },
        ];
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Analytics Overview');
      }
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `analytics-${activeTab}-${range}.xlsx`);
      toast.success('Excel analytics exported');
    } catch (e) {
      toast.error('Failed to export Excel');
    }
  }, [currentData, activeTab, range, platform]);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'alerts': return <AlertsTab data={currentData} />;
      case 'grievances': return <GrievancesTab data={currentData} />;
      case 'profiles': return <ProfilesTab data={currentData} />;
      case 'events': return <EventsTab data={currentData} />;
      default: return <AllTab data={currentData} onGoTab={setTab} />;
    }
  }, [activeTab, currentData, setTab]);

  return (
    <div className="flex min-h-full flex-col gap-3.5 max-w-[1600px] mx-auto w-full pb-8 animate-in fade-in-50 duration-200">
      {/* Executive Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-heading font-bold tracking-tight leading-none text-foreground">
                Intelligence Analytics & Operations Hub
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              Cross-platform situational awareness, threat velocity & forensic operational metrics
            </p>
          </div>
        </div>

        {/* Global Filter Controls & Action Bar */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Platform Filter (dynamically scoped to configured tenant platforms) */}
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="h-8 text-xs font-medium w-[145px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <AllPlatformsLogo className="h-3.5 w-3.5" />
                  All Platforms
                </span>
              </SelectItem>
              {configuredSlugs.map((slug) => {
                const Icon = getPlatformIcon(slug);
                return (
                  <SelectItem key={slug} value={slug} className="text-xs">
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {getPlatformLabel(slug)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Timeframe Range Selector */}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-8 text-xs font-semibold w-[130px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs font-medium">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export Buttons */}
          <Button variant="outline" size="sm" onClick={exportToPDF} className="h-8 gap-1.5 text-xs font-medium">
            <Download className="h-3.5 w-3.5" /> PDF Dossier
          </Button>

          <Button variant="outline" size="sm" onClick={exportToExcel} className="h-8 gap-1.5 text-xs font-medium hidden md:inline-flex">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => load(activeTab, range, platform)}
            disabled={loading}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Unified Analytics Navigation Tabs */}
      <div className="rounded-xl border border-border bg-card p-1 shrink-0 shadow-xs">
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.value;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    'gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Content Container */}
      <div className="w-full min-h-[400px]">
        {loading && !currentData ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground rounded-xl border border-border bg-card shadow-xs">
            <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
            <p className="text-xs font-semibold">Aggregating cross-platform intelligence metrics…</p>
          </div>
        ) : (
          tabContent
        )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
