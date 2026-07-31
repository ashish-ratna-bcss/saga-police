import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { CalendarDays, Loader2, ArrowRight, MapPin, Clock, Users, User, FileText, ShieldAlert } from 'lucide-react';
import { Badge } from '../ui/badge';

const MOCK_EVENTS = [
  { id: 'm1', programName: 'CM Public Meeting at Town Hall', category: 'category1', zone: 'Central', location: 'Town Hall, MG Road', organizer: 'District Administration', time: '10:00 AM', expectedMembers: 5000, gist: 'Chief Minister addressing public on development schemes' },
  { id: 'm2', programName: 'Protest at District Collectorate', category: 'category2', zone: 'North', location: 'Collectorate Gate', organizer: 'Workers Union', time: '11:30 AM', expectedMembers: 200, gist: 'Demanding wage revision' },
  { id: 'm3', programName: 'Religious Procession - Main St.', category: 'category3', zone: 'South', location: 'Main Street to Temple', organizer: 'Temple Committee', time: '04:00 PM', expectedMembers: 1500, gist: 'Annual religious festival procession' },
  { id: 'm4', programName: 'Tech Summit Inauguration', category: 'category2', zone: 'West', location: 'Convention Centre', organizer: 'IT Association', time: '09:00 AM', expectedMembers: 300, gist: 'Technology summit with industry leaders' },
  { id: 'm5', programName: 'Traffic Awareness Campaign', category: 'category1', zone: 'East', location: 'RTC Cross Roads', organizer: 'Traffic Police', time: '08:00 AM', expectedMembers: 50, gist: 'Road safety awareness drive' },
];

const MIN_LOOP_BASE_ITEMS = 28;

const TodaysEventsWidget = ({ className = '' }) => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef(null);
  const firstSequenceRef = useRef(null);
  const pauseResumeTimerRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [scrollLayoutVersion, setScrollLayoutVersion] = useState(0);
  const [sequenceHeight, setSequenceHeight] = useState(0);

  const baseEvents = useMemo(() => {
    if (!events.length) {
      return [];
    }

    const targetCount = Math.max(events.length, MIN_LOOP_BASE_ITEMS);
    const items = [];

    for (let sequenceIndex = 0; sequenceIndex < targetCount; sequenceIndex += 1) {
      const eventIndex = sequenceIndex % events.length;
      const event = events[eventIndex];

      items.push({
        event,
        key: `${event?.id || eventIndex}-base-${sequenceIndex}`
      });
    }

    return items;
  }, [events]);

  const getTodayDate = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const categoryMap = {
    category1: 'GOVT',
    category2: 'OTHER',
    category3: 'RELIGIOUS',
    category4: 'ONGOING'
  };

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await api.get(`/daily-programmes?date=${getTodayDate()}`);
        const data = response.data;

        const apiEvents = [
          ...data.programmes.category1,
          ...data.programmes.category2,
          ...data.programmes.category3,
          ...data.programmes.category4,
        ];

        if (apiEvents.length > 0) {
          setEvents(apiEvents);
        } else {
          setEvents(MOCK_EVENTS);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents(MOCK_EVENTS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let frameId = 0;
    const bumpLayoutVersion = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setScrollLayoutVersion(v => v + 1);
      });
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(bumpLayoutVersion);
      resizeObserver.observe(scrollContainer);
      if (scrollContainer.firstElementChild) {
        resizeObserver.observe(scrollContainer.firstElementChild);
      }
    }

    window.addEventListener('resize', bumpLayoutVersion);
    bumpLayoutVersion();

    return () => {
      window.removeEventListener('resize', bumpLayoutVersion);
      if (resizeObserver) resizeObserver.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [baseEvents.length]);

  useEffect(() => {
    const measure = () => {
      const height = firstSequenceRef.current?.offsetHeight || 0;
      setSequenceHeight(height);
    };

    let frameId = requestAnimationFrame(measure);
    let resizeObserver = null;

    if (typeof ResizeObserver !== 'undefined' && firstSequenceRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(measure);
      });
      resizeObserver.observe(firstSequenceRef.current);
    }

    window.addEventListener('resize', measure);
    measure();

    return () => {
      window.removeEventListener('resize', measure);
      if (resizeObserver) resizeObserver.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [baseEvents.length, scrollLayoutVersion]);

  useEffect(() => {
    return () => {
      if (pauseResumeTimerRef.current) {
        clearTimeout(pauseResumeTimerRef.current);
      }
    };
  }, []);

  const temporarilyPauseScroll = () => {
    setIsPaused(true);

    if (pauseResumeTimerRef.current) {
      clearTimeout(pauseResumeTimerRef.current);
    }

    pauseResumeTimerRef.current = setTimeout(() => {
      setIsPaused(false);
      pauseResumeTimerRef.current = null;
    }, 1400);
  };

  const resumeScrollNow = () => {
    if (pauseResumeTimerRef.current) {
      clearTimeout(pauseResumeTimerRef.current);
      pauseResumeTimerRef.current = null;
    }
    setIsPaused(false);
  };

  const pauseOnHover = () => {
    if (pauseResumeTimerRef.current) {
      clearTimeout(pauseResumeTimerRef.current);
      pauseResumeTimerRef.current = null;
    }
    setIsPaused(true);
  };

  // Auto-scroll logic with seamless loop for consistent behavior across screen sizes
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || isPaused) return;

    const loopHeight = sequenceHeight > 2
      ? sequenceHeight
      : Math.max(0, (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2);
    if (loopHeight <= 2) return;

    const SCROLL_SPEED_PX_PER_SEC = Math.max(18, Math.min(34, scrollContainer.clientHeight * 0.06));
    let animationFrameId;
    let lastTimestamp = 0;
    let virtualPos = scrollContainer.scrollTop;
    let prevAppliedPos = scrollContainer.scrollTop;
    let stalledFrames = 0;

    const scroll = (timestamp) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaMs = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const increment = (SCROLL_SPEED_PX_PER_SEC * deltaMs) / 1000;
      virtualPos += increment;
      if (virtualPos >= loopHeight) {
        virtualPos -= loopHeight;
      }

      scrollContainer.scrollTop = virtualPos;

      const appliedPos = scrollContainer.scrollTop;
      if (Math.abs(appliedPos - prevAppliedPos) < 0.01) {
        stalledFrames += 1;
      } else {
        stalledFrames = 0;
      }

      if (stalledFrames > 8) {
        const nudged = appliedPos >= loopHeight ? appliedPos - loopHeight : appliedPos + 1;
        scrollContainer.scrollTop = nudged;
        virtualPos = scrollContainer.scrollTop;
        stalledFrames = 0;
      }

      prevAppliedPos = scrollContainer.scrollTop;

      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused, sequenceHeight, scrollLayoutVersion]);

  const totalCount = events.length;

  const categoryColors = {
    category1: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
    category2: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
    category3: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' },
    category4: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
  };

  return (
    <div className={`flex-1 bg-gradient-to-br from-card via-card to-indigo-500/5 rounded-xl border border-border/5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col min-h-0 ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border-b border-border/5 p-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm">
              LIVE
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded animate-pulse opacity-50"></div>
          </div>
          <div className="p-1 bg-indigo-500/10 rounded-lg">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-xs font-bold"> Periscope Ongoing Events</span>
          <Badge variant="secondary" className="text-[10px] bg-black-500/10 text-indigo-600 dark:text-black-800 border-black-500/0">{totalCount}</Badge>
        </div>
        <Link to="/announcements" className="text-[10px] text-black-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Scrolling Event List */}
      <div className="flex-1 min-h-0 bg-card relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <CalendarDays className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">No events for today</p>
            <Link to="/announcements" className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              + Add Events
            </Link>
          </div>
        ) : (
          <div
            className="h-full min-h-0 overflow-y-auto custom-scrollbar"
            ref={scrollRef}
            onMouseEnter={pauseOnHover}
            onWheel={temporarilyPauseScroll}
            onTouchStart={temporarilyPauseScroll}
            onMouseLeave={resumeScrollNow}
          >
            <div className="p-2">
              <div ref={firstSequenceRef} className="space-y-2">
                {baseEvents.map(({ event, key }) => {
                  const colors = categoryColors[event.category] || categoryColors.category2;
                  return (
                    <div
                      key={`${key}-loop-0`}
                      className={`rounded-lg border ${event.isHighPriority ? 'bg-red-50 dark:bg-red-900/20 border-l-[4px] border-red-500/30 border-l-red-600' : `${colors.border} ${colors.bg}`} p-2.5 hover:shadow-md transition-all cursor-pointer group`}
                    >
                      {/* Row 1: Category badge + HIGH badge + Program Name */}
                      <div className="flex items-start gap-2 mb-1.5">
                        <Badge variant="outline" className={`text-[8px] font-bold shrink-0 mt-0.5 ${event.isHighPriority ? 'bg-red-100 text-red-700 border-red-500/30 dark:bg-red-900/40 dark:text-red-300' : `${colors.bg} ${colors.text} ${colors.border}`}`}>
                          {categoryMap[event.category] || 'OTHER'}
                        </Badge>
                        {event.isHighPriority && (
                          <Badge variant="outline" className="text-[8px] font-bold shrink-0 mt-0.5 bg-red-600 text-white border-red-700 animate-pulse gap-0.5">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            HIGH
                          </Badge>
                        )}
                        <p className={`text-xs font-bold leading-snug ${event.isHighPriority ? 'text-red-700 dark:text-red-400' : colors.text} group-hover:underline flex-1`}>
                          {event.programName || 'Untitled Event'}
                        </p>
                      </div>

                      {/* Row 2: Key details grid */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 ml-0.5">
                        {/* Location */}
                        {event.location && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MapPin className="h-2.5 w-2.5 shrink-0 text-red-400" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                        {/* Zone */}
                        {event.zone && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.isHighPriority ? 'bg-red-500' : colors.dot}`}></span>
                            <span className="font-medium">{event.zone}</span>
                          </div>
                        )}
                        {/* Time */}
                        {event.time && (
                          <div className="flex items-center gap-1 text-[10px] text-foreground font-semibold">
                            <Clock className="h-2.5 w-2.5 shrink-0 text-blue-400" />
                            {event.time}
                          </div>
                        )}
                        {/* Expected Members */}
                        {event.expectedMembers > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Users className="h-2.5 w-2.5 shrink-0 text-green-400" />
                            <span className="font-medium">{event.expectedMembers.toLocaleString()}</span>
                            <span className="text-[8px] uppercase tracking-wider">people</span>
                          </div>
                        )}
                        {/* Organizer */}
                        {event.organizer && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground col-span-2">
                            <User className="h-2.5 w-2.5 shrink-0 text-indigo-400" />
                            <span className="truncate">Org: {event.organizer}</span>
                          </div>
                        )}
                      </div>

                      {/* Row 3: Gist (if available) */}
                      {event.gist && (
                        <p className="mt-1 text-[10px] text-muted-foreground leading-snug border-t border-border/30 pt-1 line-clamp-2">
                          <FileText className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5 text-muted-foreground/60" />
                          {event.gist}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                {baseEvents.map(({ event, key }) => {
                const colors = categoryColors[event.category] || categoryColors.category2;
                return (
                  <div
                    key={`${key}-loop-1`}
                    className={`rounded-lg border ${event.isHighPriority ? 'bg-red-50 dark:bg-red-900/20 border-l-[4px] border-red-500/30 border-l-red-600' : `${colors.border} ${colors.bg}`} p-2.5 hover:shadow-md transition-all cursor-pointer group`}
                  >
                    {/* Row 1: Category badge + HIGH badge + Program Name */}
                    <div className="flex items-start gap-2 mb-1.5">
                      <Badge variant="outline" className={`text-[8px] font-bold shrink-0 mt-0.5 ${event.isHighPriority ? 'bg-red-100 text-red-700 border-red-500/30 dark:bg-red-900/40 dark:text-red-300' : `${colors.bg} ${colors.text} ${colors.border}`}`}>
                        {categoryMap[event.category] || 'OTHER'}
                      </Badge>
                      {event.isHighPriority && (
                        <Badge variant="outline" className="text-[8px] font-bold shrink-0 mt-0.5 bg-red-600 text-white border-red-700 animate-pulse gap-0.5">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          HIGH
                        </Badge>
                      )}
                      <p className={`text-xs font-bold leading-snug ${event.isHighPriority ? 'text-red-700 dark:text-red-400' : colors.text} group-hover:underline flex-1`}>
                        {event.programName || 'Untitled Event'}
                      </p>
                    </div>

                    {/* Row 2: Key details grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 ml-0.5">
                      {/* Location */}
                      {event.location && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0 text-red-400" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                      {/* Zone */}
                      {event.zone && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.isHighPriority ? 'bg-red-500' : colors.dot}`}></span>
                          <span className="font-medium">{event.zone}</span>
                        </div>
                      )}
                      {/* Time */}
                      {event.time && (
                        <div className="flex items-center gap-1 text-[10px] text-foreground font-semibold">
                          <Clock className="h-2.5 w-2.5 shrink-0 text-blue-400" />
                          {event.time}
                        </div>
                      )}
                      {/* Expected Members */}
                      {event.expectedMembers > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Users className="h-2.5 w-2.5 shrink-0 text-green-400" />
                          <span className="font-medium">{event.expectedMembers.toLocaleString()}</span>
                          <span className="text-[8px] uppercase tracking-wider">people</span>
                        </div>
                      )}
                      {/* Organizer */}
                      {event.organizer && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground col-span-2">
                          <User className="h-2.5 w-2.5 shrink-0 text-indigo-400" />
                          <span className="truncate">Org: {event.organizer}</span>
                        </div>
                      )}
                    </div>

                    {/* Row 3: Gist (if available) */}
                    {event.gist && (
                      <p className="mt-1 text-[10px] text-muted-foreground leading-snug border-t border-border/30 pt-1 line-clamp-2">
                        <FileText className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5 text-muted-foreground/60" />
                        {event.gist}
                      </p>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.4);
        }
      `}</style>

      {/* Footer */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border-t border-border/50 p-2 flex items-center justify-center shrink-0">
        <Link
          to="/announcements"
          className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          VIEW ALL EVENTS
        </Link>
      </div>
    </div>
  );
};

export default TodaysEventsWidget;
