import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { TwitterAlertCard, YoutubeAlertCard } from '../../components/AlertCards';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

const toMediaList = (mediaUrls) => {
  if (!Array.isArray(mediaUrls)) return [];
  return mediaUrls
    .map((m) => {
      if (typeof m === 'string' && m.trim()) return { url: m.trim(), type: 'image' };
      if (m && typeof m === 'object') {
        const url = m.url || m.src || m.thumbnail || m.preview_url || m.media_url;
        if (!url) return null;
        return { ...m, url, type: m.type || m.media_type || 'image' };
      }
      return null;
    })
    .filter(Boolean);
};

/** Map catalog post → same alert/content/source shape Top 50 cards expect. */
const postToCardProps = (post) => {
  const platform = String(post.platform || '')
    .toLowerCase()
    .replace(/^twitter$/, 'x');
  const media = toMediaList(post.media_urls);
  const engagement = post.engagement && typeof post.engagement === 'object' ? post.engagement : {};
  const content = {
    text: post.text || '',
    url: post.url || null,
    link: post.url || null,
    content_url: post.url || null,
    published_at: post.posted_at || post.fetched_at || null,
    author_handle: post.author_handle || null,
    media,
    media_url: media[0]?.url || null,
    media_urls: media.map((m) => m.url).filter(Boolean),
    thumbnail: media[0]?.url || null,
    engagement: {
      likes: Number(engagement.likes ?? engagement.reactions ?? engagement.favorites ?? 0) || 0,
      replies: Number(engagement.comments ?? engagement.replies ?? engagement.reply ?? 0) || 0,
      retweets: Number(engagement.shares ?? engagement.retweets ?? engagement.reposts ?? 0) || 0,
      views: Number(engagement.views ?? engagement.view ?? engagement.play_count ?? 0) || 0,
      ...engagement,
    },
  };

  const alert = {
    id: post.id,
    platform,
    author: post.author_name || post.profile_name || post.author_handle || 'Unknown',
    author_handle: post.author_handle || null,
    risk_level: post.risk_level || 'low',
    sentiment: post.sentiment || null,
    content_url: post.url || null,
    description: post.text || '',
    content_details: content,
    status: 'active',
    account_id: post.account_id || null,
  };

  const source = {
    name: post.author_name || post.profile_name || post.author_handle || 'Unknown',
    handle: post.author_handle || null,
  };

  return { alert, content, source };
};

const useColumnCount = () => {
  const [cols, setCols] = useState(() =>
    typeof window === 'undefined' ? 3 : window.innerWidth < 768 ? 1 : window.innerWidth < 1200 ? 2 : 3
  );
  useEffect(() => {
    const onResize = () => {
      setCols(window.innerWidth < 768 ? 1 : window.innerWidth < 1200 ? 2 : 3);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
};

/**
 * Full-screen “All Posts” view — same card design as Alerts → Top 50.
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
  const colCount = useColumnCount();

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

  const columns = useMemo(() => {
    const cols = Array.from({ length: colCount }, () => []);
    posts.forEach((post, i) => {
      cols[i % colCount].push(post);
    });
    return cols;
  }, [posts, colCount]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight">All Posts</h1>
            <p className="text-[11px] text-indigo-100 truncate">
              {loading
                ? 'Loading posts…'
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
              : byPlatform[p.id] || byPlatform[p.id === 'x' ? 'twitter' : p.id] || 0;
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
            <p className="font-semibold text-slate-700 dark:text-slate-200 text-lg">Loading posts…</p>
            <p className="text-sm text-slate-500 mt-1">Same card layout as Top 50 / Alerts</p>
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
            <p className="text-sm mt-1">Switch range or platform to see ingested posts.</p>
          </div>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex gap-5 w-full items-start">
            {columns.map((colItems, ci) => (
              <div key={ci} className="flex-1 min-w-0 flex flex-col gap-5">
                {colItems.map((post) => {
                  const { alert, content, source } = postToCardProps(post);
                  const isYoutube = alert.platform === 'youtube';
                  return (
                    <div key={post.id}>
                      {isYoutube ? (
                        <YoutubeAlertCard
                          alert={alert}
                          content={content}
                          source={source}
                          viewMode="grid"
                          hideActions
                        />
                      ) : (
                        <TwitterAlertCard
                          alert={alert}
                          content={content}
                          source={source}
                          viewMode="grid"
                          hideActions
                        />
                      )}
                    </div>
                  );
                })}
              </div>
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
