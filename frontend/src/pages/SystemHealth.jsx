/**
 * System Health — dense full-width status board (matches Alerts / Settings).
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
} from 'lucide-react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

const XLogo = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const statusMeta = (status) => {
  if (status === 'online' || status === 'active' || status === 'ok') {
    return {
      label: status === 'active' ? 'Active' : status === 'ok' ? 'OK' : 'Online',
      tone: 'ok',
      chip: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      dot: 'bg-emerald-500',
    };
  }
  if (status === 'quota_completed' || status === 'degraded') {
    return {
      label: status === 'degraded' ? 'Degraded' : 'Quota',
      tone: 'warn',
      chip: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      dot: 'bg-amber-500',
    };
  }
  return {
    label: 'Offline',
    tone: 'bad',
    chip: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  };
};

const getApiStatus = (quotaData) => {
  if (!quotaData) return { status: 'offline', message: 'No data from backend.' };
  if (quotaData.available === false) return { status: 'offline', message: 'API keys exhausted or invalid.' };
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

const StatusTile = ({ title, description, status, icon: Icon, latency, meta }) => {
  const s = statusMeta(status);
  return (
    <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 min-h-[108px]">
      <div className="flex items-start justify-between gap-2">
        <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            s.chip
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{description}</p>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
        <span>{latency != null && (status === 'online' || status === 'active') ? `${latency} ms` : '—'}</span>
        {meta ? <span className="truncate">{meta}</span> : null}
      </div>
    </div>
  );
};

const Section = ({ title, icon: Icon, children, count }) => (
  <section className="rounded-xl border border-border bg-card overflow-hidden w-full">
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold leading-none">{title}</h2>
      </div>
      {count != null && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
      )}
    </div>
    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
      {children}
    </div>
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

  const summary = useMemo(() => {
    if (!healthData) return { ok: 0, warn: 0, bad: 0, total: 0 };
    const items = [];
    if (healthData.postgres) items.push(healthData.postgres.status);
    const svc = healthData.services || {};
    ['ollama', 'sentiment', 'mediaAnalyzer', 'ragApi'].forEach((k) => {
      if (svc[k]) items.push(svc[k].status);
    });
    ['instagram', 'facebook', 'x', 'youtube'].forEach((k) => {
      items.push(getApiStatus(healthData.quotas?.[k]).status);
    });

    let ok = 0;
    let warn = 0;
    let bad = 0;
    items.forEach((st) => {
      const t = statusMeta(st).tone;
      if (t === 'ok') ok += 1;
      else if (t === 'warn') warn += 1;
      else bad += 1;
    });
    return { ok, warn, bad, total: items.length };
  }, [healthData]);

  if (error && !healthData) {
    return (
      <div className="w-full space-y-3" data-testid="system-health-page">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold tracking-tight leading-none">System Health</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Services, databases, and API quotas</p>
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-8 flex flex-col items-center text-center">
          <ShieldAlert className="h-8 w-8 text-red-500 mb-2" />
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Connection error</h2>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1 mb-4 max-w-sm">{error}</p>
          <Button size="sm" className="h-8 text-xs" onClick={() => fetchHealth(true)}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isRefreshing && 'animate-spin')} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const pg = healthData?.postgres;

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-300" data-testid="system-health-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">System Health</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Live status of databases, AI services, and platform APIs
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {healthData && (
            <>
              <span className="inline-flex items-baseline gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                <span className="tabular-nums font-semibold">{summary.ok}</span>
                <span>ok</span>
              </span>
              {summary.warn > 0 && (
                <span className="inline-flex items-baseline gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                  <span className="tabular-nums font-semibold">{summary.warn}</span>
                  <span>warn</span>
                </span>
              )}
              {summary.bad > 0 && (
                <span className="inline-flex items-baseline gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                  <span className="tabular-nums font-semibold">{summary.bad}</span>
                  <span>down</span>
                </span>
              )}
              {lastChecked && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                  <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                  {lastChecked.toLocaleTimeString()}
                </span>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={loading || isRefreshing}
            onClick={() => fetchHealth(true)}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (loading || isRefreshing) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !healthData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-[108px] rounded-lg border border-border bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : healthData ? (
        <div className="space-y-3 w-full">
          <Section title="Infrastructure" icon={Database} count="1 store">
            {pg && (
              <StatusTile
                title="PostgreSQL"
                description="Primary catalog — profiles, events, alerts, settings"
                status={pg.status}
                icon={Database}
                latency={pg.latency}
              />
            )}
          </Section>

          <Section title="AI services" icon={Brain} count="4 services">
            <StatusTile
              title="BCSS LLM"
              description="Local language model — risk scoring"
              status={healthData.services?.ollama?.status}
              icon={Brain}
              latency={healthData.services?.ollama?.latency}
            />
            <StatusTile
              title="Custom Sentiment"
              description="Multi-lingual emotion detection"
              status={healthData.services?.sentiment?.status}
              icon={Activity}
              latency={healthData.services?.sentiment?.latency}
            />
            <StatusTile
              title="Media Analyzer"
              description="Image & video OCR pipeline"
              status={healthData.services?.mediaAnalyzer?.status}
              icon={Zap}
              latency={healthData.services?.mediaAnalyzer?.latency}
            />
            <StatusTile
              title="RAG API"
              description="Vector retrieval for investigations"
              status={healthData.services?.ragApi?.status}
              icon={Database}
              latency={healthData.services?.ragApi?.latency}
            />
          </Section>

          <Section
            title="Platform APIs"
            icon={Activity}
            count={
              healthData.quotas?.totalOverallCalls != null
                ? `${healthData.quotas.totalOverallCalls} calls tracked`
                : '4 platforms'
            }
          >
            <StatusTile
              title="Instagram"
              description={getApiStatus(healthData.quotas?.instagram).message}
              status={getApiStatus(healthData.quotas?.instagram).status}
              icon={Instagram}
              meta={formatQuota(healthData.quotas?.instagram)}
            />
            <StatusTile
              title="Facebook"
              description={getApiStatus(healthData.quotas?.facebook).message}
              status={getApiStatus(healthData.quotas?.facebook).status}
              icon={Facebook}
              meta={formatQuota(healthData.quotas?.facebook)}
            />
            <StatusTile
              title="X"
              description={getApiStatus(healthData.quotas?.x).message}
              status={getApiStatus(healthData.quotas?.x).status}
              icon={XLogo}
              meta={formatQuota(healthData.quotas?.x)}
            />
            <StatusTile
              title="YouTube"
              description={getApiStatus(healthData.quotas?.youtube).message}
              status={getApiStatus(healthData.quotas?.youtube).status}
              icon={Youtube}
              meta={formatQuota(healthData.quotas?.youtube)}
            />
          </Section>
        </div>
      ) : null}
    </div>
  );
};

export default SystemHealth;
