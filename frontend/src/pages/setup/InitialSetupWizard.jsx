import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth.context';
import { authApi } from '../../api/auth.api';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { AlertService } from '../../api';
import api from '../../lib/api';
import { Switch } from '../../components/ui/switch';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { resolvePublicAssetUrl } from '../../lib/publicAssetUrl';
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Key,
  Tag,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
  Globe2,
  Building2,
  Database,
  Info,
  Sliders,
  ChevronDown,
  ChevronUp,
  User,
  Check,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const SUGGESTED_KEYWORD_GROUPS = [
  {
    category: 'Law & Order',
    items: ['protest', 'strike', 'riot', 'dharna', 'rasta roko', 'mob violence'],
  },
  {
    category: 'Public Safety',
    items: ['accident', 'fire incident', 'emergency', 'stampede', 'traffic jam'],
  },
  {
    category: 'Crime & Security',
    items: ['cyber crime', 'threat', 'extortion', 'illegal weapons', 'fraud'],
  },
  {
    category: 'Civic & Department',
    items: ['delhi police', 'police complaint', 'harassment', 'fir', 'grievance'],
  },
];

export default function InitialSetupWizard() {
  const { user, fetchMe, logout } = useAuth();
  const navigate = useNavigate();

  const [setupStatus, setSetupStatus] = useState(
    user?.setup_status || {
      is_configured: false,
      platform_count: 0,
      keyword_count: 0,
      needs_platforms: true,
      needs_keywords: true,
    }
  );

  const [platforms, setPlatforms] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [info, setInfo] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [blugateClient, setBlugateClient] = useState('');
  const [blugateApi, setBlugateApi] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Keyword form state
  const [keywordInput, setKeywordInput] = useState('');
  const [savingKeyword, setSavingKeyword] = useState(false);
  const [deletingKeywordId, setDeletingKeywordId] = useState(null);

  // Unlock state
  const [unlocking, setUnlocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [kwCategory, setKwCategory] = useState(0);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.is_admin;
  const orgTitle = user?.blurasagatitle || user?.theme_name || 'Delhi Police';
  const orgDesc = user?.blurasagadescription || user?.theme_description || 'Cyber Intelligence & Observability Platform';
  const orgLogo = user?.blurasagalogo || user?.theme_logo || '/blura_saga_logo.jpg';
  const tenantDb = user?.db_name || 'blurasaga_delhipolice_drishti_5';

  const loadData = useCallback(async () => {
    try {
      const [statusRes, platformsRes, keywordsRes] = await Promise.allSettled([
        authApi.getSetupStatus(),
        socialProfilesApi.listPlatforms({ all: 1 }),
        AlertService.listKeywords(),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value?.data) {
        setSetupStatus(statusRes.value.data);
      }
      if (platformsRes.status === 'fulfilled') {
        const platList = Array.isArray(platformsRes.value?.data) ? platformsRes.value.data : [];
        setPlatforms(platList);
      }
      if (keywordsRes.status === 'fulfilled') {
        const kwList = Array.isArray(keywordsRes.value?.data) ? keywordsRes.value.data : [];
        setKeywords(kwList);
      }
      try {
        const infoRes = await api.get('/integrations/blugate');
        setInfo(infoRes.data || null);
      } catch { /* platform details are optional */ }
    } catch (err) {
      console.error('[InitialSetupWizard] Load error:', err);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const title = user?.blurasagatitle || user?.theme_name || 'DRISHTI';
    const desc = user?.blurasagadescription || user?.theme_description || 'Cyber Intelligence & Surveillance Platform';
    document.title = `${title} — ${desc}`;

    const logoPath = user?.blurasagalogo || user?.theme_logo;
    if (logoPath) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = resolvePublicAssetUrl(logoPath);
    }
  }, [user]);

  const handleFetch = async (e) => {
    e?.preventDefault();
    const typed = Boolean(blugateClient.trim() || blugateApi.trim());
    if (typed && (!blugateClient.trim() || !blugateApi.trim())) {
      toast.error('Enter both the client key and the API key');
      return;
    }
    if (!typed && !info?.configured) {
      toast.error('Enter your client key and API key first');
      return;
    }
    setFetching(true);
    try {
      await api.post('/integrations/blugate/fetch', typed
        ? { api_key: blugateApi.trim(), blugate_client_key: blugateClient.trim() }
        : {});
      setBlugateClient('');
      setBlugateApi('');
      toast.success('Platforms fetched from BluGate');
      await loadData();
      await fetchMe({ bypassCache: true }).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Could not fetch from BluGate');
    } finally {
      setFetching(false);
    }
  };

  const handleToggle = async (row) => {
    setTogglingId(row.id);
    try {
      await socialProfilesApi.updatePlatform(row.id, { is_active: !row.is_active });
      toast.success(row.is_active ? `${row.name} stopped` : `${row.name} activated`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update platform');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddKeywordsBatch = async (rawKeywords) => {
    const list = (Array.isArray(rawKeywords) ? rawKeywords : String(rawKeywords).split(/[,;\n]+/))
      .map((k) => k.trim())
      .filter(Boolean);

    if (list.length === 0) {
      toast.error('Please enter a keyword');
      return;
    }

    setSavingKeyword(true);
    let added = 0;
    try {
      for (const kw of list) {
        try {
          await AlertService.addKeyword({ keyword: kw, rescan_catalog: false });
          added++;
        } catch {
          // ignore duplicate errors
        }
      }
      if (added > 0) {
        toast.success(`Added ${added} keyword(s)`);
      }
      setKeywordInput('');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save keywords');
    } finally {
      setSavingKeyword(false);
    }
  };

  const handleDeleteKeyword = async (id) => {
    setDeletingKeywordId(id);
    try {
      await AlertService.deleteKeyword(id);
      toast.success('Keyword removed');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete keyword');
    } finally {
      setDeletingKeywordId(null);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await loadData();
      const me = await fetchMe({ bypassCache: true });
      if (me?.setup_status?.is_configured) {
        toast.success('Setup verified! Unlocking platform...');
        navigate('/dashboard', { replace: true });
      } else {
        toast.info('Setup incomplete. Please complete the remaining steps.');
      }
    } catch {
      toast.error('Failed to refresh status');
    } finally {
      setRefreshing(false);
    }
  };

  const handleUnlockAndLaunch = async () => {
    const canUnlock = platforms.some((p) => p.is_active) && keywords.length > 0;
    if (!canUnlock) {
      toast.error('Please configure at least 1 platform and 1 keyword before proceeding.');
      return;
    }

    setUnlocking(true);
    try {
      const me = await fetchMe({ bypassCache: true });
      if (me?.setup_status?.is_configured) {
        toast.success('🎉 Organization setup completed successfully!');
        navigate('/dashboard', { replace: true });
      } else {
        const res = await authApi.getSetupStatus();
        setSetupStatus(res.data);
        if (res.data.is_configured) {
          await fetchMe({ bypassCache: true });
          toast.success('🎉 Organization setup completed successfully!');
          navigate('/dashboard', { replace: true });
        } else {
          toast.error('Setup verification pending. Please verify both platforms and keywords are saved.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to unlock system');
    } finally {
      setUnlocking(false);
    }
  };

  const activePlatforms = platforms.filter((p) => p.is_active);
  const hasPlatforms = activePlatforms.length > 0;
  const hasKeywords = keywords.length > 0;
  const isReadyToUnlock = hasPlatforms && hasKeywords;

  // NON-ADMIN LOCK VIEW
  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-lg text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <Lock className="w-7 h-7 animate-pulse" />
          </div>

          <div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 mb-2">
              Configuration Pending
            </Badge>
            <h2 className="text-xl font-bold">{orgTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{orgDesc}</p>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-3.5 rounded-lg border border-border text-left">
            This organization portal has not completed initial configuration. An administrator must register at least
            one monitoring platform and alert keyword before member access is permitted.
          </p>

          <div className="p-3 rounded-lg border border-border bg-card text-xs space-y-2 text-left">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Platforms:</span>
              <span className={setupStatus.platform_count > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>
                {setupStatus.platform_count > 0 ? `${setupStatus.platform_count} Active` : '0 Configured'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Keywords:</span>
              <span className={setupStatus.keyword_count > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>
                {setupStatus.keyword_count > 0 ? `${setupStatus.keyword_count} Active` : '0 Configured'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleRefreshStatus} disabled={refreshing} className="w-full">
              {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Re-check Status
            </Button>
            <Button variant="outline" onClick={logout} className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ADMIN SETUP VIEW
  const doneCount = Number(hasPlatforms) + Number(hasKeywords);
  const platformItems = (() => {
    const ALIAS = { twitter: 'x', x: 'twitter' };
    const rowFor = (slug) => platforms.find((r) => r.slug === slug) || (ALIAS[slug] ? platforms.find((r) => r.slug === ALIAS[slug]) : null) || null;
    const items = (info?.meta || []).map((m) => ({ key: m.slug, slug: m.slug, name: m.name || rowFor(m.app_slug || m.slug)?.name || m.slug, granted: m.status === 'available', row: rowFor(m.app_slug || m.slug) }));
    const used = new Set(items.map((i) => i.row?.id).filter(Boolean));
    platforms.filter((r) => !used.has(r.id)).forEach((r) => items.push({ key: `r${r.id}`, slug: r.slug, name: r.name, granted: true, row: r }));
    items.sort((a, b) => Number(b.granted) - Number(a.granted) || a.name.localeCompare(b.name));
    return items;
  })();
  const client = info?.client;
  // Live search: the last comma-separated token filters suggestions and saved keywords as you type.
  const kwQuery = keywordInput.split(/[,;\n]+/).pop().trim().toLowerCase();
  const kwSearching = kwQuery.length > 0;
  const kwMatches = SUGGESTED_KEYWORD_GROUPS.flatMap((g) => g.items.map((item) => ({ item, category: g.category })))
    .filter((x) => x.item.toLowerCase().includes(kwQuery));
  const kwExact = keywords.some((k) => k.keyword?.toLowerCase() === kwQuery) || kwMatches.some((x) => x.item.toLowerCase() === kwQuery);
  const visibleKeywords = kwSearching ? keywords.filter((k) => k.keyword?.toLowerCase().includes(kwQuery)) : keywords;
  const steps = [
    { n: 1, title: 'Connect BluGate', hint: hasPlatforms ? `${activePlatforms.length} platform${activePlatforms.length === 1 ? '' : 's'} monitoring` : 'Keys and platforms', done: hasPlatforms },
    { n: 2, title: 'Add keywords', hint: hasKeywords ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} added` : 'What to watch for', done: hasKeywords },
  ];

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      <header
        className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 shadow-md px-4 sm:px-6 text-white"
        style={{ background: 'var(--primary-gradient)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img src={resolvePublicAssetUrl(orgLogo)} alt={orgTitle}
            className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/30 bg-white/10" />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-heading text-base font-bold tracking-[0.12em] text-white sm:text-lg">{orgTitle}</h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white border border-white/30">Setup Mode</span>
            </div>
            <p className="hidden truncate text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:block">{orgDesc}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <img src="/Logo.png" alt="Blue Cloud Softech" className="h-8 w-auto object-contain opacity-95 hidden md:block" />
          <div className="mx-1 hidden h-8 w-px bg-white/25 sm:block" aria-hidden />
          <div className="hidden text-right sm:block">
            <div className="max-w-[150px] truncate text-sm font-bold text-white">{user?.name || user?.username}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/90">Administrator</div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-white hover:bg-white/10 h-9 px-3 gap-1.5" title="Sign Out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 p-4 pb-28 sm:p-6 sm:pb-28 lg:grid-cols-[280px_1fr]">
        {/* LEFT RAIL */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative px-5 pb-5 pt-6" style={{ background: 'var(--primary-gradient)' }}>
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" aria-hidden />
              <div className="absolute -bottom-10 right-10 h-20 w-20 rounded-full bg-white/10" aria-hidden />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <Sparkles className="h-3 w-3" /> Quick setup
                </span>
                <h2 className="mt-3 font-heading text-xl font-bold leading-tight text-white">Let&apos;s get {orgTitle} live</h2>
                <p className="mt-1 text-xs text-white/85">Two quick steps and the full app unlocks.</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${(doneCount / 2) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-white">{doneCount}/2</span>
                </div>
              </div>
            </div>

            <ol className="relative space-y-1 p-4">
              {steps.map((s, i) => (
                <li key={s.n} className="relative flex items-start gap-3 rounded-xl p-2.5">
                  {i < steps.length - 1 && (
                    <span className={`absolute left-[22px] top-10 h-[calc(100%-8px)] w-px ${s.done ? 'bg-emerald-500/50' : 'bg-border'}`} aria-hidden />
                  )}
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-card transition-colors ${s.done ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'}`}>
                    {s.done ? <Check className="h-4 w-4" /> : s.n}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold leading-none">{s.title}</p>
                    <p className={`mt-1 text-xs ${s.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{s.hint}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
              Tenant <span className="block truncate font-mono font-medium text-foreground">{tenantDb}</span>
            </div>
          </div>
        </aside>

        {/* RIGHT CONTENT */}
        <div className="min-w-0 space-y-6">
          {/* STEP 1 */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Database className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-none">Connect BluGate</h3>
                <p className="mt-1.5 text-xs text-muted-foreground">Enter your keys once. We fetch every platform your account can use.</p>
              </div>
              {info?.configured ? (
                <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />Connected</Badge>
              ) : (
                <Badge variant="secondary" className="text-[11px]">Required</Badge>
              )}
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <form onSubmit={handleFetch} className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_bg_client" className="text-xs font-medium">Client key</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="wiz_bg_client" type={showKeys ? 'text' : 'password'} value={blugateClient}
                        onChange={(e) => setBlugateClient(e.target.value)} autoComplete="off" className="h-10 bg-background pl-9 text-sm"
                        placeholder={info?.configured ? 'Saved. Type only to replace' : 'e.g. SOC-EYE-001'} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_bg_api" className="text-xs font-medium">API key</Label>
                    <div className="relative">
                      <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="wiz_bg_api" type={showKeys ? 'text' : 'password'} value={blugateApi}
                        onChange={(e) => setBlugateApi(e.target.value)} autoComplete="new-password" className="h-10 bg-background pl-9 pr-10 text-sm"
                        placeholder={info?.configured ? 'Saved. Type only to replace' : 'BluGate API key'} />
                      <button type="button" onClick={() => setShowKeys((v) => !v)} aria-label={showKeys ? 'Hide keys' : 'Show keys'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Keys are stored encrypted and never shown again.
                  </p>
                  <Button type="submit" className="h-10 gap-2 px-5 text-sm" disabled={fetching || (!info?.configured && !blugateClient.trim() && !blugateApi.trim())}>
                    {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {info?.configured ? 'Refresh platforms' : 'Fetch platforms'}
                  </Button>
                </div>
              </form>

              {platformItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {client?.name ? `${client.name} · ` : ''}
                      <span className="font-normal text-muted-foreground">
                        {client?.accessible_count != null ? `${client.accessible_count} of ${client.total_count} platforms available` : `${platformItems.length} platforms`}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">Tap a tile to start or stop monitoring.</p>
                  </div>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {platformItems.map((it) => {
                      const canUse = Boolean(it.row) && it.granted;
                      const on = Boolean(it.row?.is_active);
                      const busy = togglingId === it.row?.id;
                      return (
                        <li key={it.key}>
                          <button type="button" disabled={!canUse || busy} onClick={() => handleToggle(it.row)} aria-pressed={on}
                            className={`group relative flex h-full w-full flex-col items-start gap-3 rounded-xl border p-3.5 text-left transition-all
                              ${on ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                                : canUse ? 'border-border bg-background hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md'
                                : 'cursor-not-allowed border-border bg-muted/30'}`}>
                            <div className="flex w-full items-start justify-between">
                              <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${on ? 'border-primary/30 bg-background' : 'border-border bg-card'}`}>
                                <PlatformBrandIcon platform={it.slug} className={`h-5 w-5 ${canUse ? '' : 'opacity-40 grayscale'}`} />
                              </span>
                              {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                : !canUse ? <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                : on ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
                                : <span className="h-5 w-5 rounded-full border border-border group-hover:border-primary/60" />}
                            </div>
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold leading-none ${canUse ? '' : 'text-muted-foreground'}`}>{it.name}</p>
                              <p className={`mt-1.5 text-[11px] ${on ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
                                {!it.granted ? 'Not in your plan' : !it.row ? 'Not supported yet' : on ? 'Monitoring on' : 'Off'}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2 */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Tag className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-none">Add keywords</h3>
                <p className="mt-1.5 text-xs text-muted-foreground">Terms to watch for in posts and comments.</p>
              </div>
              <Badge variant={hasKeywords ? 'default' : 'secondary'} className="text-[11px]">
                {hasKeywords ? `${keywords.length} added` : 'Required'}
              </Badge>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleAddKeywordsBatch(keywordInput); }} className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="wiz_kw_input" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Type a keyword, or several separated by commas" className="h-10 pl-9 text-sm" />
                </div>
                <Button type="submit" disabled={savingKeyword || !keywordInput.trim()} className="h-10 shrink-0 gap-1.5 px-5 text-sm">
                  {savingKeyword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </form>

              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {kwSearching ? `${kwMatches.length} suggestion${kwMatches.length === 1 ? '' : 's'} for “${kwQuery}”` : 'Suggestions. Click to add.'}
                </p>
                {!kwSearching && (
                  <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
                    {SUGGESTED_KEYWORD_GROUPS.map((g, i) => (
                      <button key={g.category} type="button" role="tab" aria-selected={kwCategory === i} onClick={() => setKwCategory(i)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${kwCategory === i ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:text-foreground border border-border'}`}>
                        {g.category}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {kwSearching && !kwExact && (
                    <button type="button" disabled={savingKeyword} onClick={() => handleAddKeywordsBatch(keywordInput)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
                      <Plus className="h-3 w-3" />Add “{kwQuery}”
                    </button>
                  )}
                  {(kwSearching ? kwMatches : SUGGESTED_KEYWORD_GROUPS[kwCategory].items.map((item) => ({ item }))).map(({ item, category }) => {
                    const exists = keywords.some((k) => k.keyword?.toLowerCase() === item.toLowerCase());
                    return (
                      <button key={item} type="button" disabled={exists || savingKeyword} onClick={() => handleAddKeywordsBatch(item)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${exists
                          ? 'cursor-default border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400'
                          : 'border-border bg-background hover:border-primary hover:bg-primary/5 hover:text-primary'}`}>
                        {exists ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{item}
                        {kwSearching && category && <span className="ml-1 text-[10px] text-muted-foreground">{category}</span>}
                      </button>
                    );
                  })}
                  {kwSearching && kwMatches.length === 0 && kwExact && (
                    <p className="text-xs text-muted-foreground">Already added.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your keywords ({kwSearching ? `${visibleKeywords.length} of ${keywords.length}` : keywords.length})</p>
                {visibleKeywords.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">{kwSearching ? `No saved keywords match “${kwQuery}”.` : 'No keywords yet. Add one above or pick a suggestion.'}</p>
                ) : (
                  <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                    {visibleKeywords.map((kw) => (
                      <span key={kw.id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 py-1 pl-3 pr-1.5 text-xs font-medium">
                        {kw.keyword}
                        <button type="button" disabled={deletingKeywordId === kw.id} onClick={() => handleDeleteKeyword(kw.id)}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove keyword">
                          {deletingKeywordId === kw.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Launch bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5 text-center sm:text-left">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isReadyToUnlock ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>
              {isReadyToUnlock ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <p className="text-xs text-muted-foreground">
              {isReadyToUnlock
                ? `Ready: ${activePlatforms.length} platform${activePlatforms.length === 1 ? '' : 's'} on, ${keywords.length} keyword${keywords.length === 1 ? '' : 's'} added.`
                : `${!hasPlatforms ? 'Turn on at least one platform. ' : ''}${!hasKeywords ? 'Add at least one keyword.' : ''}`}
            </p>
          </div>
          <Button size="lg" disabled={!isReadyToUnlock || unlocking} onClick={handleUnlockAndLaunch} className="h-11 w-full gap-2 px-7 text-sm font-semibold sm:w-auto">
            {unlocking ? <><Loader2 className="h-4 w-4 animate-spin" />Unlocking…</> : <>Finish setup<ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
