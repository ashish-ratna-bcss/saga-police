import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { toast } from 'sonner';
import {
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  Eye,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  Shield,
  Lightbulb,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { CardContent } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import { PagePlatformSelectItems } from '../PagePlatformSelectItems';
import {
  XBrandLogo,
  FacebookBrandLogo,
  InstagramBrandLogo,
  TelegramBrandLogo,
  AllPlatformsLogo,
} from '../PlatformBrandIcon';
import { GrievanceWorkflowReports } from './GrievanceWorkflowReports';
import { SuggestionReports } from './SuggestionReports';
import { CriticismReports } from './CriticismReports';

const PAGE_SIZE = 50;
const FETCH_LIMIT = 250;

const platformIcons = {
  x: XBrandLogo,
  twitter: XBrandLogo,
  facebook: FacebookBrandLogo,
  instagram: InstagramBrandLogo,
  telegram: TelegramBrandLogo,
  default: AllPlatformsLogo,
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const normalizeG = (r) => ({
  key: `g-${r.id}`,
  module: 'grievance',
  moduleLabel: 'Grievance',
  moduleClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
  status: String(r.status || 'PENDING').toUpperCase(),
  unique_code: r.unique_code,
  post_date: r.post_date,
  phone: r.complaint_phone || '—',
  profile: r.posted_by?.display_name || r.profile_id || '—',
  handle: r.posted_by?.handle,
  platform: r.platform,
  post_link: r.post_link,
  description: r.post_description || r.final_communication || '—',
  category: r.category || '—',
  raw: r,
});

const normalizeS = (r) => ({
  key: `s-${r.id}`,
  module: 'suggestion',
  moduleLabel: 'Suggestion',
  moduleClass: 'bg-violet-500/10 text-violet-800 border-violet-500/30',
  status: String(r.status || 'PENDING').toUpperCase(),
  unique_code: r.unique_code,
  post_date: r.post_date,
  phone: '—',
  profile: r.posted_by?.display_name || r.profile_id || '—',
  handle: r.posted_by?.handle,
  platform: r.platform,
  post_link: r.post_link,
  description: r.suggestion_description || r.post_description || '—',
  category: r.category || '—',
  raw: r,
});

const normalizeC = (r) => {
  const closed = String(r.status || '').toUpperCase() === 'CLOSED' || Boolean(r.action_taken_at);
  return {
    key: `c-${r.id}`,
    module: 'criticism',
    moduleLabel: 'Criticism',
    moduleClass: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
    status: closed ? 'CLOSED' : 'PENDING',
    unique_code: r.unique_code,
    post_date: r.post_date,
    phone: '—',
    profile: r.posted_by?.display_name || r.profile_id || '—',
    handle: r.posted_by?.handle,
    platform: r.platform,
    post_link: r.post_link,
    description: r.criticism_description || r.post_description || '—',
    category: r.category || '—',
    raw: r,
  };
};

const statusBadge = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'CLOSED') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
  if (s === 'ESCALATED' || s === 'ESCALED') return 'bg-orange-500/10 text-orange-700 border-orange-500/30';
  if (s === 'FIR') return 'bg-rose-500/10 text-rose-700 border-rose-500/30';
  if (s === 'PENDING') return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const TYPE_TABS = [
  { id: 'all', label: 'All records', icon: Layers, countKey: null },
  { id: 'grievance', label: 'Grievance', icon: Shield, countKey: 'grievance' },
  { id: 'suggestion', label: 'Suggestion', icon: Lightbulb, countKey: 'suggestion' },
  { id: 'criticism', label: 'Criticism', icon: ShieldAlert, countKey: 'criticism' },
];

const rowAccent = {
  grievance: 'border-l-amber-500/80 hover:bg-amber-500/[0.04]',
  suggestion: 'border-l-violet-500/80 hover:bg-violet-500/[0.04]',
  criticism: 'border-l-rose-500/80 hover:bg-rose-500/[0.04]',
};

const actionBtnClass = {
  grievance: 'hover:bg-amber-100 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  suggestion: 'hover:bg-violet-100 dark:hover:bg-violet-950/40 text-violet-700 dark:text-violet-400',
  criticism: 'hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400',
};

export function GrievanceUnifiedReports({
  embedded = false,
  typeCounts = {},
  onGrievanceStatsUpdate,
  onReportCountsUpdate,
  openGReportCode = '',
  openSReportCode = '',
  openCReportCode = '',
  onGReportCodeHandled,
  onSReportCodeHandled,
  onCReportCodeHandled,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [quickRange, setQuickRange] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [detailModule, setDetailModule] = useState(null);
  const [detailCode, setDetailCode] = useState('');

  const onGrievanceStatsRef = useRef(onGrievanceStatsUpdate);
  const onReportCountsRef = useRef(onReportCountsUpdate);
  onGrievanceStatsRef.current = onGrievanceStatsUpdate;
  onReportCountsRef.current = onReportCountsUpdate;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (quickRange === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (quickRange === 'custom') return;
    const end = new Date();
    const start = new Date();
    if (quickRange === '24h') start.setDate(start.getDate() - 1);
    else if (quickRange === '7d') start.setDate(start.getDate() - 7);
    else if (quickRange === '30d') start.setDate(start.getDate() - 30);
    else if (quickRange === 'last_month') {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      end.setDate(0);
    }
    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setFromDate(fmt(start));
    setToDate(fmt(end));
    setPage(1);
  }, [quickRange]);

  const buildParams = useCallback(() => {
    const params = { page: 1, limit: FETCH_LIMIT, sort: 'post_date', order: 'desc' };
    if (platform !== 'all') params.platform = platform;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [platform, statusFilter, fromDate, toDate, debouncedSearch]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();

      const [gRes, sRes, cRes] = await Promise.all([
        api.get('/grievance-workflow/reports', { params }).catch(() => null),
        api.get('/suggestion/reports', { params }).catch(() => null),
        api.get('/criticism/reports', { params }).catch(() => null),
      ]);

      let merged = [];
      if (gRes?.data?.reports) merged = merged.concat(gRes.data.reports.map(normalizeG));
      if (sRes?.data?.reports) merged = merged.concat(sRes.data.reports.map(normalizeS));
      if (cRes?.data?.reports) merged = merged.concat(cRes.data.reports.map(normalizeC));

      setRows(merged);
      if (gRes?.data?.stats) onGrievanceStatsRef.current?.(gRes.data.stats);
      onReportCountsRef.current?.({
        grievance: Number(gRes?.data?.stats?.total ?? gRes?.data?.pagination?.total ?? 0),
        suggestion: Number(sRes?.data?.pagination?.total ?? 0),
        criticism: Number(cRes?.data?.pagination?.total ?? 0),
      });
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, platform, statusFilter, fromDate, toDate, debouncedSearch]);

  const filteredRows = useMemo(() => {
    let list = typeFilter === 'all' ? rows : rows.filter((r) => r.module === typeFilter);
    list = [...list].sort((a, b) => {
      const ta = new Date(a.post_date || 0).getTime();
      const tb = new Date(b.post_date || 0).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });
    return list;
  }, [rows, typeFilter, sortDir]);

  const total = filteredRows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const openDetail = (module, code) => {
    setDetailModule(module);
    setDetailCode(code);
  };

  useEffect(() => {
    if (openGReportCode) openDetail('grievance', openGReportCode);
  }, [openGReportCode]);
  useEffect(() => {
    if (openSReportCode) openDetail('suggestion', openSReportCode);
  }, [openSReportCode]);
  useEffect(() => {
    if (openCReportCode) openDetail('criticism', openCReportCode);
  }, [openCReportCode]);

  const notifyCodeHandled = useCallback(() => {
    onGReportCodeHandled?.();
    onSReportCodeHandled?.();
    onCReportCodeHandled?.();
  }, [onGReportCodeHandled, onSReportCodeHandled, onCReportCodeHandled]);

  const closeDetail = useCallback(() => {
    setDetailModule(null);
    setDetailCode('');
  }, []);

  const showInitialLoader = loading && rows.length === 0;
  const shellClass = embedded
    ? 'border-t border-border/80 bg-card'
    : 'rounded-xl border border-border bg-card overflow-hidden shadow-sm';

  const totalAllTypes = useMemo(() => {
    const g = Number(typeCounts.grievance ?? 0);
    const s = Number(typeCounts.suggestion ?? 0);
    const c = Number(typeCounts.criticism ?? 0);
    return g + s + c || rows.length;
  }, [typeCounts, rows.length]);

  return (
    <>
      <div className={shellClass}>
        <div className="flex flex-wrap gap-1.5 px-3 sm:px-3.5 pt-3 pb-2 border-b border-border/60 bg-muted/20">
          {TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = typeFilter === tab.id;
            const count =
              tab.countKey == null
                ? totalAllTypes
                : typeCounts[tab.countKey] == null
                  ? '…'
                  : Number(typeCounts[tab.countKey] || 0);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-xs'
                    : 'border-border/70 bg-background/80 text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                {tab.label}
                <span className={cn('tabular-nums text-[10px] font-bold rounded-full px-1.5 py-0.5', active ? 'bg-primary/15' : 'bg-muted')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-3.5 py-2.5 border-b border-border/80 bg-card/90 backdrop-blur-sm">
          <Select value={quickRange} onValueChange={setQuickRange}>
            <SelectTrigger className="h-8 w-[122px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {quickRange === 'custom' && (
            <div className="flex items-center gap-1.5 bg-background px-2 py-0.5 rounded-lg border border-border/80 shadow-xs text-xs">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-7 px-1 bg-transparent border-0 focus:outline-none font-medium"
              />
              <span className="text-muted-foreground font-semibold">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-7 px-1 bg-transparent border-0 focus:outline-none font-medium"
              />
            </div>
          )}
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="h-8 w-[122px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <PagePlatformSelectItems page="grievances" />
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[118px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ESCALATED">Escalated</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ID, citizen, description…"
              className="h-8 pl-8 text-xs bg-background rounded-lg shadow-xs border-border/80"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 shrink-0 rounded-lg bg-background shadow-xs"
            onClick={fetchRows}
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 rounded-lg bg-background shadow-xs font-semibold"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Date {sortDir === 'desc' ? '↓' : '↑'}
          </Button>
        </div>

        <CardContent className="p-0 relative">
          {loading && rows.length > 0 && (
            <div className="absolute top-2 right-3 z-20 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/90 border rounded-md px-2 py-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </div>
          )}
          {showInitialLoader ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading reports…</p>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mx-auto mb-3">
                <FileText className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">No reports match</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Try clearing filters or widening the date range.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[min(68vh,720px)]">
                <table className="min-w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-md">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {['SL.NO', 'Type', 'Status', 'Unique ID', 'Post date', 'Phone', 'Citizen profile', 'Link', 'Description', 'Category', ''].map(
                        (h) => (
                          <th
                            key={h || 'actions'}
                            className={cn(
                              'py-2.5 px-3 text-left font-bold whitespace-nowrap',
                              h === '' && 'text-center w-12'
                            )}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pageRows.map((r, idx) => {
                      const PlatformIcon = platformIcons[r.platform?.toLowerCase()] || platformIcons.default;
                      return (
                        <tr
                          key={r.key}
                          className={cn(
                            'border-l-[3px] transition-colors cursor-pointer group',
                            rowAccent[r.module] || 'border-l-transparent hover:bg-muted/30'
                          )}
                          onClick={() => openDetail(r.module, r.unique_code)}
                        >
                          <td className="py-2.5 px-3 text-[11px] text-muted-foreground tabular-nums align-top">
                            {(page - 1) * PAGE_SIZE + idx + 1}
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <Badge variant="outline" className={cn('text-[10px] font-bold shadow-none', r.moduleClass)}>
                              {r.moduleLabel}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <Badge variant="outline" className={cn('text-[10px] font-semibold shadow-none', statusBadge(r.status))}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-foreground align-top">{r.unique_code}</td>
                          <td className="py-2.5 px-3 text-[11px] whitespace-nowrap text-muted-foreground align-top">{fmtDate(r.post_date)}</td>
                          <td className="py-2.5 px-3 text-[11px] align-top">{r.phone}</td>
                          <td className="py-2.5 px-3 max-w-[180px] align-top">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <PlatformIcon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                              <span className="truncate text-xs font-medium">{r.profile}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 align-top" onClick={(e) => e.stopPropagation()}>
                            {r.post_link ? (
                              <a
                                href={r.post_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs max-w-[280px] align-top">
                            <p className="line-clamp-2 leading-relaxed text-foreground/90" title={r.description}>
                              {r.description}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground align-top">{r.category}</td>
                          <td className="py-2.5 px-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn('h-7 w-7 p-0 rounded-lg', actionBtnClass[r.module])}
                              onClick={() => openDetail(r.module, r.unique_code)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs">
                  <span className="text-muted-foreground font-medium">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 px-2.5 rounded-lg" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2.5 rounded-lg" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </div>

      {detailModule === 'grievance' && detailCode && (
        <GrievanceWorkflowReports
          suppressTable
          openReportCode={detailCode}
          onReportCodeHandled={notifyCodeHandled}
          onDetailClose={closeDetail}
          onStatsUpdate={onGrievanceStatsUpdate}
        />
      )}
      {detailModule === 'suggestion' && detailCode && (
        <SuggestionReports
          suppressTable
          openReportCode={detailCode}
          onReportCodeHandled={notifyCodeHandled}
          onDetailClose={closeDetail}
        />
      )}
      {detailModule === 'criticism' && detailCode && (
        <CriticismReports
          suppressTable
          openReportCode={detailCode}
          onReportCodeHandled={notifyCodeHandled}
          onDetailClose={closeDetail}
        />
      )}
    </>
  );
}

export default GrievanceUnifiedReports;
