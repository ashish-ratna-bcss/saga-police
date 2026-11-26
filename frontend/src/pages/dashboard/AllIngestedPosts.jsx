import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Repeat2,
  Eye,
  Search,
  X,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

const engagementValue = (engagement, keys) => {
  if (!engagement || typeof engagement !== 'object') return 0;
  for (const k of keys) {
    const n = Number(engagement[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

const formatCount = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('en-IN');
};

const formatWhen = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 14) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const mediaPreviewUrl = (mediaUrls) => {
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return null;
  const first = mediaUrls[0];
  if (typeof first === 'string' && /^https?:\/\//i.test(first)) return first;
  if (first && typeof first === 'object') {
    return first.url || first.src || first.thumbnail || first.preview_url || null;
  }
  return null;
};

const riskTone = (v) => {
  const s = String(v || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300';
  if (s === 'medium') return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  if (s === 'low') return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  return 'bg-muted text-muted-foreground';
};

const TEXT_PREVIEW = 280;

const PostCard = ({ post }) => {
  const [expanded, setExpanded] = useState(false);
  const likes = engagementValue(post.engagement, ['likes', 'like', 'reactions', 'favorites']);
  const comments = engagementValue(post.engagement, ['comments', 'replies', 'reply']);
  const shares = engagementValue(post.engagement, ['shares', 'retweets', 'reposts', 'forwards']);
  const views = engagementValue(post.engagement, ['views', 'view', 'play_count']);
  const image = mediaPreviewUrl(post.media_urls);
  const when = formatWhen(post.posted_at || post.fetched_at);
  const handle = post.author_handle
    ? `@${String(post.author_handle).replace(/^@/, '')}`
    : post.author_name || null;
  const fullText = String(post.text || '').trim();
  const needsMore = fullText.length > TEXT_PREVIEW;
  const shownText =
    !fullText
      ? null
      : expanded || !needsMore
        ? fullText
        : `${fullText.slice(0, TEXT_PREVIEW).trimEnd()}…`;

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3.5 shadow-sm transition hover:border-border/80 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {post.platform ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <PlatformBrandIcon platform={post.platform} className="h-3.5 w-3.5" />
              <span className="capitalize">{post.platform}</span>
            </span>
          ) : null}
          {handle ? <span className="truncate">{handle}</span> : null}
          {when ? <span>· {when}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {post.sentiment ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold capitalize text-foreground">
              {post.sentiment}
            </span>
          ) : null}
          {post.risk_level ? (
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', riskTone(post.risk_level))}>
              Risk {String(post.risk_level)}
            </span>
          ) : null}
        </div>
      </div>

      <div className={cn('mt-2 flex-1', image ? 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem] sm:items-start' : '')}>
        <div className="min-w-0">
          {shownText ? (
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-foreground">{shownText}</p>
          ) : (
            <p className="text-[13px] italic text-muted-foreground">No text content</p>
          )}
          {needsMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] font-semibold text-primary hover:underline"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          ) : null}
        </div>
        {image ? (
          <a
            href={post.url || image}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md bg-muted"
          >
            <img src={image} alt="" className="h-24 w-full object-cover sm:h-20" loading="lazy" />
          </a>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/70">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Heart className="h-3 w-3 text-rose-500" />
            {formatCount(likes)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <MessageCircle className="h-3 w-3 text-sky-600" />
            {formatCount(comments)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Repeat2 className="h-3 w-3 text-emerald-600" />
            {formatCount(shares)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Eye className="h-3 w-3 text-violet-600" />
            {formatCount(views)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {post.account_id ? (
            <Link
              to={`/social-profiles/${post.account_id}`}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Profile
            </Link>
          ) : null}
          {post.url ? (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
};

/**
 * Full-screen “All Posts” view (same pattern as Alerts → Top 50).
 */
const AllIngestedPosts = ({ open, onClose, initialRange = '7d', initialPlatform = 'all', platformOptions = [] }) => {
  const [range, setRange] = useState(initialRange);
  const [platform, setPlatform] = useState(initialPlatform);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [posts, setPosts] = useState([]);
  const [byPlatform, setByPlatform] = useState({});
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = useCallback(
    async ({ page = 1, append = false, rangeKey = range, platformKey = platform, query = q } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get('/dashboard/posts', {
          params: {
            range: rangeKey,
            platform: platformKey,
            page,
            limit: 40,
            ...(query ? { q: query } : {}),
          },
        });
        const data = res.data || {};
        const items = Array.isArray(data.posts) ? data.posts : [];
        setPosts((prev) => (append ? [...prev, ...items] : items));
        setByPlatform(data.by_platform || {});
        setPagination(
          data.pagination || {
            page,
            total: items.length,
            totalPages: 1,
            hasMore: false,
          }
        );
      } catch (err) {
        const message = err?.response?.data?.error || err.message || 'Failed to load posts';
        setError(message);
        if (!append) setPosts([]);
        toast.error(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [range, platform, q]
  );

  useEffect(() => {
    if (!open) return;
    setRange(initialRange);
    setPlatform(initialPlatform);
    setQ('');
    setSearchInput('');
    setPosts([]);
    setError(null);
  }, [open, initialRange, initialPlatform]);

  useEffect(() => {
    if (!open) return;
    fetchPosts({ page: 1, append: false });
  }, [open, range, platform, q, fetchPosts]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const platformFilters = useMemo(() => {
    const opts =
      platformOptions.length > 0
        ? platformOptions
        : [
            { id: 'all', label: 'All' },
            ...Object.keys(byPlatform)
              .sort()
              .map((id) => ({ id, label: id })),
          ];
    return opts;
  }, [platformOptions, byPlatform]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight">All Posts · Ingested Catalog</h1>
            <p className="text-[11px] text-indigo-100 truncate">
              {loading
                ? 'Loading ingested posts…'
                : `${Number(pagination.total || 0).toLocaleString('en-IN')} posts · ${range} timeframe${
                    platform !== 'all' ? ` · ${platform}` : ''
                  }`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1 rounded text-xs font-medium border ${
                  range === r.id
                    ? 'bg-white text-indigo-700 border-white'
                    : 'border-white/40 text-white hover:bg-white/20'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchPosts({ page: 1, append: false })}
            disabled={loading}
            className="px-3 py-1 rounded text-xs border border-white/40 text-white hover:bg-white/20 disabled:opacity-50 flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '↻'} Refresh
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-6 py-2.5 border-b border-border bg-muted/30">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Filter:</span>
        {platformFilters.map((p) => {
          const active = platform === p.id;
          const count =
            p.id === 'all'
              ? Object.values(byPlatform).reduce((s, n) => s + (Number(n) || 0), 0)
              : byPlatform[p.id] || 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                active
                  ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {p.label}
              {p.id !== 'all' || count > 0 ? ` (${Number(count).toLocaleString('en-IN')})` : ''}
            </button>
          );
        })}
        <form
          className="ml-auto flex items-center gap-1.5 min-w-[180px] max-w-xs flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(searchInput.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search text or author…"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs">
            Search
          </Button>
        </form>
      </div>

      {loading && posts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <div className="text-center">
            <p className="font-semibold text-slate-700 dark:text-slate-200 text-lg">Loading ingested posts…</p>
            <p className="text-sm text-slate-500 mt-1">Catalog posts from the selected telemetry window</p>
          </div>
        </div>
      ) : null}

      {!loading && error && posts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-lg text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="font-medium text-red-700 dark:text-red-300">{error}</p>
            <p className="text-xs text-red-500 mt-1">Try Refresh or change the time window.</p>
          </div>
        </div>
      ) : null}

      {!loading && !error && posts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
          <div className="text-center">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-foreground">No posts in this window</p>
            <p className="text-sm mt-1">Switch range or platform to see ingested catalog posts.</p>
          </div>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {pagination.hasMore ? (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => fetchPosts({ page: (pagination.page || 1) + 1, append: true })}
                className="gap-2"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground mt-6">
              Showing all {Number(pagination.total || posts.length).toLocaleString('en-IN')} posts
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default AllIngestedPosts;
