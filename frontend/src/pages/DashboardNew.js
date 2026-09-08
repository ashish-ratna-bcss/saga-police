import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { PlatformBrandIcon } from '../components/PlatformBrandIcon';
import HeroKpis from '../components/dashboard/HeroKpis';
import RecommendationList from '../components/dashboard/RecommendationList';
import TopProfilesCard from '../components/dashboard/TopProfilesCard';
import TopPostsCard from '../components/dashboard/TopPostsCard';
import ModulePulseCharts from '../components/dashboard/ModulePulseCharts';

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
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      {/* Toolbar — full width */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Alerts · profiles · posts · grievances · events
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-semibold',
                  range === r.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                title={p.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold',
                  platform === p.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <PlatformBrandIcon
                  platform={p.id}
                  className="h-3 w-3"
                  colored={platform !== p.id}
                />
                <span className="hidden sm:inline">{p.label}</span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => loadOverview({ silent: true })}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <>
          <HeroKpis kpis={overview.kpis} className="shrink-0" />

          {/* Main ops grid — stretches to fill remaining height, full width */}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1.2fr)_minmax(0,0.85fr)]">
            <div className="grid min-h-0 grid-cols-1 divide-y border-b border-border lg:grid-cols-12 lg:divide-x lg:divide-y-0 divide-border">
              <RecommendationList
                className="min-h-[200px] lg:col-span-5 lg:min-h-0"
                items={overview.recommendations || []}
              />
              <TopProfilesCard
                className="min-h-[180px] lg:col-span-3 lg:min-h-0"
                items={overview.top_profiles || []}
              />
              <TopPostsCard
                className="min-h-[180px] lg:col-span-4 lg:min-h-0"
                items={overview.top_posts || []}
              />
            </div>

            <ModulePulseCharts
              className="min-h-[200px]"
              alerts={overview.alerts}
              grievances={overview.grievances}
              platforms={overview.platforms}
              events={overview.events}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
