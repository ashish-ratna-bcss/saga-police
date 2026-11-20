import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, FileUp, FolderSearch, House, Loader2,
  Newspaper, RefreshCw, Search, Tags, Trash2, Upload, Wifi, WifiOff,
  XCircle, Zap,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { epaperApi } from '../../../api';
import { toast } from 'sonner';

const VIEWS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'extract', label: 'Extract', icon: FileUp },
  { id: 'daily', label: 'Daily', icon: Newspaper },
  { id: 'browse', label: 'Browse', icon: CalendarDays },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'jobs', label: 'Jobs', icon: FolderSearch },
];

const errMsg = (err, fallback) => {
  const d = err?.response?.data;
  if (d?.error?.code === 'EPAPER_NOT_CONFIGURED') {
    return 'E-Paper is not configured (set EPAPER_URL on the backend).';
  }
  if (d?.error?.code === 'EPAPER_UNREACHABLE') {
    return 'E-Paper service is not reachable.';
  }
  return d?.error?.message || d?.detail || d?.message || err?.message || fallback;
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS = {
  done: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10' },
  error: { dot: 'bg-red-500', cls: 'text-red-600 border-red-500/30 bg-red-500/10' },
  running: { dot: 'bg-amber-500 animate-pulse', cls: 'text-amber-600 border-amber-500/30 bg-amber-500/10' },
  queued: { dot: 'bg-sky-500', cls: 'text-sky-600 border-sky-500/30 bg-sky-500/10' },
};

const StatusBadge = ({ status }) => {
  const k = STATUS[status] ? status : 'running';
  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1.5 font-semibold capitalize ${STATUS[k].cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
      {status || 'running'}
    </Badge>
  );
};

const Chip = ({ label, value }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
    <span className="tabular-nums font-semibold text-foreground">{value ?? '—'}</span> {label}
  </span>
);

const Segment = ({ value, onChange, options }) => (
  <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          value === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Field = ({ label, children }) => (
  <div className="space-y-1.5 min-w-0">
    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    {children}
  </div>
);

/* ---------- Home ---------- */

const HomePanel = ({ onGo, corpus, health }) => (
  <div className="space-y-5">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">E-Paper</p>
      <h2 className="mt-1 font-heading text-xl font-bold tracking-tight">Newspaper pages → searchable articles</h2>
      <p className="mt-2 max-w-xl text-xs text-muted-foreground leading-relaxed">
        Fetch or upload a page, run layout + Indic OCR + VLM, then browse the corpus.
        Use Extract to start; Daily and Browse for what you already have.
      </p>
      <Button type="button" size="sm" className="mt-4 gap-1.5" onClick={() => onGo('extract')}>
        <FileUp className="h-3.5 w-3.5" /> Start extracting
      </Button>
    </div>

    <div className="flex flex-wrap gap-1.5">
      <Chip label="articles" value={corpus?.articles ?? 0} />
      <Chip label="pages" value={corpus?.pages ?? 0} />
      <Chip label="papers" value={corpus?.epapers ?? 0} />
      {health?.gpu && <Chip label="GPU" value={String(health.gpu).replace('NVIDIA ', '')} />}
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { id: 'extract', title: 'Extract a page', body: 'Catalogue fetch, upload, page range or whole edition.', icon: FileUp },
        { id: 'daily', title: 'Daily reader', body: 'Today’s papers, overnight collect, and sources.', icon: Newspaper },
        { id: 'browse', title: 'Browse archive', body: 'Filter by date, paper and category across MongoDB.', icon: CalendarDays },
        { id: 'categories', title: 'Manage categories', body: 'Review classifier labels used in browse.', icon: Tags },
      ].map(({ id, title, body, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onGo(id)}
          className="rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-accent/40"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 text-sm font-semibold">{title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{body}</p>
        </button>
      ))}
    </div>
  </div>
);

/* ---------- Extract ---------- */

const ExtractPanel = ({ onJobStarted }) => {
  const [mode, setMode] = useState('catalogue'); // catalogue | upload | topic
  const [scope, setScope] = useState('page'); // page | range | whole
  const [file, setFile] = useState(null);
  const [withText, setWithText] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const [papers, setPapers] = useState([]);
  const [host, setHost] = useState('');
  const [editions, setEditions] = useState([]);
  const [titleId, setTitleId] = useState('');
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(8);

  const [beats, setBeats] = useState([]);
  const [beatId, setBeatId] = useState('');
  const [topicQ, setTopicQ] = useState('');
  const [topicMode, setTopicMode] = useState('hybrid');

  useEffect(() => {
    epaperApi.papers().then((list) => setPapers(Array.isArray(list) ? list : [])).catch(() => setPapers([]));
    epaperApi.beats().then((list) => setBeats(Array.isArray(list) ? list : [])).catch(() => setBeats([]));
  }, []);

  useEffect(() => {
    if (!host) { setEditions([]); setTitleId(''); return; }
    epaperApi.editions(host)
      .then((list) => {
        const rows = Array.isArray(list) ? list : [];
        setEditions(rows);
        setTitleId(rows[0] ? String(rows[0].id) : '');
      })
      .catch(() => { setEditions([]); setTitleId(''); });
  }, [host]);

  useEffect(() => {
    if (!host || !titleId) { setDates([]); setDate(''); return; }
    epaperApi.dates(host, titleId)
      .then((list) => {
        const rows = Array.isArray(list) ? list : [];
        setDates(rows);
        setDate(rows[0]?.date || '');
      })
      .catch(() => { setDates([]); setDate(''); });
  }, [host, titleId]);

  const editionName = editions.find((e) => String(e.id) === String(titleId))?.name || '';

  const submitCatalogue = async () => {
    if (!host || !titleId || !date) return toast.error('Pick paper, edition and date');
    setBusy(true);
    try {
      let res;
      if (scope === 'page') {
        res = await epaperApi.fetchPage({
          host, title_id: titleId, date, edition: editionName,
          page_no: Number(pageNo) || 1, with_text: withText,
        });
      } else {
        res = await epaperApi.ingestEdition({
          host, title_id: titleId, date, edition: editionName,
          ...(scope === 'range'
            ? { from_page: Number(fromPage) || 1, to_page: Number(toPage) || 1 }
            : {}),
        });
      }
      toast.success(scope === 'page' ? 'Extraction started' : 'Edition ingest started');
      onJobStarted?.(res.job_id);
    } catch (err) {
      toast.error(errMsg(err, 'Extract failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitUpload = async () => {
    if (!file) return toast.error('Choose a page image or PDF');
    setBusy(true);
    try {
      const res = await epaperApi.uploadPage(file, withText);
      toast.success('Extraction started');
      onJobStarted?.(res.job_id);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      toast.error(errMsg(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitTopic = async () => {
    const topic = topicQ.trim() || beats.find((b) => b.id === beatId)?.topic || '';
    if (!topic) return toast.error('Enter a topic or pick a beat');
    setBusy(true);
    try {
      // Archive scope: search already-extracted corpus (no host/date required).
      const res = await epaperApi.topicSearch({
        topic,
        beat: beatId || undefined,
        mode: topicMode,
        scope: 'archive',
        timeframe: 'all',
      });
      toast.success('Topic search started');
      onJobStarted?.(res.job_id);
    } catch (err) {
      toast.error(errMsg(err, 'Topic search failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segment
        value={mode}
        onChange={setMode}
        options={[
          { id: 'catalogue', label: 'Catalogue' },
          { id: 'upload', label: 'Upload' },
          { id: 'topic', label: 'Topic / beat' },
        ]}
      />

      {mode === 'catalogue' && (
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paper">
              <Select value={host || undefined} onValueChange={setHost}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select paper" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {papers.map((p) => (
                    <SelectItem key={p.host} value={p.host} className="text-xs">
                      {p.name} · {p.lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Edition">
              <Select value={titleId || undefined} onValueChange={setTitleId} disabled={!editions.length}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select edition" /></SelectTrigger>
                <SelectContent>
                  {editions.map((e) => (
                    <SelectItem key={String(e.id)} value={String(e.id)} className="text-xs">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date">
              <Select value={date || undefined} onValueChange={setDate} disabled={!dates.length}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select date" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {dates.map((d) => (
                    <SelectItem key={d.date} value={d.date} className="text-xs">{d.date}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {scope === 'page' && (
              <Field label="Page">
                <Input type="number" min={1} value={pageNo} onChange={(e) => setPageNo(e.target.value)} className="h-9 text-xs" />
              </Field>
            )}
            {scope === 'range' && (
              <>
                <Field label="From page">
                  <Input type="number" min={1} value={fromPage} onChange={(e) => setFromPage(e.target.value)} className="h-9 text-xs" />
                </Field>
                <Field label="To page">
                  <Input type="number" min={1} value={toPage} onChange={(e) => setToPage(e.target.value)} className="h-9 text-xs" />
                </Field>
              </>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">How much</p>
            <Segment
              value={scope}
              onChange={setScope}
              options={[
                { id: 'page', label: 'One page' },
                { id: 'range', label: 'Page range' },
                { id: 'whole', label: 'Whole paper' },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} className="rounded border-border" />
              Run OCR + VLM text
            </label>
            <Button type="button" size="sm" className="gap-1.5" disabled={busy || !host || !date} onClick={submitCatalogue}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {scope === 'page' ? 'Fetch & extract' : 'Ingest edition'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-5">
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg px-4 py-8 text-center hover:bg-muted/30 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Upload className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">Drop a page or click to browse</span>
            <span className="text-[11px] text-muted-foreground">JPG, PNG or PDF</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {file && (
            <p className="mt-2 truncate text-center text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{file.name}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} className="rounded border-border" />
              Run OCR + VLM text
            </label>
            <Button type="button" size="sm" className="gap-1.5" disabled={busy || !file} onClick={submitUpload}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Extract
            </Button>
          </div>
        </div>
      )}

      {mode === 'topic' && (
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <Field label="Beat preset (optional)">
            <Select value={beatId || '__none'} onValueChange={(v) => setBeatId(v === '__none' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Any beat" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none" className="text-xs">No beat</SelectItem>
                {beats.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.label} · {b.n_terms} terms
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Topic / query">
            <Input
              value={topicQ}
              onChange={(e) => setTopicQ(e.target.value)}
              placeholder="e.g. Delhi Police, naxal…"
              className="h-9 text-xs"
            />
          </Field>
          <Field label="Mode">
            <Segment
              value={topicMode}
              onChange={setTopicMode}
              options={[
                { id: 'hybrid', label: 'Hybrid' },
                { id: 'keywords', label: 'Keywords only' },
              ]}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="button" size="sm" className="gap-1.5" disabled={busy} onClick={submitTopic}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Run topic search
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Daily ---------- */

const DailyPanel = ({ onOpenJob }) => {
  const [date, setDate] = useState(today());
  const [report, setReport] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([epaperApi.daily(date), epaperApi.sources()]);
      setReport(r);
      setSources(s?.sources || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load daily report'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const collect = async () => {
    setBusy('collect');
    setNote('');
    try {
      const r = await epaperApi.collectNow(date);
      setNote(
        r.started
          ? `Collecting ${r.due || 0} paper(s)${r.papers?.length ? `: ${r.papers.join(', ')}` : ''}.`
          : r.detail || 'Nothing due.'
      );
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Collect failed'));
    } finally {
      setBusy('');
    }
  };

  const papers = report?.papers || report?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs w-40" />
        </Field>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
        </Button>
        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={collect} disabled={busy === 'collect'}>
          {busy === 'collect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Collect now
        </Button>
      </div>

      {note && <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">{note}</p>}

      {loading && !report ? (
        <div className="flex items-center gap-2 py-12 text-xs text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading daily report…
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Papers · {papers.length || 0}
          </p>
          {!papers.length && (
            <p className="py-8 text-center text-xs text-muted-foreground">No papers for this date yet.</p>
          )}
          {papers.map((p, i) => (
            <div key={p.host || p.paper || i} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.paper || p.name || p.host}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {[p.edition, p.status, p.pages != null ? `${p.pages} pages` : null, p.articles != null ? `${p.articles} articles` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                {p.job_id && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenJob?.(p.job_id)}>
                    Open job
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily sources · {sources.length}
        </p>
        {!sources.length && (
          <p className="text-xs text-muted-foreground">No sources configured. Add them in the e-paper service or via API.</p>
        )}
        {sources.map((s) => (
          <div key={s.id || s.host} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="font-medium truncate">{s.paper || s.name || s.host}</span>
            <span className="text-muted-foreground shrink-0">{s.enabled === false ? 'off' : 'on'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- Browse ---------- */

const BrowsePanel = ({ onOpenJob }) => {
  const [archiveDates, setArchiveDates] = useState([]);
  const [date, setDate] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [facets, setFacets] = useState(null);
  const [mode, setMode] = useState('browse'); // browse | search

  useEffect(() => {
    epaperApi.archiveDates()
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setArchiveDates(list);
        if (list[0]?.date) setDate(list[0].date);
      })
      .catch(() => setArchiveDates([]));
  }, []);

  useEffect(() => {
    if (!date) return;
    epaperApi.facets({ date }).then(setFacets).catch(() => setFacets(null));
  }, [date]);

  const run = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      if (mode === 'search' && q.trim()) {
        const data = await epaperApi.search({
          q: q.trim(),
          ...(date ? { date_from: date, date_to: date } : {}),
          ...(category ? { category } : {}),
          limit: 50,
        });
        setRows(data?.hits || data?.results || []);
      } else {
        const data = await epaperApi.browse({
          ...(date ? { date } : {}),
          ...(category ? { category } : {}),
          per_page: 50,
        });
        setRows(data?.results || data?.articles || data?.hits || data?.items || []);
      }
    } catch (err) {
      toast.error(errMsg(err, 'Browse failed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let next = [];
        if (mode === 'search' && q.trim()) {
          const data = await epaperApi.search({
            q: q.trim(),
            date_from: date,
            date_to: date,
            ...(category ? { category } : {}),
            limit: 50,
          });
          next = data?.hits || data?.results || [];
        } else {
          const data = await epaperApi.browse({
            date,
            ...(category ? { category } : {}),
            per_page: 50,
          });
          next = data?.results || data?.articles || data?.hits || data?.items || [];
        }
        if (!cancelled) setRows(next);
      } catch (err) {
        if (!cancelled) {
          toast.error(errMsg(err, 'Browse failed'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, category, mode, q]);

  const cats = facets?.categories || facets?.by_category || [];

  return (
    <div className="space-y-4">
      <Segment
        value={mode}
        onChange={setMode}
        options={[
          { id: 'browse', label: 'By date' },
          { id: 'search', label: 'Topic search' },
        ]}
      />

      <form onSubmit={run} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Date">
          <Select value={date || undefined} onValueChange={setDate}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a day" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {archiveDates.map((d) => (
                <SelectItem key={d.date} value={d.date} className="text-xs">
                  {d.date}{d.n_articles != null ? ` · ${d.n_articles}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={mode === 'search' ? 'Query' : 'Category'}>
          {mode === 'search' ? (
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keywords…" className="h-9 text-xs" />
          ) : (
            <Select value={category || '__all'} onValueChange={(v) => setCategory(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all" className="text-xs">All</SelectItem>
                {(Array.isArray(cats) ? cats : Object.keys(cats || {})).map((c) => {
                  const label = typeof c === 'string' ? c : c.label || c.name || c.id;
                  const val = typeof c === 'string' ? c : c.id || c.label || c.name;
                  return (
                    <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" size="sm" className="h-9 gap-1.5 w-full sm:w-auto" disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {mode === 'search' ? 'Search' : 'Browse'}
          </Button>
        </div>
      </form>

      {!rows.length && !loading && (
        <p className="py-10 text-center text-xs text-muted-foreground">
          {archiveDates.length ? 'No articles for this filter.' : 'Archive is empty — extract pages first.'}
        </p>
      )}

      <div className="space-y-2">
        {rows.map((hit) => (
          <button
            key={hit.uid || `${hit.job_id}-${hit.headline}`}
            type="button"
            onClick={() => hit.job_id && onOpenJob?.(hit.job_id)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
          >
            <p className="text-sm font-semibold leading-snug line-clamp-2">{hit.headline || 'Untitled'}</p>
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{hit.body}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {hit.paper && <span className="rounded bg-muted px-1.5 py-0.5">{hit.paper}</span>}
              {hit.date && <span className="rounded bg-muted px-1.5 py-0.5">{hit.date}</span>}
              {hit.category && <span className="rounded bg-muted px-1.5 py-0.5">{hit.category}</span>}
              {hit.primary_beat && <span className="rounded bg-muted px-1.5 py-0.5">{hit.primary_beat}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ---------- Categories ---------- */

const CategoriesPanel = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await epaperApi.categories();
      setRows(Array.isArray(list) ? list : list?.categories || []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load categories'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
      </div>
    );
  }

  if (!rows.length) {
    return <p className="py-16 text-center text-xs text-muted-foreground">No categories yet — they appear after extractions are classified.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={load}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      {rows.map((c) => (
        <div key={c.id || c.label} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{c.label || c.name || c.id}</p>
            <p className="text-[10px] text-muted-foreground">
              {[c.parent || c.heading, c.count != null ? `${c.count} articles` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ---------- Jobs ---------- */

const JobsPanel = ({ focusId, onOpenJob }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await epaperApi.jobs(50);
      setJobs(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(errMsg(err, 'Could not load jobs'));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, focusId]);

  useEffect(() => {
    const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    if (!active) return undefined;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [jobs, load]);

  const remove = async (id, e) => {
    e.stopPropagation();
    try {
      await epaperApi.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success('Job removed');
    } catch (err) {
      toast.error(errMsg(err, 'Delete failed'));
    }
  };

  if (loading && !jobs.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
      </div>
    );
  }

  if (!jobs.length) {
    return <p className="py-16 text-center text-xs text-muted-foreground">No extraction jobs yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={load}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      {jobs.map((job) => (
        <button
          key={job.id}
          type="button"
          onClick={() => onOpenJob?.(job.id)}
          className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${
            focusId === job.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <StatusBadge status={job.status} />
              <span className="truncate text-xs font-semibold">
                {job.paper || job.source || job.kind || 'Job'}
                {job.edition ? ` · ${job.edition}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground">{timeAgo(job.created_at || job.created)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => remove(job.id, e)}>
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          </div>
          {(job.date || job.page_no != null || job.kind) && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {[job.date, job.page_no != null ? `p.${job.page_no}` : null, job.kind].filter(Boolean).join(' · ')}
              {job.error ? ` · ${job.error}` : ''}
            </p>
          )}
        </button>
      ))}
    </div>
  );
};

/* ---------- Job detail ---------- */

const JobSheet = ({ jobId, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const d = await epaperApi.job(jobId);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) toast.error(errMsg(err, 'Could not load job'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(async () => {
      try {
        const d = await epaperApi.job(jobId);
        if (!cancelled) setDetail(d);
        if (d?.status === 'done' || d?.status === 'error') clearInterval(t);
      } catch { /* ignore */ }
    }, 2500);
    return () => { cancelled = true; clearInterval(t); };
  }, [jobId]);

  const articles = detail?.articles || detail?.regions || [];

  return (
    <Sheet open={Boolean(jobId)} onOpenChange={(o) => !o && onClose?.()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading text-base">
            {detail?.paper || 'Extraction'}
            {detail?.date ? ` · ${detail.date}` : ''}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {detail ? <StatusBadge status={detail.status} /> : null}
            <span className="text-[11px] font-mono text-muted-foreground truncate">{jobId}</span>
          </SheetDescription>
        </SheetHeader>

        {loading && !detail && (
          <div className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {detail?.error && (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
            {detail.error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {articles.map((a, i) => {
            const crop = a.crop || a.image;
            const src = crop && detail?.id
              ? epaperApi.mediaUrl(detail.id, String(crop).replace(/^\//, ''))
              : null;
            return (
              <div key={a.uid || i} className="rounded-lg border border-border overflow-hidden bg-card">
                {src && <img src={src} alt="" className="max-h-48 w-full object-contain bg-muted/40" />}
                <div className="p-3">
                  <p className="text-sm font-semibold leading-snug">{a.headline || `Region ${i + 1}`}</p>
                  {a.body && <p className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-6">{a.body}</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{a.category}</span>}
                    {a.primary_beat && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{a.primary_beat}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {detail && detail.status === 'done' && !articles.length && (
            <p className="py-8 text-center text-xs text-muted-foreground">No articles on this page.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ---------- Workspace ---------- */

const EpaperWorkspace = () => {
  const [view, setView] = useState('home');
  const [health, setHealth] = useState({ status: 'checking' });
  const [corpus, setCorpus] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [sheetId, setSheetId] = useState(null);

  const check = useCallback(async () => {
    setHealth({ status: 'checking' });
    try {
      const h = await epaperApi.health();
      setHealth({ status: 'online', data: h });
    } catch (err) {
      setHealth({
        status: err?.response?.data?.error?.code === 'EPAPER_NOT_CONFIGURED' ? 'unconfigured' : 'offline',
        message: errMsg(err, 'Offline'),
      });
    }
  }, []);

  const loadCorpus = useCallback(async () => {
    try {
      setCorpus(await epaperApi.corpus());
    } catch {
      setCorpus(null);
    }
  }, []);

  useEffect(() => {
    check();
    loadCorpus();
  }, [check, loadCorpus]);

  const onJobStarted = (id) => {
    setFocusId(id);
    setSheetId(id);
    setView('jobs');
    loadCorpus();
  };

  const h = health.data;
  const statusIcon = useMemo(() => {
    if (health.status === 'checking') return <Loader2 className="h-3 w-3 animate-spin" />;
    if (health.status === 'online') return <Wifi className="h-3 w-3" />;
    return <WifiOff className="h-3 w-3" />;
  }, [health.status]);

  const unavailable = health.status === 'offline' || health.status === 'unconfigured';

  return (
    <div className="flex h-full min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card/80">
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Newspaper className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-base font-bold tracking-tight leading-none">E-Paper</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    health.status === 'online'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : health.status === 'checking'
                        ? 'border-border bg-muted/40 text-muted-foreground'
                        : 'border-red-500/30 bg-red-500/10 text-red-600'
                  }`}
                >
                  {statusIcon}
                  {health.status === 'online' ? 'Live' : health.status === 'checking' ? 'Checking' : health.status === 'unconfigured' ? 'Not configured' : 'Offline'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Extract · Daily · Browse · Categories · Jobs
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs self-start" onClick={() => { check(); loadCorpus(); }}>
            <RefreshCw className={`h-3.5 w-3.5 ${health.status === 'checking' ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {(health.status === 'online' || corpus) && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2 sm:px-4">
            <Chip label="articles" value={corpus?.articles ?? 0} />
            <Chip label="pages" value={corpus?.pages ?? 0} />
            <Chip label="papers" value={corpus?.epapers ?? 0} />
            {h?.gpu && <Chip label="GPU" value={String(h.gpu).replace('NVIDIA ', '')} />}
            {h && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                {h.ocr_ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />} OCR
                {h.vlm_ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-1" /> : <XCircle className="h-3 w-3 text-red-500 ml-1" />} VLM
                {h.layout_ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-1" /> : <XCircle className="h-3 w-3 text-amber-500 ml-1" />} Layout
              </span>
            )}
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto no-scrollbar border-t border-border px-2 py-1.5 sm:px-3">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                view === id
                  ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-5">
          {unavailable ? (
            <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
              <WifiOff className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-heading text-base font-bold">E-Paper unavailable</h2>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
                {health.message || 'Check EPAPER_URL and that the e-paper service is running.'}
              </p>
              <Button type="button" size="sm" className="mt-4 gap-1.5" onClick={check}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : (
            <>
              {view === 'home' && <HomePanel onGo={setView} corpus={corpus} health={h} />}
              {view === 'extract' && <ExtractPanel onJobStarted={onJobStarted} />}
              {view === 'daily' && <DailyPanel onOpenJob={setSheetId} />}
              {view === 'browse' && <BrowsePanel onOpenJob={setSheetId} />}
              {view === 'categories' && <CategoriesPanel />}
              {view === 'jobs' && <JobsPanel focusId={focusId} onOpenJob={setSheetId} />}
            </>
          )}
        </div>
      </main>

      <JobSheet jobId={sheetId} onClose={() => setSheetId(null)} />
    </div>
  );
};

export default EpaperWorkspace;
