/**
 * System Health — full-bleed ops console (matches Command center).
 * Polls GET /api/health/status; surfaces LLM/sentiment clearly for alert pipeline.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity,
  Database,
  Brain,
  RefreshCw,
  ShieldAlert,
  Zap,
  Youtube,
  Facebook,
  Instagram,
  Circle,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { TelegramBrandLogo, XBrandLogo } from '../../components/PlatformBrandIcon';

const statusMeta = (status) => {
  if (status === 'online' || status === 'active' || status === 'ok') {
    return {
      label: status === 'active' ? 'Active' : status === 'ok' ? 'OK' : 'Online',
      tone: 'ok',
      chip: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      row: 'border-l-emerald-500',
    };
  }
  if (status === 'quota_completed' || status === 'degraded') {
    return {
      label: status === 'degraded' ? 'Degraded' : 'Quota',
      tone: 'warn',
      chip: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      row: 'border-l-amber-500',
    };
  }
  return {
    label: 'Offline',
    tone: 'bad',
    chip: 'bg-red-50 text-red-800 border-red-200',
    dot: 'bg-red-500',
    row: 'border-l-red-500',
  };
};

const getApiStatus = (quotaData) => {
  if (!quotaData) return { status: 'offline', message: 'No data from backend.' };
  if (quotaData.available === false) {
    return { status: 'offline', message: 'API keys exhausted or invalid.' };
  }
  if (
    quotaData.remaining !== undefined &&
    quotaData.remaining !== 'Unknown' &&
    Number(quotaData.remaining) <= 0
  ) {
    return { status: 'quota_completed', message: 'Rate limit / quota exceeded.' };
  }
  return { status: 'active', message: 'Operational and within limits.' };
};

const formatQuota = (q) => {
  if (!q) return null;
  const rem = q.remaining;
  const lim = q.limit;
  if (rem === 'Unknown' && lim === 'Unknown') {
    return q.totalCalls != null ? `${q.totalCalls} calls` : null;
  }
  if (rem !== 'Unknown' && lim !== 'Unknown') return `${rem} / ${lim} left`;
  if (rem !== 'Unknown') return `${rem} remaining`;
  return null;
};

const worstTone = (tones) => {
  if (tones.includes('bad')) return 'bad';
  if (tones.includes('warn')) return 'warn';
  return 'ok';
};

const toneLabel = (tone) => {
  if (tone === 'ok') return 'Healthy';
  if (tone === 'warn') return 'Degraded';
  return 'Down';
};

const toneChip = (tone) => {
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (tone === 'warn') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-red-50 text-red-800 border-red-200';
};

const ServiceRow = ({ title, description, status, icon: Icon, latency, meta, error, critical }) => {
  const s = statusMeta(status);
  return (
    <div
      className={cn(
        'flex min-h-[64px] items-center gap-3 border-l-[3px] bg-card px-3 py-2.5',
        s.row,
        critical && s.tone === 'bad' && 'bg-red-50/40'
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold leading-tight">{title}</h3>
          {critical ? (
            <span className="rounded border border-amber-200 bg-amber-50 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800">
              Alerts
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
          {error || description}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            s.chip
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {latency != null && (status === 'online' || status === 'active')
            ? `${latency} ms`
            : meta || '—'}
        </span>
      </div>
    </div>
  );
};

const Panel = ({ title, icon: Icon, count, children, className }) => (
  <section className={cn('flex min-h-0 flex-col bg-card', className)}>
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
      </div>
      {count != null ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </header>
    <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">{children}</div>
  </section>
);

const SystemHealth = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const healthDataRef = useRef(healthData);
  healthDataRef.current = healthData;

  const fetchHealth = useCallback(async (manual = false) => {
    try {
      if (manual) setIsRefreshing(true);
      else if (!healthDataRef.current) setLoading(true);

      const res = await api.get('/health/status');
      setHealthData(res.data.data);
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch system health', err);
      setError('Could not connect to the backend server.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(false), 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const catalog = useMemo(() => {
    if (!healthData) {
      return {
        infra: [],
        ai: [],
        platforms: [],
        issues: [],
        summary: { ok: 0, warn: 0, bad: 0, total: 0 },
        groups: { infra: 'ok', ai: 'ok', platforms: 'ok' },
        llmDown: false,
      };
    }

    const pg = healthData.postgres;
    const svc = healthData.services || {};
    const quotas = healthData.quotas || {};

    const infra = [
      {
        id: 'postgres',
        title: 'PostgreSQL',
        description: 'Primary catalog — profiles, events, alerts, settings',
        status: pg?.status || 'offline',
        icon: Database,
        latency: pg?.latency,
        error: pg?.error,
      },
    ];

    const ai = [
      {
        id: 'ollama',
        title: 'BCSS LLM',
        description: 'Local language model — risk scoring',
        status: svc.ollama?.status || 'offline',
        icon: Brain,
        latency: svc.ollama?.latency,
        error: svc.ollama?.error,
        critical: true,
      },
      {
        id: 'sentiment',
        title: 'Custom Sentiment',
        description: 'Intelligence service — alert analysis pipeline',
        status: svc.sentiment?.status || 'offline',
        icon: Activity,
        latency: svc.sentiment?.latency,
        error: svc.sentiment?.error,
        critical: true,
      },
      {
        id: 'mediaAnalyzer',
        title: 'Media Analyzer',
        description: 'Image & video OCR pipeline',
        status: svc.mediaAnalyzer?.status || 'offline',
        icon: Zap,
        latency: svc.mediaAnalyzer?.latency,
        error: svc.mediaAnalyzer?.error,
      },
      {
        id: 'ragApi',
        title: 'RAG API',
        description: 'Vector retrieval for investigations',
        status: svc.ragApi?.status || 'offline',
        icon: Database,
        latency: svc.ragApi?.latency,
        error: svc.ragApi?.error,
      },
      {
        id: 'bluweb',
        title: 'Web Intelligence',
        description: 'Bluweb crawl, sources, and document search',
        status: svc.bluweb?.status || 'offline',
        icon: Globe,
        latency: svc.bluweb?.latency,
        error: svc.bluweb?.error,
      },
      {
        id: 'telegram',
        title: 'Telegram',
        description: svc.telegram?.error
          ? String(svc.telegram.error)
          : svc.telegram?.connected || svc.telegram?.authorized
            ? 'Service up — session connected'
            : 'Service / session status',
        status: svc.telegram?.status || 'offline',
        icon: TelegramBrandLogo,
        latency: svc.telegram?.latency,
        error: svc.telegram?.error,
        meta: svc.telegram?.authorized
          ? 'Authorized'
          : svc.telegram?.connected
            ? 'Connected'
            : null,
      },
    ];

    const platformDefs = [
      { id: 'instagram', title: 'Instagram', icon: Instagram },
      { id: 'facebook', title: 'Facebook', icon: Facebook },
      { id: 'x', title: 'X', icon: XBrandLogo },
      { id: 'youtube', title: 'YouTube', icon: Youtube },
    ];

    const platforms = platformDefs.map((p) => {
      const api = getApiStatus(quotas[p.id]);
      return {
        id: p.id,
        title: p.title,
        description: api.message,
        status: api.status,
        icon: p.icon,
        meta: formatQuota(quotas[p.id]),
      };
    });

    const all = [...infra, ...ai, ...platforms];
    let ok = 0;
    let warn = 0;
    let bad = 0;
    all.forEach((item) => {
      const t = statusMeta(item.status).tone;
      if (t === 'ok') ok += 1;
      else if (t === 'warn') warn += 1;
      else bad += 1;
    });

    const issues = all.filter((item) => statusMeta(item.status).tone !== 'ok');

    const groupTone = (list) => worstTone(list.map((i) => statusMeta(i.status).tone));

    const llmDown =
      statusMeta(svc.sentiment?.status || 'offline').tone === 'bad' ||
      statusMeta(svc.ollama?.status || 'offline').tone === 'bad';

    return {
      infra,
      ai,
      platforms,
      issues,
      summary: { ok, warn, bad, total: all.length },
      groups: {
        infra: groupTone(infra),
        ai: groupTone(ai),
        platforms: groupTone(platforms),
      },
      llmDown,
      sentimentError: svc.sentiment?.error,
      ollamaError: svc.ollama?.error,
    };
  }, [healthData]);

  if (error && !healthData) {
    return (
      <div
        className="flex h-full min-h-0 w-full flex-col bg-background"
        data-testid="system-health-page"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-none tracking-tight">System Health</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Services · databases · API quotas
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <ShieldAlert className="mb-2 h-8 w-8 text-red-500" />
          <h2 className="text-sm font-semibold text-red-900">Connection error</h2>
          <p className="mt-1 mb-4 max-w-sm text-xs text-red-700">{error}</p>
          <Button size="sm" className="h-8 text-xs" onClick={() => fetchHealth(true)}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const kpiDefs = [
    {
      key: 'infra',
      label: 'Infrastructure',
      count: catalog.infra.length,
      tone: catalog.groups.infra,
    },
    {
      key: 'ai',
      label: 'AI services',
      count: catalog.ai.length,
      tone: catalog.groups.ai,
    },
    {
      key: 'platforms',
      label: 'Platform APIs',
      count: catalog.platforms.length,
      tone: catalog.groups.platforms,
    },
  ];

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-background"
      data-testid="system-health-page"
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none tracking-tight">System Health</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Live status · databases · AI · platform APIs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {healthData ? (
            <>
              <span className="inline-flex items-baseline gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                <span className="font-semibold tabular-nums">{catalog.summary.ok}</span>
                <span>ok</span>
              </span>
              {catalog.summary.warn > 0 ? (
                <span className="inline-flex items-baseline gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                  <span className="font-semibold tabular-nums">{catalog.summary.warn}</span>
                  <span>warn</span>
                </span>
              ) : null}
              {catalog.summary.bad > 0 ? (
                <span className="inline-flex items-baseline gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                  <span className="font-semibold tabular-nums">{catalog.summary.bad}</span>
                  <span>down</span>
                </span>
              ) : null}
              {lastChecked ? (
                <span className="hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground sm:inline-flex">
                  <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                  {lastChecked.toLocaleTimeString()}
                </span>
              ) : null}
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={loading || isRefreshing}
            onClick={() => fetchHealth(true)}
          >
            <RefreshCw className={cn('h-3 w-3', (loading || isRefreshing) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !healthData ? (
        <div className="grid flex-1 grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 p-3">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-14 animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ))}
        </div>
      ) : healthData ? (
        <>
          {/* KPI strip */}
          <div className="grid shrink-0 grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {kpiDefs.map((k) => (
              <div key={k.key} className="flex items-center gap-3 bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </p>
                  <p className="text-lg font-bold tabular-nums leading-none">{k.count}</p>
                </div>
                <span
                  className={cn(
                    'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    toneChip(k.tone)
                  )}
                >
                  {toneLabel(k.tone)}
                </span>
              </div>
            ))}
          </div>

          {/* LLM / sentiment alert banner */}
          {catalog.llmDown ? (
            <div className="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-2.5 text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  Alert analysis unavailable — intelligence / LLM service unreachable
                </p>
                <p className="mt-0.5 text-[11px] text-red-800/90">
                  {[catalog.sentimentError, catalog.ollamaError].filter(Boolean).join(' · ') ||
                    'New catalog posts will not mint risk alerts until Custom Sentiment or BCSS LLM is back online.'}
                </p>
              </div>
            </div>
          ) : null}

          {/* Main service grid */}
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <Panel title="Infrastructure" icon={Database} count="1 store">
              {catalog.infra.map((item) => (
                <ServiceRow key={item.id} {...item} />
              ))}
            </Panel>
            <Panel title="AI services" icon={Brain} count={`${catalog.ai.length} services`}>
              {catalog.ai.map((item) => (
                <ServiceRow key={item.id} {...item} />
              ))}
            </Panel>
            <Panel
              title="Platform APIs"
              icon={Activity}
              count={
                healthData.quotas?.totalOverallCalls != null
                  ? `${healthData.quotas.totalOverallCalls} calls`
                  : `${catalog.platforms.length} platforms`
              }
            >
              {catalog.platforms.map((item) => (
                <ServiceRow key={item.id} {...item} />
              ))}
            </Panel>
          </div>

          {/* Issues strip */}
          <div className="shrink-0 border-t border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <p className="text-xs font-semibold">
                Issues
                <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                  {catalog.issues.length}
                </span>
              </p>
            </div>
            {catalog.issues.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-emerald-700">All checked services healthy.</p>
            ) : (
              <ul className="max-h-28 divide-y divide-border overflow-y-auto">
                {catalog.issues.map((item) => {
                  const s = statusMeta(item.status);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
                      <span className="font-semibold">{item.title}</span>
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {item.error || item.description || item.meta || ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default SystemHealth;
