/**
 * System Health in exactly three layers: Infrastructure, AI services and Platforms.
 * Each layer shows its own status, one line on what it does, and only the services that are running.
 * Offline services are simply not listed.
 * Polls GET /api/health/status.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity,
  Database,
  Brain,
  RefreshCw,
  ShieldAlert,
  Zap,
  Circle,
  Globe,
  Network,
} from 'lucide-react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';

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

/**
 * BluGate's /health and /billing responses aren't documented with a fixed shape
 * (blugateapis/global-blugate-documentation.json gives no example body), so this
 * normalizes whatever comes back — an array of platform entries, or an object keyed
 * by platform name — into a flat list the panel can render generically.
 */
const normalizeBlugateEntries = (data) => {
  if (!data) return [];
  const source = Array.isArray(data) ? data : data.platforms || data.items || data.data || data;
  if (Array.isArray(source)) {
    return source.map((entry, idx) => {
      if (entry && typeof entry === 'object') {
        const name = entry.platform || entry.name || entry.id || `Item ${idx + 1}`;
        const { platform, name: _n, id, ...rest } = entry;
        return { name, ...rest };
      }
      return { name: `Item ${idx + 1}`, value: entry };
    });
  }
  if (source && typeof source === 'object') {
    return Object.entries(source)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key, value]) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? { name: key, ...value }
          : { name: key, value }
      );
  }
  return [];
};

const BLUGATE_STATUS_KEYS = ['status', 'state', 'health'];

const BlugateEntryRow = ({ name, ...fields }) => {
  const statusKey = BLUGATE_STATUS_KEYS.find((k) => fields[k] != null);
  const status = statusKey ? String(fields[statusKey]).toLowerCase() : null;
  const s = status ? statusMeta(status) : null;
  const rest = Object.entries(fields).filter(([k]) => k !== statusKey);
  const summary = rest.length
    ? rest
        .map(([k, v]) => `${k}: ${v && typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ')
    : null;
  return (
    <div className="flex items-center gap-3 border-l-[3px] border-l-border/40 bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold capitalize">{name}</p>
        {summary ? (
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{summary}</p>
        ) : null}
      </div>
      {s ? (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            s.chip
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
      ) : null}
    </div>
  );
};

const okLike = (s) => s === 'online' || s === 'ok' || s === 'active';
const asStatus = (s) => (okLike(s) ? 'online' : s === 'degraded' || s === 'quota_completed' ? 'degraded' : 'offline');

/**
 * One row per platform BluGate lists. Telegram and Reddit are checked against the services that really
 * serve them (Reddit is not part of BluGate for this account), so their state is the real one.
 */
const buildPlatforms = (svc) => {
  const listed = Array.isArray(svc.blugate?.health?.platforms) ? svc.blugate.health.platforms : [];
  const items = listed.map((p) => {
    const slug = String(p.slug || p.name || '').toLowerCase();
    const granted = p.accessGranted !== false;
    const health = String(p.health || p.status || '').toLowerCase();
    return {
      slug,
      name: p.name || slug,
      status: !granted ? 'noaccess' : asStatus(health === 'operational' ? 'online' : health),
      note: !granted
        ? 'Not included in your BluGate plan'
        : [p.health ? `Health: ${p.health}` : null, p.endpointCount != null ? `${p.endpointCount} endpoints` : null].filter(Boolean).join(' · '),
      latency: null,
    };
  });
  const upsert = (slug, patch) => {
    const i = items.findIndex((x) => x.slug === slug);
    if (i >= 0) items[i] = { ...items[i], ...patch };
    else items.push({ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), ...patch });
  };
  if (svc.telegram) {
    const t = svc.telegram;
    upsert('telegram', {
      status: asStatus(t.status),
      latency: t.latency,
      note: t.error ? String(t.error) : t.connected || t.authorized ? 'Service up. Session connected' : 'Service up. Session not signed in',
    });
  }
  if (svc.reddit) {
    const r = svc.reddit;
    upsert('reddit', {
      status: asStatus(r.status),
      latency: r.latency,
      note: r.error ? String(r.error) : r.mode === 'login' ? 'Signed in to Reddit' : 'Public feed only. About 1 search per minute, shared',
    });
  }
  const rank = { online: 0, degraded: 1, offline: 2, noaccess: 3 };
  return items.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
};

const PlatformRow = ({ p }) => {
  const dim = p.status === 'noaccess';
  const s = dim ? null : statusMeta(p.status);
  return (
    <div className={cn('flex min-h-[56px] items-center gap-3 border-l-[3px] bg-card px-3 py-2', dim ? 'border-l-border/40' : s.row)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
        <PlatformBrandIcon platform={p.slug} className={cn('h-4 w-4', dim && 'opacity-50')} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={cn('truncate text-sm font-semibold leading-tight', dim && 'text-muted-foreground')}>{p.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">{p.note}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            dim ? 'border-border bg-muted/40 text-muted-foreground' : s.chip
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', dim ? 'bg-muted-foreground/50' : s.dot)} />
          {dim ? 'No access' : s.label}
        </span>
        {p.latency != null && p.status === 'online' ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">{p.latency} ms</span>
        ) : null}
      </div>
    </div>
  );
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

const Panel = ({ n, title, desc, icon: Icon, tone, count, notice, children, className }) => (
  <section className={cn('flex min-h-0 flex-col bg-card', className)}>
    <header className="shrink-0 space-y-1.5 border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{n}</span>
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
        </div>
        <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase', toneChip(tone))}>
          {toneLabel(tone)}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {desc}
        {count != null ? <span className="ml-1 tabular-nums">· {count}</span> : null}
      </p>
    </header>
    {notice ? <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-800">{notice}</div> : null}
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
        blugate: { summary: null },
        usableCount: 0,
        groups: { infra: 'ok', ai: 'ok', platforms: 'ok' },
        llmDown: false,
      };
    }

    const pg = healthData.postgres;
    const svc = healthData.services || {};

    // Services that are offline are not listed (only named in a note), so the page shows what works today.
    const shownOnly = (list) => list.filter((i) => statusMeta(i.status).tone !== 'bad');

    const infraAll = [
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

    const aiAll = [
      {
        id: 'ollama',
        title: 'BCSS LLM',
        description: 'Local language model — risk scoring',
        status: svc.ollama?.status || 'offline',
        icon: Brain,
        latency: svc.ollama?.latency,
        error: svc.ollama?.error,
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
    ];

    const infra = shownOnly(infraAll);
    const ai = shownOnly(aiAll);

    // BluGate global client-account status, then one row per platform.
    const bg = svc.blugate || {};
    const blugateSummary = {
      id: 'blugate',
      title: 'BluGate Gateway',
      description: bg.health?.client?.name
        ? `${bg.health.client.name} · client account & platform gateway`
        : 'Client account & platform gateway health',
      status: bg.status || 'offline',
      icon: Network,
      latency: bg.latency,
      error: bg.error,
    };
    const platforms = buildPlatforms(svc);
    const usable = platforms.filter((p) => p.status !== 'noaccess');

    const groupTone = (list) => worstTone(list.map((i) => statusMeta(i.status).tone));

    // Alert analysis needs the sentiment service. The LLM is optional, so it does not raise this banner.
    const llmDown = statusMeta(svc.sentiment?.status || 'offline').tone === 'bad';

    return {
      infra,
      ai,
      platforms,
      blugate: { summary: blugateSummary },
      groups: {
        infra: groupTone(infra.length ? infra : [{ status: 'online' }]),
        ai: groupTone(ai.length ? ai : [{ status: 'online' }]),
        platforms: groupTone([blugateSummary, ...usable]),
      },
      usableCount: usable.length,
      llmDown,
      sentimentError: svc.sentiment?.error,
      ollamaError: null,
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
            Three layers: infrastructure, AI services and platforms
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {healthData ? (
            <>
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
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <Panel n={1} title="Infrastructure" icon={Database} tone={catalog.groups.infra}
              desc="Where your data is stored" count={`${catalog.infra.length} running`}>
              {catalog.infra.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">Nothing running in this layer.</p>
              ) : (
                catalog.infra.map((item) => <ServiceRow key={item.id} {...item} />)
              )}
            </Panel>
            <Panel n={2} title="AI services" icon={Brain} tone={catalog.groups.ai}
              desc="What analyses posts and images" count={`${catalog.ai.length} running`}
              notice={catalog.llmDown ? 'Sentiment analysis is offline. New posts will not raise risk alerts until it is back.' : null}>
              {catalog.ai.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">Nothing running in this layer.</p>
              ) : (
                catalog.ai.map((item) => <ServiceRow key={item.id} {...item} />)
              )}
            </Panel>
            <Panel n={3} title="Platforms" icon={Network} tone={catalog.groups.platforms}
              desc="Where the posts come from" count={`${catalog.usableCount} of ${catalog.platforms.length} available`}>
              {catalog.blugate.summary ? <ServiceRow {...catalog.blugate.summary} /> : null}
              {catalog.platforms.map((p) => (
                <PlatformRow key={p.slug} p={p} />
              ))}
              {catalog.blugate.summary?.status !== 'online' && catalog.platforms.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                  No platform data yet. Connect BluGate under Settings &gt; Platforms.
                </p>
              ) : null}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default SystemHealth;
