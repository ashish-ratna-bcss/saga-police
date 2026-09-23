/**
 * BluGate Usage & Billing — full client-account snapshot: account status, every
 * platform's health, and live billing/quota consumption. Hits GET /api/blugate/billing,
 * backed by services/blugate/global (same module System Health's compact panel uses).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, RefreshCw, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

/** Normalizes an unknown-shaped BluGate response section into a flat list of {name, ...fields}. */
const normalizeEntries = (data) => {
  if (!data) return [];
  const source = Array.isArray(data) ? data : data.platforms || data.items || data.data || data;
  if (Array.isArray(source)) {
    return source.map((entry, idx) => {
      if (entry && typeof entry === 'object') {
        const name = entry.platform || entry.name || entry.id || `Item ${idx + 1}`;
        const { platform, name: _n, id, ...rest } = entry;
        return { name, ...rest };
      }
      return { name: `Item ${idx + 1}`, value: entry };
    });
  }
  if (source && typeof source === 'object') {
    return Object.entries(source)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key, value]) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? { name: key, ...value }
          : { name: key, value }
      );
  }
  return [];
};

/** Top-level scalar fields on a response (excluding the nested platforms/list section) — for an account-status card. */
const scalarFields = (data) => {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).filter(
    ([key, value]) => key !== 'platforms' && key !== 'items' && key !== 'data' && (value == null || typeof value !== 'object')
  );
};

const STATUS_ICONS = {
  ok: { Icon: CheckCircle2, className: 'text-emerald-600' },
  online: { Icon: CheckCircle2, className: 'text-emerald-600' },
  active: { Icon: CheckCircle2, className: 'text-emerald-600' },
  healthy: { Icon: CheckCircle2, className: 'text-emerald-600' },
  degraded: { Icon: AlertTriangle, className: 'text-amber-600' },
  warning: { Icon: AlertTriangle, className: 'text-amber-600' },
};

const StatusIcon = ({ status }) => {
  const key = String(status || '').toLowerCase();
  const match = STATUS_ICONS[key] || { Icon: XCircle, className: 'text-red-600' };
  const { Icon, className } = match;
  return <Icon className={cn('h-4 w-4 shrink-0', className)} />;
};

const usageBar = (consumed, limit) => {
  const c = Number(consumed);
  const l = Number(limit);
  if (!Number.isFinite(c) || !Number.isFinite(l) || l <= 0) return null;
  const pct = Math.min(100, Math.round((c / l) * 100));
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {c.toLocaleString()} / {l.toLocaleString()} ({pct}%)
      </p>
    </div>
  );
};

const CONSUMED_KEYS = ['consumed', 'used', 'calls', 'requests', 'consumed_requests'];
const LIMIT_KEYS = ['limit', 'quota', 'max', 'cap'];
const REMAINING_KEYS = ['remaining', 'left', 'available'];

const BillingEntryCard = ({ name, ...fields }) => {
  const status = fields.status || fields.state;
  const consumedKey = CONSUMED_KEYS.find((k) => fields[k] != null);
  const limitKey = LIMIT_KEYS.find((k) => fields[k] != null);
  const remainingKey = REMAINING_KEYS.find((k) => fields[k] != null);
  const shown = new Set([consumedKey, limitKey, remainingKey, 'status', 'state'].filter(Boolean));
  const rest = Object.entries(fields).filter(([k]) => !shown.has(k));

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize">{name}</h3>
        {status ? <StatusIcon status={status} /> : null}
      </div>
      {consumedKey && limitKey ? usageBar(fields[consumedKey], fields[limitKey]) : null}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {remainingKey ? (
          <span>
            <span className="font-medium text-foreground">{String(fields[remainingKey])}</span> remaining
          </span>
        ) : null}
        {rest.map(([k, v]) => (
          <span key={k}>
            <span className="text-muted-foreground/80">{k}:</span>{' '}
            <span className="font-medium text-foreground">
              {v && typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

const BlugateBilling = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const load = useCallback(async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      else setLoading(true);
      const res = await api.get('/blugate/billing');
      setData(res.data);
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load BluGate billing data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const health = data?.health;
  const billing = data?.billing;
  const accountFields = scalarFields(health);
  const platformHealth = normalizeEntries(health);
  const billingEntries = normalizeEntries(billing);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-bold leading-none tracking-tight">
            <CreditCard className="h-4 w-4 text-primary" />
            BluGate Usage & Billing
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Client account status, per-platform health, and live quota consumption
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastChecked ? (
            <span className="text-[11px] text-muted-foreground">
              Updated {lastChecked.toLocaleTimeString()}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => load(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading BluGate account data…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <h2 className="text-sm font-semibold text-red-900">Connection error</h2>
            <p className="max-w-sm text-xs text-red-700">{error}</p>
            <Button size="sm" className="mt-2 h-8 text-xs" onClick={() => load(true)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : data?.configured === false ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground/40" />
            <h2 className="text-sm font-semibold">BluGate not configured</h2>
            <p className="max-w-sm text-xs text-muted-foreground">{data.message}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {data?.health_error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Health check failed: {data.health_error}
              </div>
            ) : null}
            {data?.billing_error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Billing check failed: {data.billing_error}
              </div>
            ) : null}

            {/* Account status */}
            {accountFields.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Client Account Status
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {accountFields.map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-border/70 bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{key}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Platform health */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Platform Health ({platformHealth.length})
              </h2>
              {platformHealth.length === 0 ? (
                <p className="text-xs text-muted-foreground">No per-platform health data returned.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {platformHealth.map((entry, idx) => (
                    <BillingEntryCard key={`health-${entry.name}-${idx}`} {...entry} />
                  ))}
                </div>
              )}
            </section>

            {/* Billing / quotas */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Billing & Rate Limits ({billingEntries.length})
              </h2>
              {billingEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No billing data returned.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {billingEntries.map((entry, idx) => (
                    <BillingEntryCard key={`billing-${entry.name}-${idx}`} {...entry} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlugateBilling;
