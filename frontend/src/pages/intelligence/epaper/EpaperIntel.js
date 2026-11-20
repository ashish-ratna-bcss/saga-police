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

const FALLBACK_CATEGORIES = ['crime', 'investigation', 'policing', 'security', 'traffic', 'court', 'politics', 'civic', 'business', 'education', 'health', 'sports', 'entertainment', 'accident', 'environment', 'agriculture', 'technology', 'religion', 'world', 'other'];

const FetchTab = ({ onSaved, onOpen }) => {
  const [papers, setPapers] = useState([]);
  const [cats, setCats] = useState(FALLBACK_CATEGORIES);
  const [paper, setPaper] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState('100');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [ran, setRan] = useState('');

  useEffect(() => {
    epaperApi.papers().then((p) => setPapers(Array.isArray(p) ? p : [])).catch(() => setPapers([]));
    epaperApi.categoryTree().then((t) => { if (Array.isArray(t?.parents) && t.parents.length) setCats(t.parents); }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const out = await epaperApi.fetchPosts({
        ...(paper !== ALL ? { paper } : {}),
        ...(category !== ALL ? { category } : {}),
        ...(from ? { date_from: from } : {}),
        ...(to ? { date_to: to } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        limit: Number(limit),
      });
      setRes(out);
      setRan(q.trim());
      if (out.saved > 0) {
        toast.success(`${out.saved} post${out.saved === 1 ? '' : 's'} saved (${out.added} new)`);
        onSaved();
      }
    } catch (err) {
      setRes(null);
      setError(errMsg(err, 'Could not fetch posts'));
    } finally {
      setBusy(false);
    }
  };

  const words = useMemo(() => ran.split(/\s+/).filter(Boolean), [ran]);

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs font-medium">Newspaper
          <Select value={paper} onValueChange={setPaper}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Newspaper" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Any newspaper</SelectItem>
              {papers.map((p) => <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">From date
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium">To date
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium">Category
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Any category</SelectItem>
              {cats.map((c) => <SelectItem key={c} value={c} className="text-xs">{label(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">Keyword (optional)
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keyword, name or place" className="h-9 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium">How many
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['25', '50', '100', '200'].map((n) => <SelectItem key={n} value={n} className="text-xs">Up to {n} posts</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" className="h-9 gap-1.5 text-xs" disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {busy ? 'Fetching…' : 'Search and fetch'}
          </Button>
        </div>
      </form>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</p>}

      {res && (
        res.found === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No posts found for these filters.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Found {res.found} · saved {res.saved} to the database ({res.added} new, {res.updated} already there)
            </p>
            <div className="space-y-2">{res.results.map((p) => <PostCard key={p.id} post={p} words={words} onOpen={onOpen} />)}</div>
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
