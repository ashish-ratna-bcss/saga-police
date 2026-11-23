import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Languages, Library, Loader2, Newspaper, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { epaperApi } from '../../../api';

/**
 * E-Paper posts.
 *  - "All posts": everything saved in this tenant's database.
 *  - "Fetch posts": pick filters, fetch matching posts from the E-Paper service; they are saved and shown.
 */

const ALL = '__all';

const errMsg = (err, fallback) => {
  const d = err?.response?.data;
  return d?.message || d?.error?.message || d?.detail || err?.message || fallback;
};

const label = (v) => String(v || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (d) => {
  if (!d) return '';
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const Highlight = ({ text, words }) => {
  if (!text) return null;
  const list = (words || []).filter((w) => w && w.length > 1).slice(0, 8);
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

const cropUrl = (p) => (p?.job_id && p?.crop ? epaperApi.mediaUrl(p.job_id, String(p.crop).replace(/^\//, '')) : null);

const PostCard = ({ post, words, onOpen }) => {
  const crop = cropUrl(post);
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      {crop && (
        <img src={crop} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="hidden h-24 w-20 shrink-0 rounded-md border border-border bg-muted object-cover object-top sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">{post.paper}</span>
          {post.edition && <span>· {post.edition}</span>}
          {post.page_number ? <span>· Page {post.page_number}</span> : null}
          {post.date && <span>· {fmtDate(post.date)}</span>}
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-snug"><Highlight text={post.headline || '(no headline read)'} words={words} /></h3>
        {post.body && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground"><Highlight text={post.body} words={words} /></p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {post.category && <Badge variant="secondary" className="text-[10px]">{label(post.category)}</Badge>}
          {post.subcategory && <Badge variant="outline" className="text-[10px]">{label(post.subcategory)}</Badge>}
          {(post.tags || []).slice(0, 4).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{label(t)}</Badge>)}
        </div>
      </div>
    </button>
  );
};

/* ---------- Reader ---------- */

const Reader = ({ post, onClose }) => {
  const [tr, setTr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setTr(null); }, [post?.id]);

  const crop = cropUrl(post);
  const fullText = post ? [post.headline, post.byline, post.body].filter(Boolean).join('\n\n') : '';

  const translate = async () => {
    setBusy(true);
    try {
      const out = await epaperApi.translateArticle(fullText, post?.lang);
      if (out?.english) setTr(out);
      else toast.error('Translation is not available right now');
    } catch (e) {
      toast.error(errMsg(e, 'Translation failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Could not copy'); }
  };

  return (
    <Sheet open={Boolean(post)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-6 text-base leading-snug">{post?.headline || 'Post'}</SheetTitle>
          <SheetDescription className="text-xs">
            {post ? [post.paper, post.edition, post.page_number ? `Page ${post.page_number}` : null, fmtDate(post.date)].filter(Boolean).join(' · ') : ' '}
          </SheetDescription>
        </SheetHeader>

        {post && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-1">
              {post.category && <Badge variant="secondary" className="text-[10px]">{label(post.category)}</Badge>}
              {post.subcategory && <Badge variant="outline" className="text-[10px]">{label(post.subcategory)}</Badge>}
              {(post.tags || []).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{label(t)}</Badge>)}
            </div>
            {(post.byline || post.dateline) && <p className="text-xs text-muted-foreground">{[post.byline, post.dateline].filter(Boolean).join(' · ')}</p>}
            {crop && <img src={crop} alt="Clipping" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="max-h-72 w-full rounded-lg border border-border bg-muted object-contain" />}

            <div className="flex flex-wrap gap-2">
              {post.lang && post.lang !== 'en' && (
                <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={translate} disabled={busy || !post.body}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />} Translate to English
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copy(fullText)}>
                <Copy className="h-3.5 w-3.5" /> Copy text
              </Button>
            </div>

            {tr && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                {tr.summary && <p className="text-xs leading-relaxed"><Sparkles className="mr-1 inline h-3 w-3 text-primary" /><span className="font-semibold">Summary: </span>{tr.summary}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{tr.english}</p>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => copy(tr.english)}>
                  <Copy className="h-3 w-3" /> Copy English
                </Button>
              </div>
            )}

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Original text</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body || 'No text was read for this clipping.'}</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

/* ---------- Tab 1: all saved posts ---------- */

const AllPostsTab = ({ refreshKey, onOpen }) => {
  const [q, setQ] = useState('');
  const [paper, setPaper] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState('');

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await epaperApi.posts({
        page: nextPage,
        per_page: 30,
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(paper !== ALL ? { paper } : {}),
        ...(category !== ALL ? { category } : {}),
        ...(from ? { date_from: from } : {}),
        ...(to ? { date_to: to } : {}),
      });
      setData(res);
      setApplied(q.trim());
    } catch (e) {
      toast.error(errMsg(e, 'Could not load posts'));
    } finally {
      setLoading(false);
    }
  }, [page, q, paper, category, from, to]);

  useEffect(() => { load(page); }, [page, paper, category, from, to, refreshKey]); // eslint-disable-line

  const submit = (e) => { e.preventDefault(); if (page === 1) load(1); else setPage(1); };
  const words = useMemo(() => applied.split(/\s+/).filter(Boolean), [applied]);

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved posts…" className="h-9 pl-9 text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={paper} onValueChange={(v) => { setPaper(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Newspaper" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All newspapers</SelectItem>
              {(data?.papers || []).map((p) => <SelectItem key={p.paper} value={p.paper} className="text-xs">{p.paper} · {p.n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">All categories</SelectItem>
              {(data?.categories || []).map((c) => <SelectItem key={c.category} value={c.category} className="text-xs">{label(c.category)} · {c.n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-8 w-36 text-xs" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-8 w-36 text-xs" aria-label="To date" />
          <Button type="submit" size="sm" className="h-8 text-xs">Search</Button>
        </div>
      </form>

      {data && <p className="text-xs text-muted-foreground">{data.total} post{data.total === 1 ? '' : 's'}{data.total !== data.total_saved ? ` of ${data.total_saved} saved` : ' saved'}</p>}

      {loading && !data ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !data?.results?.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{data?.total_saved ? 'No posts match these filters.' : 'No posts saved yet. Use "Fetch posts" to get some.'}</p>
      ) : (
        <>
          <div className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
            {data.results.map((p) => <PostCard key={p.id} post={p} words={words} onOpen={onOpen} />)}
          </div>
          {data.pages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Page {data.page} of {data.pages}</span>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={data.page <= 1 || loading} onClick={() => setPage(data.page - 1)}>Previous</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={data.page >= data.pages || loading} onClick={() => setPage(data.page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ---------- Tab 2: fetch posts ---------- */

const SCOPES = [
  ['page', 'One page'],
  ['range', 'Page range'],
  ['whole', 'Whole paper'],
];

const Field = ({ title, children }) => (
  <label className="block space-y-1 text-xs font-medium">{title}{children}</label>
);

const FetchTab = ({ onSaved, onOpen }) => {
  const [papers, setPapers] = useState([]);
  const [states, setStates] = useState([]);
  const [state, setState] = useState(ALL);
  const [host, setHost] = useState('');
  const [editions, setEditions] = useState([]);
  const [editionsLoading, setEditionsLoading] = useState(false);
  const [titleId, setTitleId] = useState('');
  const [dates, setDates] = useState([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [date, setDate] = useState('');
  const [scope, setScope] = useState('page');
  const [pageNo, setPageNo] = useState('1');
  const [fromPage, setFromPage] = useState('1');
  const [toPage, setToPage] = useState('8');
  const [withText, setWithText] = useState(true);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null); // latest status from the server
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([epaperApi.papers().catch(() => []), epaperApi.beats().catch(() => [])]).then(([p, b]) => {
      const list = Array.isArray(p) ? p : [];
      setPapers(list);
      // Every state and union territory the app knows about; flag the ones no catalogued newspaper covers.
      const names = {};
      (Array.isArray(b) ? b : []).forEach((x) => { if (x.state_code) names[x.state_code] = x.state; });
      const covered = new Set(list.flatMap((x) => x.states || []));
      const codes = [...new Set([...Object.keys(names), ...covered])];
      setStates(
        codes
          .map((c) => ({ code: c, name: names[c] || c, covered: covered.has(c) }))
          .sort((m, n) => m.name.localeCompare(n.name))
      );
    });
  }, []);

  const shownPapers = useMemo(
    () => papers.filter((p) => state === ALL || p.national || (p.states || []).includes(state)),
    [papers, state]
  );

  // paper -> editions
  useEffect(() => {
    setEditions([]); setTitleId(''); setDates([]); setDate('');
    if (!host) return undefined;
    let off = false;
    setEditionsLoading(true);
    epaperApi.editions(host)
      .then((e) => { if (!off) setEditions(Array.isArray(e) ? e : []); })
      .catch((e) => { if (!off) toast.error(errMsg(e, 'Could not load editions')); })
      .finally(() => { if (!off) setEditionsLoading(false); });
    return () => { off = true; };
  }, [host]);

  // edition -> dates
  useEffect(() => {
    setDates([]); setDate('');
    if (!host || !titleId) return undefined;
    let off = false;
    setDatesLoading(true);
    epaperApi.dates(host, titleId)
      .then((d) => { if (!off) setDates(Array.isArray(d) ? d : []); })
      .catch((e) => { if (!off) toast.error(errMsg(e, 'Could not load dates')); })
      .finally(() => { if (!off) setDatesLoading(false); });
    return () => { off = true; };
  }, [host, titleId]);

  const running = job && (job.status === 'queued' || job.status === 'running');

  // poll the started job until it finishes
  const jobId = job?.job_id;
  useEffect(() => {
    if (!jobId || !running) return undefined;
    let off = false;
    const tick = async () => {
      try {
        const st = await epaperApi.extractStatus(jobId, scope === 'range' ? { from_page: fromPage, to_page: toPage } : {});
        if (off) return;
        setJob(st);
        if (st.status === 'done') {
          if (st.saved > 0) { toast.success(`${st.saved} post${st.saved === 1 ? '' : 's'} saved (${st.added} new)`); onSaved(); }
        } else if (st.status === 'error') {
          setError(st.error || 'The page could not be read');
        }
      } catch (e) {
        if (!off) { setError(errMsg(e, 'Lost contact with the E-Paper service')); setJob((j) => (j ? { ...j, status: 'error' } : j)); }
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => { off = true; window.clearInterval(timer); };
  }, [jobId, running]); // eslint-disable-line

  const edition = editions.find((e) => String(e.id) === String(titleId));
  const canFetch = host && titleId && date && !starting && !running;

  const submit = async (e) => {
    e.preventDefault();
    setStarting(true);
    setError('');
    setJob(null);
    try {
      const out = await epaperApi.extractPosts({
        host,
        title_id: titleId,
        date,
        edition: edition?.name || '',
        scope,
        page_no: Number(pageNo) || 1,
        from_page: Number(fromPage) || 1,
        to_page: Number(toPage) || 1,
        with_text: withText,
      });
      setJob({ job_id: out.job_id, status: 'queued', stage: 'starting', kind: out.kind });
    } catch (err) {
      setError(errMsg(err, 'Could not start the fetch'));
    } finally {
      setStarting(false);
    }
  };

  const numberInput = (value, set, label) => (
    <Input type="number" min={1} max={200} value={value} onChange={(e) => set(e.target.value)} className="h-9 text-xs" aria-label={label} />
  );

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field title="State">
            <Select value={state} onValueChange={(v) => { setState(v); setHost(''); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-xs">All states</SelectItem>
                {states.map((s) => (
                  <SelectItem key={s.code} value={s.code} disabled={!s.covered} className="text-xs">
                    {s.name}{s.covered ? '' : ' (no newspapers yet)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field title="Newspaper">
            <Select value={host} onValueChange={setHost}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {shownPapers.map((p) => <SelectItem key={p.host} value={p.host} className="text-xs">{p.name} ({p.lang})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field title="Edition">
            <Select value={titleId} onValueChange={setTitleId} disabled={!host || editionsLoading}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={!host ? 'Pick a newspaper' : editionsLoading ? 'Loading…' : 'Select…'} /></SelectTrigger>
              <SelectContent>
                {editions.map((x) => <SelectItem key={x.id} value={String(x.id)} className="text-xs">{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field title="Date">
            <Select value={date} onValueChange={setDate} disabled={!titleId || datesLoading}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={!titleId ? 'Pick an edition' : datesLoading ? 'Loading…' : dates.length ? 'Select…' : 'No free issues'} />
              </SelectTrigger>
              <SelectContent>
                {dates.map((d) => <SelectItem key={d.date} value={d.date} className="text-xs">{fmtDate(d.date)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium">How much</p>
            <div className="flex gap-1">
              {SCOPES.map(([id, text]) => (
                <button key={id} type="button" onClick={() => setScope(id)} aria-pressed={scope === id}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${scope === id ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          {scope === 'page' && <Field title="Page"><div className="w-24">{numberInput(pageNo, setPageNo, 'Page number')}</div></Field>}
          {scope === 'range' && (
            <>
              <Field title="From page"><div className="w-24">{numberInput(fromPage, setFromPage, 'From page')}</div></Field>
              <Field title="To page"><div className="w-24">{numberInput(toPage, setToPage, 'To page')}</div></Field>
            </>
          )}
        </div>

        {scope !== 'page' && (
          <p className="text-[11px] text-muted-foreground">Each page is read in turn, roughly a minute per page. Pages already held are skipped.</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} className="mt-0.5" />
            <span>Read full article text<span className="block text-[11px] text-muted-foreground">Needed for categories and search (slower)</span></span>
          </label>
          <Button type="submit" className="h-9 gap-1.5 text-xs" disabled={!canFetch}>
            {starting || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {starting ? 'Starting…' : running ? 'Fetching…' : 'Fetch posts'}
          </Button>
        </div>
      </form>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</p>}

      {running && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <div>
            <p className="font-semibold">Reading {job.paper || 'the paper'}{job.edition ? ` · ${job.edition}` : ''}</p>
            <p className="text-muted-foreground">
              {job.stage || 'working'}
              {job.n_pages ? ` · page ${Math.min(job.pages_done + 1, job.n_pages)} of ${job.n_pages}` : ''}
            </p>
          </div>
        </div>
      )}

      {job?.status === 'done' && (
        job.saved === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold">No posts could be read from this page</p>
            <p className="mx-auto mt-1 max-w-lg text-xs opacity-90">
              {job.reason || 'The page had no readable articles. Try another page or date.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {job.saved} post{job.saved === 1 ? '' : 's'} saved to the database ({job.added} new, {job.updated} already there)
            </p>
            <div className="space-y-2">{(job.results || []).map((p) => <PostCard key={p.id} post={p} onOpen={onOpen} />)}</div>
          </>
        )
      )}
    </div>
  );
};

/* ---------- Page ---------- */

export default function EpaperIntel() {
  const [tab, setTab] = useState('all');
  const [openPost, setOpenPost] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { id: 'all', label: 'All posts', icon: Library },
    { id: 'fetch', label: 'Fetch posts', icon: Download },
  ];

  return (
    <div className="flex h-full min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card/80">
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Newspaper className="h-4 w-4" /></span>
          <div>
            <h1 className="font-heading text-base font-bold leading-none tracking-tight">E-Paper</h1>
            <p className="mt-1 text-[11px] text-muted-foreground">Newspaper posts saved for your team</p>
          </div>
        </div>
        <nav className="flex gap-1 border-t border-border px-2 py-1.5 sm:px-3">
          {tabs.map(({ id, label: l, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === id ? 'bg-primary/10 text-foreground ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-5">
          {tab === 'all' && <AllPostsTab refreshKey={refreshKey} onOpen={setOpenPost} />}
          {tab === 'fetch' && <FetchTab onSaved={() => setRefreshKey((k) => k + 1)} onOpen={setOpenPost} />}
        </div>
      </main>

      <Reader post={openPost} onClose={() => setOpenPost(null)} />
    </div>
  );
}
