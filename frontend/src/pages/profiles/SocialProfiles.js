import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Pencil, Trash2, Loader2, PlayCircle, StopCircle,
  Twitter, Facebook, Instagram, Youtube, Globe2, Square, History, BarChart3, Download, Timer,
  ChevronDown, User, FileText, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { TelegramBrandLogo } from '../../components/PlatformBrandIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { cn } from '../../lib/utils';

const ICONS = {
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Globe2,
  Telegram: TelegramBrandLogo,
  Send: TelegramBrandLogo, // legacy DB icon key
};
const ICON_OPTIONS = [
  { value: 'Twitter', label: 'X / Twitter' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Youtube', label: 'YouTube' },
  { value: 'Telegram', label: 'Telegram' },
  { value: 'Globe2', label: 'Other' },
];

const POLL_PRESETS = [
  { value: '5', label: 'Every 5 minutes', minutes: 5 },
  { value: '15', label: 'Every 15 minutes', minutes: 15 },
  { value: '30', label: 'Every 30 minutes', minutes: 30 },
  { value: '60', label: 'Every 1 hour', minutes: 60 },
  { value: '360', label: 'Every 6 hours', minutes: 360 },
  { value: 'custom', label: 'Custom', minutes: null },
];

const resolvePollPreset = (minutes) => {
  const m = Number(minutes);
  const match = POLL_PRESETS.find((p) => p.minutes === m);
  return match ? match.value : 'custom';
};

const formatPollInterval = (minutes) => {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1) return '—';
  if (m < 60) return `Every ${m}m`;
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? 'Every 1h' : `Every ${h}h`;
  }
  return `Every ${m}m`;
};

const getRelevanceScore = (row) => {
  const score = row?.relevance?.score;
  return Number.isFinite(score) ? score : null;
};

const getRelevanceTone = (score) => {
  if (score == null) return 'muted';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
};

const relevanceToneClasses = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
  muted: 'bg-slate-50 text-slate-400 border-slate-200',
};

const ProfileRelevanceBadge = ({ row }) => {
  const relevance = row?.relevance || {};
  const score = getRelevanceScore(row);
  const tone = getRelevanceTone(score);
  const qualifying = relevance.qualifying_post_count ?? 0;
  const total = relevance.total_post_count ?? 0;
  const staticScore = Number(relevance.static_score) || 0;
  const contentAvg = relevance.content_avg_score;
  const matched = Array.isArray(relevance.matched_terms) ? relevance.matched_terms : [];
  const profileMatched = Array.isArray(relevance.profile_matched_terms)
    ? relevance.profile_matched_terms
    : matched;
  const staticWeight = relevance.static_weight ?? 100;
  const contentWeight = relevance.content_weight ?? 0;

  if (score == null) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const keywordCount = relevance.keyword_count ?? 0;
  const postsScope = relevance.posts_scope || 'account';
  const ownPosts = relevance.own_post_count ?? total;
  const level =
    score >= 80
      ? { label: 'Highly relevant', hint: 'Strong catalog keyword match' }
      : score >= 60
        ? { label: 'Moderately relevant', hint: 'Some catalog keyword match' }
        : { label: 'Low relevance', hint: 'Weak or no catalog keyword match' };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="min-w-[88px] rounded-md p-1 -m-1 text-left transition-colors hover:bg-muted/60"
          aria-label={`Relevance ${score} out of 100`}
        >
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-semibold tabular-nums', relevanceToneClasses[tone])}>
              {score}/100
            </Badge>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                tone === 'high' ? 'bg-emerald-500' : tone === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
              )}
              style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[20rem] p-0" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2.5 border-b">
          <p className="text-sm font-bold tabular-nums">{score}/100</p>
          <p className="text-xs font-medium">{level.label}</p>
          <p className="text-[10px] text-muted-foreground">{level.hint}</p>
        </div>
        <div className="px-3 py-2.5 space-y-2 text-[11px]">
          <div className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <User className="h-3.5 w-3.5 text-sky-600" /> Profile
              </span>
              <span className="tabular-nums font-bold">{staticScore}/100</span>
            </div>
            <p className="text-[10px] text-muted-foreground pl-5">
              {profileMatched.length
                ? `Matched: ${profileMatched.slice(0, 4).join(', ')}`
                : 'No catalog keywords in name or handle.'}
            </p>
          </div>
          <div className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <FileText className="h-3.5 w-3.5 text-violet-600" /> Recent posts
              </span>
              <span className="tabular-nums font-bold">
                {contentAvg != null ? `${Math.round(contentAvg)}/100` : '—'}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground pl-5">
              {total === 0
                ? 'No posts stored for this account (last 30 days). Start monitoring to fetch posts.'
                : qualifying === 0
                  ? `Checked ${total} posts — no catalog keyword hits.${
                      postsScope === 'profile' && ownPosts === 0
                        ? ' (from other platforms on this profile)'
                        : ''
                    }`
                  : `${qualifying} of ${total} recent posts matched catalog keywords.${
                      postsScope === 'profile' && ownPosts === 0
                        ? ' (from other platforms on this profile)'
                        : ''
                    }`}
            </p>
          </div>
          <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-2">
            <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
              <CheckCircle className="h-3.5 w-3.5" /> Blend
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">
              {contentWeight > 0
                ? `Posts ${contentWeight}% · Profile ${staticWeight}% → ${score}/100`
                : `Profile only → ${score}/100`}
              {keywordCount > 0 ? ` · ${keywordCount} keywords` : ''}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
};

const formatDuration = (ms) => {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/** Countdown like 59m 59s · under 1m shows 59s, 58s… */
const formatCountdown = (ms) => {
  const totalSec = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${totalSec}s`;
};

/**
 * Live monitoring phase for a started profile.
 * - fetching: kickoff for this session / overdue
 * - waiting: between polls, with remainingMs until next fetch
 * - stopped: not monitoring
 *
 * sessionStartedAt: ignore last_fetched_at from a *previous* session after Start again.
 */
const getMonitoringPhase = (row, now = Date.now(), options = {}) => {
  const isFetching = Boolean(options.isFetching);
  const sessionStartedAt = options.sessionStartedAt || null;
  if (row?.monitoring_status !== 'started') {
    return { phase: 'stopped', remainingMs: null, nextAt: null };
  }
  if (isFetching || !row?.last_fetched_at) {
    return { phase: 'fetching', remainingMs: null, nextAt: null };
  }
  const last = new Date(row.last_fetched_at).getTime();
  if (!Number.isFinite(last)) {
    return { phase: 'fetching', remainingMs: null, nextAt: null };
  }
  if (sessionStartedAt) {
    const startMs = new Date(sessionStartedAt).getTime();
    // Stale fetch from before this Start → still on kickoff
    if (Number.isFinite(startMs) && last < startMs - 1500) {
      return { phase: 'fetching', remainingMs: null, nextAt: null };
    }
  }
  const intervalMs = Math.max(1, Number(row.poll_interval_minutes) || 30) * 60_000;
  const nextAt = last + intervalMs;
  const remainingMs = nextAt - now;
  if (remainingMs <= 0) {
    return { phase: 'due', remainingMs: 0, nextAt };
  }
  return { phase: 'waiting', remainingMs, nextAt };
};

/** Pair start→stop into readable history rows (newest first). */
const buildMonitoringHistory = (logs = [], monitoringStatus) => {
  const list = Array.isArray(logs) ? [...logs] : [];
  const sessions = [];
  let openStart = null;

  for (const entry of list) {
    const action = String(entry?.action || '').toLowerCase();
    if (action === 'start') {
      openStart = entry;
    } else if (action === 'stop' && openStart) {
      const startAt = openStart.at ? new Date(openStart.at).getTime() : null;
      const stopAt = entry.at ? new Date(entry.at).getTime() : null;
      sessions.push({
        id: `${openStart.at}-${entry.at}`,
        startedAt: openStart.at,
        stoppedAt: entry.at,
        durationMs: startAt != null && stopAt != null ? stopAt - startAt : null,
        state: 'done',
        startMessage: openStart.message,
        stopMessage: entry.message,
      });
      openStart = null;
    }
  }

  if (openStart) {
    const startAt = openStart.at ? new Date(openStart.at).getTime() : null;
    const now = Date.now();
    sessions.push({
      id: `${openStart.at}-running`,
      startedAt: openStart.at,
      stoppedAt: null,
      durationMs: startAt != null ? now - startAt : null,
      state: monitoringStatus === 'started' ? 'running' : 'incomplete',
      startMessage: openStart.message,
      stopMessage: null,
    });
  }

  return sessions.reverse();
};

/** Totals + newest-first rows from last_fetched_history. */
const summarizeFetchHistory = (history = [], monitoringSessions = []) => {
  const list = Array.isArray(history) ? history : [];
  const totals = list.reduce(
    (acc, e) => ({
      apiHits: acc.apiHits + (Number(e?.api_hits) || 0),
      postsNew: acc.postsNew + (Number(e?.posts_new) || 0),
      postsReturned: acc.postsReturned + (Number(e?.posts_returned) || 0),
      runs: acc.runs + 1,
    }),
    { apiHits: 0, postsNew: 0, postsReturned: 0, runs: 0 }
  );
  const totalRunningMs = monitoringSessions.reduce(
    (sum, s) => sum + (Number.isFinite(s.durationMs) ? s.durationMs : 0),
    0
  );
  return {
    ...totals,
    totalRunningMs,
    runsNewestFirst: [...list].reverse(),
  };
};

const HIDDEN_FIELD_KEYS = new Set(['page_id', 'user_id', 'channel_id']);

const blankAccountSlot = (slug, platformsList) => {
  const plat = platformsList.find((p) => p.slug === slug);
  const data = {};
  (plat?.fields || []).forEach((f) => {
    data[f.key] = '';
  });
  return {
    key: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    profileId: null,
    platform: slug || '',
    data,
    preview: null,
    preview_data: null,
    fetching: false,
  };
};

const rowToAccountSlot = (row, platformsList) => {
  const plat =
    platformsList.find((p) => p.slug === row.platform) ||
    null;
  const data = {};
  (plat?.fields || []).forEach((f) => {
    data[f.key] = row.data?.[f.key] ?? (f.key === 'username' ? row.handle : '') ?? '';
  });
  if (row.data?.page_id) data.page_id = row.data.page_id;
  if (row.data?.user_id) data.user_id = row.data.user_id;
  if (row.data?.channel_id) data.channel_id = row.data.channel_id;
  if (row.data?.uploads_playlist_id) data.uploads_playlist_id = row.data.uploads_playlist_id;
  const storedPreview =
    row.preview_data && typeof row.preview_data === 'object' && Object.keys(row.preview_data).length
      ? row.preview_data
      : null;
  return {
    key: `id-${row.id}`,
    profileId: row.id,
    platform: row.platform,
    data,
    preview: storedPreview?.summary || null,
    preview_data: storedPreview,
    fetching: false,
  };
};

const SocialProfiles = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [platforms, setPlatforms] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, byPlatform: {} });
  const [loading, setLoading] = useState(true);
  const [platformTab, setPlatformTab] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    poll_interval_minutes: 30,
    poll_preset: '30',
    notes: '',
    accounts: [],
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteProfile, setDeleteProfile] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [monitoringId, setMonitoringId] = useState(null);
  const [startingAll, setStartingAll] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);

  // Live clock while any profile is monitoring — powers Waiting countdown
  const [monitorNow, setMonitorNow] = useState(() => Date.now());
  const anyMonitoring = useMemo(
    () => profiles.some((p) => p.monitoring_status === 'started'),
    [profiles]
  );
  useEffect(() => {
    if (!anyMonitoring) return undefined;
    setMonitorNow(Date.now());
    const id = setInterval(() => setMonitorNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyMonitoring]);


  const allAccountsFetched = useMemo(
    () =>
      profileForm.accounts.length > 0 &&
      profileForm.accounts.every(
        (a) =>
          a.preview_data?.fetched_at &&
          (a.data?.page_id ||
            a.data?.user_id ||
            a.data?.channel_id ||
            a.preview?.page_id ||
            a.preview?.user_id ||
            a.preview?.channel_id)
      ),
    [profileForm.accounts]
  );

  const loadPlatforms = useCallback(async () => {
    const activeRes = await socialProfilesApi.listPlatforms();
    const active = Array.isArray(activeRes.data) ? activeRes.data : [];
    setPlatforms(active);
    return { active };
  }, []);

  const loadProfiles = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (platformTab !== 'all') params.platform = platformTab;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (query.trim()) params.search = query.trim();
      const res = await socialProfilesApi.list(params);
      setProfiles(Array.isArray(res.data?.profiles) ? res.data.profiles : []);
      setStats(res.data?.stats || { total: 0, active: 0, paused: 0, byPlatform: {} });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load profiles');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [platformTab, statusFilter, query]);

  useEffect(() => {
    loadPlatforms().catch(() => toast.error('Failed to load platforms'));
  }, [loadPlatforms]);

  useEffect(() => {
    const t = setTimeout(() => loadProfiles(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadProfiles, query]);

  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editingSiblingIds, setEditingSiblingIds] = useState([]);

  const openAddProfile = () => {
    const slug = platformTab !== 'all' ? platformTab : platforms[0]?.slug || '';
    setEditingProfile(null);
    setEditingProfileId(null);
    setEditingSiblingIds([]);
    setProfileForm({
      display_name: '',
      poll_interval_minutes: 30,
      poll_preset: '30',
      notes: '',
      accounts: [blankAccountSlot(slug, platforms)],
    });
    setProfileOpen(true);
  };

  /** Prefill Add profile from Global Search Monitor (or other pages). */
  const openAddProfilePrefill = useCallback(
    (prefill) => {
      if (!prefill || !platforms.length) return;
      const slug = String(prefill.platform || '').toLowerCase();
      const plat = platforms.find((p) => p.slug === slug) || platforms[0];
      const slot = blankAccountSlot(plat?.slug || '', platforms);
      const incoming = prefill.data && typeof prefill.data === 'object' ? prefill.data : {};
      slot.data = { ...slot.data, ...incoming };
      setEditingProfile(null);
      setEditingProfileId(null);
      setEditingSiblingIds([]);
      if (plat?.slug) setPlatformTab(plat.slug);
      setProfileForm({
        display_name: String(prefill.display_name || '').trim(),
        poll_interval_minutes: 30,
        poll_preset: '30',
        notes: String(prefill.notes || '').trim(),
        accounts: [slot],
      });
      setProfileOpen(true);
    },
    [platforms]
  );

  useEffect(() => {
    const prefill = location.state?.addProfile;
    if (!prefill || !platforms.length) return;
    openAddProfilePrefill(prefill);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, platforms, openAddProfilePrefill, navigate]);

  const openEditProfile = async (row) => {
    setEditingProfile(row);
    setProfileOpen(true);
    try {
      const res = await socialProfilesApi.list({});
      const all = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
      const parentId = row.profile_id ?? row.entity_id;
      const siblings = parentId
        ? all.filter((p) => String(p.profile_id ?? p.entity_id) === String(parentId))
        : [all.find((p) => p.id === row.id) || row];
      const minutes = Number(row.poll_interval_minutes) || 30;
      setEditingProfileId(parentId || null);
      setEditingSiblingIds(siblings.map((s) => s.id));
      setProfileForm({
      display_name: row.display_name || '',
        poll_interval_minutes: minutes,
        poll_preset: resolvePollPreset(minutes),
      notes: row.notes || '',
        accounts: siblings.map((s) => rowToAccountSlot(s, platforms)),
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load profile');
      setProfileOpen(false);
    }
  };

  const updateAccount = (key, patch) => {
    setProfileForm((f) => ({
      ...f,
      accounts: f.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    }));
  };

  const setAccountPlatform = (key, slug) => {
    const account = profileForm.accounts.find((a) => a.key === key);
    if (account?.profileId) {
      toast.error('Remove this account and add a new platform instead');
      return;
    }
    const plat = platforms.find((p) => p.slug === slug);
    const data = {};
    (plat?.fields || []).forEach((f) => {
      data[f.key] = '';
    });
    updateAccount(key, {
      platform: slug,
      data,
      preview: null,
      preview_data: null,
    });
  };

  const addAccountSlot = () => {
    const used = new Set(profileForm.accounts.map((a) => a.platform));
    const next = platforms.find((p) => !used.has(p.slug)) || platforms[0];
    setProfileForm((f) => ({
      ...f,
      accounts: [...f.accounts, blankAccountSlot(next?.slug || '', platforms)],
    }));
  };

  const removeAccountSlot = (key) => {
    setProfileForm((f) => ({
      ...f,
      accounts: f.accounts.length <= 1 ? f.accounts : f.accounts.filter((a) => a.key !== key),
    }));
  };

  const fetchAccountPreview = async (key) => {
    const account = profileForm.accounts.find((a) => a.key === key);
    if (!account?.platform) {
      toast.error('Select a platform');
      return;
    }
    updateAccount(key, { fetching: true });
    try {
      const res = await socialProfilesApi.preview({
        platform: account.platform,
        data: account.data,
      });
      const patch = res.data?.data_patch || {};
      const preview = res.data?.preview || res.data?.preview_data?.summary || null;
      const previewData = res.data?.preview_data || null;
      setProfileForm((f) => ({
        ...f,
        display_name: f.display_name || preview?.name || '',
        accounts: f.accounts.map((a) =>
          a.key === key
            ? {
                ...a,
                fetching: false,
                data: { ...a.data, ...patch },
                preview,
                preview_data: previewData,
              }
            : a
        ),
      }));
      toast.success('Details fetched');
    } catch (error) {
      updateAccount(key, { fetching: false, preview: null, preview_data: null });
      toast.error(error.response?.data?.error || 'Fetch failed');
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.accounts.length) {
      toast.error('Add at least one platform');
      return;
    }
    if (!allAccountsFetched) {
      toast.error('Fetch details for every platform before saving');
      return;
    }
    const minutes = Number(profileForm.poll_interval_minutes);
    if (!Number.isInteger(minutes) || minutes < 1) {
      toast.error('Poll interval must be at least 1 minute');
      return;
    }
    setSavingProfile(true);
    try {
      if (editingProfile) {
        let parentId = editingProfileId || editingProfile.profile_id || null;
        const keepIds = new Set();

        for (const account of profileForm.accounts) {
          const payload = {
            platform: account.platform,
            data: account.data,
            display_name: profileForm.display_name,
            poll_interval_minutes: minutes,
            notes: profileForm.notes,
            preview_data: account.preview_data || {},
            ...(parentId ? { profile_id: parentId } : {}),
          };
          if (account.profileId) {
            await socialProfilesApi.update(account.profileId, payload);
            keepIds.add(account.profileId);
            if (!parentId) parentId = editingProfile.profile_id;
          } else {
            const created = await socialProfilesApi.create(payload);
            if (created.data?.id) keepIds.add(created.data.id);
            if (!parentId && created.data?.profile_id) {
              parentId = created.data.profile_id;
            }
          }
        }

        for (const id of editingSiblingIds) {
          if (!keepIds.has(id)) {
            await socialProfilesApi.remove(id);
          }
        }

        toast.success('Profile updated');
      } else {
        await socialProfilesApi.createBatch({
          display_name: profileForm.display_name,
          poll_interval_minutes: minutes,
          notes: profileForm.notes,
          accounts: profileForm.accounts.map((a) => ({
            platform: a.platform,
            data: a.data,
            preview_data: a.preview_data,
          })),
        });
        toast.success(
          profileForm.accounts.length > 1
            ? `Added ${profileForm.accounts.length} platform accounts`
            : 'Profile added'
        );
      }
      setProfileOpen(false);
      setEditingProfile(null);
      setEditingProfileId(null);
      setEditingSiblingIds([]);
      await loadProfiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const confirmDeleteProfile = async () => {
    if (!deleteProfile) return;
    setDeleting(true);
    try {
      await socialProfilesApi.remove(deleteProfile.id);
      toast.success('Profile deleted');
      setDeleteProfile(null);
      await loadProfiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const toggleMonitoring = async (row) => {
    setMonitoringId(row.id);
    try {
      const res = await socialProfilesApi.toggleMonitoring(row.id);
      const updated = res.data || {};
      const next = updated.monitoring_status;
      // Update the row in place — avoid full-table Loading… flash
      setProfiles((prev) =>
        prev.map((p) => (String(p.id) === String(row.id) ? { ...p, ...updated } : p))
      );
      setStats((prev) => {
        const wasStarted = row.monitoring_status === 'started';
        const nowStarted = next === 'started';
        if (wasStarted === nowStarted) return prev;
        const delta = nowStarted ? 1 : -1;
        return {
          ...prev,
          active: Math.max(0, (prev.active || 0) + delta),
          paused: Math.max(0, (prev.paused || 0) - delta),
        };
      });
      toast.success(next === 'started' ? 'Monitoring started' : 'Monitoring stopped');
      // Background refresh for logs / fetch history (no page blank)
      loadProfiles({ silent: true }).catch(() => {});
      if (next === 'started') {
        setTimeout(() => {
          loadProfiles({ silent: true }).catch(() => {});
        }, 4000);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Monitoring update failed');
    } finally {
      setMonitoringId(null);
    }
  };

  const startAllServices = async () => {
    setStartingAll(true);
    try {
      const params = platformTab !== 'all' ? { platform: platformTab } : undefined;
      const res = await socialProfilesApi.startAllMonitoring(params);
      const started = res.data?.started ?? 0;
      toast.success(
        started > 0
          ? `Started monitoring on ${started} profile${started === 1 ? '' : 's'}`
          : res.data?.message || 'All services already running'
      );
      await loadProfiles({ silent: true });
      if (started > 0) {
        setTimeout(() => {
          loadProfiles({ silent: true }).catch(() => {});
        }, 4000);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start all services');
    } finally {
      setStartingAll(false);
    }
  };

  const stopAllServices = async () => {
    setStoppingAll(true);
    try {
      const params = platformTab !== 'all' ? { platform: platformTab } : undefined;
      const res = await socialProfilesApi.stopAllMonitoring(params);
      const stopped = res.data?.stopped ?? 0;
      toast.success(
        stopped > 0
          ? `Stopped monitoring on ${stopped} profile${stopped === 1 ? '' : 's'}`
          : res.data?.message || 'No services are running'
      );
      await loadProfiles({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to stop all services');
    } finally {
      setStoppingAll(false);
    }
  };


  const tabCounts = useMemo(() => {
    const by = stats.byPlatform || {};
    return {
      all: platforms.reduce((s, p) => s + (by[p.slug] || 0), 0),
      ...by,
    };
  }, [stats, platforms]);

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-2.5 max-w-[1600px] mx-auto w-full">
      {/* Title row — counts + actions fill the space */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Profile Catalog</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Watched accounts across platforms — one table
          </p>
          </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{stats.total}</span>
            <span>profiles</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
            <span className="tabular-nums font-semibold">{stats.active}</span>
            <span>active</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{stats.paused}</span>
            <span>paused</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={startingAll || stoppingAll || loading}
            onClick={startAllServices}
          >
            {startingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Start all services
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={startingAll || stoppingAll || loading}
            onClick={stopAllServices}
          >
            {stoppingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <StopCircle className="h-3.5 w-3.5" />
            )}
            Stop all services
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={openAddProfile}>
            <Plus className="h-3.5 w-3.5" />
          Add profile
        </Button>
      </div>
      </div>

      {/* Filters + search */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 border-b border-border bg-muted/10">
          <button
            type="button"
            onClick={() => setPlatformTab('all')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              platformTab === 'all'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            All
            <span className="tabular-nums opacity-80">{tabCounts.all}</span>
          </button>
            {platforms.map((p) => {
            const Icon = ICONS[p.icon] || Globe2;
            const active = platformTab === p.slug;
              return (
              <button
                key={p.slug}
                type="button"
                onClick={() => setPlatformTab(p.slug)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                  <Icon className="h-3.5 w-3.5" />
                  {p.name}
                <span className="tabular-nums opacity-80">{tabCounts[p.slug] || 0}</span>
              </button>
              );
            })}

          <div className="relative ml-auto w-full sm:w-52">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
              placeholder="Search profiles…"
              className="h-7 pl-7 text-[11px]"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-[120px] text-[11px]">
              <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto max-h-[calc(100dvh-14rem)]">
          <table className="text-sm border-collapse w-full" style={{ minWidth: 1080 }}>
            <thead className="sticky top-0 z-10 border-b bg-muted/95 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Profile</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Relevance</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Platform</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Details</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Poll</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Monitoring</th>
                <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No profiles yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Add a platform account to start monitoring.</p>
                    <Button size="sm" className="mt-3 h-8 gap-1.5" onClick={openAddProfile}>
                      <Plus className="h-3.5 w-3.5" /> Add profile
                      </Button>
                  </td>
                </tr>
              ) : (
                profiles.map((row) => {
                  const Icon = ICONS[platforms.find((p) => p.slug === row.platform)?.icon] || Globe2;
                  const detail = Object.entries(row.data || {})
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ');
                  const isMonitoring = row.monitoring_status === 'started';
                  const history = buildMonitoringHistory(row.monitoring_logs, row.monitoring_status);
                  const fetchStats = summarizeFetchHistory(row.last_fetched_history, history);
                  const openSession = history.find((s) => s.state === 'running');
                  const phase = getMonitoringPhase(row, monitorNow, {
                    sessionStartedAt: openSession?.startedAt || null,
                  });
                  return (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-muted/25">
                      <td className="px-2.5 py-2 align-top">
                        <button
                          type="button"
                          className="text-left group"
                          onClick={() => navigate(`/social-profiles/${row.id}`)}
                        >
                          <p className="font-medium text-[13px] leading-tight text-foreground group-hover:text-primary group-hover:underline">
                            {row.display_name || row.handle}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {row.handle}
                          </p>
                        </button>
                        {phase.phase === 'waiting' ? (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-800">
                            <Timer className="h-2.5 w-2.5" />
                            Waiting · <span className="tabular-nums">{formatCountdown(phase.remainingMs)}</span>
                          </p>
                        ) : phase.phase === 'fetching' || phase.phase === 'due' ? (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-sky-800">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            Fetching…
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <ProfileRelevanceBadge row={row} />
                      </td>
                      <td className="px-2.5 py-2 align-top whitespace-nowrap">
                        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                          <Icon className="h-3 w-3" /> {row.platform_name || row.platform}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 align-top max-w-[220px]">
                        <p className="truncate text-[11px] text-muted-foreground" title={detail || ''}>
                          {detail || '—'}
                        </p>
                      </td>
                      <td className="px-2.5 py-2 align-top whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">
                          {formatPollInterval(row.poll_interval_minutes)}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button
                          type="button"
                            size="sm"
                            variant={isMonitoring ? 'destructive' : 'default'}
                            className="h-7 gap-1 px-2 text-[11px]"
                            disabled={monitoringId === row.id}
                            onClick={() => toggleMonitoring(row)}
                          >
                            {monitoringId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isMonitoring ? (
                              <Square className="h-3 w-3" />
                            ) : (
                            <PlayCircle className="h-3 w-3" />
                            )}
                            {isMonitoring ? 'Stop' : 'Start'}
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                                <History className="h-3 w-3" /> History
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 p-0">
                              <div className="border-b px-3 py-2">
                                <p className="text-sm font-medium">Monitoring history</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {row.display_name || row.handle}
                                </p>
                              </div>
                              <div className="max-h-72 overflow-y-auto">
                                {history.length === 0 ? (
                                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    No monitoring sessions yet
                                  </p>
                                ) : (
                                  <ul className="divide-y">
                                    {history.map((session, sessionIdx) => {
                                      const isActive = session.state === 'running' && sessionIdx === 0;
                                      const sessionPhase = isActive
                                        ? phase
                                        : { phase: session.state === 'done' ? 'stopped' : session.state };
                                      const elapsedMs =
                                        session.state === 'running' && session.startedAt
                                          ? Math.max(0, monitorNow - new Date(session.startedAt).getTime())
                                          : session.durationMs;
                                      const badge =
                                        sessionPhase.phase === 'waiting'
                                          ? { label: 'Waiting', className: 'border-amber-500/30 bg-amber-500/10 text-amber-800' }
                                          : sessionPhase.phase === 'fetching' || sessionPhase.phase === 'due'
                                            ? { label: 'Fetching', className: 'border-sky-500/30 bg-sky-500/10 text-sky-800' }
                                            : session.state === 'running'
                                              ? { label: 'Running', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' }
                                              : session.state === 'done'
                                                ? { label: 'Stopped', className: 'border-slate-500/25 bg-slate-500/10 text-slate-700' }
                                                : { label: 'Incomplete', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700' };
                                      return (
                                        <li key={session.id} className="px-3 py-2 text-xs">
                                          <div className="mb-0.5 flex items-center justify-between gap-2">
                                            <Badge variant="outline" className={`h-5 capitalize text-[10px] ${badge.className}`}>
                                              {badge.label}
                                            </Badge>
                                            <span className="font-semibold tabular-nums text-muted-foreground">
                                              {formatDuration(elapsedMs)}
                                            </span>
                                          </div>
                                          <p className="text-muted-foreground">
                                            Started {formatWhen(session.startedAt)}
                                          </p>
                                          {session.stoppedAt ? (
                                            <p className="text-muted-foreground">
                                              Stopped {formatWhen(session.stoppedAt)}
                                            </p>
                                          ) : sessionPhase.phase === 'waiting' ? (
                                            <p className="text-amber-800">
                                              Next fetch in{' '}
                                              <span className="font-semibold tabular-nums">
                                                {formatCountdown(sessionPhase.remainingMs)}
                                              </span>
                                            </p>
                                          ) : sessionPhase.phase === 'fetching' || sessionPhase.phase === 'due' ? (
                                            <p className="text-sky-800">Fetching now…</p>
                                          ) : session.state === 'running' ? (
                                            <p className="text-emerald-700">Still monitoring…</p>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                                <BarChart3 className="h-3 w-3" /> Stats
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 p-0">
                              <div className="border-b px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">Fetch stats</p>
                                  <Badge
                            variant="outline"
                                    className={`h-5 text-[10px] capitalize ${
                                      phase.phase === 'waiting'
                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800'
                                        : phase.phase === 'fetching' || phase.phase === 'due'
                                          ? 'border-sky-500/30 bg-sky-500/10 text-sky-800'
                                          : isMonitoring
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                            : 'border-slate-500/25 bg-slate-500/10 text-slate-600'
                                    }`}
                                  >
                                    {phase.phase === 'waiting'
                                      ? `Waiting · ${formatCountdown(phase.remainingMs)}`
                                      : phase.phase === 'fetching' || phase.phase === 'due'
                                        ? 'Fetching'
                                        : isMonitoring
                                          ? 'Started'
                                          : 'Stopped'}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {row.display_name || row.handle}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  Totals stay after Stop — lifetime fetch history, not only the current run.
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 border-b px-3 py-2.5 text-xs">
                                <div>
                                  <p className="text-muted-foreground">API hits</p>
                                  <p className="font-medium tabular-nums">{fetchStats.apiHits}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Posts stored</p>
                                  <p className="font-medium tabular-nums">{row.posts_stored ?? 0}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">New posts</p>
                                  <p className="font-medium tabular-nums">{fetchStats.postsNew}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Total run time</p>
                                  <p className="font-medium tabular-nums">{formatDuration(fetchStats.totalRunningMs)}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">Last fetched</p>
                                  <p className="font-medium">{formatWhen(row.last_fetched_at)}</p>
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto">
                                {fetchStats.runsNewestFirst.length === 0 ? (
                                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    No fetch runs yet
                                  </p>
                                ) : (
                                  <ul className="divide-y">
                                    {fetchStats.runsNewestFirst.map((run, idx) => (
                                      <li key={`${run.at}-${idx}`} className="px-3 py-2 text-xs">
                                        <div className="mb-0.5 flex items-center justify-between gap-2">
                                          <span className="text-muted-foreground">{formatWhen(run.at)}</span>
                                          <Badge
                                            variant="outline"
                                            className={`h-5 text-[10px] ${
                                              run.ok === false
                                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                            }`}
                                          >
                                            {run.ok === false ? 'Failed' : 'OK'}
                                          </Badge>
                                        </div>
                                        <p>
                                          {Number(run.api_hits) || 0} API hit(s) ·{' '}
                                          {Number(run.posts_returned) || 0} returned ·{' '}
                                          {Number(run.posts_new) || 0} new
                                        </p>
                                        {run.message ? (
                                          <p className="mt-0.5 text-rose-600">{run.message}</p>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => openEditProfile(row)}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            onClick={() => setDeleteProfile(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit profile */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-3.5 text-left">
            <DialogTitle className="text-base">
              {editingProfile ? 'Edit profile' : 'Add profile'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fetch every platform, then Save. Add Facebook, X, YouTube on the same profile.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveProfile} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    className="h-9"
                    value={profileForm.display_name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="e.g. TV9 Telugu"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Poll</Label>
                  <Select
                    value={profileForm.poll_preset}
                    onValueChange={(v) => {
                      const preset = POLL_PRESETS.find((p) => p.value === v);
                      setProfileForm((f) => ({
                        ...f,
                        poll_preset: v,
                        poll_interval_minutes:
                          v === 'custom'
                            ? (Number.isInteger(Number(f.poll_interval_minutes)) &&
                              !POLL_PRESETS.some((p) => p.minutes === Number(f.poll_interval_minutes))
                              ? f.poll_interval_minutes
                              : 45)
                            : preset.minutes,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9">
                  <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLL_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {profileForm.poll_preset === 'custom' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={10080}
                    className="h-9 w-28"
                    value={profileForm.poll_interval_minutes}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        poll_interval_minutes: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    required
                  />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">
                    Platforms
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({profileForm.accounts.length})
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={addAccountSlot}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add platform
                  </Button>
                </div>

                <div className="space-y-2">
                  {profileForm.accounts.map((account) => {
                    const plat = platforms.find((p) => p.slug === account.platform);
                    const fields = (Array.isArray(plat?.fields) ? plat.fields : []).filter(
                      (f) => !HIDDEN_FIELD_KEYS.has(f.key)
                    );
                    const fetched = Boolean(account.preview_data?.fetched_at);
                    const primaryField = fields[0];
                    return (
                      <div
                        key={account.key}
                        className={`rounded-lg border p-3 ${fetched ? 'border-emerald-500/25 bg-emerald-500/[0.03]' : 'bg-card'}`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Select
                            value={account.platform}
                            onValueChange={(v) => setAccountPlatform(account.key, v)}
                            disabled={Boolean(account.profileId)}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
                          {fetched ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700"
                            >
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 text-[10px] text-amber-700">
                              Needs fetch
                            </Badge>
                          )}
                          <div className="flex-1" />
                          {profileForm.accounts.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-600"
                              onClick={() => removeAccountSlot(account.key)}
                              title="Remove platform"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
            </div>

                        {primaryField ? (
                          <div className="flex gap-2">
              <Input
                              className="h-9 flex-1"
                              type={primaryField.type === 'url' ? 'url' : 'text'}
                              placeholder={primaryField.placeholder || primaryField.label}
                              required={primaryField.required}
                              value={account.data?.[primaryField.key] || ''}
                              onChange={(e) =>
                                updateAccount(account.key, {
                                  data: { ...account.data, [primaryField.key]: e.target.value },
                                  preview: null,
                                  preview_data: null,
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant={fetched ? 'outline' : 'default'}
                              className="h-9 shrink-0 gap-1.5 px-3"
                              disabled={account.fetching || !fields.length}
                              onClick={() => fetchAccountPreview(account.key)}
                            >
                              {account.fetching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              Fetch
                            </Button>
            </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No fields for this platform.</p>
                        )}

                        {fields.slice(1).map((field) => (
              <Input
                            key={field.key}
                            className="mt-2 h-9"
                            type={field.type === 'url' ? 'url' : 'text'}
                            placeholder={field.placeholder || field.label}
                            required={field.required}
                            value={account.data?.[field.key] || ''}
                            onChange={(e) =>
                              updateAccount(account.key, {
                                data: { ...account.data, [field.key]: e.target.value },
                                preview: null,
                                preview_data: null,
                              })
                            }
                          />
                        ))}

                        {account.preview ? (
                          <div className="mt-2 flex items-center gap-2.5 rounded-md border bg-background/80 px-2.5 py-2">
                            {account.preview.image ? (
                              <img
                                src={account.preview.image}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                                —
            </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{account.preview.name || 'Unknown'}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {account.preview.followers != null
                                  ? `${Number(account.preview.followers).toLocaleString()} followers`
                                  : account.preview.url || ''}
                                {account.preview.page_id ||
                                account.preview.user_id ||
                                account.preview.channel_id
                                  ? ` · ${
                                      account.preview.page_id ||
                                      account.preview.user_id ||
                                      account.preview.channel_id
                                    }`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  rows={2}
                  className="min-h-[52px] resize-none text-sm"
                  value={profileForm.notes}
                  onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t bg-muted/30 px-5 py-3 sm:space-x-2">
              {!allAccountsFetched ? (
                <p className="mr-auto hidden text-[11px] text-amber-700 sm:block">
                  Fetch all platforms to enable Save
                </p>
              ) : (
                <span className="mr-auto" />
              )}
              <Button type="button" variant="outline" className="h-9" onClick={() => setProfileOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 min-w-[96px]"
                disabled={savingProfile || !allAccountsFetched}
              >
                {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteProfile)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteProfile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{' '}
              <span className="font-medium text-foreground">
                {deleteProfile?.display_name || deleteProfile?.handle || 'this account'}
              </span>{' '}
              ({deleteProfile?.platform_name || deleteProfile?.platform}) and stops monitoring. Stored
              posts for this account may remain until cleaned up separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteProfile();
              }}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default SocialProfiles;
