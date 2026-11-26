/**
 * Reports — previous master–detail workspace with module tabs.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarDays,
  Clock3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Hash,
  HelpCircle,
  LayoutPanelTop,
  RefreshCw,
  Search,
  User,
  X,
  Zap,
} from 'lucide-react';
import api from '../../lib/api';
import { toApiFilesUrl } from '../../utils/fileUrl';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import ReportsContent from '../../components/ReportsContent';
import GrievanceWorkflowReports from '../../components/grievances/GrievanceWorkflowReports';
import SuggestionReports from '../../components/grievances/SuggestionReports';
import CriticismReports from '../../components/grievances/CriticismReports';
import QueryReports from '../../components/grievances/QueryReports';
import EventsReport from '../events/EventsReport';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { cn } from '../../lib/utils';

const TABS = [
  { key: 'catalog', label: 'All Formal', icon: LayoutPanelTop },
  { key: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { key: 'grievance', label: 'Grievance', icon: FileText },
  { key: 'suggestion', label: 'Suggestion', icon: Building2 },
  { key: 'criticism', label: 'Criticism', icon: Zap },
  { key: 'query', label: 'Query', icon: HelpCircle },
  { key: 'events', label: 'Events', icon: CalendarDays },
];

const INITIAL_COUNTS = {
  alerts: null,
  grievance: null,
  suggestion: null,
  criticism: null,
  query: null,
  catalog: null,
  events: null,
};

const parseCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const statusChip = (status) => {
  const s = String(status || '').toLowerCase();
  if (['completed', 'generated', 'ready', 'final', 'printed', 'sent', 'closed'].includes(s)) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (['draft', 'pending', 'awaiting_reply', 'sent_to_intermediary'].includes(s)) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-muted text-muted-foreground border-border';
};

const formatWhen = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

const CATALOG_SOURCES = [
  { key: 'alerts', url: '/reports', tab: 'alerts', label: 'Open in Alerts' },
  { key: 'grievance', url: '/grievance-workflow/reports', tab: 'grievance', label: 'Manage in Grievances' },
  { key: 'suggestion', url: '/suggestion/reports', tab: 'suggestion', label: 'Open Suggestions' },
  { key: 'criticism', url: '/criticism/reports', tab: 'criticism', label: 'Open Criticism' },
  { key: 'query', url: '/query-workflow/reports', tab: 'query', label: 'Open Queries' },
];

/** Normalize alert notice or G/S/C/Q row into one catalog shape. */
const toCatalogReport = (row, sourceKey) => {
  if (!row) return null;
  const posted = row.posted_by || {};
  const target = row.target_user_details || {
    name: posted.display_name || posted.name || row.profile_id || 'Unknown',
    handle: posted.handle || row.profile_id || '',
    profile_url: row.profile_link || posted.profile_url || '',
    avatar_url: posted.profile_image_url || posted.avatar_url || '',
  };
  const reportType =
    sourceKey === 'alerts'
      ? row.report_type || 'alert_notice'
      : row.report_type || sourceKey;
  const status = String(row.status || 'pending').toLowerCase();
  const id = String(row.id || row.unique_code || `${sourceKey}-${row.serial_number || Math.random()}`);
  return {
    ...row,
    id: `${sourceKey}:${id}`,
    source_key: sourceKey,
    serial_number: row.serial_number || row.unique_code || null,
    unique_code: row.unique_code || row.serial_number || null,
    report_type: reportType,
    platform: row.platform || '—',
    status,
    target_user_details: target,
    content_summary: row.content_summary || row.post_description || row.message || '',
    generated_at: row.generated_at || row.created_at || row.shared_at || null,
    report_pdf_url: row.report_pdf_url || null,
    alert_id: row.alert_id || null,
  };
};

const extractReportList = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.data)) return data.data;
  return [];
};

/** Master–detail browse of all formal reports (alerts + G / S / C / Q). */
const FormalReportsCatalog = () => {
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get('search') || searchParams.get('handle') || ''
  );
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.allSettled(
        CATALOG_SOURCES.map((src) =>
          api.get(src.url, { params: { page: 1, limit: 500 } })
        )
      );
      const merged = [];
      let failed = 0;
      results.forEach((result, idx) => {
        const src = CATALOG_SOURCES[idx];
        if (result.status !== 'fulfilled') {
          failed += 1;
          return;
        }
        extractReportList(result.value?.data).forEach((row) => {
          const normalized = toCatalogReport(row, src.key);
          if (normalized) merged.push(normalized);
        });
      });
      merged.sort((a, b) => {
        const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0;
        const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0;
        return tb - ta;
      });
      setReports(merged);
      if (failed === CATALOG_SOURCES.length) {
        setLoadError('Could not reach the reports APIs');
        toast.error('Failed to load reports');
      } else if (failed > 0) {
        toast.error(`Some report sources failed (${failed})`);
      }
    } catch (error) {
      console.error('Failed to fetch catalog reports:', error);
      setReports([]);
      setLoadError(error.message || 'Could not reach the reports API');
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const platformsInData = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      const p = String(r.platform || '').toLowerCase().trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      const platform = String(r.platform || '').toLowerCase();
      if (platformFilter !== 'all' && platform !== platformFilter) return false;
      if (!q) return true;
      return (
        r.serial_number?.toLowerCase().includes(q) ||
        r.unique_code?.toLowerCase().includes(q) ||
        r.report_type?.toLowerCase().includes(q) ||
        r.target_user_details?.name?.toLowerCase().includes(q) ||
        r.target_user_details?.handle?.toLowerCase().includes(q) ||
        r.content_summary?.toLowerCase().includes(q)
      );
    });
  }, [reports, searchQuery, platformFilter]);

  useEffect(() => {
    if (filteredReports.length === 0) {
      setSelectedId(null);
      return;
    }
    const stillVisible = filteredReports.some((r) => r.id === selectedId);
    if (!stillVisible) setSelectedId(filteredReports[0].id);
  }, [filteredReports, selectedId]);

  const selected = useMemo(
    () => filteredReports.find((r) => r.id === selectedId) || null,
    [filteredReports, selectedId]
  );

  const kpis = useMemo(() => {
    const byStatus = {};
    let latest = null;
    reports.forEach((r) => {
      const key = String(r.status || 'unknown').toLowerCase();
      byStatus[key] = (byStatus[key] || 0) + 1;
      const t = r.generated_at ? new Date(r.generated_at).getTime() : 0;
      if (t && (!latest || t > latest)) latest = t;
    });
    return {
      total: reports.length,
      platforms: platformsInData.length,
      latest: latest ? new Date(latest) : null,
      shown: filteredReports.length,
      statusEntries: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
    };
  }, [reports, platformsInData.length, filteredReports.length]);

  const copySerial = async () => {
    const sn = selected?.serial_number;
    if (!sn) return;
    try {
      await navigator.clipboard.writeText(String(sn));
      toast.success('Serial copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="grid shrink-0 grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-lg font-bold tabular-nums leading-none">{kpis.total}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1 bg-card px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">By status</p>
          {kpis.statusEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {kpis.statusEntries.slice(0, 4).map(([status, count]) => (
                <span
                  key={status}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                    statusChip(status)
                  )}
                >
                  {status}
                  <span className="tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
          <Hash className="h-3.5 w-3.5 shrink-0 text-sky-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Platforms</p>
            <p className="text-lg font-bold tabular-nums leading-none">{kpis.platforms}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Latest generated
            </p>
            <p className="truncate text-sm font-semibold tabular-nums leading-tight">
              {kpis.latest ? kpis.latest.toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative w-[180px] sm:w-52">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-keyboard
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="SN, user, handle…"
            className="h-7 pl-8 pr-7 text-xs"
          />
          {searchQuery ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setPlatformFilter('all')}
            className={cn(
              'rounded px-2 py-1 text-[11px] font-semibold',
              platformFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {platformsInData.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatformFilter(p)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold capitalize',
                platformFilter === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <PlatformBrandIcon platform={p} className="h-3 w-3" colored={platformFilter !== p} />
              <span className="hidden sm:inline">{p}</span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={fetchReports}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {kpis.shown} shown
          {kpis.shown !== kpis.total ? ` / ${kpis.total}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:divide-x lg:divide-y-0">
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="h-20 animate-pulse rounded-md bg-muted/50" />
            <div className="h-10 w-1/2 animate-pulse rounded-md bg-muted/40" />
            <div className="h-24 animate-pulse rounded-md bg-muted/40" />
          </div>
        </div>
      ) : loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={fetchReports}>
            Retry
          </Button>
        </div>
      ) : !reports.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <FileText className="h-9 w-9 text-muted-foreground" />
          <p className="text-sm font-medium">No formal reports yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Generate an alert notice, or create G / S / C / Q reports from Grievances — they all appear here.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/alerts?status=escalated">Open Escalated Alerts</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/grievances">Open Grievances</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:divide-x lg:divide-y-0">
          <div className="overflow-y-auto">
            <ul className="divide-y divide-border">
              {filteredReports.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-muted/40',
                      selectedId === r.id && 'bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {r.serial_number || r.unique_code || 'Untitled'}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                          statusChip(r.status)
                        )}
                      >
                        {r.status || '—'}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.report_type || 'report'} · {r.platform || '—'} ·{' '}
                      {r.target_user_details?.handle || r.target_user_details?.name || '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-y-auto p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a report</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">
                      {selected.serial_number || selected.unique_code || 'Report'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.report_type || 'report'} · {formatWhen(selected.generated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.serial_number ? (
                      <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={copySerial}>
                        <Copy className="h-3 w-3" />
                        Copy SN
                      </Button>
                    ) : null}
                    {selected.report_pdf_url ? (
                      <Button asChild variant="outline" size="sm" className="h-7 gap-1">
                        <a href={toApiFilesUrl(selected.report_pdf_url)} target="_blank" rel="noreferrer">
                          <Download className="h-3 w-3" />
                          PDF
                        </a>
                      </Button>
                    ) : null}
                    {(() => {
                      const src = CATALOG_SOURCES.find((s) => s.key === selected.source_key);
                      const href =
                        selected.source_key === 'alerts' && selected.alert_id
                          ? `/reports/generate/${selected.alert_id}`
                          : `/reports?tab=${src?.tab || 'catalog'}`;
                      const label =
                        selected.source_key === 'alerts'
                          ? 'Open notice'
                          : src?.label || 'Open module';
                      return (
                        <Button asChild variant="outline" size="sm" className="h-7 gap-1">
                          <Link to={href}>
                            <ExternalLink className="h-3 w-3" />
                            {label}
                          </Link>
                        </Button>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border px-3 py-2 text-xs">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" /> Target
                    </p>
                    <p className="mt-0.5 font-medium">
                      {selected.target_user_details?.name || '—'}
                      {selected.target_user_details?.handle
                        ? ` (@${selected.target_user_details.handle})`
                        : ''}
                    </p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2 text-xs">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Hash className="h-3 w-3" /> Platform
                    </p>
                    <p className="mt-0.5 font-medium capitalize">{selected.platform || '—'}</p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2 text-xs sm:col-span-2">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Eye className="h-3 w-3" /> Summary
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">
                      {selected.content_summary || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2 text-xs sm:col-span-2">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" /> Generated
                    </p>
                    <p className="mt-0.5 font-medium">{formatWhen(selected.generated_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TabPanel = ({ children }) => (
  <div className="min-h-0 flex-1 overflow-auto rounded-b-lg border border-t-0 border-border bg-card">
    {children}
  </div>
);

const Reports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : searchParams.get('module') && TABS.some((t) => t.key === searchParams.get('module'))
      ? searchParams.get('module')
      : 'catalog';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [counts, setCounts] = useState(INITIAL_COUNTS);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const fetchCounts = useCallback(async () => {
    setLoadingCounts(true);
    const results = await Promise.allSettled([
      api.get('/reports/stats'),
      api.get('/grievance-workflow/reports', { params: { page: 1, limit: 1 } }),
      api.get('/suggestion/reports', { params: { page: 1, limit: 1 } }),
      api.get('/criticism/reports', { params: { page: 1, limit: 1 } }),
      api.get('/query-workflow/reports', { params: { page: 1, limit: 1 } }),
      api.get('/reports'),
      api.get('/events'),
    ]);

    const next = { ...INITIAL_COUNTS };
    if (results[0].status === 'fulfilled') {
      const data = results[0].value?.data || {};
      next.alerts = parseCount(data?.totals?.total ?? data?.byPlatform?.all?.total);
    }
    if (results[1].status === 'fulfilled') {
      const data = results[1].value?.data || {};
      next.grievance = parseCount(data?.stats?.total ?? data?.pagination?.total);
    }
    if (results[2].status === 'fulfilled') {
      const data = results[2].value?.data || {};
      next.suggestion = parseCount(data?.pagination?.total ?? data?.stats?.total);
    }
    if (results[3].status === 'fulfilled') {
      const data = results[3].value?.data || {};
      next.criticism = parseCount(data?.pagination?.total ?? data?.stats?.total);
    }
    if (results[4].status === 'fulfilled') {
      const data = results[4].value?.data || {};
      next.query = parseCount(data?.pagination?.total ?? data?.stats?.total);
    }
    // All Formal = alerts + G + S + C + Q (not events)
    const parts = [next.alerts, next.grievance, next.suggestion, next.criticism, next.query].filter(
      (n) => n != null
    );
    next.catalog = parts.length ? parts.reduce((sum, n) => sum + n, 0) : null;

    if (results[6].status === 'fulfilled') {
      const data = results[6].value?.data;
      next.events = parseCount(Array.isArray(data) ? data.length : data?.total);
    }

    setCounts(next);
    setLoadingCounts(false);
    setLastUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const onTabChange = (value) => {
    setActiveTab(value);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        next.delete('module');
        return next;
      },
      { replace: true }
    );
  };

  const formatCount = (key) => {
    if (loadingCounts) return '…';
    if (counts[key] == null) return null;
    return counts[key].toLocaleString();
  };

  return (
    <div
      className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] w-full flex-col bg-background"
      data-testid="reports-page"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none tracking-tight">Reports</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Module reports · G / S / C / Q · Alerts · Events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={fetchCounts}
            disabled={loadingCounts}
          >
            <RefreshCw className={cn('h-3 w-3', loadingCounts && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b border-border bg-card px-2 py-1.5">
          <TabsList className="h-auto w-max justify-start gap-0.5 bg-transparent p-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const count = formatCount(tab.key);
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {count != null ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                      {count}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="catalog" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="flex h-full min-h-[420px] flex-col">
              <FormalReportsCatalog />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="alerts" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <ReportsContent />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="grievance" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <GrievanceWorkflowReports />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="suggestion" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <SuggestionReports />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="criticism" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <CriticismReports />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="query" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <QueryReports />
            </div>
          </TabPanel>
        </TabsContent>
        <TabsContent value="events" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <TabPanel>
            <div className="p-3">
              <EventsReport />
            </div>
          </TabPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
