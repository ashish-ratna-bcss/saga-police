import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth.context';
import { authApi } from '../../api/auth.api';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { AlertService } from '../../api';
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
import {
  TelegramBrandLogo,
  XBrandLogo,
  FacebookBrandLogo,
  InstagramBrandLogo,
  YoutubeBrandLogo,
} from '../../components/PlatformBrandIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const PLATFORM_PRESETS = [
  {
    slug: 'x',
    name: 'X (Twitter)',
    icon: 'twitter',
    brandIcon: XBrandLogo,
    color: '#000000',
    description: 'Ingests real-time citizen posts, breaking trends, viral mentions, and complaints.',
  },
  {
    slug: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    brandIcon: FacebookBrandLogo,
    color: '#1877F2',
    description: 'Monitors public community pages, local civic groups, and citizen grievance discussions.',
  },
  {
    slug: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    brandIcon: InstagramBrandLogo,
    color: '#E4405F',
    description: 'Tracks multimedia posts, video reels, viral hashtags, and youth trends.',
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    brandIcon: YoutubeBrandLogo,
    color: '#FF0000',
    description: 'Monitors news broadcasts, citizen video uploads, speech streams, and comments.',
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    icon: 'telegram',
    brandIcon: TelegramBrandLogo,
    color: '#229ED9',
    description: 'Monitors public broadcast channels, community groups, and intelligence feeds.',
  },
];

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

  // Platform form state
  const [selectedPreset, setSelectedPreset] = useState(PLATFORM_PRESETS[0]);
  const [platformName, setPlatformName] = useState(PLATFORM_PRESETS[0].name);
  const [platformSlug, setPlatformSlug] = useState(PLATFORM_PRESETS[0].slug);
  const [blugateKey, setBlugateKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showBlugateKey, setShowBlugateKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(100);
  const [medThreshold, setMedThreshold] = useState(500);
  const [highThreshold, setHighThreshold] = useState(1000);
  const [timeWindow, setTimeWindow] = useState(60);

  const [savingPlatform, setSavingPlatform] = useState(false);
  const [deletingPlatformId, setDeletingPlatformId] = useState(null);

  // Keyword form state
  const [keywordInput, setKeywordInput] = useState('');
  const [savingKeyword, setSavingKeyword] = useState(false);
  const [deletingKeywordId, setDeletingKeywordId] = useState(null);

  // Unlock state
  const [unlocking, setUnlocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    setPlatformName(preset.name);
    setPlatformSlug(preset.slug);
  };

  const handleAddPlatform = async (e) => {
    e?.preventDefault();
    if (!platformName.trim() || !platformSlug.trim()) {
      toast.error('Platform name and slug are required');
      return;
    }
    if (!blugateKey.trim()) {
      toast.error('Blugate Client Key is required');
      return;
    }
    if (!apiKey.trim()) {
      toast.error('API Key is required');
      return;
    }

    setSavingPlatform(true);
    try {
      await socialProfilesApi.createPlatform({
        name: platformName.trim(),
        slug: platformSlug.trim().toLowerCase(),
        icon: selectedPreset?.icon || 'Globe2',
        color: selectedPreset?.color || null,
        blugate_client_key: blugateKey.trim(),
        api_key: apiKey.trim(),
        low_threshold: Number(lowThreshold) || 100,
        medium_threshold: Number(medThreshold) || 500,
        high_threshold: Number(highThreshold) || 1000,
        time_window_minutes: Number(timeWindow) || 60,
        is_active: true,
      });

      toast.success(`Platform ${platformName} connected`);
      setBlugateKey('');
      setApiKey('');
      // Switch to next unconnected preset if possible
      const existingSlugs = new Set([...platforms.map((p) => p.slug), platformSlug.trim().toLowerCase()]);
      const nextUnused = PLATFORM_PRESETS.find((p) => !existingSlugs.has(p.slug));
      if (nextUnused) {
        handleSelectPreset(nextUnused);
      }
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save platform');
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleDeletePlatform = async (id, name) => {
    if (!window.confirm(`Disconnect platform "${name}"?`)) return;
    setDeletingPlatformId(id);
    try {
      await socialProfilesApi.deletePlatform(id);
      toast.success('Platform removed');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete platform');
    } finally {
      setDeletingPlatformId(null);
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
    const canUnlock = platforms.length > 0 && keywords.length > 0;
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

  const hasPlatforms = platforms.length > 0;
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
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      {/* Official Drishti Primary Header */}
      <header
        className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 shadow-md px-4 sm:px-6 text-white transition-all duration-300"
        style={{ background: 'var(--primary-gradient)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={resolvePublicAssetUrl(orgLogo)}
            alt={orgTitle}
            className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/30 bg-white/10"
          />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-heading text-base font-bold tracking-[0.12em] text-white sm:text-lg">
                {orgTitle}
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white border border-white/30">
                Setup Mode
              </span>
            </div>
            <p className="hidden truncate text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:block">
              {orgDesc}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <img
            src="/Logo.png"
            alt="Blue Cloud Softech"
            className="h-8 w-auto object-contain opacity-95 hidden md:block"
          />
          <div className="mx-1 hidden h-8 w-px bg-white/25 sm:block" aria-hidden />
          <div className="hidden text-right sm:block">
            <div className="max-w-[150px] truncate text-sm font-bold text-white">
              {user?.name || user?.username}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/90">
              Administrator
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-white hover:bg-white/10 h-9 px-3 gap-1.5"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        {/* Organization / Website Overview Card */}
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  {orgTitle} · Workspace Onboarding
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Tenant Environment: <span className="font-mono font-medium text-foreground">{tenantDb}</span>
              </p>
            </div>

            {/* Live Progress Indicators */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  hasPlatforms
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }`}
              >
                {hasPlatforms ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>Platform ({platforms.length})</span>
              </div>

              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  hasKeywords
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }`}
              >
                {hasKeywords ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>Keywords ({keywords.length})</span>
              </div>
            </div>
          </div>

          {/* Clear Requirement Notice */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Mandatory Configuration Required Before Website Access</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                To activate automated observation, alert scanning, and citizen grievance monitoring for{' '}
                <strong>{orgTitle}</strong>, you must configure at least <strong>1 social media platform</strong> with
                API credentials and add at least <strong>1 monitoring keyword</strong>. All other pages will unlock
                automatically upon completion.
              </p>
            </div>
          </div>
        </div>

        {/* STEP 1: SOCIAL PLATFORM CONFIGURATION */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Social Platform Connection</h3>
                <p className="text-xs text-muted-foreground">
                  Connect data streams for social media monitoring and alert ingestion
                </p>
              </div>
            </div>
            <Badge
              variant={hasPlatforms ? 'default' : 'secondary'}
              className="text-[11px] font-medium"
            >
              {hasPlatforms ? `${platforms.length} Connected` : 'Required'}
            </Badge>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {/* Quick Pick Platform Presets */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Platform
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {PLATFORM_PRESETS.map((preset) => {
                  const Brand = preset.brandIcon;
                  const isSelected = selectedPreset?.slug === preset.slug;
                  const isAlreadyAdded = platforms.some((p) => p.slug === preset.slug);

                  return (
                    <button
                      key={preset.slug}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs ring-1 ring-primary'
                          : 'border-border bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Brand className="w-4 h-4 shrink-0" />
                      <span className="text-xs truncate flex-1">{preset.name}</span>
                      {isAlreadyAdded && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Connected" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground italic mt-1">
                {selectedPreset.name}: {selectedPreset.description}
              </p>
            </div>

            {/* Platform Credential Form */}
            <form onSubmit={handleAddPlatform} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz_plat_name" className="text-xs font-medium">Platform Name</Label>
                  <Input
                    id="wiz_plat_name"
                    value={platformName}
                    onChange={(e) => setPlatformName(e.target.value)}
                    placeholder="e.g. X (Twitter)"
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz_plat_slug" className="text-xs font-medium">Slug Identifier</Label>
                  <Input
                    id="wiz_plat_slug"
                    value={platformSlug}
                    onChange={(e) => setPlatformSlug(e.target.value)}
                    placeholder="e.g. x"
                    className="h-9 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              {/* Blugate Client Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wiz_blugate" className="text-xs font-medium">
                    Blugate Client Key <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowBlugateKey(!showBlugateKey)}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showBlugateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showBlugateKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="wiz_blugate"
                    type={showBlugateKey ? 'text' : 'password'}
                    value={blugateKey}
                    onChange={(e) => setBlugateKey(e.target.value)}
                    placeholder="Enter Blugate crawler client gateway key"
                    className="h-9 text-xs font-mono pr-9"
                    required
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Provided by Blugate crawler gateway to authorize incoming data streams for this tenant.
                </p>
              </div>

              {/* Platform API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wiz_apikey" className="text-xs font-medium">
                    Platform API Key <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="wiz_apikey"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter platform pipeline API secret key"
                    className="h-9 text-xs font-mono pr-9"
                    required
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Authentication token used by crawler workers to stream posts from {selectedPreset.name}.
                </p>
              </div>

              {/* Optional Viral Thresholds Accordion */}
              <div className="border border-border rounded-lg bg-muted/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    Viral Alert Thresholds (Optional)
                  </span>
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="p-3 border-t border-border space-y-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      Engagement thresholds (likes/reposts) to trigger viral alerts:
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground block mb-1">Low (L)</Label>
                        <Input
                          type="number"
                          value={lowThreshold}
                          onChange={(e) => setLowThreshold(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground block mb-1">Medium (M)</Label>
                        <Input
                          type="number"
                          value={medThreshold}
                          onChange={(e) => setMedThreshold(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground block mb-1">High (H)</Label>
                        <Input
                          type="number"
                          value={highThreshold}
                          onChange={(e) => setHighThreshold(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground block mb-1">Window (min)</Label>
                        <Input
                          type="number"
                          value={timeWindow}
                          onChange={(e) => setTimeWindow(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={savingPlatform} className="w-full h-9 text-xs gap-1.5">
                {savingPlatform ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save & Connect Platform
              </Button>
            </form>

            {/* List of Configured Platforms */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                  Configured Platforms ({platforms.length})
                </span>
              </div>

              {platforms.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No platforms connected yet. Select a platform above and click "Save & Connect Platform".
                </p>
              ) : (
                <div className="space-y-2">
                  {platforms.map((plat) => (
                    <div
                      key={plat.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-background"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Globe2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{plat.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">slug: {plat.slug} · Active</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[10px]">
                          Active
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePlatform(plat.id, plat.name)}
                          disabled={deletingPlatformId === plat.id}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Remove platform"
                        >
                          {deletingPlatformId === plat.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STEP 2: ALERT KEYWORDS CONFIGURATION */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                2
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Alert & Surveillance Keywords</h3>
                <p className="text-xs text-muted-foreground">
                  Add target terms to scan and detect across social media feeds in real-time
                </p>
              </div>
            </div>
            <Badge
              variant={hasKeywords ? 'default' : 'secondary'}
              className="text-[11px] font-medium"
            >
              {hasKeywords ? `${keywords.length} Active` : 'Required'}
            </Badge>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddKeywordsBatch(keywordInput);
              }}
              className="space-y-2"
            >
              <Label htmlFor="wiz_kw_input" className="text-xs font-medium">
                Add Keyword (or Comma-Separated List)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="wiz_kw_input"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="e.g. protest, strike, riot, accident, emergency"
                  className="h-9 text-xs"
                />
                <Button
                  type="submit"
                  disabled={savingKeyword || !keywordInput.trim()}
                  className="h-9 px-4 text-xs shrink-0"
                >
                  {savingKeyword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                  Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tip: Enter multiple keywords separated by commas to add them in batch.
              </p>
            </form>

            {/* Recommended Starter Keywords */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Sparkles className="w-3.5 h-3.5 text-secondary" />
                <span>Quick-Add Recommended Surveillance Terms:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_KEYWORD_GROUPS.map((group) => (
                  <div key={group.category} className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {group.category}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {group.items.map((item) => {
                        const exists = keywords.some((k) => k.keyword?.toLowerCase() === item.toLowerCase());
                        return (
                          <button
                            key={item}
                            type="button"
                            disabled={exists || savingKeyword}
                            onClick={() => handleAddKeywordsBatch(item)}
                            className={`text-[11px] px-2 py-0.5 rounded border transition-all ${
                              exists
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-default font-medium'
                                : 'border-border bg-background text-foreground hover:border-primary hover:text-primary'
                            }`}
                          >
                            {exists ? `✓ ${item}` : `+ ${item}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* List of Configured Keywords */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                  Configured Keywords ({keywords.length})
                </span>
              </div>

              {keywords.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No keywords added yet. Add custom keywords or click recommended terms above.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-3 rounded-lg border border-border bg-background">
                  {keywords.map((kw) => (
                    <Badge
                      key={kw.id}
                      variant="outline"
                      className="gap-1.5 text-xs py-1 px-2.5 bg-muted/30"
                    >
                      <span className="font-medium text-foreground">{kw.keyword}</span>
                      <button
                        type="button"
                        disabled={deletingKeywordId === kw.id}
                        onClick={() => handleDeleteKeyword(kw.id)}
                        className="text-muted-foreground hover:text-destructive ml-0.5"
                        title="Delete keyword"
                      >
                        {deletingKeywordId === kw.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STEP 3: FINAL UNLOCK & LAUNCH BAR */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              {isReadyToUnlock ? (
                <>
                  <Unlock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-foreground">Ready to Unlock Workspace</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-bold text-foreground">Setup Incomplete</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isReadyToUnlock
                ? `Prerequisites satisfied (${platforms.length} platform, ${keywords.length} keywords). Click below to unlock the workspace.`
                : 'Connect at least 1 platform and add at least 1 keyword to enable system launch.'}
            </p>
          </div>

          <Button
            size="lg"
            disabled={!isReadyToUnlock || unlocking}
            onClick={handleUnlockAndLaunch}
            className="w-full sm:w-auto px-6 h-11 text-sm font-semibold gap-2 shadow-sm"
          >
            {unlocking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Unlocking Workspace...
              </>
            ) : (
              <>
                Complete Setup & Launch Workspace
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
