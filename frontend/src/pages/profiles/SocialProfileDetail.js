import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
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

const riskTone = (level) => {
  const v = String(level || '').toLowerCase();
  if (v === 'high' || v === 'critical') return 'bg-rose-50 text-rose-700';
  if (v === 'medium') return 'bg-amber-50 text-amber-800';
  if (v === 'low') return 'bg-emerald-50 text-emerald-800';
  return 'bg-muted text-muted-foreground';
};

const Kpi = ({ label, value, hint }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">{value}</p>
    {hint != null && hint !== '' ? (
      typeof hint === 'string' || typeof hint === 'number' ? (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</p>
      ) : (
        <div className="mt-1">{hint}</div>
      )
    ) : null}
  </div>
);

const TEXT_PREVIEW_CHARS = 220;

const PostCard = ({ post }) => {
  const [expanded, setExpanded] = useState(false);
  const likes = engagementValue(post.engagement, ['likes', 'like', 'reactions', 'favorites']);
  const comments = engagementValue(post.engagement, ['comments', 'replies', 'reply']);
  const shares = engagementValue(post.engagement, ['shares', 'retweets', 'reposts', 'forwards']);
  const views = engagementValue(post.engagement, ['views', 'view', 'play_count']);
  const image = mediaPreviewUrl(post.media_urls);
  const analysis =
    post.analysis_result && typeof post.analysis_result === 'object' ? post.analysis_result : {};
  const risk = analysis.risk_level || analysis.riskLevel || null;
  const sentiment = analysis.sentiment || null;
  const when =
    formatRelative(post.posted_at || post.fetched_at) || formatWhen(post.posted_at || post.fetched_at);
  const handle = post.author_handle
    ? `@${String(post.author_handle).replace(/^@/, '')}`
    : post.author_name || null;
  const fullText = String(post.text || '').trim();
  const needsMore = fullText.length > TEXT_PREVIEW_CHARS;
  const shownText =
    !fullText
      ? null
      : expanded || !needsMore
        ? fullText
        : `${fullText.slice(0, TEXT_PREVIEW_CHARS).trimEnd()}…`;

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-border/80 hover:shadow-md">
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
          {sentiment ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold capitalize text-foreground">
              {sentiment}
            </span>
          ) : null}
          {risk ? (
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', riskTone(risk))}>
              Risk {String(risk)}
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
    </article>
  );
};

const SocialProfileDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [postScope, setPostScope] = useState('all');
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [monitoringBusy, setMonitoringBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await socialProfilesApi.get(id);
      const data = res.data || null;
      const list =
        Array.isArray(data?.accounts) && data.accounts.length ? data.accounts : data ? [data] : [];
      setEntity(data);
      setAccounts(list);
      const preferred = list.find((a) => Number(a.id) === Number(id)) || list[0] || null;
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
    if (!Number.isFinite(nextId)) return;
    setPostScope('account');
    if (nextId !== Number(selectedAccountId)) {
      setSelectedAccountId(nextId);
      navigate(`/social-profiles/${nextId}`, { replace: true });
    }
  };

  const selectAllAccounts = () => {
    setPostScope('all');
  };

  const profile =
    accounts.find((a) => Number(a.id) === Number(selectedAccountId)) || accounts[0] || null;

  const toggleMonitoring = async () => {
    const accountId = selectedAccountId || Number(id);
    if (!accountId || monitoringBusy) return;
    const starting = profile?.monitoring_status !== 'started';
    setMonitoringBusy(true);
    try {
      const res = await socialProfilesApi.toggleMonitoring(accountId);
      const updated = res.data || {};
      setAccounts((prev) =>
        prev.map((a) =>
          Number(a.id) === Number(accountId)
            ? {
                ...a,
                ...updated,
                posts_stored: a.posts_stored,
                relevance: a.relevance,
                profile_relevance: a.profile_relevance,
              }
            : a
        )
      );
      toast.success(starting ? 'Monitoring started — fetching posts…' : 'Monitoring stopped');
      if (starting) {
        setTimeout(() => loadPosts(1, { accountId, scope: postScope }), 3000);
      }
    } catch (error) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        (starting ? 'Could not start monitoring' : 'Could not stop monitoring');
      toast.error(msg);
    } finally {
      setMonitoringBusy(false);
    }
  };

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
  const alertsCount = Number(profile?.relevance?.total_alerts);
  const alertsHigh = Number(profile?.relevance?.high_alerts) || 0;
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
  const postsValue = Number(
    postScope === 'all' ? postsStoredAcross : profile?.posts_stored || pagination.total || 0
  ).toLocaleString('en-IN');

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
    <div className="flex w-full flex-col gap-4 pb-8 animate-in fade-in duration-300">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/social-profiles')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Social Profiles
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {externalUrl ? (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                Open profile <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isLive ? 'outline' : 'default'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={toggleMonitoring}
            disabled={monitoringBusy}
          >
            {monitoringBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
            {isLive ? 'Stop' : 'Start monitoring'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
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

      {/* Identity + KPIs */}
      <section className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar className="h-12 w-12 shrink-0 sm:h-14 sm:w-14">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {displayName}
                </h1>
                {summary.verified ? <BadgeCheck className="h-4 w-4 text-sky-500" /> : null}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Radio className={cn('h-3 w-3', isLive && 'animate-pulse')} />
                  {isLive ? 'Live' : 'Stopped'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {handle ? <span className="font-medium text-foreground/80">@{handle}</span> : null}
                <span>{accounts.length} accounts</span>
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  every {profile.poll_interval_minutes || 30}m
                </span>
                {summary.followers != null ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {formatCount(summary.followers)} followers
                  </span>
                ) : null}
                <Link
                  to={`/analytics-hub?tab=profiles`}
                  className="text-primary hover:underline"
                >
                  View in Analytics
                </Link>
              </div>
              {bio ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground line-clamp-2">
                  {bio}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:min-w-[22rem]">
            <Kpi
              label="Posts"
              value={postsValue}
              hint={postScope === 'all' ? 'all accounts' : profile.platform_name || profile.platform}
            />
            <Kpi
              label="Alerts 30d"
              value={Number.isFinite(alertsCount) ? alertsCount.toLocaleString('en-IN') : '—'}
              hint={alertsHigh ? `${alertsHigh} high` : 'keyword alerts'}
            />
            <Kpi
              label="Relevance"
              value={relevanceScore != null ? relevanceScore : '—'}
              hint={
                relevanceScore != null ? (
                  <span className="mt-1.5 block h-1 w-16 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        relevanceScore >= 60
                          ? 'bg-emerald-500'
                          : relevanceScore >= 30
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                      )}
                      style={{ width: `${Math.max(4, Math.min(100, relevanceScore))}%` }}
                    />
                  </span>
                ) : (
                  'not scored'
                )
              }
            />
            <Kpi
              label="Last fetch"
              value={formatRelative(profile.last_fetched_at) || 'Never'}
              hint={isLive ? 'Monitoring active' : 'Paused'}
            />
          </div>
        </div>

        {/* Platform switcher — All on the left, then per-platform */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <button
            type="button"
            onClick={selectAllAccounts}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
              postScope === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            )}
          >
            All
            <span className={cn('tabular-nums', postScope === 'all' ? 'opacity-90' : 'text-muted-foreground')}>
              {postsStoredAcross}
            </span>
          </button>
          {accounts.map((acc) => {
            const active = postScope === 'account' && Number(acc.id) === Number(selectedAccountId);
            const live = acc.monitoring_status === 'started';
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => selectAccount(acc.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                )}
              >
                <PlatformBrandIcon
                  platform={acc.platform}
                  className="h-3.5 w-3.5"
                  colored={!active}
                />
                <span className="font-medium capitalize">{acc.platform_name || acc.platform}</span>
                <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-muted-foreground')}>
                  {Number(acc.posts_stored || 0)}
                </span>
                {live ? (
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-emerald-500')} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Collapsible identity / monitoring */}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Account details
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showDetails ? (
            <div className="mt-2 grid gap-3 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-semibold text-foreground">Identity</p>
                {details.length === 0 ? (
                  <p className="text-muted-foreground">No field data stored.</p>
                ) : (
                  <dl className="space-y-1.5">
                    {details.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                        <dt className="uppercase tracking-wide text-muted-foreground">
                          {key.replace(/_/g, ' ')}
                        </dt>
                        <dd className="break-all font-medium text-foreground">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div>
                <p className="mb-1.5 font-semibold text-foreground">Monitoring</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex justify-between gap-2">
                    <span>Mode</span>
                    <span className="font-medium text-foreground">{isLive ? 'Started' : 'Stopped'}</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Interval</span>
                    <span className="font-medium text-foreground">
                      {profile.poll_interval_minutes || 30} min
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Account</span>
                    <span className="font-medium text-foreground">
                      {profile.is_active ? 'Active' : 'Paused'}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Preview fetched</span>
                    <span className="font-medium text-foreground">
                      {formatRelative(profile.preview_data?.fetched_at) || '—'}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Posts feed — primary content */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Fetched posts</h2>
            <p className="text-xs text-muted-foreground">
              {Number(pagination.total || 0).toLocaleString('en-IN')} posts
              {postScope === 'all'
                ? ' across all linked accounts'
                : ` · ${profile.platform_name || profile.platform}`}
            </p>
          </div>
          {postsLoading && posts.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
            </span>
          ) : null}
        </div>

        <div className="px-3 sm:px-4">
          {postsLoading && posts.length === 0 ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="px-3 py-14 text-center">
              <p className="text-sm font-medium text-foreground">No posts fetched yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isLive
                  ? 'Monitoring is running. Posts appear after the next successful fetch.'
                  : 'Start monitoring to collect posts for this account.'}
              </p>
              <div className="mt-4 flex justify-center">
                {!isLive ? (
                  <Button size="sm" className="gap-1.5" onClick={toggleMonitoring} disabled={monitoringBusy}>
                    {monitoringBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Radio className="h-3.5 w-3.5" />
                    )}
                    Start monitoring
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => loadPosts(1)}
                    disabled={postsLoading}
                  >
                    {postsLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh posts
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
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
  );
};

export default SocialProfileDetail;
