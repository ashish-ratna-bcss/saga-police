import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, ExternalLink, Image as ImageIcon, Loader2, Play, RefreshCw, Search, Video as VideoIcon } from 'lucide-react';
import { profileReportApi } from '../../../api/profileReport.api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { cn } from '../../../lib/utils';
import { formatCount, formatWhen, platformLabel, postBody, readingOf, videoOf } from './reportFormat';

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

// A small picture beside the text. A video that plays in the card has its own player, so it gets no thumbnail.
const Thumb = ({ post, video }) => {
  const [ok, setOk] = useState(true);
  const src = video.poster;
  if (!src || !ok) return null;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setOk(false)}
        className="h-full w-full rounded-md border object-cover"
      />
      {video.isVideo ? <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/25"><Play className="h-5 w-5 fill-white text-white" /></span> : null}
    </div>
  );
};

/**
 * The post's video, brought in as it is (nothing is analysed for it). A platform file plays right in the card; YouTube loads
 * its player when asked, so a page of posts does not open thirty players. If the platform's link has expired, the original is one click away.
 */
const PostVideo = ({ video, url }) => {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [posterOk, setPosterOk] = useState(true);

  if (video.src && !failed) {
    // #t=0.1 makes the browser show the first frame instead of a black box; streams (.m3u8) are left as they are
    const src = /#|\.m3u8/i.test(video.src) ? video.src : `${video.src}#t=0.1`;
    return (
      <video
        data-post-video
        src={src}
        controls
        preload="metadata"
        playsInline
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="mt-2 max-h-96 w-full max-w-md rounded-md border bg-black object-contain"
      />
    );
  }
  if (video.embed && !failed) {
    return playing ? (
      <iframe
        data-post-video
        title="Video"
        src={`${video.embed}?autoplay=1&rel=0`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="mt-2 aspect-video w-full max-w-md rounded-md border bg-black"
      />
    ) : (
      <button
        type="button"
        data-post-video-play
        onClick={() => setPlaying(true)}
        aria-label="Play the video"
        className="relative mt-2 flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-md border bg-black"
      >
        {video.poster && posterOk ? <img src={video.poster} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setPosterOk(false)} className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow"><Play className="ml-0.5 h-5 w-5 fill-black text-black" /></span>
      </button>
    );
  }
  return (
    <p className="mt-2 text-xs text-muted-foreground" data-video-unavailable>
      The video could not be loaded here (the platform's link may have expired).
      {url ? <> <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">Open the original</a> to watch it.</> : null}
    </p>
  );
};

const AnalysisChips = ({ post }) => {
  const a = post.analysis;
  if (post.analysis_status === 'done' && a) {
    return (
      <>
        {a.sentiment ? (
          <span
            className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize text-white', TONE[a.sentiment] || 'bg-slate-400')}
            title={a.sentiment_api && a.sentiment_api !== a.sentiment ? `The classifier said ${a.sentiment_api}; read in context it is ${a.sentiment}.` : undefined}
          >
            {a.sentiment}
          </span>
        ) : null}
        {a.tone && a.tone !== 'unclear' ? <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-violet-800" data-tone>{a.tone}</span> : null}
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

const PostCard = ({ post }) => {
  const body = postBody({ text: post.text, image_text: post.image_text, english: post.analysis?.english_text, scene: post.image_description });
  const video = videoOf(post);
  const plays = Boolean(video.src || video.embed);
  return (
  <article className="flex gap-3 rounded-lg border bg-card p-3">
    {plays ? null : <Thumb post={post} video={video} />}
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
        {video.isVideo
          ? <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700" data-video-chip><VideoIcon className="h-3 w-3" />Video post</span>
          : body.imageOnly ? <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"><ImageIcon className="h-3 w-3" />Image post</span> : null}
        {body.main || <span className="text-muted-foreground">{body.noWords && !video.isVideo ? 'no caption, no text on the picture' : '(no caption)'}</span>}
      </p>
      {plays ? <PostVideo video={video} url={post.url} /> : null}
      {body.english ? (
        <p className="mt-1 line-clamp-3 border-l-2 border-sky-200 pl-2 text-xs text-muted-foreground"><span className="font-semibold text-sky-700">EN</span> {body.english}</p>
      ) : null}
      {body.imageText ? (
        <p className="mt-1 line-clamp-3 border-l-2 border-violet-200 pl-2 text-xs text-muted-foreground">
          <ImageIcon className="mr-1 inline h-3 w-3 text-violet-700" /><span className="font-semibold text-violet-700">Image text</span> {body.imageText}
        </p>
      ) : null}
      {body.picture ? (
        <p className="mt-1 line-clamp-3 border-l-2 border-fuchsia-200 pl-2 text-xs text-muted-foreground">
          <ImageIcon className="mr-1 inline h-3 w-3 text-fuchsia-700" /><span className="font-semibold text-fuchsia-700">Picture</span> {body.picture}
        </p>
      ) : null}
      {readingOf({ meaning: post.analysis?.meaning, scene: post.image_description }) ? (
        <p className="mt-1 text-xs" data-meaning>
          <span className="font-semibold text-foreground">Reading</span> <span className="text-muted-foreground">{post.analysis.meaning}</span>
        </p>
      ) : null}
      {post.image_signals?.length ? (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-picture-seen>
          <span className="font-semibold text-amber-800">Seen in the picture</span>
          {post.image_signals.map((s) => <span key={s} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900">{s}</span>)}
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
};

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
