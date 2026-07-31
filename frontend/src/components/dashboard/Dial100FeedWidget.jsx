import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { ShieldAlert, Loader2, Copy, Image as ImageIcon, Calendar as CalendarIcon, Download, ArrowRight, Filter, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { saveAs } from 'file-saver';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Link } from 'react-router-dom';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";

const MOCK_INCIDENTS = [
    { id: 'd1', dateTime: new Date().toISOString(), incidentCategory: 'Public Disturbance', location: 'Market Area', psJurisdiction: 'Central PS', zoneJurisdiction: 'Central' },
    { id: 'd2', dateTime: new Date(Date.now() - 3600000).toISOString(), incidentCategory: 'Minor Accident', location: 'Highway Junction', psJurisdiction: 'Traffic PS', zoneJurisdiction: 'North' },
    { id: 'd3', dateTime: new Date(Date.now() - 7200000).toISOString(), incidentCategory: 'Noise Complain', location: 'Residential Block B', psJurisdiction: 'West PS', zoneJurisdiction: 'West' },
    { id: 'd4', dateTime: new Date(Date.now() - 10800000).toISOString(), incidentCategory: 'Suspicious Activity', location: 'Park Avenue', psJurisdiction: 'South PS', zoneJurisdiction: 'South' },
    { id: 'd5', dateTime: new Date(Date.now() - 14400000).toISOString(), incidentCategory: 'Fire Alert', location: 'Industrial Zone', psJurisdiction: 'East PS', zoneJurisdiction: 'East' },
];

const MIN_LOOP_BASE_ITEMS = 28;

const Dial100FeedWidget = ({ className = '' }) => {
    const [incidents, setIncidents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const scrollRef = useRef(null);
    const firstSequenceRef = useRef(null);
    const pauseResumeTimerRef = useRef(null);
    const [isPaused, setIsPaused] = useState(false);
    const [scrollLayoutVersion, setScrollLayoutVersion] = useState(0);
    const [sequenceHeight, setSequenceHeight] = useState(0);
    const [date, setDate] = useState(new Date());
    const [category, setCategory] = useState("all");
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        const fetchIncidents = async () => {
            try {
                const dateStr = format(date, 'yyyy-MM-dd');
                const response = await api.get(`/dial100-incidents?date=${dateStr}`);

                let data = response.data?.incidents || [];
                if (data.length === 0) data = MOCK_INCIDENTS;

                // Sort by dateTime descending (latest first)
                const sorted = data.sort((a, b) =>
                    new Date(b.dateTime) - new Date(a.dateTime)
                );
                setIncidents(sorted);

                // Extract unique categories
                const uniqueCategories = [...new Set(sorted.map(i => i.incidentCategory).filter(Boolean))];
                setCategories(uniqueCategories);
            } catch (error) {
                console.error('Error fetching dial100 incidents:', error);
                setIncidents(MOCK_INCIDENTS);
                const uniqueCategories = [...new Set(MOCK_INCIDENTS.map(i => i.incidentCategory).filter(Boolean))];
                setCategories(uniqueCategories);
            } finally {
                setIsLoading(false);
            }
        };

        fetchIncidents();

        let interval;
        if (format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) {
            interval = setInterval(fetchIncidents, 30000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [date]);

    const filteredIncidents = category === "all" 
        ? incidents 
        : incidents.filter(i => i.incidentCategory === category);

    const baseIncidents = useMemo(() => {
        if (!filteredIncidents.length) {
            return [];
        }

        const targetCount = Math.max(filteredIncidents.length, MIN_LOOP_BASE_ITEMS);
        const items = [];

        for (let sequenceIndex = 0; sequenceIndex < targetCount; sequenceIndex += 1) {
            const incidentIndex = sequenceIndex % filteredIncidents.length;
            const incident = filteredIncidents[incidentIndex];

            items.push({
                incident,
                incidentIndex,
                key: `${incident?.id || incident?._id || incidentIndex}-base-${sequenceIndex}`
            });
        }

        return items;
    }, [filteredIncidents]);

    
    // Reset to top when filter changes
    useEffect(() => {
        if(scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [category, filteredIncidents.length]);

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
    }, [baseIncidents.length]);

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
    }, [baseIncidents.length, scrollLayoutVersion]);

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

    const getMediaUrl = (file) => (typeof file === 'string' ? file : file.url || file.secure_url || '');

    const formatIncidentText = (incident, index) => {
        if (!incident.dateTime) return null;

        const dateObj = new Date(incident.dateTime);
        const dateStr = dateObj.toLocaleDateString('en-GB');
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        const plainText = `On ${dateStr} Around ${timeStr}, An Incident of ${incident.incidentDetails || incident.incidentCategory} ${incident.location ? `at ${incident.location}` : ''} ${incident.psJurisdiction ? `(${incident.psJurisdiction})` : ''} ${incident.zoneJurisdiction ? `${incident.zoneJurisdiction} Zone` : ''}.`;

        const handleCopy = () => {
            navigator.clipboard.writeText(plainText);
            toast.success('Incident details copied!');
        };

        const mediaList = incident.mediaFiles || [];

        return (
            <div className="text-sm p-3 rounded-lg border bg-card/50 shadow-sm hover:shadow-md transition-all duration-200 group/item relative">
                <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-bold text-muted-foreground min-w-[20px] pt-0.5">{index}.</span>
                    <p className="leading-snug flex-1">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">On {dateStr}</span> <span className="text-muted-foreground">Around {timeStr}</span>,
                        An Incident of <span className="font-medium text-foreground">{incident.incidentDetails || incident.incidentCategory}</span>
                        {incident.location && ` at ${incident.location}`}
                        {incident.psJurisdiction && ` (${incident.psJurisdiction})`}
                        {incident.zoneJurisdiction && ` ${incident.zoneJurisdiction} Zone`}.
                    </p>
                    <button
                        onClick={handleCopy}
                        className="text-muted-foreground hover:text-blue-600 transition-colors p-1 opacity-0 group-hover/item:opacity-100"
                        title="Copy to clipboard"
                    >
                        <Copy className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Media Download Button */}
                {mediaList.length > 0 && (
                    <div className="mt-2 pl-7 border-t pt-2 border-border/50">
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                toast.info('Starting downloads...');

                                for (let idx = 0; idx < mediaList.length; idx++) {
                                    const file = mediaList[idx];
                                    const url = getMediaUrl(file);
                                    const ext = url.split('.').pop().split(/[?#]/)[0] || 'jpg';
                                    const filename = `incident-${index}-image-${idx + 1}.${ext}`;

                                    try {
                                        // Use backend proxy to avoid CORS issues with S3
                                        const response = await api.get('/uploads/proxy', {
                                            params: { url },
                                            responseType: 'blob'
                                        });
                                        saveAs(response.data, filename);
                                    } catch (error) {
                                        console.error('Proxy download failed, trying direct:', error);
                                        // Fallback to direct download attempt
                                        saveAs(url, filename);
                                    }

                                    // Add delay between downloads
                                    if (idx < mediaList.length - 1) {
                                        await new Promise(resolve => setTimeout(resolve, 800));
                                    }
                                }
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5 font-medium transition-colors bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-md w-fit"
                            title="Download all attached images"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Download Images ({mediaList.length})
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Card className={`bg-gradient-to-br from-card via-card to-blue-500/5 border-border/50 shadow-sm w-full flex flex-col min-h-0 ${className}`}>
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-blue-600" />
                    Dial-100 Calls
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                            <div className="flex items-center gap-2 truncate">
                                <Filter className="h-3 w-3" />
                                <SelectValue placeholder="Category" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "h-8 px-2 justify-start text-left font-normal text-xs",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-3 w-3" />
                                {date ? format(date, "dd-MM-yyyy") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(newDate) => {
                                    if (newDate) setDate(newDate);
                                }}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Link
                        to="/dial-100-incident-reporting"
                        className="text-[10px] text-blue-600 hover:text-blue-600/80 font-medium flex items-center gap-1"
                    >
                        Manage <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-2 flex-1 min-h-0">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredIncidents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm border-2 border-dashed rounded-md bg-muted/10">
                        <p>No incidents found</p>
                    </div>
                ) : (
                    /* Flexible height container */
                    <div
                        className="h-full min-h-0 overflow-y-auto pr-2 space-y-3 custom-scrollbar"
                        ref={scrollRef}
                        onMouseEnter={pauseOnHover}
                        onWheel={temporarilyPauseScroll}
                        onTouchStart={temporarilyPauseScroll}
                        onMouseLeave={resumeScrollNow}
                    >
                        <div ref={firstSequenceRef} className="space-y-3">
                            {baseIncidents.map(({ incident, incidentIndex, key }) => (
                                <div key={`${key}-loop-0`}>
                                    {formatIncidentText(incident, incidentIndex + 1)}
                                </div>
                            ))}
                        </div>
                        <div className="space-y-3">
                            {baseIncidents.map(({ incident, incidentIndex, key }) => (
                                <div key={`${key}-loop-1`}>
                                    {formatIncidentText(incident, incidentIndex + 1)}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 2px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </Card>
    );
};

export default Dial100FeedWidget;
