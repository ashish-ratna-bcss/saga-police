/**
 * Social Profiles "Add profile" dialog — reusable from Global Search Monitor, etc.
 * Create-only (same UX as Social Profiles Add profile).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { socialProfilesApi } from '../api/socialProfiles.api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const POLL_PRESETS = [
  { value: '5', label: 'Every 5 minutes', minutes: 5 },
  { value: '15', label: 'Every 15 minutes', minutes: 15 },
  { value: '30', label: 'Every 30 minutes', minutes: 30 },
  { value: '60', label: 'Every 1 hour', minutes: 60 },
  { value: '360', label: 'Every 6 hours', minutes: 360 },
  { value: 'custom', label: 'Custom', minutes: null },
];

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

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {{ platform?: string, display_name?: string, notes?: string, data?: object } | null} props.prefill
 * @param {() => void} [props.onSuccess]
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {'profile'|'grievance'} [props.accountType] — persisted on social_media_accounts.type
 */
const AddSocialProfileDialog = ({
  open,
  onOpenChange,
  prefill = null,
  onSuccess,
  title = 'Add profile',
  description = 'Fetch every platform, then Save. Same form as Social Profiles.',
  accountType = 'profile',
}) => {
  const [platforms, setPlatforms] = useState([]);
  const [loadingPlatforms, setLoadingPlatforms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    display_name: '',
    poll_interval_minutes: 30,
    poll_preset: '30',
    notes: '',
    accounts: [],
  });

  const allAccountsFetched = useMemo(
    () =>
      form.accounts.length > 0 &&
      form.accounts.every((a) => a.preview_data?.fetched_at),
    [form.accounts]
  );

  const resetFromPrefill = useCallback(
    (list, seed) => {
      const slug = String(seed?.platform || list[0]?.slug || '').toLowerCase();
      const plat = list.find((p) => p.slug === slug) || list[0];
      const slot = blankAccountSlot(plat?.slug || '', list);
      const incoming = seed?.data && typeof seed.data === 'object' ? seed.data : {};
      slot.data = { ...slot.data, ...incoming };
      setForm({
        display_name: String(seed?.display_name || '').trim(),
        poll_interval_minutes: 30,
        poll_preset: '30',
        notes: String(seed?.notes || '').trim(),
        accounts: [slot],
      });
    },
    []
  );

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoadingPlatforms(true);
    socialProfilesApi
      .listPlatforms()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setPlatforms(list);
        resetFromPrefill(list, prefill);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load platforms');
      })
      .finally(() => {
        if (!cancelled) setLoadingPlatforms(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, prefill, resetFromPrefill]);

  const updateAccount = (key, patch) => {
    setForm((f) => ({
      ...f,
      accounts: f.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    }));
  };

  const setAccountPlatform = (key, slug) => {
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
    const used = new Set(form.accounts.map((a) => a.platform));
    const next = platforms.find((p) => !used.has(p.slug)) || platforms[0];
    setForm((f) => ({
      ...f,
      accounts: [...f.accounts, blankAccountSlot(next?.slug || '', platforms)],
    }));
  };

  const removeAccountSlot = (key) => {
    setForm((f) => ({
      ...f,
      accounts: f.accounts.length <= 1 ? f.accounts : f.accounts.filter((a) => a.key !== key),
    }));
  };

  const fetchAccountPreview = async (key) => {
    const account = form.accounts.find((a) => a.key === key);
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
      setForm((f) => ({
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
    if (!form.accounts.length) {
      toast.error('Add at least one platform');
      return;
    }
    if (!allAccountsFetched) {
      toast.error('Fetch details for every platform before saving');
      return;
    }
    const minutes = Number(form.poll_interval_minutes);
    if (!Number.isInteger(minutes) || minutes < 1) {
      toast.error('Poll interval must be at least 1 minute');
      return;
    }
    setSaving(true);
    try {
      await socialProfilesApi.createBatch({
        display_name: form.display_name,
        poll_interval_minutes: minutes,
        notes: form.notes,
        type: accountType || 'profile',
        accounts: form.accounts.map((a) => ({
          platform: a.platform,
          data: a.data,
          preview_data: a.preview_data,
        })),
      });
      toast.success(
        form.accounts.length > 1
          ? `Added ${form.accounts.length} platform accounts`
          : accountType === 'grievance'
            ? 'Grievance profile added'
            : 'Profile added'
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-3.5 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        {loadingPlatforms ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…
          </div>
        ) : (
          <form onSubmit={saveProfile} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    className="h-9"
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="e.g. TV9 Telugu"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Poll</Label>
                  <Select
                    value={form.poll_preset}
                    onValueChange={(v) => {
                      const preset = POLL_PRESETS.find((p) => p.value === v);
                      setForm((f) => ({
                        ...f,
                        poll_preset: v,
                        poll_interval_minutes:
                          v === 'custom'
                            ? Number.isInteger(Number(f.poll_interval_minutes)) &&
                              !POLL_PRESETS.some((p) => p.minutes === Number(f.poll_interval_minutes))
                              ? f.poll_interval_minutes
                              : 45
                            : preset.minutes,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLL_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.poll_preset === 'custom' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={10080}
                    className="h-9 w-28"
                    value={form.poll_interval_minutes}
                    onChange={(e) =>
                      setForm((f) => ({
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
                      ({form.accounts.length})
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
                  {form.accounts.map((account) => {
                    const plat = platforms.find((p) => p.slug === account.platform);
                    const fields = (Array.isArray(plat?.fields) ? plat.fields : []).filter(
                      (f) => !HIDDEN_FIELD_KEYS.has(f.key)
                    );
                    const fetched = Boolean(account.preview_data?.fetched_at);
                    const primaryField = fields[0];
                    return (
                      <div
                        key={account.key}
                        className={`rounded-lg border p-3 ${
                          fetched ? 'border-emerald-500/25 bg-emerald-500/[0.03]' : 'bg-card'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Select
                            value={account.platform}
                            onValueChange={(v) => setAccountPlatform(account.key, v)}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Platform" />
                            </SelectTrigger>
                            <SelectContent>
                              {platforms.map((p) => (
                                <SelectItem key={p.slug} value={p.slug}>
                                  {p.name}
                                </SelectItem>
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
                          {form.accounts.length > 1 ? (
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
                              <p className="truncate text-sm font-medium">
                                {account.preview.name || 'Unknown'}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {account.preview.followers != null
                                  ? `${Number(account.preview.followers).toLocaleString()} followers`
                                  : account.preview.members != null
                                    ? `${Number(account.preview.members).toLocaleString()} members`
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
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 min-w-[96px]"
                disabled={saving || !allAccountsFetched}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddSocialProfileDialog;
