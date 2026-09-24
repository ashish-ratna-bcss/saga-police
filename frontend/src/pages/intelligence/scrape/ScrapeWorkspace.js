import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Checkbox } from '../../../components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
import {
  Globe, Search, Loader2, Play, Trash2, ArrowUpRight, Map, FileText, AlertTriangle, Layers, Zap, Database, Activity, RefreshCw
} from 'lucide-react';
import { scrapeApi } from '../../../api';
import { toast } from 'sonner';

const HISTORY_KEY = 'scrape_runs_v1';
const MAX_RUNS = 30;

const errMsg = (err, fallback) =>
  err.response?.data?.detail || err.response?.data?.error?.message || fallback;
const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
};

const MODES = [
  { value: 'crawl', label: 'Crawl a site', icon: Globe, placeholder: 'https://example.com', cta: 'Start crawl', short: 'Crawl' },
  { value: 'preflight', label: 'Preflight check', icon: Map, placeholder: 'https://example.com', cta: 'Run preflight', short: 'Preflight' },
  { value: 'search', label: 'Instant search', icon: Search, placeholder: 'Enter search query', cta: 'Search', short: 'Search' },
];
const modeOf = (v) => MODES.find((m) => m.value === v) || MODES[0];

const withScheme = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const timeAgo = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS = {
  completed: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10' },
  failed: { dot: 'bg-red-500', cls: 'text-red-600 border-red-500/30 bg-red-500/10' },
  running: { dot: 'bg-amber-500 animate-pulse', cls: 'text-amber-600 border-amber-500/30 bg-amber-500/10' },
};
const statusKey = (s) => (STATUS[s] ? s : 'running');
const isRunning = (r) => r.kind === 'crawl' && !['completed', 'failed'].includes(r.status);

const StatusBadge = ({ status }) => {
  const k = statusKey(status);
  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1.5 font-semibold capitalize ${STATUS[k].cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
      {status || 'running'}
    </Badge>
  );
};

const Chip = ({ dot, label, value }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
    {dot && <span className={`h-1.5 w-1.5 rounded-full self-center ${dot}`} />}
    <span className="tabular-nums font-semibold text-foreground">{value}</span> {label}
  </span>
);

const Label = ({ children, count }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}{count != null && <span className="rounded bg-muted px-1 tabular-nums">{count}</span>}
  </div>
);

const Tile = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2.5">
    <span className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${tone === 'red' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums break-words">{value}</p>
    </div>
  </div>
);

const Empty = ({ children }) => <p className="text-xs text-muted-foreground py-8 text-center">{children}</p>;

const searchResults = (d) => {
  const r = d?.results || d?.data || d;
  return Array.isArray(r) ? r : null;
};

const flatRows = (obj) =>
  Object.entries(obj || {})
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)]);

/* ---------- report ---------- */

const Report = ({ run }) => {
  const [tab, setTab] = useState('overview');
  useEffect(() => setTab('overview'), [run.id]);
  const d = run.result;
  const M = modeOf(run.kind);
  const results = run.kind === 'search' ? searchResults(d) : null;
  const tabs = [['overview', run.kind === 'search' ? 'Results' : 'Overview'], ['raw', 'Raw']];
  const pct = run.status === 'completed' ? 100
    : Math.min(99, Math.round(((d?.pages_crawled || 0) / Math.max(run.options?.max_pages || 1, 1)) * 100));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 pt-3 pb-0 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-heading font-bold tracking-tight truncate max-w-full">{run.target}</h2>
          {run.kind === 'crawl' && <StatusBadge status={run.status} />}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{M.label} · {timeAgo(run.ts)}{run.kind === 'crawl' && ` · ID ${run.id}`}</p>
        <div className="flex gap-0.5 mt-2 -mb-px">
          {tabs.map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${tab === v ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'overview' && run.kind === 'crawl' && (
          <>
            {isRunning(run) && (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Crawling. This refreshes every 3 seconds.</span>
                  <span className="tabular-nums font-semibold">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-700" style={{ width: `${Math.max(pct, 4)}%` }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              <Tile icon={FileText} label="Pages crawled" value={d?.pages_crawled || 0} />
              <Tile icon={AlertTriangle} label="Errors" value={d?.error_count || 0} tone={d?.error_count ? 'red' : undefined} />
              <Tile icon={Layers} label="Max depth" value={run.options?.max_depth ?? '—'} />
              <Tile icon={Globe} label="Max pages" value={run.options?.max_pages ?? '—'} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {run.options?.same_domain_only ? 'Restricted to the same domain.' : 'Follows links to other domains.'}
            </p>
          </>
        )}

        {tab === 'overview' && run.kind === 'preflight' && (flatRows(d).length
          ? <div className="rounded-lg border border-border overflow-hidden"><table className="w-full text-xs"><tbody>
            {flatRows(d).map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-0">
                <td className="w-44 px-3 py-2 text-muted-foreground capitalize align-top">{k}</td>
                <td className="px-3 py-2 font-medium break-words">{v}</td>
              </tr>))}
          </tbody></table></div>
          : <Empty>No summary fields returned. See the Raw tab.</Empty>)}

        {tab === 'overview' && run.kind === 'search' && (results?.length
          ? <div className="space-y-2">{results.map((r, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-3">
              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                {r.title || r.url}<ArrowUpRight className="h-3 w-3" />
              </a>
              {r.url && r.title && <p className="text-[10px] text-muted-foreground truncate">{r.url}</p>}
              {(r.snippet || r.description) && <p className="text-xs text-muted-foreground mt-1">{r.snippet || r.description}</p>}
            </div>))}</div>
          : <Empty>No results returned.</Empty>)}

        {tab === 'raw' && (
          <pre className="rounded-lg bg-gray-950 p-3 overflow-x-auto text-gray-300 font-mono text-[11px] leading-relaxed">{JSON.stringify(d || run, null, 2)}</pre>
        )}
      </div>
    </div>
  );
};

/* ---------- data explorer (documents / entities / sources) ---------- */

const EXPLORERS = {
  documents: { label: 'Documents', icon: FileText, fetch: scrapeApi.getDocuments, hint: 'Pages and files collected by your crawls.' },
  entities: { label: 'Entities', icon: Database, fetch: scrapeApi.getEntities, hint: 'People, organisations and places extracted from documents.' },
  sources: { label: 'Sources', icon: Globe, fetch: scrapeApi.getSources, hint: 'Websites and feeds being monitored.' },
};

const pickList = (res) => {
  if (Array.isArray(res)) return res;
  if (!res || typeof res !== 'object') return [];
  const inner = res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : res;
  if (Array.isArray(res.data)) return res.data;
  const key = ['items', 'results', 'documents', 'entities', 'sources', 'rows'].find((k) => Array.isArray(inner[k]));
  return key ? inner[key] : [];
};

const PREFERRED = ['title', 'name', 'url', 'domain', 'type', 'status', 'source', 'language', 'created_at', 'updated_at', 'last_crawled_at'];
const isScalar = (v) => ['string', 'number', 'boolean'].includes(typeof v);
const labelOf = (k) => k.replace(/_/g, ' ');
const cell = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) { const d = new Date(str); if (!Number.isNaN(d.getTime())) return d.toLocaleString(); }
  return str;
};
const rowTitle = (r) => r.title || r.name || r.url || r.domain || r.id || 'Item';

const DataExplorer = ({ kind }) => {
  const cfg = EXPLORERS[kind];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setRows(pickList(await cfg.fetch({ limit: 100 })));
    } catch (err) {
      setFailed(true);
      toast.error(errMsg(err, `Failed to load ${cfg.label.toLowerCase()}`));
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => { setQ(''); setOpen(null); load(); }, [load]);

  const cols = React.useMemo(() => {
    const keys = new Set();
    rows.slice(0, 20).forEach((r) => Object.entries(r || {}).forEach(([k, v]) => { if (isScalar(v) && k !== 'id' && !/_id$/.test(k)) keys.add(k); }));
    const all = [...keys];
    const first = PREFERRED.filter((k) => all.includes(k));
    return [...first, ...all.filter((k) => !first.includes(k))].slice(0, 6);
  }, [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${cfg.label.toLowerCase()}…`} className="h-8 pl-8 text-xs" />
        </div>
        <span className="text-[11px] text-muted-foreground">{cfg.hint}</span>
        <Chip label="shown" value={filtered.length} />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              {cols.length ? cols.map((c) => <TableHead key={c} className="h-8 capitalize">{labelOf(c)}</TableHead>) : <TableHead className="h-8">{cfg.label}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={Math.max(cols.length, 1)} className="py-12 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading {cfg.label.toLowerCase()}…
              </TableCell></TableRow>
            )}
            {!loading && !filtered.length && (
              <TableRow><TableCell colSpan={Math.max(cols.length, 1)} className="py-12 text-center text-xs text-muted-foreground">
                {failed ? `Could not load ${cfg.label.toLowerCase()}. Try Refresh.` : q ? 'Nothing matches that filter.' : `No ${cfg.label.toLowerCase()} yet.`}
              </TableCell></TableRow>
            )}
            {!loading && filtered.map((r, i) => (
              <TableRow key={r.id || i} onClick={() => setOpen(r)} className="cursor-pointer text-xs">
                {cols.map((c, ci) => (
                  <TableCell key={c} className={`py-2 max-w-[320px] truncate ${ci === 0 ? 'font-medium' : 'text-muted-foreground'}`}>{cell(r[c])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col gap-0">
          {open && (
            <>
              <SheetHeader className="px-4 py-3 border-b border-border space-y-1 text-left">
                <SheetTitle className="text-sm truncate pr-6">{String(rowTitle(open))}</SheetTitle>
                <SheetDescription className="text-[11px]">{cfg.label.slice(0, -1)}{open.id ? ` · ID ${open.id}` : ''}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <table className="w-full text-xs"><tbody>
                  {flatRows(open).map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="w-36 py-1.5 pr-3 text-muted-foreground capitalize align-top">{k}</td>
                      <td className="py-1.5 font-medium break-words">{cell(v)}</td>
                    </tr>
                  ))}
                </tbody></table>
                <details className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground">Raw data</summary>
                  <pre className="mx-3 mb-3 rounded-md bg-gray-950 p-3 overflow-x-auto text-gray-300 font-mono text-[11px] leading-relaxed">{JSON.stringify(open, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

/* ---------- page ---------- */

const ScrapeWorkspace = () => {
  const [runs, setRuns] = useState(loadHistory);
  const [selectedId, setSelectedId] = useState(() => loadHistory()[0]?.id || null);
  const [view, setView] = useState('crawl');
  const [input, setInput] = useState('');
  const [opts, setOpts] = useState({ max_pages: 10, max_depth: 2, same_domain_only: true });
  const [submitting, setSubmitting] = useState(false);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(0, MAX_RUNS))); } catch { /* ignore */ }
  }, [runs]);

  const patch = useCallback((id, p) => setRuns((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))), []);

  const hasRunning = runs.some(isRunning);
  useEffect(() => {
    if (!hasRunning) return undefined;
    const t = setInterval(async () => {
      for (const r of runsRef.current) {
        if (!isRunning(r)) continue;
        try {
          const s = await scrapeApi.getCrawlStatus(r.id);
          patch(r.id, { status: s.status, result: s });
          if (s.status === 'completed') toast.success(`Crawl completed: ${r.target}`);
          else if (s.status === 'failed') toast.error(`Crawl failed: ${r.target}`);
        } catch (e) { console.error(e); }
      }
    }, 3000);
    return () => clearInterval(t);
  }, [hasRunning, patch]);

  const mode = MODES.some((m) => m.value === view) ? view : 'crawl';
  const M = modeOf(mode);
  const viewRuns = runs.filter((r) => r.kind === mode);
  const selected = viewRuns.find((r) => r.id === selectedId) || null;
  const counts = {
    total: viewRuns.length, running: viewRuns.filter(isRunning).length,
    done: viewRuns.filter((r) => r.status === 'completed').length, failed: viewRuns.filter((r) => r.status === 'failed').length,
  };

  const submit = async (e) => {
    e?.preventDefault();
    const value = input.trim();
    if (!value) return toast.error(mode === 'search' ? 'Please enter a query' : 'Please enter a URL');
    setSubmitting(true);
    try {
      let run;
      if (mode === 'crawl') {
        const options = { ...opts, max_pages: clamp(opts.max_pages, 1, 1000), max_depth: clamp(opts.max_depth, 0, 10) };
        const res = await scrapeApi.createCrawl({ url: withScheme(value), ...options });
        run = { id: String(res.crawl_id || res.id), status: 'running', result: null, options };
      } else if (mode === 'preflight') {
        run = { id: `pf-${Date.now()}`, status: 'completed', result: await scrapeApi.preflight(withScheme(value)) };
      } else {
        run = { id: `sr-${Date.now()}`, status: 'completed', result: await scrapeApi.instantSearch(value) };
      }
      const full = { ...run, kind: mode, target: value, ts: Date.now() };
      setRuns((rs) => [full, ...rs].slice(0, MAX_RUNS));
      setSelectedId(full.id);
      setInput('');
      toast.success(mode === 'crawl' ? 'Crawl initiated' : `${M.short} complete`);
    } catch (err) {
      toast.error(errMsg(err, mode === 'crawl' ? 'Failed to start crawl' : `${M.short} failed`));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (id) => {
    setRuns((rs) => rs.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="p-4 space-y-3 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-heading font-bold tracking-tight leading-none">Scrape · {EXPLORERS[view]?.label || M.short}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{EXPLORERS[view] ? EXPLORERS[view].hint : { crawl: 'Crawl a site and collect its pages', preflight: 'Check a URL before you crawl it', search: 'Search the web for instant results' }[mode]}</p>
        </div>
        <div className={`ml-auto flex items-center gap-1 flex-wrap ${EXPLORERS[view] ? 'hidden' : ''}`}>
          <Chip label="total" value={counts.total} />
          <Chip dot="bg-amber-500 animate-pulse" label="running" value={counts.running} />
          <Chip dot="bg-emerald-500" label="done" value={counts.done} />
          <Chip dot="bg-red-500" label="failed" value={counts.failed} />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto no-scrollbar">
        {[...MODES.map((m) => [m.value, m.short, m.icon]), ...Object.entries(EXPLORERS).map(([k, v]) => [k, v.label, v.icon])].map(([k, l, I]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${view === k ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <I className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>

      {EXPLORERS[view] ? <DataExplorer key={view} kind={view} /> : (
      <>
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-2.5 space-y-2.5">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <M.icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={M.placeholder} className="h-10 pl-9 text-sm" />
          </div>
          <Button type="submit" disabled={submitting} className="h-10 px-5 gap-1.5 text-sm">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'crawl' ? <Play className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            {M.cta}
          </Button>
        </div>
        {mode === 'crawl' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-0.5">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Max pages
              <Input type="number" min={1} max={1000} value={opts.max_pages} className="h-7 w-20 text-xs"
                onChange={(e) => setOpts({ ...opts, max_pages: parseInt(e.target.value, 10) || 1 })} />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Max depth
              <Input type="number" min={0} max={10} value={opts.max_depth} className="h-7 w-16 text-xs"
                onChange={(e) => setOpts({ ...opts, max_depth: Number.isNaN(parseInt(e.target.value, 10)) ? 0 : parseInt(e.target.value, 10) })} />
            </label>
            <label htmlFor="same-domain" className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <Checkbox id="same-domain" checked={opts.same_domain_only}
                onCheckedChange={(c) => setOpts({ ...opts, same_domain_only: !!c })} />
              Same domain only
            </label>
          </div>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 items-start">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/10"><Label count={viewRuns.length}>Recent {M.short.toLowerCase()} runs</Label></div>
          <div className="max-h-[calc(100dvh-24rem)] min-h-[120px] overflow-y-auto">
            {viewRuns.length === 0 && <p className="p-6 text-xs text-muted-foreground text-center">Nothing yet. {mode === 'search' ? 'Enter a query above.' : 'Enter a URL above.'}</p>}
            {viewRuns.map((r) => {
              const RM = modeOf(r.kind);
              const pct = r.status === 'completed' ? 100 : Math.min(99, Math.round(((r.result?.pages_crawled || 0) / Math.max(r.options?.max_pages || 1, 1)) * 100));
              return (
                <div key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`group px-3 py-2 cursor-pointer border-b border-border last:border-0 ${selectedId === r.id ? 'bg-primary/10' : 'hover:bg-accent/50'}`}>
                  <div className="flex items-center gap-2">
                    <RM.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium truncate flex-1">{r.target}</p>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS[statusKey(r.status)].dot}`} />
                    <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} aria-label="Delete run"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">{RM.short} · {timeAgo(r.ts)}</p>
                  {isRunning(r) && <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5 ml-5"><div className="h-full bg-primary" style={{ width: `${Math.max(pct, 4)}%` }} /></div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[420px] lg:h-[calc(100dvh-18rem)]">
          {selected ? <Report run={selected} /> : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-8">
              <Globe className="h-7 w-7 text-primary/60" />
              <p className="text-sm font-semibold">Your report appears here</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {{ crawl: 'Start a crawl to collect pages from a site. Progress and results appear here.', preflight: 'Run a preflight to check a URL before you crawl it.', search: 'Search the web for instant results.' }[mode]}
              </p>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default ScrapeWorkspace;
