import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Contact2, Search, Plus, Pencil, Trash2, Loader2, PlayCircle, PauseCircle,
  Users, UserCheck, UserX, Twitter, Facebook, Instagram, Youtube, Globe2, Settings2, Square, History, BarChart3, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { socialProfilesApi } from '../api/socialProfiles.api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';

const ICONS = { Twitter, Facebook, Instagram, Youtube, Globe2 };
const ICON_OPTIONS = [
  { value: 'Twitter', label: 'X / Twitter' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Youtube', label: 'YouTube' },
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

const FIELD_PRESETS = [
  { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'e.g. narendramodi' },
  { key: 'url', label: 'Profile / page URL', type: 'url', required: true, placeholder: 'https://…' },
  { key: 'page_id', label: 'Page ID', type: 'text', required: false, placeholder: 'Numeric page id' },
  { key: 'channel_id', label: 'Channel ID', type: 'text', required: false, placeholder: 'e.g. UCxxxx' },
  { key: 'channel_url', label: 'Channel URL', type: 'url', required: true, placeholder: 'https://youtube.com/@…' },
];

const blankField = () => ({
  key: '',
  label: '',
  type: 'text',
  required: true,
  placeholder: '',
});

const emptyPlatformForm = () => ({
  name: '',
  slug: '',
  icon: 'Globe2',
  is_active: true,
  fields: [{ ...FIELD_PRESETS[0] }],
});

const slugify = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const fieldKeyify = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

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
  const [platforms, setPlatforms] = useState([]);
  const [allPlatforms, setAllPlatforms] = useState([]);
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
  const [togglingId, setTogglingId] = useState(null);
  const [monitoringId, setMonitoringId] = useState(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [platformForm, setPlatformForm] = useState(emptyPlatformForm());
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [deletePlatform, setDeletePlatform] = useState(null);

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
    const [activeRes, allRes] = await Promise.all([
      socialProfilesApi.listPlatforms(),
      socialProfilesApi.listPlatforms({ all: 1 }),
    ]);
    const active = Array.isArray(activeRes.data) ? activeRes.data : [];
    const all = Array.isArray(allRes.data) ? allRes.data : [];
    setPlatforms(active);
    setAllPlatforms(all);
    return { active, all };
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [platformTab, statusFilter, query]);

  useEffect(() => {
    loadPlatforms().catch(() => toast.error('Failed to load platforms'));
  }, [loadPlatforms]);

  useEffect(() => {
    const t = setTimeout(loadProfiles, query ? 300 : 0);
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
        accounts: siblings.map((s) => rowToAccountSlot(s, [...platforms, ...allPlatforms])),
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

  const toggleProfile = async (row) => {
    setTogglingId(row.id);
    try {
      await socialProfilesApi.update(row.id, { is_active: !row.is_active });
      await loadProfiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Update failed');
    } finally {
      setTogglingId(null);
    }
  };

  const toggleMonitoring = async (row) => {
    setMonitoringId(row.id);
    try {
      const res = await socialProfilesApi.toggleMonitoring(row.id);
      const next = res.data?.monitoring_status;
      toast.success(next === 'started' ? 'Monitoring started' : 'Monitoring stopped');
      await loadProfiles();
      // Kickoff fetch is async — refresh again so Stats / history catch up
      if (next === 'started') {
        setTimeout(() => {
          loadProfiles().catch(() => {});
        }, 4000);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Monitoring update failed');
    } finally {
      setMonitoringId(null);
    }
  };

  const openAddPlatform = () => {
    setEditingPlatform(null);
    setPlatformForm(emptyPlatformForm());
    setPlatformOpen(true);
  };

  const openEditPlatform = (row) => {
    setEditingPlatform(row);
    setPlatformForm({
      name: row.name || '',
      slug: row.slug || '',
      icon: row.icon || 'Globe2',
      is_active: row.is_active !== false,
      fields: Array.isArray(row.fields) && row.fields.length
        ? row.fields.map((f) => ({ ...blankField(), ...f }))
        : [blankField()],
    });
    setPlatformOpen(true);
  };

  const savePlatform = async (e) => {
    e.preventDefault();
    const fields = platformForm.fields
      .map((f) => ({
        ...f,
        key: fieldKeyify(f.key || f.label),
        label: f.label.trim() || f.key,
      }))
      .filter((f) => f.key);
    if (!fields.length) {
      toast.error('Add at least one field');
      return;
    }
    setSavingPlatform(true);
    try {
      const payload = {
        name: platformForm.name.trim(),
        slug: slugify(platformForm.slug || platformForm.name),
        icon: platformForm.icon,
        is_active: platformForm.is_active,
        fields,
      };
      if (editingPlatform) {
        await socialProfilesApi.updatePlatform(editingPlatform.id, payload);
        toast.success('Platform updated');
      } else {
        await socialProfilesApi.createPlatform(payload);
        toast.success('Platform added');
      }
      setPlatformOpen(false);
      const { active } = await loadPlatforms();
      if (platformTab !== 'all' && !active.some((p) => p.slug === platformTab)) {
        setPlatformTab('all');
      }
      await loadProfiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setSavingPlatform(false);
    }
  };

  const confirmDeletePlatform = async () => {
    if (!deletePlatform) return;
    try {
      await socialProfilesApi.deletePlatform(deletePlatform.id);
      toast.success('Platform deleted');
      setDeletePlatform(null);
      await loadPlatforms();
      await loadProfiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Delete failed');
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
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Contact2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold sm:text-2xl">Profile Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Fields change per platform — all profiles stay in one table
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setManageOpen(true)}>
            <Settings2 className="h-4 w-4" /> Manage platforms
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openAddPlatform}>
            <Plus className="h-4 w-4" /> Add platform
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={openAddProfile}>
            <Plus className="h-4 w-4" /> Add profile
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-3">
        {[
          { label: 'Total profiles', value: stats.total, icon: Users },
          { label: 'Active', value: stats.active, icon: UserCheck, tone: 'text-emerald-600 bg-emerald-500/10' },
          { label: 'Paused', value: stats.paused, icon: UserX, tone: 'text-slate-600 bg-slate-500/10' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-md ${s.tone || 'bg-muted'}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={platformTab} onValueChange={setPlatformTab} className="shrink-0">
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            All <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{tabCounts.all}</Badge>
          </TabsTrigger>
          {platforms.map((p) => {
            const Icon = ICONS[p.icon] || Globe2;
            return (
              <TabsTrigger key={p.slug} value={p.slug} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {p.name}
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{tabCounts[p.slug] || 0}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="flex shrink-0 gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted/95 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Profile</th>
                <th className="px-3 py-2.5 font-medium">Platform</th>
                <th className="px-3 py-2.5 font-medium">Details</th>
                <th className="px-3 py-2.5 font-medium">Poll every</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Monitoring</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-16 text-center text-muted-foreground">
                    No profiles yet
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
                  return (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-muted/25">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.display_name || row.handle}</p>
                        <p className="text-[11px] text-muted-foreground">{row.handle}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                          <Icon className="h-3 w-3" /> {row.platform_name || row.platform}
                        </Badge>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                        {detail || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          {formatPollInterval(row.poll_interval_minutes)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleProfile(row)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                            row.is_active
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {togglingId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : row.is_active ? (
                            <PlayCircle className="h-3 w-3" />
                          ) : (
                            <PauseCircle className="h-3 w-3" />
                          )}
                          {row.is_active ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={isMonitoring ? 'destructive' : 'default'}
                            className="h-8 gap-1.5 px-2.5"
                            disabled={monitoringId === row.id}
                            onClick={() => toggleMonitoring(row)}
                          >
                            {monitoringId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isMonitoring ? (
                              <Square className="h-3.5 w-3.5" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5" />
                            )}
                            {isMonitoring ? 'Stop' : 'Start'}
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
                                <History className="h-3.5 w-3.5" /> History
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
                                    {history.map((session) => (
                                      <li key={session.id} className="px-3 py-2.5 text-xs">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                          <Badge
                                            variant="outline"
                                            className={`h-5 capitalize text-[10px] ${
                                              session.state === 'running'
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                                : session.state === 'done'
                                                  ? 'border-slate-500/25 bg-slate-500/10 text-slate-700'
                                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                            }`}
                                          >
                                            {session.state === 'running'
                                              ? 'Running'
                                              : session.state === 'done'
                                                ? 'Stopped'
                                                : 'Incomplete'}
                                          </Badge>
                                          <span className="font-medium tabular-nums">
                                            {session.state === 'running'
                                              ? `Running ${formatDuration(session.durationMs)}`
                                              : formatDuration(session.durationMs)}
                                          </span>
                                        </div>
                                        <p className="text-muted-foreground">
                                          Started {formatWhen(session.startedAt)}
                                        </p>
                                        {session.stoppedAt ? (
                                          <p className="text-muted-foreground">
                                            Stopped {formatWhen(session.stoppedAt)}
                                          </p>
                                        ) : session.state === 'running' ? (
                                          <p className="text-emerald-700">Still monitoring…</p>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
                                <BarChart3 className="h-3.5 w-3.5" /> Stats
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 p-0">
                              <div className="border-b px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">Fetch stats</p>
                                  <Badge
                                    variant="outline"
                                    className={`h-5 text-[10px] capitalize ${
                                      isMonitoring
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                        : 'border-slate-500/25 bg-slate-500/10 text-slate-600'
                                    }`}
                                  >
                                    {isMonitoring ? 'Started' : 'Stopped'}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {row.display_name || row.handle}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  Totals stay after Stop — they are lifetime fetch history, not only the current run.
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
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openEditProfile(row)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => setDeleteProfile(row)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Manage platforms list */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage platforms</DialogTitle>
            <DialogDescription>
              Platforms like X, Facebook, YouTube. Each one asks for different info when you add a profile.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {allPlatforms.map((row) => {
              const Icon = ICONS[row.icon] || Globe2;
              const fieldNames = (row.fields || []).map((f) => f.label || f.key).join(', ') || 'nothing set';
              return (
                <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">Asks for: {fieldNames}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditPlatform(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeletePlatform(row)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" className="gap-1.5" onClick={openAddPlatform}>
              <Plus className="h-4 w-4" /> Add platform
            </Button>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit platform — simple */}
      <Dialog open={platformOpen} onOpenChange={setPlatformOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlatform ? 'Edit platform' : 'Add platform'}</DialogTitle>
            <DialogDescription>
              Example: for X you need a username; for Facebook you need a page URL.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={savePlatform} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Platform name</Label>
              <Input
                required
                value={platformForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setPlatformForm((f) => ({
                    ...f,
                    name,
                    slug: editingPlatform ? f.slug : slugify(name),
                  }));
                }}
                placeholder="e.g. Telegram"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <Select value={platformForm.icon} onValueChange={(v) => setPlatformForm((f) => ({ ...f, icon: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>What should we ask when adding a profile?</Label>
              <p className="text-xs text-muted-foreground">
                Tap to add. You can turn off “Must fill” if the field is optional.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {FIELD_PRESETS.map((preset) => {
                  const already = platformForm.fields.some((f) => f.key === preset.key);
                  return (
                    <Button
                      key={preset.key}
                      type="button"
                      size="sm"
                      variant={already ? 'secondary' : 'outline'}
                      className="h-8"
                      disabled={already}
                      onClick={() =>
                        setPlatformForm((f) => ({
                          ...f,
                          fields: [...f.fields, { ...preset }],
                        }))
                      }
                    >
                      + {preset.label}
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-2 pt-1">
                {platformForm.fields.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                    Add at least one — Username or Profile URL is usual.
                  </p>
                ) : (
                  platformForm.fields.map((field, idx) => (
                    <div
                      key={`${field.key}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{field.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {field.type === 'url' ? 'Link / URL' : 'Text'}
                          {field.required ? ' · must fill' : ' · optional'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={field.required}
                            onCheckedChange={(checked) => {
                              const fields = [...platformForm.fields];
                              fields[idx] = { ...fields[idx], required: checked };
                              setPlatformForm((f) => ({ ...f, fields }));
                            }}
                          />
                          Must fill
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() =>
                            setPlatformForm((f) => ({
                              ...f,
                              fields: f.fields.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Show in app</p>
                <p className="text-[11px] text-muted-foreground">Off = hidden from filters</p>
              </div>
              <Switch
                checked={platformForm.is_active}
                onCheckedChange={(v) => setPlatformForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPlatformOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingPlatform || platformForm.fields.length === 0}>
                {savingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingPlatform ? 'Save' : 'Add platform'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProfile} onOpenChange={(o) => !o && setDeleteProfile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes “{deleteProfile?.display_name || deleteProfile?.handle}” from the catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProfile} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePlatform} onOpenChange={(o) => !o && setDeletePlatform(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete platform?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes “{deletePlatform?.name}”. Blocked if profiles still use it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePlatform}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SocialProfiles;
