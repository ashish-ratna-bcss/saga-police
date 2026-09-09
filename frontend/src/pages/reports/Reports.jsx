/**
 * Formal Reports — master–detail full-bleed workspace.
 * Data: GET /api/reports
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  FileText,
  Search,
  Download,
  Eye,
  Calendar,
  User,
  Hash,
  RefreshCw,
  X,
  Copy,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';

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

const Reports = () => {
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
      const response = await api.get('/reports');
      setReports(Array.isArray(response.data) ? response.data : response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      setReports([]);
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        (error.response?.status
          ? `Server error (${error.response.status})`
          : 'Could not reach the reports API');
      setLoadError(msg);
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

  // Auto-select first filtered row when selection missing / filtered out.
  useEffect(() => {
    if (filteredReports.length === 0) {
      setSelectedId(null);
      return;
    }
    const stillVisible = filteredReports.some((r) => r.id === selectedId);
    if (!stillVisible) {
      setSelectedId(filteredReports[0].id);
    }
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
    const statusEntries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    return {
      total: reports.length,
      platforms: platformsInData.length,
      latest: latest ? new Date(latest) : null,
      shown: filteredReports.length,
      statusEntries,
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
    <div className="flex h-full min-h-0 w-full flex-col bg-background" data-testid="reports-page">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none tracking-tight">Reports</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Grievance catalog reports · G / S / C / Q
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{kpis.shown}</span>
            <span>shown</span>
            {kpis.shown !== kpis.total ? (
              <span className="text-muted-foreground">/ {kpis.total}</span>
            ) : null}
          </span>

          <div className="relative w-[160px] sm:w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
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
                title={p}
                onClick={() => setPlatformFilter(p)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold capitalize',
                  platformFilter === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <PlatformBrandIcon
                  platform={p}
                  className="h-3 w-3"
                  colored={platformFilter !== p}
                />
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
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid shrink-0 grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total
            </p>
            <p className="text-lg font-bold tabular-nums leading-none">{kpis.total}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1 bg-card px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            By status
          </p>
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
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Platforms
            </p>
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

      {/* Body */}
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
          <div>
            <p className="text-sm font-semibold">Reports could not load</p>
            <p className="mt-2 max-w-md text-[11px] text-amber-800/90">{loadError}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={fetchReports}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link to="/system-health">Check Health</Link>
            </Button>
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <FileText className="h-9 w-9 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-semibold">No reports yet</p>
            <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
              Reports come from Grievances (grievance / suggestion / criticism / query). Create one
              there and it will show here.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link to="/grievances">
                <AlertTriangle className="h-3.5 w-3.5" />
                Open Grievances
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={fetchReports}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:divide-x lg:divide-y-0">
          {/* List */}
          <section className="flex min-h-0 flex-col bg-card">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reports
              </p>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {filteredReports.length}
              </span>
            </header>
            {filteredReports.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-sm text-muted-foreground">
                No reports match this filter.
              </div>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {filteredReports.map((report) => {
                  const active = report.id === selectedId;
                  const handle = (report.target_user_details?.handle || '').replace(/^@/, '');
                  return (
                    <li key={report.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(report.id)}
                        className={cn(
                          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent hover:bg-muted/40'
                        )}
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                          {report.target_user_details?.avatar_url ? (
                            <img
                              src={report.target_user_details.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="min-w-0 truncate text-xs font-semibold">
                              {report.target_user_details?.name || 'Unknown'}
                            </p>
                            <PlatformBrandIcon
                              platform={report.platform}
                              className="h-3 w-3 shrink-0"
                            />
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {report.serial_number || '—'}
                            {handle ? ` · @${handle}` : ''}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            {report.report_type ? (
                              <span className="rounded border border-border bg-muted/50 px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
                                {report.report_type}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded border px-1 py-px text-[9px] font-semibold uppercase',
                                statusChip(report.status)
                              )}
                            >
                              {report.status || '—'}
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {report.generated_at
                                ? new Date(report.generated_at).toLocaleDateString()
                                : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Detail */}
          <section className="flex min-h-0 flex-col overflow-y-auto bg-card">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <Eye className="h-8 w-8 text-muted-foreground/35" />
                <p className="text-sm font-medium text-muted-foreground">Select a report</p>
                <p className="max-w-xs text-[12px] text-muted-foreground">
                  Choose a notice from the list to preview details and export PDF.
                </p>
              </div>
            ) : (
              <>
                <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                      {selected.target_user_details?.avatar_url ? (
                        <img
                          src={selected.target_user_details.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold leading-tight">
                        {selected.target_user_details?.name || 'Unknown'}
                      </h2>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        @
                        {(selected.target_user_details?.handle || '').replace(/^@/, '') || '—'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
                          <PlatformBrandIcon
                            platform={selected.platform}
                            className="h-3.5 w-3.5"
                          />
                          {selected.platform || '—'}
                        </span>
                        <span
                          className={cn(
                            'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                            statusChip(selected.status)
                          )}
                        >
                          {selected.status || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
                      <Link to="/grievances">
                        <Eye className="h-3.5 w-3.5" />
                        Open in Grievances
                      </Link>
                    </Button>
                    {selected.post_link ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                        <a href={selected.post_link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Post
                        </a>
                      </Button>
                    ) : null}
                    {selected.report_pdf_url ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                        <a href={selected.report_pdf_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </header>

                <div className="grid gap-0 sm:grid-cols-2">
                  <div className="border-b border-border px-4 py-3 sm:border-r">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Serial number
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="font-mono text-sm font-semibold">
                        {selected.serial_number || '—'}
                      </p>
                      {selected.serial_number ? (
                        <button
                          type="button"
                          onClick={copySerial}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Copy serial"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Generated
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatWhen(selected.generated_at)}
                    </p>
                  </div>
                  <div className="border-b border-border px-4 py-3 sm:border-r sm:border-b-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Type / grievance
                    </p>
                    <p className="mt-1 text-sm capitalize">
                      {selected.report_type || '—'}
                      {selected.grievance_id ? (
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          · #{selected.grievance_id}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Report id
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {selected.id || '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-auto border-t border-border px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    Source table: <code className="text-[10px]">social_media_grievance_reports</code>.
                    Manage workflow status and sharing from Grievances → Reports.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Reports;
