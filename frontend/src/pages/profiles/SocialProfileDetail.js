import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Radio,
  RefreshCw,
  Repeat2,
  Timer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { cn } from '../../lib/utils';

const formatWhen = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelative = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatWhen(value);
};

const formatCount = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return v.toLocaleString('en-IN');
};

const engagementValue = (engagement = {}, keys = []) => {
  for (const key of keys) {
    if (engagement[key] != null && engagement[key] !== '') return Number(engagement[key]) || 0;
  }
  return 0;
};

const mediaPreviewUrl = (mediaUrls = []) => {
  for (const item of mediaUrls) {
    if (!item) continue;
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
    if (typeof item === 'object') {
      const url = item.preview || item.thumbnail || item.url || item.src;
      if (url && /^https?:\/\//i.test(String(url))) return String(url);
    }
  }
  return null;
};

const profileExternalUrl = (profile, summary) => {
  if (summary?.url) return summary.url;
  const platform = String(profile?.platform || '').toLowerCase();
  const handle = String(profile?.handle || '').replace(/^@/, '');
  if (!handle) return null;
  if (platform === 'x' || platform === 'twitter') return `https://x.com/${handle}`;
  if (platform === 'instagram') return `https://instagram.com/${handle}`;
  if (platform === 'facebook') return handle.startsWith('http') ? handle : `https://facebook.com/${handle}`;
  if (platform === 'youtube') {
    return handle.startsWith('http') ? handle : `https://www.youtube.com/@${handle}`;
  }
  if (platform === 'telegram') return handle.startsWith('http') ? handle : `https://t.me/${handle}`;
  return null;
};

const Metric = ({ label, value, hint }) => (
  <div className="min-w-0 rounded-xl bg-background/70 px-3 py-2.5 ring-1 ring-border/50">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-lg font-bold tabular-nums tracking-tight text-foreground">{value}</p>
    {hint ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p> : null}
  </div>
);

const PostCard = ({ post }) => {
  const likes = engagementValue(post.engagement, ['likes', 'like', 'reactions', 'favorites']);
  const comments = engagementValue(post.engagement, ['comments', 'replies', 'reply']);
  const shares = engagementValue(post.engagement, ['shares', 'retweets', 'reposts', 'forwards']);
  const views = engagementValue(post.engagement, ['views', 'view', 'play_count']);
  const image = mediaPreviewUrl(post.media_urls);
  const risk = post.analysis_result?.risk_level || post.analysis_result?.riskLevel || null;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card transition hover:border-primary/30 hover:shadow-sm">
      <div className="flex gap-0">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <Clock3 className="h-3 w-3" />
              {formatRelative(post.posted_at || post.fetched_at) || formatWhen(post.posted_at)}
            </span>
            {post.platform ? (
              <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                <PlatformBrandIcon platform={post.platform} className="h-3 w-3" />
                {post.platform}
              </Badge>
            ) : null}
            {post.author_handle ? (
              <span>@{String(post.author_handle).replace(/^@/, '')}</span>
            ) : null}
            {risk ? (
              <Badge
                variant="outline"
                className={cn(
                  'h-5 capitalize text-[10px]',
                  String(risk).toLowerCase() === 'high' || String(risk).toLowerCase() === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                    : String(risk).toLowerCase() === 'medium'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                )}
              >
                {String(risk)}
              </Badge>
            ) : null}
            {post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary opacity-80 hover:bg-primary/5 hover:opacity-100"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>

          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            {post.text || <span className="italic text-muted-foreground">No text content</span>}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-rose-500/80" /> {formatCount(likes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-sky-500/80" /> {formatCount(comments)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Repeat2 className="h-3.5 w-3.5 text-emerald-500/80" /> {formatCount(shares)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-violet-500/80" /> {formatCount(views)}
            </span>
          </div>
        </div>

        {image ? (
          <a
            href={post.url || image}
            target="_blank"
            rel="noopener noreferrer"
            className="relative hidden w-36 shrink-0 overflow-hidden border-l border-border/60 sm:block"
          >
            <img src={image} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
          </a>
        ) : null}
      </div>
    </article>
  );
};

const SocialProfileDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [postScope, setPostScope] = useState('account'); // account | all
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await socialProfilesApi.get(id);
      const data = res.data || null;
      const list = Array.isArray(data?.accounts) && data.accounts.length
        ? data.accounts
        : data
          ? [data]
          : [];
      setEntity(data);
      setAccounts(list);
      const preferred =
        list.find((a) => Number(a.id) === Number(id)) || list[0] || null;
      setSelectedAccountId(preferred ? Number(preferred.id) : null);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load profile');
      setEntity(null);
      setAccounts([]);
      setSelectedAccountId(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPosts = useCallback(
    async (page = 1, opts = {}) => {
      const accountId = opts.accountId ?? selectedAccountId ?? Number(id);
      const scope = opts.scope ?? postScope;
      if (!accountId) return;
      setPostsLoading(true);
      try {
        const params = { page, limit: 30 };
        if (scope === 'all') params.scope = 'all';
        else params.account_id = accountId;
        const res = await socialProfilesApi.listPosts(id, params);
        setPosts(Array.isArray(res.data?.posts) ? res.data.posts : []);
        setPagination(res.data?.pagination || { page: 1, limit: 30, total: 0, totalPages: 1 });
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Failed to load posts');
        setPosts([]);
      } finally {
        setPostsLoading(false);
      }
    },
    [id, selectedAccountId, postScope]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedAccountId) return;
    loadPosts(1, { accountId: selectedAccountId, scope: postScope });
  }, [selectedAccountId, postScope, loadPosts]);

  const selectAccount = (accountId) => {
    const nextId = Number(accountId);
    if (!Number.isFinite(nextId) || nextId === Number(selectedAccountId)) return;
    setSelectedAccountId(nextId);
    setPostScope('account');
    navigate(`/social-profiles/${nextId}`, { replace: true });
  };

  const profile =
    accounts.find((a) => Number(a.id) === Number(selectedAccountId)) || accounts[0] || null;

  const summary = useMemo(() => {
    const preview =
      profile?.preview_data && typeof profile.preview_data === 'object' ? profile.preview_data : {};
    return preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  }, [profile]);

  const details = useMemo(() => {
    if (!profile?.data || typeof profile.data !== 'object') return [];
    return Object.entries(profile.data).filter(([, v]) => String(v || '').trim());
  }, [profile]);

  const postsStoredAcross = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.posts_stored) || 0), 0),
    [accounts]
  );

  const relevanceScore = Number.isFinite(profile?.relevance?.score) ? profile.relevance.score : null;
  const displayName =
    entity?.display_name || profile?.display_name || summary.name || profile?.handle || 'Profile';
  const handle = String(profile?.handle || summary.username || '').replace(/^@/, '');
  const avatarUrl = summary.image || null;
  const bio = summary.description || summary.bio || profile?.notes || entity?.notes || '';
  const externalUrl = profileExternalUrl(profile, summary);
  const isLive = profile?.monitoring_status === 'started';
  const initials = String(displayName || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-20 text-center">
        <p className="text-base font-semibold">Profile not found</p>
        <p className="text-sm text-muted-foreground">It may have been deleted or you don’t have access.</p>
        <Button variant="outline" onClick={() => navigate('/social-profiles')}>
          Back to Social Profiles
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full pb-10 animate-in fade-in duration-300">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(1200px 280px at 10% -20%, hsl(var(--primary) / 0.18), transparent 55%), radial-gradient(800px 240px at 90% 0%, hsl(210 80% 55% / 0.12), transparent 50%)',
          }}
        />
        <div className="relative border-b border-border/50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 bg-background/80"
                onClick={() => navigate('/social-profiles')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <p className="text-xs font-medium text-muted-foreground">Social Profiles</p>
            </div>
            <div className="flex items-center gap-2">
              {externalUrl ? (
                <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 bg-background/80">
                  <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                    Open profile <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 bg-background/80"
                onClick={() => {
                  loadProfile();
                  loadPosts(pagination.page || 1);
                }}
                disabled={postsLoading}
              >
                {postsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="relative grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-background shadow-md sm:h-20 sm:w-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {displayName}
                </h1>
                {summary.verified ? <BadgeCheck className="h-5 w-5 text-sky-500" /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {handle ? <span className="font-medium">@{handle}</span> : null}
                <Badge
                  variant="outline"
                  className={cn(
                    'h-6 gap-1 px-2 text-[11px]',
                    isLive
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700'
                      : 'bg-background/70 text-muted-foreground'
                  )}
                >
                  <Radio className={cn('h-3 w-3', isLive && 'animate-pulse')} />
                  {isLive ? 'Live monitoring' : 'Stopped'}
                </Badge>
                <span className="text-[11px]">
                  {accounts.length} platform account{accounts.length === 1 ? '' : 's'}
                </span>
              </div>
              {bio ? (
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/80 line-clamp-3">
                  {bio}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {summary.followers != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <b className="tabular-nums text-foreground">{formatCount(summary.followers)}</b> followers
                  </span>
                ) : null}
                {summary.following != null ? (
                  <span>
                    <b className="tabular-nums text-foreground">{formatCount(summary.following)}</b> following
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  Poll every {profile.poll_interval_minutes || 30}m
                </span>
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[28rem] lg:grid-cols-2">
            <Metric
              label="Posts stored"
              value={Number(
                postScope === 'all' ? postsStoredAcross : profile.posts_stored || pagination.total || 0
              ).toLocaleString('en-IN')}
              hint={postScope === 'all' ? 'all platforms' : 'this account'}
            />
            <Metric
              label="Relevance"
              value={relevanceScore != null ? `${relevanceScore}` : '—'}
              hint={relevanceScore != null ? 'out of 100' : 'not scored'}
            />
            <Metric label="Last fetched" value={formatRelative(profile.last_fetched_at) || 'Never'} />
            <Metric
              label="Status"
              value={isLive ? 'Active' : 'Paused'}
              hint={formatWhen(profile.last_fetched_at)}
            />
          </div>
        </div>

        {/* All platform accounts on this profile entity */}
        <div className="relative border-t border-border/50 px-4 py-3 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Accounts on this profile
            </p>
            {accounts.length > 1 ? (
              <div className="flex rounded-lg border border-border/60 bg-background/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setPostScope('account')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                    postScope === 'account' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  Selected account
                </button>
                <button
                  type="button"
                  onClick={() => setPostScope('all')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                    postScope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  All accounts
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((acc) => {
              const active = Number(acc.id) === Number(selectedAccountId);
              const live = acc.monitoring_status === 'started';
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => selectAccount(acc.id)}
                  className={cn(
                    'inline-flex min-w-[9.5rem] flex-col gap-1 rounded-xl border px-3 py-2 text-left transition',
                    active
                      ? 'border-primary/40 bg-primary/5 shadow-sm'
                      : 'border-border/60 bg-background/70 hover:border-primary/25 hover:bg-muted/40'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <PlatformBrandIcon platform={acc.platform} className="h-3.5 w-3.5" />
                    {acc.platform_name || acc.platform}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    @{String(acc.handle || '').replace(/^@/, '')}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{Number(acc.posts_stored || 0)} posts</span>
                    <span className={live ? 'font-medium text-emerald-600' : ''}>
                      {live ? 'Live' : 'Stopped'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {relevanceScore != null ? (
          <div className="relative border-t border-border/50 px-4 py-3 sm:px-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-medium text-muted-foreground">Keyword relevance</span>
              <span className="tabular-nums font-semibold text-foreground">{relevanceScore}/100</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  relevanceScore >= 60 ? 'bg-emerald-500' : relevanceScore >= 30 ? 'bg-amber-500' : 'bg-slate-400'
                )}
                style={{ width: `${Math.max(2, Math.min(100, relevanceScore))}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Identity sidebar */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Identity</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Selected account · {profile.platform_name || profile.platform}
            </p>
            <dl className="mt-3 space-y-2.5">
              {details.length === 0 ? (
                <p className="text-xs text-muted-foreground">No field data stored.</p>
              ) : (
                details.map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="mt-0.5 break-all text-xs font-medium text-foreground">{String(value)}</dd>
                  </div>
                ))
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Monitoring</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center justify-between gap-2">
                <span>Mode</span>
                <span className="font-medium text-foreground">{isLive ? 'Started' : 'Stopped'}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Interval</span>
                <span className="font-medium text-foreground">{profile.poll_interval_minutes || 30} min</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Account</span>
                <span className="font-medium text-foreground">{profile.is_active ? 'Active' : 'Paused'}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Preview fetched</span>
                <span className="font-medium text-foreground">
                  {formatRelative(profile.preview_data?.fetched_at) || '—'}
                </span>
              </li>
            </ul>
          </section>

          {accounts.length > 1 ? (
            <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Linked accounts</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Same profile entity</p>
              <ul className="mt-3 space-y-2">
                {accounts.map((acc) => (
                  <li key={acc.id}>
                    <button
                      type="button"
                      onClick={() => selectAccount(acc.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                        Number(acc.id) === Number(selectedAccountId)
                          ? 'bg-primary/10 text-foreground'
                          : 'hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <PlatformBrandIcon platform={acc.platform} className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {acc.platform_name || acc.platform}
                      </span>
                      <span className="tabular-nums">{Number(acc.posts_stored || 0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        {/* Posts */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Fetched posts</h2>
              <p className="text-xs text-muted-foreground">
                {Number(pagination.total || 0).toLocaleString('en-IN')} posts
                {postScope === 'all'
                  ? ' across all linked accounts'
                  : ` from ${profile.platform_name || profile.platform}`}
              </p>
            </div>
            {postsLoading && posts.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
              </span>
            ) : null}
          </div>

          {postsLoading && posts.length === 0 ? (
            <div className="flex justify-center rounded-2xl border border-dashed border-border/70 py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">No posts fetched yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start monitoring from Social Profiles to collect content for this account.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate('/social-profiles')}
              >
                Go to Social Profiles
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {pagination.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                Page <span className="font-semibold text-foreground">{pagination.page}</span> of{' '}
                {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={postsLoading || pagination.page <= 1}
                  onClick={() => loadPosts(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={postsLoading || pagination.page >= pagination.totalPages}
                  onClick={() => loadPosts(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default SocialProfileDetail;
