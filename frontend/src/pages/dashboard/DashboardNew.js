import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import HeroKpis from '../../components/dashboard/HeroKpis';
import RecommendationList from '../../components/dashboard/RecommendationList';
import TopProfilesCard from '../../components/dashboard/TopProfilesCard';
import TopPostsCard from '../../components/dashboard/TopPostsCard';
import ModulePulseCharts from '../../components/dashboard/ModulePulseCharts';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

const PLATFORMS = [
  { id: 'all', label: 'All' },
  { id: 'x', label: 'X' },
  { id: 'youtube', label: 'YT' },
  { id: 'facebook', label: 'FB' },
  { id: 'instagram', label: 'IG' },
  { id: 'telegram', label: 'TG' },
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

/**
 * Full-bleed command center — fills main panel edge-to-edge.
 * No max-width, no floating card gutters; panels share borders in a height-filling grid.
 */
const Dashboard = () => {
  const [range, setRange] = useState('7d');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState(emptyOverview);

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
        console.error('Dashboard overview failed:', error);
        toast.error(error.response?.data?.error || 'Failed to load dashboard');
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
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold leading-none tracking-tight">Executive Intelligence Command</h1>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500 ring-1 ring-emerald-500/20">
                LIVE
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              Real-time social observation, threat scoring, grievance management &amp; event tracking
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Selector */}
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 shadow-inner">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
                  range === r.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Platform Selector */}
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 shadow-inner">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                title={p.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-all',
                  platform === p.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <PlatformBrandIcon
                  platform={p.id}
                  className="h-3.5 w-3.5"
                  colored={platform !== p.id}
                />
                <span className="inline">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-xl"
            onClick={() => loadOverview({ silent: true })}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[350px] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm font-semibold">Loading command overview…</span>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Top KPI Metrics Strip */}
          <HeroKpis kpis={overview.kpis} />

          {/* Main Grid: Priority Recommendations + Profiles + Posts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <RecommendationList
              className="lg:col-span-5 min-h-[260px]"
              items={overview.recommendations || []}
            />
            <TopProfilesCard
              className="lg:col-span-3 min-h-[260px]"
              items={overview.top_profiles || []}
            />
            <TopPostsCard
              className="lg:col-span-4 min-h-[260px]"
              items={overview.top_posts || []}
            />
          </div>

          {/* Pulse Charts Grid */}
          <ModulePulseCharts
            alerts={overview.alerts}
            grievances={overview.grievances}
            platforms={overview.platforms}
            events={overview.events}
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
