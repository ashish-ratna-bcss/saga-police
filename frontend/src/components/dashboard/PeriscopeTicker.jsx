import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio,
  ArrowUpRight,
  MapPin,
  Users,
  Clock,
  ShieldAlert,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Eye,
  Building2,
  FileText,
} from 'lucide-react';
import { periscopeApi } from '../../api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../../lib/utils';

// Dynamic permission badge styling
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
  if (s.includes('gov') || s.includes('official') || s.includes('vip') || s.includes('department') || s.includes('institution')) {
    return {
      badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 font-medium',
      dot: 'bg-blue-500',
      label: status,
    };
  }
  if (s.includes('info') || s.includes('public') || s.includes('intimation') || s.includes('reported')) {
    return {
      badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-medium',
      dot: 'bg-amber-500',
      label: status,
    };
  }
  if (s.includes('court') || s.includes('legal') || s.includes('stay') || s.includes('verif')) {
    return {
      badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 font-medium',
      dot: 'bg-purple-500',
      label: status,
    };
  }
  return {
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
    label: status,
  };
}

export default function PeriscopeTicker() {
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

  // Active pause state: user-paused, mouse-hovered, temporary manual navigation pause, or modal open
  const isScrollPaused = isPaused || isHovered || isTemporarilyPaused || Boolean(selectedProgramme);
  const pausedRef = useRef(isScrollPaused);
  pausedRef.current = isScrollPaused;

  useEffect(() => {
    let isMounted = true;
    const loadFeed = async () => {
      try {
        const res = await periscopeApi.getFeed();
        if (isMounted && res.data?.ok && res.data.data) {
          setFeed(res.data.data);
        }
      } catch (err) {
        // Fallback gracefully
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

  // Pause auto-scroll temporarily after manual navigation so user can read card comfortably
  const pauseAutoScrollTemporarily = (durationMs = 7000) => {
    setIsTemporarilyPaused(true);
    if (tempPauseTimerRef.current) {
      clearTimeout(tempPauseTimerRef.current);
    }
    tempPauseTimerRef.current = setTimeout(() => {
      setIsTemporarilyPaused(false);
    }, durationMs);
  };

  const scrollPosRef = useRef(0);

  // Continuous forward auto-scroll ticker with subpixel accuracy
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || programmes.length <= 1) return;

    let animId;
    let lastTime = performance.now();
    let isResetting = false;
    const speed = 75; // Fast continuous ticker speed in px/sec
    scrollPosRef.current = el.scrollLeft;

    const step = (now) => {
      const delta = Math.min((now - lastTime) / 1000, 0.1); // clamp delta to prevent frame spikes
      lastTime = now;

      if (!pausedRef.current && el && !isResetting) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 10) {
          if (el.scrollLeft >= maxScroll - 2) {
            // Reached the end: pause for 2 seconds, then smoothly return to Card 1
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
            }, 1800);
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

  // Smooth, user-friendly card-by-card navigation without jumps or teleporting
  const handleManualScroll = (direction) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    pauseAutoScrollTemporarily(7000);

    const stepSize = 390; // Exact card width + margin gap
    const maxScroll = el.scrollWidth - el.clientWidth;

    if (direction === 'left') {
      if (el.scrollLeft <= 15) {
        // At Card 1: smoothly loop to the end
        el.scrollTo({ left: maxScroll, behavior: 'smooth' });
        scrollPosRef.current = maxScroll;
      } else {
        el.scrollBy({ left: -stepSize, behavior: 'smooth' });
        scrollPosRef.current = Math.max(0, el.scrollLeft - stepSize);
      }
    } else {
      if (el.scrollLeft >= maxScroll - 15) {
        // At the last card: smoothly return to Card 1
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
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-44 bg-muted rounded-md" />
          <div className="h-5 w-24 bg-muted rounded-md" />
        </div>
        <div className="flex gap-3 overflow-hidden py-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 w-[360px] bg-muted/50 rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Radio className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                Periscope DSR Live Events
              </h2>
              <p className="text-[11px] text-muted-foreground">Daily Situation Radar</p>
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary hover:text-primary">
            <Link to="/periscope">
              Open Module <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        </header>
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No situation report recorded for today ({feed.report_date || 'Today'}). Upload an official DOCX or add programmes in Periscope.
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="relative flex flex-col rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden group/ticker">
        {/* Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/25 px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            {/* Pulsing radar icon */}
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-2xs">
              <Radio className="h-3.5 w-3.5" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold leading-tight text-foreground">
                  Periscope DSR Live Radar
                </h2>

                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Continuous Feed
                </span>

                {highPriorityCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-[10px] font-bold py-0.2 px-2 gap-1 shadow-2xs animate-pulse"
                  >
                    <ShieldAlert className="h-2.5 w-2.5" />
                    {highPriorityCount} High Alert
                  </Badge>
                )}

                <span className="text-[11px] font-medium text-muted-foreground tabular-nums bg-background/80 px-2 py-0.5 rounded-md border border-border/50">
                  {feed.total} Scheduled Today
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3 w-3 text-muted-foreground/70" />
                <span className="truncate">
                  {feed.organization ? `${feed.organization} • ` : ''}Date: {feed.report_date}
                </span>
                {isTemporarilyPaused && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium ml-2">
                    (Auto-scroll paused for reading)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Toolbar Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-lg bg-background/80 border border-border/60 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setIsPaused((prev) => !prev);
                  setIsTemporarilyPaused(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title={isPaused ? 'Resume live continuous scroll' : 'Pause scrolling'}
              >
                {isPaused ? (
                  <Play className="h-3 w-3 text-emerald-600 fill-emerald-600" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </button>
              <div className="h-3 w-[1px] bg-border/60 mx-0.5" />
              <button
                type="button"
                onClick={() => handleManualScroll('left')}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Scroll previous card"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleManualScroll('right')}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Scroll next card"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <Link
              to="/periscope"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary hover:underline px-1 py-1"
            >
              Full DSR <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        {/* Floating Side Navigation Arrows for effortless manual scrolling */}
        <button
          type="button"
          onClick={() => handleManualScroll('left')}
          className="absolute left-2.5 top-[58%] -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-background/90 hover:bg-background shadow-md border border-border/80 flex items-center justify-center text-foreground hover:text-primary transition-all hover:scale-105 active:scale-95 focus:outline-none"
          title="Scroll Left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => handleManualScroll('right')}
          className="absolute right-2.5 top-[58%] -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-background/90 hover:bg-background shadow-md border border-border/80 flex items-center justify-center text-foreground hover:text-primary transition-all hover:scale-105 active:scale-95 focus:outline-none"
          title="Scroll Right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Ticker Track with Soft Edge Masks */}
        <div className="relative bg-muted/10 px-2 py-3.5 overflow-hidden">
          {/* Edge fade gradients */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-card via-card/70 to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-card via-card/70 to-transparent z-10" />

          <div
            ref={scrollContainerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            className="relative w-full overflow-x-auto no-scrollbar select-text px-4 [&::-webkit-scrollbar]:hidden will-change-scroll"
          >
            <div
              className="flex items-stretch gap-3.5 py-0.5"
              style={{ width: 'max-content' }}
            >
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
                      'group relative w-[370px] sm:w-[390px] shrink-0 rounded-xl border p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer',
                      'bg-card shadow-2xs hover:shadow-md hover:-translate-y-0.5',
                      isHigh
                        ? 'border-rose-500/40 bg-gradient-to-b from-rose-500/[0.04] to-transparent hover:border-rose-500/70'
                        : isMedium
                        ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/[0.04] to-transparent hover:border-amber-500/70'
                        : 'border-border/75 hover:border-primary/50'
                    )}
                  >
                    <div>
                      {/* Top Row: Priority Pill, Zone & Schedule */}
                      <div className="flex items-center justify-between gap-1.5 mb-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded border border-border/50">
                            #{index + 1}
                          </span>

                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border',
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
                              className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40 truncate max-w-[130px]"
                              title={p.zone}
                            >
                              {p.zone}
                            </span>
                          )}
                        </div>

                        {p.time && (
                          <span
                            className="text-[11px] font-medium text-muted-foreground shrink-0 inline-flex items-center gap-1.5 bg-muted/40 px-2 py-0.5 rounded border border-border/30 max-w-[160px]"
                            title={`Timing: ${p.time}`}
                          >
                            <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                            <span className="truncate">{p.time}</span>
                          </span>
                        )}
                      </div>

                      {/* Programme Name with clear typography */}
                      <h3
                        className="font-bold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug tracking-tight mb-2"
                        title={p.name}
                      >
                        {p.name}
                      </h3>

                      {/* Category Tag */}
                      {p.category && (
                        <div className="mb-2.5">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 max-w-full truncate"
                            title={p.category}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="truncate">{p.category}</span>
                          </span>
                        </div>
                      )}

                      {/* Clear Information Block: Venue & Organizer */}
                      <div className="space-y-1.5 text-xs text-muted-foreground mb-3 bg-muted/20 p-2.5 rounded-lg border border-border/40">
                        {p.police_station_place && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                            <div className="leading-snug text-foreground/90 font-normal">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Venue / Police Station
                              </span>
                              <span className="line-clamp-2">{p.police_station_place}</span>
                            </div>
                          </div>
                        )}

                        {p.organizer && (
                          <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                            <div className="leading-snug text-foreground/90 font-normal">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Organizer / Group
                              </span>
                              <span className="line-clamp-2">{p.organizer}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: Expected Turnout & Permission Status */}
                    <div className="pt-2.5 border-t border-border/50 flex flex-col gap-2">
                      {/* Expected Turnout Box */}
                      {p.expected_members && p.expected_members.toLowerCase() !== 'not specified' ? (
                        <div className="flex items-center gap-1.5 text-xs bg-muted/40 px-2.5 py-1.5 rounded-md border border-border/40 text-foreground/90">
                          <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-muted-foreground text-[10px] uppercase">
                            Turnout:
                          </span>
                          <span className="truncate font-medium" title={p.expected_members}>
                            {p.expected_members}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5 px-1">
                          <Users className="h-3 w-3" />
                          <span>Turnout: Not specified</span>
                        </div>
                      )}

                      {/* Bottom status + Quick Details Trigger */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border truncate max-w-[220px]',
                            permMeta.badge
                          )}
                          title={`Permission Status: ${p.permission_status || 'Not specified'}`}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', permMeta.dot)} />
                          <span className="truncate">{p.permission_status || 'Not specified'}</span>
                        </span>

                        <span className="text-[11px] font-semibold text-primary group-hover:underline inline-flex items-center gap-0.5 shrink-0">
                          View details <Eye className="h-3 w-3" />
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

      {/* Instant Event Detail Modal for Full Clear Inspection */}
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
                    <Building2 className="h-3.5 w-3.5 text-primary" /> Organizer / Organizations
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


