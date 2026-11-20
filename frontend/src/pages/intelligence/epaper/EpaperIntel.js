import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Copy, Languages, Loader2, Newspaper, RefreshCw,
  Search, ShieldCheck, Sparkles, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { epaperApi } from '../../../api';
import { useAuth } from '../../../context/auth.context';
import EpaperWorkspace from './EpaperWorkspace';

/**
 * Newspaper intelligence: what the papers said today about this force, searchable, readable and
 * translated. The pipeline controls (extract, jobs, sources, categories) live under "Operator".
 */

const ALL = '__all';

const errMsg = (err, fallback) => {
  const d = err?.response?.data;
  return d?.error?.message || d?.detail || d?.message || err?.message || fallback;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const Highlight = ({ text, words }) => {
  if (!text) return null;
  const list = (words || []).filter((w) => w && w.length > 1).slice(0, 12);
  if (!list.length) return <>{text}</>;
  const re = new RegExp(`(${list.map(escapeRe).join('|')})`, 'gi');
  return (
    <>
      {String(text).split(re).map((part, i) => (
        i % 2 === 1
          ? <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      ))}
    </>
  );
};

const label = (v) => String(v || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (d) => {
  if (!d) return '';
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/* ---------- Shared bits ---------- */

const Stat = ({ title, value, hint }) => (
  <div className="rounded-xl border border-border bg-card px-3.5 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    <p className="mt-1 font-heading text-xl font-bold leading-none">{value}</p>
    {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

const Empty = ({ icon: Icon = Newspaper, title, body }) => (
  <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
    <Icon className="mx-auto h-7 w-7 text-muted-foreground/60" />
    <p className="mt-2 text-sm font-semibold">{title}</p>
    {body && <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>}
  </div>
);

const ArticleCard = ({ a, words, onOpen }) => {
  const crop = a.job_id && a.crop ? epaperApi.mediaUrl(a.job_id, String(a.crop).replace(/^\//, '')) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(a.uid)}
      className="flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      {crop && (
        <img src={crop} alt="" loading="lazy" className="hidden h-24 w-20 shrink-0 rounded-md border border-border bg-muted object-cover object-top sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">{a.paper}</span>
          {a.edition && <span>· {a.edition}</span>}
          {a.page_number ? <span>· Page {a.page_number}</span> : null}
          {a.date && <span>· {fmtDate(a.date)}</span>}
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-snug"><Highlight text={a.headline || '(no headline read)'} words={words} /></h3>
        {a.body && (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground"><Highlight text={a.body} words={words} /></p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {a.category && <Badge variant="secondary" className="text-[10px]">{label(a.category)}</Badge>}
          {a.subcategory && <Badge variant="outline" className="text-[10px]">{label(a.subcategory)}</Badge>}
          {(a.tags || []).slice(0, 4).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{label(t)}</Badge>)}
          {a.score > 0 && <span className="ml-auto text-[10px] text-muted-foreground">match {Math.round(a.score * 100)}%</span>}
        </div>
      </div>
    </button>
  );
};

/* ---------- Reader ---------- */

const Reader = ({ uid, words = [], onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tr, setTr] = useState(null);
  const [trLoading, setTrLoading] = useState(false);

  useEffect(() => {
    setData(null);
    setTr(null);
    if (!uid) return undefined;
    let off = false;
    setLoading(true);
    epaperApi.article(uid)
      .then((d) => { if (!off) setData(d); })
      .catch((e) => { if (!off) toast.error(errMsg(e, 'Could not open the article')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [uid]);

  const a = data?.article;
  const crop = a?.job_id && a?.crop ? epaperApi.mediaUrl(a.job_id, String(a.crop).replace(/^\//, '')) : null;
  const fullText = a ? [a.headline, a.byline, a.body].filter(Boolean).join('\n\n') : '';

  const translate = async () => {
    setTrLoading(true);
    try {
      const out = await epaperApi.translateArticle(fullText, a?.lang);
      if (out?.english) setTr(out);
      else toast.error('Translation is not available right now');
    } catch (e) {
      toast.error(errMsg(e, 'Translation failed'));
    } finally {
      setTrLoading(false);
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Could not copy'); }
  };

  return (
    <Sheet open={Boolean(uid)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-6 text-base leading-snug">{a?.headline || (loading ? 'Opening…' : 'Article')}</SheetTitle>
          <SheetDescription className="text-xs">
            {a ? [a.paper, a.edition, a.page_number ? `Page ${a.page_number}` : null, fmtDate(a.date)].filter(Boolean).join(' · ') : ' '}
          </SheetDescription>
        </SheetHeader>

        {loading && <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

        {a && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-1">
              {a.category && <Badge variant="secondary" className="text-[10px]">{label(a.category)}</Badge>}
              {a.subcategory && <Badge variant="outline" className="text-[10px]">{label(a.subcategory)}</Badge>}
              {a.primary_beat && <Badge variant="outline" className="text-[10px]">{label(a.primary_beat)}</Badge>}
              {(a.tags || []).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{label(t)}</Badge>)}
            </div>

            {(a.byline || a.dateline) && (
              <p className="text-xs text-muted-foreground">{[a.byline, a.dateline].filter(Boolean).join(' · ')}</p>
            )}

            {crop && <img src={crop} alt="Article clipping" className="max-h-72 w-full rounded-lg border border-border bg-muted object-contain" />}

            <div className="flex flex-wrap gap-2">
              {a.lang && a.lang !== 'en' && (
                <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={translate} disabled={trLoading || !a.body}>
                  {trLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                  Translate to English
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copy(fullText)}>
                <Copy className="h-3.5 w-3.5" /> Copy text
              </Button>
            </div>

            {tr && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                {tr.summary && (
                  <p className="text-xs leading-relaxed"><Sparkles className="mr-1 inline h-3 w-3 text-primary" /><span className="font-semibold">Summary: </span>{tr.summary}</p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{tr.english}</p>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => copy(tr.english)}>
                  <Copy className="h-3 w-3" /> Copy English
                </Button>
              </div>
            )}

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Original text {a.text_source ? `· ${a.text_source}` : ''}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {a.body ? <Highlight text={a.body} words={words} /> : 'No text was read for this clipping.'}
              </p>
            </div>

            {(a.keywords || []).length > 0 && (
              <p className="text-[11px] text-muted-foreground">Matched terms: {(a.keywords || []).slice(0, 12).join(', ')}</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

/* ---------- Briefing ---------- */

const BriefingTab = ({ beat, beats, dates, onOpen }) => {
  const [date, setDate] = useState('');
  const [category, setCategory] = useState(ALL);
  const [facets, setFacets] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const beatObj = useMemo(() => beats.find((b) => b.id === beat), [beats, beat]);

  useEffect(() => {
    if (!date && dates[0]?.date) setDate(dates[0].date);
  }, [dates, date]);

  useEffect(() => {
    if (!date) return;
    epaperApi.facets({ date }).then(setFacets).catch(() => setFacets(null));
  }, [date]);

  useEffect(() => {
    if (!date) return undefined;
    let off = false;
    setLoading(true);
    (async () => {
      try {
        let res;
        if (beatObj) {
          res = await epaperApi.search({ q: beatObj.label, beat: beatObj.id, date_from: date, date_to: date, limit: 100 });
          let list = res?.results || [];
          if (category !== ALL) list = list.filter((r) => r.category === category);
          if (!off) { setRows(list); setTotal(list.length); }
        } else {
          res = await epaperApi.browse({ date, per_page: 100, ...(category !== ALL ? { category } : {}) });
          if (!off) { setRows(res?.results || []); setTotal(res?.total || 0); }
        }
      } catch (e) {
        if (!off) { setRows([]); setTotal(0); toast.error(errMsg(e, 'Could not load the briefing')); }
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => { off = true; };
  }, [date, category, beatObj]);

  const byPaper = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.paper, (m.get(r.paper) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (!dates.length) {
    return <Empty title="No newspapers have been read yet" body="Once pages are collected and read, today's briefing for your force appears here." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={date} onValueChange={(v) => { setDate(v); setCategory(ALL); }}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Date" /></SelectTrigger>
          <SelectContent>
            {dates.map((d) => <SelectItem key={d.date} value={d.date} className="text-xs">{fmtDate(d.date)} · {d.n}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {beatObj ? <>Stories about <span className="font-semibold text-foreground">{beatObj.label}</span></> : 'All stories'} · {total} found
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat title="Stories" value={total} />
        <Stat title="Newspapers" value={byPaper.length} />
        <Stat title="Categories" value={facets?.categories?.length ?? 0} />
        <Stat title="Not yet sorted" value={facets?.unlabelled ?? 0} hint="waiting for a category" />
      </div>

      {facets?.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setCategory(ALL)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${category === ALL ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            All
          </button>
          {facets.categories.map((c) => (
            <button key={c.category} type="button" onClick={() => setCategory(c.category)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${category === c.category ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {c.label || label(c.category)} · {c.n}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Empty title="Nothing found for this day" body={beatObj ? `No story matched ${beatObj.label}. Try "All stories" or another day.` : 'Try another day or category.'} />
      ) : (
        <div className="space-y-2">
          {rows.map((a) => <ArticleCard key={a.uid} a={a} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
};

/* ---------- Search ---------- */

const SearchTab = ({ beat, beats, papers, onOpen }) => {
  const [q, setQ] = useState('');
  const [paper, setPaper] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cats, setCats] = useState([]);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState('');

  useEffect(() => {
    epaperApi.facets({}).then((f) => setCats(f?.categories || [])).catch(() => setCats([]));
  }, []);

  const run = async (e) => {
    e?.preventDefault();
    const text = q.trim();
    if (!text) return;
    setLoading(true);
    try {
      const data = await epaperApi.search({
        q: text,
        limit: 60,
        ...(beat ? { beat } : {}),
        ...(paper !== ALL ? { paper } : {}),
        ...(category !== ALL ? { category } : {}),
        ...(from ? { date_from: from } : {}),
        ...(to ? { date_to: to } : {}),
      });
      setRes(data);
      setRan(text);
    } catch (err) {
      toast.error(errMsg(err, 'Search failed'));
    } finally {
      setLoading(false);
    }
  };

  const words = useMemo(() => ran.split(/\s+/).filter(Boolean), [ran]);
  const beatObj = beats.find((b) => b.id === beat);

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search newspapers: name, place, incident, keyword…" className="h-10 pl-9 pr-24 text-sm" />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 px-3 text-xs" disabled={loading || !q.trim()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={paper} onValueChange={setPaper}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Newspaper" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All newspapers</SelectItem>
              {papers.map((p) => <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All categories</SelectItem>
              {cats.map((c) => <SelectItem key={c.category} value={c.category} className="text-xs">{c.label || label(c.category)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" aria-label="To date" />
        </div>
        {beatObj && <p className="text-[11px] text-muted-foreground">Limited to <span className="font-semibold text-foreground">{beatObj.label}</span>. Change it at the top of the page.</p>}
      </form>

      {res && (
        <p className="text-xs text-muted-foreground">
          {res.total} result{res.total === 1 ? '' : 's'} for “{ran}” · {res.took_ms} ms
          {res.loose ? ' · includes looser matches (word endings differ)' : ''}
        </p>
      )}

      {!res ? (
        <Empty icon={Search} title="Search everything the papers printed" body="Type a name, place or incident. Results are ranked by how closely they match." />
      ) : res.results?.length === 0 ? (
        <Empty title="No stories matched" body="Try fewer words, another spelling, or remove a filter." />
      ) : (
        <div className="space-y-2">{res.results.map((a) => <ArticleCard key={a.uid} a={a} words={words} onOpen={onOpen} />)}</div>
      )}
    </div>
  );
};

/* ---------- Coverage ---------- */

const BarList = ({ title, rows, nameOf }) => {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="mb-2 text-xs font-semibold">{title}</p>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No data yet</p> : (
        <ul className="space-y-1.5">
          {rows.slice(0, 10).map((r) => (
            <li key={nameOf(r)} className="text-[11px]">
              <div className="mb-0.5 flex justify-between gap-2"><span className="truncate">{label(nameOf(r))}</span><span className="text-muted-foreground">{r.n}</span></div>
              <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const CoverageTab = ({ corpus, dates }) => {
  const days = dates.slice(0, 14).reverse();
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat title="Articles" value={corpus?.articles ?? 0} />
        <Stat title="Pages" value={corpus?.pages ?? 0} />
        <Stat title="Issues" value={corpus?.epapers ?? 0} />
        <Stat title="Searches made" value={corpus?.searches ?? 0} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="mb-2 text-xs font-semibold">Stories per day (last 14 days with papers)</p>
        {days.length === 0 ? <p className="text-xs text-muted-foreground">No data yet</p> : (
          <div className="flex h-28 items-end gap-1">
            {days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${fmtDate(d.date)}: ${d.n}`}>
                <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} />
                <span className="text-[9px] text-muted-foreground">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <BarList title="By newspaper" rows={corpus?.by_paper || []} nameOf={(r) => r.paper || 'Unknown'} />
        <BarList title="By force / beat" rows={corpus?.by_beat || []} nameOf={(r) => r.beat || 'None'} />
        <BarList title="By category" rows={corpus?.by_category || []} nameOf={(r) => r.category || 'Unsorted'} />
      </div>
    </div>
  );
};

/* ---------- Page ---------- */

const beatKey = () => `epaper_beat:${window.location.host}`;

export default function EpaperIntel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [tab, setTab] = useState('briefing');
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState('');
  const [corpus, setCorpus] = useState(null);
  const [dates, setDates] = useState([]);
  const [beats, setBeats] = useState([]);
  const [papers, setPapers] = useState([]);
  const [beat, setBeat] = useState(() => {
    try { return localStorage.getItem(beatKey()) || ''; } catch { return ''; }
  });
  const [openUid, setOpenUid] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setOffline('');
    try {
      const [h, c, d, b, p] = await Promise.all([
        epaperApi.health(),
        epaperApi.corpus().catch(() => null),
        epaperApi.archiveDates().catch(() => []),
        epaperApi.beats().catch(() => []),
        epaperApi.papers().catch(() => []),
      ]);
      setHealth(h);
      setCorpus(c);
      setDates(Array.isArray(d) ? d : []);
      setBeats((Array.isArray(b) ? b : []).filter((x) => x.enabled !== false));
      setPapers(Array.isArray(p) ? p : []);
    } catch (e) {
      setHealth(null);
      setOffline(errMsg(e, 'The E-Paper service is not reachable'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chooseBeat = (v) => {
    const next = v === ALL ? '' : v;
    setBeat(next);
    try { localStorage.setItem(beatKey(), next); } catch { /* storage may be blocked */ }
  };

  const tabs = [
    { id: 'briefing', label: 'Briefing', icon: Newspaper },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'coverage', label: 'Coverage', icon: BarChart3 },
    ...(isAdmin ? [{ id: 'operator', label: 'Operator', icon: Wrench }] : []),
  ];

  const modelDown = health && (health.vlm_ok === false || health.ocr_ok === false);

  return (
    <div className="flex h-full min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card/80">
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Newspaper className="h-4 w-4" /></span>
            <div>
              <h1 className="font-heading text-base font-bold leading-none tracking-tight">Newspaper Intelligence</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">What the papers printed about your force, searchable and in English</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={beat || ALL} onValueChange={chooseBeat}>
              <SelectTrigger className="h-8 w-52 text-xs"><ShieldCheck className="mr-1 h-3.5 w-3.5" /><SelectValue placeholder="Force / beat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-xs">All stories</SelectItem>
                {beats.map((b) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={load}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5 sm:px-3">
          {tabs.map(({ id, label: l, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === id ? 'bg-primary/10 text-foreground ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className={`mx-auto px-3 py-4 sm:px-4 sm:py-5 ${tab === 'operator' ? 'max-w-5xl' : 'max-w-4xl'}`}>
          {offline && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">The E-Paper service is not reachable</p><p className="mt-0.5 opacity-90">{offline}</p></div>
              <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={load}>Retry</Button>
            </div>
          )}

          {!offline && modelDown && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Page reading is offline</p>
                <p className="mt-0.5 opacity-90">New newspaper pages that need reading cannot be processed until the reading service is back. Articles already collected are still searchable.</p>
              </div>
            </div>
          )}

          {!offline && !loading && (corpus?.articles ?? 0) === 0 && tab !== 'operator' && (
            <div className="mb-4">
              <Empty title="No articles in the archive yet"
                body={isAdmin ? 'Collect or upload pages from the Operator tab. Once articles are read they show up here.' : 'No articles have been collected yet. Ask an admin to collect newspapers.'} />
            </div>
          )}

          {!offline && tab === 'briefing' && <BriefingTab beat={beat} beats={beats} dates={dates} onOpen={setOpenUid} />}
          {!offline && tab === 'search' && <SearchTab beat={beat} beats={beats} papers={papers} onOpen={setOpenUid} />}
          {!offline && tab === 'coverage' && <CoverageTab corpus={corpus} dates={dates} />}
          {tab === 'operator' && isAdmin && <EpaperWorkspace />}
        </div>
      </main>

      <Reader uid={openUid} onClose={() => setOpenUid(null)} />
    </div>
  );
}
