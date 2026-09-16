import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Database, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuth } from '../../context/auth.context';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import HeroKpis from '../../components/dashboard/HeroKpis';
import RecommendationList from '../../components/dashboard/RecommendationList';
import TopProfilesCard from '../../components/dashboard/TopProfilesCard';
import TopPostsCard from '../../components/dashboard/TopPostsCard';
import ModulePulseCharts from '../../components/dashboard/ModulePulseCharts';
import PeriscopeTicker from '../../components/dashboard/PeriscopeTicker';


const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

const emptyOverview = () => ({
  kpis: {},
  recommendations: [],
  top_profiles: [],
  top_posts: [],
  alerts: { total: 0, by_risk: {}, by_platform: {}, by_status: {} },
  grievances: { total: 0, by_workflow: {}, by_platform: {}, reports: {} },
  events: { total: 0, started: 0, items: [] },
  platforms: [],
});

/** Don't toast when logout/session clear cancels dashboard fetches. */
const isIgnorableAuthError = (error) => {
  const status = error?.response?.status;
  return status === 401 || status === 403 || error?.code === 'ERR_CANCELED';
};

const SuperadminDashboard = ({ data, loading, refreshing, onRefresh }) => {
  const admins = data?.admins || [];
  return (
    <div className="w-full space-y-5 pb-8 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl">
            Superadmin console
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage admins, page access, and quotas — not operational alerts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/users-management">
              <UserPlus className="h-4 w-4" />
              Admins
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Admins</p>
          <p className="mt-1 text-2xl font-semibold">{data?.admins_total ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total tenant users</p>
          <p className="mt-1 text-2xl font-semibold">
            {admins.reduce((s, a) => s + (a.users_count || 0), 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total profiles</p>
          <p className="mt-1 text-2xl font-semibold">
            {admins.reduce((s, a) => s + (a.profiles_count || 0), 0)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">Admins &amp; quotas</div>
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No admins yet. Create one under Users.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Admin</th>
                <th className="px-4 py-2.5">Tenant DB</th>
                <th className="px-4 py-2.5">Users</th>
                <th className="px-4 py-2.5">Profiles</th>
                <th className="px-4 py-2.5 text-right">Pages</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.full_name || a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.username}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Database className="h-3.5 w-3.5" />
                      {a.db_name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {a.users_count ?? 0}
                    <span className="text-muted-foreground">
                      /{a.max_users == null ? '∞' : a.max_users}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {a.profiles_count ?? 0}
                    <span className="text-muted-foreground">
                      /{a.max_profiles == null ? '∞' : a.max_profiles}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {(a.allowed_pages || []).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const OpsDashboard = () => {
  const [range, setRange] = useState('7d');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState(emptyOverview);

  const platformOptions = useMemo(() => {
    const seen = new Set();
    const configured = [];
    for (const row of overview.platforms || []) {
      const id = String(row?.slug || '')
        .trim()
        .toLowerCase()
        .replace(/^twitter$/, 'x');
      if (!id || id === 'unknown' || seen.has(id)) continue;
      seen.add(id);
      configured.push({ id, label: row.name || id });
    }
    return [{ id: 'all', label: 'All' }, ...configured];
  }, [overview.platforms]);

  useEffect(() => {
    if (platform !== 'all' && platformOptions.length > 1 && !platformOptions.some((p) => p.id === platform)) {
      setPlatform('all');
    }
  }, [platform, platformOptions]);

  const loadOverview = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await api.get('/dashboard/overview', {
          params: { range, platform },
        });
        setOverview({ ...emptyOverview(), ...(res.data || {}) });
      } catch (error) {
        if (!isIgnorableAuthError(error)) {
          console.error('Dashboard overview failed:', error);
          toast.error(error.response?.data?.error || 'Failed to load dashboard');
        }
        setOverview(emptyOverview());
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, platform]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <div className="w-full space-y-5 pb-8 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl truncate">
            Command center
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  range === r.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border p-0.5">
            {platformOptions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                title={p.label}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition',
                  platform === p.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                {p.id === 'all' ? (
                  p.label
                ) : (
                  <PlatformBrandIcon platform={p.id} className="h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadOverview({ silent: true })}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          <HeroKpis kpis={overview.kpis} />
          <ModulePulseCharts
            alerts={overview.alerts}
            grievances={overview.grievances}
            platforms={overview.platforms}
            events={overview.events}
          />
          <PeriscopeTicker />
          <RecommendationList items={overview.recommendations} />

          <div className="grid gap-4 lg:grid-cols-2">
            <TopProfilesCard items={overview.top_profiles} />
            <TopPostsCard items={overview.top_posts} />
          </div>
        </>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [consoleData, setConsoleData] = useState({ admins_total: 0, admins: [] });

  const loadConsole = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id || user.role !== 'superadmin') return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/dashboard/overview');
      setConsoleData(res.data || { admins_total: 0, admins: [] });
    } catch (error) {
      if (!isIgnorableAuthError(error)) {
        toast.error(error.response?.data?.error || 'Failed to load console');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (isSuper) loadConsole();
  }, [isSuper, loadConsole]);

  if (!user) return null;

  if (isSuper) {
    return (
      <SuperadminDashboard
        data={consoleData}
        loading={loading}
        refreshing={refreshing}
        onRefresh={() => loadConsole({ silent: true })}
      />
    );
  }

  return <OpsDashboard />;
};

export default Dashboard;
