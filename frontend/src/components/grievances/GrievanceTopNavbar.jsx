import React, { useMemo } from 'react';
import {
  Globe, BarChart3, Plus, Trash2, RefreshCw, Loader2, Search, X, LayoutGrid, BookUser
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '../../lib/utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '../ui/tooltip';

const XLogo = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const FacebookLogo = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.84c0-2.37 1.4-3.69 3.56-3.69 1.03 0 2.12.19 2.12.19v2.34h-1.2c-1.18 0-1.55.74-1.55 1.5v1.8h2.64l-.42 2.91h-2.22V22c4.78-.75 8.44-4.91 8.44-9.93z" />
  </svg>
);

const PLATFORMS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'x', label: 'X', icon: XLogo },
  { id: 'facebook', label: 'Facebook', icon: FacebookLogo },
];

const STATUS_FILTERS = [
  { id: 'total', label: 'Total', key: 'total' },
  { id: 'pending', label: 'Pending', key: 'pending' },
  { id: 'escalated', label: 'Escalated', key: 'escalated' },
  { id: 'closed', label: 'Closed', key: 'closed' },
  { id: 'fir', label: 'FIR', key: 'converted_to_fir' },
];

export const GrievanceTopNavbar = ({
  activePlatform = 'all',
  onPlatformChange,
  activeStatus = 'total',
  onStatusChange,
  selectedHandle = null,
  onHandleChange,
  stats = {},
  workflowStats = {},
  sources = [],
  allowedStatuses = null,
  onAddSource,
  onRemoveSource,
  onFetchSourceHistory,
  onFetchAll,
  fetchingAll = false,
  searchQuery = '',
  onSearchChange,
  onManageContacts,
}) => {
  const visibleStatusFilters = Array.isArray(allowedStatuses)
    ? STATUS_FILTERS.filter((status) => allowedStatuses.includes(status.id))
    : STATUS_FILTERS;

  const canViewReports = !Array.isArray(allowedStatuses) || allowedStatuses.includes('reports');
  const canViewCriticism =
    !Array.isArray(allowedStatuses) || allowedStatuses.includes('criticism');
  const canViewSuggestion =
    !Array.isArray(allowedStatuses) || allowedStatuses.includes('suggestion');

  const platformSources = useMemo(() => {
    if (activePlatform === 'all') return sources;
    return sources.filter((s) => s.platform === activePlatform);
  }, [activePlatform, sources]);

  const statusCounts = useMemo(
    () => ({
      total: Number(stats.total ?? workflowStats.total ?? 0),
      pending: Number(stats.pending ?? workflowStats.pending ?? 0),
      escalated: Number(stats.escalated ?? workflowStats.escalated ?? 0),
      closed: Number(stats.closed ?? workflowStats.closed ?? 0),
      converted_to_fir: Number(stats.converted_to_fir ?? workflowStats.fir ?? 0),
    }),
    [stats, workflowStats]
  );

  const isReportsMode = activeStatus === 'reports';
  const fetchLabel =
    activePlatform === 'facebook' ? 'Fetch posts & comments' : 'Fetch mentions';

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-2">
      {/* Title row — toggles fill the middle space */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Grievances</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Mentions on watched X &amp; Facebook accounts
          </p>
        </div>

        {canViewReports && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => onStatusChange?.('total')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                !isReportsMode
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Feed
            </button>
            <button
              type="button"
              onClick={() => onStatusChange?.('reports')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                isReportsMode
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Reports
            </button>
          </div>
        )}

        {!isReportsMode && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 gap-0.5">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              const isActive = activePlatform === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => onPlatformChange?.(platform.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {platform.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-semibold text-foreground">
                  {Number(stats.total || 0).toLocaleString()}
                </span>
                <span>mentions</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-xs">
              Total posts/comments matching watched accounts in the current catalog.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-semibold text-foreground">
                  {sources.length}
                </span>
                <span>watched</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-xs">
              Official X &amp; Facebook accounts you are monitoring for grievances.
            </TooltipContent>
          </Tooltip>
          {typeof onManageContacts === 'function' && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={onManageContacts}
            >
              <BookUser className="h-3.5 w-3.5" />
              Contacts
            </Button>
          )}
          {typeof onFetchAll === 'function' && platformSources.length > 0 && !isReportsMode && (
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={onFetchAll}
              disabled={Boolean(fetchingAll)}
            >
              {fetchingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {fetchLabel}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onAddSource}>
            <Plus className="h-3.5 w-3.5" />
            Accounts
          </Button>
        </div>
      </div>

      {!isReportsMode && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Status + search */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              {visibleStatusFilters.map((status) => {
                const isActive = activeStatus === status.id;
                const count = statusCounts[status.key] ?? 0;
                return (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => onStatusChange?.(status.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-amber-500 bg-amber-50 text-amber-900'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {status.label}
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] tabular-nums font-semibold',
                        isActive ? 'bg-amber-200/80 text-amber-950' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {(canViewCriticism || canViewSuggestion) && (
                <span className="hidden sm:inline w-px h-4 bg-border mx-0.5" />
              )}
              {canViewCriticism && (
                <button
                  type="button"
                  onClick={() => onStatusChange?.('criticism')}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium',
                    activeStatus === 'criticism'
                      ? 'border-rose-500 bg-rose-50 text-rose-900'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Criticism
                </button>
              )}
              {canViewSuggestion && (
                <button
                  type="button"
                  onClick={() => onStatusChange?.('suggestion')}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium',
                    activeStatus === 'suggestion'
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Suggestion
                </button>
              )}
            </div>

            {typeof onSearchChange === 'function' && (
              <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search grievances…"
                  className="h-8 pl-8 pr-8 text-xs"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => onSearchChange('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Watched accounts */}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-foreground">
                Watched accounts
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {platformSources.length}
                </span>
              </p>
              {selectedHandle && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => onHandleChange?.(null)}
                >
                  Clear account filter
                </button>
              )}
            </div>

            {platformSources.length === 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  No accounts for this platform. Add them from Social Profiles.
                </p>
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onAddSource}>
                  Open profiles
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                {platformSources.map((source) => {
                  const active = selectedHandle === source.handle;
                  return (
                    <button
                      key={source.id || source.handle}
                      type="button"
                      onClick={() => onHandleChange?.(active ? null : source.handle)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors w-full',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:bg-muted/40'
                      )}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={source.profile_image_url || source.profile_image} />
                        <AvatarFallback className="text-[10px]">
                          {(source.display_name || source.handle || '?')[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">
                          {source.display_name || source.handle}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {source.platform === 'facebook' ? 'Facebook' : 'X'} ·{' '}
                          {source.total_grievances || 0} items
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span
                          role="button"
                          tabIndex={0}
                          className="p-1.5 rounded-md hover:bg-muted"
                          title="Fetch"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFetchSourceHistory?.(source);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              onFetchSourceHistory?.(source);
                            }
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="p-1.5 rounded-md hover:bg-muted"
                          title="Remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSource?.(source);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              onRemoveSource?.(source);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default GrievanceTopNavbar;
