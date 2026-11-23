import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, ExternalLink, Image as ImageIcon, Loader2, RefreshCw, Search } from 'lucide-react';
import { profileReportApi } from '../../../api/profileReport.api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { cn } from '../../../lib/utils';
import { formatCount, formatWhen, platformLabel } from './reportFormat';

const PAGE_SIZE = 30;
const ALL = 'all';

const TONE = { positive: 'bg-emerald-500', neutral: 'bg-slate-400', negative: 'bg-rose-500' };
const RISK = {
  critical: 'border-rose-300 bg-rose-50 text-rose-700',
  high: 'border-rose-300 bg-rose-50 text-rose-700',
  medium: 'border-amber-300 bg-amber-50 text-amber-800',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
};
const KIND = { shared: 'shared', reply: 'reply', quote: 'quote' };
const VIDEO_URL = /\.(mp4|m4v|mov|webm|avi|mkv|m3u8)(\?.*)?$/i;

const FILTERS = {
  sentiment: [[ALL, 'Any tone'], ['positive', 'Positive'], ['neutral', 'Neutral'], ['negative', 'Negative']],
  risk: [[ALL, 'Any risk'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']],
  status: [[ALL, 'Any analysis'], ['done', 'Analysed'], ['waiting', 'Waiting'], ['skipped', 'No text'], ['failed', 'Failed']],
};

const Filter = ({ value, onChange, options, label, className }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={cn('h-8 text-xs', className)} aria-label={label}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
    </SelectContent>
  </Select>
);

const Thumb = ({ post }) => {
  const [ok, setOk] = useState(true);
  const src = (post.media_urls || []).find((u) => typeof u === 'string' && !VIDEO_URL.test(u));
  if (!src || !ok) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className="h-16 w-16 shrink-0 rounded-md border object-cover"
    />
  );
};

const AnalysisChips = ({ post }) => {
  const a = post.analysis;
  if (post.analysis_status === 'done' && a) {
    return (
      <>
        {a.sentiment ? <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize text-white', TONE[a.sentiment] || 'bg-slate-400')}>{a.sentiment}</span> : null}
        {a.risk_level ? (
          <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize', RISK[a.risk_level] || RISK.low)}>
            risk {a.risk_level}{a.risk_score != null ? ` · ${a.risk_score}` : ''}
          </span>
        ) : null}
        {a.stance ? <span className="rounded-full border bg-muted/40 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">stance {a.stance}</span> : null}
        {a.category ? <span className="rounded-full border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{String(a.category).replace(/_/g, ' ')}</span> : null}
      </>
    );
  }
  if (post.analysis_status === 'failed') {
    return <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700"><AlertTriangle className="h-2.5 w-2.5" /> Analysis failed</span>;
  }
  if (post.analysis_status === 'skipped') return <span className="rounded-full border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">No text to analyse</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
      {post.analysis_status === 'processing' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Clock className="h-2.5 w-2.5" />}
      {post.analysis_status === 'processing' ? 'Analysing' : 'Waiting for analysis'}
    </span>
  );
};

const PostCard = ({ post }) => (
  <article className="flex gap-3 rounded-lg border bg-card p-3">
    <Thumb post={post} />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-medium">{platformLabel(post.platform)}</span>
        <span className="tabular-nums text-muted-foreground">{post.posted_at ? formatWhen(post.posted_at) : 'undated'}</span>
        {KIND[post.kind] ? <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">{KIND[post.kind]}</span> : null}
        <span className="ml-auto flex items-center gap-2 tabular-nums text-muted-foreground">
          {['likes', 'reactions', 'retweets', 'shares', 'comments', 'replies', 'views'].filter((k) => Number(post.engagement?.[k]) > 0).slice(0, 4).map((k) => (
            <span key={k}>{formatCount(post.engagement[k])} {k}</span>
          ))}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-4 whitespace-pre-line break-words text-[13px] leading-relaxed">
        {post.text || <span className="text-muted-foreground">(no text)</span>}
      </p>
      {post.analysis?.english_text ? (
        <p className="mt-1 line-clamp-3 border-l-2 border-sky-200 pl-2 text-xs text-muted-foreground"><span className="font-semibold text-sky-700">EN</span> {post.analysis.english_text}</p>
      ) : null}
      {post.image_text ? (
        <p className="mt-1 line-clamp-3 border-l-2 border-violet-200 pl-2 text-xs text-muted-foreground">
          <ImageIcon className="mr-1 inline h-3 w-3 text-violet-700" /><span className="font-semibold text-violet-700">Image text</span> {post.image_text}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <AnalysisChips post={post} />
        {(post.analysis?.matched_keywords || []).slice(0, 3).map((k) => (
          <span key={k} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">{k}</span>
        ))}
        {post.url ? (
          <a href={post.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-700 hover:underline">
            <ExternalLink className="h-3 w-3" /> Original
          </a>
        ) : null}
      </div>
    </div>
  </article>
);

/**
 * Every post collected for a profile, newest first, with its analysis. Filters and paging run on the server, so a
 * history of tens of thousands of posts stays fast. While collection or analysis is still going on, the page refreshes quietly.
 */
export default function PostsPanel({ subject, busy }) {
  const [filters, setFilters] = useState({ platform: ALL, sentiment: ALL, risk: ALL, status: ALL, q: '' });
  const [typed, setTyped] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqRef = useRef(0);
  const subjectId = subject?.id;

  const params = useCallback(() => ({
    page,
    limit: PAGE_SIZE,
    ...(filters.platform !== ALL ? { platform: filters.platform } : {}),
    ...(filters.sentiment !== ALL ? { sentiment: filters.sentiment } : {}),
    ...(filters.risk !== ALL ? { risk: filters.risk } : {}),
    ...(filters.status !== ALL ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  }), [page, filters]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!subjectId) return;
    const run = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const res = await profileReportApi.posts(subjectId, params());
      if (run !== reqRef.current) return;
      setData(res.data);
      setError(null);
    } catch (err) {
      if (run !== reqRef.current) return;
      if (!quiet) setError('The posts could not be loaded. Try again in a moment.');
    } finally {
      if (run === reqRef.current && !quiet) setLoading(false);
    }
  }, [subjectId, params]);

  // A different profile starts from a clean slate.
  useEffect(() => {
    setFilters({ platform: ALL, sentiment: ALL, risk: ALL, status: ALL, q: '' });
    setTyped('');
    setPage(1);
    setData(null);
    setError(null);
  }, [subjectId]);

  useEffect(() => { load(); }, [load]);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === typed.trim() ? f : { ...f, q: typed.trim() })), 350);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => { setPage(1); }, [filters]);

  // New posts and finished analyses show up without clicking anything.
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, 8000);
    return () => clearInterval(id);
  }, [busy, load]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const platformOptions = [[ALL, 'All platforms'], ...[...new Set((subject?.accounts || []).map((a) => (a.platform === 'twitter' ? 'x' : a.platform)))].map((p) => [p, platformLabel(p)])];
  const total = data?.total ?? 0;
  const from = total ? (data.page - 1) * data.limit + 1 : 0;
  const to = total ? Math.min(total, data.page * data.limit) : 0;
  const filtered = Object.entries(filters).some(([k, v]) => (k === 'q' ? Boolean(v) : v !== ALL));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search the posts" className="h-8 pl-8 text-xs" aria-label="Search the posts" />
        </div>
        {platformOptions.length > 2 ? <Filter value={filters.platform} onChange={set('platform')} options={platformOptions} label="Platform" className="w-[130px]" /> : null}
        <Filter value={filters.sentiment} onChange={set('sentiment')} options={FILTERS.sentiment} label="Tone" className="w-[120px]" />
        <Filter value={filters.risk} onChange={set('risk')} options={FILTERS.risk} label="Risk" className="w-[110px]" />
        <Filter value={filters.status} onChange={set('status')} options={FILTERS.status} label="Analysis" className="w-[130px]" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load()} title="Refresh" aria-label="Refresh posts">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

      {!data && loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading posts…</div>
      ) : null}

      {data && total === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <p className="text-sm font-medium">{filtered ? 'No post matches these filters' : busy ? 'Posts are being collected…' : 'No posts found'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filtered ? 'Clear a filter or change the search.' : busy ? 'They appear here as they arrive.' : 'This profile has not published anything the platform shows, or the account is private.'}
          </p>
        </div>
      ) : null}

      {data && total > 0 ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            Showing <b className="tabular-nums text-foreground">{formatCount(from)}–{formatCount(to)}</b> of <b className="tabular-nums text-foreground">{formatCount(total)}</b> post{total === 1 ? '' : 's'}, newest first
          </p>
          <div className={cn('space-y-2 transition-opacity', loading && 'opacity-60')}>
            {data.posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={data.page <= 1 || loading} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Newer
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground">Page {formatCount(data.page)} of {formatCount(data.total_pages)}</span>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={data.page >= data.total_pages || loading} onClick={() => setPage((n) => n + 1)}>
              Older <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
