import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { Save, Plus, Trash2, ShieldAlert, BrainCircuit, FileText, Upload, Star, Eye, EyeOff, Pencil, Copy, Check, X, AlertTriangle, Zap, Youtube, Facebook, Instagram, Loader2, Moon, Sun, Palette, ChevronDown, ChevronUp, Globe2 } from 'lucide-react';
import { TelegramBrandLogo, XBrandLogo, RedditBrandLogo } from '../../components/PlatformBrandIcon';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import { ScrollArea } from '../../components/ui/scroll-area';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';
import PolicyManager from '../../components/PolicyManager';
import { Badge } from '../../components/ui/badge';
import { applyThemeColor, BEST_THEMES, THEME_PRESETS, GRADIENT_PRESETS, DEFAULT_THEME_COLOR } from '../../utils/theme';
import { useAuth } from '../../context/auth.context';
import { cn } from '../../lib/utils';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import GrievancesTab from './GrievancesTab';
import AlertKeywordsSection from '../../components/settings/AlertKeywordsSection';
import { PagePlatformSelectItems } from '../../components/PagePlatformSelectItems';

const KNOWN_PLATFORM_PRESETS = [
  { slug: 'x', name: 'X (Twitter)', icon: 'twitter' },
  { slug: 'facebook', name: 'Facebook', icon: 'facebook' },
  { slug: 'instagram', name: 'Instagram', icon: 'instagram' },
  { slug: 'youtube', name: 'YouTube', icon: 'youtube' },
  { slug: 'telegram', name: 'Telegram', icon: 'telegram' },
  { slug: 'reddit', name: 'Reddit', icon: 'reddit' },
];

const PLATFORM_ROW_ICONS = {
  x: XBrandLogo,
  twitter: XBrandLogo,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  telegram: TelegramBrandLogo,
  reddit: RedditBrandLogo,
};

const platformDisplayName = (row) =>
  row?.name ||
  KNOWN_PLATFORM_PRESETS.find((p) => p.slug === row?.platform)?.name ||
  row?.platform ||
  'Platform';

const emptyPlatformForm = () => ({
  name: '',
  slug: '',
  icon: 'Globe2',
  blugate_client_key: '',
  api_key: '',
  low_threshold: 100,
  medium_threshold: 500,
  high_threshold: 1000,
  time_window_minutes: 60,
  is_active: true,
});

const maskSecret = (set) => (set ? '•••• set' : '—');

const PlatformsTab = () => {
  const { user, fetchMe } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPlatformForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showBlugateKey, setShowBlugateKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await socialProfilesApi.listPlatforms({ all: 1 });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load platforms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user?.role, load]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyPlatformForm());
    setShowBlugateKey(false);
    setShowApiKey(false);
    setDialogOpen(true);
  };

  const openEdit = async (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      slug: row.slug || '',
      icon: row.icon || 'Globe2',
      blugate_client_key: '',
      api_key: '',
      low_threshold: row.low_threshold ?? 100,
      medium_threshold: row.medium_threshold ?? 500,
      high_threshold: row.high_threshold ?? 1000,
      time_window_minutes: row.time_window_minutes ?? 60,
      is_active: row.is_active !== false,
    });
    setShowBlugateKey(false);
    setShowApiKey(false);
    setDialogOpen(true);
    try {
      // List is masked; managers fetch one platform to fill decrypted keys
      const res = await socialProfilesApi.getPlatform(row.id);
      const full = res.data || {};
      setEditing((prev) => ({ ...(prev || row), ...full }));
      setForm((f) => ({
        ...f,
        blugate_client_key: full.blugate_client_key || '',
        api_key: full.api_key || '',
        name: full.name || f.name,
        icon: full.icon || f.icon,
        low_threshold: full.low_threshold ?? f.low_threshold,
        medium_threshold: full.medium_threshold ?? f.medium_threshold,
        high_threshold: full.high_threshold ?? f.high_threshold,
        time_window_minutes: full.time_window_minutes ?? f.time_window_minutes,
        is_active: full.is_active !== false,
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not load platform keys');
    }
  };

  const applyPreset = (slug) => {
    const preset = KNOWN_PLATFORM_PRESETS.find((p) => p.slug === slug);
    if (!preset) return;
    // Always sync name + slug + icon together when switching quick picks.
    setForm((f) => ({
      ...f,
      slug: preset.slug,
      name: preset.name,
      icon: preset.icon,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }
    if (!editing && !form.blugate_client_key.trim()) {
      toast.error('Blugate client key is required');
      return;
    }
    if (!editing && !form.api_key.trim()) {
      toast.error('API key is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        icon: form.icon,
        low_threshold: Number(form.low_threshold) || 0,
        medium_threshold: Number(form.medium_threshold) || 0,
        high_threshold: Number(form.high_threshold) || 0,
        time_window_minutes: Number(form.time_window_minutes) || 60,
        is_active: form.is_active,
      };
      if (form.blugate_client_key.trim()) {
        payload.blugate_client_key = form.blugate_client_key.trim();
      } else if (!editing) {
        payload.blugate_client_key = '';
      }
      if (form.api_key.trim()) {
        payload.api_key = form.api_key.trim();
      } else if (!editing) {
        payload.api_key = '';
      }
      if (editing) {
        await socialProfilesApi.updatePlatform(editing.id, payload);
        toast.success('Platform updated');
      } else {
        await socialProfilesApi.createPlatform(payload);
        toast.success('Platform added');
      }
      setDialogOpen(false);
      await load();
      _settingsCache = null;
      if (typeof fetchMe === 'function') await fetchMe({ bypassCache: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete platform "${row.name}"?`)) return;
    setDeletingId(row.id);
    try {
      await socialProfilesApi.deletePlatform(row.id);
      toast.success('Platform deleted');
      await load();
      _settingsCache = null;
      if (typeof fetchMe === 'function') await fetchMe({ bypassCache: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Platform management is available for Admin accounts with a tenant database.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Globe2 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-none">Manage platforms</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Credentials and viral alert thresholds live on each platform. Users inherit active platforms.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add platform
        </Button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No platforms yet. Add one to start monitoring — nothing is created by default.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{row.name}</p>
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {row.slug}
                    </Badge>
                    {!row.is_active && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Blugate key: {maskSecret(row.blugate_client_key_set)} · API key:{' '}
                    {maskSecret(row.api_key_set)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Viral: L {row.low_threshold ?? 100} / M {row.medium_threshold ?? 500} / H{' '}
                    {row.high_threshold ?? 1000} · window {row.time_window_minutes ?? 60}m
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600"
                    disabled={deletingId === row.id}
                    onClick={() => handleDelete(row)}
                  >
                    {deletingId === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit platform' : 'Add platform'}</DialogTitle>
            <DialogDescription>
              Blugate credentials and viral alert thresholds for this tenant.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3.5">
            {!editing && (
              <div className="space-y-1.5">
                <Label>Quick pick</Label>
                <div className="flex flex-wrap gap-1.5">
                  {KNOWN_PLATFORM_PRESETS.map((p) => (
                    <Button
                      key={p.slug}
                      type="button"
                      variant={form.slug === p.slug ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => applyPreset(p.slug)}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="plat_name">Platform name</Label>
              <Input
                id="plat_name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. X (Twitter)"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plat_slug">Slug</Label>
              <Input
                id="plat_slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. x"
                required
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plat_blugate">Blugate client key</Label>
              <div className="relative">
                <Input
                  id="plat_blugate"
                  type={showBlugateKey ? 'text' : 'password'}
                  value={form.blugate_client_key}
                  onChange={(e) => setForm((f) => ({ ...f, blugate_client_key: e.target.value }))}
                  placeholder={
                  editing?.blugate_client_key_needs_reset
                    ? 'Re-enter key (previous hash cannot be shown)'
                    : editing?.blugate_client_key_set && !form.blugate_client_key
                      ? 'Leave blank to keep current'
                      : 'Blugate client key'
                }
                  required={!editing}
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowBlugateKey((v) => !v)}
                  aria-label={showBlugateKey ? 'Hide Blugate client key' : 'Show Blugate client key'}
                >
                  {showBlugateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plat_apikey">API key</Label>
              <div className="relative">
                <Input
                  id="plat_apikey"
                  type={showApiKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder={
                  editing?.api_key_needs_reset
                    ? 'Re-enter key (previous hash cannot be shown)'
                    : editing?.api_key_set && !form.api_key
                      ? 'Leave blank to keep current'
                      : 'API key'
                }
                  required={!editing}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Viral alerts</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Engagement counts that fire a viral alert inside the time window.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="plat_viral_low" className="text-[11px] text-emerald-600">
                    Low
                  </Label>
                  <Input
                    id="plat_viral_low"
                    type="text"
                    inputMode="numeric"
                    className="h-8 text-xs tabular-nums"
                    value={form.low_threshold}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setForm((f) => ({ ...f, low_threshold: raw === '' ? 0 : parseInt(raw, 10) }));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plat_viral_med" className="text-[11px] text-amber-600">
                    Medium
                  </Label>
                  <Input
                    id="plat_viral_med"
                    type="text"
                    inputMode="numeric"
                    className="h-8 text-xs tabular-nums"
                    value={form.medium_threshold}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setForm((f) => ({
                        ...f,
                        medium_threshold: raw === '' ? 0 : parseInt(raw, 10),
                      }));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plat_viral_high" className="text-[11px] text-red-600">
                    High
                  </Label>
                  <Input
                    id="plat_viral_high"
                    type="text"
                    inputMode="numeric"
                    className="h-8 text-xs tabular-nums"
                    value={form.high_threshold}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setForm((f) => ({
                        ...f,
                        high_threshold: raw === '' ? 0 : parseInt(raw, 10),
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="plat_viral_window" className="text-[11px]">
                  Time window (hours)
                </Label>
                <Input
                  id="plat_viral_window"
                  type="text"
                  inputMode="numeric"
                  className="h-8 w-28 text-xs tabular-nums"
                  value={Math.round((Number(form.time_window_minutes) || 0) / 60)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    const hrs = raw === '' ? 0 : parseInt(raw, 10);
                    setForm((f) => ({ ...f, time_window_minutes: hrs * 60 }));
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="plat_active" className="text-sm">
                Active
              </Label>
              <Switch
                id="plat_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? 'Save' : 'Add platform'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ThemeTab = () => {
  const { user, updateUiMode, updateThemeColor } = useAuth();
  const [colorMode, setColorMode] = useState(user?.ui_mode === 'dark' ? 'dark' : 'light');
  const [themeColor, setThemeColor] = useState(user?.theme_color || DEFAULT_THEME_COLOR);
  const [savingMode, setSavingMode] = useState(false);
  const [savingColor, setSavingColor] = useState(false);

  useEffect(() => {
    setColorMode(user?.ui_mode === 'dark' ? 'dark' : 'light');
    setThemeColor(user?.theme_color || DEFAULT_THEME_COLOR);
  }, [user?.ui_mode, user?.theme_color]);

  const setMode = async (mode) => {
    if (mode === colorMode || savingMode) return;
    const prev = colorMode;
    setColorMode(mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    setSavingMode(true);
    try {
      await updateUiMode(mode);
    } catch (error) {
      setColorMode(prev);
      document.documentElement.classList.toggle('dark', prev === 'dark');
      toast.error(error.response?.data?.message || 'Failed to update color mode');
    } finally {
      setSavingMode(false);
    }
  };

  const setColor = async (colorVal) => {
    if (!colorVal || savingColor) return;
    const prev = themeColor;
    setThemeColor(colorVal);
    applyThemeColor(colorVal);
    setSavingColor(true);
    try {
      await updateThemeColor(colorVal);
    } catch (error) {
      setThemeColor(prev);
      applyThemeColor(prev);
      toast.error(error.response?.data?.message || 'Failed to update theme color');
    } finally {
      setSavingColor(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Palette className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-none">Theme &amp; Appearance</h3>
          <p className="text-[11px] text-muted-foreground mt-1">Customize color mode, prefixed best themes, and vibrant gradients</p>
        </div>
        {(savingMode || savingColor) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="p-5 space-y-6">
        
        {/* Color Mode Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold">Color Mode</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Switch between Light and Dark interface modes. Saves automatically.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border p-1 bg-muted/40 shadow-inner">
            <Button
              type="button"
              variant={colorMode === 'light' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs font-medium rounded-lg"
              disabled={savingMode}
              onClick={() => setMode('light')}
            >
              <Sun className="h-3.5 w-3.5 mr-1.5 text-amber-500" /> Light
            </Button>
            <Button
              type="button"
              variant={colorMode === 'dark' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs font-medium rounded-lg"
              disabled={savingMode}
              onClick={() => setMode('dark')}
            >
              <Moon className="h-3.5 w-3.5 mr-1.5 text-cyan-400" /> Dark
            </Button>
          </div>
        </div>

        <Separator />

        {/* Featured Prefixed Best Themes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">Featured Prefixed Best Themes</span>
              <p className="text-[10px] text-muted-foreground">Curated high-contrast themes &amp; signature gradients</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-400 ring-1 ring-cyan-500/30">
              <Star className="h-3 w-3 fill-cyan-400 text-cyan-400" /> PRESET SUITE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BEST_THEMES.map((theme) => {
              const isSelected = themeColor.trim().toLowerCase() === theme.value.trim().toLowerCase();
              return (
                <button
                  key={theme.name}
                  type="button"
                  disabled={savingColor}
                  onClick={() => setColor(theme.value)}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-xl border transition-all text-left group relative overflow-hidden",
                    isSelected
                      ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/30 shadow-md"
                      : "border-border bg-card hover:border-sky-500/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-xl shadow-md ring-2 ring-white/20 shrink-0 flex items-center justify-center text-white transition-transform group-hover:scale-105"
                      style={{ background: theme.bg }}
                    >
                      <Zap className="h-5 w-5 fill-white drop-shadow-sm" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-bold text-foreground truncate">{theme.name}</p>
                        <span className="text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 shrink-0">
                          {theme.tag}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{theme.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className={cn("h-4 w-4 rounded-full border border-sky-500 flex items-center justify-center transition-all", isSelected && "bg-sky-500")}>
                      {isSelected && <Check className="h-3 w-3 text-slate-950 stroke-[3]" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Gradient Themes Grid */}
        <div className="space-y-3">
          <div>
            <span className="text-xs font-semibold text-foreground">Gradient Themes</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Select a vibrant dual-tone gradient theme for cards, buttons, and highlights.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {GRADIENT_PRESETS.map((preset) => {
              const isSelected = themeColor === preset.value;
              return (
                <button
                  key={preset.name}
                  type="button"
                  disabled={savingColor}
                  onClick={() => setColor(preset.value)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="h-7 w-7 rounded-lg shadow-sm border border-white/20 shrink-0"
                      style={{ background: preset.value }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{preset.name}</p>
                    </div>
                  </div>
                  <div className={cn("h-4 w-4 rounded-full border border-primary/50 flex items-center justify-center shrink-0", isSelected && "bg-primary")}>
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Solid Color Presets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">Solid Color Presets</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Standard single-color primary accents</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Custom:</span>
              <input
                type="color"
                value={themeColor.startsWith('linear-gradient') ? DEFAULT_THEME_COLOR : themeColor}
                disabled={savingColor}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-12 p-0 border-0 rounded cursor-pointer disabled:opacity-50"
                title="Custom color picker"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {THEME_PRESETS.map((preset) => {
              const isSelected = themeColor.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.name}
                  disabled={savingColor}
                  onClick={() => setColor(preset.hex)}
                  className={cn(
                    "group relative h-9 w-9 rounded-xl border-2 transition-all hover:scale-105 disabled:opacity-50 flex items-center justify-center shadow-sm",
                    isSelected
                      ? "border-foreground ring-2 ring-offset-2 ring-primary"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && <Check className="h-4 w-4 text-white drop-shadow stroke-[3]" />}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
const PLACEHOLDERS_GUIDE = [
  { key: 'SERIAL_NUMBER', desc: 'Case ID / Serial (e.g. X-2026-001)' },
  { key: 'DATE', desc: 'Current date (dd.mm.yyyy)' },
  { key: 'DATE_LONG', desc: 'Full date (e.g. 1st January 2026)' },
  { key: 'PLATFORM', desc: 'Platform name (X, YouTube, etc.)' },
  { key: 'PLATFORM_OPERATOR', desc: 'Company name (X Corp., Meta)' },
  { key: 'PLATFORM_DOMAIN', desc: 'URL (www.x.com, www.youtube.com)' },
  { key: 'AUTHOR_NAME', desc: 'Target user display name' },
  { key: 'AUTHOR_HANDLE', desc: 'Target user handle (with @)' },
  { key: 'PROFILE_URL', desc: 'Link to target profile' },
  { key: 'CONTENT_URL', desc: 'Link to the flagged post' },
  { key: 'CONTENT_TEXT', desc: 'Text content of the violation' },
  { key: 'POST_DATE', desc: 'Original post date' },
  { key: 'LEGAL_SECTIONS', desc: 'Full Law/BNS sections' },
  { key: 'LEGAL_SECTIONS_NUMBERS', desc: 'Just section numbers (e.g. 152)' },
  { key: 'CATEGORY', desc: 'Violation category (e.g. Hate Speech)' },
  { key: 'RISK_LEVEL', desc: 'Threat level (HIGH, MEDIUM, LOW)' },
  { key: 'IS_REPOST', desc: 'Repost flag (Yes/No)' },
  { key: 'ALERT_DESCRIPTION', desc: 'Full alert description' },
  { key: 'DEPARTMENT_NAME', desc: 'Police Department name' },
  { key: 'GOVERNMENT_NAME', desc: 'Government name' },
];

const PlaceholderSidebar = ({ onClose }) => {
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = (key) => {
    navigator.clipboard.writeText('{{' + key + '}}');
    setCopiedKey(key);
    toast.success(`Copied {{${key}}}`, {
      description: "Paste into your document",
      duration: 1500,
    });
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="w-56 shrink-0 bg-secondary/5 border-l flex flex-col min-h-0 animate-in slide-in-from-right-2 duration-200">
      <div className="p-2.5 border-b bg-secondary/10 flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BrainCircuit className="h-3 w-3" /> Data Tags
        </h4>
        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-50 hover:opacity-100" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {PLACEHOLDERS_GUIDE.map(p => (
            <div
              key={p.key}
              onClick={() => handleCopy(p.key)}
              className="p-1.5 rounded-md bg-background border border-border/40 hover:border-primary/30 hover:bg-secondary/5 transition-all group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <code className="text-[9px] font-mono font-bold text-slate-700 dark:text-slate-300 tracking-tight bg-slate-100 dark:bg-slate-800 px-1 rounded">
                  {'{{' + p.key + '}}'}
                </code>
                <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors">
                  {copiedKey === p.key ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
              <p className="text-[8.5px] text-muted-foreground leading-tight">{p.desc}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t bg-secondary/5">
        <div className="flex items-start gap-1.5">
          <div className="h-1 w-1 rounded-full bg-primary mt-1 shrink-0" />
          <p className="text-[8.5px] leading-relaxed text-muted-foreground italic">
            <strong>Click to copy</strong>
          </p>
        </div>
      </div>
    </div>
  );
};

// Module-level settings cache — survives component remounts (back-navigation)
let _settingsCache = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60_000; // 1 minute
const VALID_TABS = ['general', 'templates', 'policies', 'theme', 'platforms', 'grievances'];

const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState([]);

  // Report Templates state
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templatePlatform, setTemplatePlatform] = useState('all');
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateDragging, setTemplateDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  // 2-step upload: parse first, edit, then save
  const [uploadStep, setUploadStep] = useState(1); // 1 = pick file, 2 = edit content
  const [parsedHtml, setParsedHtml] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [showPlaceholderGuide, setShowPlaceholderGuide] = useState(true);
  // Edit existing template
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingHtml, setEditingHtml] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const tabFromUrl = searchParams.get('tab');
  const initialTab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'general';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  // Mount-only URL seed: keep latest values in refs so deps stay empty without eslint-disable
  const searchParamsRef = useRef(searchParams);
  const initialTabRef = useRef(initialTab);
  searchParamsRef.current = searchParams;
  initialTabRef.current = initialTab;

  // Ensure URL always has ?tab= on mount (so back-navigation works)
  useEffect(() => {
    if (!searchParamsRef.current.get('tab')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', initialTabRef.current);
        return next;
      }, { replace: true });
    }
  }, [setSearchParams]);

  // View mode: 'tabs' or 'editor'
  const [viewMode, setViewMode] = useState('tabs');

  // ─── Unsaved changes tracking ───
  const [savedSettings, setSavedSettings] = useState(null);
  const [savedThresholds, setSavedThresholds] = useState([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingTabRef = useRef(null);

  const hasUnsavedChanges = useCallback(() => {
    if (!savedSettings || !settings) return false;
    return (
      JSON.stringify(settings) !== JSON.stringify(savedSettings) ||
      JSON.stringify(thresholds) !== JSON.stringify(savedThresholds)
    );
  }, [settings, savedSettings, thresholds, savedThresholds]);

  const handleTabChange = (newTab) => {
    if (hasUnsavedChanges()) {
      pendingTabRef.current = newTab;
      setShowUnsavedDialog(true);
    } else {
      // Only update the URL — the effect below will sync activeTab from it,
      // avoiding a race where setActiveTab and setSearchParams update at different ticks.
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', newTab);
        next.delete('platform');
        return next;
      }, { replace: true });
    }
  };

  // Single source of truth: activeTab always follows the URL (covers clicks + back/forward)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && !VALID_TABS.includes(tabFromUrl)) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'general');
        return next;
      }, { replace: true });
      return;
    }
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab, setSearchParams]);

  // Warn on browser/tab close
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);




  useEffect(() => {
    // Use cached data if fresh (instant back-navigation)
    if (_settingsCache && Date.now() - _settingsCacheTime < SETTINGS_CACHE_TTL) {
      const { settings: s, thresholds: t, templates: tp } = _settingsCache;
      setSettings(s);
      setSavedSettings(JSON.parse(JSON.stringify(s)));
      setThresholds(Array.isArray(t) ? t : []);
      setSavedThresholds(JSON.parse(JSON.stringify(Array.isArray(t) ? t : [])));
      setTemplates(tp);
      setLoading(false);
      setTemplatesLoading(false);
    } else {
      fetchAllSettingsData();
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (error) {
      console.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleUploadTemplate = async (e) => {
    e.preventDefault();
    if (!templateFile || !templateName.trim()) {
      toast.error('Please provide a template name and DOCX file');
      return;
    }
    // Step 1: Parse the DOCX first
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('template', templateFile);
      const res = await api.post('/templates/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setParsedHtml(res.data.html);
      setEditedHtml(res.data.html);
      setUploadStep(2);
      setTemplateDialogOpen(false);
      setViewMode('editor');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to parse document');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveWithEditor = async () => {
    try {
      setUploading(true);
      // Upload original file to create the template record
      const formData = new FormData();
      formData.append('template', templateFile);
      formData.append('name', templateName.trim());
      formData.append('platform', templatePlatform);
      formData.append('is_default', templateIsDefault);
      const res = await api.post('/templates/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Always save the edited HTML (user may have made edits or content was cleaned on load)
      await api.put(`/templates/${res.data.id}/content`, { html_content: editedHtml });
      toast.success('Template saved successfully');
      resetUploadDialog();
      setViewMode('tabs');
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadDialog = () => {
    setTemplateDialogOpen(false);
    setTemplateName('');
    setTemplatePlatform('all');
    setTemplateIsDefault(false);
    setTemplateFile(null);
    setUploadStep(1);
    setParsedHtml('');
    setEditedHtml('');
    setViewMode('tabs');
  };

  const handleEditTemplate = async (template) => {
    setEditingTemplate(template);
    setEditingHtml(template.html_content);
    setViewMode('editor');
  };

  const handleSaveEditedTemplate = async () => {
    try {
      setSavingEdit(true);
      await api.put(`/templates/${editingTemplate.id}/content`, { html_content: editingHtml });
      toast.success('Template updated');
      setEditingTemplate(null);
      setViewMode('tabs');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to save template');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await api.delete(`/templates/${id}`);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.put(`/templates/${id}/default`);
      toast.success('Default template updated');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to set default');
    }
  };

  const handlePreviewTemplate = async (id) => {
    try {
      const res = await api.post(`/templates/${id}/preview`);
      setPreviewHtml(res.data.html);
      setPreviewOpen(true);
    } catch (error) {
      toast.error('Preview failed');
    }
  };

  // Single API call to load all settings page data
  const fetchAllSettingsData = async () => {
    try {
      const res = await api.get('/settings/all');
      const { settings: s, thresholds: t, templates: tp } = res.data;
      const thresholdRows = Array.isArray(t) ? t : [];
      setSettings(s);
      setSavedSettings(JSON.parse(JSON.stringify(s)));
      setThresholds(thresholdRows);
      setSavedThresholds(JSON.parse(JSON.stringify(thresholdRows)));
      setTemplates(tp);
      _settingsCache = { settings: s, thresholds: thresholdRows, templates: tp };
      _settingsCacheTime = Date.now();
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
      setTemplatesLoading(false);
    }
  };

  const handleSaveThresholds = async () => {
    try {
      const res = await api.put('/alert-thresholds/bulk', { thresholds });
      const next = Array.isArray(res.data) ? res.data : thresholds;
      setThresholds(next);
      setSavedThresholds(JSON.parse(JSON.stringify(next)));
      toast.success('Viral alert thresholds saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save thresholds');
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await api.put('/settings', settings);
      setSavedSettings(JSON.parse(JSON.stringify(res.data)));
      setSettings(res.data);
      _settingsCache = null; // Invalidate cache on save
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (viewMode === 'editor') {
    const isEditing = !!editingTemplate;
    const title = isEditing ? `Edit Template — ${editingTemplate.name}` : `Upload Template — ${templateName}`;
    const handleSave = isEditing ? handleSaveEditedTemplate : handleSaveWithEditor;
    const currentHtml = isEditing ? editingHtml : editedHtml;
    const setCurrentHtml = isEditing ? setEditingHtml : setEditedHtml;
    const isSaving = isEditing ? savingEdit : uploading;

    return (
      <div className="flex flex-col h-[calc(100vh-120px)] bg-background border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 select-text">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-none">{title}</h2>
              <p className="text-xs text-gray-500 mt-1">Refine your legal document structure and placeholders.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => isEditing ? setViewMode('tabs') : resetUploadDialog()} className="h-9 px-4">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>

        {/* Editor Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main Editor Surface */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <RichTextEditor
              initialContent={currentHtml}
              onChange={setCurrentHtml}
              minHeight="100%"
              placeholder="Start drafting your template content..."
            />
          </div>

          {/* Integration Sidebar */}
          <PlaceholderSidebar />
        </div>
      </div>
    );
  }

  const riskHigh = settings?.risk_threshold_high ?? 70;
  const riskMed = settings?.risk_threshold_medium ?? 40;
  const riskLowMax = Math.max(0, riskMed - 1);
  const riskMedMax = Math.max(riskMed, riskHigh - 1);
  const lowPct = Math.min(100, Math.max(0, riskMed));
  const medPct = Math.min(100 - lowPct, Math.max(0, riskHigh - riskMed));
  const highPct = Math.max(0, 100 - lowPct - medPct);
  const viralEnabled = settings?.velocity_alerts_enabled ?? true;

  const patchThreshold = (platform, field, value) => {
    setThresholds((prev) =>
      prev.map((row) => (row.platform === platform ? { ...row, [field]: value } : row))
    );
  };

  const saveAlerts = async () => {
    setIsSaving(true);
    try {
      await handleSaveSettings();
      if (JSON.stringify(thresholds) !== JSON.stringify(savedThresholds)) {
        await handleSaveThresholds();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 w-full" data-testid="settings-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Settings</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Risk bands, viral toggle, platforms, templates, and theme
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {activeTab === 'general' && hasUnsavedChanges() && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Unsaved
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setSettings(JSON.parse(JSON.stringify(savedSettings)));
                  setThresholds(JSON.parse(JSON.stringify(savedThresholds)));
                }}
              >
                Discard
              </Button>
              <Button size="sm" className="h-8 text-xs" disabled={isSaving} onClick={saveAlerts}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-3">
        <TabsList className="flex h-9 w-full justify-start p-1 bg-muted/60 rounded-lg">
          {[
            { value: 'general', label: 'Alerts' },
            ...(user?.role === 'admin' ? [{ value: 'platforms', label: 'Platforms' }] : []),
            { value: 'templates', label: 'Report Templates' },
            { value: 'policies', label: 'Policy Manager' },
            { value: 'grievances', label: 'Grievances' },
            { value: 'theme', label: 'Theme' },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-xs px-4 py-1.5 rounded-md flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:font-semibold"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

      {/* Unsaved changes dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Unsaved Changes
            </DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              setSettings(JSON.parse(JSON.stringify(savedSettings)));
              setThresholds(JSON.parse(JSON.stringify(savedThresholds)));
              setShowUnsavedDialog(false);
              if (pendingTabRef.current) {
                const t = pendingTabRef.current;
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', t); next.delete('platform'); return next; }, { replace: true });
                pendingTabRef.current = null;
              }
            }}>Discard</Button>
            <Button onClick={async () => {
              await handleSaveSettings();
              if (JSON.stringify(thresholds) !== JSON.stringify(savedThresholds)) {
                await handleSaveThresholds();
              }
              setShowUnsavedDialog(false);
              if (pendingTabRef.current) {
                const t = pendingTabRef.current;
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', t); next.delete('platform'); return next; }, { replace: true });
                pendingTabRef.current = null;
              }
            }}>Save & Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* ═══ Alerts Tab ═══ */}
        <TabsContent value="general" className="space-y-3 mt-0 w-full focus-visible:outline-none">
          {/* Risk Levels */}
          <section className="rounded-xl border border-border bg-card overflow-hidden w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-none">Risk Levels</h2>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Score from 0–100 · set where Medium and High begin
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Low</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Medium</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> High</span>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${lowPct}%` }} />
                  <div className="bg-amber-500 transition-all duration-300" style={{ width: `${medPct}%` }} />
                  <div className="bg-red-500 transition-all duration-300" style={{ width: `${highPct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground px-0.5">
                  <span>0</span>
                  <span>{riskMed}</span>
                  <span>{riskHigh}</span>
                  <span>100</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-red-200/80 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400">High</span>
                    <span className="text-[10px] tabular-nums font-medium text-red-600">{riskHigh} – 100</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0">Starts at</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={riskHigh}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setSettings({ ...settings, risk_threshold_high: raw === '' ? 0 : parseInt(raw, 10) });
                      }}
                      className="h-8 w-20 text-xs text-center tabular-nums font-medium"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Medium</span>
                    <span className="text-[10px] tabular-nums font-medium text-amber-600">{riskMed} – {riskMedMax}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0">Starts at</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={riskMed}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setSettings({ ...settings, risk_threshold_medium: raw === '' ? 0 : parseInt(raw, 10) });
                      }}
                      className="h-8 w-20 text-xs text-center tabular-nums font-medium"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Low</span>
                    <span className="text-[10px] tabular-nums font-medium text-emerald-600">0 – {riskLowMax}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                    Auto — everything below Medium.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Viral Alerts — thresholds stored on platforms */}
          <section className="rounded-xl border border-border bg-card overflow-hidden w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-none">Viral Alerts</h2>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Engagement counts that fire a viral alert inside the time window
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-[11px] font-medium', viralEnabled ? 'text-foreground' : 'text-muted-foreground')}>
                  {viralEnabled ? 'On' : 'Off'}
                </span>
                <Switch
                  checked={viralEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, velocity_alerts_enabled: checked })}
                />
              </div>
            </div>

            {thresholds.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No platforms yet. Add platforms under the Platforms tab to set viral scores.
              </p>
            ) : (
              <div className={cn('overflow-x-auto', !viralEnabled && 'opacity-50 pointer-events-none')}>
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left font-medium px-4 py-2.5 text-muted-foreground w-[180px]">Platform</th>
                      <th className="text-center font-medium px-2 py-2.5 text-emerald-600 w-[120px]">Low</th>
                      <th className="text-center font-medium px-2 py-2.5 text-amber-600 w-[120px]">Medium</th>
                      <th className="text-center font-medium px-2 py-2.5 text-red-600 w-[120px]">High</th>
                      <th className="text-center font-medium px-2 py-2.5 text-muted-foreground w-[100px]">Window (hrs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thresholds.map((t) => {
                      const Icon = PLATFORM_ROW_ICONS[t.platform] || Globe2;
                      return (
                        <tr key={t.platform} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-md border bg-background flex items-center justify-center">
                                <Icon className="h-3.5 w-3.5 text-foreground" />
                              </div>
                              <span className="font-medium text-sm">{platformDisplayName(t)}</span>
                            </div>
                          </td>
                          {[
                            ['low_threshold', t.low_threshold],
                            ['medium_threshold', t.medium_threshold],
                            ['high_threshold', t.high_threshold],
                          ].map(([field, value]) => (
                            <td key={field} className="px-2 py-2.5 text-center">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={value ?? 0}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  patchThreshold(t.platform, field, raw === '' ? 0 : parseInt(raw, 10));
                                }}
                                className="h-8 w-full max-w-[7rem] mx-auto text-xs text-center tabular-nums"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-center">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={Math.round((t.time_window_minutes ?? 0) / 60)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const hrs = raw === '' ? 0 : parseInt(raw, 10);
                                patchThreshold(t.platform, 'time_window_minutes', hrs * 60);
                              }}
                              className="h-8 w-full max-w-[5rem] mx-auto text-xs text-center tabular-nums"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Alert Keywords Management */}
          <AlertKeywordsSection />
        </TabsContent>



        {/* Report Templates */}
        <TabsContent value="templates" className="space-y-4 mt-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-none">Report Templates</h3>
                    <p className="text-[11px] text-muted-foreground mt-1">Upload any DOCX — edit before saving. Alert data auto-fills when generating reports.</p>
                  </div>
                </div>

                {/* Upload Template Dialog */}
                <Dialog open={templateDialogOpen} onOpenChange={(open) => {
                  if (!open) resetUploadDialog();
                  else setTemplateDialogOpen(true);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 px-2 text-xs"><Upload className="h-3 w-3 mr-1" /> Upload Template</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                      <DialogTitle className="text-base">Upload DOCX Template</DialogTitle>
                      <DialogDescription className="text-[10px]">Select a DOCX file to use as a report base.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleUploadTemplate} className="space-y-4">
                      <div>
                        <Label className="text-xs">Template Name</Label>
                        <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. IT Cell Notice - X" className="h-8 text-xs mt-1" required />
                      </div>
                      <div>
                        <Label className="text-xs">Platform</Label>
                        <Select value={templatePlatform} onValueChange={setTemplatePlatform}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <PagePlatformSelectItems page={null} />
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">DOCX File</Label>
                        <div
                          className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${templateDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                          onClick={() => document.getElementById('template-file-input').click()}
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setTemplateDragging(true); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
                          onDragLeave={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (e.currentTarget.contains(e.relatedTarget)) return;
                            setTemplateDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            setTemplateDragging(false);
                            const file = e.dataTransfer?.files?.[0];
                            if (!file) return;
                            if (!/\.(docx?|DOCX?)$/.test(file.name)) {
                              toast.error('Only .doc or .docx files are supported');
                              return;
                            }
                            setTemplateFile(file);
                          }}
                        >
                          <input id="template-file-input" type="file" accept=".docx,.doc" className="hidden" onChange={(e) => setTemplateFile(e.target.files[0])} />
                          {templateFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <FileText className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-medium">{templateFile.name}</span>
                            </div>
                          ) : (
                            <div>
                              <Upload className={`h-6 w-6 mx-auto mb-1 ${templateDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                              <p className="text-xs text-muted-foreground">
                                {templateDragging ? 'Drop the file here' : 'Click to browse or drag a .docx file'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={templateIsDefault} onCheckedChange={setTemplateIsDefault} className="scale-75" />
                        <Label className="text-xs">Set as default for this platform</Label>
                      </div>
                      <Button type="submit" className="w-full h-8 text-xs" disabled={uploading}>
                        {uploading ? 'Parsing document...' : 'Next — Parse & Edit ▸'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Placeholder Reference */}
              <div className="border rounded-lg">
                <button onClick={() => setShowPlaceholders(!showPlaceholders)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-accent/50 transition-colors">
                  <span className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> Placeholders Reference</span>
                  {showPlaceholders ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showPlaceholders && (
                  <div className="px-3 pb-3 border-t">
                    <p className="text-[10px] text-muted-foreground mt-2 mb-2">For advanced control, add these placeholders in your DOCX</p>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { key: 'SERIAL_NUMBER', desc: 'Report serial number' },
                        { key: 'DATE', desc: 'Current date (dd.mm.yyyy)' },
                        { key: 'DATE_LONG', desc: 'Full date format' },
                        { key: 'PLATFORM', desc: 'Platform name' },
                        { key: 'PLATFORM_OPERATOR', desc: 'Platform company' },
                        { key: 'PLATFORM_DOMAIN', desc: 'Platform URL' },
                        { key: 'AUTHOR_NAME', desc: 'User display name' },
                        { key: 'AUTHOR_HANDLE', desc: 'User handle (@)' },
                        { key: 'PROFILE_URL', desc: 'Profile URL' },
                        { key: 'CONTENT_URL', desc: 'Flagged post URL' },
                        { key: 'CONTENT_TEXT', desc: 'Flagged content text' },
                        { key: 'POST_DATE', desc: 'Post publish date' },
                        { key: 'LEGAL_SECTIONS', desc: 'Full legal sections' },
                        { key: 'LEGAL_SECTIONS_NUMBERS', desc: 'Section numbers' },
                        { key: 'CATEGORY', desc: 'Alert category' },
                        { key: 'RISK_LEVEL', desc: 'Risk level' },
                        { key: 'IS_REPOST', desc: 'Repost flag (Yes/No)' },
                        { key: 'ORIGINAL_AUTHOR', desc: 'Original author' },
                        { key: 'INTENT', desc: 'Detected intent' },
                        { key: 'ALERT_DESCRIPTION', desc: 'Alert description' },
                      ].map(p => (
                        <div key={p.key} className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/30 text-[10px]">
                          <code className="font-mono font-bold text-primary">{'{{' + p.key + '}}'}</code>
                          <span className="text-muted-foreground truncate">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Template List */}
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">No templates uploaded yet</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Upload any DOCX to get started — no placeholders needed!</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-2">
                    {templates.map(t => (
                      <div key={t.id} className="group flex items-center justify-between p-3 rounded-lg border hover:border-primary/30 transition-colors bg-background">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold truncate">{t.name}</span>
                              {t.is_default && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600 shrink-0">
                                  <Star className="h-2 w-2 mr-0.5 fill-current" /> Default
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                {t.platform === 'all' ? 'All Platforms' : t.platform.charAt(0).toUpperCase() + t.platform.slice(1)}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {(t.placeholders?.length || 0) > 0 ? `${t.placeholders.length} placeholders` : 'Auto-fill mode'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{t.original_filename}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(t)} title="Edit Template">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(t)} title="View / Edit Template">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!t.is_default && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSetDefault(t.id)} title="Set as default">
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteTemplate(t.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="mt-0">
          <PolicyManager />
        </TabsContent>

        <TabsContent value="theme" className="space-y-4 mt-0">
          <ThemeTab />
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="platforms" className="space-y-4 mt-0">
            <PlatformsTab />
          </TabsContent>
        )}

        <TabsContent value="grievances" className="space-y-4 mt-0">
          <GrievancesTab />
        </TabsContent>

        {/* Template Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Template Preview</DialogTitle>
              <DialogDescription className="sr-only">Visual preview of how the report will look with sample data.</DialogDescription>
            </DialogHeader>
            <div className="border rounded-lg p-6 bg-white dark:bg-slate-900 text-black dark:text-white prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
          </DialogContent>
        </Dialog>

        {/* Edit Existing Template Dialog replaced by Full-Page Editor */}
      </Tabs>
    </div>
  );
};

export default Settings;
