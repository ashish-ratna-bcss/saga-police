import React, { useState, useMemo } from 'react';
import {
    Globe, BarChart3, Plus, Trash2, Calendar, User, BadgeCheck
} from 'lucide-react';
import { Button } from '../ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator
} from '../ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';

/* ═══════════════════════════════════════════════════════════════ */
/*                  PLATFORM ICONS & COMPONENTS                   */
/* ═══════════════════════════════════════════════════════════════ */

// X (Twitter) Logo
const XLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const PLATFORM_FILTER_THEME = {
    all: {
        accent: '#b45309',
        activeBg: '#fde68a',
        activeText: '#78350f',
        activeBorder: '#d97706',
        inactiveText: '#a16207',
        inactiveBorder: '#fbbf24',
    },
    x: {
        accent: '#111827',
        activeBg: '#f3f4f6',
        activeText: '#111827',
        activeBorder: '#9ca3af',
        inactiveText: '#374151',
        inactiveBorder: '#d1d5db',
    },
};

/* ═══════════════════════════════════════════════════════════════ */
/*                  MAIN NAVBAR COMPONENT                         */
/* ═══════════════════════════════════════════════════════════════ */

export const GrievanceTopNavbar = ({
    activePlatform = 'all',
    onPlatformChange,
    activeStatus = 'total',
    onStatusChange,
    selectedHandle = null,
    onHandleChange,
    stats = {},
    workflowStats = {},
    grievances = [],
    sources = [],
    allowedStatuses = null,
    onAddSource,
    onRemoveSource,
    onFetchSourceHistory
}) => {
    const [isHandleDropdownOpen, setIsHandleDropdownOpen] = useState(false);

    // Platform tabs
    const PLATFORMS = [
        { id: 'all', label: 'All', icon: null, color: 'text-slate-600' },
        { id: 'x', label: 'X', icon: XLogo, color: 'text-black dark:text-white' },
    ];

    // Status filters
    const STATUS_FILTERS = [
        { id: 'total', label: 'Total', key: 'total' },
        { id: 'pending', label: 'Pending', key: 'pending' },
        { id: 'escalated', label: 'Escalated', key: 'escalated' },
        { id: 'closed', label: 'Closed', key: 'closed' },
        { id: 'fir', label: 'FIR', key: 'converted_to_fir' },
    ];

    const visibleStatusFilters = Array.isArray(allowedStatuses)
        ? STATUS_FILTERS.filter((status) => allowedStatuses.includes(status.id))
        : STATUS_FILTERS;

    const canViewReports = !Array.isArray(allowedStatuses) || allowedStatuses.includes('reports');
    const canViewStampedPostFilters = !Array.isArray(allowedStatuses)
        || allowedStatuses.includes('total')
        || allowedStatuses.includes('criticism')
        || allowedStatuses.includes('suggestion');

    // Filter sources based on active platform
    const platformSources = useMemo(() => {
        if (activePlatform === 'all') return sources; // Or maybe empty if we only want to show when platform selected
        // Actually, if 'all', we probably shouldn't show the detailed cards list or maybe show all?
        // Let's filter by the specific platform if selected 
        return sources.filter(s => s.platform === activePlatform);
    }, [activePlatform, sources]);

    // Use workflow report stats for filter counts (G-flow only)
    const statusCounts = useMemo(() => {
        return {
            total: workflowStats.total || 0,
            pending: workflowStats.pending || 0,
            escalated: workflowStats.escalated || 0,
            closed: workflowStats.closed || 0,
            converted_to_fir: workflowStats.fir || 0,
            reopened: 0,
        };
    }, [workflowStats]);

    const selectedHandleData = sources.find(h => h.handle === selectedHandle || h.id === selectedHandle);
    const isReportsMode = activeStatus === 'reports';
    const filterTheme = PLATFORM_FILTER_THEME[activePlatform] || PLATFORM_FILTER_THEME.all;

    return (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="px-6 py-0">
                {/* ─────────────────────────────────────────────────── */
                /*              SECTION 1: PLATFORM TABS                */
                /* ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 overflow-x-auto scrollbar-hide py-1">
                    {PLATFORMS.map((platform) => {
                        const isActive = !isReportsMode && activePlatform === platform.id;
                        const Icon = platform.icon;
                        const platformTheme = PLATFORM_FILTER_THEME[platform.id] || PLATFORM_FILTER_THEME.all;

                        return (
                            <button
                                key={platform.id}
                                onClick={() => {
                                    onPlatformChange?.(platform.id);
                                    if (activeStatus === 'reports') {
                                        onStatusChange?.('total');
                                    }
                                }}
                                className={cn(
                                    'flex items-center gap-3 px-6 py-4 text-base font-semibold transition-all duration-200 relative whitespace-nowrap rounded-lg active:scale-95 active:translate-y-[1px]',
                                    // Base styling
                                    'hover:bg-slate-50 dark:hover:bg-slate-800',
                                    // Active state
                                    isActive
                                        ? 'text-slate-900 dark:text-slate-100 font-semibold'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                                    // Bottom indicator for active
                                    isActive && 'border-b-2'
                                )}
                                style={isActive ? { borderBottomColor: platformTheme.accent } : undefined}
                            >
                                {Icon ? (
                                    <Icon className={cn('h-5 w-5', platform.color)} />
                                ) : (
                                    <Globe className="h-5 w-5 text-slate-600" />
                                )}
                                <span>{platform.label}</span>
                            </button>
                        );
                    })}

                    {canViewReports && (
                        <button
                            type="button"
                            onClick={() => onStatusChange?.('reports')}
                            className={cn(
                                'ml-auto flex items-center gap-3 px-6 py-4 text-base font-semibold transition-all duration-200 relative whitespace-nowrap rounded-lg active:scale-95 active:translate-y-[1px] hover:bg-slate-50 dark:hover:bg-slate-800',
                                activeStatus === 'reports'
                                    ? 'text-slate-900 dark:text-slate-100 font-semibold border-b-2 border-blue-500'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            )}
                        >
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                            <span>Reports</span>
                        </button>
                    )}
                </div>

                {/* ─────────────────────────────────────────────────── */
                /*     SECTION 2: STATUS FILTERS + RIGHT DROPDOWN        */
                /* ─────────────────────────────────────────────────── */}
                {!isReportsMode && <div className="flex items-center justify-between gap-4 py-3">
                    {/* Status Filter Buttons */}
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
                        {visibleStatusFilters.map((status) => {
                            const isActive = activeStatus === status.id;
                            const count = statusCounts[status.key] || 0;

                            return (
                                <button
                                    key={status.id}
                                    onClick={() => onStatusChange?.(status.id)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap border active:scale-95 active:translate-y-[1px]',
                                        isActive ? 'shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-800',
                                    )}
                                    style={isActive
                                        ? {
                                            backgroundColor: filterTheme.activeBg,
                                            color: filterTheme.activeText,
                                            borderColor: filterTheme.activeBorder,
                                        }
                                        : {
                                            color: filterTheme.inactiveText,
                                            borderColor: filterTheme.inactiveBorder,
                                        }
                                    }
                                >
                                    <span>{status.label}</span>
                                    {count > 0 && (
                                        <span
                                            className="ml-1 text-xs font-semibold"
                                            style={{ color: isActive ? filterTheme.activeText : filterTheme.inactiveText }}
                                        >
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        {canViewStampedPostFilters && (
                            <>
                                <span className="mx-1 h-5 w-px bg-slate-200 shrink-0" />
                                {[
                                    { id: 'criticism', label: 'Criticism' },
                                    { id: 'suggestion', label: 'Suggestion' },
                                ].map((reportBtn) => {
                                    const isActiveReport = activeStatus === reportBtn.id;
                                    return (
                                        <button
                                            key={reportBtn.id}
                                            onClick={() => onStatusChange?.(reportBtn.id)}
                                            className={cn(
                                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap border active:scale-95 active:translate-y-[1px]',
                                                isActiveReport
                                                    ? 'shadow-sm'
                                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                                            )}
                                            style={isActiveReport
                                                ? reportBtn.id === 'criticism'
                                                    ? { backgroundColor: '#ffe4e6', color: '#be123c', borderColor: '#fb7185' }
                                                    : { backgroundColor: '#ede9fe', color: '#6d28d9', borderColor: '#a78bfa' }
                                                : undefined
                                            }
                                        >
                                            {reportBtn.label}
                                        </button>
                                    );
                                })}
                            </>
                        )}
                        {visibleStatusFilters.length === 0 && (
                            <span className="px-2 py-1 text-xs text-slate-500">
                                No grievance features assigned
                            </span>
                        )}
                    </div>


                </div>}
            </div>

            {/* ─────────────────────────────────────────────────── */
            /*     SECTION 3: MONITORED ACCOUNTS (Expanded)          */
            /* ─────────────────────────────────────────────────── */}
            {!isReportsMode && activePlatform !== 'all' && (
                <div className="bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 px-6 py-4">
                    <div className="text-sm text-slate-500 mb-4">
                        {platformSources.length}/5 accounts added
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Account Cards */}
                        {platformSources.map(source => (
                            <Card 
                                key={source.id || source.handle}
                                onClick={() => onHandleChange?.(selectedHandle === source.handle ? null : source.handle)}
                                className={cn(
                                    "relative p-4 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md border bg-white dark:bg-slate-800 rounded-xl h-[120px]",
                                    selectedHandle === source.handle 
                                        ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/10 dark:bg-blue-950/20" 
                                        : "border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <Avatar className="h-10 w-10 border border-slate-100 dark:border-slate-700 rounded-full">
                                        <AvatarImage src={source.profile_image} />
                                        <AvatarFallback className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                            {source.display_name?.charAt(0) || source.handle?.charAt(0) || <User className="h-4 w-4" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate pr-1" title={source.display_name}>
                                                {source.display_name || source.handle}
                                            </h4>
                                            <BadgeCheck className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                        </div>
                                        <p className="text-xs text-slate-500 truncate">@{source.handle}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-end mt-auto pt-3">
                                    <div className="flex gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onFetchSourceHistory?.(source);
                                            }}
                                            title="Fetch History"
                                        >
                                            <Calendar className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveSource?.(source);
                                            }}
                                            title="Remove Account"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {/* Add New Button */}
                        <button 
                            onClick={onAddSource}
                            className="group flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors h-[120px] bg-white dark:bg-slate-800 w-full"
                        >
                            <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                <Plus className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-sm">Add New Account</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrievanceTopNavbar;
