/**
 * BluGate Usage & Billing — the client account, this month's usage and every platform's access,
 * health and consumption. Reads GET /api/blugate/billing, which returns BluGate's global
 * /health and /billing responses as { health, billing }.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CreditCard, RefreshCw, ShieldAlert, Gauge, CalendarDays } from 'lucide-react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { cn } from '../../lib/utils';

const num = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString());
const latency = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const dayLabel = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const GOOD = new Set(['operational', 'connected', 'healthy', 'active', 'ok', 'normal']);
const WARN = new Set(['degraded', 'warning', 'development']);
const toneOf = (v) => {
  const k = String(v || '').toLowerCase();
  return GOOD.has(k) ? 'good' : WARN.has(k) ? 'warn' : 'bad';
};
const TEXT = { good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-600' };
const DOT = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' };

const Pill = ({ label, value }) => {
  if (!value) return null;
  const tone = toneOf(value);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px]">
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold capitalize', TEXT[tone])}>{value}</span>
    </span>
  );
};

const Kpi = ({ label, value, sub, tone }) => (
  <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={cn('mt-1 text-2xl font-heading font-bold tabular-nums leading-none', tone && TEXT[tone])}>{value}</p>
    {sub && <p className="mt-1.5 text-[11px] text-muted-foreground truncate">{sub}</p>}
  </div>
);

const Section = ({ title, aside, children, className }) => (
  <section className={cn('rounded-xl border border-border bg-card', className)}>
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

const limitsText = (l) => {
  const parts = [['/min', l?.perMinute], ['/day', l?.daily], ['/week', l?.weekly], ['/month', l?.monthly]]
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${num(v)}${k}`);
  return parts.length ? parts.join(' · ') : 'None';
};

/** Health platforms + billing usage joined by slug. */
const buildRows = (health, billing) => {
  const usage = new Map((billing?.platformUsage || []).map((p) => [String(p.slug || '').toLowerCase(), p]));
  const rows = [];
  const seen = new Set();
  for (const p of Array.isArray(health?.platforms) ? health.platforms : []) {
    const slug = String(p.slug || '').toLowerCase();
    seen.add(slug);
    rows.push({ slug, name: p.name || slug, version: p.version, granted: p.accessGranted !== false, health: p.health || p.status, endpoints: p.endpointCount, usage: usage.get(slug) || null });
  }
  for (const [slug, u] of usage) {
    if (!seen.has(slug)) rows.push({ slug, name: u.providerName || slug, granted: true, health: u.status, endpoints: null, usage: u });
  }
  return rows.sort((a, b) =>
    Number(b.granted) - Number(a.granted) ||
    (b.usage?.consumed?.month || 0) - (a.usage?.consumed?.month || 0) ||
    a.name.localeCompare(b.name));
};

const monthProgress = (period, month) => {
  const start = period?.periodStart ? new Date(period.periodStart) : null;
  const end = period?.periodEnd ? new Date(period.periodEnd) : null;
  if (!start || !end || Number.isNaN(start) || Number.isNaN(end)) return null;
  const DAY = 86400000;
  const total = Math.max(1, Math.round((end - start) / DAY));
  const day = Math.min(total, Math.max(1, Math.floor((Date.now() - start) / DAY) + 1));
  const projected = month != null ? Math.round((month / day) * total) : null;
  return { start, end, total, day, left: total - day, projected };
};

const BlugateBilling = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const load = useCallback(async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      else setLoading(true);
      const res = await api.get('/blugate/billing');
      setData(res.data);
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load BluGate billing data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const health = data?.health;
  const billing = data?.billing;
  const client = { ...(health?.client || {}), ...(billing?.client || {}) };
  const system = health?.system;
  const overall = billing?.overallUsage;
  const rows = useMemo(() => buildRows(health, billing), [health, billing]);
  const progress = useMemo(() => monthProgress(billing?.billingPeriod, overall?.requestsThisMonth), [billing, overall]);
  const monthTotal = overall?.requestsThisMonth || rows.reduce((sum, r) => sum + (r.usage?.consumed?.month || 0), 0);
  const ranked = rows.filter((r) => r.usage).sort((a, b) => b.usage.consumed.month - a.usage.consumed.month);
  const maxMonth = ranked[0]?.usage.consumed.month || 0;
  const noAccess = rows.filter((r) => !r.granted);
  const success = overall?.successRate;
  const successTone = success == null ? undefined : success >= 95 ? 'good' : success >= 80 ? 'warn' : 'bad';
  const accessible = client.accessiblePlatformsCount ?? rows.filter((r) => r.granted).length;
  const totalPlatforms = client.totalPlatformsCount ?? rows.length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-bold leading-none tracking-tight">
            <CreditCard className="h-4 w-4 text-primary" />
            BluGate Usage & Billing
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">Your account, this month&apos;s usage and every platform&apos;s access and health</p>
        </div>
        <div className="flex items-center gap-2">
          {lastChecked && <span className="text-[11px] text-muted-foreground">Updated {lastChecked.toLocaleTimeString()}</span>}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => load(true)} disabled={loading || refreshing}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading BluGate account data…</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <h2 className="text-sm font-semibold">Connection error</h2>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button size="sm" className="mt-2 h-8 text-xs" onClick={() => load(true)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry
            </Button>
          </div>
        ) : data?.configured === false ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground/40" />
            <h2 className="text-sm font-semibold">BluGate not configured</h2>
            <p className="max-w-sm text-xs text-muted-foreground">Add your BluGate keys under Settings → Platforms, then fetch.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-[1400px] space-y-4">
            {data?.health_error && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Health check failed: {data.health_error}</div>
            )}
            {data?.billing_error && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Billing check failed: {data.billing_error}</div>
            )}

            {/* Account + system */}
            {(client.name || system) && (
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-heading font-bold tracking-tight">{client.name}</h2>
                    {client.environment && <Badge variant="outline" className="h-5 text-[10px] uppercase">{client.environment}</Badge>}
                    {client.status && (
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', TEXT[toneOf(client.status)])}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', DOT[toneOf(client.status)])} />{client.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[client.clientCode, client.id, client.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {system && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill label="System" value={system.status} />
                    <Pill label="Gateway" value={system.gateway} />
                    <Pill label="Database" value={system.database} />
                    {system.version && (
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                        BluGate {system.version}{system.environment ? ` · ${system.environment}` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* KPIs */}
            {overall && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi label="Requests this month" value={num(overall.requestsThisMonth)} sub={billing?.billingPeriod?.currentMonth} />
                <Kpi label="Requests today" value={num(overall.requestsToday)} />
                <Kpi label="All time" value={num(overall.totalRequestsAllTime)} sub="requests" />
                <Kpi label="Success rate" value={success != null ? `${success}%` : '—'} tone={successTone}
                  sub={successTone === 'good' ? 'Healthy' : successTone === 'warn' ? 'Some requests failing' : successTone === 'bad' ? 'Many requests failing' : undefined} />
                <Kpi label="Avg latency" value={latency(overall.averageLatencyMs)} sub="per request" />
                <Kpi label="Platforms you can use" value={`${accessible} / ${totalPlatforms}`} sub={billing?.client?.activeApiKeys != null ? `${billing.client.activeApiKeys} active API key${billing.client.activeApiKeys === 1 ? '' : 's'}` : undefined} />
              </div>
            )}

            {/* Billing period */}
            {progress && (
              <Section title="Billing period" aside={<span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{billing.billingPeriod.currentMonth}</span>}>
                <div className="px-4 py-3.5">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span><span className="font-semibold">Day {progress.day}</span> of {progress.total} <span className="text-muted-foreground">({dayLabel(progress.start)} to {dayLabel(progress.end)})</span></span>
                    <span className="text-muted-foreground">{progress.left} day{progress.left === 1 ? '' : 's'} left</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(progress.day / progress.total) * 100}%` }} />
                  </div>
                  {progress.projected != null && (
                    <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" />
                      At this pace you will make about <span className="font-semibold text-foreground">{num(progress.projected)}</span> requests by the end of the month. This is an estimate.
                    </p>
                  )}
                </div>
              </Section>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* Requests by platform */}
              <Section title="Requests by platform · this month">
                <div className="space-y-3 px-4 py-4">
                  {ranked.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">No usage recorded this month.</p>
                  ) : ranked.map((r) => {
                    const month = r.usage.consumed.month;
                    const share = monthTotal ? Math.round((month / monthTotal) * 1000) / 10 : 0;
                    return (
                      <div key={r.slug}>
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <PlatformBrandIcon platform={r.slug} className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">{r.name}</span>
                          <span className="ml-auto tabular-nums font-semibold">{num(month)}</span>
                          <span className="w-12 text-right tabular-nums text-muted-foreground">{share}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${maxMonth ? Math.max((month / maxMonth) * 100, month ? 2 : 0) : 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* Access + health */}
              <Section title="Platform access" aside={<span className="text-[11px] text-muted-foreground">{accessible} of {totalPlatforms} granted</span>}>
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <li key={r.slug} className="flex items-center gap-2.5 px-4 py-2.5 text-xs">
                      <PlatformBrandIcon platform={r.slug} className={cn('h-4 w-4 shrink-0', !r.granted && 'opacity-50')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-medium', !r.granted && 'text-muted-foreground')}>{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">{[r.version, r.endpoints != null && `${num(r.endpoints)} endpoints`].filter(Boolean).join(' · ')}</p>
                      </div>
                      {r.health && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                          <span className={cn('h-1.5 w-1.5 rounded-full', DOT[toneOf(r.health)])} />{r.health}
                        </span>
                      )}
                      <span className={cn('w-20 text-right text-[11px] font-semibold', r.granted ? 'text-emerald-600' : 'text-muted-foreground')}>
                        {r.granted ? 'Granted' : 'No access'}
                      </span>
                    </li>
                  ))}
                </ul>
                {noAccess.length > 0 && (
                  <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                    {noAccess.map((r) => r.name).join(' and ')} {noAccess.length === 1 ? 'is' : 'are'} not included in your BluGate plan. Ask BluGate to enable {noAccess.length === 1 ? 'it' : 'them'}.
                  </p>
                )}
              </Section>
            </div>

            {/* Detail table */}
            <Section title="Usage, quota and limits by platform">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Platform</th>
                      <th className="px-3 py-2 text-right font-medium">Today</th>
                      <th className="px-3 py-2 text-right font-medium">This month</th>
                      <th className="px-3 py-2 text-right font-medium">All time</th>
                      <th className="px-3 py-2 text-right font-medium">Share</th>
                      <th className="px-3 py-2 font-medium">Monthly quota</th>
                      <th className="px-4 py-2 font-medium">Rate limits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const u = r.usage;
                      const q = u?.quota;
                      const share = u && monthTotal ? Math.round((u.consumed.month / monthTotal) * 1000) / 10 : null;
                      const pct = q?.percentConsumed;
                      return (
                        <tr key={r.slug} className={cn('border-b border-border last:border-0', !r.granted && 'text-muted-foreground')}>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2 font-medium">
                              <PlatformBrandIcon platform={r.slug} className="h-3.5 w-3.5" />{r.name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u ? num(u.consumed.today) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{u ? num(u.consumed.month) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u ? num(u.consumed.allTime) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{share != null ? `${share}%` : '—'}</td>
                          <td className="px-3 py-2.5">
                            {!u ? '—' : q?.monthlyLimit != null ? (
                              <div className="min-w-[140px]">
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                                </div>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{num(u.consumed.month)} of {num(q.monthlyLimit)}{q.remaining != null ? ` · ${num(q.remaining)} left` : ''}</p>
                              </div>
                            ) : <span className="text-muted-foreground">No limit</span>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{u ? limitsText(u.rateLimits) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlugateBilling;
