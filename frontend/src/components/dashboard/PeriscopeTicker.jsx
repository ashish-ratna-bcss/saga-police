import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  ArrowUpRight,
  MapPin,
  Users,
  Clock,
  ShieldAlert,
  AlertCircle,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
import { periscopeApi } from '../../api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export default function PeriscopeTicker() {
  const [feed, setFeed] = useState({
    programmes: [],
    report_date: '',
    organization: '',
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const loadFeed = async () => {
      try {
        const res = await periscopeApi.getFeed({ limit: 40 });
        if (isMounted && res.data?.ok && res.data.data) {
          setFeed(res.data.data);
        }
      } catch (err) {
        // Ignorable if no permission or network
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadFeed();
    return () => {
      isMounted = false;
    };
  }, []);

  const programmes = feed.programmes || [];

  const highPriorityCount = useMemo(() => {
    return programmes.filter(
      (p) => String(p.priority || '').toLowerCase() === 'high'
    ).length;
  }, [programmes]);

  // Duplicate list for seamless infinite loop ticker
  const displayItems = useMemo(() => {
    if (programmes.length === 0) return [];
    if (programmes.length < 5) {
      return [...programmes, ...programmes, ...programmes, ...programmes];
    }
    return [...programmes, ...programmes];
  }, [programmes]);

  const handleManualScroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-48 bg-muted rounded-md" />
          <div className="h-5 w-24 bg-muted rounded-md" />
        </div>
        <div className="flex gap-3 overflow-hidden py-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 w-72 bg-muted/60 rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <Eye className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-heading font-bold tracking-tight text-foreground">
                Periscope DSR Live Events
              </h2>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-semibold">
                Daily Situation Report
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              No situation report programmes recorded yet. Upload an official DOCX or add programmes in Periscope.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0">
          <Link to="/periscope">
            <Eye className="h-3.5 w-3.5 text-primary" />
            Open Periscope DSR
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <Eye className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-heading font-bold tracking-tight text-foreground flex items-center gap-1.5">
                Periscope DSR Live Events
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5 bg-primary/5 text-primary border-primary/20"
              >
                Continuous Feed
              </Badge>
              {highPriorityCount > 0 && (
                <Badge
                  variant="destructive"
                  className="text-[10px] font-bold py-0 px-1.5 gap-1 shadow-2xs"
                >
                  <ShieldAlert className="h-2.5 w-2.5" />
                  {highPriorityCount} High Priority
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground tabular-nums">
                • {feed.total} Scheduled
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {feed.organization || 'Special Branch Police'} • Report Date: {feed.report_date}
            </p>
          </div>
        </div>

        {/* Controls & Nav */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setIsPaused((prev) => !prev)}
            title={isPaused ? 'Resume scrolling' : 'Pause scrolling'}
          >
            {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-600" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => handleManualScroll('left')}
            title="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => handleManualScroll('right')}
            title="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1 ml-1 px-2.5">
            <Link to="/periscope">
              View DSR <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Marquee Track Container */}
      <div
        ref={scrollContainerRef}
        className="relative w-full overflow-x-auto no-scrollbar scroll-smooth"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          className={cn(
            'flex items-stretch gap-3 py-1',
            !isPaused && 'animate-marquee'
          )}
          style={{ width: 'max-content' }}
        >
          {displayItems.map((p, index) => {
            const priorityLower = String(p.priority || 'low').toLowerCase();
            const isHigh = priorityLower === 'high';
            const isMedium = priorityLower === 'medium';

            return (
              <div
                key={`${p.id || p.sl_no}-${index}`}
                className={cn(
                  'w-[300px] sm:w-[320px] shrink-0 rounded-xl border bg-card/90 p-3 flex flex-col justify-between transition-all shadow-xs hover:shadow-md hover:border-primary/50',
                  isHigh
                    ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/20 dark:bg-rose-950/20'
                    : isMedium
                    ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20'
                    : 'border-border/70 hover:bg-muted/20'
                )}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] font-bold uppercase tracking-wider py-0 px-1.5 rounded-md shrink-0 border',
                          isHigh
                            ? 'bg-rose-500 text-white border-rose-600 dark:bg-rose-600'
                            : isMedium
                            ? 'bg-amber-500 text-white border-amber-600 dark:bg-amber-600'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                        )}
                      >
                        {p.priority || 'Low'}
                      </Badge>
                      {p.zone && (
                        <span className="text-[10px] font-semibold text-muted-foreground truncate bg-muted/60 px-1.5 py-0.5 rounded">
                          {p.zone}
                        </span>
                      )}
                    </div>
                    {p.time && (
                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5 text-primary" /> {p.time}
                      </span>
                    )}
                  </div>

                  {/* Programme Name */}
                  <Link
                    to="/periscope"
                    className="font-bold text-xs text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug"
                    title={p.name}
                  >
                    {p.name}
                  </Link>

                  {/* Category tag */}
                  {p.category && (
                    <div className="mt-1">
                      <span className="text-[9px] font-semibold text-primary/80 uppercase tracking-wide bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                        {p.category}
                      </span>
                    </div>
                  )}

                  {/* Location & Organizer */}
                  <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    {p.police_station_place && (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                        <span className="truncate">{p.police_station_place}</span>
                      </div>
                    )}
                    {p.organizer && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Users className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                        <span className="truncate">{p.organizer}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer status */}
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground font-medium truncate">
                    {p.permission_status || 'Publicly reported'}
                  </span>
                  {p.expected_members && (
                    <span className="tabular-nums font-semibold text-foreground shrink-0">
                      👥 {p.expected_members}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
