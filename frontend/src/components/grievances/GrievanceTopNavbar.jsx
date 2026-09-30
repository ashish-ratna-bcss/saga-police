import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, BarChart3, Plus, Trash2, RefreshCw, Loader2, Search, X, LayoutGrid, BookUser, ChevronDown, Pencil
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '../../lib/utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '../ui/tooltip';
import { XBrandLogo, FacebookBrandLogo, InstagramBrandLogo, TelegramBrandLogo } from '../PlatformBrandIcon';

/** Icon lookup only — presentation, not a tenant catalog. */
const PLATFORM_ICONS = {
  x: XBrandLogo,
  facebook: FacebookBrandLogo,
  instagram: InstagramBrandLogo,
  telegram: TelegramBrandLogo,
  youtube: Globe,
};

const normalizePlatformId = (value) => {
  const p = String(value || '').trim().toLowerCase();
  if (p === 'twitter') return 'x';
  return p;
};

/** Normalize API rows or slug strings into { id, label }. Label comes from DB `name` when present. */
const normalizeAllowedPlatform = (entry) => {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const id = normalizePlatformId(entry);
    return id ? { id, label: id } : null;
  }
  if (typeof entry === 'object') {
    const id = normalizePlatformId(entry.slug || entry.id || entry.value);
    if (!id) return null;
    const label = String(entry.name || entry.label || '').trim() || id;
    return { id, label };
  }
  return null;
};

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
  onPlatformClick,
  activeStatus = 'total',
  onStatusChange,
  selectedHandle = null,
  onHandleChange,
  stats = {},
  workflowStats = {},
  sources = [],
  allowedStatuses = null,
  allowedPlatforms = null,
  onAddSource,
  onRemoveSource,
  onEditSource,
  onFetchSourceHistory,
  onFetchAll,
  fetchingAll = false,
  searchQuery = '',
  onSearchChange,
  onManageContacts,
  onConfigureSettings,
}) => {
  const visiblePlatforms = useMemo(() => {
    // null = still loading; [] = loaded empty / failed — never invent platforms
    if (!Array.isArray(allowedPlatforms)) return [];

    const seen = new Set();
    const concrete = [];
    for (const entry of allowedPlatforms) {
      const row = normalizeAllowedPlatform(entry);
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      concrete.push({
        id: row.id,
        label: row.label,
        icon: PLATFORM_ICONS[row.id] || Globe,
      });
    }
    if (!concrete.length) return [];

    if (concrete.length <= 1) return concrete;
    return [{ id: 'all', label: 'All', icon: Globe }, ...concrete];
  }, [allowedPlatforms]);

  const labelForPlatform = useMemo(() => {
    const map = new Map();
    for (const p of visiblePlatforms) {
      if (p.id !== 'all') map.set(p.id, p.label);
    }
    return (platform) => {
      const id = normalizePlatformId(platform);
      return map.get(id) || id || 'Unknown';
    };
  }, [visiblePlatforms]);

  const platformSubtitle = useMemo(() => {
    const names = visiblePlatforms
      .filter((p) => p.id !== 'all')
      .map((p) => p.label);
    if (names.length === 0) return 'No platforms enabled for this account';
    if (names.length === 1) return `Mentions on watched ${names[0]} accounts`;
    if (names.length === 2) return `Mentions on watched ${names[0]} & ${names[1]} accounts`;
    return `Mentions on watched ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} accounts`;
  }, [visiblePlatforms]);

  // If current tab isn't allowed, jump to first available platform
  useEffect(() => {
    if (!visiblePlatforms.length) return;
    if (visiblePlatforms.some((p) => p.id === activePlatform)) return;
    onPlatformChange?.(visiblePlatforms[0].id);
  }, [visiblePlatforms, activePlatform, onPlatformChange]);

  const visibleStatusFilters = Array.isArray(allowedStatuses)
    ? STATUS_FILTERS.filter((status) => allowedStatuses.includes(status.id))
    : STATUS_FILTERS;

  const canViewReports = !Array.isArray(allowedStatuses) || allowedStatuses.includes('reports');
  const canViewCriticism =
    !Array.isArray(allowedStatuses) || allowedStatuses.includes('criticism');
  const canViewSuggestion =
    !Array.isArray(allowedStatuses) || allowedStatuses.includes('suggestion');

  const platformSources = useMemo(() => {
    let list = sources;
    if (activePlatform !== 'all') {
      const want = normalizePlatformId(activePlatform);
      list = sources.filter((s) => normalizePlatformId(s.platform) === want);
    }
    return [...list].sort((a, b) => {
      const countA = Number(a.total_grievances || a.post_count || a.count || 0);
      const countB = Number(b.total_grievances || b.post_count || b.count || 0);
      if (countB !== countA) {
        return countB - countA;
      }
      const nameA = String(a.display_name || a.handle || '').toLowerCase();
      const nameB = String(b.display_name || b.handle || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [activePlatform, sources]);

  const statusCounts = useMemo(
    () => ({
      // Catalog stats only — do not fall back to report workflowStats (keeps Total ≠ Pending).
      total: Number(stats.total || 0),
      pending: Number(stats.pending || 0),
      escalated: Number(stats.escalated || 0),
      closed: Number(stats.closed || 0),
      converted_to_fir: Number(stats.converted_to_fir || 0),
    }),
    [stats]
  );

  const isReportsMode = activeStatus === 'reports';
  const fetchLabel =
    activePlatform === 'facebook' || activePlatform === 'instagram'
      ? 'Fetch posts & comments'
      : 'Fetch mentions';

  // Watched-accounts: show chips on one line; overflow opens dropdown.
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const accountsRef = useRef(null);
  const chipsRowRef = useRef(null);
  const measureChipRef = useRef(null);

  useEffect(() => {
    if (!accountsOpen) return undefined;
    const onDocClick = (e) => {
      if (accountsRef.current && !accountsRef.current.contains(e.target)) {
        setAccountsOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAccountsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountsOpen]);

  // Fit as many chips as possible on one line; remainder via dropdown.
  useEffect(() => {
    const row = chipsRowRef.current;
    if (!row) return undefined;

    const measure = () => {
      const chipW = measureChipRef.current?.offsetWidth || 148;
      const moreBtnW = 118;
      const gap = 6;
      const width = row.clientWidth;
      if (width <= 0) return;
      const canFit = Math.max(1, Math.floor((width - moreBtnW - gap) / (chipW + gap)));
      setVisibleCount(canFit);
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(row);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [platformSources.length, activePlatform]);

  const inlineSources = platformSources.slice(0, visibleCount);
  const overflowCount = Math.max(0, platformSources.length - inlineSources.length);
  const showMoreButton = platformSources.length > inlineSources.length || platformSources.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-2">
      {/* Title row — toggles fill the middle space */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Grievances</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            {platformSubtitle}
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

        {!isReportsMode && visiblePlatforms.length > 0 && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 gap-0.5">
            {visiblePlatforms.map((platform) => {
              const Icon = platform.icon;
              const isActive = activePlatform === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => {
                    onPlatformChange?.(platform.id);
                    onPlatformClick?.(platform.id);
                  }}
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
              Official X, Facebook &amp; Instagram accounts you are monitoring for grievances.
            </TooltipContent>
          </Tooltip>
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
        </div>
      </div>

      {!isReportsMode && (
        <div className="rounded-xl border border-border bg-card">
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

          {/* Watched accounts — one line of chips; overflow via dropdown */}
          <div className="relative px-3 py-2" ref={accountsRef}>
            {/* Hidden probe chip for width measurement */}
            <div
              ref={measureChipRef}
              aria-hidden
              className="pointer-events-none invisible absolute -z-10 inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
            >
              <span className="h-5 w-5 rounded-full" />
              <span className="max-w-[110px] truncate text-[11px] font-medium">
                Measure chip width
              </span>
            </div>

            {platformSources.length === 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  No grievance profiles for this platform. Configure them in Settings.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  onClick={onConfigureSettings || onAddSource}
                >
                  Configure in Settings
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {!accountsOpen ? (
                  <div
                    ref={chipsRowRef}
                    className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden"
                  >
                    {inlineSources.map((source) => {
                      const active = selectedHandle === source.handle;
                      return (
                        <button
                          key={source.id || source.handle}
                          type="button"
                          title={`${source.display_name || source.handle} · ${labelForPlatform(source.platform)}`}
                          onClick={() => onHandleChange?.(active ? null : source.handle)}
                          className={cn(
                            'inline-flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors',
                            active
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-background hover:bg-muted/40'
                          )}
                        >
                          <Avatar className="h-5 w-5 shrink-0">
                            <AvatarImage
                              src={source.profile_image_url || source.profile_image}
                            />
                            <AvatarFallback className="text-[9px]">
                              {(source.display_name || source.handle || '?')[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-[11px] font-medium">
                            {source.display_name || source.handle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      Monitored Profiles
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({platformSources.length} profiles, sorted by item count)
                    </span>
                  </div>
                )}

                {showMoreButton ? (
                  <button
                    type="button"
                    onClick={() => setAccountsOpen((v) => !v)}
                    aria-expanded={accountsOpen}
                    aria-haspopup="listbox"
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                      accountsOpen || selectedHandle
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/40'
                    )}
                  >
                    {accountsOpen ? (
                      <span>Show less</span>
                    ) : overflowCount > 0 ? (
                      <>
                        <span>+{overflowCount}</span>
                        <span className="font-normal text-muted-foreground">more</span>
                      </>
                    ) : (
                      <>
                        <span>All</span>
                        <span className="font-normal tabular-nums text-muted-foreground">
                          {platformSources.length}
                        </span>
                      </>
                    )}
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform',
                        accountsOpen && 'rotate-180'
                      )}
                    />
                  </button>
                ) : null}

                {selectedHandle ? (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-primary hover:underline"
                    onClick={() => onHandleChange?.(null)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            )}

            {accountsOpen ? (
              <div className="relative z-30 mt-2 max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-md">
                {platformSources.length === 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      No grievance profiles for this platform. Configure them in Settings.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-xs"
                      onClick={onConfigureSettings || onAddSource}
                    >
                      Configure in Settings
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {platformSources.map((source) => {
                      const active = selectedHandle === source.handle;
                      return (
                        <button
                          key={source.id || source.handle}
                          type="button"
                          onClick={() => {
                            onHandleChange?.(active ? null : source.handle);
                            setAccountsOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                            active
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-background hover:bg-muted/40'
                          )}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage
                              src={source.profile_image_url || source.profile_image}
                            />
                            <AvatarFallback className="text-[10px]">
                              {(source.display_name || source.handle || '?')[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">
                              {source.display_name || source.handle}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {labelForPlatform(source.platform)} ·{' '}
                              {source.total_grievances || 0} items
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <span
                              role="button"
                              tabIndex={0}
                              className="rounded-md p-1.5 hover:bg-muted"
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditSource?.(source);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  onEditSource?.(source);
                                }
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="rounded-md p-1.5 hover:bg-muted"
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
                              className="rounded-md p-1.5 hover:bg-muted"
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
            ) : null}
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default GrievanceTopNavbar;
