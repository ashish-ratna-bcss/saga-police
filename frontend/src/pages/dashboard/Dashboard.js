import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Globe,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '../../lib/api';
import { periscopeApi } from '../../api';
import { useAuth } from '../../context/auth.context';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { PlatformBrandIcon, PLATFORM_BRAND_BG } from '../../components/PlatformBrandIcon';
import { usePagePlatforms } from '../../hooks/usePagePlatforms';

// ==========================================
// CONSTANTS & HELPERS
// ==========================================
const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

const RISK_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bg: 'bg-red-500/15 text-red-500 border-red-500/30' },
  high: { label: 'High', color: '#ef4444', bg: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  low: { label: 'Low', color: '#10b981', bg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  unknown: { label: 'Unclassified', color: '#64748b', bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

function getPermissionBadge(status) {
  const s = String(status || '').toLowerCase().trim();
  if (!s || s === 'not specified' || s === 'unspecified') {
    return {
      badge: 'bg-muted text-muted-foreground border-border/50',
      dot: 'bg-muted-foreground/40',
      label: status || 'Not specified',
    };
  }
  if (s.includes('grant') || s.includes('permit') || s.includes('allowed') || s === 'yes') {
    return {
      badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-medium',
      dot: 'bg-emerald-500',
      label: status,
    };
  }
  if (s.includes('reject') || s.includes('denied') || s.includes('cancel') || s.includes('prohibit') || s === 'no') {
    return {
      badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-medium',
      dot: 'bg-rose-500',
      label: status,
    };
  }
  if (s.includes('gov') || s.includes('official') || s.includes('vip') || s.includes('department')) {
    return {
      badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 font-medium',
      dot: 'bg-blue-500',
      label: status,
    };
  }
  if (s.includes('info') || s.includes('public') || s.includes('intimation') || s.includes('process') || s.includes('pending')) {
    return {
      badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-medium',
      dot: 'bg-amber-500',
      label: status,
    };
  }
  return {
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
    label: status,
  };
}

const formatScore = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
};

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
};

const emptyOverview = () => ({
  kpis: {
    accounts_total: 0,
    accounts_active: 0,
    accounts_monitoring: 0,
    high_risk_open: 0,
    unread_alerts: 0,
    open_grievances: 0,
    events_started: 0,
    posts_in_range: 0,
  },
  recommendations: [],
  top_profiles: [],
  top_posts: [],
  alerts: { total: 0, by_risk: {}, by_platform: {}, by_status: {} },
  grievances: { total: 0, by_workflow: {}, by_platform: {}, reports: {} },
  events: { total: 0, started: 0, items: [] },
  platforms: [],
  daily_ingestion: [],
  trend: [],
  stance_stats: { favourable: 0, unfavourable: 0, neutral: 0, total: 0, favourable_pct: 0, unfavourable_pct: 0, neutral_pct: 0 },
  sentiment_stats: { positive: 0, neutral: 0, negative: 0, total: 0, positive_pct: 0, neutral_pct: 0, negative_pct: 0, net_score: 0 },
  risk_stats: { high: 0, medium: 0, low: 0, total: 0, high_pct: 0, medium_pct: 0, low_pct: 0 },
});

const isIgnorableAuthError = (error) => {
  const status = error?.response?.status;
  return status === 401 || status === 403 || error?.code === 'ERR_CANCELED';
};

// ==========================================
// 1. PERISCOPE LIVE SITUATION SCROLLING FEED
// ==========================================
function PeriscopeScrollingTicker() {
  const [feed, setFeed] = useState({
    programmes: [],
    report_date: '',
    organization: '',
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isTemporarilyPaused, setIsTemporarilyPaused] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState(null);

  const scrollContainerRef = useRef(null);
  const tempPauseTimerRef = useRef(null);

  const isScrollPaused = isPaused || isHovered || isTemporarilyPaused || Boolean(selectedProgramme);
  const pausedRef = useRef(isScrollPaused);
  pausedRef.current = isScrollPaused;

  useEffect(() => {
    let isMounted = true;
    const loadFeed = async () => {
      try {
        const localDate = format(new Date(), 'yyyy-MM-dd');
        const res = await periscopeApi.getFeed({ limit: 40, date: localDate });
        if (isMounted && res.data?.ok && res.data.data) {
          setFeed(res.data.data);
        } else if (isMounted && res.data && Array.isArray(res.data.programmes)) {
          setFeed({
            programmes: res.data.programmes,
            report_date: res.data.report_date || format(new Date(), 'dd.MM.yyyy'),
            organization: res.data.organization || 'Special Branch Intelligence',
            total: res.data.total ?? res.data.programmes.length,
          });
        }
      } catch (err) {
        // graceful fallback
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadFeed();
    return () => {
      isMounted = false;
      if (tempPauseTimerRef.current) clearTimeout(tempPauseTimerRef.current);
    };
  }, []);

  const programmes = feed.programmes || [];

  const highPriorityCount = useMemo(() => {
    return programmes.filter(
      (p) => String(p.priority || '').toLowerCase() === 'high'
    ).length;
  }, [programmes]);

  const pauseAutoScrollTemporarily = (durationMs = 6000) => {
    setIsTemporarilyPaused(true);
    if (tempPauseTimerRef.current) clearTimeout(tempPauseTimerRef.current);
    tempPauseTimerRef.current = setTimeout(() => {
      setIsTemporarilyPaused(false);
    }, durationMs);
  };

  const scrollPosRef = useRef(0);

  // Smooth continuous auto-scroll ticker with reset
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || programmes.length <= 1) return;

    let animId;
    let lastTime = performance.now();
    let isResetting = false;
    const speed = 65; // px per second
    scrollPosRef.current = el.scrollLeft;

    const step = (now) => {
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!pausedRef.current && el && !isResetting) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 10) {
          if (el.scrollLeft >= maxScroll - 2) {
            isResetting = true;
            setTimeout(() => {
              if (el) {
                el.scrollTo({ left: 0, behavior: 'smooth' });
                setTimeout(() => {
                  scrollPosRef.current = 0;
                  isResetting = false;
                }, 1000);
              } else {
                isResetting = false;
              }
            }, 2000);
          } else {
            scrollPosRef.current += speed * delta;
            el.scrollLeft = scrollPosRef.current;
          }
        }
      } else if (el) {
        scrollPosRef.current = el.scrollLeft;
      }
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [programmes.length]);

  const handleManualScroll = (direction) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    pauseAutoScrollTemporarily(6000);
    const stepSize = 390;
    const maxScroll = el.scrollWidth - el.clientWidth;

    if (direction === 'left') {
      if (el.scrollLeft <= 15) {
        el.scrollTo({ left: maxScroll, behavior: 'smooth' });
        scrollPosRef.current = maxScroll;
      } else {
        el.scrollBy({ left: -stepSize, behavior: 'smooth' });
        scrollPosRef.current = Math.max(0, el.scrollLeft - stepSize);
      }
    } else {
      if (el.scrollLeft >= maxScroll - 15) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
        scrollPosRef.current = 0;
      } else {
        el.scrollBy({ left: stepSize, behavior: 'smooth' });
        scrollPosRef.current = Math.min(maxScroll, el.scrollLeft + stepSize);
      }
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-48 bg-muted rounded-md" />
          <div className="h-5 w-24 bg-muted rounded-md" />
        </div>
        <div className="flex gap-3 overflow-hidden py-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 w-[360px] bg-muted/50 rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
              <Compass className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                Periscope DSR Live Schedule
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {feed.organization || 'Special Branch Intelligence'} • {feed.report_date || format(new Date(), 'dd.MM.yyyy')}
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
            <Link to="/periscope">
              <Compass className="h-3 w-3 text-blue-500" />
              <span>Open Periscope DSR</span>
            </Link>
          </Button>
        </div>
        <div className="p-6 text-center flex flex-col items-center justify-center text-muted-foreground">
          <Calendar className="h-7 w-7 text-muted-foreground/30 mb-1.5" />
          <p className="text-xs font-bold text-foreground">No Programmes Scheduled for Today</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Import an official report or add programmes in the Periscope module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="relative rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
        {/* Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/15 px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Periscope DSR Live Schedule
                </h2>
                <Badge
                  variant="outline"
                  className="text-[9px] font-bold uppercase tracking-wider py-0 px-1.5 bg-primary/5 text-primary border-primary/20"
                >
                  Continuous Stream
                </Badge>
                {highPriorityCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-[9px] font-bold py-0 px-1.5 gap-1 shadow-2xs"
                  >
                    <ShieldAlert className="h-2.5 w-2.5" />
                    {highPriorityCount} High Priority
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  • {feed.total || programmes.length} Programmes
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {feed.organization || 'Special Branch Intelligence'} • Report Date: {feed.report_date || format(new Date(), 'dd.MM.yyyy')}
              </p>
            </div>
          </div>

          {/* Action & Nav Controls */}
          <div className="flex items-center gap-1.5">
            {/* Auto-scroll pause/play with clear text indicator */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px] font-semibold gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setIsPaused((prev) => !prev)}
              title={isPaused ? 'Resume auto-scrolling' : 'Pause auto-scrolling'}
            >
              {isPaused ? (
                <>
                  <Play className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Resume Scroll</span>
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3 text-amber-500" />
                  <span className="hidden sm:inline">Pause Scroll</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
              onClick={() => handleManualScroll('left')}
              title="Previous card"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
              onClick={() => handleManualScroll('right')}
              title="Next card"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1 ml-1 px-2.5">
              <Link to="/periscope">
                <span>View Full DSR</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </header>

        {/* Ticker Track with Soft Edge Masks */}
        <div className="relative group/ticker overflow-hidden rounded-xl">
          {/* Edge fade gradients */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent z-10" />

          <div
            ref={scrollContainerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            className="relative w-full overflow-x-auto no-scrollbar select-text px-3 py-3 [&::-webkit-scrollbar]:hidden will-change-scroll"
          >
            <div className="flex items-stretch gap-3" style={{ width: 'max-content' }}>
              {programmes.map((p, index) => {
                const priorityLower = String(p.priority || 'low').toLowerCase();
                const isHigh = priorityLower === 'high';
                const isMedium = priorityLower === 'medium';
                const permMeta = getPermissionBadge(p.permission_status);

                return (
                  <div
                    key={`${p.id || p.sl_no || index}-${index}`}
                    onClick={() => setSelectedProgramme(p)}
                    className={cn(
                      'group relative w-[360px] sm:w-[380px] shrink-0 rounded-xl border p-3 flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-hidden',
                      'bg-card shadow-2xs hover:shadow-md hover:-translate-y-0.5',
                      isHigh
                        ? 'border-rose-500/40 bg-gradient-to-b from-rose-500/[0.04] to-transparent hover:border-rose-500/70'
                        : isMedium
                        ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/[0.04] to-transparent hover:border-amber-500/70'
                        : 'border-border/75 hover:border-primary/50'
                    )}
                  >
                    <div>
                      {/* Top Row: # Index, Priority Pill, Timing, Zone */}
                      <div className="flex items-center justify-between gap-1.5 mb-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded border border-border/50 shrink-0">
                            #{index + 1}
                          </span>

                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0',
                              isHigh
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                : isMedium
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'bg-muted/70 text-muted-foreground border-border/50'
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full shrink-0',
                                isHigh ? 'bg-rose-500 animate-pulse' : isMedium ? 'bg-amber-500' : 'bg-slate-400'
                              )}
                            />
                            {p.priority || 'Routine'}
                          </span>

                          {p.zone && (
                            <span
                              className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 truncate min-w-0 max-w-[120px]"
                              title={`Zone: ${p.zone}`}
                            >
                              {p.zone}
                            </span>
                          )}
                        </div>

                        {p.time && (
                          <span
                            className="text-[10px] font-medium text-muted-foreground shrink-0 inline-flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/30 max-w-[140px] min-w-0"
                            title={`Timing: ${p.time}`}
                          >
                            <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                            <span className="truncate min-w-0">{p.time}</span>
                          </span>
                        )}
                      </div>

                      {/* Programme Name */}
                      <h3
                        className="font-bold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug tracking-tight mb-2"
                        title={p.name}
                      >
                        {p.name}
                      </h3>

                      {/* Category Tag */}
                      {p.category && (
                        <div className="mb-2">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 max-w-full truncate"
                            title={p.category}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="truncate">{p.category}</span>
                          </span>
                        </div>
                      )}

                      {/* Venue & Organizer Details Block */}
                      <div className="space-y-1 text-xs text-muted-foreground mb-2 bg-muted/20 p-2 rounded-lg border border-border/40">
                        {p.police_station_place && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground/70 shrink-0 mt-0.5" />
                            <div className="leading-tight text-foreground/90 text-[11px] min-w-0 flex-1">
                              <span className="line-clamp-1">{p.police_station_place}</span>
                            </div>
                          </div>
                        )}

                        {p.organizer && (
                          <div className="flex items-start gap-1.5 pt-1 border-t border-border/30">
                            <Building2 className="h-3 w-3 text-muted-foreground/70 shrink-0 mt-0.5" />
                            <div className="leading-tight text-foreground/90 text-[11px] min-w-0 flex-1">
                              <span className="line-clamp-1">{p.organizer}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: Turnout + Permission Status + View Details */}
                    <div className="pt-2 border-t border-border/40 space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[10px] min-w-0">
                        {p.expected_members ? (
                          <div
                            className="flex items-center gap-1 min-w-0 flex-1"
                            title={`Turnout: ${p.expected_members}`}
                          >
                            <Users className="h-3 w-3 text-primary shrink-0" />
                            <span className="text-muted-foreground font-normal shrink-0">Turnout:</span>
                            <span className="font-semibold text-foreground truncate min-w-0">{p.expected_members}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0 flex-1 text-muted-foreground/60">
                            <Users className="h-3 w-3 shrink-0" />
                            <span className="truncate min-w-0">Turnout: Not specified</span>
                          </div>
                        )}

                        <span className="text-[10px] font-semibold text-primary group-hover:underline inline-flex items-center gap-0.5 shrink-0 ml-1">
                          Inspect <Eye className="h-2.5 w-2.5" />
                        </span>
                      </div>

                      <div className="pt-0.5 min-w-0">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-full min-w-0',
                            permMeta.badge
                          )}
                          title={`Permission Status: ${p.permission_status || 'Not specified'}`}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', permMeta.dot)} />
                          <span className="truncate min-w-0">{p.permission_status || 'Permission Unspecified'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Detail Modal */}
      <Dialog
        open={Boolean(selectedProgramme)}
        onOpenChange={(open) => {
          if (!open) setSelectedProgramme(null);
        }}
      >
        <DialogContent className="max-w-xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border',
                  String(selectedProgramme?.priority).toLowerCase() === 'high'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    : String(selectedProgramme?.priority).toLowerCase() === 'medium'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    : 'bg-muted text-muted-foreground border-border/50'
                )}
              >
                {selectedProgramme?.priority || 'Routine'} Priority
              </span>
              {selectedProgramme?.category && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                  {selectedProgramme.category}
                </span>
              )}
              {selectedProgramme?.zone && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                  {selectedProgramme.zone}
                </span>
              )}
            </div>
            <DialogTitle className="text-lg font-bold leading-snug">
              {selectedProgramme?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedProgramme && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/20 p-3.5 rounded-xl border border-border/60">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Schedule & Timing
                  </span>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <span>{selectedProgramme.time || 'Not specified'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Permission Status
                  </span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                        getPermissionBadge(selectedProgramme.permission_status).badge
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          getPermissionBadge(selectedProgramme.permission_status).dot
                        )}
                      />
                      {selectedProgramme.permission_status || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-card border border-border/60 rounded-xl p-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> Venue / Police Station
                  </span>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {selectedProgramme.police_station_place || 'Not specified'}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-primary" /> Organizer / Group
                  </span>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {selectedProgramme.organizer || 'Not specified'}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-primary" /> Expected Members / Turnout
                  </span>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {selectedProgramme.expected_members || 'Not specified'}
                  </p>
                </div>

                {selectedProgramme.remarks && (
                  <div className="pt-2 border-t border-border/40">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                      <FileText className="h-3.5 w-3.5 text-primary" /> Key Notes / Remarks
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {selectedProgramme.remarks}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedProgramme(null)}
                >
                  Close
                </Button>

                <Button asChild size="sm">
                  <Link to="/periscope">
                    View in Periscope DSR <ArrowUpRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==========================================
// 2. MAIN OPERATIONS DASHBOARD
// ==========================================
const OperationsDashboard = () => {
  const [range, setRange] = useState('7d');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState(emptyOverview);

  const { platforms: hookPlatforms } = usePagePlatforms();

  const platformOptions = useMemo(() => {
    const seen = new Set();
    const configured = [];

    const sourcePlatforms =
      hookPlatforms && hookPlatforms.length > 0
        ? hookPlatforms
        : overview.platforms || [];

    for (const row of sourcePlatforms) {
      const id = String(row?.slug || '')
        .trim()
        .toLowerCase()
        .replace(/^twitter$/, 'x');
      if (!id || id === 'unknown' || seen.has(id)) continue;
      seen.add(id);
      configured.push({ id, label: row.name || id });
    }
    return [{ id: 'all', label: 'All' }, ...configured];
  }, [hookPlatforms, overview.platforms]);

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
          toast.error(error.response?.data?.error || 'Failed to load dashboard overview');
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

  // Derived metrics
  const kpis = overview.kpis || {};
  const byRisk = overview.alerts?.by_risk || {};
  const criticalCount = Number(byRisk.critical || byRisk.CRITICAL || 0);
  const highCount = Number(byRisk.high || byRisk.HIGH || 0);

  const grievReports = overview.grievances?.reports || {};
  const topProfiles = overview.top_profiles || [];
  const topPosts = overview.top_posts || [];
  const platforms = overview.platforms || [];
  const trendData = overview.daily_ingestion || overview.trend || [];

  // Trend summary stats
  const trendStats = useMemo(() => {
    if (!trendData || trendData.length === 0) {
      return { total: 0, peak: 0, avg: 0 };
    }
    const total = trendData.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    const peak = Math.max(...trendData.map((d) => Number(d.total) || 0), 0);
    const avg = Math.round(total / Math.max(1, trendData.length));
    return { total, peak, avg };
  }, [trendData]);

  // Total posts across platforms for share calculation
  const totalPlatformPosts = useMemo(() => {
    return platforms.reduce((acc, p) => acc + (Number(p.posts_count) || 0), 0) || 1;
  }, [platforms]);

  const stanceStats = overview.stance_stats || {};
  const sentimentStats = overview.sentiment_stats || {};
  const riskStats = overview.risk_stats || {};

  return (
    <div className="flex min-h-full flex-col gap-3 w-full max-w-full overflow-x-hidden pb-8 animate-in fade-in-50 duration-200">
      {/* 1. TOP HEADER & COMMAND ROW */}
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 shrink-0">
        <div className="min-w-0 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-heading font-bold tracking-tight leading-none text-foreground">
              Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Operational
            </span>
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-3 w-3" />
                {criticalCount} Critical
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Real-time threat monitoring, surveillance telemetry, cross-platform intelligence & case triage
          </p>
        </div>

        {/* Right Action Bar & Filters */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 ml-auto">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs hidden md:inline-flex">
            <Link to="/global-search">
              <Search className="h-3.5 w-3.5 text-primary" />
              <span>Global Search</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs hidden lg:inline-flex">
            <Link to="/analytics-hub">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
              <span>Analytics Hub</span>
            </Link>
          </Button>

          {/* Timeframe Range Pills */}
          <div className="flex rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                  range === r.id
                    ? 'bg-foreground text-background shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Platform Selector Filter */}
          <div className="flex rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs overflow-x-auto">
            {platformOptions.map((p) => {
              const isActive = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  title={p.label}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors shrink-0 cursor-pointer',
                    isActive
                      ? 'bg-foreground text-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.id === 'all' ? (
                    'All'
                  ) : (
                    <PlatformBrandIcon platform={p.id} className="h-3.5 w-3.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadOverview({ silent: true })}
            disabled={refreshing}
            className="h-8 w-8 p-0 cursor-pointer"
            title="Refresh All Telemetry"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin text-primary')} />
          </Button>
        </div>
      </div>

      {/* 2. 5 CORE OPERATIONS KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Link
          to="/alerts"
          className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-rose-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 truncate">
              Threat Vector Radar
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0 group-hover:scale-105 transition-transform">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {Number(kpis.high_risk_open || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] font-bold text-rose-500">High / Critical</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {Number(kpis.unread_alerts || 0).toLocaleString('en-IN')} unacknowledged in queue
          </p>
        </Link>

        <Link
          to="/social-profiles"
          className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 truncate">
              Surveillance Fleet
            </span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0 group-hover:scale-105 transition-transform">
              <Radio className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {Number(kpis.accounts_monitoring || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] font-bold text-emerald-500">Active Probes</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {Number(kpis.accounts_total || 0).toLocaleString('en-IN')} total target profiles
          </p>
        </Link>

        <Link
          to="/events"
          className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-blue-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 truncate">
              Monitored Events
            </span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0 group-hover:scale-105 transition-transform">
              <CalendarDays className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {Number(kpis.events_started || overview.events?.started || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] font-bold text-blue-500">Live Running</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {Number(overview.events?.total || 0).toLocaleString('en-IN')} monitored operations
          </p>
        </Link>

        <Link
          to="/grievances"
          className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-orange-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 truncate">
              Citizen Grievances
            </span>
            <div className="h-7 w-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0 group-hover:scale-105 transition-transform">
              <MessageSquareWarning className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {Number(kpis.open_grievances || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] font-bold text-orange-500">Open Cases</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {grievReports.sent_to_intermediary || 0} escalated to intermediary
          </p>
        </Link>

        <Link
          to="/content"
          className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-indigo-500/50 hover:shadow-md transition-all cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 truncate">
              Captured Telemetry
            </span>
            <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition-transform">
              <Activity className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {Number(kpis.posts_in_range || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] font-bold text-indigo-400">Posts Ingested</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            Multi-source intelligence stream
          </p>
        </Link>
      </div>

      {/* 3. PERISCOPE LIVE DSR SITUATION SCROLLING FEED */}
      <PeriscopeScrollingTicker />

      {/* 4. DUAL INTELLIGENCE COMMAND STAGE (8 COLS + 4 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-w-0">
        {/* LEFT (8 COLS): TELEMETRY DISCOVERY VELOCITY AREA CHART */}
        <div className="lg:col-span-8 min-w-0 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border/60 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground truncate">
                  Telemetry Discovery Velocity & Ingestion Trend
                </h2>
                <p className="text-[11px] text-muted-foreground truncate">
                  Continuous day-by-day surveillance intake ({range} timeframe)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground">Peak:</span>
                <span className="font-bold tabular-nums text-foreground">{trendStats.peak.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground">Avg/Day:</span>
                <span className="font-bold tabular-nums text-foreground">{trendStats.avg.toLocaleString('en-IN')}</span>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs font-semibold text-primary">
                <Link to="/analytics-hub">
                  <span>Deep Analytics</span>
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Area Chart Container */}
          <div className="w-full h-[220px] min-w-0">
            {trendData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-center">
                <Activity className="h-8 w-8 text-muted-foreground/30 mb-1.5" />
                <p className="text-xs font-semibold text-foreground">No Telemetry Recorded in Range</p>
                <p className="text-[11px] text-muted-foreground">Switch range to 30d or All Time to view historical velocity.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) => {
                      try {
                        return format(new Date(val), 'dd MMM');
                      } catch {
                        return val;
                      }
                    }}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value;
                        let formattedDate = label;
                        try {
                          formattedDate = format(new Date(label), 'EEEE, dd MMMM yyyy');
                        } catch {}
                        return (
                          <div className="rounded-lg border border-border/80 bg-popover/95 p-2.5 shadow-md backdrop-blur-xs text-xs">
                            <p className="font-semibold text-foreground">{formattedDate}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-indigo-500 font-bold tabular-nums">
                              <span className="h-2 w-2 rounded-full bg-indigo-500" />
                              {Number(val).toLocaleString('en-IN')} posts ingested
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#telemetryGrad)"
                    activeDot={{ r: 4, stroke: '#6366f1', strokeWidth: 2, fill: 'hsl(var(--background))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* RIGHT (4 COLS): MULTI-PLATFORM INGESTION SHARE */}
        <div className="lg:col-span-4 min-w-0 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border/60 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
                <Globe className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground truncate">
                  Platform Ingestion Share
                </h2>
                <p className="text-[11px] text-muted-foreground truncate">Distribution across social vectors</p>
              </div>
            </div>
            <span className="text-[11px] font-bold tabular-nums text-foreground shrink-0">
              {platforms.length} Platforms
            </span>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-around">
            {platforms.slice(0, 5).map((p) => {
              const count = Number(p.posts_count) || 0;
              const pct = totalPlatformPosts > 0 ? ((count / totalPlatformPosts) * 100).toFixed(1) : 0;
              const isX = p.slug === 'x' || p.slug === 'twitter';
              const isYt = p.slug === 'youtube';
              const isFb = p.slug === 'facebook';
              const isIg = p.slug === 'instagram';
              const isTg = p.slug === 'telegram';

              const barColor = isX
                ? 'bg-foreground'
                : isYt
                ? 'bg-[#FF0000]'
                : isFb
                ? 'bg-[#1877F2]'
                : isIg
                ? 'bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]'
                : isTg
                ? 'bg-[#229ED9]'
                : 'bg-primary';

              return (
                <div key={p.slug} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <PlatformBrandIcon platform={p.slug} className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-bold text-foreground truncate">{p.name || p.slug}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="text-[11px] font-bold text-foreground">{count.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-muted-foreground font-semibold">({pct}%)</span>
                    </div>
                  </div>
                  {/* Custom Colored Progress Bar */}
                  <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${Number(pct) > 0 ? Math.max(3, Math.min(100, Number(pct))) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{p.accounts || 0} monitored profiles</span>
                    <Link
                      to={`/social-profiles?platform=${p.slug}`}
                      className="text-primary hover:underline font-medium"
                    >
                      View catalog →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. 3-LEVEL STRATEGIC DIAGNOSTICS (3 STRIP CARDS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. PUBLIC SENTIMENT INDEX */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Public Sentiment Index
                </h3>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  sentimentStats.net_score >= 0
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                )}
              >
                {sentimentStats.net_score >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {sentimentStats.net_score >= 0 ? '+' : ''}{sentimentStats.net_score}% Net
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Sentiment tone classified across ingested public telemetry
            </p>

            {/* Segmented Stacked Bar */}
            <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted/60 mb-3">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${sentimentStats.positive_pct || 0}%` }}
                title={`Positive: ${sentimentStats.positive_pct}%`}
              />
              <div
                className="bg-slate-400 dark:bg-slate-500 transition-all"
                style={{ width: `${sentimentStats.neutral_pct || 0}%` }}
                title={`Neutral/News: ${sentimentStats.neutral_pct}%`}
              />
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${sentimentStats.negative_pct || 0}%` }}
                title={`Negative: ${sentimentStats.negative_pct}%`}
              />
            </div>

            {/* Legend & Counts */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  Positive
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {sentimentStats.positive || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{sentimentStats.positive_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-500/5 border border-slate-500/15">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  Neutral / News
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {sentimentStats.neutral || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{sentimentStats.neutral_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/15">
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">
                  Negative
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {sentimentStats.negative || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{sentimentStats.negative_pct || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Positive = Approval • Negative = Backlash</span>
            <Link to="/analytics-hub" className="text-primary font-semibold hover:underline">
              Analyze →
            </Link>
          </div>
        </div>

        {/* 2. NARRATIVE STANCE ASSESSMENT */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Narrative Stance Assessment
                </h3>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  (stanceStats.favourable_pct || 0) >= (stanceStats.unfavourable_pct || 0)
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                )}
              >
                {stanceStats.favourable_pct || 0}% Favourable
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Pro-establishment alignment vs dissenting social narratives
            </p>

            {/* Segmented Stacked Bar */}
            <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted/60 mb-3">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${stanceStats.favourable_pct || 0}%` }}
                title={`Favourable: ${stanceStats.favourable_pct}%`}
              />
              <div
                className="bg-slate-400 dark:bg-slate-500 transition-all"
                style={{ width: `${stanceStats.neutral_pct || 0}%` }}
                title={`Neutral: ${stanceStats.neutral_pct}%`}
              />
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${stanceStats.unfavourable_pct || 0}%` }}
                title={`Unfavourable: ${stanceStats.unfavourable_pct}%`}
              />
            </div>

            {/* Legend & Counts */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  Favourable
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {stanceStats.favourable || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{stanceStats.favourable_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-500/5 border border-slate-500/15">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  Neutral
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {stanceStats.neutral || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{stanceStats.neutral_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/15">
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">
                  Unfavourable
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {stanceStats.unfavourable || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{stanceStats.unfavourable_pct || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Favourable = Supported • Unfavourable = Anti</span>
            <Link to="/analytics-hub" className="text-primary font-semibold hover:underline">
              Analyze →
            </Link>
          </div>
        </div>

        {/* 3. THREAT RISK CLASSIFICATION */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Threat Risk Classification
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {criticalCount + highCount} Elevated
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Operational urgency breakdown across alerts and social vectors
            </p>

            {/* Segmented Stacked Bar */}
            <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted/60 mb-3">
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${riskStats.high_pct || 0}%` }}
                title={`Critical/High: ${riskStats.high_pct}%`}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${riskStats.medium_pct || 0}%` }}
                title={`Medium: ${riskStats.medium_pct}%`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${riskStats.low_pct || 0}%` }}
                title={`Low: ${riskStats.low_pct}%`}
              />
            </div>

            {/* Legend & Counts */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/15">
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">
                  Critical / High
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {riskStats.high || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{riskStats.high_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">
                  Medium
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {riskStats.medium || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{riskStats.medium_pct || 0}%</span>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  Low
                </span>
                <span className="text-xs font-black tabular-nums text-foreground block mt-0.5">
                  {riskStats.low || 0}
                </span>
                <span className="text-[9px] text-muted-foreground">{riskStats.low_pct || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>High = Urgent triage • Low = Routine monitoring</span>
            <Link to="/alerts" className="text-primary font-semibold hover:underline">
              Alerts queue →
            </Link>
          </div>
        </div>
      </div>

      {/* 6. OPERATIONAL ACTION GRID (TARGET PROFILES WATCHLIST + VIRAL NARRATIVES) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-w-0">
        {/* LEFT (6 COLS): TARGET PROFILES WATCHLIST */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Top Target Profiles Watchlist
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Highest engagement & threat activity in {range}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Link to="/social-profiles">
                <span>Full Catalog</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>

          {topProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Radio className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs font-bold text-foreground">No Profile Telemetry in Range</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Profiles ingested during this timeframe will appear with live engagement scores.
              </p>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs mt-3">
                <Link to="/social-profiles">Browse All Monitored Profiles</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {topProfiles.slice(0, 6).map((row, idx) => {
                const rankColor =
                  idx === 0
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40'
                    : idx === 1
                    ? 'bg-slate-400/20 text-slate-700 dark:text-slate-300 border-slate-400/40'
                    : idx === 2
                    ? 'bg-amber-700/20 text-amber-800 dark:text-amber-500 border-amber-700/40'
                    : 'bg-muted text-muted-foreground border-border/50';

                return (
                  <div
                    key={row.account_id || row.handle || idx}
                    className="group relative flex flex-col justify-between p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all shadow-2xs hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span
                          className={cn(
                            'h-5 w-5 rounded border flex items-center justify-center text-[10px] font-black shrink-0 tabular-nums',
                            rankColor
                          )}
                        >
                          #{idx + 1}
                        </span>

                        {/* Avatar with Platform Indicator */}
                        <div className="relative shrink-0">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center font-bold text-xs uppercase text-primary">
                            {(row.display_name || row.handle || '?').charAt(0)}
                          </div>
                          <div
                            className={cn(
                              'absolute -bottom-1 -right-1 h-[18px] w-[18px] rounded-full border-2 border-background flex items-center justify-center shadow-xs',
                              PLATFORM_BRAND_BG[String(row.platform || '').toLowerCase()] || PLATFORM_BRAND_BG.all
                            )}
                          >
                            <PlatformBrandIcon platform={row.platform} colored={false} className="h-2.5 w-2.5 text-white" />
                          </div>
                        </div>

                        {/* Name & Handle */}
                        <div className="min-w-0">
                          <p
                            className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors"
                            title={row.display_name || row.handle}
                          >
                            {row.display_name || row.handle}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate font-mono">
                            @{row.handle}
                          </p>
                        </div>
                      </div>

                      {/* Impact Score */}
                      <div className="flex flex-col items-end shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {formatScore(row.score)} pts
                        </span>
                        <span className="text-[9px] text-muted-foreground mt-0.5">
                          {Number(row.posts || 0).toLocaleString('en-IN')} posts
                        </span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2 text-[10px]">
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Target
                      </span>

                      <Button asChild size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/10">
                        <Link to={row.account_id ? `/social-profiles/${row.account_id}` : `/social-profiles?search=${encodeURIComponent(row.handle || '')}`}>
                          <span>Dossier</span>
                          <ArrowUpRight className="h-2.5 w-2.5 ml-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT (6 COLS): BREAKING VIRAL SOCIAL VECTORS */}
        <div className="lg:col-span-6 rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Breaking Viral Social Vectors
                </h3>
                <p className="text-[11px] text-muted-foreground">High virality narratives & public posts</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500/10 text-orange-500 border border-orange-500/20">
              Live Stream
            </span>
          </div>

          {topPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <TrendingUp className="h-8 w-8 text-muted-foreground/30 mb-1.5" />
              <p className="text-xs font-bold text-foreground">No Viral Posts Recorded in Range</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Posts captured across monitored platforms will appear here with virality scores.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topPosts.slice(0, 4).map((post, idx) => (
                <div
                  key={post.id || idx}
                  className="p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlatformBrandIcon platform={post.platform} className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-bold text-xs text-foreground truncate">
                        {post.author_name || post.author_handle || 'Unknown Author'}
                      </span>
                      {post.author_handle && (
                        <span className="text-[10px] text-muted-foreground font-mono truncate">
                          @{post.author_handle}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20">
                        {formatScore(post.score)} Virality
                      </span>
                      {post.url && (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-5 w-5 rounded bg-muted border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                          title="Open original"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed">
                    {post.text || '—'}
                  </p>

                  <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Captured {formatTimeAgo(post.posted_at || post.fetched_at)}</span>
                    <Link
                      to={post.account_id ? `/social-profiles/${post.account_id}` : `/social-profiles?search=${encodeURIComponent(post.author_handle || '')}`}
                      className="font-bold text-primary hover:underline"
                    >
                      Investigate Profile →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 7. OPERATIONAL TRIAGE & QUICK OSINT LAUNCHPAD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* GRIEVANCE TRIAGE */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-border/60">
              <div className="flex items-center gap-1.5">
                <MessageSquareWarning className="h-3.5 w-3.5 text-orange-500" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Grievance Redressal Status
                </h3>
              </div>
              <Link to="/grievances" className="text-[11px] font-bold text-primary hover:underline">
                Portal →
              </Link>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <span className="text-muted-foreground font-medium">Pending Initial Review</span>
                <span className="font-bold tabular-nums text-foreground">{grievReports.pending_count || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <span className="text-muted-foreground font-medium">Under Active Investigation</span>
                <span className="font-bold tabular-nums text-foreground">{grievReports.under_investigation || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <span className="text-muted-foreground font-medium">Escalated to Intermediary</span>
                <span className="font-bold tabular-nums text-orange-500">{grievReports.sent_to_intermediary || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <span className="text-muted-foreground font-medium">Successfully Resolved</span>
                <span className="font-bold tabular-nums text-emerald-500">{grievReports.resolved_count || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PERISCOPE SITUATION REPORT SUMMARY */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-border/60">
              <div className="flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-blue-500" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Periscope DSR Situation
                </h3>
              </div>
              <Link to="/periscope" className="text-[11px] font-bold text-primary hover:underline">
                Open DSR →
              </Link>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-foreground">Daily Intelligence Feed</span>
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Special Branch</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Official Special Branch Daily Situation Report tracking VIP schedules, political rallies, sensitive zones and bandhs.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/periscope">
                    <Compass className="h-3.5 w-3.5 text-blue-500" />
                    <span>View Today's DSR</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/events">
                    <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Event Probes</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* TACTICAL OSINT LAUNCHPAD */}
        <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-border/60">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-indigo-400" />
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                  Tactical OSINT Launchpad
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/global-search">
                  <Search className="h-3.5 w-3.5 text-primary" />
                  <span>Global Search</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/person-of-interest">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>POI Watchlist</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/social-profiles">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  <span>Profile Catalog</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/analytics-hub">
                  <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Analytics Hub</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/web-intelligence">
                  <Globe className="h-3.5 w-3.5 text-sky-500" />
                  <span>Web Intel</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 justify-start text-xs gap-1.5">
                <Link to="/dial-100-incident-reporting">
                  <Activity className="h-3.5 w-3.5 text-amber-500" />
                  <span>Dial 100 Police</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. SUPERADMIN CONSOLE
// ==========================================
const SuperadminView = ({ data, loading, refreshing, onRefresh }) => {
  const admins = data?.admins || [];
  return (
    <div className="w-full space-y-4 pb-8 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
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

// ==========================================
// 4. ROOT EXPORT COMPONENT
// ==========================================
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
      <SuperadminView
        data={consoleData}
        loading={loading}
        refreshing={refreshing}
        onRefresh={() => loadConsole({ silent: true })}
      />
    );
  }

  return <OperationsDashboard />;
};

export default Dashboard;
