import React, { useState, useEffect, useCallback } from 'react';
import { Globe2, Plug, RefreshCw, Loader2, Eye, EyeOff, Plus, Pencil, Trash2, Link2, CheckCircle, Power, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { cn } from '../../lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';

const errText = (error, fallback) => error.response?.data?.error || error.response?.data?.message || fallback;

const CardShell = ({ icon: Icon, title, subtitle, action, children }) => (
  <div className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const SecretInput = ({ id, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete="new-password" className="pr-10" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide key' : 'Show key'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

/* ───────── BluGate: enter the keys once, everything else comes from BluGate ───────── */

const formatWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
};
const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
const latency = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const dayMonth = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const CHANGE_LABEL = {
  new: { text: 'New', cls: 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10' },
  access_granted: { text: 'Access granted', cls: 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10' },
  access_lost: { text: 'Access lost', cls: 'border-red-500/40 text-red-600 bg-red-500/10' },
  removed: { text: 'Removed', cls: 'border-red-500/40 text-red-600 bg-red-500/10' },
};

const GOOD = new Set(['operational', 'connected', 'healthy', 'active', 'ok', 'normal']);
const toneOf = (v) => {
  const k = String(v || '').toLowerCase();
  if (GOOD.has(k)) return 'good';
  if (['degraded', 'warning', 'development'].includes(k)) return 'warn';
  return 'bad';
};
const TONE_TEXT = { good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-600' };
const TONE_DOT = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' };

const StatusPill = ({ label, value }) => {
  const tone = toneOf(value);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px]">
      <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold capitalize', TONE_TEXT[tone])}>{value || '—'}</span>
    </span>
  );
};

const Kpi = ({ label, value, sub, tone }) => (
  <div className="rounded-lg border border-border bg-background px-3 py-2.5 min-w-0">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={cn('mt-0.5 text-xl font-heading font-bold tabular-nums leading-tight', tone && TONE_TEXT[tone])}>{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
  </div>
);

const ChangeSummary = ({ changes }) => {
  const groups = [
    ['added', 'New', 'text-emerald-600'],
    ['access_granted', 'Access granted', 'text-emerald-600'],
    ['access_lost', 'Access lost', 'text-red-600'],
    ['removed', 'Removed from BluGate', 'text-red-600'],
  ].filter(([k]) => changes?.[k]?.length);
  if (!groups.length) return <p className="text-xs text-muted-foreground">Fetched. Nothing changed since the last fetch.</p>;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
      {groups.map(([k, label, tone]) => (
        <p key={k} className="text-xs">
          <span className={cn('font-semibold', tone)}>{label}:</span>{' '}
          <span className="font-medium">{changes[k].join(', ')}</span>
        </p>
      ))}
    </div>
  );
};

export const BlugateConnectCard = ({ onChanged }) => {
  const [info, setInfo] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/integrations/blugate');
      setInfo(res.data);
    } catch (error) {
      toast.error(errText(error, 'Could not load BluGate status'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const configured = info?.configured;
  const typed = Boolean(apiKey.trim() || clientKey.trim());

  const fetchPlatforms = async (e) => {
    e?.preventDefault();
    if (typed && (!apiKey.trim() || !clientKey.trim())) return toast.error('Enter both keys');
    if (!typed && !configured) return toast.error('Enter your client key and API key first');
    setBusy(true);
    try {
      const res = await api.post('/integrations/blugate/fetch', typed
        ? { api_key: apiKey.trim(), blugate_client_key: clientKey.trim() }
        : {});
      setChanges(res.data.changes);
      setApiKey('');
      setClientKey('');
      toast.success('Fetched from BluGate');
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(errText(error, 'Could not fetch from BluGate'));
    } finally {
      setBusy(false);
    }
  };

  const { client, system, billing } = info || {};
  const o = billing?.overall;
  const successTone = o?.success_rate == null ? undefined : o.success_rate >= 95 ? 'good' : o.success_rate >= 80 ? 'warn' : 'bad';
  const period = billing?.period;
  const lastFetched = formatWhen(info?.last_fetched_at);

  return (
    <CardShell
      icon={Plug}
      title="BluGate"
      subtitle={lastFetched ? `Your BluGate account, usage and platform access. Last fetched ${lastFetched}.` : 'Enter your keys, then fetch your account, usage and platforms.'}
      action={configured && (
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={fetchPlatforms} disabled={busy || typed}
          title={typed ? 'Use the button next to the keys' : 'Fetch again with the saved keys'}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Fetch again
        </Button>
      )}
    >
      <form onSubmit={fetchPlatforms} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="bg_client">BluGate client key</Label>
          <SecretInput id="bg_client" value={clientKey} onChange={(e) => setClientKey(e.target.value)}
            placeholder={configured ? 'Saved. Type only to replace it' : 'Client code, e.g. SOC-EYE-001'} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bg_api">API key</Label>
          <SecretInput id="bg_api" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? 'Saved. Type only to replace it' : 'BluGate API key'} />
        </div>
        <Button type="submit" className="h-9 gap-1.5 text-xs" disabled={busy || (!typed && !configured)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {typed ? (configured ? 'Replace keys and fetch' : 'Fetch') : 'Fetch'}
        </Button>
      </form>

      {client && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-heading font-bold tracking-tight">{client.name}</h4>
                {client.environment && (
                  <Badge variant="outline" className="h-5 text-[10px] uppercase">{client.environment}</Badge>
                )}
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', TONE_TEXT[toneOf(client.status)])}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[toneOf(client.status)])} />{client.status}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {[client.code, client.id, client.email].filter(Boolean).join(' · ')}
              </p>
              {client.application && client.application !== client.name && (
                <p className="text-[11px] text-muted-foreground">Application: {client.application}</p>
              )}
            </div>
            {system && (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill label="System" value={system.status} />
                <StatusPill label="Gateway" value={system.gateway} />
                <StatusPill label="Database" value={system.database} />
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                  BluGate {system.version}{system.environment ? ` · ${system.environment}` : ''}
                </span>
              </div>
            )}
          </div>

          {o && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Usage · {period?.month}{period?.start ? ` (${dayMonth(period.start)} to ${dayMonth(period.end)})` : ''}
                </p>
                {billing.active_api_keys != null && (
                  <p className="text-[11px] text-muted-foreground">{billing.active_api_keys} active API key{billing.active_api_keys === 1 ? '' : 's'}</p>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
                <Kpi label="This month" value={num(o.month)} sub="requests" />
                <Kpi label="Today" value={num(o.today)} sub="requests" />
                <Kpi label="All time" value={num(o.total)} sub="requests" />
                <Kpi label="Success rate" value={o.success_rate != null ? `${o.success_rate}%` : '—'} tone={successTone}
                  sub={successTone === 'good' ? 'Healthy' : successTone === 'warn' ? 'Some failures' : successTone === 'bad' ? 'Many failures' : undefined} />
                <Kpi label="Avg latency" value={latency(o.avg_latency_ms)} sub="per request" />
                <Kpi label="Platforms you can use" value={client.accessible_count != null ? `${client.accessible_count} / ${client.total_count}` : '—'} sub="granted by BluGate" />
              </div>
            </div>
          )}
        </div>
      )}

      {changes && (
        <div className="mt-4 rounded-lg border border-border px-3 py-2.5 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">What changed</p>
          <ChangeSummary changes={changes} />
        </div>
      )}
    </CardShell>
  );
};

/* ───────── One card per BluGate platform ───────── */

const ALIAS = { twitter: 'x', x: 'twitter' };
const rowFor = (rows, slug) => rows.find((r) => r.slug === slug) || (ALIAS[slug] ? rows.find((r) => r.slug === ALIAS[slug]) : null) || null;

const CopyUrl = ({ value }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { toast.error('Could not copy'); }
  };
  return (
    <div className="flex items-center gap-1.5 min-w-0 rounded-md bg-muted/40 px-2 py-1">
      <span className="truncate font-mono text-[10px] text-muted-foreground" title={value}>{value}</span>
      <button type="button" onClick={copy} aria-label="Copy URL" className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
        {done ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
};

const PlatformCard = ({ item, togglingId, onToggle }) => {
  const { slug, name, m, row } = item;
  const granted = m?.status === 'available';
  const removed = m?.status === 'removed';
  const change = CHANGE_LABEL[m?.change];
  const blocked = Boolean(m) && !granted;
  const healthTone = toneOf(m?.health);

  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-background', blocked && 'bg-muted/30')}>
      <div className="flex items-start gap-3 p-3.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card', blocked && 'opacity-60')}>
          <PlatformBrandIcon platform={slug} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-semibold leading-none">{name}</h4>
            {change && <Badge variant="outline" className={cn('h-4 px-1.5 text-[9px]', change.cls)}>{change.text}</Badge>}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground truncate">
            {[slug, m?.version, m?.blugate_id].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {m && (
            <span className={cn('text-[11px] font-semibold', removed ? 'text-red-600' : granted ? 'text-emerald-600' : 'text-muted-foreground')}>
              {removed ? 'Removed' : granted ? 'Access granted' : 'No access'}
            </span>
          )}
          {m?.health && (
            <span className="inline-flex items-center gap-1.5 text-[10px] capitalize text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[healthTone])} />{m.health}
            </span>
          )}
        </div>
      </div>

      {(m?.base_url || (Boolean(m) && !granted)) && (
        <div className="border-t border-border px-3.5 py-3 space-y-3 flex-1">
          {blocked && (
            <p className="text-[11px] text-muted-foreground">
              BluGate has not granted your account access to this platform.
            </p>
          )}
          {m?.base_url && <CopyUrl value={m.base_url} />}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 mt-auto">
        <div className="min-w-0">
          {!row ? (
            <span className="text-[11px] text-muted-foreground">{granted ? 'Not supported in this app yet' : 'Not added'}</span>
          ) : (
            <Badge variant={row.is_active ? 'outline' : 'secondary'}
              className={cn('h-5 text-[10px]', row.is_active && 'border-emerald-500/40 text-emerald-600')}>
              {row.is_active ? 'Active in this app' : 'Stopped'}
            </Badge>
          )}
          {m?.endpoint_count != null && <span className="ml-2 text-[10px] text-muted-foreground">{num(m.endpoint_count)} endpoints</span>}
        </div>
        {row && (
          <Button type="button" variant="outline" size="sm"
            className={cn('ml-auto h-7 gap-1.5 text-[11px]', row.is_active ? 'text-amber-600' : 'text-emerald-600')}
            disabled={togglingId === row.id || (!row.is_active && blocked)}
            title={!row.is_active && blocked ? 'BluGate has not granted access to this platform' : undefined}
            onClick={() => onToggle(row)}>
            {togglingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
            {row.is_active ? 'Stop' : 'Activate'}
          </Button>
        )}
      </div>
    </div>
  );
};

export const BlugatePlatformsTable = ({ rows, info, loading, togglingId, onToggle }) => {
  const meta = info?.meta || [];

  const items = [];
  const used = new Set();
  for (const m of meta) {
    const row = rowFor(rows, m.app_slug || m.slug);
    if (row) used.add(row.id);
    items.push({ key: m.slug, slug: m.slug, name: m.name || row?.name || m.slug, m, row });
  }
  for (const row of rows) {
    if (!used.has(row.id)) items.push({ key: `row-${row.id}`, slug: row.slug, name: row.name, m: null, row });
  }
  const rank = (i) => (i.m?.status === 'available' ? 0 : i.m ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
  const active = items.filter((i) => i.row?.is_active).length;

  return (
    <CardShell
      icon={Globe2}
      title="Platforms"
      subtitle={`${items.length} from BluGate, ${active} active in this app. Stop a platform to hide it from Events, Alerts and the dashboard.`}
    >
      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No platforms yet. Enter your BluGate keys above and fetch.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => (
            <PlatformCard key={item.key} item={item} togglingId={togglingId} onToggle={onToggle} />
          ))}
        </div>
      )}
    </CardShell>
  );
};

/* ───────── Custom third-party endpoints ───────── */

const emptyForm = () => ({ name: '', base_url: '', api_key: '', auth_header: 'Authorization', auth_scheme: 'Bearer', notes: '', is_active: true });

export const CustomEndpointsCard = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/integrations/custom');
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(errText(error, 'Could not load endpoints'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ name: row.name, base_url: row.base_url, api_key: '', auth_header: row.auth_header, auth_scheme: row.auth_scheme, notes: row.notes || '', is_active: row.is_active });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.base_url.trim()) return toast.error('Name and API URL are required');
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), base_url: form.base_url.trim() };
      if (editing && !payload.api_key.trim()) delete payload.api_key;
      if (editing) await api.put(`/integrations/custom/${editing.id}`, payload);
      else await api.post('/integrations/custom', payload);
      toast.success(editing ? 'Endpoint updated' : 'Endpoint added');
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(errText(error, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/integrations/custom/${row.id}`);
      toast.success('Endpoint deleted');
      await load();
    } catch (error) {
      toast.error(errText(error, 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const toggle = async (row, next) => {
    try {
      await api.put(`/integrations/custom/${row.id}`, { is_active: next });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)));
    } catch (error) {
      toast.error(errText(error, 'Could not update'));
    }
  };

  return (
    <CardShell
      icon={Link2}
      title="Custom endpoints"
      subtitle="Add any other API by URL. The key is optional."
      action={(
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add endpoint
        </Button>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No custom endpoints yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{row.name}</p>
                  <Badge variant="outline" className="h-5 text-[10px]">{row.has_key ? 'Key set' : 'No key'}</Badge>
                  {!row.is_active && <Badge variant="secondary" className="h-5 text-[10px]">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground break-all">{row.base_url}</p>
                {row.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.notes}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={row.is_active} onCheckedChange={(v) => toggle(row, v)} aria-label={`Toggle ${row.name}`} />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" disabled={deletingId === row.id} onClick={() => remove(row)}>
                  {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit endpoint' : 'Add endpoint'}</DialogTitle>
            <DialogDescription>Save an API this workspace can use. Only the URL is needed. Add a key if the API requires one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="ce_name">Name</Label>
              <Input id="ce_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. News API" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce_url">API URL</Label>
              <Input id="ce_url" value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="https://api.example.com/v1" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce_key">API key <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <SecretInput id="ce_key" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={editing?.has_key ? 'Leave blank to keep current' : 'Leave empty if no key is needed'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ce_header">Key header</Label>
                <Input id="ce_header" value={form.auth_header} onChange={(e) => setForm((f) => ({ ...f, auth_header: e.target.value }))} placeholder="Authorization" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce_scheme">Key prefix</Label>
                <Input id="ce_scheme" value={form.auth_scheme} onChange={(e) => setForm((f) => ({ ...f, auth_scheme: e.target.value }))} placeholder="Bearer (blank for none)" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce_notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="ce_notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="What this API is used for" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? 'Save changes' : 'Add endpoint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CardShell>
  );
};
